import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTripayTransactionDetail } from '@/lib/tripay'
import { markSeatsForTransaction, buildQrText } from '@/lib/festival-seats'
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
        lastScanAt: true,
        lastScanShowDateId: true,
        checkInTime: true,
      },
    })

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Detect festival format up-front — needed for both PAID and PENDING paths
    let seatCodes: string[] = []
    try { seatCodes = JSON.parse(transaction.seatCodes) } catch { /* ignore */ }
    const isFestivalFormat = seatCodes.some((c) => c.includes('@'))

    // Resolve festival package metadata (package name, applicable days, scanned days)
    let festivalInfo: any = null
    if (isFestivalFormat) {
      const applicableDayIds = [...new Set(seatCodes.map((c) => c.split('@')[1]))]
      const showDates = await db.eventShowDate.findMany({
        where: { id: { in: applicableDayIds } },
        orderBy: { date: 'asc' },
      })

      // Derive package name from first seat's price category
      const firstPair = seatCodes[0].split('@')
      const firstSeat = await db.seat.findFirst({
        where: { eventId: transaction.eventId, seatCode: firstPair[0], eventShowDateId: firstPair[1] },
        select: { priceCategoryId: true },
      })
      let packageName = 'Festival Pass'
      let packageType: string | null = null
      if (firstSeat?.priceCategoryId) {
        const pc = await db.priceCategory.findUnique({
          where: { id: firstSeat.priceCategoryId },
          select: { name: true, packageType: true },
        })
        if (pc) {
          packageName = pc.name
          packageType = pc.packageType
        }
      }

      // Get distinct scanned days from TicketScan table
      const scannedDays = await db.ticketScan.findMany({
        where: {
          transaction: { transactionId },
          isValid: true,
          scanType: { in: ['ENTRY', 'RE_ENTRY', 'FORCE_VALID'] },
        },
        select: { showDateId: true },
        distinct: ['showDateId'],
      })
      const scannedDayIds = scannedDays.map((s) => s.showDateId).filter(Boolean) as string[]

      festivalInfo = {
        packageName,
        packageType,
        applicableShowDates: showDates.map((d) => ({
          id: d.id,
          date: d.date,
          label: d.label,
          isScanned: scannedDayIds.includes(d.id),
        })),
        scannedDayIds,
        lastScanAt: transaction.lastScanAt,
        lastScanShowDateId: transaction.lastScanShowDateId,
      }
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
              const updatedTx = await db.transaction.update({
                where: { transactionId },
                data: {
                  paymentStatus: 'PAID',
                  paidAt: tripayData.data.paid_at ? new Date(tripayData.data.paid_at * 1000) : new Date(),
                },
              })

              // Mark seats as SOLD (handles both REGULAR and FESTIVAL formats)
              await markSeatsForTransaction(
                transaction.eventId,
                transaction.seatCodes,
                'SOLD',
                { lockedUntil: null, lockedBy: null }
              )

              // Generate QR code — content includes festival info if applicable
              const qrText = await buildQrText({
                transactionId: transaction.transactionId,
                customerName: transaction.customerName,
                seatCodes: transaction.seatCodes,
                eventId: transaction.eventId,
              })
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
                  timeZone: 'Asia/Jakarta',
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
                  lastScanAt: true, lastScanShowDateId: true, checkInTime: true,
                },
              })

              const eventData = await db.event.findUnique({ where: { id: updated!.eventId }, select: { title: true, showDate: true, location: true, posterUrl: true } })
              return NextResponse.json({
                transaction: { ...updated!, event: eventData! },
                festival: festivalInfo,
                justPaid: true,
              })
            }

            if (tripayStatus === 'EXPIRED' || tripayStatus === 'FAILED') {
              const newStatus = tripayStatus === 'EXPIRED' ? 'EXPIRED' : 'FAILED'

              await db.transaction.update({
                where: { transactionId },
                data: { paymentStatus: newStatus, expiredAt: new Date() },
              })

              await markSeatsForTransaction(
                transaction.eventId,
                transaction.seatCodes,
                'AVAILABLE',
                { lockedUntil: null, lockedBy: null }
              )

              const updated = await db.transaction.findUnique({
                where: { transactionId },
                select: {
                  transactionId: true, customerName: true, customerEmail: true, customerWa: true,
                  seatCodes: true, totalAmount: true, paymentStatus: true, qrCodeUrl: true, paidAt: true,
                  eventId: true, createdAt: true, merchandiseData: true, adminFeeApplied: true, promoCodeId: true,
                  midtransId: true, paymentMethod: true, paymentUrl: true,
                  lastScanAt: true, lastScanShowDateId: true, checkInTime: true,
                },
              })
              const eventData = await db.event.findUnique({ where: { id: updated!.eventId }, select: { title: true, showDate: true, location: true, posterUrl: true } })
              return NextResponse.json({
                transaction: { ...updated!, event: eventData! },
                festival: festivalInfo,
              })
            }

            // Still UNPAID
            const eventData = await db.event.findUnique({ where: { id: transaction.eventId }, select: { title: true, showDate: true, location: true, posterUrl: true } })
            return NextResponse.json({
              transaction: { ...transaction, event: eventData! },
              festival: festivalInfo,
            })
          }
        }
      } catch (tripayErr) {
        console.error('[verify] Tripay check error:', tripayErr)
        // Fall through to return DB data
      }
    }

    // Return DB data as-is
    const eventData = await db.event.findUnique({ where: { id: transaction.eventId }, select: { title: true, showDate: true, location: true, posterUrl: true } })
    return NextResponse.json({
      transaction: { ...transaction, event: eventData! },
      festival: festivalInfo,
    })
  } catch (error) {
    console.error('Error verifying transaction:', error)
    return NextResponse.json({ error: 'Failed to verify transaction' }, { status: 500 })
  }
}
