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
      },
    })

    if (!event) {
      return {
        title: 'Event Tidak Ditemukan - Teateran',
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
      title: `${event.title} - Teateran`,
      description,
      keywords: [
        'Teateran',
        event.title,
        event.category,
        'Tiket',
        'Teater',
        event.location,
      ],
      openGraph: {
        title: event.title,
        description,
        type: 'website',
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
      title: 'Teateran - Ticketing Platform',
      description: 'Book your seats for the finest theatrical productions.',
    }
  }
}

export default function EventLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
