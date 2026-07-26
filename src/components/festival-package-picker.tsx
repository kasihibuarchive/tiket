'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Ticket, Calendar, Users, Crown, Star, Minus, Plus, Loader2, AlertTriangle,
  CheckCircle2, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ShowDateData {
  id: string
  date: string
  openGate: string | null
  label: string | null
}

interface PriceCategoryData {
  id: string
  name: string
  price: number
  colorCode: string
  packageType?: string | null   // SINGLE | MULTI | FULL
  applicableDayIds?: string | null  // JSON array of showDate IDs
}

interface FestivalPackagePickerProps {
  eventId: string
  priceCategories: PriceCategoryData[]
  showDates: ShowDateData[]
  onProceedToCheckout: (data: {
    priceCategory: PriceCategoryData
    quantity: number
    applicableDayIds: string[]
  }) => void
}

// Format date for display: "Sen, 12 Jun · 19:30"
function formatDay(d: string) {
  const date = new Date(d)
  return {
    weekday: date.toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'Asia/Jakarta' }),
    dayMonth: date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }),
    time: date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }),
    label: date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' }),
  }
}

export function FestivalPackagePicker({
  eventId,
  priceCategories,
  showDates,
  onProceedToCheckout,
}: FestivalPackagePickerProps) {
  // Filter to only categories with packageType (festival packages)
  const packages = useMemo(() => {
    return priceCategories
      .filter(pc => pc.packageType)
      .map(pc => {
        let applicableDays: string[] = []
        try {
          if (pc.applicableDayIds) {
            applicableDays = JSON.parse(pc.applicableDayIds)
          } else if (pc.packageType === 'FULL') {
            // FULL = all days
            applicableDays = showDates.map(sd => sd.id)
          }
        } catch { /* ignore */ }
        return { ...pc, parsedDayIds: applicableDays }
      })
      .sort((a, b) => {
        // Sort: SINGLE first, then MULTI, then FULL
        const order = { SINGLE: 1, MULTI: 2, FULL: 3 }
        return (order[a.packageType as keyof typeof order] || 99) - (order[b.packageType as keyof typeof order] || 99)
      })
  }, [priceCategories, showDates])

  // Selected package + quantity state
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)

  // Wrapper to switch packages — resets quantity to 1 atomically
  function selectPackage(pkgId: string) {
    if (selectedPkgId !== pkgId) {
      setSelectedPkgId(pkgId)
      setQuantity(1)
    }
  }

  const selectedPkg = packages.find(p => p.id === selectedPkgId) || null

  // Fetch availability per package (count AVAILABLE seats across the package's applicable days)
  const [availability, setAvailability] = useState<Record<string, number>>({})
  useEffect(() => {
    async function fetchAvailability() {
      try {
        // Fetch seats grouped by zone name (= price category name) — only AVAILABLE
        const res = await fetch(`/api/events/${eventId}/seats?admin=1`)
        if (!res.ok) return
        const data = await res.json()
        const seats = data.seats || []
        // For each package, count available seats in its zone (matched by priceCategoryName)
        const avail: Record<string, number> = {}
        for (const pkg of packages) {
          // Match by zone name (= price category name in our auto-built GA config)
          const matching = seats.filter((s: any) =>
            s.zoneName === pkg.name &&
            s.status === 'AVAILABLE' &&
            pkg.parsedDayIds.includes(s.eventShowDateId)
          )
          // Capacity per day = min available across applicable days
          // (each ticket covers all applicable days, so limit is the day with lowest availability)
          if (pkg.parsedDayIds.length > 0) {
            const perDayCounts = pkg.parsedDayIds.map(dayId =>
              matching.filter((s: any) => s.eventShowDateId === dayId).length
            )
            avail[pkg.id] = Math.min(...perDayCounts)
          } else {
            avail[pkg.id] = matching.length
          }
        }
        setAvailability(avail)
      } catch (err) {
        console.error('[festival-picker] Availability fetch error:', err)
      }
    }
    if (packages.length > 0) fetchAvailability()
  }, [eventId, packages])

  const packageIcon = (pkgType: string | null | undefined) => {
    if (pkgType === 'FULL') return Crown
    if (pkgType === 'MULTI') return Star
    return Ticket
  }

  const packageLabel = (pkgType: string | null | undefined) => {
    if (pkgType === 'FULL') return 'Full Pass'
    if (pkgType === 'MULTI') return 'Multi-Day Pass'
    return 'Single Day'
  }

  const handleProceed = () => {
    if (!selectedPkg) return
    onProceedToCheckout({
      priceCategory: selectedPkg,
      quantity,
      applicableDayIds: selectedPkg.parsedDayIds,
    })
  }

  if (packages.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <p className="text-charcoal font-medium">Belum ada paket tiket untuk festival ini.</p>
        <p className="text-sm text-muted-foreground mt-1">Hubungi admin untuk informasi tiket.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header hint */}
      <div className="text-center mb-2">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold/10 border border-gold/30">
          <Sparkles className="w-3.5 h-3.5 text-gold" />
          <span className="text-xs font-medium text-gold tracking-wide">🎪 FESTIVAL MODE — Multi-Day Pass</span>
        </div>
        <p className="text-sm text-muted-foreground mt-3 max-w-xl mx-auto">
          Pilih paket sesuai kebutuhan Anda. 1 QR berlaku untuk semua hari yang tercantum di paket.
          Tiket bisa di-scan ulang setelah cooldown (anti-share tiket).
        </p>
      </div>

      {/* Package cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {packages.map((pkg) => {
          const Icon = packageIcon(pkg.packageType)
          const isSelected = selectedPkgId === pkg.id
          const avail = availability[pkg.id] ?? 0
          const isSoldOut = avail === 0
          const days = pkg.parsedDayIds
            .map(id => showDates.find(sd => sd.id === id))
            .filter(Boolean) as ShowDateData[]

          return (
            <Card
              key={pkg.id}
              className={cn(
                'relative cursor-pointer transition-all border-2 overflow-hidden',
                isSelected
                  ? 'border-gold shadow-lg ring-2 ring-gold/20'
                  : 'border-border hover:border-gold/40 hover:shadow-md',
                isSoldOut && 'opacity-60 cursor-not-allowed'
              )}
              onClick={() => !isSoldOut && selectPackage(pkg.id)}
            >
              {/* Color stripe top */}
              <div className="h-1.5" style={{ backgroundColor: pkg.colorCode }} />

              <CardContent className="p-5 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: pkg.colorCode + '20' }}
                    >
                      <Icon className="w-4 h-4" style={{ color: pkg.colorCode }} />
                    </div>
                    <div>
                      <h3 className="font-serif text-base font-bold text-charcoal leading-tight">{pkg.name}</h3>
                      <Badge variant="secondary" className="text-[10px] mt-0.5">
                        {packageLabel(pkg.packageType)}
                      </Badge>
                    </div>
                  </div>
                  {isSelected && (
                    <CheckCircle2 className="w-5 h-5 text-gold shrink-0" />
                  )}
                </div>

                {/* Price */}
                <div>
                  <p className="text-2xl font-bold text-gold">
                    Rp {pkg.price.toLocaleString('id-ID')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">per paket</p>
                </div>

                {/* Applicable days */}
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    Berlaku untuk {days.length} hari:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {days.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground italic">Semua hari pertunjukan</span>
                    ) : (
                      days.map(d => {
                        const f = formatDay(d.date)
                        return (
                          <span
                            key={d.id}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-charcoal border border-border/50"
                          >
                            {f.weekday}, {f.dayMonth}
                          </span>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Availability */}
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {isSoldOut ? (
                      <span className="text-danger font-medium">Habis</span>
                    ) : (
                      <span><span className="font-medium text-charcoal">{avail}</span> tiket tersedia</span>
                    )}
                  </span>
                  {pkg.packageType === 'FULL' && (
                    <Badge className="text-[9px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                      Best Value
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Quantity selector + CTA — appears when package is selected */}
      {selectedPkg && (
        <Card className="border-gold/40 bg-gold/5 sticky bottom-4 z-10 shadow-xl">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              {/* Selected package summary */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Paket Terpilih</p>
                <p className="font-serif font-bold text-charcoal text-base sm:text-lg truncate">
                  {selectedPkg.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedPkg.parsedDayIds.length} hari · Rp {selectedPkg.price.toLocaleString('id-ID')}/paket
                </p>
              </div>

              {/* Quantity selector */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground hidden sm:block">Jumlah:</span>
                <div className="flex items-center gap-2 bg-white rounded-lg border-2 border-border p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </Button>
                  <span className="w-10 text-center font-bold text-charcoal text-lg">{quantity}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setQuantity(q => Math.min(availability[selectedPkg.id] ?? 99, q + 1))}
                    disabled={quantity >= (availability[selectedPkg.id] ?? 99)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Total + CTA */}
              <div className="flex flex-col items-end gap-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="text-xl font-bold text-gold">
                  Rp {(selectedPkg.price * quantity).toLocaleString('id-ID')}
                </p>
              </div>

              <Button
                onClick={handleProceed}
                disabled={(availability[selectedPkg.id] ?? 0) === 0}
                className="bg-charcoal hover:bg-charcoal/90 text-gold font-semibold px-6 sm:px-8 py-4 sm:py-5"
              >
                <Ticket className="w-4 h-4 mr-2" />
                Lanjut ke Pembayaran
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info card about scan cooldown */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Calendar className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 space-y-1">
              <p className="font-medium">Cara Kerja Festival Pass:</p>
              <ul className="list-disc list-inside space-y-0.5 text-blue-800">
                <li>1 QR code berlaku untuk semua hari yang tercantum di paket Anda</li>
                <li>Tunjukkan QR di pintu masuk setiap hari pertunjukan</li>
                <li>Setelah scan valid, ada cooldown singkat (anti-share tiket)</li>
                <li>Usher bisa reset cooldown manual jika ada kendala</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
