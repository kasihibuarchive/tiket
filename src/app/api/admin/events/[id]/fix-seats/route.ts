import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'

/**
 * POST /api/admin/events/[id]/fix-seats
 *
 * Diagnose & fix: duplicate seats from an existing show date to days
 * that have 0 seats. Safe — never deletes existing seats.
 *
 * Use case: event was created with 1 show date (legacy bug), seats were
 * generated only for day 1. Admin then added days 2-4 via edit event page.
 * Days 2-4 exist in EventShowDate but have NO seats → packages show "Habis".
 *
 * This endpoint:
 *   1. Lists all show dates + seat counts
 *   2. Finds a source day (prefer day with 0 sold seats)
 *   3. Duplicates seats to all days with 0 seats
 *   4. New seats get status=AVAILABLE (fresh inventory)
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

    const showDates = await withDbRetry(() =>
      db.eventShowDate.findMany({
        where: { eventId: id },
        orderBy: { date: 'asc' },
      })
    )

    if (showDates.length === 0) {
      return NextResponse.json({
        error: 'Event tidak punya show date. Tambah hari dulu di edit event page.',
      }, { status: 400 })
    }

    // Count seats per day
    const diagnosis = []
    for (let i = 0; i < showDates.length; i++) {
      const sd = showDates[i]
      const seats = await withDbRetry(() =>
        db.seat.findMany({
          where: { eventShowDateId: sd.id },
          select: { status: true },
        })
      )
      const available = seats.filter(s => s.status === 'AVAILABLE').length
      const sold = seats.filter(s => s.status === 'SOLD').length
      const locked = seats.filter(s => s.status === 'LOCKED_TEMPORARY').length
      diagnosis.push({
        dayIndex: i + 1,
        showDateId: sd.id,
        date: sd.date.toISOString(),
        label: sd.label,
        totalSeats: seats.length,
        available,
        sold,
        locked,
        hasSeats: seats.length > 0,
      })
    }

    const daysWithSeats = diagnosis.filter(d => d.hasSeats)
    const daysWithoutSeats = diagnosis.filter(d => !d.hasSeats)

    // If all days have seats, nothing to fix
    if (daysWithoutSeats.length === 0) {
      return NextResponse.json({
        event: { id: event.id, title: event.title },
        diagnosis,
        needsFix: false,
        message: '✅ Semua hari sudah punya kursi. Tidak perlu fix.',
      })
    }

    // If no day has seats at all, can't duplicate
    if (daysWithSeats.length === 0) {
      return NextResponse.json({
        event: { id: event.id, title: event.title },
        diagnosis,
        needsFix: true,
        canFix: false,
        message: '❌ Semua hari kosong. Generate kursi dulu dari admin seat editor.',
      })
    }

    // Find source day — prefer a day with 0 sold seats
    const cleanSource = daysWithSeats.find(d => d.sold === 0) || daysWithSeats[0]

    const result = {
      event: { id: event.id, title: event.title },
      diagnosis,
      needsFix: true,
      canFix: true,
      source: {
        dayIndex: cleanSource.dayIndex,
        showDateId: cleanSource.showDateId,
        seatCount: cleanSource.totalSeats,
        sold: cleanSource.sold,
      },
      targets: daysWithoutSeats.map(d => ({
        dayIndex: d.dayIndex,
        showDateId: d.showDateId,
        label: d.label,
      })),
    }

    if (dryRun) {
      return NextResponse.json({
        ...result,
        message: `🔍 Dry run: akan duplikat ${cleanSource.totalSeats} kursi dari Hari ${cleanSource.dayIndex} ke ${daysWithoutSeats.length} hari.`,
      })
    }

    // ─── EXECUTE FIX ───────────────────────────────────────────────
    const sourceSeats = await withDbRetry(() =>
      db.seat.findMany({
        where: { eventShowDateId: cleanSource.showDateId },
        select: {
          seatCode: true,
          status: true,
          row: true,
          col: true,
          zoneName: true,
          priceCategoryId: true,
        },
      })
    )

    const fixed = []
    let totalCreated = 0

    for (const target of daysWithoutSeats) {
      const existing = await db.seat.count({ where: { eventShowDateId: target.showDateId } })
      if (existing > 0) {
        fixed.push({
          dayIndex: target.dayIndex,
          label: target.label,
          created: 0,
          skipped: true,
          reason: 'Sudah ada kursi',
        })
        continue
      }

      const createResult = await db.seat.createMany({
        data: sourceSeats.map(s => ({
          eventId: id,
          eventShowDateId: target.showDateId,
          seatCode: s.seatCode,
          status: 'AVAILABLE' as const,
          row: s.row,
          col: s.col,
          zoneName: s.zoneName,
          priceCategoryId: s.priceCategoryId,
        })),
      })

      fixed.push({
        dayIndex: target.dayIndex,
        showDateId: target.showDateId,
        label: target.label,
        created: createResult.count,
      })
      totalCreated += createResult.count
    }

    return NextResponse.json({
      ...result,
      message: `🎉 Berhasil! ${totalCreated} kursi baru dibuat untuk ${daysWithoutSeats.length} hari. Status: AVAILABLE (fresh).`,
      fixed,
      totalCreated,
    })
  } catch (error) {
    console.error('Error fixing seats:', error)
    return NextResponse.json(
      { error: 'Gagal fix seats', detail: String(error) },
      { status: 500 }
    )
  }
}
