import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'

// GET /api/usher/seats-info?eventId=xxx
// Returns a map of seatCode -> transaction info for all occupied seats
// Also supports: GET /api/usher/seats-info?eventId=xxx&seatCode=A-1 (single seat lookup)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')
    const targetSeatCode = searchParams.get('seatCode') // optional: single seat lookup

    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId is required' },
        { status: 400 }
      )
    }

    // Verify event exists
    const event = await withDbRetry(() => db.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true },
    }))

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const isTargetedLookup = !!targetSeatCode

    // ── STEP 1: Query all transactions for this event ──
    // Use NOT filter for null seatCodes to avoid Prisma syntax issues
    const whereClause: any = {
      eventId,
      NOT: { seatCodes: null },
    }

    if (!isTargetedLookup) {
      // Batch load: include all statuses
      whereClause.paymentStatus = { in: ['PAID', 'PENDING', 'EXPIRED', 'FAILED', 'CANCELLED'] }
    }
    // For targeted lookup: no payment status filter — search ALL statuses

    const transactions = await withDbRetry(() => db.transaction.findMany({
      where: whereClause,
      select: {
        transactionId: true,
        customerName: true,
        customerEmail: true,
        customerWa: true,
        seatCodes: true,
        paymentStatus: true,
        checkInTime: true,
        paidAt: true,
        totalAmount: true,
        emailStatus: true,
        emailError: true,
        lastEmailSentAt: true,
        id: true,
      },
    }))

    console.log(`[seats-info] Found ${transactions.length} transactions for event ${eventId} (targeted: ${isTargetedLookup})`)

    // Build seatCode -> transaction info map
    // If multiple transactions claim the same seat, prefer PAID > PENDING > others
    const statusPriority: Record<string, number> = {
      PAID: 0,
      PENDING: 1,
      EXPIRED: 2,
      FAILED: 3,
      CANCELLED: 4,
    }

    const seatInfoMap: Record<string, {
      owner: string
      email: string
      phone: string
      transactionId: string
      paymentStatus: string
      checkInTime: string | null
      paidAt: string | null
      totalAmount: number
      emailStatus: string | null
      emailError: string | null
      lastEmailSentAt: string | null
    }> = {}

    // Debug: collect raw seat codes found for troubleshooting
    const debugSeatCodes: string[] = []

    for (const txn of transactions) {
      let seatCodes: string[] = []

      // Parse seatCodes JSON string
      if (!txn.seatCodes) continue
      try {
        const parsed = JSON.parse(txn.seatCodes)
        if (Array.isArray(parsed)) {
          seatCodes = parsed.map((s: any) => String(s).trim()).filter(Boolean)
        } else if (typeof parsed === 'string') {
          seatCodes = parsed.split(',').map((s: string) => s.trim()).filter(Boolean)
        } else {
          seatCodes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
        }
      } catch {
        // Fallback: try comma-separated
        seatCodes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
      }

      for (const code of seatCodes) {
        debugSeatCodes.push(code)
        const existing = seatInfoMap[code]
        const existingPriority = existing ? (statusPriority[existing.paymentStatus] ?? 99) : 99
        const currentPriority = statusPriority[txn.paymentStatus] ?? 99

        // Only overwrite if current transaction has higher priority (lower number)
        if (!existing || currentPriority < existingPriority) {
          seatInfoMap[code] = {
            owner: txn.customerName,
            email: txn.customerEmail,
            phone: txn.customerWa,
            transactionId: txn.transactionId,
            paymentStatus: txn.paymentStatus,
            checkInTime: txn.checkInTime?.toISOString() || null,
            paidAt: txn.paidAt?.toISOString() || null,
            totalAmount: txn.totalAmount,
            emailStatus: txn.emailStatus || null,
            emailError: txn.emailError || null,
            lastEmailSentAt: txn.lastEmailSentAt?.toISOString() || null,
          }
        }
      }
    }

    // ── STEP 2: If targeted lookup and not found, try direct DB string search ──
    let targetResult = targetSeatCode ? (seatInfoMap[targetSeatCode] || null) : null
    let debugInfo: any = null

    if (targetSeatCode) {
      console.log(`[seats-info] Targeted lookup for "${targetSeatCode}": ${targetResult ? 'found in map' : 'not found in map'}`)

      if (debugSeatCodes.length > 0) {
        console.log(`[seats-info] Seat codes in map sample: [${debugSeatCodes.slice(0, 20).join(', ')}]`)
      }

      if (!targetResult) {
        // Fallback: search directly in database using string contains
        try {
          // Use raw query to avoid Prisma type issues with contains on nullable fields
          const fallbackTxns = await withDbRetry(() => db.transaction.findMany({
            where: {
              eventId,
              AND: [
                { seatCodes: { contains: targetSeatCode } },
                { NOT: { seatCodes: null } },
              ],
            },
            select: {
              transactionId: true,
              customerName: true,
              customerEmail: true,
              customerWa: true,
              seatCodes: true,
              paymentStatus: true,
              checkInTime: true,
              paidAt: true,
              totalAmount: true,
              emailStatus: true,
              emailError: true,
              lastEmailSentAt: true,
            },
          }))

          console.log(`[seats-info] Fallback DB search found ${fallbackTxns.length} transactions containing "${targetSeatCode}"`)

          for (const txn of fallbackTxns) {
            console.log(`[seats-info] Fallback txn ${txn.transactionId} (status: ${txn.paymentStatus}) seatCodes: ${txn.seatCodes?.substring(0, 100)}`)

            let codes: string[] = []
            try {
              const parsed = JSON.parse(txn.seatCodes || '[]')
              if (Array.isArray(parsed)) {
                codes = parsed.map((s: any) => String(s).trim()).filter(Boolean)
              } else {
                codes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
              }
            } catch {
              codes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
            }

            // Check exact match
            if (codes.includes(targetSeatCode)) {
              targetResult = {
                owner: txn.customerName,
                email: txn.customerEmail,
                phone: txn.customerWa,
                transactionId: txn.transactionId,
                paymentStatus: txn.paymentStatus,
                checkInTime: txn.checkInTime?.toISOString() || null,
                paidAt: txn.paidAt?.toISOString() || null,
                totalAmount: txn.totalAmount,
                emailStatus: txn.emailStatus || null,
                emailError: txn.emailError || null,
                lastEmailSentAt: txn.lastEmailSentAt?.toISOString() || null,
              }
              seatInfoMap[targetSeatCode] = targetResult
              console.log(`[seats-info] Fallback exact match for "${targetSeatCode}"`)
              break
            }

            // Check case-insensitive match
            const lowerTarget = targetSeatCode.toLowerCase()
            const matchCode = codes.find(c => c.toLowerCase() === lowerTarget)
            if (matchCode) {
              targetResult = {
                owner: txn.customerName,
                email: txn.customerEmail,
                phone: txn.customerWa,
                transactionId: txn.transactionId,
                paymentStatus: txn.paymentStatus,
                checkInTime: txn.checkInTime?.toISOString() || null,
                paidAt: txn.paidAt?.toISOString() || null,
                totalAmount: txn.totalAmount,
                emailStatus: txn.emailStatus || null,
                emailError: txn.emailError || null,
                lastEmailSentAt: txn.lastEmailSentAt?.toISOString() || null,
              }
              seatInfoMap[targetSeatCode] = targetResult
              seatInfoMap[matchCode] = targetResult
              console.log(`[seats-info] Fallback case-insensitive match: "${targetSeatCode}" ↔ "${matchCode}"`)
              break
            }
          }

          // Last resort: if fallback found transactions but no code match,
          // use the first one (seatCode is in the raw string)
          if (!targetResult && fallbackTxns.length > 0) {
            const txn = fallbackTxns[0]
            targetResult = {
              owner: txn.customerName,
              email: txn.customerEmail,
              phone: txn.customerWa,
              transactionId: txn.transactionId,
              paymentStatus: txn.paymentStatus,
              checkInTime: txn.checkInTime?.toISOString() || null,
              paidAt: txn.paidAt?.toISOString() || null,
              totalAmount: txn.totalAmount,
              emailStatus: txn.emailStatus || null,
              emailError: txn.emailError || null,
              lastEmailSentAt: txn.lastEmailSentAt?.toISOString() || null,
            }
            seatInfoMap[targetSeatCode] = targetResult
            console.log(`[seats-info] Fallback substring match for "${targetSeatCode}"`)
          }
        } catch (fallbackErr) {
          console.error('[seats-info] Fallback search error:', fallbackErr)
        }
      }

      debugInfo = {
        lookupSeatCode: targetSeatCode,
        totalTransactions: transactions.length,
        totalSeatCodesParsed: debugSeatCodes.length,
        foundInMap: !!seatInfoMap[targetSeatCode],
        seatCodesSample: debugSeatCodes.slice(0, 20),
      }
    }

    if (targetSeatCode) {
      return NextResponse.json({
        event: { id: event.id, title: event.title },
        seats: seatInfoMap,
        targetSeat: targetResult,
        totalSold: Object.keys(seatInfoMap).length,
        ...(debugInfo ? { _debug: debugInfo } : {}),
      })
    }

    return NextResponse.json({
      event: { id: event.id, title: event.title },
      seats: seatInfoMap,
      totalSold: Object.keys(seatInfoMap).length,
    })
  } catch (error) {
    console.error('[seats-info] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch seats info', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
