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
      },
    })

    const pendingCount = await db.transaction.count({ where: { paymentStatus: 'PENDING' } })
    const expiredCount = await db.transaction.count({ where: { paymentStatus: 'EXPIRED' } })
    const failedCount = await db.transaction.count({ where: { paymentStatus: 'FAILED' } })

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
      }
    }

    // Aggregate from paid transactions
    for (const tx of paidTransactions) {
      const stat = eventStats[tx.eventId]
      if (!stat) continue

      stat.transactionCount++

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
      // (This is the pure ticket price the customer paid for seats)
      const ticketRevenue = tx.totalAmount - adminFee - merchTotal
      stat.ticketRevenue += Math.max(ticketRevenue, 0)

      // Gross revenue = everything the customer paid
      stat.grossRevenue += tx.totalAmount

      // Net revenue = gross - admin fee (admin fee goes to payment gateway/platform)
      // The organizer keeps: ticket price + merch - admin fee
      stat.netRevenue += tx.totalAmount - adminFee
    }

    // ── Totals across all events ──
    const totalGrossRevenue = paidTransactions.reduce((sum, tx) => sum + tx.totalAmount, 0)
    const totalAdminFee = paidTransactions.reduce((sum, tx) => sum + (tx.adminFeeApplied || 0), 0)
    const totalTicketRevenue = Object.values(eventStats).reduce((sum, s) => sum + s.ticketRevenue, 0)
    const totalMerchRevenue = Object.values(eventStats).reduce((sum, s) => sum + s.merchRevenue, 0)
    const totalNetRevenue = totalGrossRevenue - totalAdminFee
    const totalTickets = Object.values(eventStats).reduce((sum, s) => sum + s.ticketCount, 0)

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
        }
      })

    // ── Revenue by day (last 30 days) ──
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentPaid = paidTransactions.filter(
      (tx) => tx.paidAt && tx.paidAt >= thirtyDaysAgo
    )

    const revenueByDay: Record<string, { date: string; revenue: number; tickets: number }> = {}
    for (const tx of recentPaid) {
      if (!tx.paidAt) continue
      const dayKey = tx.paidAt.toISOString().slice(0, 10) // YYYY-MM-DD
      if (!revenueByDay[dayKey]) {
        revenueByDay[dayKey] = { date: dayKey, revenue: 0, tickets: 0 }
      }
      revenueByDay[dayKey].revenue += tx.totalAmount
      let seatCodesArr: string[] = []
      try { seatCodesArr = JSON.parse(tx.seatCodes) } catch { seatCodesArr = tx.seatCodes.split(',') }
      revenueByDay[dayKey].tickets += seatCodesArr.length
    }
    const revenueTimeline = Object.values(revenueByDay).sort((a, b) => a.date.localeCompare(b.date))

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
      totalTickets,
      totalTicketRevenue,
      totalMerchRevenue,
      totalAdminFee,
      totalGrossRevenue,
      totalNetRevenue,

      // Per-event breakdown
      eventBreakdown: Object.values(eventStats).sort((a, b) => b.grossRevenue - a.grossRevenue),

      // Recent transactions
      recentTransactions: recentTxs,

      // Charts
      revenueTimeline,
      paymentMethodStats: Object.values(paymentMethodStats).sort((a, b) => b.revenue - a.revenue),
    })
  } catch (error) {
    console.error('[dashboard-stats] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard stats' }, { status: 500 })
  }
}
