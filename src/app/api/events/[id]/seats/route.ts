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

      // Quick event existence + publish check
      const event = await db.event.findUnique({
        where: { id },
        select: { id: true, isPublished: true },
      })
      if (!event) return null

      // Block unpublished events for non-admin guests
      const isAdmin = !!(request.headers.get('x-admin-id') || request.nextUrl.searchParams.get('admin'))
      if (!event.isPublished && !isAdmin) {
        return { unpublished: true }
      }

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
            zoneName: true,
            lockedUntil: true,
            priceCategoryId: true,
            eventShowDateId: true,
          },
          orderBy: [{ row: 'asc' }, { col: 'asc' }],
        }),
        db.priceCategory.findMany({
          where: { eventId: id },
          select: {
            id: true, name: true, price: true, colorCode: true,
            applicableDayIds: true, packageType: true,
            // Sales lock fields — frontend needs these to render locked state
            salesLocked: true,
            salesLockReason: true,
          },
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
        zoneName: seat.zoneName,
        lockedUntil: seat.lockedUntil,
        priceCategory: seat.priceCategoryId ? (priceMap.get(seat.priceCategoryId) || null) : null,
        eventShowDateId: seat.eventShowDateId,
      }))

      return { seats: seatMap, priceCategories: priceCategories.map(pc => ({
        ...pc,
        // Parse applicableDayIds from JSON string to array for frontend
        applicableDayIds: pc.applicableDayIds
          ? (() => { try { return JSON.parse(pc.applicableDayIds) as string[] } catch { return null } })()
          : null,
      })) }
    })

    if (!data) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if ('unpublished' in data && data.unpublished) {
      return NextResponse.json(
        { error: 'Penjualan tiket untuk event ini sudah ditutup.', isUnpublished: true },
        { status: 403 }
      )
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
