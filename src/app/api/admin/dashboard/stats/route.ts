import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  parseSeatCodes,
  isFestivalSeatCodes,
  computeEffectiveTicketCount,
} from '@/lib/festival-seats'

export async function GET() {
  try {
    // ── Global stats ──
    const paidTransactions = await db.transaction.findMany({
      where: { paymentStatus: 'PAID' },
      select: {
        id: true,
        transactionId: true,
        eventId: true,
        totalAmount: true,
        adminFeeApplied: true,
        merchandiseData: true,
        seatCodes: true,
        paidAt: true,
        createdAt: true,
        customerName: true,
        customerEmail: true,
        paymentMethod: true,
        promoCodeId: true,
        checkInTime: true,
      },
    })

    const pendingCount = await db.transaction.count({ where: { paymentStatus: 'PENDING' } })
    const expiredCount = await db.transaction.count({ where: { paymentStatus: 'EXPIRED' } })
    const failedCount = await db.transaction.count({ where: { paymentStatus: 'FAILED' } })
    const cancelledCount = await db.transaction.count({ where: { paymentStatus: 'CANCELLED' } })

    // ── Events ──
    const events = await db.event.findMany({
      select: {
        id: true,
        title: true,
        isPublished: true,
        showDate: true,
        location: true,
        adminFee: true,
        eventMode: true,
        priceCategories: { select: { price: true } },
      },
      orderBy: { showDate: 'desc' },
    })

    // ── Promo codes for discount calculation ──
    const promoCodeIds = [...new Set(paidTransactions.map(tx => tx.promoCodeId).filter(Boolean))]
    const promoCodes = promoCodeIds.length > 0 ? await db.promoCode.findMany({
      where: { id: { in: promoCodeIds as string[] } },
      select: { id: true, code: true, discountType: true, discountValue: true },
    }) : []
    const promoMap = new Map(promoCodes.map(p => [p.id, p]))

    // ── Per-event financial breakdown ──
    const eventStats: Record<string, {
      eventId: string
      eventTitle: string
      isPublished: boolean
      showDate: string
      ticketCount: number
      ticketRevenue: number
      adminFeeRevenue: number
      merchRevenue: number
      discountGiven: number
      grossRevenue: number
      netRevenue: number
      transactionCount: number
      checkedIn: number
    }> = {}

    // Initialize all events (including those with 0 transactions)
    for (const ev of events) {
      eventStats[ev.id] = {
        eventId: ev.id,
        eventTitle: ev.title,
        isPublished: ev.isPublished,
        showDate: ev.showDate.toISOString(),
        ticketCount: 0,
        ticketRevenue: 0,
        adminFeeRevenue: 0,
        merchRevenue: 0,
        discountGiven: 0,
        grossRevenue: 0,
        netRevenue: 0,
        transactionCount: 0,
        checkedIn: 0,
      }
    }

    // Aggregate from paid transactions
    for (const tx of paidTransactions) {
      const stat = eventStats[tx.eventId]
      if (!stat) continue

      stat.transactionCount++

      // Check-in
      if (tx.checkInTime) stat.checkedIn++

      // Parse seat codes & count effective tickets (festival passes count as 1 ticket per package,
      // not N×dayCount seats — see computeEffectiveTicketCount helper)
      const seatCodesArr = parseSeatCodes(tx.seatCodes)
      stat.ticketCount += computeEffectiveTicketCount(seatCodesArr)

      // Admin fee
      const adminFee = tx.adminFeeApplied || 0
      stat.adminFeeRevenue += adminFee

      // Merchandise revenue — parse from merchandiseData JSON
      let merchTotal = 0
      if (tx.merchandiseData) {
        try {
          const merchItems = JSON.parse(tx.merchandiseData)
          if (Array.isArray(merchItems)) {
            for (const item of merchItems) {
              merchTotal += (item.price || 0) * (item.quantity || 0)
            }
          }
        } catch {}
      }
      stat.merchRevenue += merchTotal

      // Discount given — estimate from promo code
      if (tx.promoCodeId) {
        const promo = promoMap.get(tx.promoCodeId)
        if (promo) {
          if (promo.discountType === 'PERCENT') {
            // Estimate discount: percentage of ticket revenue
            const ticketSubtotal = tx.totalAmount - adminFee - merchTotal
            const discount = Math.round(ticketSubtotal * (promo.discountValue / 100) / (1 - promo.discountValue / 100))
            stat.discountGiven += Math.max(discount, 0)
          } else {
            // Fixed discount
            stat.discountGiven += promo.discountValue
          }
        }
      }

      // Ticket revenue = totalAmount - adminFee - merchTotal
      const ticketRevenue = tx.totalAmount - adminFee - merchTotal
      stat.ticketRevenue += Math.max(ticketRevenue, 0)

      stat.grossRevenue += tx.totalAmount
      stat.netRevenue += tx.totalAmount - adminFee
    }

    // ── Totals across all events ──
    const totalGrossRevenue = paidTransactions.reduce((sum, tx) => sum + tx.totalAmount, 0)
    const totalAdminFee = paidTransactions.reduce((sum, tx) => sum + (tx.adminFeeApplied || 0), 0)
    const totalTicketRevenue = Object.values(eventStats).reduce((sum, s) => sum + s.ticketRevenue, 0)
    const totalMerchRevenue = Object.values(eventStats).reduce((sum, s) => sum + s.merchRevenue, 0)
    const totalDiscountGiven = Object.values(eventStats).reduce((sum, s) => sum + s.discountGiven, 0)
    const totalNetRevenue = totalGrossRevenue - totalAdminFee
    const totalTickets = Object.values(eventStats).reduce((sum, s) => sum + s.ticketCount, 0)
    const totalCheckedIn = paidTransactions.filter(tx => tx.checkInTime).length

    // ── Check-in stats ──
    const checkInStats = {
      checkedIn: totalCheckedIn,
      notCheckedIn: paidTransactions.length - totalCheckedIn,
      total: paidTransactions.length,
    }

    // ── Ticket Category Breakdown ──
    // For REGULAR events: each SOLD seat = 1 ticket at seat.priceCategory.price.
    // For FESTIVAL events: each SOLD seat is one (ticket × day) entry. Counting seats
    // directly would inflate both the count (by N× for N-day passes) AND the revenue
    // (since priceCategory.price is the full package price, not per-day).
    //
    // Fix: derive category counts from PAID TRANSACTIONS using computeEffectiveTicketCount.
    // This gives the true "tickets sold" per category and matches what the customer paid.
    const festivalEventIds = new Set(
      events.filter(e => e.eventMode === 'FESTIVAL').map(e => e.id)
    )

    // Fetch ALL SOLD seats (with priceCategoryId) in ONE query — used to look up
    // the price category for both regular and festival transactions.
    // Index by composite key: eventId|seatCode|dayId (dayId="" for regular).
    const allSoldSeats = await db.seat.findMany({
      where: { status: 'SOLD' },
      select: { eventId: true, seatCode: true, eventShowDateId: true, priceCategoryId: true },
    })
    const seatLookup = new Map<string, string | null>()
    for (const s of allSoldSeats) {
      const key = `${s.eventId}|${s.seatCode}|${s.eventShowDateId || ''}`
      seatLookup.set(key, s.priceCategoryId)
    }

    // All price categories in one query
    const allPriceCats = await db.priceCategory.findMany({
      select: { id: true, name: true, colorCode: true, price: true, eventId: true },
    })
    const pcMap = new Map(allPriceCats.map(pc => [pc.id, pc]))

    // Build category aggregation from transactions (not seats) for accurate ticket counts
    const categoryMap = new Map<string, { name: string; color: string; count: number; grossRevenue: number }>()

    for (const tx of paidTransactions) {
      const codes = parseSeatCodes(tx.seatCodes)
      const isFestival = isFestivalSeatCodes(codes)
      const effectiveCount = computeEffectiveTicketCount(codes)

      let priceCatId: string | null = null
      if (codes.length > 0) {
        if (isFestival) {
          // Festival: seatCode@dayId format
          const [seatCode, dayId] = codes[0].split('@')
          priceCatId = seatLookup.get(`${tx.eventId}|${seatCode}|${dayId || ''}`) || null
        } else {
          // Regular: plain seatCode
          priceCatId = seatLookup.get(`${tx.eventId}|${codes[0]}|`) || null
        }
      }
      if (!priceCatId) continue

      const pc = pcMap.get(priceCatId)
      if (!pc) continue

      if (!categoryMap.has(priceCatId)) {
        categoryMap.set(priceCatId, {
          name: pc.name,
          color: pc.colorCode || '#8B8680',
          count: 0,
          grossRevenue: 0,
        })
      }
      const entry = categoryMap.get(priceCatId)!
      entry.count += effectiveCount
      entry.grossRevenue += pc.price * effectiveCount
    }

    // Calculate revenue per category using actual ticket price × effective ticket count
    const categoryBreakdown = Array.from(categoryMap.entries()).map(([id, cat]) => {
      const grossRevenue = cat.grossRevenue
      return {
        id,
        name: cat.name,
        color: cat.color,
        count: cat.count,
        revenue: Math.round(grossRevenue),
        netRevenue: Math.round(grossRevenue - (grossRevenue * totalAdminFee / (totalGrossRevenue || 1))),
      }
    }).sort((a, b) => b.count - a.count)

    // ── Seat Status Summary ──
    const seatStatusCounts = await db.seat.groupBy({
      by: ['status'],
      _count: true,
    })
    const seatFunnel = {
      total: 0,
      available: 0,
      sold: 0,
      invitation: 0,
      locked: 0,
      unavailable: 0,
    }
    for (const row of seatStatusCounts) {
      seatFunnel.total += row._count
      const status = row.status as string
      if (status === 'AVAILABLE') seatFunnel.available = row._count
      else if (status === 'SOLD') seatFunnel.sold = row._count
      else if (status === 'INVITATION') seatFunnel.invitation = row._count
      else if (status === 'LOCKED_TEMPORARY') seatFunnel.locked = row._count
      else if (status === 'UNAVAILABLE') seatFunnel.unavailable = row._count
    }

    // ── Recent transactions (last 10) ──
    const recentTxs = paidTransactions
      .sort((a, b) => (b.paidAt?.getTime() || 0) - (a.paidAt?.getTime() || 0))
      .slice(0, 10)
      .map((tx) => {
        const seatCodesArr = parseSeatCodes(tx.seatCodes)
        const isFestival = isFestivalSeatCodes(seatCodesArr)
        return {
          transactionId: tx.transactionId,
          customerName: tx.customerName,
          customerEmail: tx.customerEmail,
          totalAmount: tx.totalAmount,
          adminFeeApplied: tx.adminFeeApplied,
          netAmount: tx.totalAmount - (tx.adminFeeApplied || 0),
          seatCount: computeEffectiveTicketCount(seatCodesArr),
          rawSeatCount: seatCodesArr.length, // raw count for debugging / display
          isFestival,
          paymentMethod: tx.paymentMethod,
          paidAt: tx.paidAt?.toISOString(),
          eventId: tx.eventId,
          eventTitle: eventStats[tx.eventId]?.eventTitle || 'Unknown',
          eventIsFestival: festivalEventIds.has(tx.eventId),
          checkedIn: !!tx.checkInTime,
        }
      })

    // ── Revenue by day (last 30 days) ──
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentPaid = paidTransactions.filter(
      (tx) => tx.paidAt && tx.paidAt >= thirtyDaysAgo
    )

    const revenueByDay: Record<string, { date: string; revenue: number; netRevenue: number; tickets: number; transactions: number }> = {}
    for (const tx of recentPaid) {
      if (!tx.paidAt) continue
      const dayKey = tx.paidAt.toISOString().slice(0, 10)
      if (!revenueByDay[dayKey]) {
        revenueByDay[dayKey] = { date: dayKey, revenue: 0, netRevenue: 0, tickets: 0, transactions: 0 }
      }
      revenueByDay[dayKey].revenue += tx.totalAmount
      revenueByDay[dayKey].netRevenue += tx.totalAmount - (tx.adminFeeApplied || 0)
      const seatCodesArr = parseSeatCodes(tx.seatCodes)
      revenueByDay[dayKey].tickets += computeEffectiveTicketCount(seatCodesArr)
      revenueByDay[dayKey].transactions++
    }
    const revenueTimeline = Object.values(revenueByDay).sort((a, b) => a.date.localeCompare(b.date))

    // Cumulative revenue for area chart
    let cumulativeRevenue = 0
    let cumulativeNetRevenue = 0
    const cumulativeTimeline = revenueTimeline.map(d => {
      cumulativeRevenue += d.revenue
      cumulativeNetRevenue += d.netRevenue
      return { ...d, cumulativeRevenue, cumulativeNetRevenue }
    })

    // ── Payment method breakdown ──
    const paymentMethodStats: Record<string, { method: string; count: number; revenue: number; netRevenue: number }> = {}
    for (const tx of paidTransactions) {
      const method = tx.paymentMethod || 'UNKNOWN'
      if (!paymentMethodStats[method]) {
        paymentMethodStats[method] = { method, count: 0, revenue: 0, netRevenue: 0 }
      }
      paymentMethodStats[method].count++
      paymentMethodStats[method].revenue += tx.totalAmount
      paymentMethodStats[method].netRevenue += tx.totalAmount - (tx.adminFeeApplied || 0)
    }

    return NextResponse.json({
      // Global summary
      totalEvents: events.length,
      publishedEvents: events.filter((e) => e.isPublished).length,
      totalTransactions: paidTransactions.length,
      pendingTransactions: pendingCount,
      expiredTransactions: expiredCount,
      failedTransactions: failedCount,
      cancelledTransactions: cancelledCount,
      totalTickets,
      totalTicketRevenue,
      totalMerchRevenue,
      totalAdminFee,
      totalDiscountGiven,
      totalGrossRevenue,
      totalNetRevenue,

      // Check-in
      checkInStats,

      // Category breakdown
      categoryBreakdown,

      // Seat funnel
      seatFunnel,

      // Per-event breakdown
      eventBreakdown: Object.values(eventStats).sort((a, b) => b.grossRevenue - a.grossRevenue),

      // Recent transactions
      recentTransactions: recentTxs,

      // Charts
      revenueTimeline,
      cumulativeTimeline,
      paymentMethodStats: Object.values(paymentMethodStats).sort((a, b) => b.revenue - a.revenue),
    })
  } catch (error) {
    console.error('[dashboard-stats] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard stats' }, { status: 500 })
  }
}
