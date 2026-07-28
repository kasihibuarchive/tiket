/**
 * Google Maps URL helpers — no API key required.
 *
 * The admin supplies a `mapUrl` value that can be any of:
 *   - A Google Maps share/embed URL (https://maps.app.goo.gl/..., https://www.google.com/maps/...)
 *   - A bare coordinates string ("lat,lng")
 *   - A plain place name ("Teateran Yogyakarta")
 *
 * We parse it into an embeddable iframe URL using Google's free
 * `https://maps.google.com/maps?q=...&output=embed` endpoint.
 *
 * If parsing fails we fall back to using the `location` text as a query.
 */

/**
 * Parse any user-supplied Google Maps input into an embeddable iframe URL.
 * Returns null if both `mapUrl` and `locationFallback` are empty/invalid.
 */
export function parseMapEmbedUrl(
  mapUrl: string | null | undefined,
  locationFallback?: string | null
): string | null {
  const raw = (mapUrl || '').trim()
  const fallback = (locationFallback || '').trim()

  // Nothing to embed
  if (!raw && !fallback) return null

  // If no mapUrl, fall back to location text as search query
  if (!raw) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(fallback)}&output=embed`
  }

  // Already an embed URL — return as-is
  if (/\/maps\/embed|output=embed/i.test(raw)) return raw

  // Short links like https://maps.app.goo.gl/XXXX — we can't resolve server-side
  // without an HTTP fetch. Use the location text as fallback if available,
  // otherwise use the short link as the query (Google will usually redirect).
  if (/maps\.app\.goo\.gl/i.test(raw)) {
    const q = fallback || raw
    return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`
  }

  // Coordinates: "lat,lng" like "-6.2088,106.8456"
  const coordMatch = raw.match(/^(-?\d{1,3}\.?\d*),\s*(-?\d{1,3}\.?\d*)$/)
  if (coordMatch) {
    return `https://maps.google.com/maps?q=${coordMatch[1]},${coordMatch[2]}&output=embed`
  }

  // Google Maps URL with @lat,lng,z (e.g. /@-6.2088,106.8456,15z)
  const atMatch = raw.match(/@(-?\d{1,3}\.?\d*),(-?\d{1,3}\.?\d*)/)
  if (atMatch) {
    return `https://maps.google.com/maps?q=${atMatch[1]},${atMatch[2]}&output=embed`
  }

  // Google Maps URL with ?q=...
  const qMatch = raw.match(/[?&]q=([^&]+)/)
  if (qMatch) {
    const q = decodeURIComponent(qMatch[1].replace(/\+/g, ' '))
    return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`
  }

  // Place URL like /maps/place/Place+Name/ or /maps/place/Place Name/
  const placeMatch = raw.match(/\/maps\/place\/([^/?@]+)/)
  if (placeMatch) {
    const placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '))
    return `https://maps.google.com/maps?q=${encodeURIComponent(placeName)}&output=embed`
  }

  // Search URL like /maps/search/Place+Name/
  const searchMatch = raw.match(/\/maps\/search\/([^/?@]+)/)
  if (searchMatch) {
    const searchQuery = decodeURIComponent(searchMatch[1].replace(/\+/g, ' '))
    return `https://maps.google.com/maps?q=${encodeURIComponent(searchQuery)}&output=embed`
  }

  // Fallback: treat as plain text query (place name or address)
  return `https://maps.google.com/maps?q=${encodeURIComponent(raw)}&output=embed`
}

/**
 * Build a "view on Google Maps" link for the user to open in a new tab.
 * Uses the search URL pattern so it works for any input.
 */
export function buildMapExternalLink(
  mapUrl: string | null | undefined,
  locationFallback?: string | null
): string | null {
  const raw = (mapUrl || '').trim()
  const fallback = (locationFallback || '').trim()

  // If admin pasted a Google Maps URL, use it directly (works for place URLs, share links, etc.)
  if (raw && /^https?:\/\/(www\.)?(google\.com|maps\.app\.goo\.gl|maps\.google\.com)\//i.test(raw)) {
    return raw
  }

  // Coordinates
  if (raw && /^-?\d{1,3}\.?\d*,\s*-?\d{1,3}\.?\d*$/.test(raw)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw)}`
  }

  // Fallback: search by location text
  const q = raw || fallback
  if (!q) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}
