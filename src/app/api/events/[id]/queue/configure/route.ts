import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateSessionToken } from '@/lib/auth'
import { setCachedQueueConfig, invalidateQueueCache } from '@/lib/queue-cache'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params

    // Admin authentication check
    const adminToken = request.cookies.get('admin_session')?.value
    if (!adminToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminResult = validateSessionToken(adminToken)
    if (!adminResult.valid) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    const body = await request.json()
    const { enabled, maxConcurrent } = body

    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled is required (boolean)' }, { status: 400 })
    }

    if (enabled && (typeof maxConcurrent !== 'number' || maxConcurrent < 1)) {
      return NextResponse.json(
        { error: 'maxConcurrent must be a positive number when enabled' },
        { status: 400 }
      )
    }

    // Verify event exists
    const event = await db.event.findUnique({ where: { id: eventId } })
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (!enabled) {
      // Disable queue — delete the config and all tokens
      await db.eventQueueToken.deleteMany({ where: { eventId } })
      await db.eventQueue.deleteMany({ where: { eventId } })
      invalidateQueueCache(eventId)

      return NextResponse.json({
        message: 'Queue disabled',
        enabled: false,
        activeUsers: 0,
        waitingUsers: 0,
      })
    }

    // Enable/update queue config
    const config = await db.eventQueue.upsert({
      where: { eventId },
      update: { maxConcurrent: maxConcurrent || 50 },
      create: { eventId, maxConcurrent: maxConcurrent || 50 },
    })

    // Update cache
    setCachedQueueConfig(eventId, config.maxConcurrent)

    // Get current stats
    const now = new Date()
    const activeCount = await db.eventQueueToken.count({
      where: { eventId, status: 'ACTIVE', expiresAt: { gt: now } },
    })
    const waitingCount = await db.eventQueueToken.count({
      where: { eventId, status: 'WAITING' },
    })

    return NextResponse.json({
      message: 'Queue configured',
      enabled: true,
      maxConcurrent: config.maxConcurrent,
      activeUsers: activeCount,
      waitingUsers: waitingCount,
    })
  } catch (error) {
    console.error('Queue configure error:', error)
    return NextResponse.json(
      { error: 'Failed to configure queue' },
      { status: 500 }
    )
  }
}

// GET — fetch current queue config and stats (admin)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params

    // Admin authentication check
    const adminToken = request.cookies.get('admin_session')?.value
    if (!adminToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminResult = validateSessionToken(adminToken)
    if (!adminResult.valid) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    const config = await db.eventQueue.findUnique({ where: { eventId } })

    if (!config) {
      return NextResponse.json({
        enabled: false,
        maxConcurrent: 50,
        activeUsers: 0,
        waitingUsers: 0,
      })
    }

    const now = new Date()
    const activeCount = await db.eventQueueToken.count({
      where: { eventId, status: 'ACTIVE', expiresAt: { gt: now } },
    })
    const waitingCount = await db.eventQueueToken.count({
      where: { eventId, status: 'WAITING' },
    })
    const expiredCount = await db.eventQueueToken.count({
      where: { eventId, status: 'EXPIRED' },
    })

    return NextResponse.json({
      enabled: true,
      maxConcurrent: config.maxConcurrent,
      activeUsers: activeCount,
      waitingUsers: waitingCount,
      expiredUsers: expiredCount,
    })
  } catch (error) {
    console.error('Queue config fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch queue config' },
      { status: 500 }
    )
  }
}
