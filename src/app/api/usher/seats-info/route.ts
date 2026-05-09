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

    // ── Strategy ──
    // For the usher panel, we need to find the owner of SOLD/INVITATION seats.
    // A seat can be marked SOLD but its transaction might be in ANY status.
    // We search ALL statuses to ensure we find the owner.

    const isTargetedLookup = !!targetSeatCode

    // ── STEP 1: Batch query — build seatInfoMap from all transactions ──
    const whereClause: any = {
      eventId,
      seatCodes: { not: null },
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
        // or if there's no existing entry
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

    // ── STEP 2: If targeted lookup and not found in map, try direct DB string search ──
    // This handles edge cases where seatCodes is stored in unexpected format
    // (e.g., the seat code might be embedded differently in the JSON string)
    let targetResult = targetSeatCode ? (seatInfoMap[targetSeatCode] || null) : null
    let debugInfo: any = null

    if (targetSeatCode) {
      console.log(`[seats-info] Targeted lookup for "${targetSeatCode}": ${targetResult ? 'found in map' : 'not found in map'}`)
      console.log(`[seats-info] All seat codes found: [${debugSeatCodes.slice(0, 30).join(', ')}${debugSeatCodes.length > 30 ? '...' : ''}]`)

      if (!targetResult) {
        // Fallback: search directly in database using string contains
        // This catches cases where the seatCode format differs from what we expect
        try {
          const fallbackTxns = await withDbRetry(() => db.transaction.findMany({
            where: {
              eventId,
              seatCodes: { contains: targetSeatCode },
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
            // Log the raw seatCodes for debugging
            console.log(`[seats-info] Fallback txn ${txn.transactionId} (status: ${txn.paymentStatus}) seatCodes raw: ${txn.seatCodes}`)

            // Try to parse and find the matching code
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

            // Check exact match first
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
              // Also add to map
              seatInfoMap[targetSeatCode] = targetResult
              console.log(`[seats-info] Fallback exact match for "${targetSeatCode}" in txn ${txn.transactionId}`)
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
              // Add to map under BOTH the original code and the matched code
              seatInfoMap[targetSeatCode] = targetResult
              seatInfoMap[matchCode] = targetResult
              console.log(`[seats-info] Fallback case-insensitive match: "${targetSeatCode}" ↔ "${matchCode}" in txn ${txn.transactionId}`)
              break
            }
          }

          // If still not found via parsing but fallback found transactions,
          // the seatCode might be in a format we can't parse. Try substring matching.
          if (!targetResult && fallbackTxns.length > 0) {
            const txn = fallbackTxns[0]
            console.log(`[seats-info] Fallback substring match: using first transaction containing "${targetSeatCode}"`)
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
          }
        } catch (fallbackErr) {
          console.error('[seats-info] Fallback search error:', fallbackErr)
        }
      }

      // Build debug info for frontend troubleshooting
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
    console.error('Error fetching usher seats info:', error)
    return NextResponse.json(
      { error: 'Failed to fetch seats info' },
      { status: 500 }
    )
  }
}
