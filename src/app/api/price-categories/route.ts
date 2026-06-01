import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }

    const categories = await db.priceCategory.findMany({
      where: { eventId },
      orderBy: { price: 'desc' },
    })

    return NextResponse.json({ categories })
  } catch (error) {
    console.error('Error fetching price categories:', error)
    return NextResponse.json({ error: 'Failed to fetch price categories' }, { status: 500 })
  }
}
