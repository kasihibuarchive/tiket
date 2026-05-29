import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const event = await db.event.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        category: true,
        showDate: true,
        location: true,
        posterUrl: true,
        isPublished: true,
        isCompleted: true,
        adminFee: true,
        adminFeeQris: true,
        adminFeeNonQris: true,
        createdAt: true,
        showDates: { select: { id: true, date: true, label: true }, orderBy: { date: 'asc' } },
        priceCategories: { select: { id: true, name: true, price: true, colorCode: true } },
      },
    })

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // ── All PAID transactions for this event ──
    const paidTransactions = await db.transaction.findMany({
      where: { eventId: id, paymentStatus: 'PAID' },
      select: {
        id: true,
        transactionId: true,
        customerName: true,
        customerEmail: true,
        customerWa: true,
        seatCodes: true,
        totalAmount: true,
        adminFeeApplied: true,
        merchandiseData: true,
        paymentMethod: true,
        paidAt: true,
        checkInTime: true,
        promoCodeId: true,
        showDateId: true,
        createdAt: true,
      },
      orderBy: { paidAt: 'desc' },
    })

    // ── All transactions (non-PAID counts) ──
    const pendingCount = await db.transaction.count({ where: { eventId: id, paymentStatus: 'PENDING' } })
    const expiredCount = await db.transaction.count({ where: { eventId: id, paymentStatus: 'EXPIRED' } })
    const failedCount = await db.transaction.count({ where: { eventId: id, paymentStatus: 'FAILED' } })
    const cancelledCount = await db.transaction.count({ where: { eventId: id, paymentStatus: 'CANCELLED' } })

    // ── Promo codes ──
    const promoCodeIds = [...new Set(paidTransactions.map(tx => tx.promoCodeId).filter(Boolean))]
    const promoCodes = promoCodeIds.length > 0 ? await db.promoCode.findMany({
      where: { id: { in: promoCodeIds as string[] } },
      select: { id: true, code: true, discountType: true, discountValue: true },
    }) : []
    const promoMap = new Map(promoCodes.map(p => [p.id, p]))

    // ── Aggregate financial data ──
    let grossRevenue = 0
    let adminFeeRevenue = 0
    let merchRevenue = 0
    let ticketRevenue = 0
    let discountGiven = 0
    let totalTickets = 0
    let checkedIn = 0

    // Per-show-date breakdown
    const showDateMap: Record<string, { label: string; date: string; grossRevenue: number; adminFee: number; netRevenue: number; ticketCount: number; transactions: number }> = {}
    for (const sd of event.showDates) {
      showDateMap[sd.id] = {
        label: sd.label || `Hari ${event.showDates.indexOf(sd) + 1}`,
        date: sd.date.toISOString(),
        grossRevenue: 0,
        adminFee: 0,
        netRevenue: 0,
        ticketCount: 0,
        transactions: 0,
      }
    }

    // Per-payment-method breakdown
    const methodMap: Record<string, { method: string; count: number; grossRevenue: number; adminFee: number; netRevenue: number }> = {}

    // Per-category breakdown
    const seatsWithCategory = await db.seat.findMany({
      where: { eventId: id, status: 'SOLD' },
      select: {
        priceCategoryId: true,
        priceCategory: { select: { name: true, price: true, colorCode: true } },
        eventShowDateId: true,
      },
    })
    const catRevenueMap: Record<string, { name: string; price: number; color: string; count: number; grossRevenue: number }> = {}
    for (const seat of seatsWithCategory) {
      const catId = seat.priceCategoryId || 'unknown'
      if (!catRevenueMap[catId]) {
        catRevenueMap[catId] = {
          name: seat.priceCategory?.name || 'Lainnya',
          price: seat.priceCategory?.price || 0,
          color: seat.priceCategory?.colorCode || '#8B8680',
          count: 0,
          grossRevenue: 0,
        }
      }
      catRevenueMap[catId].count++
      catRevenueMap[catId].grossRevenue += seat.priceCategory?.price || 0
    }

    // Revenue by day
    const revenueByDay: Record<string, { date: string; gross: number; net: number; tickets: number }> = {}

    // Process each transaction
    const transactionList = paidTransactions.map(tx => {
      let seatCodesArr: string[] = []
      try { seatCodesArr = JSON.parse(tx.seatCodes) } catch { seatCodesArr = tx.seatCodes.split(',') }

      const adminFee = tx.adminFeeApplied || 0
      let merchTotal = 0
      if (tx.merchandiseData) {
        try {
          const merchItems = JSON.parse(tx.merchandiseData)
          if (Array.isArray(merchItems)) {
            for (const item of merchItems) merchTotal += (item.price || 0) * (item.quantity || 0)
          }
        } catch {}
      }

      const txTicketRevenue = Math.max(tx.totalAmount - adminFee - merchTotal, 0)
      let txDiscount = 0
      if (tx.promoCodeId) {
        const promo = promoMap.get(tx.promoCodeId)
        if (promo) {
          if (promo.discountType === 'PERCENT') {
            txDiscount = Math.round(txTicketRevenue * (promo.discountValue / 100) / (1 - promo.discountValue / 100))
          } else {
            txDiscount = promo.discountValue
          }
        }
      }

      // Aggregate
      grossRevenue += tx.totalAmount
      adminFeeRevenue += adminFee
      merchRevenue += merchTotal
      ticketRevenue += txTicketRevenue
      discountGiven += Math.max(txDiscount, 0)
      totalTickets += seatCodesArr.length
      if (tx.checkInTime) checkedIn++

      // Per show date
      if (tx.showDateId && showDateMap[tx.showDateId]) {
        showDateMap[tx.showDateId].grossRevenue += tx.totalAmount
        showDateMap[tx.showDateId].adminFee += adminFee
        showDateMap[tx.showDateId].netRevenue += tx.totalAmount - adminFee
        showDateMap[tx.showDateId].ticketCount += seatCodesArr.length
        showDateMap[tx.showDateId].transactions++
      }

      // Per payment method
      const method = tx.paymentMethod || 'UNKNOWN'
      if (!methodMap[method]) methodMap[method] = { method, count: 0, grossRevenue: 0, adminFee: 0, netRevenue: 0 }
      methodMap[method].count++
      methodMap[method].grossRevenue += tx.totalAmount
      methodMap[method].adminFee += adminFee
      methodMap[method].netRevenue += tx.totalAmount - adminFee

      // Per day
      if (tx.paidAt) {
        const dayKey = tx.paidAt.toISOString().slice(0, 10)
        if (!revenueByDay[dayKey]) revenueByDay[dayKey] = { date: dayKey, gross: 0, net: 0, tickets: 0 }
        revenueByDay[dayKey].gross += tx.totalAmount
        revenueByDay[dayKey].net += tx.totalAmount - adminFee
        revenueByDay[dayKey].tickets += seatCodesArr.length
      }

      return {
        transactionId: tx.transactionId,
        customerName: tx.customerName,
        customerEmail: tx.customerEmail,
        seatCount: seatCodesArr.length,
        seatCodes: seatCodesArr,
        totalAmount: tx.totalAmount,
        adminFeeApplied: adminFee,
        netAmount: tx.totalAmount - adminFee,
        merchTotal,
        paymentMethod: tx.paymentMethod,
        paidAt: tx.paidAt?.toISOString(),
        checkedIn: !!tx.checkInTime,
        promoCode: tx.promoCodeId ? (promoMap.get(tx.promoCodeId)?.code || null) : null,
        showDateId: tx.showDateId,
      }
    })

    const netRevenue = grossRevenue - adminFeeRevenue

    // ── Seat stats ──
    const seatStats = await db.seat.groupBy({
      where: { eventId: id },
      by: ['status'],
      _count: true,
    })
    const seatSummary = { total: 0, available: 0, sold: 0, invitation: 0, locked: 0, unavailable: 0 }
    for (const row of seatStats) {
      seatSummary.total += row._count
      const s = row.status as string
      if (s === 'AVAILABLE') seatSummary.available = row._count
      else if (s === 'SOLD') seatSummary.sold = row._count
      else if (s === 'INVITATION') seatSummary.invitation = row._count
      else if (s === 'LOCKED_TEMPORARY') seatSummary.locked = row._count
      else if (s === 'UNAVAILABLE') seatSummary.unavailable = row._count
    }

    return NextResponse.json({
      event: {
        id: event.id,
        title: event.title,
        category: event.category,
        showDate: event.showDate.toISOString(),
        location: event.location,
        posterUrl: event.posterUrl,
        isPublished: event.isPublished,
        isCompleted: event.isCompleted,
        adminFeeQris: event.adminFeeQris,
        adminFeeNonQris: event.adminFeeNonQris,
        showDates: event.showDates.map(sd => ({
          id: sd.id,
          date: sd.date.toISOString(),
          label: sd.label,
        })),
        priceCategories: event.priceCategories,
      },
      summary: {
        grossRevenue,
        adminFeeRevenue,
        merchRevenue,
        ticketRevenue,
        netRevenue,
        discountGiven,
        totalTickets,
        checkedIn,
        totalPaidTransactions: paidTransactions.length,
        pendingCount,
        expiredCount,
        failedCount,
        cancelledCount,
        checkInRate: paidTransactions.length > 0 ? Math.round((checkedIn / paidTransactions.length) * 100) : 0,
        soldRate: seatSummary.total > 0 ? Math.round((seatSummary.sold / seatSummary.total) * 100) : 0,
        adminFeePct: grossRevenue > 0 ? Math.round((adminFeeRevenue / grossRevenue) * 100 * 10) / 10 : 0,
      },
      seatSummary,
      categoryBreakdown: Object.values(catRevenueMap).sort((a, b) => b.grossRevenue - a.grossRevenue),
      showDateBreakdown: Object.values(showDateMap),
      paymentMethodBreakdown: Object.values(methodMap).sort((a, b) => b.grossRevenue - a.grossRevenue),
      revenueTimeline: Object.values(revenueByDay).sort((a, b) => a.date.localeCompare(b.date)),
      transactions: transactionList,
    })
  } catch (error) {
    console.error('[finance-report] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch finance report' }, { status: 500 })
  }
}
