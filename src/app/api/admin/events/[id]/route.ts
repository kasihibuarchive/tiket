import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Separate queries — NO include (crashes Next.js 16)
    const event = await db.event.findUnique({ where: { id } })
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const priceCategories = await db.priceCategory.findMany({ where: { eventId: id } })
    const seats = await db.seat.findMany({ where: { eventId: id } })
    const transactions = await db.transaction.findMany({
      where: { eventId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // Attach priceCategory to each seat
    const seatsWithCat = seats.map((seat) => {
      const cat = priceCategories.find((pc) => pc.id === seat.priceCategoryId) || null
      return { ...seat, priceCategory: cat }
    })

    return NextResponse.json({ event: { ...event, priceCategories, seats: seatsWithCat, transactions } })
  } catch (error) {
    console.error('Error fetching admin event:', error)
    return NextResponse.json(
      { error: 'Failed to fetch event' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const event = await db.event.findUnique({ where: { id } })
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    await db.event.update({
      where: { id },
      data: {
        title: title ?? event.title,
        category: category ?? event.category,
        showDate: showDate ? new Date(showDate) : event.showDate,
        openGate: openGate ? new Date(openGate) : event.openGate,
        location: location ?? event.location,
        posterUrl: posterUrl !== undefined ? posterUrl : event.posterUrl,
        synopsis: synopsis ?? event.synopsis,
        isPublished: isPublished !== undefined ? isPublished : event.isPublished,
        adminFee: adminFee !== undefined ? adminFee : event.adminFee,
      },
    })

    // Update price categories if provided
    if (priceCategories && Array.isArray(priceCategories)) {
      await db.priceCategory.deleteMany({ where: { eventId: id } })
      await db.priceCategory.createMany({
        data: priceCategories.map(
          (pc: { name: string; price: number; colorCode: string }) => ({
            eventId: id,
            name: pc.name,
            price: pc.price,
            colorCode: pc.colorCode,
          })
        ),
      })
    }

    // Re-fetch separately — NO include
    const updatedEvent = await db.event.findUnique({ where: { id } })
    const updatedPriceCats = await db.priceCategory.findMany({ where: { eventId: id } })

    return NextResponse.json({ event: { ...updatedEvent, priceCategories: updatedPriceCats } })
  } catch (error) {
    console.error('Error updating event:', error)
    return NextResponse.json(
      { error: 'Failed to update event' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const event = await db.event.findUnique({ where: { id } })
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    await db.transaction.deleteMany({ where: { eventId: id } })
    await db.seat.deleteMany({ where: { eventId: id } })
    await db.priceCategory.deleteMany({ where: { eventId: id } })
    await db.event.delete({ where: { id } })

    return NextResponse.json({ message: 'Event deleted successfully' })
  } catch (error) {
    console.error('Error deleting event:', error)
    return NextResponse.json(
      { error: 'Failed to delete event' },
      { status: 500 }
    )
  }
}
