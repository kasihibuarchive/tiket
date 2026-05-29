'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Calendar, Plus, Ticket, ArrowRight,
  Wallet, ShoppingBag, Receipt, CircleDollarSign,
  Clock, CreditCard, TrendingDown, TrendingUp,
} from 'lucide-react'

// Load chart components dynamically with ssr: false to avoid recharts
// circular dependency TDZ error ("Cannot access 'K' before initialization")
const DashboardCharts = dynamic(
  () => import('@/components/admin/dashboard-charts').then(mod => ({ default: mod.DashboardCharts })),
  { ssr: false, loading: () => <div className="h-[400px] flex items-center justify-center text-sm text-muted-foreground animate-pulse">Memuat grafik...</div> }
)

// ── Types ──
interface RecentTransaction {
  transactionId: string
  customerName: string
  customerEmail: string
  totalAmount: number
  adminFeeApplied: number
  netAmount: number
  seatCount: number
  paymentMethod: string | null
  paidAt: string | null
  eventId: string
  eventTitle: string
  checkedIn: boolean
}

interface DashboardData {
  totalEvents: number
  publishedEvents: number
  totalTransactions: number
  pendingTransactions: number
  expiredTransactions: number
  failedTransactions: number
  cancelledTransactions: number
  totalTickets: number
  totalTicketRevenue: number
  totalMerchRevenue: number
  totalAdminFee: number
  totalDiscountGiven: number
  totalGrossRevenue: number
  totalNetRevenue: number
  checkInStats: { checkedIn: number; notCheckedIn: number; total: number }
  categoryBreakdown: Array<{ id: string; name: string; color: string; count: number; revenue: number; netRevenue: number }>
  seatFunnel: { total: number; available: number; sold: number; invitation: number; locked: number; unavailable: number }
  cumulativeTimeline: Array<{ date: string; revenue: number; netRevenue: number; tickets: number; transactions: number; cumulativeRevenue: number; cumulativeNetRevenue: number }>
  eventBreakdown: any[]
  recentTransactions: RecentTransaction[]
  revenueTimeline: { date: string; revenue: number; netRevenue: number; tickets: number }[]
  paymentMethodStats: { method: string; count: number; revenue: number; netRevenue: number }[]
}

type ViewMode = 'gross' | 'net'

const fmt = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID')

const PAYMENT_LABELS: Record<string, string> = {
  QRIS: 'QRIS',
  BCAVA: 'BCA VA',
  BNIVA: 'BNI VA',
  BRIVA: 'BRI VA',
  MANDIRIVA: 'Mandiri VA',
  PERMATAVA: 'Permata VA',
  OVO: 'OVO',
  DANA: 'DANA',
  SHOPEEPAY: 'ShopeePay',
  ALFAMART: 'Alfamart',
  INDOMARET: 'Indomaret',
  UNKNOWN: 'Lainnya',
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('gross')

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/dashboard/stats')
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchStats()
  }, [])

  if (isLoading || !data) {
    return (
      <div className="space-y-8">
        <h1 className="font-serif text-2xl font-bold text-charcoal">Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="border-border/50 animate-pulse">
              <CardContent className="p-4">
                <div className="h-12 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const isNet = viewMode === 'net'

  const statCards = [
    {
      label: isNet ? 'Pendapatan Bersih' : 'Pendapatan Kotor',
      value: fmt(isNet ? data.totalNetRevenue : data.totalGrossRevenue),
      icon: isNet ? TrendingUp : CircleDollarSign,
      color: isNet ? 'text-emerald-600' : 'text-gold',
      bg: isNet ? 'bg-emerald-50' : 'bg-gold/10',
      sub: isNet ? 'Setelah biaya admin' : `${data.totalTransactions} transaksi`,
    },
    {
      label: isNet ? 'Tiket (Bersih)' : 'Tiket (Kotor)',
      value: fmt(isNet ? data.totalTicketRevenue : data.totalTicketRevenue),
      icon: Ticket,
      color: 'text-charcoal',
      bg: 'bg-charcoal/5',
      sub: `${data.totalTickets} tiket terjual`,
    },
    {
      label: 'Biaya Admin',
      value: fmt(data.totalAdminFee),
      icon: Receipt,
      color: 'text-orange-500',
      bg: 'bg-orange-50',
      sub: isNet ? 'Dipotong dari kotor' : 'Potongan ke bersih',
    },
    {
      label: 'Merchandise',
      value: fmt(data.totalMerchRevenue),
      icon: ShoppingBag,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      sub: 'Pendapatan merch',
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-charcoal">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Ringkasan keuangan & performa event Teateran</p>
        </div>
        <div className="flex items-center gap-3">
          {/* ── Kotor / Bersih Toggle ── */}
          <div className="flex items-center bg-muted rounded-full p-1 border border-border/50">
            <button
              onClick={() => setViewMode('gross')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                viewMode === 'gross'
                  ? 'bg-charcoal text-gold shadow-sm'
                  : 'text-muted-foreground hover:text-charcoal'
              }`}
            >
              Kotor
            </button>
            <button
              onClick={() => setViewMode('net')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                viewMode === 'net'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-charcoal'
              }`}
            >
              Bersih
            </button>
          </div>
          <Link href="/admin/events">
            <Button className="bg-charcoal hover:bg-charcoal/90 text-gold">
              <Plus className="w-4 h-4 mr-2" />
              Buat Event
            </Button>
          </Link>
        </div>
      </div>

      {/* ── View Mode Indicator ── */}
      {isNet && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/50 rounded-lg px-4 py-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <p className="text-xs text-emerald-700">
            <span className="font-semibold">Mode Bersih</span> — Pendapatan setelah dipotong biaya admin gateway pembayaran. Angka ini yang masuk ke rekeningmu.
          </p>
        </div>
      )}
      {!isNet && (
        <div className="flex items-center gap-2 bg-gold/5 border border-gold/20 rounded-lg px-4 py-2">
          <CircleDollarSign className="w-4 h-4 text-gold" />
          <p className="text-xs text-charcoal/70">
            <span className="font-semibold text-charcoal">Mode Kotor</span> — Total uang masuk sebelum dipotong biaya admin. Angka ini yang terlihat oleh pembeli.
          </p>
        </div>
      )}

      {/* ── Summary Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.bg}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-bold text-charcoal truncate">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.sub}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Transaction Status Counts ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">Dibayar:</span>
          <span className="font-semibold text-charcoal">{data.totalTransactions}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-muted-foreground">Pending:</span>
          <span className="font-semibold text-charcoal">{data.pendingTransactions}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-muted-foreground">Expired:</span>
          <span className="font-semibold text-charcoal">{data.expiredTransactions}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-muted-foreground">Gagal:</span>
          <span className="font-semibold text-charcoal">{data.failedTransactions}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-slate-500" />
          <span className="text-muted-foreground">Dibatalkan:</span>
          <span className="font-semibold text-charcoal">{data.cancelledTransactions || 0}</span>
        </div>
      </div>

      {/* ── All Charts ── */}
      <DashboardCharts
        data={data}
        expandedEvent={expandedEvent}
        onToggleEvent={(eventId) => setExpandedEvent(expandedEvent === eventId ? null : eventId)}
        viewMode={viewMode}
      />

      {/* ── Recent Transactions ── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Clock className="w-4 h-4 text-gold" />
              Transaksi Terakhir
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]">10 terbaru</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {data.recentTransactions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Belum ada transaksi
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">TRX</th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Event</th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Pembeli</th>
                    <th className="text-center py-2 px-2 text-muted-foreground font-medium">Tiket</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">{isNet ? 'Bersih' : 'Total'}</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Admin</th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Metode</th>
                    <th className="text-center py-2 px-2 text-muted-foreground font-medium">Check-In</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Tgl Bayar</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentTransactions.map((tx) => (
                    <tr key={tx.transactionId} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="py-2 px-2 font-mono text-charcoal">{tx.transactionId}</td>
                      <td className="py-2 px-2 text-charcoal max-w-[120px] truncate">{tx.eventTitle}</td>
                      <td className="py-2 px-2 text-charcoal">{tx.customerName}</td>
                      <td className="py-2 px-2 text-center text-charcoal">{tx.seatCount}</td>
                      <td className={`py-2 px-2 text-right font-semibold ${isNet ? 'text-emerald-600' : 'text-charcoal'}`}>
                        {fmt(isNet ? tx.netAmount : tx.totalAmount)}
                      </td>
                      <td className="py-2 px-2 text-right text-orange-500">{fmt(tx.adminFeeApplied)}</td>
                      <td className="py-2 px-2">
                        <Badge variant="secondary" className="text-[9px]">
                          {PAYMENT_LABELS[tx.paymentMethod || ''] || tx.paymentMethod || '-'}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-center">
                        {tx.checkedIn ? (
                          <span className="text-emerald-500 font-bold">✓</span>
                        ) : (
                          <span className="text-muted-foreground">✗</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-muted-foreground">
                        {tx.paidAt ? new Date(tx.paidAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-border/50 hover:border-gold/30 transition-colors cursor-pointer group relative">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif text-base font-semibold text-charcoal">Manage Events</h3>
                <p className="text-xs text-muted-foreground mt-1">Create, edit, and publish events</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-gold transition-colors" />
            </div>
          </CardContent>
          <Link href="/admin/events" className="absolute inset-0" />
        </Card>

        <Card className="border-border/50 hover:border-gold/30 transition-colors cursor-pointer group relative">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif text-base font-semibold text-charcoal">Seat Map Editor</h3>
                <p className="text-xs text-muted-foreground mt-1">Customize seat layout and pricing</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-gold transition-colors" />
            </div>
          </CardContent>
          <Link href="/admin/seat-maps" className="absolute inset-0" />
        </Card>

        <Card className="border-border/50 hover:border-gold/30 transition-colors cursor-pointer group relative">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif text-base font-semibold text-charcoal">Email Templates</h3>
                <p className="text-xs text-muted-foreground mt-1">Edit E-Ticket email templates</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-gold transition-colors" />
            </div>
          </CardContent>
          <Link href="/admin/email-template" className="absolute inset-0" />
        </Card>
      </div>
    </div>
  )
}
