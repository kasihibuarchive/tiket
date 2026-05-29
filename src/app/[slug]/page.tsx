import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { notFound, redirect } from 'next/navigation'

type Props = {
  params: Promise<{ slug: string }>
}

export default async function ShortLinkPage({ params }: Props) {
  const { slug } = await params

  const shortLink = await db.shortLink.findUnique({
    where: { slug },
    select: {
      id: true,
      eventId: true,
      isActive: true,
    },
  })

  if (!shortLink || !shortLink.isActive) {
    notFound()
  }

  // Increment click count in background (don't await to avoid blocking redirect)
  db.shortLink.update({
    where: { id: shortLink.id },
    data: { clickCount: { increment: 1 } },
  }).catch(() => {
    // Silently fail — don't block redirect for analytics
  })

  redirect(`/events/${shortLink.eventId}`)
}

// Also generate dynamic metadata for short links so they show OG tags when shared
export async function generateMetadata({ params }: Props) {
  const { slug } = await params

  try {
    const shortLink = await db.shortLink.findUnique({
      where: { slug },
      select: {
        isActive: true,
        event: {
          select: {
            title: true,
            synopsis: true,
            posterUrl: true,
          },
        },
      },
    })

    if (!shortLink || !shortLink.isActive) {
      return { title: 'Tautan Tidak Ditemukan - Teateran' }
    }

    const event = shortLink.event
    const description = event.synopsis
      ? event.synopsis.length > 160
        ? event.synopsis.slice(0, 157) + '...'
        : event.synopsis
      : `Pesan tiket untuk ${event.title} di Teateran.`

    return {
      title: `${event.title} - Teateran`,
      description,
      openGraph: {
        title: event.title,
        description,
        type: 'website',
        images: [{ url: event.posterUrl || '/teateran-logo.png', width: 1200, height: 630 }],
      },
      twitter: {
        card: 'summary_large_image',
        title: event.title,
        description,
        images: [event.posterUrl || '/teateran-logo.png'],
      },
    }
  } catch {
    return { title: 'Teateran - Ticketing Platform' }
  }
}
