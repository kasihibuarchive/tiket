import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * POST /api/cancel/[transactionId]
 *
 * Cancel a pending transaction.
 * - Releases locked seats back to AVAILABLE
 * - Sets paymentStatus to CANCELLED
 * - Only allowed for PENDING transactions
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { transactionId } = await params

    const transaction = await db.transaction.findUnique({
      where: { transactionId },
    })

    if (!transaction) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }

    if (transaction.paymentStatus !== 'PENDING') {
      return NextResponse.json(
        { error: 'Hanya transaksi yang masih pending yang bisa dibatalkan' },
        { status: 400 }
      )
    }

    const seatCodes: string[] = JSON.parse(transaction.seatCodes)

    // Cancel the transaction
    await db.transaction.update({
      where: { transactionId },
      data: {
        paymentStatus: 'CANCELLED',
        expiredAt: new Date(),
      },
    })

    // Release seats
    await db.seat.updateMany({
      where: {
        eventId: transaction.eventId,
        seatCode: { in: seatCodes },
      },
      data: {
        status: 'AVAILABLE',
        lockedUntil: null,
        lockedBy: null,
      },
    })

    console.log('[cancel] Transaction cancelled:', transactionId, 'Seats released:', seatCodes)

    return NextResponse.json({
      success: true,
      message: 'Transaksi berhasil dibatalkan',
      transactionId,
      releasedSeats: seatCodes,
    })
  } catch (error) {
    console.error('[cancel] Error:', error)
    return NextResponse.json({ error: 'Gagal membatalkan transaksi' }, { status: 500 })
  }
}
