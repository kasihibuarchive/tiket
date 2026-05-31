import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity-log'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')

    const promoCodes = await db.promoCode.findMany({
      where: eventId ? { eventId } : undefined,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ promoCodes })
  } catch (error: any) {
    console.error('Error fetching promo codes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch promo codes', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('[promo-create] Request body:', JSON.stringify(body, null, 2))

    const {
      code, eventId, discountType, discountValue, maxUses,
      validFrom, validUntil, isActive, target, isPerItem, minTickets, minMerchItems,
      bundleSize, bundleDiscount, applicableZoneNames, termsAndConditions
    } = body

    if (!code || !discountType || discountValue === undefined || !maxUses || !validFrom || !validUntil) {
      return NextResponse.json(
        { error: 'code, discountType, discountValue, maxUses, validFrom, and validUntil are required' },
        { status: 400 }
      )
    }

    const data = {
      code: code.toUpperCase(),
      eventId: eventId || null,
      discountType,
      discountValue: Number(discountValue),
      maxUses: Number(maxUses),
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      target: target || 'ALL',
      isPerItem: isPerItem === true,
      minTickets: Number(minTickets) || 0,
      minMerchItems: Number(minMerchItems) || 0,
      isActive: isActive !== undefined ? isActive : true,
      bundleSize: Number(bundleSize) || 0,
      bundleDiscount: Number(bundleDiscount) || 0,
      applicableZoneNames: applicableZoneNames || null,
      termsAndConditions: termsAndConditions || null,
    }

    console.log('[promo-create] Creating with data:', JSON.stringify(data, null, 2))

    const promoCode = await db.promoCode.create({ data })

    await logActivity(request, 'CREATE_PROMO', `Membuat promo code "${code.toUpperCase()}" — ${discountType} ${discountValue}${discountType === 'PERCENTAGE' ? '%' : ''} — Max: ${maxUses}x`)
    return NextResponse.json({ promoCode }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating promo code:', error)
    // Return detailed error so we can debug
    const detail = error?.message || String(error)
    const meta = error?.meta || undefined
    return NextResponse.json(
      { error: 'Failed to create promo code', detail, meta },
      { status: 500 }
    )
  }
}
