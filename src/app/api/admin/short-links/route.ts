import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity-log'

// GET /api/admin/short-links?eventId=xxx — List short links for an event
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')

    const shortLinks = await db.shortLink.findMany({
      where: eventId ? { eventId } : undefined,
      include: {
        event: {
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ shortLinks })
  } catch (error) {
    console.error('Error fetching short links:', error)
    return NextResponse.json(
      { error: 'Failed to fetch short links' },
      { status: 500 }
    )
  }
}

// POST /api/admin/short-links — Create a new short link
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { slug, eventId, createdBy } = body

    if (!slug || !eventId) {
      return NextResponse.json(
        { error: 'slug dan eventId wajib diisi' },
        { status: 400 }
      )
    }

    // Validate slug: only alphanumeric, hyphens, underscores, 2-30 chars
    const slugRegex = /^[a-zA-Z0-9_-]{2,30}$/
    if (!slugRegex.test(slug)) {
      return NextResponse.json(
        { error: 'Slug hanya boleh huruf, angka, strip (-), underscore (_), 2-30 karakter' },
        { status: 400 }
      )
    }

    // Check for reserved slugs
    const reservedSlugs = [
      'admin', 'api', 'events', 'login', 'logout', 'register',
      'favicon', 'icon', 'robots', 'sitemap', '_next', 'checkout',
      'health', 'verify', 'success', 'pending',
    ]
    if (reservedSlugs.includes(slug.toLowerCase())) {
      return NextResponse.json(
        { error: `Slug "${slug}" tidak bisa digunakan (reserved)` },
        { status: 400 }
      )
    }

    // Check if slug already exists
    const existing = await db.shortLink.findUnique({ where: { slug } })
    if (existing) {
      return NextResponse.json(
        { error: `Slug "${slug}" sudah digunakan` },
        { status: 409 }
      )
    }

    // Verify event exists
    const event = await db.event.findUnique({ where: { id: eventId }, select: { title: true } })
    if (!event) {
      return NextResponse.json(
        { error: 'Event tidak ditemukan' },
        { status: 404 }
      )
    }

    const shortLink = await db.shortLink.create({
      data: {
        slug: slug.toLowerCase(),
        eventId,
        createdBy: createdBy || null,
      },
    })

    await logActivity(request, 'CREATE_SHORT_LINK', `Membuat short link "/${slug}" → event "${event.title}"`)

    return NextResponse.json({ shortLink }, { status: 201 })
  } catch (error) {
    console.error('Error creating short link:', error)
    return NextResponse.json(
      { error: 'Failed to create short link' },
      { status: 500 }
    )
  }
}
