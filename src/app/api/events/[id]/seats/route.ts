import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const event = await db.event.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Separate queries — NO include (crashes Next.js 16)
    const seats = await db.seat.findMany({
      where: { eventId: id },
      select: {
        id: true,
        seatCode: true,
        status: true,
        row: true,
        col: true,
        lockedUntil: true,
        priceCategoryId: true,
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
