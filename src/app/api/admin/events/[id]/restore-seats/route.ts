import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'
import { logActivity } from '@/lib/activity-log'

/**
 * POST /api/admin/events/[id]/restore-seats
 *
 * Restore SOLD & INVITATION seat statuses from transaction history.
 *
 * Why this exists:
 *   The "Generate Seats" action (see /api/admin/events/[id]/generate-seats)
 *   calls `db.seat.deleteMany({ where: { eventId: id } })` before recreating
 *   seats. This wipes status info (SOLD, INVITATION) from the Seat table.
 *
 *   BUT transactions store seatCodes as JSON in Transaction.seatCodes.
 *   So we can walk the transaction history and re-mark the corresponding
 *   seats as SOLD / INVITATION based on the transaction type.
 *
 *   - Regular paid transactions  → seat.status = SOLD
 *   - Complimentary (COMP-*)     → seat.status = INVITATION
 *   - Pending/Failed/Expired     → leave as AVAILABLE (don't restore)
 *
 * Note:
 *   - "Reservasi Undangan" (manual seat reservations without a transaction)
 *     CANNOT be restored by this endpoint — there's no record of them after
 *     seats are deleted. Admins must re-reserve those manually.
 *   - This is a soft-fix: it doesn't touch transactions, only seats.
 *
 * Body: { dryRun?: boolean }
 *   If dryRun=true, returns a preview without modifying anything.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true

    const event = await withDbRetry(() =>
      db.event.findUnique({
        where: { id },
        select: { id: true, title: true },
      })
    )
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // ─── 1. Get all PAID transactions for this event ────────────────
    // (Complimentary tickets also have paymentStatus='PAID')
    const paidTx = await withDbRetry(() =>
      db.transaction.findMany({
        where: { eventId: id, paymentStatus: 'PAID' },
        select: {
          id: true,
          transactionId: true,
          seatCodes: true,
          showDateId: true,
        },
      })
    )

    // ─── 2. Parse seatCodes from each transaction ───────────────────
    type Plan = { seatCode: string; status: 'SOLD' | 'INVITATION'; from: string }
    const plan: Plan[] = []
    const parseErrors: string[] = []

    for (const tx of paidTx) {
      if (!tx.seatCodes) continue
      let codes: string[] = []
      try {
        const parsed = JSON.parse(tx.seatCodes)
        if (Array.isArray(parsed)) {
          codes = parsed.filter((c): c is string => typeof c === 'string' && c.length > 0)
        }
      } catch {
        parseErrors.push(`${tx.transactionId}: invalid JSON`)
        continue
      }
      if (codes.length === 0) continue

      const isComplimentary = tx.transactionId.startsWith('COMP-')
      const status: 'SOLD' | 'INVITATION' = isComplimentary ? 'INVITATION' : 'SOLD'

      for (const code of codes) {
        plan.push({ seatCode: code, status, from: tx.transactionId })
      }
    }

    // ─── 3. Get current seats to know what we'll touch ─────────────
    const allSeats = await withDbRetry(() =>
      db.seat.findMany({
        where: { eventId: id },
        select: { id: true, seatCode: true, status: true, zoneName: true },
      })
    )

    const seatByCode = new Map<string, typeof allSeats[number]>()
    for (const s of allSeats) seatByCode.set(s.seatCode, s)

    // ─── 4. Build update plan ───────────────────────────────────────
    // Only update seats that currently exist AND are AVAILABLE.
    // Skip if seat is already SOLD/INVITATION (no-op) or doesn't exist (orphan).
    const toSold: string[] = []       // seat IDs
    const toInvitation: string[] = [] // seat IDs
    const alreadyCorrect: string[] = []
    const orphans: string[] = []      // codes in transactions but no matching seat

    for (const item of plan) {
      const seat = seatByCode.get(item.seatCode)
      if (!seat) {
        orphans.push(`${item.seatCode} (from ${item.from})`)
        continue
      }
      if (seat.status === item.status) {
        alreadyCorrect.push(item.seatCode)
        continue
      }
      if (seat.status !== 'AVAILABLE') {
        // Seat is in some other state (LOCKED_TEMPORARY, UNAVAILABLE).
        // We won't overwrite that — log it as orphan so admin knows.
        orphans.push(`${item.seatCode} (current=${seat.status}, want=${item.status})`)
        continue
      }
      if (item.status === 'SOLD') toSold.push(seat.id)
      else toInvitation.push(seat.id)
    }

    const summary = {
      totalTransactions: paidTx.length,
      totalCodesInTransactions: plan.length,
      seatsInDb: allSeats.length,
      willMarkSold: toSold.length,
      willMarkInvitation: toInvitation.length,
      alreadyCorrect: alreadyCorrect.length,
      orphanCodes: orphans.length,
      parseErrors: parseErrors.length,
    }

    if (dryRun) {
      return NextResponse.json({
        event: { id: event.id, title: event.title },
        dryRun: true,
        summary,
        orphanSamples: orphans.slice(0, 20),
        parseErrorSamples: parseErrors.slice(0, 10),
        message: `🔍 Dry run: akan mark ${toSold.length} kursi SOLD + ${toInvitation.length} kursi INVITATION.`,
      })
    }

    // ─── 5. Execute updates in batches ──────────────────────────────
    let soldUpdated = 0
    let invitationUpdated = 0
    const BATCH = 500

    for (let i = 0; i < toSold.length; i += BATCH) {
      const batch = toSold.slice(i, i + BATCH)
      const r = await db.seat.updateMany({
        where: { id: { in: batch } },
        data: { status: 'SOLD', lockedUntil: null, lockedBy: null },
      })
      soldUpdated += r.count
    }

    for (let i = 0; i < toInvitation.length; i += BATCH) {
      const batch = toInvitation.slice(i, i + BATCH)
      const r = await db.seat.updateMany({
        where: { id: { in: batch } },
        data: { status: 'INVITATION', lockedUntil: null, lockedBy: null },
      })
      invitationUpdated += r.count
    }

    // ─── 6. Log activity ────────────────────────────────────────────
    await logActivity(
      request,
      'RESTORE_SEATS',
      `Restore status kursi untuk event "${event.title}": ${soldUpdated} SOLD, ${invitationUpdated} INVITATION dari ${paidTx.length} transaksi.`
    ).catch(() => {})

    return NextResponse.json({
      event: { id: event.id, title: event.title },
      dryRun: false,
      summary: {
        ...summary,
        soldUpdated,
        invitationUpdated,
      },
      orphanSamples: orphans.slice(0, 20),
      parseErrorSamples: parseErrors.slice(0, 10),
      message: `✅ ${soldUpdated + invitationUpdated} kursi di-restore (${soldUpdated} SOLD, ${invitationUpdated} INVITATION) dari ${paidTx.length} transaksi.`,
    })
  } catch (error) {
    console.error('Error restoring seats:', error)
    return NextResponse.json(
      { error: 'Gagal restore kursi', detail: String(error) },
      { status: 500 }
    )
  }
}
