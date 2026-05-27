import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
      },
      orderBy: { showDate: 'desc' },
    })

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

      // Parse seat codes to count tickets
      let seatCodesArr: string[] = []
      try { seatCodesArr = JSON.parse(tx.seatCodes) } catch { seatCodesArr = tx.seatCodes.split(',') }
      stat.ticketCount += seatCodesArr.length

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
    // Get all seats with price category info
    const seatsWithCategory = await db.seat.findMany({
      where: { status: 'SOLD' },
      select: {
        priceCategoryId: true,
        priceCategory: { select: { name: true, colorCode: true } },
      },
    })

    const categoryMap = new Map<string, { name: string; color: string; count: number }>()
    for (const seat of seatsWithCategory) {
      const catId = seat.priceCategoryId || 'unknown'
      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, {
          name: seat.priceCategory?.name || 'Lainnya',
          color: seat.priceCategory?.colorCode || '#8B8680',
          count: 0,
        })
      }
      categoryMap.get(catId)!.count++
    }

    // Calculate revenue per category by distributing total ticket revenue proportionally
    const totalSoldSeats = seatsWithCategory.length
    const categoryBreakdown = Array.from(categoryMap.entries()).map(([id, cat]) => {
      const proportion = totalSoldSeats > 0 ? cat.count / totalSoldSeats : 0
      return {
        id,
        name: cat.name,
        color: cat.color,
        count: cat.count,
        revenue: Math.round(totalTicketRevenue * proportion),
      }
    }).sort((a, b) => b.count - a.count)

    // ── Seat Status Summary (for conversion funnel) ──
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
        let seatCodesArr: string[] = []
        try { seatCodesArr = JSON.parse(tx.seatCodes) } catch { seatCodesArr = tx.seatCodes.split(',') }
        return {
          transactionId: tx.transactionId,
          customerName: tx.customerName,
          customerEmail: tx.customerEmail,
          totalAmount: tx.totalAmount,
          adminFeeApplied: tx.adminFeeApplied,
          seatCount: seatCodesArr.length,
          paymentMethod: tx.paymentMethod,
          paidAt: tx.paidAt?.toISOString(),
          eventId: tx.eventId,
          eventTitle: eventStats[tx.eventId]?.eventTitle || 'Unknown',
          checkedIn: !!tx.checkInTime,
        }
      })

    // ── Revenue by day (last 30 days) ──
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentPaid = paidTransactions.filter(
      (tx) => tx.paidAt && tx.paidAt >= thirtyDaysAgo
    )

    const revenueByDay: Record<string, { date: string; revenue: number; tickets: number; transactions: number }> = {}
    for (const tx of recentPaid) {
      if (!tx.paidAt) continue
      const dayKey = tx.paidAt.toISOString().slice(0, 10)
      if (!revenueByDay[dayKey]) {
        revenueByDay[dayKey] = { date: dayKey, revenue: 0, tickets: 0, transactions: 0 }
      }
      revenueByDay[dayKey].revenue += tx.totalAmount
      let seatCodesArr: string[] = []
      try { seatCodesArr = JSON.parse(tx.seatCodes) } catch { seatCodesArr = tx.seatCodes.split(',') }
      revenueByDay[dayKey].tickets += seatCodesArr.length
      revenueByDay[dayKey].transactions++
    }
    const revenueTimeline = Object.values(revenueByDay).sort((a, b) => a.date.localeCompare(b.date))

    // Cumulative revenue for area chart
    let cumulativeRevenue = 0
    const cumulativeTimeline = revenueTimeline.map(d => {
      cumulativeRevenue += d.revenue
      return { ...d, cumulativeRevenue }
    })

    // ── Payment method breakdown ──
    const paymentMethodStats: Record<string, { method: string; count: number; revenue: number }> = {}
    for (const tx of paidTransactions) {
      const method = tx.paymentMethod || 'UNKNOWN'
      if (!paymentMethodStats[method]) {
        paymentMethodStats[method] = { method, count: 0, revenue: 0 }
      }
      paymentMethodStats[method].count++
      paymentMethodStats[method].revenue += tx.totalAmount
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
