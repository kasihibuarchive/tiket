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
    const createMissing = body.createMissing === true

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
    // For seat codes that don't exist (orphans — usually because zone names
    // changed during regenerate), we have two options:
    //   - skip them (default) — orphan codes reported back to admin
    //   - create them (createMissing=true) — auto-create seat with the
    //     old seatCode, marked SOLD/INVITATION. Preserves buyer linkage.
    const toSold: string[] = []       // seat IDs to update
    const toInvitation: string[] = [] // seat IDs to update
    const toCreateSold: { seatCode: string; from: string }[] = []
    const toCreateInvitation: { seatCode: string; from: string }[] = []
    const alreadyCorrect: string[] = []
    const orphans: string[] = []      // codes in transactions but no matching seat

    // Re-fetch priceCategories to link new seats if we create them
    const priceCategories = await withDbRetry(() =>
      db.priceCategory.findMany({
        where: { eventId: id },
        select: { id: true, name: true },
      })
    )
    const pcIdByName = new Map<string, string>()
    for (const pc of priceCategories) pcIdByName.set(pc.name.toLowerCase(), pc.id)

    for (const item of plan) {
      const seat = seatByCode.get(item.seatCode)
      if (!seat) {
        // Orphan: seat doesn't exist (likely zone renamed during regenerate)
        if (createMissing) {
          if (item.status === 'SOLD') toCreateSold.push({ seatCode: item.seatCode, from: item.from })
          else toCreateInvitation.push({ seatCode: item.seatCode, from: item.from })
        } else {
          orphans.push(`${item.seatCode} (from ${item.from})`)
        }
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
      willCreateSold: toCreateSold.length,
      willCreateInvitation: toCreateInvitation.length,
      alreadyCorrect: alreadyCorrect.length,
      orphanCodes: orphans.length,
      parseErrors: parseErrors.length,
    }

    if (dryRun) {
      return NextResponse.json({
        event: { id: event.id, title: event.title },
        dryRun: true,
        createMissing,
        summary,
        orphanSamples: orphans.slice(0, 20),
        createSamples: [...toCreateSold, ...toCreateInvitation].slice(0, 10).map(c => c.seatCode),
        parseErrorSamples: parseErrors.slice(0, 10),
        message: `🔍 Dry run: akan mark ${toSold.length} SOLD + ${toInvitation.length} INVITATION${createMissing ? `, create ${toCreateSold.length + toCreateInvitation.length} kursi baru buat orphan` : `, skip ${orphans.length} orphan`}.`,
      })
    }

    // ─── 5. Execute updates in batches ──────────────────────────────
    let soldUpdated = 0
    let invitationUpdated = 0
    let soldCreated = 0
    let invitationCreated = 0
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

    // ─── 5b. Create missing seats for orphans (if createMissing=true) ──
    // These are seats referenced in transactions but not present in the Seat
    // table — typically because zone names changed during regenerate.
    // We create them with the OLD seatCode so the usher seat map can still
    // find buyer data when looking up that code.
    if (createMissing) {
      const toCreate = [...toCreateSold, ...toCreateInvitation]
      if (toCreate.length > 0) {
        // Dedupe by seatCode (a code might appear in multiple transactions)
        const seenCodes = new Set<string>()
        const uniqueCreate = toCreate.filter(c => {
          if (seenCodes.has(c.seatCode)) return false
          seenCodes.add(c.seatCode)
          return true
        })

        // Build create records — infer zoneName & row/col from seatCode
        // seatCode format: "ZONE-N" or "ZONE-N@dayId,dayId"
        // We split off the @dayId suffix (festival format) for the actual seat.
        const createData = uniqueCreate.map(c => {
          // Strip @dayId suffix for the physical seat
          const baseCode = c.seatCode.split('@')[0]
          const dashIdx = baseCode.lastIndexOf('-')
          const zoneName = dashIdx > 0 ? baseCode.substring(0, dashIdx) : baseCode
          const colNum = dashIdx > 0 ? (parseInt(baseCode.substring(dashIdx + 1)) || 0) : 0
          const matchedPcId = pcIdByName.get(zoneName.toLowerCase()) || null

          // Find the status from toCreateSold/Invitation arrays
          const isInvitation = toCreateInvitation.some(t => t.seatCode === c.seatCode)
          return {
            eventId: id,
            eventShowDateId: null,
            seatCode: c.seatCode,
            status: (isInvitation ? 'INVITATION' : 'SOLD') as 'INVITATION' | 'SOLD',
            row: zoneName,
            col: colNum,
            zoneName,
            priceCategoryId: matchedPcId,
          }
        })

        // Create in batches
        for (let i = 0; i < createData.length; i += BATCH) {
          const batch = createData.slice(i, i + BATCH)
          try {
            const r = await db.seat.createMany({
              data: batch,
              skipDuplicates: true,
            })
            soldCreated += batch.filter(b => b.status === 'SOLD').length
            invitationCreated += batch.filter(b => b.status === 'INVITATION').length
            void r
          } catch (err) {
            console.error('Error creating missing seats batch:', err)
          }
        }
      }
    }

    // ─── 6. Log activity ────────────────────────────────────────────
    const logParts: string[] = []
    if (soldUpdated > 0) logParts.push(`${soldUpdated} SOLD mark`)
    if (invitationUpdated > 0) logParts.push(`${invitationUpdated} INVITATION mark`)
    if (soldCreated > 0) logParts.push(`${soldCreated} SOLD create`)
    if (invitationCreated > 0) logParts.push(`${invitationCreated} INVITATION create`)
    await logActivity(
      request,
      'RESTORE_SEATS',
      `Restore status kursi untuk event "${event.title}": ${logParts.join(', ') || 'no-op'} dari ${paidTx.length} transaksi.`
    ).catch(() => {})

    return NextResponse.json({
      event: { id: event.id, title: event.title },
      dryRun: false,
      createMissing,
      summary: {
        ...summary,
        soldUpdated,
        invitationUpdated,
        soldCreated,
        invitationCreated,
      },
      orphanSamples: orphans.slice(0, 20),
      parseErrorSamples: parseErrors.slice(0, 10),
      message: `✅ ${soldUpdated + invitationUpdated + soldCreated + invitationCreated} kursi di-restore (mark: ${soldUpdated} SOLD + ${invitationUpdated} INVITATION${createMissing ? `, create: ${soldCreated} SOLD + ${invitationCreated} INVITATION` : ''}) dari ${paidTx.length} transaksi.`,
    })
  } catch (error) {
    console.error('Error restoring seats:', error)
    return NextResponse.json(
      { error: 'Gagal restore kursi', detail: String(error) },
      { status: 500 }
    )
  }
}
