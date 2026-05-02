// Shared queue config cache for cross-route invalidation

const queueConfigCache = new Map<string, { maxConcurrent: number; fetchedAt: number }>()
const CACHE_TTL = 30_000 // 30 seconds

export interface QueueConfig {
  maxConcurrent: number
}

export function getCachedQueueConfig(eventId: string): QueueConfig | null {
  const cached = queueConfigCache.get(eventId)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return { maxConcurrent: cached.maxConcurrent }
  }
  return null
}

export function setCachedQueueConfig(eventId: string, maxConcurrent: number) {
  queueConfigCache.set(eventId, { maxConcurrent, fetchedAt: Date.now() })
}

export function invalidateQueueCache(eventId: string) {
  queueConfigCache.delete(eventId)
}
