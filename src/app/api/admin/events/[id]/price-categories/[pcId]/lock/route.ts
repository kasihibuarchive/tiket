import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity-log'

/**
 * Kunci Penjualan — per-PriceCategory manual sales lock.
 *
 * POST   /api/admin/events/:id/price-categories/:pcId/lock
 *   body: { reason?: string }
 *   → sets salesLocked=true, salesLockedAt=now, salesLockedBy=admin username
 *
 * DELETE /api/admin/events/:id/price-categories/:pcId/lock
 *   → clears salesLocked + related fields
 *
 * Effect: when salesLocked=true, public checkout (POST /api/checkout) rejects
 * purchases of this price category with 403. Usher/admin complimentary ticket
 * issuance bypasses this lock (manual override).
 *
 * Distinct from GA zone-lock (which mutates Seat.status to UNAVAILABLE).
 * This is a clean flag on PriceCategory — survives seat regeneration, doesn't
 * get confused with sold-out state, and is per-package (not per-seat).
 */

async function resolveAdmin(request: NextRequest): Promise<{ id: string; username: string }> {
  try {
    const cookie = request.cookies.get('admin_session')?.value
    if (!cookie) return { id: 'unknown', username: 'unknown' }
    const { validateSessionToken } = await import('@/lib/auth')
    const result = await validateSessionToken(cookie)
    if (!result?.valid || !result.username) return { id: 'unknown', username: 'unknown' }
    const admin = await db.admin.findUnique({
      where: { username: result.username },
      select: { id: true, username: true },
    })
    return admin
      ? { id: admin.id, username: admin.username }
      : { id: 'unknown', username: 'unknown' }
  } catch {
    return { id: 'unknown', username: 'unknown' }
  }
}

async function getPriceCategory(eventId: string, pcId: string) {
  return db.priceCategory.findFirst({
    where: { id: pcId, eventId },
    select: {
      id: true,
      name: true,
      packageType: true,
      salesLocked: true,
      salesLockReason: true,
      salesLockedAt: true,
      salesLockedBy: true,
      event: { select: { title: true } },
    },
  })
}

// ─── POST: LOCK ──────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pcId: string }> }
) {
  try {
    const { id: eventId, pcId } = await params
    const body = await request.json().catch(() => ({}))
    const reason: string | undefined =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim().slice(0, 500)
        : undefined

    const pc = await getPriceCategory(eventId, pcId)
    if (!pc) {
      return NextResponse.json(
        { error: 'Kategori harga tidak ditemukan' },
        { status: 404 }
      )
    }

    if (pc.salesLocked) {
      return NextResponse.json(
        { error: 'Penjualan paket ini sudah dikunci sebelumnya.' },
        { status: 409 }
      )
    }

    const admin = await resolveAdmin(request)
    await db.priceCategory.update({
      where: { id: pcId },
      data: {
        salesLocked: true,
        salesLockReason: reason || null,
        salesLockedAt: new Date(),
        salesLockedBy: admin.username,
      },
    })

    await logActivity(
      request,
      'UPDATE_SEATS',
      `Kunci penjualan paket "${pc.name}"${reason ? ` — alasan: ${reason}` : ''} — Event: "${pc.event.title}" (by ${admin.username})`
    )

    return NextResponse.json({
      message: `Penjualan paket "${pc.name}" berhasil dikunci.`,
      salesLocked: true,
      salesLockReason: reason || null,
      salesLockedAt: new Date().toISOString(),
      salesLockedBy: admin.username,
    })
  } catch (error) {
    console.error('Error locking price category sales:', error)
    return NextResponse.json(
      { error: 'Gagal mengunci penjualan paket' },
      { status: 500 }
    )
  }
}

// ─── DELETE: UNLOCK ──────────────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pcId: string }> }
) {
  try {
    const { id: eventId, pcId } = await params
    const pc = await getPriceCategory(eventId, pcId)
    if (!pc) {
      return NextResponse.json(
        { error: 'Kategori harga tidak ditemukan' },
        { status: 404 }
      )
    }

    if (!pc.salesLocked) {
      return NextResponse.json(
        { error: 'Penjualan paket ini tidak sedang dikunci.' },
        { status: 409 }
      )
    }

    const admin = await resolveAdmin(request)
    await db.priceCategory.update({
      where: { id: pcId },
      data: {
        salesLocked: false,
        salesLockReason: null,
        salesLockedAt: null,
        salesLockedBy: null,
      },
    })

    await logActivity(
      request,
      'UPDATE_SEATS',
      `Buka kunci penjualan paket "${pc.name}" — Event: "${pc.event.title}" (by ${admin.username})`
    )

    return NextResponse.json({
      message: `Penjualan paket "${pc.name}" dibuka kembali.`,
      salesLocked: false,
    })
  } catch (error) {
    console.error('Error unlocking price category sales:', error)
    return NextResponse.json(
      { error: 'Gagal membuka kunci penjualan paket' },
      { status: 500 }
    )
  }
}

// ─── GET: status (for admin UI quick-poll) ───────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pcId: string }> }
) {
  try {
    const { id: eventId, pcId } = await params
    const pc = await getPriceCategory(eventId, pcId)
    if (!pc) {
      return NextResponse.json(
        { error: 'Kategori harga tidak ditemukan' },
        { status: 404 }
      )
    }
    return NextResponse.json({
      salesLocked: pc.salesLocked,
      salesLockReason: pc.salesLockReason,
      salesLockedAt: pc.salesLockedAt,
      salesLockedBy: pc.salesLockedBy,
    })
  } catch (error) {
    console.error('Error fetching price category lock status:', error)
    return NextResponse.json(
      { error: 'Gagal mengambil status kunci penjualan' },
      { status: 500 }
    )
  }
}
