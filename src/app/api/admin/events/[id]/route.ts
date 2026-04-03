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
    const showDates = await db.eventShowDate.findMany({
      where: { eventId: id },
      orderBy: { date: 'asc' },
    })

    // Attach priceCategory to each seat
    const seatsWithCat = seats.map((seat) => {
      const cat = priceCategories.find((pc) => pc.id === seat.priceCategoryId) || null
      return { ...seat, priceCategory: cat }
    })

    return NextResponse.json({
      event: { ...event, priceCategories, seats: seatsWithCat, transactions, showDates },
    })
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
      showDates,
      teaserVideoUrl,
    } = body

    const event = await db.event.findUnique({ where: { id } })
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Determine effective showDate (earliest from showDates, or provided showDate)
    let effectiveShowDate = showDate ? new Date(showDate) : event.showDate
    let effectiveOpenGate = openGate ? new Date(openGate) : event.openGate

    if (showDates && Array.isArray(showDates) && showDates.length > 0) {
      const sorted = [...showDates].sort(
        (a: { date: string }, b: { date: string }) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      effectiveShowDate = new Date(sorted[0].date)
      if (sorted[0].openGate) {
        effectiveOpenGate = new Date(sorted[0].openGate)
      }
    }

    await db.event.update({
      where: { id },
      data: {
        title: title ?? event.title,
        category: category ?? event.category,
        showDate: effectiveShowDate,
        openGate: effectiveOpenGate,
        location: location ?? event.location,
        posterUrl: posterUrl !== undefined ? posterUrl : event.posterUrl,
        teaserVideoUrl: teaserVideoUrl !== undefined ? teaserVideoUrl : event.teaserVideoUrl,
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

    // Update show dates if provided — delete all old, create new
    if (showDates && Array.isArray(showDates)) {
      await db.eventShowDate.deleteMany({ where: { eventId: id } })
      if (showDates.length > 0) {
        await db.eventShowDate.createMany({
          data: showDates.map((sd: { date: string; openGate?: string; label?: string }) => ({
            eventId: id,
            date: new Date(sd.date),
            openGate: sd.openGate ? new Date(sd.openGate) : null,
            label: sd.label || null,
          })),
        })
      }
    }

    // Re-fetch separately — NO include
    const updatedEvent = await db.event.findUnique({ where: { id } })
    const updatedPriceCats = await db.priceCategory.findMany({ where: { eventId: id } })
    const updatedShowDates = await db.eventShowDate.findMany({
      where: { eventId: id },
      orderBy: { date: 'asc' },
    })

    return NextResponse.json({
      event: { ...updatedEvent, priceCategories: updatedPriceCats, showDates: updatedShowDates },
    })
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
    await db.eventShowDate.deleteMany({ where: { eventId: id } })
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
