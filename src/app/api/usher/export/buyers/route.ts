import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'
import * as XLSX from 'xlsx'
import {
  parseSeatCodes,
  isFestivalSeatCodes,
  computeEffectiveTicketCount,
} from '@/lib/festival-seats'

// GET /api/usher/export/buyers?eventId=xxx
// Exports buyer data as an XLSX spreadsheet
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }

    // Fetch event with show dates
    const event = await withDbRetry(() => db.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        category: true,
        location: true,
        showDate: true,
        showDates: {
          orderBy: { date: 'asc' },
          select: { id: true, date: true, label: true },
        },
      },
    }))

    if (!event) {
      return NextResponse.json({ error: 'Event tidak ditemukan' }, { status: 404 })
    }

    // Build show date lookup map
    const showDateMap = new Map<string, { date: Date; label: string | null }>()
    for (const sd of event.showDates) {
      showDateMap.set(sd.id, { date: new Date(sd.date), label: sd.label })
    }

    // Fetch all transactions for this event (only PAID — actual buyers)
    const transactions = await withDbRetry(() => db.transaction.findMany({
      where: {
        eventId,
        paymentStatus: 'PAID',
      },
      orderBy: { createdAt: 'asc' },
      select: {
        transactionId: true,
        customerName: true,
        customerEmail: true,
        customerWa: true,
        seatCodes: true,
        totalAmount: true,
        adminFeeApplied: true,
        paymentMethod: true,
        paidAt: true,
        checkInTime: true,
        createdAt: true,
        showDateId: true,
        merchandiseData: true,
        promoCodeId: true,
      },
    }))

    // Fetch price categories for this event
    const priceCategories = await withDbRetry(() => db.priceCategory.findMany({
      where: { eventId },
      select: { id: true, name: true, price: true },
    }))
    const priceCatMap = new Map(priceCategories.map(pc => [pc.id, pc]))

    // Fetch seats with price category info for this event
    const seats = await withDbRetry(() => db.seat.findMany({
      where: { eventId },
      select: {
        seatCode: true,
        zoneName: true,
        priceCategoryId: true,
        eventShowDateId: true,
        status: true,
      },
    }))
    // Build composite-key lookup so both regular (seatCode only) and festival (seatCode@dayId) transactions can resolve.
    // Key format: `${seatCode}|${dayId}` (dayId is empty for regular)
    const seatMap = new Map<string, { seatCode: string; zoneName: string | null; priceCategoryId: string | null; eventShowDateId: string | null; status: string }>()
    for (const s of seats) {
      seatMap.set(`${s.seatCode}|${s.eventShowDateId || ''}`, s as any)
      // Also index by seatCode only for backward compat (regular case)
      if (!s.eventShowDateId) {
        seatMap.set(`${s.seatCode}|`, s as any)
      }
    }

    // Helper to look up a seat by raw code (regular: 'A-1', festival: 'A-1@dayId')
    function lookupSeat(code: string) {
      if (code.includes('@')) {
        const [sc, did] = code.split('@')
        return seatMap.get(`${sc}|${did || ''}`) || null
      }
      return seatMap.get(`${code}|`) || null
    }

    // Helper: format date for display
    function formatDateTime(date: Date | null | undefined): string {
      if (!date) return '-'
      const d = new Date(date)
      return d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    }

    function formatDateShort(date: Date | null | undefined): string {
      if (!date) return '-'
      const d = new Date(date)
      return d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    }

    // Helper: translate payment status
    function translatePaymentStatus(status: string): string {
      const map: Record<string, string> = {
        PAID: 'Lunas',
        PENDING: 'Menunggu Pembayaran',
        EXPIRED: 'Kedaluwarsa',
        FAILED: 'Gagal',
        CANCELLED: 'Dibatalkan',
      }
      return map[status] || status
    }

    // Helper: translate payment method
    function translatePaymentMethod(method: string | null): string {
      if (!method) return '-'
      const map: Record<string, string> = {
        QRIS: 'QRIS',
        BCAVA: 'BCA Virtual Account',
        BRIVA: 'BRI Virtual Account',
        MANDIRIVA: 'Mandiri Virtual Account',
        BNIVA: 'BNI Virtual Account',
        OVO: 'OVO',
        DANA: 'DANA',
        SHOPEEPAY: 'ShopeePay',
        ALFAMART: 'Alfamart',
        INDOMARET: 'Indomaret',
        COMP: 'Komplimen / OTS',
      }
      return map[method] || method
    }

    // Helper: format currency
    function formatCurrency(amount: number): string {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount)
    }

    // Parse seatCodes from JSON
    function parseSeatCodes(raw: string | null): string[] {
      if (!raw) return []
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          return parsed.map((s: any) => String(s).trim()).filter(Boolean)
        }
        return String(raw).split(',').map(s => s.trim()).filter(Boolean)
      } catch {
        return String(raw).split(',').map(s => s.trim()).filter(Boolean)
      }
    }

    // Determine ticket type
    function getTicketType(txn: { transactionId: string; totalAmount: number; merchandiseData: string | null }): string {
      if (txn.transactionId.startsWith('COMP-')) return 'Komplimen / OTS'
      if (txn.merchandiseData && txn.merchandiseData !== '[]' && txn.merchandiseData !== 'null') return 'Tiket + Merchandise'
      return 'Reguler'
    }

    // Build spreadsheet rows
    const rows: Record<string, any>[] = []

    for (let i = 0; i < transactions.length; i++) {
      const txn = transactions[i]
      const seatCodes = parseSeatCodes(txn.seatCodes)
      const isFestival = isFestivalSeatCodes(seatCodes)
      const effectiveTicketCount = computeEffectiveTicketCount(seatCodes)

      // Look up seat details for zone & price category info (festival-aware)
      const seatDetails = seatCodes.map(code => {
        const seatInfo = lookupSeat(code)
        const priceCat = seatInfo?.priceCategoryId
          ? priceCatMap.get(seatInfo.priceCategoryId)
          : null
        return {
          code,
          zone: seatInfo?.zoneName || '-',
          category: priceCat?.name || '-',
          price: priceCat?.price || 0,
        }
      })

      // For festival passes, the displayed "Kode Kursi" should show the package name + day count,
      // not the raw seat entries (which are auto-generated GA seats per day)
      const seatCodesStr = isFestival
        ? `${seatDetails[0]?.category || 'Festival Pass'} × ${effectiveTicketCount} tiket (${seatCodes.length} seat entries across ${new Set(seatCodes.map(c => c.split('@')[1])).size} hari)`
        : (seatCodes.join(', ') || '-')
      const zoneNames = [...new Set(seatDetails.map(s => s.zone))].join(', ')
      const categoryNames = [...new Set(seatDetails.map(s => s.category))].join(', ')

      // Show date
      const showDateInfo = txn.showDateId ? showDateMap.get(txn.showDateId) : null
      const showDateStr = isFestival
        ? 'Semua Hari (Festival Pass)'
        : (showDateInfo
            ? formatDateShort(showDateInfo.date)
            : formatDateShort(event.showDate))

      // Is complimentary?
      const isComplimentary = txn.transactionId.startsWith('COMP-')

      rows.push({
        'No': i + 1,
        'Nama Pertunjukan': event.title,
        'Tanggal Pertunjukan': showDateStr,
        'Lokasi': event.location,
        'ID Transaksi': txn.transactionId,
        'Tipe Tiket': getTicketType(txn),
        'Nama Pembeli': txn.customerName,
        'Email': txn.customerEmail,
        'No. WhatsApp': txn.customerWa,
        'Kode Kursi': seatCodesStr,
        'Jumlah Tiket': effectiveTicketCount,
        'Zona': zoneNames,
        'Kategori': categoryNames,
        'Total Bayar': isComplimentary ? 'Komplimen' : formatCurrency(txn.totalAmount),
        'Biaya Admin': txn.adminFeeApplied > 0 ? formatCurrency(txn.adminFeeApplied) : '-',
        'Metode Pembayaran': isComplimentary ? 'Komplimen' : translatePaymentMethod(txn.paymentMethod),
        'Status Pembayaran': translatePaymentStatus('PAID'),
        'Status Check-In': txn.checkInTime ? 'Sudah Check-In' : 'Belum Check-In',
        'Waktu Check-In': txn.checkInTime ? formatDateTime(txn.checkInTime) : '-',
        'Tanggal Pembelian': formatDateTime(txn.paidAt || txn.createdAt),
      })
    }

    // Add summary section at the bottom
    const totalBuyers = transactions.length
    const totalTickets = transactions.reduce((sum, txn) => sum + computeEffectiveTicketCount(parseSeatCodes(txn.seatCodes)), 0)
    const totalCheckedIn = transactions.filter(txn => txn.checkInTime).length
    const totalRevenue = transactions.reduce((sum, txn) => {
      if (txn.transactionId.startsWith('COMP-')) return sum
      return sum + txn.totalAmount
    }, 0)
    const totalComplimentary = transactions.filter(txn => txn.transactionId.startsWith('COMP-')).length

    // Create workbook
    const wb = XLSX.utils.book_new()

    // ── Sheet 1: Data Pembeli ──
    const ws1 = XLSX.utils.json_to_sheet(rows)

    // Set column widths
    ws1['!cols'] = [
      { wch: 5 },   // No
      { wch: 30 },  // Nama Pertunjukan
      { wch: 22 },  // Tanggal Pertunjukan
      { wch: 25 },  // Lokasi
      { wch: 18 },  // ID Transaksi
      { wch: 18 },  // Tipe Tiket
      { wch: 25 },  // Nama Pembeli
      { wch: 30 },  // Email
      { wch: 18 },  // No. WhatsApp
      { wch: 30 },  // Kode Kursi
      { wch: 12 },  // Jumlah Tiket
      { wch: 15 },  // Zona
      { wch: 15 },  // Kategori
      { wch: 18 },  // Total Bayar
      { wch: 15 },  // Biaya Admin
      { wch: 20 },  // Metode Pembayaran
      { wch: 18 },  // Status Pembayaran
      { wch: 18 },  // Status Check-In
      { wch: 22 },  // Waktu Check-In
      { wch: 22 },  // Tanggal Pembelian
    ]

    XLSX.utils.book_append_sheet(wb, ws1, 'Data Pembeli')

    // ── Sheet 2: Ringkasan ──
    const summaryRows = [
      { 'Keterangan': 'Nama Pertunjukan', 'Nilai': event.title },
      { 'Keterangan': 'Kategori', 'Nilai': event.category },
      { 'Keterangan': 'Lokasi', 'Nilai': event.location },
      { 'Keterangan': 'Tanggal Pertunjukan', 'Nilai': formatDateShort(event.showDate) },
      { 'Keterangan': '', 'Nilai': '' },
      { 'Keterangan': 'Total Pembeli', 'Nilai': totalBuyers },
      { 'Keterangan': 'Total Tiket Terjual', 'Nilai': totalTickets },
      { 'Keterangan': 'Total Check-In', 'Nilai': totalCheckedIn },
      { 'Keterangan': 'Belum Check-In', 'Nilai': totalBuyers - totalCheckedIn },
      { 'Keterangan': '', 'Nilai': '' },
      { 'Keterangan': 'Total Pendapatan', 'Nilai': formatCurrency(totalRevenue) },
      { 'Keterangan': 'Tiket Komplimen', 'Nilai': totalComplimentary },
    ]

    // Add per-zone summary if GA
    // Get unique zones from seats
    const zones = [...new Set(seats.map(s => s.zoneName).filter(Boolean))] as string[]
    if (zones.length > 0) {
      summaryRows.push({ 'Keterangan': '', 'Nilai': '' })
      summaryRows.push({ 'Keterangan': '── Ringkasan Per Zona ──', 'Nilai': '' })

      for (const zone of zones) {
        const zoneSeats = seats.filter(s => s.zoneName === zone)
        const zoneSold = zoneSeats.filter((s: any) => s.status === 'SOLD' || s.status === 'INVITATION').length
        const zoneCheckedIn = zoneSeats.filter((s: any) => {
          // We'd need to cross-reference with transactions but this is approximate
          return s.status === 'SOLD' || s.status === 'INVITATION'
        }).length

        // Count tickets sold in this zone from transactions.
        // For festival transactions, each raw seat entry counts as 1 (one seat per day),
        // but we want the EFFECTIVE ticket count (1 festival pass = 1 ticket, not N×dayCount).
        // We attribute the effective ticket count to the zone of the first seat entry.
        let zoneTicketCount = 0
        for (const txn of transactions) {
          const codes = parseSeatCodes(txn.seatCodes)
          const isFestival = isFestivalSeatCodes(codes)
          if (isFestival) {
            // For festival: check the first seat's zone; if it matches, count as effectiveTicketCount
            const firstSeatInfo = codes.length > 0 ? lookupSeat(codes[0]) : null
            if (firstSeatInfo?.zoneName === zone) {
              zoneTicketCount += computeEffectiveTicketCount(codes)
            }
          } else {
            // Regular: count each seat matching the zone
            for (const code of codes) {
              const seatInfo = lookupSeat(code)
              if (seatInfo?.zoneName === zone) {
                zoneTicketCount++
              }
            }
          }
        }

        summaryRows.push({
          'Keterangan': `Zona: ${zone}`,
          'Nilai': `${zoneTicketCount} tiket terjual`
        })
      }
    }

    const ws2 = XLSX.utils.json_to_sheet(summaryRows)
    ws2['!cols'] = [
      { wch: 30 },
      { wch: 35 },
    ]
    XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan')

    // Generate XLSX buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // Build filename
    const safeTitle = event.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').substring(0, 50)
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `Data_Pembeli_${safeTitle}_${dateStr}.xlsx`

    // Return as downloadable file
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[export/buyers] Error:', error)
    return NextResponse.json(
      { error: 'Gagal mengekspor data pembeli', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
