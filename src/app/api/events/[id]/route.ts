import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if request comes from admin/usher (they can access unpublished events)
    const isAdmin = !!(request.headers.get('x-admin-id') || request.nextUrl.searchParams.get('admin'))

    const data = await withDbRetry(async () => {
      // Single query to get event — use select to avoid unnecessary fields
      const event = await db.event.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          category: true,
          showDate: true,
          openGate: true,
          location: true,
          posterUrl: true,
          teaserVideoUrl: true,
          synopsis: true,
          isPublished: true,
          seatMapId: true,
          seatType: true,
          layoutImage: true,
          gaZoneConfig: true,
          adminFee: true,
          castData: true,
          reviewsData: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      if (!event) return null

      // Block unpublished events for non-admin guests
      if (!event.isPublished && !isAdmin) {
        return { unpublished: true, title: event.title }
      }

      // Run price categories and show dates in parallel (only 2 queries)
      const [priceCategories, showDates, seatStats] = await Promise.all([
        db.priceCategory.findMany({
          where: { eventId: id },
        }),
        db.eventShowDate.findMany({
          where: { eventId: id },
          orderBy: { date: 'asc' },
        }),
        // Aggregate query instead of fetching all seats
        db.seat.groupBy({
          by: ['status'],
          where: { eventId: id },
          _count: { status: true },
        }),
      ])

      const totalSeats = seatStats.reduce((sum, s) => sum + s._count.status, 0)
      const availableSeats = seatStats.find((s) => s.status === 'AVAILABLE')?._count.status ?? 0
      const soldSeats = seatStats.find((s) => s.status === 'SOLD')?._count.status ?? 0

      // Fetch seat map layout if event has one
      let seatMapLayout: unknown = null
      if (event.seatMapId) {
        const seatMap = await db.seatMap.findUnique({
          where: { id: event.seatMapId },
          select: { layoutData: true },
        })
        if (seatMap) seatMapLayout = seatMap.layoutData
      }

      return {
        ...event,
        priceCategories,
        showDates,
        seatSummary: { total: totalSeats, available: availableSeats, sold: soldSeats },
        seatMapLayout,
      }
    })

    if (!data) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Return special response for unpublished events (guest access)
    if ('unpublished' in data && data.unpublished) {
      return NextResponse.json(
        { error: 'Penjualan tiket untuk event ini sudah ditutup.', isUnpublished: true, title: data.title },
        { status: 403 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching event:', error)
    return NextResponse.json(
      { error: 'Gagal memuat event. Coba refresh halaman.' },
      { status: 500 }
    )
  }
}
