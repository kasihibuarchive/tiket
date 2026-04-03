import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Separate queries — NO include
    const events = await db.event.findMany({
      orderBy: { createdAt: 'desc' },
    })

    const eventIds = events.map((e) => e.id)
    const allPriceCategories = await db.priceCategory.findMany({ where: { eventId: { in: eventIds } } })
    const allSeats = await db.seat.findMany({ where: { eventId: { in: eventIds } }, select: { eventId: true, status: true } })

    const eventsWithSummary = events.map((event) => {
      const eventSeats = allSeats.filter((s) => s.eventId === event.id)
      const eventPriceCats = allPriceCategories.filter((pc) => pc.eventId === event.id)
      const totalSeats = eventSeats.length
      const availableSeats = eventSeats.filter((s) => s.status === 'AVAILABLE').length
      const soldSeats = eventSeats.filter((s) => s.status === 'SOLD').length

      return {
        ...event,
        priceCategories: eventPriceCats,
        seatSummary: {
          total: totalSeats,
          available: availableSeats,
          sold: soldSeats,
        },
      }
    })

    return NextResponse.json({ events: eventsWithSummary })
  } catch (error) {
    console.error('Error fetching admin events:', error)
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      title,
      category,
      showDate,
      openGate,
      location,
      posterUrl,
      synopsis,
      isPublished,
      adminFee,
      priceCategories,
    } = body

    if (!title || !showDate || !location || !synopsis) {
      return NextResponse.json(
        { error: 'title, showDate, location, and synopsis are required' },
        { status: 400 }
      )
    }

    // Create event first, then create price categories separately — NO include in create
    const event = await db.event.create({
      data: {
        title,
        category: category || 'Teater',
        showDate: new Date(showDate),
        openGate: openGate ? new Date(openGate) : null,
        location,
        posterUrl: posterUrl || null,
        synopsis,
        isPublished: isPublished || false,
        adminFee: adminFee || 0,
      },
    })

    if (priceCategories && Array.isArray(priceCategories)) {
      await db.priceCategory.createMany({
        data: priceCategories.map(
          (pc: { name: string; price: number; colorCode: string }) => ({
            eventId: event.id,
            name: pc.name,
            price: pc.price,
            colorCode: pc.colorCode,
          })
        ),
      })
    }

    const createdPriceCats = await db.priceCategory.findMany({ where: { eventId: event.id } })

    return NextResponse.json({ event: { ...event, priceCategories: createdPriceCats } }, { status: 201 })
  } catch (error) {
    console.error('Error creating event:', error)
    return NextResponse.json(
      { error: 'Failed to create event' },
      { status: 500 }
    )
  }
}
