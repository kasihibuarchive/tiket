import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateSessionToken } from '@/lib/auth'
import { getCachedQueueConfig, setCachedQueueConfig, invalidateQueueCache } from '@/lib/queue-cache'

const ACTIVE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const HEARTBEAT_EXTEND_MS = 5 * 60 * 1000 // extend by 5 minutes
const OLD_TOKEN_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    // Admin bypass: if request has valid admin_session cookie, always return ACTIVE
    const adminToken = request.cookies.get('admin_session')?.value
    if (adminToken) {
      const adminResult = validateSessionToken(adminToken)
      if (adminResult.valid) {
        return NextResponse.json({
          enabled: true,
          status: 'ACTIVE',
          position: 0,
          totalWaiting: 0,
          isAdmin: true,
        })
      }
    }

    // Check if queue is configured for this event
    const cachedConfig = getCachedQueueConfig(eventId)
    if (cachedConfig === null) {
      // Cache miss — check DB
      const config = await fetchQueueConfig(eventId)
      if (!config) {
        return NextResponse.json({ enabled: false })
      }
    }

    const queueConfig = getCachedQueueConfig(eventId)
    if (!queueConfig) {
      return NextResponse.json({ enabled: false })
    }

    const maxConcurrent = queueConfig.maxConcurrent

    // Run cleanup and promotion logic
    await cleanupExpiredTokens(eventId)
    await promoteWaitingTokens(eventId, maxConcurrent)

    // Find or create token for this sessionId
    let token = await db.eventQueueToken.findFirst({
      where: { eventId, sessionId, status: { in: ['WAITING', 'ACTIVE'] } },
    })

    if (!token) {
      // Check if there's a queue config (re-validate after cleanup)
      const queueExists = await db.eventQueue.findUnique({ where: { eventId } })
      if (!queueExists) {
        invalidateQueueCache(eventId)
        return NextResponse.json({ enabled: false })
      }

      // Check if there's room — if so, activate immediately
      const activeCount = await db.eventQueueToken.count({
        where: { eventId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      })

      if (activeCount < maxConcurrent) {
        // Activate immediately
        token = await db.eventQueueToken.create({
          data: {
            eventId,
            sessionId,
            status: 'ACTIVE',
            position: activeCount + 1,
            activatedAt: new Date(),
            expiresAt: new Date(Date.now() + ACTIVE_TIMEOUT_MS),
          },
        })
      } else {
        // Join the queue
        const waitingCount = await db.eventQueueToken.count({
          where: { eventId, status: 'WAITING' },
        })
        token = await db.eventQueueToken.create({
          data: {
            eventId,
            sessionId,
            status: 'WAITING',
            position: waitingCount + 1,
          },
        })
      }
    }

    // If token is ACTIVE, extend heartbeat
    if (token.status === 'ACTIVE') {
      // Extend expiresAt
      const newExpiresAt = new Date(Date.now() + HEARTBEAT_EXTEND_MS)
      await db.eventQueueToken.update({
        where: { id: token.id },
        data: { expiresAt: newExpiresAt },
      })

      return NextResponse.json({
        enabled: true,
        status: 'ACTIVE',
        position: token.position,
        totalWaiting: 0,
      })
    }

    // Token is WAITING — calculate position
    const position = await calculateQueuePosition(eventId, token.id)
    const totalWaiting = await db.eventQueueToken.count({
      where: { eventId, status: 'WAITING' },
    })
    const estimatedWait = position * 30

    return NextResponse.json({
      enabled: true,
      status: 'WAITING',
      position,
      totalWaiting,
      estimatedWait,
    })
  } catch (error) {
    console.error('Queue status error:', error)
    return NextResponse.json(
      { error: 'Failed to check queue status' },
      { status: 500 }
    )
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

async function fetchQueueConfig(eventId: string) {
  const config = await db.eventQueue.findUnique({
    where: { eventId },
    select: { maxConcurrent: true },
  })

  if (config) {
    setCachedQueueConfig(eventId, config.maxConcurrent)
    return config
  }

  return null
}

async function cleanupExpiredTokens(eventId: string) {
  const now = new Date()

  // Mark expired ACTIVE tokens
  await db.eventQueueToken.updateMany({
    where: {
      eventId,
      status: 'ACTIVE',
      expiresAt: { lt: now },
    },
    data: { status: 'EXPIRED' },
  })

  // Delete old EXPIRED/LEFT tokens
  const threshold = new Date(Date.now() - OLD_TOKEN_THRESHOLD_MS)
  await db.eventQueueToken.deleteMany({
    where: {
      eventId,
      status: { in: ['EXPIRED', 'LEFT'] },
      createdAt: { lt: threshold },
    },
  })
}

async function promoteWaitingTokens(eventId: string, maxConcurrent: number) {
  const now = new Date()

  // Count current active (non-expired) tokens
  const activeCount = await db.eventQueueToken.count({
    where: { eventId, status: 'ACTIVE', expiresAt: { gt: now } },
  })

  const slotsAvailable = maxConcurrent - activeCount
  if (slotsAvailable <= 0) return

  // Find next WAITING tokens (oldest first)
  const waitingTokens = await db.eventQueueToken.findMany({
    where: { eventId, status: 'WAITING' },
    orderBy: { joinedAt: 'asc' },
    take: slotsAvailable,
  })

  if (waitingTokens.length === 0) return

  // Recalculate active count after cleanup for accurate position
  const currentActiveCount = await db.eventQueueToken.count({
    where: { eventId, status: 'ACTIVE', expiresAt: { gt: now } },
  })

  for (let i = 0; i < waitingTokens.length; i++) {
    await db.eventQueueToken.update({
      where: { id: waitingTokens[i].id },
      data: {
        status: 'ACTIVE',
        position: currentActiveCount + i + 1,
        activatedAt: now,
        expiresAt: new Date(Date.now() + ACTIVE_TIMEOUT_MS),
      },
    })
  }
}

async function calculateQueuePosition(eventId: string, tokenId: string): Promise<number> {
  // Count how many WAITING tokens joined before this one
  const token = await db.eventQueueToken.findUnique({
    where: { id: tokenId },
    select: { joinedAt: true },
  })

  if (!token) return 0

  const position = await db.eventQueueToken.count({
    where: {
      eventId,
      status: 'WAITING',
      joinedAt: { lte: token.joinedAt },
    },
  })

  return position
}
