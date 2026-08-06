import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const published = searchParams.get('published')

    const where: Record<string, unknown> = {}
    if (category) where.category = category
    if (published !== null) where.isPublished = published === 'true'

    const eventsWithSummary = await withDbRetry(async () => {
      const events = await db.event.findMany({
        where,
        orderBy: { showDate: 'asc' },
      })

      if (events.length === 0) return []

      const eventIds = events.map((e) => e.id)

      // Run all 4 queries in parallel — each wrapped in try/catch so a
      // single failing query doesn't kill the whole endpoint.
      const safeQuery = async <T>(label: string, p: Promise<T>, fallback: T): Promise<T> => {
        try { return await p } catch (err) {
          console.error(`[events] Query "${label}" failed:`, err)
          return fallback
        }
      }

      const [allPriceCategories, allSeats, allShowDates, reviewStats] = await Promise.all([
        safeQuery('priceCategories', db.priceCategory.findMany({ where: { eventId: { in: eventIds } } }), []),
        safeQuery('seats', db.seat.groupBy({
          by: ['eventId', 'status'],
          where: { eventId: { in: eventIds } },
          _count: { status: true },
        }), []),
        safeQuery('showDates', db.eventShowDate.findMany({ where: { eventId: { in: eventIds } }, orderBy: { date: 'asc' } }), []),
        safeQuery('reviews', db.review.groupBy({
          by: ['eventId'],
          where: { eventId: { in: eventIds } },
          _avg: { rating: true },
          _count: { id: true },
        }), []),
      ])

      // Build a lookup map for review stats
      const reviewMap = new Map(reviewStats.map(r => [r.eventId, { average: r._avg.rating, total: r._count.id }]))

      return events.map((event) => {
        const eventPriceCats = allPriceCategories.filter((pc) => pc.eventId === event.id)
        const eventShowDates = allShowDates.filter((sd) => sd.eventId === event.id)
        const eventSeats = allSeats.filter((s) => s.eventId === event.id)
        const totalSeats = eventSeats.reduce((sum, s) => sum + s._count.status, 0)
        const availableSeats = eventSeats.find((s) => s.status === 'AVAILABLE')?._count.status ?? 0
        const soldSeats = eventSeats.find((s) => s.status === 'SOLD')?._count.status ?? 0

        const rvStats = reviewMap.get(event.id)

        return {
          id: event.id,
          title: event.title,
          category: event.category,
          showDate: event.showDate,
          openGate: event.openGate,
          location: event.location,
          posterUrl: event.posterUrl,
          synopsis: event.synopsis,
          isPublished: event.isPublished,
          isCompleted: event.isCompleted,
          seatType: event.seatType,
          hideSeatAvailability: event.hideSeatAvailability,
          hideSoldCount: event.hideSoldCount,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
          priceCategories: eventPriceCats,
          showDates: eventShowDates,
          seatSummary: { total: totalSeats, available: availableSeats, sold: soldSeats },
          reviewStats: rvStats
            ? { average: Math.round(rvStats.average! * 10) / 10, total: rvStats.total }
            : { average: 0, total: 0 },
        }
      })
    })

    return NextResponse.json({ events: eventsWithSummary })
  } catch (error) {
    console.error('Error fetching events:', error)
    return NextResponse.json(
      { error: 'Gagal memuat daftar event.' },
      { status: 500 }
    )
  }
}
