import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTripayTransactionDetail } from '@/lib/tripay'
import QRCode from 'qrcode'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { transactionId } = await params

    // Fetch transaction WITHOUT include
    const transaction = await db.transaction.findUnique({
      where: { transactionId },
      select: {
        transactionId: true,
        customerName: true,
        customerEmail: true,
        customerWa: true,
        seatCodes: true,
        totalAmount: true,
        paymentStatus: true,
        qrCodeUrl: true,
        paidAt: true,
        eventId: true,
        createdAt: true,
        merchandiseData: true,
        adminFeeApplied: true,
        promoCodeId: true,
        midtransId: true,      // Tripay reference
        paymentMethod: true,
        paymentUrl: true,
      },
    })

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // If still PENDING, check Tripay directly for latest status
    if (transaction.paymentStatus === 'PENDING' && transaction.midtransId) {
      try {
        const statusRes = await getTripayTransactionDetail(transaction.midtransId)

        if (statusRes.ok) {
          const tripayData = await statusRes.json()

          if (tripayData.success && tripayData.data) {
            const tripayStatus = tripayData.data.status

            console.log('[verify] Tripay status for', transactionId, ':', tripayStatus)

            if (tripayStatus === 'PAID') {
              // Payment success!
              const seatCodes: string[] = JSON.parse(transaction.seatCodes)

              await db.transaction.update({
                where: { transactionId },
                data: {
                  paymentStatus: 'PAID',
                  paidAt: tripayData.data.paid_at ? new Date(tripayData.data.paid_at * 1000) : new Date(),
                },
              })

              // Mark seats as SOLD
              await db.seat.updateMany({
                where: { eventId: transaction.eventId, seatCode: { in: seatCodes } },
                data: { status: 'SOLD', lockedUntil: null, lockedBy: null },
              })

              // Generate QR code
              const qrText = 'NAMA: ' + transaction.customerName + ' | KURSI: ' + transaction.seatCodes + ' | KODE TRX: ' + transaction.transactionId
              const qrDataUrl = await QRCode.toDataURL(qrText)
              await db.transaction.update({
                where: { transactionId },
                data: { qrCodeUrl: qrDataUrl },
              })

              // Send email
              const event = await db.event.findUnique({ where: { id: transaction.eventId } })
              const emailTemplate = await db.emailTemplate.findFirst({ where: { isActive: true } })

              if (event) {
                const showDate = new Date(event.showDate).toLocaleDateString('id-ID', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })

                const { sendETicketEmail } = await import('@/lib/email')
                console.log('[verify] Sending e-ticket email to:', transaction.customerEmail, 'for order:', transactionId)
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
                }).then(() => {
                  console.log('[verify] E-ticket email sent successfully to:', transaction.customerEmail)
                }).catch((err: any) => console.error('[verify] Email error:', err))
              }

              // Refetch updated transaction
              const updated = await db.transaction.findUnique({
                where: { transactionId },
                select: {
                  transactionId: true, customerName: true, customerEmail: true, customerWa: true,
                  seatCodes: true, totalAmount: true, paymentStatus: true, qrCodeUrl: true, paidAt: true,
                  eventId: true, createdAt: true, merchandiseData: true, adminFeeApplied: true, promoCodeId: true,
                  midtransId: true, paymentMethod: true, paymentUrl: true,
                },
              })

              const eventData = await db.event.findUnique({ where: { id: updated!.eventId }, select: { title: true, showDate: true, location: true, posterUrl: true } })
              return NextResponse.json({ transaction: { ...updated!, event: eventData! }, justPaid: true })
            }

            if (tripayStatus === 'EXPIRED' || tripayStatus === 'FAILED') {
              const newStatus = tripayStatus === 'EXPIRED' ? 'EXPIRED' : 'FAILED'
              const seatCodes: string[] = JSON.parse(transaction.seatCodes)

              await db.transaction.update({
                where: { transactionId },
                data: { paymentStatus: newStatus, expiredAt: new Date() },
              })

              await db.seat.updateMany({
                where: { eventId: transaction.eventId, seatCode: { in: seatCodes } },
                data: { status: 'AVAILABLE', lockedUntil: null, lockedBy: null },
              })

              const updated = await db.transaction.findUnique({
                where: { transactionId },
                select: {
                  transactionId: true, customerName: true, customerEmail: true, customerWa: true,
                  seatCodes: true, totalAmount: true, paymentStatus: true, qrCodeUrl: true, paidAt: true,
                  eventId: true, createdAt: true, merchandiseData: true, adminFeeApplied: true, promoCodeId: true,
                  midtransId: true, paymentMethod: true, paymentUrl: true,
                },
              })
              const eventData = await db.event.findUnique({ where: { id: updated!.eventId }, select: { title: true, showDate: true, location: true, posterUrl: true } })
              return NextResponse.json({ transaction: { ...updated!, event: eventData! } })
            }

            // Still UNPAID
            const eventData = await db.event.findUnique({ where: { id: transaction.eventId }, select: { title: true, showDate: true, location: true, posterUrl: true } })
            return NextResponse.json({ transaction: { ...transaction, event: eventData! } })
          }
        }
      } catch (tripayErr) {
        console.error('[verify] Tripay check error:', tripayErr)
        // Fall through to return DB data
      }
    }

    // Return DB data as-is
    const eventData = await db.event.findUnique({ where: { id: transaction.eventId }, select: { title: true, showDate: true, location: true, posterUrl: true } })
    return NextResponse.json({ transaction: { ...transaction, event: eventData! } })
  } catch (error) {
    console.error('Error verifying transaction:', error)
    return NextResponse.json({ error: 'Failed to verify transaction' }, { status: 500 })
  }
}
