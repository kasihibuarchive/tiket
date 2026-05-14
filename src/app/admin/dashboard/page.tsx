'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Calendar, Plus, Ticket, TrendingUp, ArrowRight,
  Wallet, ShoppingBag, Receipt, CircleDollarSign,
  ChevronDown, ChevronUp, Clock, CreditCard, Users,
} from 'lucide-react'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Line, LineChart, ResponsiveContainer } from 'recharts'

// ── Types ──
interface EventBreakdown {
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
}

interface RecentTransaction {
  transactionId: string
  customerName: string
  customerEmail: string
  totalAmount: number
  adminFeeApplied: number
  seatCount: number
  paymentMethod: string | null
  paidAt: string | null
  eventId: string
  eventTitle: string
}

interface DashboardData {
  totalEvents: number
  publishedEvents: number
  totalTransactions: number
  pendingTransactions: number
  expiredTransactions: number
  failedTransactions: number
  totalTickets: number
  totalTicketRevenue: number
  totalMerchRevenue: number
  totalAdminFee: number
  totalGrossRevenue: number
  totalNetRevenue: number
  eventBreakdown: EventBreakdown[]
  recentTransactions: RecentTransaction[]
  revenueTimeline: { date: string; revenue: number; tickets: number }[]
  paymentMethodStats: { method: string; count: number; revenue: number }[]
}

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

const revenueChartConfig: ChartConfig = {
  revenue: { label: 'Pendapatan', color: '#C8A951' },
  tickets: { label: 'Tiket', color: '#1a1a2e' },
}

const methodChartConfig: ChartConfig = {
  revenue: { label: 'Pendapatan', color: '#C8A951' },
  count: { label: 'Jumlah', color: '#1a1a2e' },
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)

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

  const statCards = [
    { label: 'Pendapatan Kotor', value: fmt(data.totalGrossRevenue), icon: CircleDollarSign, color: 'text-gold', bg: 'bg-gold/10', sub: `${data.totalTransactions} transaksi` },
    { label: 'Pendapatan Bersih', value: fmt(data.totalNetRevenue), icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50', sub: 'Setelah biaya admin' },
    { label: 'Biaya Admin', value: fmt(data.totalAdminFee), icon: Receipt, color: 'text-orange-500', bg: 'bg-orange-50', sub: `${data.totalTickets} tiket terjual` },
    { label: 'Merchandise', value: fmt(data.totalMerchRevenue), icon: ShoppingBag, color: 'text-purple-600', bg: 'bg-purple-50', sub: 'Pendapatan merch' },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-charcoal">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Ringkasan keuangan & performa event Teateran</p>
        </div>
        <Link href="/admin/events">
          <Button className="bg-charcoal hover:bg-charcoal/90 text-gold">
            <Plus className="w-4 h-4 mr-2" />
            Buat Event
          </Button>
        </Link>
      </div>

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

      {/* ── Revenue Breakdown Mini ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-charcoal/5">
              <Ticket className="w-4 h-4 text-charcoal" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tiket</p>
              <p className="text-sm font-bold text-charcoal">{fmt(data.totalTicketRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-purple-50">
              <ShoppingBag className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Merchandise</p>
              <p className="text-sm font-bold text-charcoal">{fmt(data.totalMerchRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-orange-50">
              <Receipt className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Biaya Admin</p>
              <p className="text-sm font-bold text-charcoal">{fmt(data.totalAdminFee)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Transaction Status Counts ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Timeline */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-charcoal">Pendapatan 30 Hari Terakhir</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {data.revenueTimeline.length > 0 ? (
              <ChartContainer config={revenueChartConfig} className="h-[220px] w-full">
                <BarChart data={data.revenueTimeline} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                Belum ada data pendapatan
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Method Breakdown */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-charcoal">Metode Pembayaran</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {data.paymentMethodStats.length > 0 ? (
              <div className="space-y-3">
                {data.paymentMethodStats.map((pm) => {
                  const pct = data.totalGrossRevenue > 0 ? (pm.revenue / data.totalGrossRevenue) * 100 : 0
                  return (
                    <div key={pm.method} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-3 h-3 text-muted-foreground" />
                          <span className="font-medium text-charcoal">{PAYMENT_LABELS[pm.method] || pm.method}</span>
                          <span className="text-muted-foreground">({pm.count}x)</span>
                        </div>
                        <span className="font-semibold text-charcoal">{fmt(pm.revenue)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                Belum ada data pembayaran
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Per-Event Financial Breakdown ── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gold" />
              Rincian Keuangan Per Event
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              {data.eventBreakdown.length} event
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {data.eventBreakdown.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Belum ada event. <Link href="/admin/events" className="text-gold hover:underline">Buat event pertama</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {data.eventBreakdown.map((ev) => {
                const isExpanded = expandedEvent === ev.eventId
                return (
                  <div key={ev.eventId} className="border border-border/50 rounded-lg overflow-hidden">
                    {/* Collapsed Row */}
                    <button
                      onClick={() => setExpandedEvent(isExpanded ? null : ev.eventId)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ev.isPublished ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-charcoal truncate">{ev.eventTitle}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {ev.showDate ? new Date(ev.showDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date'}
                            {' · '}{ev.ticketCount} tiket · {ev.transactionCount} transaksi
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Kotor</p>
                          <p className="text-sm font-bold text-charcoal">{fmt(ev.grossRevenue)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-emerald-600">Bersih</p>
                          <p className="text-sm font-bold text-emerald-600">{fmt(ev.netRevenue)}</p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-border/30 bg-muted/10">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                          <div className="space-y-0.5">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tiket</p>
                            <p className="text-sm font-semibold text-charcoal">{fmt(ev.ticketRevenue)}</p>
                            <p className="text-[10px] text-muted-foreground">{ev.ticketCount} tiket terjual</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Merchandise</p>
                            <p className="text-sm font-semibold text-charcoal">{fmt(ev.merchRevenue)}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Biaya Admin</p>
                            <p className="text-sm font-semibold text-orange-500">{fmt(ev.adminFeeRevenue)}</p>
                            <p className="text-[10px] text-muted-foreground">Potongan dari bersih</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Transaksi</p>
                            <p className="text-sm font-semibold text-charcoal">{ev.transactionCount}</p>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-2 gap-3">
                          <div className="bg-white rounded-lg p-3 border border-border/30">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pendapatan Kotor</p>
                            <p className="text-base font-bold text-charcoal">{fmt(ev.grossRevenue)}</p>
                            <p className="text-[10px] text-muted-foreground">Total uang masuk</p>
                          </div>
                          <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200/30">
                            <p className="text-[10px] uppercase tracking-wider text-emerald-600 mb-1">Pendapatan Bersih</p>
                            <p className="text-base font-bold text-emerald-600">{fmt(ev.netRevenue)}</p>
                            <p className="text-[10px] text-emerald-500">Kotor − Biaya Admin</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Total</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Admin</th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Metode</th>
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
                      <td className="py-2 px-2 text-right font-semibold text-charcoal">{fmt(tx.totalAmount)}</td>
                      <td className="py-2 px-2 text-right text-orange-500">{fmt(tx.adminFeeApplied)}</td>
                      <td className="py-2 px-2">
                        <Badge variant="secondary" className="text-[9px]">
                          {PAYMENT_LABELS[tx.paymentMethod || ''] || tx.paymentMethod || '-'}
                        </Badge>
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
