import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startTime = Date.now()
  let dbOk = false
  let dbError = ''
  let dbTime = 0

  try {
    const { db } = await import('@/lib/db')
    const t1 = Date.now()
    await db.$queryRaw`SELECT 1 as ok`
    dbTime = Date.now() - t1
    dbOk = true
  } catch (err: unknown) {
    dbError = err instanceof Error ? err.message : String(err)
  }

  const totalTime = Date.now() - startTime

  return NextResponse.json({
    status: dbOk ? 'ok' : 'error',
    db: { ok: dbOk, error: dbError, timeMs: dbTime },
    totalMs: totalTime,
    timestamp: new Date().toISOString(),
    env: {
      nodeEnv: process.env.NODE_ENV,
      dbUrlHasPooler: process.env.DATABASE_URL?.includes('.pooler.supabase.com') ?? false,
      dbUrlPort: process.env.DATABASE_URL?.match(/:(\d+)\//)?.[1] ?? 'unknown',
    },
  })
}
