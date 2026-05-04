import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const showDateId = searchParams.get('showDateId') || undefined

    // Only cleanup expired locks ~1 in 30 requests to reduce DB load
    const shouldCleanup = Math.random() < 0.03
    if (shouldCleanup) {
      try {
        await db.seat.updateMany({
          where: { status: 'LOCKED_TEMPORARY', lockedUntil: { lt: new Date() } },
          data: { status: 'AVAILABLE', lockedUntil: null, lockedBy: null },
        })
      } catch { /* non-critical */ }
    }

    const event = await db.event.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Separate queries — NO include (crashes Next.js 16)
    // Build where clause — filter by showDateId if provided
    // If no showDateId, return ALL seats for the event (used by admin/usher views)
    const seatWhere: any = { eventId: id }
    if (showDateId) {
      seatWhere.eventShowDateId = showDateId
    }

    const seats = await db.seat.findMany({
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
    })

    const priceCategories = await db.priceCategory.findMany({
      where: { eventId: id },
      select: {
        id: true,
        name: true,
        price: true,
        colorCode: true,
      },
    })

    // Manually attach priceCategory to each seat
    const seatMap = seats.map((seat) => {
      const cat = priceCategories.find((pc) => pc.id === seat.priceCategoryId) || null
      return {
        id: seat.id,
        seatCode: seat.seatCode,
        status: seat.status,
        row: seat.row,
        col: seat.col,
        lockedUntil: seat.lockedUntil,
        priceCategory: cat,
        eventShowDateId: seat.eventShowDateId,
      }
    })

    return NextResponse.json({ seats: seatMap, priceCategories })
  } catch (error) {
    console.error('Error fetching seats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch seats' },
      { status: 500 }
    )
  }
}
