import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const body = await request.json()
    const { sessionId } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    // Mark this session's token as LEFT
    const result = await db.eventQueueToken.updateMany({
      where: {
        eventId,
        sessionId,
        status: { in: ['WAITING', 'ACTIVE'] },
      },
      data: { status: 'LEFT' },
    })

    if (result.count === 0) {
      return NextResponse.json({ message: 'No active queue token found' })
    }

    // Promote next waiting user if a slot opened up
    const now = new Date()
    const queueConfig = await db.eventQueue.findUnique({ where: { eventId } })
    if (queueConfig) {
      const activeCount = await db.eventQueueToken.count({
        where: { eventId, status: 'ACTIVE', expiresAt: { gt: now } },
      })

      if (activeCount < queueConfig.maxConcurrent) {
        // Promote next waiting token
        const nextWaiting = await db.eventQueueToken.findFirst({
          where: { eventId, status: 'WAITING' },
          orderBy: { joinedAt: 'asc' },
        })

        if (nextWaiting) {
          await db.eventQueueToken.update({
            where: { id: nextWaiting.id },
            data: {
              status: 'ACTIVE',
              position: activeCount + 1,
              activatedAt: now,
              expiresAt: new Date(Date.now() + 5 * 60 * 1000),
            },
          })
        }
      }
    }

    return NextResponse.json({ message: 'Left queue successfully' })
  } catch (error) {
    console.error('Queue leave error:', error)
    return NextResponse.json(
      { error: 'Failed to leave queue' },
      { status: 500 }
    )
  }
}
