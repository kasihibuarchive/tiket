import { db } from '@/lib/db'
import type { MetadataRoute } from 'next'

const BASE_URL = 'https://www.teateran.site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const events = await db.event.findMany({
      where: { isPublished: true },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    })

    const eventUrls: MetadataRoute.Sitemap = events.map((event) => ({
      url: `${BASE_URL}/events/${event.id}`,
      lastModified: event.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    }))

    // Static pages
    const staticUrls: MetadataRoute.Sitemap = [
      {
        url: BASE_URL,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1.0,
      },
      {
        url: `${BASE_URL}/tentang`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.5,
      },
      {
        url: `${BASE_URL}/kebijakan-privasi`,
        lastModified: new Date(),
        changeFrequency: 'yearly',
        priority: 0.3,
      },
      {
        url: `${BASE_URL}/ketentuan-layanan`,
        lastModified: new Date(),
        changeFrequency: 'yearly',
        priority: 0.3,
      },
    ]

    return [...staticUrls, ...eventUrls]
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
