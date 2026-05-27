import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'

// GET /api/events/[id]/reviews — List all reviews for an event
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const reviews = await withDbRetry(() =>
      db.review.findMany({
        where: { eventId: id },
        orderBy: { createdAt: 'desc' },
      })
    )

    // Also get aggregate stats
    const stats = await withDbRetry(() =>
      db.review.aggregate({
        where: { eventId: id },
        _avg: { rating: true },
        _count: { id: true },
      })
    )

    // Rating distribution
    const distribution = await withDbRetry(() =>
      db.review.groupBy({
        by: ['rating'],
        where: { eventId: id },
        _count: { rating: true },
      })
    )

    const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const d of distribution) {
      ratingDist[d.rating] = d._count.rating
    }

    return NextResponse.json({
      reviews,
      stats: {
        average: stats._avg.rating ? Math.round(stats._avg.rating * 10) / 10 : 0,
        total: stats._count.id,
        distribution: ratingDist,
      },
    })
  } catch (error) {
    console.error('Error fetching reviews:', error)
    return NextResponse.json(
      { error: 'Gagal memuat review.' },
      { status: 500 }
    )
  }
}

// POST /api/events/[id]/reviews — Submit a review (guest)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { authorName, rating, comment, _hp } = body

    // Honeypot check — if _hp is filled, it's a bot submission
    if (_hp) {
      // Silently accept but don't save (bots think it succeeded)
      return NextResponse.json({ review: { id: 'honeypot' } }, { status: 201 })
    }

    // Validation
    if (!authorName || typeof authorName !== 'string' || !authorName.trim()) {
      return NextResponse.json({ error: 'Nama wajib diisi' }, { status: 400 })
    }
    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating harus antara 1-5' }, { status: 400 })
    }
    if (!comment || typeof comment !== 'string' || !comment.trim()) {
      return NextResponse.json({ error: 'Komentar wajib diisi' }, { status: 400 })
    }
    if (comment.length > 1000) {
      return NextResponse.json({ error: 'Komentar maksimal 1000 karakter' }, { status: 400 })
    }

    // Check event exists and is completed
    const event = await db.event.findUnique({
      where: { id },
      select: { id: true, isCompleted: true, title: true },
    })

    if (!event) {
      return NextResponse.json({ error: 'Event tidak ditemukan' }, { status: 404 })
    }

    if (!event.isCompleted) {
      return NextResponse.json(
        { error: 'Review hanya bisa diberikan untuk pementasan yang sudah selesai.' },
        { status: 403 }
      )
    }

    // Rate limit: max 3 reviews per authorName per event (prevent spam)
    const existingCount = await db.review.count({
      where: {
        eventId: id,
        authorName: authorName.trim(),
      },
    })
    if (existingCount >= 3) {
      return NextResponse.json(
        { error: 'Anda sudah memberikan review untuk event ini.' },
        { status: 429 }
      )
    }

    const review = await db.review.create({
      data: {
        eventId: id,
        authorName: authorName.trim(),
        rating,
        comment: comment.trim(),
      },
    })

    return NextResponse.json({ review }, { status: 201 })
  } catch (error) {
    console.error('Error creating review:', error)
    return NextResponse.json(
      { error: 'Gagal mengirim review.' },
      { status: 500 }
    )
  }
}
