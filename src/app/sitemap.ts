import { db } from '@/lib/db'
import type { MetadataRoute } from 'next'

const BASE_URL = 'https://www.teateran.site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    // ─── Fetch published events ──────────────────────────────────────
    const events = await db.event.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        updatedAt: true,
        showDate: true,
        isCompleted: true,
        shortLinks: {
          where: { isActive: true },
          select: { slug: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    // Event pages
    const eventUrls: MetadataRoute.Sitemap = events.map((event) => ({
      url: `${BASE_URL}/events/${event.id}`,
      lastModified: event.updatedAt,
      changeFrequency: event.isCompleted ? ('yearly' as const) : ('weekly' as const),
      priority: event.isCompleted ? 0.5 : 0.8,
    }))

    // Short link pages (also indexable — they redirect to events)
    const shortLinkUrls: MetadataRoute.Sitemap = events.flatMap((event) =>
      event.shortLinks.map((sl) => ({
        url: `${BASE_URL}/${sl.slug}`,
        lastModified: event.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }))
    )

    // ─── Static pages ────────────────────────────────────────────────
    const staticUrls: MetadataRoute.Sitemap = [
      {
        url: BASE_URL,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1.0,
      },
      {
        url: `${BASE_URL}/tentang`,
        lastModified: new Date('2026-05-04'),
        changeFrequency: 'monthly',
        priority: 0.5,
      },
      {
        url: `${BASE_URL}/kebijakan-privasi`,
        lastModified: new Date('2026-05-04'),
        changeFrequency: 'yearly',
        priority: 0.3,
      },
      {
        url: `${BASE_URL}/ketentuan-layanan`,
        lastModified: new Date('2026-05-04'),
        changeFrequency: 'yearly',
        priority: 0.3,
      },
    ]

    return [...staticUrls, ...eventUrls, ...shortLinkUrls]
  } catch {
    // If DB fails, return at least the static pages
    return [
      {
        url: BASE_URL,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1.0,
      },
    ]
  }
}
