import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity-log'

// POST — Lock a GA zone (mark all AVAILABLE seats as UNAVAILABLE so they can't be purchased)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { zoneName, showDateId } = body

    if (!zoneName) {
      return NextResponse.json({ error: 'Nama zona harus diisi' }, { status: 400 })
    }

    const event = await db.event.findUnique({ where: { id } })
    if (!event) {
      return NextResponse.json({ error: 'Event tidak ditemukan' }, { status: 404 })
    }

    // Determine target show dates
    const showDates = await db.eventShowDate.findMany({
      where: { eventId: id },
      orderBy: { date: 'asc' },
    })

    const targetShowDateIds = showDateId
      ? [showDateId]
      : showDates.length > 0
        ? showDates.map(sd => sd.id)
        : [null]

    let totalLocked = 0

    for (const sdId of targetShowDateIds) {
      const whereClause: any = {
        eventId: id,
        zoneName,
        status: 'AVAILABLE',
      }
      if (sdId) whereClause.eventShowDateId = sdId

      const result = await db.seat.updateMany({
        where: whereClause,
        data: {
          status: 'UNAVAILABLE',
          lockedUntil: null,
          lockedBy: null,
        },
      })
      totalLocked += result.count
    }

    if (totalLocked === 0) {
      return NextResponse.json({
        error: `Tidak ada kursi tersedia di zona "${zoneName}" untuk dikunci.`,
      }, { status: 400 })
    }

    const dayLabel = targetShowDateIds.length > 1 ? ` (${targetShowDateIds.length} hari)` : ''
    await logActivity(
      request,
      'UPDATE_SEATS',
      `Kunci zona "${zoneName}" (${totalLocked} kursi) — Event: "${event.title}"${dayLabel}`
    )

    return NextResponse.json({
      message: `Berhasil mengunci zona "${zoneName}": ${totalLocked} kursi ditutup dari penjualan${dayLabel}`,
      totalLocked,
      zoneName,
    })
  } catch (error) {
    console.error('Error locking zone:', error)
    return NextResponse.json({ error: 'Gagal mengunci zona' }, { status: 500 })
  }
}

// DELETE — Unlock a GA zone (revert UNAVAILABLE seats back to AVAILABLE)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const zoneName = searchParams.get('zoneName')
    const showDateId = searchParams.get('showDateId')

    if (!zoneName) {
      return NextResponse.json({ error: 'Nama zona harus diisi' }, { status: 400 })
    }

    const event = await db.event.findUnique({ where: { id } })
    if (!event) {
      return NextResponse.json({ error: 'Event tidak ditemukan' }, { status: 404 })
    }

    // Determine target show dates
    const showDates = await db.eventShowDate.findMany({
      where: { eventId: id },
      orderBy: { date: 'asc' },
    })

    const targetShowDateIds = showDateId
      ? [showDateId]
      : showDates.length > 0
        ? showDates.map(sd => sd.id)
        : [null]

    let totalUnlocked = 0

    for (const sdId of targetShowDateIds) {
      const whereClause: any = {
        eventId: id,
        zoneName,
        status: 'UNAVAILABLE',
      }
      if (sdId) whereClause.eventShowDateId = sdId

      const result = await db.seat.updateMany({
        where: whereClause,
        data: {
          status: 'AVAILABLE',
        },
      })
      totalUnlocked += result.count
    }

    if (totalUnlocked === 0) {
      return NextResponse.json({
        error: `Tidak ada kursi terkunci di zona "${zoneName}" untuk dibuka.`,
      }, { status: 400 })
    }

    const dayLabel = targetShowDateIds.length > 1 ? ` (${targetShowDateIds.length} hari)` : ''
    await logActivity(
      request,
      'UPDATE_SEATS',
      `Buka zona "${zoneName}" (${totalUnlocked} kursi) — Event: "${event.title}"${dayLabel}`
    )

    return NextResponse.json({
      message: `Berhasil membuka zona "${zoneName}": ${totalUnlocked} kursi tersedia kembali${dayLabel}`,
      totalUnlocked,
      zoneName,
    })
  } catch (error) {
    console.error('Error unlocking zone:', error)
    return NextResponse.json({ error: 'Gagal membuka zona' }, { status: 500 })
  }
}
