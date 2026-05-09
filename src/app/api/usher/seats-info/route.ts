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
    // A seat can be marked SOLD but its transaction might be in ANY status:
    //   - PAID: normal flow, payment confirmed
    //   - PENDING: webhook failed to update (e.g. Tripay signature bug)
    //   - EXPIRED: transaction expired but seat was already manually marked SOLD
    //   - FAILED: payment failed but seat was manually reassigned
    //   - CANCELLED: cancelled but seat status wasn't reverted
    //
    // For the batch load (no targetSeatCode), we still prioritize PAID/PENDING
    // to keep the response fast. But we ALSO include other statuses since the
    // usher needs to identify who owns the seat.
    //
    // For the targeted lookup (targetSeatCode provided), we search ALL statuses
    // to ensure we find the owner no matter what.

    const isTargetedLookup = !!targetSeatCode

    // Build the where clause
    const whereClause: any = {
      eventId,
      seatCodes: { not: null },
    }

    if (!isTargetedLookup) {
      // Batch load: include all statuses to ensure we find all seat owners
      // Previously only PAID/PENDING which missed EXPIRED/CANCELLED/FAILED owners
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

    for (const txn of transactions) {
      let seatCodes: string[] = []

      // Parse seatCodes JSON string
      if (!txn.seatCodes) continue
      try {
        const parsed = JSON.parse(txn.seatCodes)
        if (Array.isArray(parsed)) {
          seatCodes = parsed
        } else {
          seatCodes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
        }
      } catch {
        // Fallback: try comma-separated
        seatCodes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
      }

      for (const code of seatCodes) {
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

    // If a specific seatCode was requested, return just that entry (or null)
    if (targetSeatCode) {
      const targetResult = seatInfoMap[targetSeatCode] || null
      console.log(`[seats-info] Targeted lookup for "${targetSeatCode}": ${targetResult ? 'found' : 'not found'}`)

      return NextResponse.json({
        event: { id: event.id, title: event.title },
        seats: seatInfoMap,
        targetSeat: targetResult,
        totalSold: Object.keys(seatInfoMap).length,
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
