import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Checkout locks use "CK:" prefix to distinguish from seat-map locks.
// Seat-map locks: sessionId (e.g., "sess-1234-abc")
// Checkout locks:  "CK:sess-1234-abc" (checkout lock takes priority over seat-map lock)
const CHECKOUT_PREFIX = 'CK:'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { eventId, seatCodes, sessionId } = body

    if (!eventId || !seatCodes || !Array.isArray(seatCodes) || seatCodes.length === 0) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    // Checkout session ID (prefixed to take priority over seat-map locks)
    const checkoutId = CHECKOUT_PREFIX + sessionId

    // 1. Find all requested seats
    const seats = await db.seat.findMany({
      where: { eventId, seatCode: { in: seatCodes } },
      select: { seatCode: true, status: true, lockedBy: true },
    })

    if (seats.length !== seatCodes.length) {
      return NextResponse.json({
        ok: false,
        error: 'Beberapa kursi tidak ditemukan. Silakan refresh halaman.',
        takenSeats: seatCodes,
      })
    }

    // 2. Reject SOLD seats
    const soldSeats = seats.filter((s) => s.status === 'SOLD')
    if (soldSeats.length > 0) {
      const taken = soldSeats.map((s) => s.seatCode)
      return NextResponse.json({
        ok: false,
        error: 'Kursi ' + taken.join(', ') + ' sudah terjual. Silakan pilih kursi lain.',
        takenSeats: taken,
      })
    }

    // 3. Idempotency check: if ALL seats are already locked by THIS checkout session, allow retry
    const alreadyOurs = seats.filter(
      (s) => s.status === 'LOCKED_TEMPORARY' && s.lockedBy === checkoutId
    )
    if (alreadyOurs.length === seatCodes.length) {
      // Extend lock time and return success (idempotent retry)
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000)
      await db.seat.updateMany({
        where: { eventId, seatCode: { in: seatCodes }, lockedBy: checkoutId },
        data: { lockedUntil },
      })
      return NextResponse.json({ ok: true, confirmedSeats: seatCodes })
    }

    // 4. ATOMIC LOCK — whoever executes this updateMany FIRST wins the seats.
    // 
    // Lock seats that are:
    //   - NOT SOLD (already checked above)
    //   - NOT locked by another CHECKOUT session (CK: prefix)
    // 
    // This means checkout locks OVERRIDE seat-map locks.
    // If another user is ALSO in checkout (has CK: lock), they win and we lose.
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000)
    const result = await db.seat.updateMany({
      where: {
        eventId,
        seatCode: { in: seatCodes },
        NOT: [
          {
            status: 'LOCKED_TEMPORARY',
            lockedBy: { startsWith: CHECKOUT_PREFIX },
          },
        ],
      },
      data: { status: 'LOCKED_TEMPORARY', lockedUntil, lockedBy: checkoutId },
    })

    // 4. Race condition check: if we couldn't lock all seats, someone else won
    if (result.count < seatCodes.length) {
      // Find which seats we managed to lock
      const updated = await db.seat.findMany({
        where: { eventId, seatCode: { in: seatCodes }, lockedBy: checkoutId },
        select: { seatCode: true },
      })
      const updatedCodes = new Set(updated.map((s) => s.seatCode))
      const failedCodes = seatCodes.filter((c) => !updatedCodes.has(c))

      return NextResponse.json({
        ok: false,
        error: 'Kursi ' + failedCodes.join(', ') + ' sedang diproses pembayaran oleh orang lain. Silakan pilih kursi lain.',
        takenSeats: failedCodes,
      })
    }

    // 5. All seats locked by this checkout session — proceed!
    return NextResponse.json({
      ok: true,
      confirmedSeats: seatCodes,
    })
  } catch (error) {
    console.error('[confirm-lock]', error)
    return NextResponse.json({ error: 'Lock confirmation failed' }, { status: 500 })
  }
}
