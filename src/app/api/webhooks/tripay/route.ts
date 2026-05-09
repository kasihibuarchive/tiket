import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { getTripayConfig } from '@/lib/tripay'
import { sendETicketEmail } from '@/lib/email'
import QRCode from 'qrcode'

export async function POST(request: NextRequest) {
  try {
    // Get raw body text FIRST (before JSON parsing) for signature verification
    const rawBody = await request.text()
    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      console.error('[tripay-webhook] Invalid JSON body')
      return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 })
    }

    // Verify Tripay callback signature using RAW body string
    // Tripay computes: HMAC-SHA256(privateKey, rawJsonBodyString)
    const xCallbackSignature = request.headers.get('x-callback-signature') || ''
    const config = getTripayConfig()
    const computedSignature = crypto
      .createHmac('sha256', config.privateKey)
      .update(rawBody)
      .digest('hex')

    if (computedSignature !== xCallbackSignature) {
      console.error('[tripay-webhook] Invalid signature for reference:', body.reference,
        '| computed:', computedSignature.substring(0, 8) + '...',
        '| received:', xCallbackSignature.substring(0, 8) + '...')
      return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 403 })
    }

    const { reference, merchant_ref, status, paid_at } = body

    // Find transaction by Tripay reference (stored in midtransId) or by transactionId (merchant_ref)
    let transaction = await db.transaction.findUnique({
      where: { transactionId: merchant_ref },
    })

    // Fallback: search by midtransId = reference
    if (!transaction && reference) {
      transaction = await db.transaction.findFirst({
        where: { midtransId: reference },
      })
    }

    if (!transaction) {
      console.error('[tripay-webhook] Transaction not found. merchant_ref:', merchant_ref, 'reference:', reference)
      return NextResponse.json({ success: false, message: 'Transaction not found' }, { status: 404 })
    }

    // Only process if still PENDING (avoid duplicate processing)
    if (transaction.paymentStatus !== 'PENDING' && status !== 'REFUNDED') {
      console.log('[tripay-webhook] Transaction', merchant_ref, 'already', transaction.paymentStatus, '- skipping')
      return NextResponse.json({ success: true })
    }

    // ── PAID ──
    if (status === 'PAID') {
      const seatCodes: string[] = JSON.parse(transaction.seatCodes)

      await db.transaction.update({
        where: { transactionId: transaction.transactionId },
        data: {
          paymentStatus: 'PAID',
          paidAt: paid_at ? new Date(paid_at * 1000) : new Date(),
          midtransId: reference,
        },
      })

      // Mark seats as SOLD — clear lockedBy too
      await db.seat.updateMany({
        where: { eventId: transaction.eventId, seatCode: { in: seatCodes } },
        data: { status: 'SOLD', lockedUntil: null, lockedBy: null },
      })

      // Generate QR code
      const qrText = 'NAMA: ' + transaction.customerName + ' | KURSI: ' + transaction.seatCodes + ' | KODE TRX: ' + transaction.transactionId
      const qrDataUrl = await QRCode.toDataURL(qrText)
      await db.transaction.update({
        where: { transactionId: transaction.transactionId },
        data: { qrCodeUrl: qrDataUrl },
      })

      // Send e-ticket email
      const event = await db.event.findUnique({ where: { id: transaction.eventId } })
      const emailTemplate = await db.emailTemplate.findFirst({ where: { isActive: true } })

      if (event) {
        const showDate = new Date(event.showDate).toLocaleDateString('id-ID', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })
        console.log('[tripay-webhook] Sending e-ticket email to:', transaction.customerEmail, 'for order:', merchant_ref)
        sendETicketEmail({
          customerName: transaction.customerName,
          customerEmail: transaction.customerEmail,
          eventName: event.title,
          showDate,
          location: event.location,
          seatCodes,
          transactionId: transaction.transactionId,
          totalAmount: transaction.totalAmount,
          qrCodeDataUrl: qrDataUrl,
          template: emailTemplate ? { greeting: emailTemplate.greeting, rules: emailTemplate.rules, notes: emailTemplate.notes, footer: emailTemplate.footer } : undefined,
        }).then(async () => {
          console.log('[tripay-webhook] E-ticket email sent successfully to:', transaction.customerEmail)
          // Track successful delivery
          await db.transaction.update({
            where: { transactionId: transaction.transactionId },
            data: { emailStatus: 'SENT', emailError: null, lastEmailSentAt: new Date() },
          }).catch(() => {})
        }).catch(async (emailError: any) => {
          const errMsg = emailError?.message || String(emailError)
          console.error('[tripay-webhook] Failed to send E-Ticket email:', errMsg)
          // Track failed delivery
          const isBounce = errMsg.includes('OverQuota') || errMsg.includes('out of storage') || errMsg.includes('452') || errMsg.includes('550')
          await db.transaction.update({
            where: { transactionId: transaction.transactionId },
            data: {
              emailStatus: isBounce ? 'BOUNCED' : 'FAILED',
              emailError: errMsg.substring(0, 500),
              lastEmailSentAt: new Date(),
            },
          }).catch(() => {})
        })
      }

      return NextResponse.json({ success: true })
    }

    // ── EXPIRED ──
    if (status === 'EXPIRED') {
      const seatCodes: string[] = JSON.parse(transaction.seatCodes)

      await db.transaction.update({
        where: { transactionId: transaction.transactionId },
        data: { paymentStatus: 'EXPIRED', expiredAt: new Date(), midtransId: reference },
      })

      // Release seats
      await db.seat.updateMany({
        where: { eventId: transaction.eventId, seatCode: { in: seatCodes } },
        data: { status: 'AVAILABLE', lockedUntil: null, lockedBy: null },
      })

      return NextResponse.json({ success: true })
    }

    // ── FAILED ──
    if (status === 'FAILED') {
      const seatCodes: string[] = JSON.parse(transaction.seatCodes)

      await db.transaction.update({
        where: { transactionId: transaction.transactionId },
        data: { paymentStatus: 'FAILED', expiredAt: new Date(), midtransId: reference },
      })

      await db.seat.updateMany({
        where: { eventId: transaction.eventId, seatCode: { in: seatCodes } },
        data: { status: 'AVAILABLE', lockedUntil: null, lockedBy: null },
      })

      return NextResponse.json({ success: true })
    }

    // ── REFUNDED ──
    if (status === 'REFUNDED') {
      await db.transaction.update({
        where: { transactionId: transaction.transactionId },
        data: { paymentStatus: 'FAILED', midtransId: reference },
      })
      return NextResponse.json({ success: true })
    }

    console.log('[tripay-webhook] Unhandled status:', status, 'for order:', merchant_ref)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[tripay-webhook] Error processing callback:', error)
    return NextResponse.json({ success: false, message: 'Webhook processing failed' }, { status: 500 })
  }
}
