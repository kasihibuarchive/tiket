import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const showDateId = searchParams.get('showDateId') || undefined

    const data = await withDbRetry(async () => {
      // Cleanup expired locks ~1 in 30 requests (3%) to reduce DB load
      if (Math.random() < 0.03) {
        try {
          await db.seat.updateMany({
            where: { status: 'LOCKED_TEMPORARY', lockedUntil: { lt: new Date() } },
            data: { status: 'AVAILABLE', lockedUntil: null, lockedBy: null },
          })
        } catch { /* non-critical */ }
      }

      // Quick event existence check
      const event = await db.event.findUnique({
        where: { id },
        select: { id: true },
      })
      if (!event) return null

      // Build where clause
      const seatWhere: Record<string, unknown> = { eventId: id }
      if (showDateId) seatWhere.eventShowDateId = showDateId

      // Run in parallel — 2 queries instead of sequential
      const [seats, priceCategories] = await Promise.all([
        db.seat.findMany({
          where: seatWhere,
          select: {
            id: true,
            seatCode: true,
            status: true,
            row: true,
            col: true,
            lockedUntil: true,
            priceCategoryId: true,
            eventShowDateId: true,
          },
          orderBy: [{ row: 'asc' }, { col: 'asc' }],
        }),
        db.priceCategory.findMany({
          where: { eventId: id },
          select: { id: true, name: true, price: true, colorCode: true },
        }),
      ])

      // Manually attach priceCategory to each seat
      const priceMap = new Map(priceCategories.map((pc) => [pc.id, pc]))
      const seatMap = seats.map((seat) => ({
        id: seat.id,
        seatCode: seat.seatCode,
        status: seat.status,
        row: seat.row,
        col: seat.col,
        lockedUntil: seat.lockedUntil,
        priceCategory: priceMap.get(seat.priceCategoryId) || null,
        eventShowDateId: seat.eventShowDateId,
      }))

      return { seats: seatMap, priceCategories }
    })

    if (!data) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching seats:', error)
    return NextResponse.json(
      { error: 'Gagal memuat kursi. Coba refresh.' },
      { status: 500 }
    )
  }
}
