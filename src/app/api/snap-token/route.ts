import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createTransactionSignature, createTripayTransaction } from '@/lib/tripay'

/**
 * POST /api/snap-token
 *
 * Re-creates a Tripay transaction for a pending payment.
 * Used by the "Bayar Sekarang" button on checkout status page.
 * Unlike Midtrans (which re-uses the same token), Tripay needs a new transaction.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { transactionId } = body

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 })
    }

    const transaction = await db.transaction.findUnique({
      where: { transactionId },
    })

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    if (transaction.paymentStatus !== 'PENDING') {
      return NextResponse.json({ error: 'Transaction is not pending' }, { status: 400 })
    }

    if (!transaction.paymentMethod) {
      return NextResponse.json({ error: 'No payment method associated with this transaction' }, { status: 400 })
    }

    const expiredTime = Math.floor(Date.now() / 1000) + (24 * 60 * 60)
    const signature = createTransactionSignature(transactionId, transaction.totalAmount)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const orderItems = [{
      sku: 'REPAY-' + transactionId,
      name: 'Pembayaran Tiket',
      price: transaction.totalAmount,
      quantity: 1,
    }]

    console.log('[snap-token] Re-creating Tripay transaction for:', transactionId, 'method:', transaction.paymentMethod)

    const tripayRes = await createTripayTransaction({
      method: transaction.paymentMethod,
      merchant_ref: transactionId,
      amount: transaction.totalAmount,
      customer_name: transaction.customerName,
      customer_email: transaction.customerEmail,
      customer_phone: transaction.customerWa,
      order_items: orderItems,
      callback_url: appUrl + '/api/webhooks/tripay',
      return_url: appUrl + '/verify/' + transactionId,
      expired_time: expiredTime,
      signature,
    })

    if (!tripayRes.ok) {
      const errText = await tripayRes.text().catch(() => 'Unknown error')
      console.error('[snap-token] Tripay error:', tripayRes.status, errText)
      return NextResponse.json({ error: 'Gagal membuat ulang transaksi pembayaran' }, { status: 502 })
    }

    const tripayData = await tripayRes.json()

    if (!tripayData.success || !tripayData.data) {
      console.error('[snap-token] Tripay API error:', tripayData.message)
      return NextResponse.json({ error: tripayData.message || 'Gagal membuat ulang transaksi' }, { status: 502 })
    }

    const { reference, checkout_url, pay_url } = tripayData.data
    const paymentUrl = checkout_url || pay_url || null

    // Update transaction with new Tripay reference & payment URL
    await db.transaction.update({
      where: { transactionId },
      data: {
        midtransId: reference,
        paymentUrl: paymentUrl,
      },
    })

    return NextResponse.json({
      reference,
      checkoutUrl: paymentUrl,
      transactionId,
    })
  } catch (error) {
    console.error('[snap-token] Error:', error)
    return NextResponse.json({ error: 'Gagal membuat ulang transaksi' }, { status: 500 })
  }
}
