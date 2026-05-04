import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  let url = process.env.DATABASE_URL || ''

  // Force PgBouncer for Supabase — prevents direct connections from exhausting pool
  if (!url.includes('pgbouncer=true')) {
    url += (url.includes('?') ? '&' : '?') + 'pgbouncer=true'
  }

  // Limit Prisma's connection pool to 1 per serverless instance
  // Vercel spins up multiple instances; with default pool (cpu*2+1), we'd hit Supabase's 15-connection limit
  if (!url.includes('connection_limit=')) {
    url += '&connection_limit=1'
  }

  // Fail fast if pool is busy instead of hanging
  if (!url.includes('pool_timeout=')) {
    url += '&pool_timeout=5'
  }

  return new PrismaClient({
    datasourceUrl: url,
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  })
}

export const db =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * Retry wrapper for DB operations that may fail due to connection pool exhaustion.
 * Retries up to `retries` times with exponential backoff.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelay = 500
): Promise<T> {
  let lastError: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (error: unknown) {
      lastError = error
      const msg = error instanceof Error ? error.message : ''
      // Only retry on connection pool / timeout errors
      const isRetryable =
        msg.includes('EMAXCONNSESSION') ||
        msg.includes('max clients') ||
        msg.includes('pool_size') ||
        msg.includes('connection') ||
        msg.includes('timeout') ||
        msg.includes('PrismaClientInitializationError')

      if (isRetryable && i < retries) {
        const delay = baseDelay * Math.pow(2, i) + Math.random() * 200
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw error
    }
  }
  throw lastError
}
