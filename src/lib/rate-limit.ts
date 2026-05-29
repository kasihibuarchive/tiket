/**
 * Simple in-memory rate limiter for serverless environments.
 * Uses a sliding window approach with periodic cleanup.
 * 
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 10 })
 *   const result = limiter.check(identifier)
 *   if (!result.allowed) return Response.json({ error: 'Too many requests' }, { status: 429 })
 */

interface RateLimitEntry {
  timestamps: number[]
}

interface RateLimiterOptions {
  windowMs: number    // Time window in milliseconds
  maxRequests: number // Max requests allowed in the window
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number // Timestamp when the window resets
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, maxRequests } = options
  const store = new Map<string, RateLimitEntry>()

  // Periodic cleanup: remove expired entries every 5 minutes
  // This prevents memory leaks in long-running processes
  let cleanupTimer: ReturnType<typeof setInterval> | null = null

  function startCleanup() {
    if (cleanupTimer) return
    cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs)
        if (entry.timestamps.length === 0) {
          store.delete(key)
        }
      }
    }, 5 * 60 * 1000) // Clean every 5 minutes
  }

  // Start cleanup on first use
  startCleanup()

  function check(identifier: string): RateLimitResult {
    const now = Date.now()
    let entry = store.get(identifier)

    if (!entry) {
      entry = { timestamps: [] }
      store.set(identifier, entry)
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs)

    const remaining = Math.max(0, maxRequests - entry.timestamps.length)

    if (entry.timestamps.length >= maxRequests) {
      const oldestInWindow = entry.timestamps[0]
      const resetAt = oldestInWindow + windowMs
      return { allowed: false, remaining: 0, resetAt }
    }

    entry.timestamps.push(now)
    return { allowed: true, remaining: remaining - 1, resetAt: now + windowMs }
  }

  return { check }
}

// ─── Pre-configured rate limiters ──────────────────────────────────

// Review submission: max 3 per 10 minutes per IP
export const reviewLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, maxRequests: 3 })

// Short link creation: max 10 per 5 minutes per admin
export const shortLinkLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 10 })

// Checkout/seat lock: max 5 per minute per IP
export const checkoutLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 5 })

// General API: max 30 per minute per IP
export const apiLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30 })

/**
 * Get client IP from request headers.
 * Vercel puts the real IP in x-forwarded-for or x-real-ip.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const xri = request.headers.get('x-real-ip')
  if (xri) return xri.trim()
  return 'unknown'
}
