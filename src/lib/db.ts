import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  let url = process.env.DATABASE_URL || ''

  // ─── Auto-rewrite Supabase direct URL → pooler URL ─────────────────
  // Supabase direct: postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres
  // Supabase pooler: postgresql://postgres.xxx:xxx@aws-0-xxx.pooler.supabase.com:6543/postgres
  //
  // The pgbouncer=true parameter alone does NOT route through PgBouncer.
  // We MUST use port 6543 (Transaction Pooler) to actually pool connections.
  if (url.includes(':5432/') && !url.includes('.pooler.supabase.com')) {
    console.warn(
      '[db] WARNING: DATABASE_URL uses port 5432 (direct connection). ' +
      'This will exhaust Supabase connection pool on Vercel. ' +
      'Please use the Transaction Pooler URL (port 6543) from Supabase Dashboard → Settings → Database.'
    )
  }

  // Append PgBouncer compatibility flags
  if (!url.includes('pgbouncer=true')) {
    url += (url.includes('?') ? '&' : '?') + 'pgbouncer=true'
  }

  // Limit Prisma's internal connection pool to 1 per serverless instance
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
  retries = 3,
  baseDelay = 800
): Promise<T> {
  let lastError: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (error: unknown) {
      lastError = error
      const msg = error instanceof Error ? error.message : ''
      const isRetryable =
        msg.includes('EMAXCONNSESSION') ||
        msg.includes('max clients') ||
        msg.includes('pool_size') ||
        msg.includes('connection') ||
        msg.includes('timeout') ||
        msg.includes('PrismaClientInitializationError')

      if (isRetryable && i < retries) {
        const delay = baseDelay * Math.pow(2, i) + Math.random() * 300
        console.warn(`[db] Connection error (attempt ${i + 1}/${retries + 1}), retrying in ${Math.round(delay)}ms...`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw error
    }
  }
  throw lastError
}
