import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTripayTransactionDetail } from '@/lib/tripay'
import { markSeatsForTransaction, buildQrText, buildEmailTicketPayload } from '@/lib/festival-seats'
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
        showDateId: true,
      },
    })

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Detect festival format up-front — needed for both PAID and PENDING paths
    let seatCodes: string[] = []
    try { seatCodes = JSON.parse(transaction.seatCodes) } catch { /* ignore */ }
    const isFestivalFormat = seatCodes.some((c) => c.includes('@'))

    // ── For REGULAR (non-festival) tickets: resolve the actual show date + open gate ──
    // transaction.showDateId points to the EventShowDate the customer bought.
    // Fall back to event.showDate / event.openGate if no showDateId (legacy events).
    let regularShowDate: { date: string | null; openGate: string | null; label: string | null } | null = null
    if (!isFestivalFormat) {
      let sd: { date: Date; openGate: Date | null; label: string | null } | null = null
      if (transaction.showDateId) {
        sd = await db.eventShowDate.findUnique({
          where: { id: transaction.showDateId },
          select: { date: true, openGate: true, label: true },
        })
      }
      if (!sd) {
        // Fall back to event-level fields
        const ev = await db.event.findUnique({
          where: { id: transaction.eventId },
          select: { showDate: true, openGate: true },
        })
        if (ev) {
          sd = { date: ev.showDate, openGate: ev.openGate, label: null }
        }
      }
      if (sd) {
        regularShowDate = {
          date: sd.date ? sd.date.toISOString() : null,
          openGate: sd.openGate ? sd.openGate.toISOString() : null,
          label: sd.label,
        }
      }
    }

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
          openGate: d.openGate,
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
                const { sendETicketEmail } = await import('@/lib/email')
                console.log('[verify] Sending e-ticket email to:', transaction.customerEmail, 'for order:', transactionId)

                // Build the email payload — resolves per-day open gates for festival passes,
                // or the correct showDateId's open gate for regular tickets.
                buildEmailTicketPayload(
                  {
                    transactionId: transaction.transactionId,
                    customerName: transaction.customerName,
                    customerEmail: transaction.customerEmail,
                    seatCodes: transaction.seatCodes,
                    totalAmount: transaction.totalAmount,
                    eventId: transaction.eventId,
                    showDateId: transaction.showDateId,
                  },
                  {
                    title: event.title,
                    location: event.location,
                    showDate: event.showDate,
                    openGate: event.openGate,
                  },
                  qrDataUrl,
                  emailTemplate ? {
                    greeting: emailTemplate.greeting,
                    rules: emailTemplate.rules,
                    notes: emailTemplate.notes,
                    footer: emailTemplate.footer,
                  } : null
                ).then((emailPayload) => sendETicketEmail(emailPayload))
                  .then(() => {
                    console.log('[verify] E-ticket email sent successfully to:', transaction.customerEmail)
                  })
                  .catch((err: any) => console.error('[verify] Email error:', err))
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
                regularShowDate,
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
                regularShowDate,
              })
            }

            // Still UNPAID
            const eventData = await db.event.findUnique({ where: { id: transaction.eventId }, select: { title: true, showDate: true, location: true, posterUrl: true } })
            return NextResponse.json({
              transaction: { ...transaction, event: eventData! },
              festival: festivalInfo,
              regularShowDate,
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
      regularShowDate,
    })
  } catch (error) {
    console.error('Error verifying transaction:', error)
    return NextResponse.json({ error: 'Failed to verify transaction' }, { status: 500 })
  }
}
