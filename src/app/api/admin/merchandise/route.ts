import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity-log'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')

    const merchandise = await db.merchandise.findMany({
      where: eventId ? { eventId } : undefined,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ merchandise })
  } catch (error) {
    console.error('Error fetching merchandise:', error)
    return NextResponse.json(
      { error: 'Failed to fetch merchandise' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, eventId, description, price, stock, imageUrl } = body

    if (!name || !eventId || price === undefined || stock === undefined) {
      return NextResponse.json(
        { error: 'name, eventId, price, and stock are required' },
        { status: 400 }
      )
    }

    const merchandise = await db.merchandise.create({
      data: {
        name,
        eventId,
        description: description || '',
        price,
        stock,
        imageUrl: imageUrl || null,
      },
    })

    const event = await db.event.findUnique({ where: { id: eventId }, select: { title: true } })
    await logActivity(request, 'CREATE_MERCHANDISE', `Membuat merchandise "${name}" — Event: ${event?.title || eventId}`)
    return NextResponse.json({ merchandise }, { status: 201 })
  } catch (error) {
    console.error('Error creating merchandise:', error)
    return NextResponse.json(
      { error: 'Failed to create merchandise' },
      { status: 500 }
    )
  }
}
