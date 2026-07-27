import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  parseSeatCodes,
  isFestivalSeatCodes,
  computeEffectiveTicketCount,
} from '@/lib/festival-seats'

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
        eventMode: true,
        showDates: { select: { id: true, date: true, label: true, openGate: true }, orderBy: { date: 'asc' } },
        priceCategories: { select: { id: true, name: true, price: true, colorCode: true, packageType: true, applicableDayIds: true } },
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
        lastScanAt: true,
        lastScanShowDateId: true,
        manualValidityOverride: true,
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
    let festivalTicketCount = 0
    let festivalTransactionCount = 0
    let festivalGrossRevenue = 0

    // Per-show-date breakdown
    // For REGULAR transactions: attribute revenue to tx.showDateId.
    // For FESTIVAL transactions (showDateId=null, seatCodes contain '@'):
    //   do NOT attribute to any single day — track in a separate festivalPackageBreakdown.
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

    // Per-category breakdown — derived from TRANSACTIONS (not seats) so festival
    // packages don't inflate counts by N× (one seat per day per ticket).
    // We use computeEffectiveTicketCount to get the true ticket count per transaction.
    const seatsWithCategory = await db.seat.findMany({
      where: { eventId: id, status: 'SOLD' },
      select: {
        seatCode: true,
        eventShowDateId: true,
        priceCategoryId: true,
        priceCategory: { select: { name: true, price: true, colorCode: true } },
      },
    })
    // Build composite-key lookup: `${seatCode}|${dayId}` → priceCategoryId (festival) or `${seatCode}|` → priceCategoryId (regular)
    const seatPriceCatLookup = new Map<string, { id: string; name: string; price: number; color: string }>()
    for (const seat of seatsWithCategory) {
      const key = `${seat.seatCode}|${seat.eventShowDateId || ''}`
      seatPriceCatLookup.set(key, {
        id: seat.priceCategoryId || 'unknown',
        name: seat.priceCategory?.name || 'Lainnya',
        price: seat.priceCategory?.price || 0,
        color: seat.priceCategory?.colorCode || '#8B8680',
      })
    }
    const catRevenueMap: Record<string, { name: string; price: number; color: string; count: number; grossRevenue: number }> = {}

    // Festival package breakdown — for FESTIVAL events, shows sales by package type
    // (SINGLE / MULTI / FULL). One row per price category that is a festival package.
    const festivalPackageMap: Record<string, { packageType: string; packageName: string; daysCount: number; ticketCount: number; transactions: number; grossRevenue: number; adminFee: number; netRevenue: number }> = {}
    // Build a lookup from priceCategoryId → packageType + applicableDayIds
    const festivalPcLookup = new Map<string, { packageType: string; applicableDayIds: string[] }>()
    for (const pc of event.priceCategories) {
      if (pc.packageType) {
        let days: string[] = []
        if (pc.applicableDayIds) {
          try { days = JSON.parse(pc.applicableDayIds) } catch { /* ignore */ }
        } else if (pc.packageType === 'FULL') {
          days = event.showDates.map(sd => sd.id)
        }
        festivalPcLookup.set(pc.id, { packageType: pc.packageType, applicableDayIds: days })
      }
    }

    // Revenue by day
    const revenueByDay: Record<string, { date: string; gross: number; net: number; tickets: number }> = {}

    // Process each transaction
    const transactionList = paidTransactions.map(tx => {
      const seatCodesArr = parseSeatCodes(tx.seatCodes)
      const isFestival = isFestivalSeatCodes(seatCodesArr)
      const effectiveTicketCount = computeEffectiveTicketCount(seatCodesArr)

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
      totalTickets += effectiveTicketCount
      if (tx.checkInTime) checkedIn++

      // Festival-specific aggregation
      if (isFestival) {
        festivalTicketCount += effectiveTicketCount
        festivalTransactionCount++
        festivalGrossRevenue += tx.totalAmount

        // Look up the price category to find the package type
        const firstPair = seatCodesArr[0]?.split('@')
        if (firstPair && firstPair.length >= 2) {
          const seatInfo = seatPriceCatLookup.get(`${firstPair[0]}|${firstPair[1]}`)
          if (seatInfo) {
            const pcInfo = festivalPcLookup.get(seatInfo.id)
            if (pcInfo) {
              const key = seatInfo.id
              if (!festivalPackageMap[key]) {
                festivalPackageMap[key] = {
                  packageType: pcInfo.packageType,
                  packageName: seatInfo.name,
                  daysCount: pcInfo.applicableDayIds.length,
                  ticketCount: 0,
                  transactions: 0,
                  grossRevenue: 0,
                  adminFee: 0,
                  netRevenue: 0,
                }
              }
              festivalPackageMap[key].ticketCount += effectiveTicketCount
              festivalPackageMap[key].transactions++
              festivalPackageMap[key].grossRevenue += tx.totalAmount
              festivalPackageMap[key].adminFee += adminFee
              festivalPackageMap[key].netRevenue += tx.totalAmount - adminFee
            }
          }
        }
      } else {
        // Regular: attribute to per-day breakdown
        if (tx.showDateId && showDateMap[tx.showDateId]) {
          showDateMap[tx.showDateId].grossRevenue += tx.totalAmount
          showDateMap[tx.showDateId].adminFee += adminFee
          showDateMap[tx.showDateId].netRevenue += tx.totalAmount - adminFee
          showDateMap[tx.showDateId].ticketCount += effectiveTicketCount
          showDateMap[tx.showDateId].transactions++
        }
      }

      // Per category — find this transaction's price category from the first seat
      let txPriceCatId: string | null = null
      if (seatCodesArr.length > 0) {
        if (isFestival) {
          const [sc, did] = seatCodesArr[0].split('@')
          txPriceCatId = seatPriceCatLookup.get(`${sc}|${did || ''}`)?.id || null
        } else {
          txPriceCatId = seatPriceCatLookup.get(`${seatCodesArr[0]}|`)?.id || null
        }
      }
      if (txPriceCatId) {
        const seatInfo = seatPriceCatLookup.get(
          isFestival
            ? `${seatCodesArr[0].split('@')[0]}|${seatCodesArr[0].split('@')[1] || ''}`
            : `${seatCodesArr[0]}|`
        )
        const catName = seatInfo?.name || 'Lainnya'
        const catPrice = seatInfo?.price || 0
        const catColor = seatInfo?.color || '#8B8680'
        if (!catRevenueMap[txPriceCatId]) {
          catRevenueMap[txPriceCatId] = { name: catName, price: catPrice, color: catColor, count: 0, grossRevenue: 0 }
        }
        catRevenueMap[txPriceCatId].count += effectiveTicketCount
        catRevenueMap[txPriceCatId].grossRevenue += catPrice * effectiveTicketCount
      }

      // Per payment method
      const method = tx.paymentMethod || 'UNKNOWN'
      if (!methodMap[method]) methodMap[method] = { method, count: 0, grossRevenue: 0, adminFee: 0, netRevenue: 0 }
      methodMap[method].count++
      methodMap[method].grossRevenue += tx.totalAmount
      methodMap[method].adminFee += adminFee
      methodMap[method].netRevenue += tx.totalAmount - adminFee

      // Per day (by paidAt, not showDate)
      if (tx.paidAt) {
        const dayKey = tx.paidAt.toISOString().slice(0, 10)
        if (!revenueByDay[dayKey]) revenueByDay[dayKey] = { date: dayKey, gross: 0, net: 0, tickets: 0 }
        revenueByDay[dayKey].gross += tx.totalAmount
        revenueByDay[dayKey].net += tx.totalAmount - adminFee
        revenueByDay[dayKey].tickets += effectiveTicketCount
      }

      return {
        transactionId: tx.transactionId,
        customerName: tx.customerName,
        customerEmail: tx.customerEmail,
        seatCount: effectiveTicketCount,
        rawSeatCount: seatCodesArr.length,
        isFestival,
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

    // ── Festival-specific scan stats (for FESTIVAL events) ──
    // Count unique show dates that have been scanned at least once
    let festivalScannedDays = 0
    let festivalTotalScans = 0
    if (event.eventMode === 'FESTIVAL') {
      const scans = await db.ticketScan.findMany({
        where: { transaction: { eventId: id }, isValid: true },
        select: { showDateId: true, scanTime: true },
      })
      festivalTotalScans = scans.length
      const scannedDayIds = new Set(scans.map(s => s.showDateId).filter(Boolean) as string[])
      festivalScannedDays = scannedDayIds.size
    }

    // Compute festival admin fees from the per-package map (sum of all packages' adminFee)
    const festivalAdminFee = Object.values(festivalPackageMap).reduce((sum, p) => sum + p.adminFee, 0)
    const festivalNetRevenue = festivalGrossRevenue - festivalAdminFee

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
        eventMode: event.eventMode,
        adminFeeQris: event.adminFeeQris,
        adminFeeNonQris: event.adminFeeNonQris,
        showDates: event.showDates.map(sd => ({
          id: sd.id,
          date: sd.date.toISOString(),
          label: sd.label,
          openGate: sd.openGate?.toISOString() || null,
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
        // Festival-specific summary
        festivalTicketCount,
        festivalTransactionCount,
        festivalGrossRevenue,
        festivalNetRevenue,
        festivalAdminFee,
        festivalScannedDays,
        festivalTotalScans,
      },
      seatSummary,
      categoryBreakdown: Object.values(catRevenueMap).sort((a, b) => b.grossRevenue - a.grossRevenue),
      showDateBreakdown: Object.values(showDateMap),
      festivalPackageBreakdown: Object.values(festivalPackageMap).sort((a, b) => b.grossRevenue - a.grossRevenue),
      paymentMethodBreakdown: Object.values(methodMap).sort((a, b) => b.grossRevenue - a.grossRevenue),
      revenueTimeline: Object.values(revenueByDay).sort((a, b) => a.date.localeCompare(b.date)),
      transactions: transactionList,
    })
  } catch (error) {
    console.error('[finance-report] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch finance report' }, { status: 500 })
  }
}
