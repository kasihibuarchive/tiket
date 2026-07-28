import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'

/**
 * POST /api/admin/events/[id]/fix-seats
 *
 * Consolidate duplicated per-day seats into a single pool.
 *
 * NEW MODEL (current):
 *   - Multi-day is just metadata on PriceCategory.applicableDayIds
 *   - Seats have eventShowDateId = null (single pool, not duplicated per day)
 *   - 1 tiket = 1 seat in its package zone, regardless of how many days it covers
 *
 * OLD MODEL (legacy):
 *   - Seats were duplicated per show date (4 days × 100 seats = 400 seats)
 *   - Each seat had eventShowDateId set
 *   - Caused over-counting and confused availability
 *
 * This endpoint migrates old-model data to new-model:
 *   1. For each (eventId, seatCode, zoneName) group with multiple records:
 *      - Keep ONE record (prefer AVAILABLE > LOCKED > SOLD)
 *      - Delete the rest
 *   2. Clear eventShowDateId on all remaining seats
 *
 * Body: { dryRun?: boolean }
 * Returns: { diagnosis, fixed }
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
        select: {
          id: true,
          title: true,
          eventMode: true,
          seatType: true,
          isPublished: true,
        },
      })
    )

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // ─── DIAGNOSIS ────────────────────────────────────────────────
    const allSeats = await withDbRetry(() =>
      db.seat.findMany({
        where: { eventId: id },
        select: {
          id: true,
          seatCode: true,
          zoneName: true,
          status: true,
          eventShowDateId: true,
          priceCategoryId: true,
        },
      })
    )

    const totalSeats = allSeats.length
    const seatsWithDateId = allSeats.filter(s => s.eventShowDateId !== null).length
    const seatsWithoutDateId = allSeats.filter(s => s.eventShowDateId === null).length

    // Group by (seatCode, zoneName) to detect duplicates
    const groups = new Map<string, typeof allSeats>()
    for (const s of allSeats) {
      const key = `${s.seatCode}||${s.zoneName || ''}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(s)
    }
    const duplicateGroups = [...groups.values()].filter(g => g.length > 1)
    const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.length - 1, 0)

    const diagnosis = {
      totalSeats,
      seatsWithDateId,
      seatsWithoutDateId,
      duplicateGroups: duplicateGroups.length,
      totalDuplicatesToDelete: totalDuplicates,
      needsConsolidation: seatsWithDateId > 0 || totalDuplicates > 0,
    }

    if (!diagnosis.needsConsolidation) {
      return NextResponse.json({
        event: { id: event.id, title: event.title },
        diagnosis,
        needsFix: false,
        message: '✅ Kursi sudah dalam model single-pool. Tidak perlu konsolidasi.',
      })
    }

    if (dryRun) {
      return NextResponse.json({
        event: { id: event.id, title: event.title },
        diagnosis,
        needsFix: true,
        canFix: true,
        message: `🔍 Dry run: akan hapus ${totalDuplicates} kursi duplikat & clear eventShowDateId pada ${seatsWithDateId} kursi.`,
      })
    }

    // ─── EXECUTE CONSOLIDATION ────────────────────────────────────
    // Status priority: AVAILABLE > LOCKED_TEMPORARY > SOLD > others
    // (keep the most "available" record so inventory is preserved)
    const statusPriority: Record<string, number> = {
      AVAILABLE: 1,
      LOCKED_TEMPORARY: 2,
      SOLD: 3,
    }
    const getStatusScore = (s: string) => statusPriority[s] ?? 99

    let deletedCount = 0
    const idsToDelete: string[] = []

    for (const group of duplicateGroups) {
      // Sort by status priority — keep the first one (best status)
      const sorted = [...group].sort((a, b) => getStatusScore(a.status) - getStatusScore(b.status))
      const keep = sorted[0]
      const remove = sorted.slice(1)
      idsToDelete.push(...remove.map(s => s.id))
    }

    if (idsToDelete.length > 0) {
      // Delete in batches to avoid SQLite/Postgres parameter limits
      const BATCH = 500
      for (let i = 0; i < idsToDelete.length; i += BATCH) {
        const batch = idsToDelete.slice(i, i + BATCH)
        const r = await db.seat.deleteMany({ where: { id: { in: batch } } })
        deletedCount += r.count
      }
    }

    // Clear eventShowDateId on ALL remaining seats for this event
    const cleared = await db.seat.updateMany({
      where: { eventId: id, eventShowDateId: { not: null } },
      data: { eventShowDateId: null },
    })

    return NextResponse.json({
      event: { id: event.id, title: event.title },
      diagnosis,
      needsFix: true,
      canFix: true,
      fixed: {
        deletedDuplicates: deletedCount,
        clearedDateId: cleared.count,
        remainingSeats: totalSeats - deletedCount,
      },
      message: `🎉 Berhasil! ${deletedCount} kursi duplikat dihapus, ${cleared.count} kursi di-clear eventShowDateId-nya. Sekarang ${totalSeats - deletedCount} kursi single-pool.`,
    })
  } catch (error) {
    console.error('Error fixing seats:', error)
    return NextResponse.json(
      { error: 'Gagal fix seats', detail: String(error) },
      { status: 500 }
    )
  }
}
