'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Download, Printer, Ticket, Wallet, Receipt,
  ShoppingBag, MapPin, Calendar, CheckCircle2, Clock,
  TrendingUp, CircleDollarSign, Users, CreditCard,
} from 'lucide-react'

type ViewMode = 'gross' | 'net'

const fmt = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID')
const fmtDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
const fmtShortDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

const PAYMENT_LABELS: Record<string, string> = {
  QRIS: 'QRIS', BCAVA: 'BCA VA', BNIVA: 'BNI VA', BRIVA: 'BRI VA',
  MANDIRIVA: 'Mandiri VA', PERMATAVA: 'Permata VA', OVO: 'OVO',
  DANA: 'DANA', SHOPEEPAY: 'ShopeePay', ALFAMART: 'Alfamart',
  INDOMARET: 'Indomaret', UNKNOWN: 'Lainnya',
}

interface FinanceData {
  event: {
    id: string; title: string; category: string; showDate: string;
    location: string; posterUrl: string | null; isPublished: boolean;
    isCompleted: boolean; adminFeeQris: number; adminFeeNonQris: number;
    showDates: Array<{ id: string; date: string; label: string | null }>;
    priceCategories: Array<{ id: string; name: string; price: number; colorCode: string }>;
  }
  summary: {
    grossRevenue: number; adminFeeRevenue: number; merchRevenue: number;
    ticketRevenue: number; netRevenue: number; discountGiven: number;
    totalTickets: number; checkedIn: number; totalPaidTransactions: number;
    pendingCount: number; expiredCount: number; failedCount: number; cancelledCount: number;
    checkInRate: number; soldRate: number; adminFeePct: number;
  }
  seatSummary: { total: number; available: number; sold: number; invitation: number; locked: number; unavailable: number }
  categoryBreakdown: Array<{ name: string; price: number; color: string; count: number; grossRevenue: number }>
  showDateBreakdown: Array<{ label: string; date: string; grossRevenue: number; adminFee: number; netRevenue: number; ticketCount: number; transactions: number }>
  paymentMethodBreakdown: Array<{ method: string; count: number; grossRevenue: number; adminFee: number; netRevenue: number }>
  revenueTimeline: Array<{ date: string; gross: number; net: number; tickets: number }>
  transactions: Array<{
    transactionId: string; customerName: string; seatCount: number;
    seatCodes: string[]; totalAmount: number; adminFeeApplied: number;
    netAmount: number; merchTotal: number; paymentMethod: string | null;
    paidAt: string | null; checkedIn: boolean; promoCode: string | null;
    showDateId: string | null;
  }>
}

export default function EventFinancePage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string
  const printRef = useRef<HTMLDivElement>(null)

  const [data, setData] = useState<FinanceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('gross')

  useEffect(() => {
    async function fetchFinance() {
      try {
        const res = await fetch(`/api/admin/events/${eventId}/finance`)
        if (res.ok) setData(await res.json())
      } catch (err) {
        console.error('Failed to fetch finance:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchFinance()
  }, [eventId])

  const handleDownloadPDF = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow || !data) return

    const isNet = viewMode === 'net'
    const primaryRevenue = isNet ? data.summary.netRevenue : data.summary.grossRevenue
    const primaryLabel = isNet ? 'BERSIH' : 'KOTOR'

    const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Laporan Keuangan - ${data.event.title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; color: #1a1a2e; font-size: 11px; line-height: 1.5; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 3px solid #C8A951; padding-bottom: 16px; }
    .header h1 { font-size: 18px; font-weight: 700; color: #1a1a2e; }
    .header .subtitle { font-size: 10px; color: #666; margin-top: 4px; }
    .header .brand { text-align: right; }
    .header .brand-name { font-size: 14px; font-weight: 700; color: #C8A951; }
    .header .brand-sub { font-size: 9px; color: #999; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #1a1a2e; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    .stat-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
    .stat-box .label { font-size: 9px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
    .stat-box .value { font-size: 16px; font-weight: 700; color: #1a1a2e; margin-top: 2px; }
    .stat-box .sub { font-size: 8px; color: #aaa; margin-top: 2px; }
    .stat-box.net .value { color: #22c55e; }
    .stat-box.admin .value { color: #f97316; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
    th { background: #f9fafb; text-align: left; padding: 6px 8px; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #666; font-size: 9px; text-transform: uppercase; }
    td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
    tr:nth-child(even) { background: #fafbfc; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 8px; font-weight: 600; background: #f3f4f6; color: #666; }
    .badge-green { background: #ecfdf5; color: #22c55e; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 8px; color: #aaa; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${data.event.title}</h1>
      <div class="subtitle">${data.event.category} · ${fmtDate(data.event.showDate)} · ${data.event.location}</div>
    </div>
    <div class="brand">
      <div class="brand-name">TEATERAN</div>
      <div class="brand-sub">Laporan Keuangan ${primaryLabel}</div>
      <div class="brand-sub">Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
    </div>
  </div>

  <div class="stat-grid">
    <div class="stat-box">
      <div class="label">Pendapatan Kotor</div>
      <div class="value">${fmt(data.summary.grossRevenue)}</div>
      <div class="sub">${data.summary.totalPaidTransactions} transaksi</div>
    </div>
    ${!isNet ? `
    <div class="stat-box admin">
      <div class="label">Biaya Admin</div>
      <div class="value">${fmt(data.summary.adminFeeRevenue)}</div>
      <div class="sub">${data.summary.adminFeePct}% dari kotor</div>
    </div>` : ''}
    <div class="stat-box net">
      <div class="label">Pendapatan Bersih</div>
      <div class="value">${fmt(data.summary.netRevenue)}</div>
      <div class="sub">${data.summary.adminFeePct > 0 ? (100 - data.summary.adminFeePct).toFixed(1) : 100}% masuk rekening</div>
    </div>
    <div class="stat-box">
      <div class="label">Tiket Terjual</div>
      <div class="value">${data.summary.totalTickets}</div>
      <div class="sub">${data.summary.soldRate}% terjual</div>
    </div>
    <div class="stat-box">
      <div class="label">Merchandise</div>
      <div class="value">${fmt(data.summary.merchRevenue)}</div>
    </div>
  </div>

  ${data.categoryBreakdown.length > 0 ? `
  <div class="section">
    <div class="section-title">Rincian Per Kategori</div>
    <table>
      <thead>
        <tr>
          <th>Kategori</th>
          <th class="text-right">Harga</th>
          <th class="text-center">Terjual</th>
          <th class="text-right">Pendapatan Kotor</th>
          ${!isNet ? '<th class="text-right">Pendapatan Bersih</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${data.categoryBreakdown.map(cat => `
          <tr>
            <td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${cat.color};margin-right:6px;vertical-align:middle;"></span>${cat.name}</td>
            <td class="text-right">${fmt(cat.price)}</td>
            <td class="text-center">${cat.count}</td>
            <td class="text-right">${fmt(cat.grossRevenue)}</td>
            ${!isNet ? `<td class="text-right" style="color:#22c55e;">${fmt(cat.grossRevenue - (cat.grossRevenue * data.summary.adminFeeRevenue / data.summary.grossRevenue))}</td>` : ''}
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${data.showDateBreakdown.length > 1 ? `
  <div class="section">
    <div class="section-title">Rincian Per Hari</div>
    <table>
      <thead>
        <tr>
          <th>Hari</th>
          <th>Tanggal</th>
          <th class="text-center">Tiket</th>
          <th class="text-center">Transaksi</th>
          <th class="text-right">Kotor</th>
          <th class="text-right">Bersih</th>
        </tr>
      </thead>
      <tbody>
        ${data.showDateBreakdown.map(sd => `
          <tr>
            <td>${sd.label}</td>
            <td>${fmtShortDate(sd.date)}</td>
            <td class="text-center">${sd.ticketCount}</td>
            <td class="text-center">${sd.transactions}</td>
            <td class="text-right">${fmt(sd.grossRevenue)}</td>
            <td class="text-right" style="color:#22c55e;">${fmt(sd.netRevenue)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${data.paymentMethodBreakdown.length > 0 ? `
  <div class="section">
    <div class="section-title">Rincian Per Metode Pembayaran</div>
    <table>
      <thead>
        <tr>
          <th>Metode</th>
          <th class="text-center">Transaksi</th>
          <th class="text-right">Kotor</th>
          <th class="text-right">Admin</th>
          <th class="text-right">Bersih</th>
        </tr>
      </thead>
      <tbody>
        ${data.paymentMethodBreakdown.map(pm => `
          <tr>
            <td>${PAYMENT_LABELS[pm.method] || pm.method}</td>
            <td class="text-center">${pm.count}</td>
            <td class="text-right">${fmt(pm.grossRevenue)}</td>
            <td class="text-right" style="color:#f97316;">${fmt(pm.adminFee)}</td>
            <td class="text-right" style="color:#22c55e;">${fmt(pm.netRevenue)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <div class="section">
    <div class="section-title">Daftar Transaksi (${data.transactions.length})</div>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Pembeli</th>
          <th class="text-center">Tiket</th>
          <th class="text-right">Kotor</th>
          ${!isNet ? '<th class="text-right">Admin</th>' : ''}
          <th class="text-right">Bersih</th>
          <th>Metode</th>
          <th class="text-center">Check-In</th>
          <th>Tgl Bayar</th>
        </tr>
      </thead>
      <tbody>
        ${data.transactions.map(tx => `
          <tr>
            <td style="font-family:monospace;font-size:9px;">${tx.transactionId}</td>
            <td>${tx.customerName}</td>
            <td class="text-center">${tx.seatCount}</td>
            <td class="text-right">${fmt(tx.totalAmount)}</td>
            ${!isNet ? `<td class="text-right" style="color:#f97316;">${fmt(tx.adminFeeApplied)}</td>` : ''}
            <td class="text-right" style="color:#22c55e;">${fmt(tx.netAmount)}</td>
            <td><span class="badge">${PAYMENT_LABELS[tx.paymentMethod || ''] || tx.paymentMethod || '-'}</span></td>
            <td class="text-center">${tx.checkedIn ? '<span class="badge badge-green">✓</span>' : '✗'}</td>
            <td>${tx.paidAt ? fmtShortDate(tx.paidAt) : '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <span>Laporan ini dihasilkan secara otomatis oleh Teateran · ${new Date().toLocaleDateString('id-ID')}</span>
    <span>Halaman 1 dari 1</span>
  </div>
</body>
</html>`

    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.print()
    }, 500)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded w-64 animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Gagal memuat data keuangan</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">Kembali</Button>
      </div>
    )
  }

  const isNet = viewMode === 'net'
  const s = data.summary

  return (
    <div ref={printRef} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Kembali
          </Button>
          <div>
            <h1 className="font-serif text-xl font-bold text-charcoal">{data.event.title}</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
              <Calendar className="w-3 h-3" /> {fmtDate(data.event.showDate)}
              <MapPin className="w-3 h-3 ml-1" /> {data.event.location}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Kotor / Bersih Toggle */}
          <div className="flex items-center bg-muted rounded-full p-1 border border-border/50">
            <button
              onClick={() => setViewMode('gross')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                viewMode === 'gross' ? 'bg-charcoal text-gold shadow-sm' : 'text-muted-foreground hover:text-charcoal'
              }`}
            >
              Kotor
            </button>
            <button
              onClick={() => setViewMode('net')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                viewMode === 'net' ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:text-charcoal'
              }`}
            >
              Bersih
            </button>
          </div>
          <Button onClick={handleDownloadPDF} className="bg-charcoal hover:bg-charcoal/90 text-gold" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Mode indicator */}
      {isNet && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/50 rounded-lg px-4 py-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <p className="text-xs text-emerald-700">
            <span className="font-semibold">Mode Bersih</span> — Pendapatan setelah biaya admin dipotong. Biaya admin disembunyikan karena sudah tidak relevan.
          </p>
        </div>
      )}
      {!isNet && (
        <div className="flex items-center gap-2 bg-gold/5 border border-gold/20 rounded-lg px-4 py-2">
          <CircleDollarSign className="w-4 h-4 text-gold" />
          <p className="text-xs text-charcoal/70">
            <span className="font-semibold text-charcoal">Mode Kotor</span> — Total uang masuk. Kolom Bersih ditampilkan untuk perbandingan.
          </p>
        </div>
      )}

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CircleDollarSign className="w-4 h-4 text-gold" />
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Kotor</p>
            </div>
            <p className="text-lg font-bold text-charcoal">{fmt(s.grossRevenue)}</p>
            <p className="text-[10px] text-muted-foreground">{s.totalPaidTransactions} transaksi</p>
          </CardContent>
        </Card>

        {!isNet && (
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="w-4 h-4 text-orange-500" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Biaya Admin</p>
              </div>
              <p className="text-lg font-bold text-orange-500">{fmt(s.adminFeeRevenue)}</p>
              <p className="text-[10px] text-orange-400">{s.adminFeePct}% dari kotor</p>
            </CardContent>
          </Card>
        )}

        <Card className={`border-border/50 ${isNet ? 'ring-1 ring-emerald-200' : ''}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <p className="text-[10px] uppercase tracking-wider text-emerald-600">Bersih</p>
            </div>
            <p className="text-lg font-bold text-emerald-600">{fmt(s.netRevenue)}</p>
            <p className="text-[10px] text-emerald-500">{s.adminFeePct > 0 ? (100 - s.adminFeePct).toFixed(1) : 100}% masuk rekening</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Ticket className="w-4 h-4 text-charcoal" />
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tiket</p>
            </div>
            <p className="text-lg font-bold text-charcoal">{s.totalTickets}</p>
            <p className="text-[10px] text-muted-foreground">{s.soldRate}% terjual · {s.checkedIn} check-in</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag className="w-4 h-4 text-purple-600" />
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Merch</p>
            </div>
            <p className="text-lg font-bold text-charcoal">{fmt(s.merchRevenue)}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-charcoal" />
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Diskon</p>
            </div>
            <p className="text-lg font-bold text-blue-500">{fmt(s.discountGiven)}</p>
            <p className="text-[10px] text-blue-400">dari promo code</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Transaction Status ── */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-emerald-600 font-semibold">{s.totalPaidTransactions} Dibayar</span>
        {s.pendingCount > 0 && <span className="text-yellow-600">{s.pendingCount} Pending</span>}
        {s.expiredCount > 0 && <span className="text-gray-500">{s.expiredCount} Expired</span>}
        {s.failedCount > 0 && <span className="text-red-500">{s.failedCount} Gagal</span>}
        {s.cancelledCount > 0 && <span className="text-slate-500">{s.cancelledCount} Dibatalkan</span>}
        <span className="text-muted-foreground">· Check-in {s.checkInRate}%</span>
      </div>

      {/* ── Category Breakdown ── */}
      {data.categoryBreakdown.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Ticket className="w-4 h-4 text-gold" />
              Rincian Per Kategori
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Kategori</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Harga</th>
                    <th className="text-center py-2 px-2 text-muted-foreground font-medium">Terjual</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Kotor</th>
                    {!isNet && <th className="text-right py-2 px-2 text-muted-foreground font-medium">Bersih</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.categoryBreakdown.map((cat, idx) => {
                    const catNet = data.summary.grossRevenue > 0
                      ? cat.grossRevenue - (cat.grossRevenue * data.summary.adminFeeRevenue / data.summary.grossRevenue)
                      : cat.grossRevenue
                    return (
                      <tr key={idx} className="border-b border-border/20">
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }} />
                            <span className="font-medium text-charcoal">{cat.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right text-charcoal">{fmt(cat.price)}</td>
                        <td className="py-2 px-2 text-center text-charcoal">{cat.count}</td>
                        <td className="py-2 px-2 text-right font-semibold text-charcoal">{fmt(cat.grossRevenue)}</td>
                        {!isNet && <td className="py-2 px-2 text-right font-semibold text-emerald-600">{fmt(catNet)}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Multi-Day Breakdown ── */}
      {data.showDateBreakdown.length > 1 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gold" />
              Rincian Per Hari
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Hari</th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Tanggal</th>
                    <th className="text-center py-2 px-2 text-muted-foreground font-medium">Tiket</th>
                    <th className="text-center py-2 px-2 text-muted-foreground font-medium">Transaksi</th>
                    {!isNet && <th className="text-right py-2 px-2 text-muted-foreground font-medium">Kotor</th>}
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Bersih</th>
                  </tr>
                </thead>
                <tbody>
                  {data.showDateBreakdown.map((sd, idx) => (
                    <tr key={idx} className="border-b border-border/20">
                      <td className="py-2 px-2 font-medium text-charcoal">{sd.label}</td>
                      <td className="py-2 px-2 text-muted-foreground">{fmtShortDate(sd.date)}</td>
                      <td className="py-2 px-2 text-center text-charcoal">{sd.ticketCount}</td>
                      <td className="py-2 px-2 text-center text-charcoal">{sd.transactions}</td>
                      {!isNet && <td className="py-2 px-2 text-right font-semibold text-charcoal">{fmt(sd.grossRevenue)}</td>}
                      <td className="py-2 px-2 text-right font-semibold text-emerald-600">{fmt(sd.netRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Payment Method Breakdown ── */}
      {data.paymentMethodBreakdown.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-gold" />
              Rincian Per Metode Pembayaran
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Metode</th>
                    <th className="text-center py-2 px-2 text-muted-foreground font-medium">Transaksi</th>
                    {!isNet && <th className="text-right py-2 px-2 text-muted-foreground font-medium">Kotor</th>}
                    {!isNet && <th className="text-right py-2 px-2 text-muted-foreground font-medium">Admin</th>}
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Bersih</th>
                  </tr>
                </thead>
                <tbody>
                  {data.paymentMethodBreakdown.map((pm, idx) => (
                    <tr key={idx} className="border-b border-border/20">
                      <td className="py-2 px-2 font-medium text-charcoal">{PAYMENT_LABELS[pm.method] || pm.method}</td>
                      <td className="py-2 px-2 text-center text-charcoal">{pm.count}</td>
                      {!isNet && <td className="py-2 px-2 text-right font-semibold text-charcoal">{fmt(pm.grossRevenue)}</td>}
                      {!isNet && <td className="py-2 px-2 text-right text-orange-500">{fmt(pm.adminFee)}</td>}
                      <td className="py-2 px-2 text-right font-semibold text-emerald-600">{fmt(pm.netRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── All Transactions ── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Clock className="w-4 h-4 text-gold" />
              Semua Transaksi
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]">{data.transactions.length} transaksi</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">ID</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Pembeli</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-medium">Tiket</th>
                  {!isNet && <th className="text-right py-2 px-2 text-muted-foreground font-medium">Kotor</th>}
                  {!isNet && <th className="text-right py-2 px-2 text-muted-foreground font-medium">Admin</th>}
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">Bersih</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Metode</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Promo</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-medium">Check-In</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">Tgl Bayar</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx) => (
                  <tr key={tx.transactionId} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="py-2 px-2 font-mono text-[10px] text-charcoal">{tx.transactionId}</td>
                    <td className="py-2 px-2 text-charcoal">{tx.customerName}</td>
                    <td className="py-2 px-2 text-center text-charcoal">{tx.seatCount}</td>
                    {!isNet && <td className="py-2 px-2 text-right font-semibold text-charcoal">{fmt(tx.totalAmount)}</td>}
                    {!isNet && <td className="py-2 px-2 text-right text-orange-500">{fmt(tx.adminFeeApplied)}</td>}
                    <td className="py-2 px-2 text-right font-semibold text-emerald-600">{fmt(tx.netAmount)}</td>
                    <td className="py-2 px-2">
                      <Badge variant="secondary" className="text-[9px]">
                        {PAYMENT_LABELS[tx.paymentMethod || ''] || tx.paymentMethod || '-'}
                      </Badge>
                    </td>
                    <td className="py-2 px-2 text-muted-foreground">{tx.promoCode || '-'}</td>
                    <td className="py-2 px-2 text-center">
                      {tx.checkedIn ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : <span className="text-muted-foreground">✗</span>}
                    </td>
                    <td className="py-2 px-2 text-right text-muted-foreground">
                      {tx.paidAt ? fmtShortDate(tx.paidAt) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
