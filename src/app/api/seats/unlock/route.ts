import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const CHECKOUT_PREFIX = 'CK:'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { eventId, seatCodes, sessionId } = body

    if (!eventId || !seatCodes || !Array.isArray(seatCodes) || seatCodes.length === 0) {
      return NextResponse.json(
        { error: 'eventId and seatCodes are required' },
        { status: 400 }
      )
    }

    // Build where clause: only unlock seats belonging to this session
    // (either seat-map lock or checkout lock)
    const whereClause: any = {
      eventId,
      seatCode: { in: seatCodes },
      status: 'LOCKED_TEMPORARY',
    }

    if (sessionId) {
      whereClause.OR = [
        { lockedBy: sessionId },
        { lockedBy: CHECKOUT_PREFIX + sessionId },
        { lockedBy: null }, // Legacy locks without session
      ]
    }

    const result = await db.seat.updateMany({
      where: whereClause,
      data: {
        status: 'AVAILABLE',
        lockedUntil: null,
        lockedBy: null,
      },
    })

    return NextResponse.json({
      message: 'Seats unlocked successfully',
      seatCodes,
      updated: result.count,
    })
  } catch (error) {
    console.error('Error unlocking seats:', error)
    return NextResponse.json(
      { error: 'Failed to unlock seats' },
      { status: 500 }
    )
  }
}
