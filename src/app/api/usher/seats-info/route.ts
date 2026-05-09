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
    // Don't filter by seatCodes null here — we'll skip nulls during parsing
    // This avoids Prisma syntax issues with nullable string fields
    const whereClause: any = {
      eventId,
    }

    if (!isTargetedLookup) {
      // Batch load: include all relevant statuses
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

    const debugSeatCodes: string[] = []

    for (const txn of transactions) {
      // Skip transactions with no seatCodes
      if (!txn.seatCodes) continue

      let seatCodes: string[] = []
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
        seatCodes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
      }

      for (const code of seatCodes) {
        debugSeatCodes.push(code)
        const existing = seatInfoMap[code]
        const existingPriority = existing ? (statusPriority[existing.paymentStatus] ?? 99) : 99
        const currentPriority = statusPriority[txn.paymentStatus] ?? 99

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

    // ── STEP 2: Targeted lookup ──
    let targetResult = targetSeatCode ? (seatInfoMap[targetSeatCode] || null) : null

    if (targetSeatCode && !targetResult) {
      // Not found in parsed map. Log what we have for debugging.
      console.log(`[seats-info] Targeted lookup for "${targetSeatCode}": not found in parsed map`)
      console.log(`[seats-info] Parsed seat codes (${debugSeatCodes.length}): [${debugSeatCodes.slice(0, 30).join(', ')}]`)

      // Fallback: try raw SQL to find transactions where seatCodes contains the code
      // This catches ANY format difference
      try {
        // Use $queryRaw for maximum compatibility — bypasses Prisma filter syntax issues
        const fallbackResults: any[] = await db.$queryRaw`
          SELECT
            "transactionId", "customerName", "customerEmail", "customerWa",
            "seatCodes", "paymentStatus", "checkInTime", "paidAt",
            "totalAmount", "emailStatus", "emailError", "lastEmailSentAt"
          FROM "Transaction"
          WHERE "eventId" = ${eventId}
            AND "seatCodes" IS NOT NULL
            AND "seatCodes" LIKE ${'%' + targetSeatCode + '%'}
          LIMIT 5
        `

        console.log(`[seats-info] Raw SQL fallback found ${fallbackResults.length} transactions containing "${targetSeatCode}"`)

        for (const txn of fallbackResults) {
          console.log(`[seats-info] Raw fallback txn ${txn.transactionId} (status: ${txn.paymentStatus}) seatCodes: ${String(txn.seatCodes).substring(0, 100)}`)

          // Parse seatCodes from raw result
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

          // Exact match
          if (codes.includes(targetSeatCode)) {
            targetResult = {
              owner: txn.customerName,
              email: txn.customerEmail,
              phone: txn.customerWa,
              transactionId: txn.transactionId,
              paymentStatus: txn.paymentStatus,
              checkInTime: txn.checkInTime?.toISOString() || null,
              paidAt: txn.paidAt?.toISOString() || null,
              totalAmount: Number(txn.totalAmount),
              emailStatus: txn.emailStatus || null,
              emailError: txn.emailError || null,
              lastEmailSentAt: txn.lastEmailSentAt?.toISOString() || null,
            }
            seatInfoMap[targetSeatCode] = targetResult
            console.log(`[seats-info] Raw fallback exact match for "${targetSeatCode}"`)
            break
          }

          // Case-insensitive match
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
              totalAmount: Number(txn.totalAmount),
              emailStatus: txn.emailStatus || null,
              emailError: txn.emailError || null,
              lastEmailSentAt: txn.lastEmailSentAt?.toISOString() || null,
            }
            seatInfoMap[targetSeatCode] = targetResult
            seatInfoMap[matchCode] = targetResult
            console.log(`[seats-info] Raw fallback case-insensitive match: "${targetSeatCode}" ↔ "${matchCode}"`)
            break
          }
        }

        // Last resort: use first match even if parsing doesn't find exact code
        if (!targetResult && fallbackResults.length > 0) {
          const txn = fallbackResults[0]
          targetResult = {
            owner: txn.customerName,
            email: txn.customerEmail,
            phone: txn.customerWa,
            transactionId: txn.transactionId,
            paymentStatus: txn.paymentStatus,
            checkInTime: txn.checkInTime?.toISOString() || null,
            paidAt: txn.paidAt?.toISOString() || null,
            totalAmount: Number(txn.totalAmount),
            emailStatus: txn.emailStatus || null,
            emailError: txn.emailError || null,
            lastEmailSentAt: txn.lastEmailSentAt?.toISOString() || null,
          }
          seatInfoMap[targetSeatCode] = targetResult
          console.log(`[seats-info] Raw fallback substring match for "${targetSeatCode}"`)
        }
      } catch (fallbackErr) {
        console.error('[seats-info] Raw fallback error:', fallbackErr)
      }
    } else if (targetSeatCode) {
      console.log(`[seats-info] Targeted lookup for "${targetSeatCode}": found (status: ${targetResult?.paymentStatus})`)
    }

    // Build response
    const response: any = {
      event: { id: event.id, title: event.title },
      seats: seatInfoMap,
      totalSold: Object.keys(seatInfoMap).length,
    }

    if (targetSeatCode) {
      response.targetSeat = targetResult
      response._debug = {
        lookupSeatCode: targetSeatCode,
        totalTransactions: transactions.length,
        totalSeatCodesParsed: debugSeatCodes.length,
        foundInMap: !!seatInfoMap[targetSeatCode],
        seatCodesSample: debugSeatCodes.slice(0, 20),
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[seats-info] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch seats info', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
