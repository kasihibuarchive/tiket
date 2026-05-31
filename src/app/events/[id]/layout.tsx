import type { Metadata } from 'next'
import { db } from '@/lib/db'

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params

    const event = await db.event.findUnique({
      where: { id },
      select: {
        title: true,
        synopsis: true,
        posterUrl: true,
        category: true,
        location: true,
        showDate: true,
        priceCategories: {
          select: { price: true, name: true },
          orderBy: { price: 'asc' },
        },
      },
    })

    if (!event) {
      return {
        title: 'Event Tidak Ditemukan',
        description: 'Event yang Anda cari tidak ditemukan.',
      }
    }

    const description = event.synopsis
      ? event.synopsis.length > 160
        ? event.synopsis.slice(0, 157) + '...'
        : event.synopsis
      : `Pesan tiket untuk ${event.title} di Teateran.`

    const ogImage = event.posterUrl || '/teateran-logo.png'

    return {
      title: event.title,
      description,
      keywords: [
        'Teateran',
        event.title,
        event.category,
        'Tiket',
        'Teater',
        'Pertunjukan',
        event.location,
        'Beli Tiket Online',
      ],
      alternates: {
        canonical: `https://www.teateran.site/events/${id}`,
      },
      openGraph: {
        title: event.title,
        description,
        type: 'website',
        url: `https://www.teateran.site/events/${id}`,
        siteName: 'Teateran',
        locale: 'id_ID',
        images: [
          {
            url: ogImage,
            width: 1200,
            height: 630,
            alt: event.title,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: event.title,
        description,
        images: [ogImage],
      },
    }
  } catch {
    return {
      title: 'Teateran - Platform Tiket Pertunjukan Teater',
      description: 'Platform tiket resmi untuk pertunjukan teater di Indonesia.',
    }
  }
}

// ─── JSON-LD Structured Data for Google Rich Results ────────────────────
async function getEventJsonLd(id: string) {
  try {
    const event = await db.event.findUnique({
      where: { id },
      select: {
        title: true,
        synopsis: true,
        posterUrl: true,
        category: true,
        location: true,
        showDate: true,
        openGate: true,
        isCompleted: true,
        priceCategories: {
          select: { price: true, name: true },
          orderBy: { price: 'asc' },
        },
        showDates: {
          select: { date: true, openGate: true, label: true },
          orderBy: { date: 'asc' },
        },
      },
    })

    if (!event) return null

    const offers = event.priceCategories.map((pc) => ({
      '@type': 'Offer',
      name: pc.name,
      price: Math.round(pc.price),
      priceCurrency: 'IDR',
      availability: event.isCompleted
        ? 'https://schema.org/SoldOut'
        : 'https://schema.org/InStock',
      url: `https://www.teateran.site/events/${id}`,
    }))

    // Use first show date for startDate, or main showDate
    const startDate = event.showDates.length > 0
      ? event.showDates[0].date
      : event.showDate

    // Build sub-events for multi-day shows
    const subEvents = event.showDates.length > 1
      ? event.showDates.map((sd) => ({
          '@type': 'Event',
          name: `${event.title} - ${sd.label || `Hari ${event.showDates.indexOf(sd) + 1}`}`,
          startDate: new Date(sd.date).toISOString(),
          location: {
            '@type': 'Place',
            name: event.location,
            address: {
              '@type': 'PostalAddress',
              addressCountry: 'ID',
              addressLocality: event.location,
            },
          },
        }))
      : undefined

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'TheaterEvent',
      name: event.title,
      description: event.synopsis || `Pesan tiket untuk ${event.title}`,
      image: event.posterUrl || 'https://www.teateran.site/teateran-logo.png',
      startDate: new Date(startDate).toISOString(),
      doorTime: event.openGate ? new Date(event.openGate).toISOString() : undefined,
      eventStatus: event.isCompleted
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      organizer: {
        '@type': 'Organization',
        name: 'Teateran',
        url: 'https://www.teateran.site',
      },
      location: {
        '@type': 'Place',
        name: event.location,
        address: {
          '@type': 'PostalAddress',
          addressCountry: 'ID',
          addressLocality: event.location,
        },
      },
      offers: offers.length > 0
        ? {
            '@type': 'AggregateOffer',
            lowPrice: offers.length > 0 ? offers[0].price : 0,
            highPrice: offers.length > 0 ? offers[offers.length - 1].price : 0,
            priceCurrency: 'IDR',
            offerCount: offers.length,
            offers,
          }
        : undefined,
      subEvents,
      url: `https://www.teateran.site/events/${id}`,
    }

    // Remove undefined fields
    return JSON.stringify(jsonLd, (_, v) => v === undefined ? undefined : v)
  } catch {
    return null
  }
}

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const jsonLd = await getEventJsonLd(id)

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      )}
      {children}
    </>
  )
}
