'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Ticket, CreditCard, ChevronDown, ChevronUp } from 'lucide-react'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Bar, BarChart, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell,
  Area, AreaChart,
} from 'recharts'

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
  checkedIn: number
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
  totalGrossRevenue: number
  totalNetRevenue: number
  checkInStats: { checkedIn: number; notCheckedIn: number; total: number }
  categoryBreakdown: Array<{ id: string; name: string; color: string; count: number; revenue: number }>
  seatFunnel: { total: number; available: number; sold: number; invitation: number; locked: number; unavailable: number }
  cumulativeTimeline: Array<{ date: string; revenue: number; tickets: number; transactions: number; cumulativeRevenue: number }>
  eventBreakdown: EventBreakdown[]
  recentTransactions: any[]
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

const cumulativeChartConfig: ChartConfig = {
  cumulativeRevenue: { label: 'Pendapatan Kumulatif', color: '#C8A951' },
}

const categoryPieChartConfig: ChartConfig = {
  count: { label: 'Jumlah Tiket' },
}

interface DashboardChartsProps {
  data: DashboardData
  expandedEvent: string | null
  onToggleEvent: (eventId: string) => void
}

export function DashboardCharts({ data, expandedEvent, onToggleEvent }: DashboardChartsProps) {
  const ci = data.checkInStats || { checkedIn: 0, notCheckedIn: 0, total: 0 }
  const sf = data.seatFunnel || { total: 0, available: 0, sold: 0, invitation: 0, locked: 0, unavailable: 0 }
  const checkInPct = ci.total > 0 ? Math.round((ci.checkedIn / ci.total) * 100) : 0
  const soldPct = sf.total > 0 ? Math.round((sf.sold / sf.total) * 100) : 0
  const funnelSteps = [
    { label: 'Total Kursi', value: sf.total, color: '#1a1a2e' },
    { label: 'Terjual', value: sf.sold, color: '#C8A951' },
    { label: 'Check-In', value: ci.checkedIn, color: '#22c55e' },
  ]

  return (
    <>
      {/* ── Revenue Breakdown & Category Pie Chart ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Breakdown Mini Cards */}
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
                <Ticket className="w-4 h-4 text-purple-600" />
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
                <Ticket className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Biaya Admin</p>
                <p className="text-sm font-bold text-charcoal">{fmt(data.totalAdminFee)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ticket Category Pie Chart */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Ticket className="w-4 h-4 text-gold" />
              Distribusi Kategori Tiket
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {(data.categoryBreakdown || []).length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <ChartContainer config={categoryPieChartConfig} className="h-[180px] w-[180px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                    <Pie
                      data={data.categoryBreakdown || []}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      innerRadius={40}
                      strokeWidth={2}
                      stroke="#fff"
                    >
                      {(data.categoryBreakdown || []).map((cat, idx) => (
                        <Cell key={cat.id} fill={cat.color || '#8B8680'} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex-1 space-y-2 min-w-0">
                  {(data.categoryBreakdown || []).map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        <span className="text-xs font-medium text-charcoal truncate">{cat.name}</span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-semibold text-charcoal">{cat.count}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">({fmt(cat.revenue)})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
                Belum ada data kategori
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Check-In & Seat Funnel Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Check-In Progress Card */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                  <circle
                    cx="40" cy="40" r="34"
                    stroke="#C8A951"
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - checkInPct / 100)}`}
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-charcoal">{checkInPct}%</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-serif text-sm font-semibold text-charcoal">Check-In</p>
                <p className="text-lg font-bold text-charcoal mt-1">
                  {ci.checkedIn}<span className="text-sm font-normal text-muted-foreground">/{ci.total}</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {ci.notCheckedIn} belum check-in
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Seat Funnel Card */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="font-serif text-sm font-semibold text-charcoal mb-3">Konversi Kursi</p>
            <div className="space-y-2">
              {funnelSteps.map((step) => {
                const widthPct = sf.total > 0 ? Math.max((step.value / sf.total) * 100, 4) : 4
                return (
                  <div key={step.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-charcoal">{step.label}</span>
                      <span className="text-muted-foreground">{step.value}</span>
                    </div>
                    <div className="w-full h-3 bg-muted/50 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: step.color,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Tingkat konversi</span>
              <span className="font-semibold text-gold">{soldPct}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

        {/* Cumulative Revenue Area Chart */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-charcoal">Pendapatan Kumulatif</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {(data.cumulativeTimeline || []).length > 0 ? (
              <ChartContainer config={cumulativeChartConfig} className="h-[220px] w-full">
                <AreaChart data={data.cumulativeTimeline || []} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C8A951" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#C8A951" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
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
                  <Area
                    type="monotone"
                    dataKey="cumulativeRevenue"
                    stroke="#C8A951"
                    strokeWidth={2}
                    fill="url(#goldGradient)"
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                Belum ada data kumulatif
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
              <div className="space-y-3 max-h-[220px] overflow-y-auto">
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
              <Ticket className="w-4 h-4 text-gold" />
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
              Belum ada event.
            </div>
          ) : (
            <div className="space-y-2">
              {data.eventBreakdown.map((ev) => {
                const isExpanded = expandedEvent === ev.eventId
                return (
                  <div key={ev.eventId} className="border border-border/50 rounded-lg overflow-hidden">
                    <button
                      onClick={() => onToggleEvent(ev.eventId)}
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

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-border/30 bg-muted/10">
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
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
                          <div className="space-y-0.5">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Check-In</p>
                            <p className="text-sm font-semibold text-emerald-600">{ev.checkedIn || 0}</p>
                            <p className="text-[10px] text-muted-foreground">dari {ev.ticketCount} tiket</p>
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
    </>
  )
}
