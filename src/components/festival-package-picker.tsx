'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Calendar, CalendarDays, CalendarRange, Users, Minus, Plus, Loader2,
  Check,
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
  gaZoneConfig?: string | null
  layoutImage?: string | null
  hideSeatAvailability?: boolean
  hideSoldCount?: boolean
  onProceedToCheckout: (data: {
    priceCategory: PriceCategoryData
    quantity: number
    applicableDayIds: string[]
  }) => void
}

// Format date for display: "Sen, 12 Jun · 19:30 WIB"
function formatDay(d: string) {
  const date = new Date(d)
  return {
    weekday: date.toLocaleDateString('id-ID', { weekday: 'short' }),
    dayMonth: date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
    time: `${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`,
    label: date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }),
  }
}

export function FestivalPackagePicker({
  eventId,
  priceCategories,
  showDates,
  gaZoneConfig,
  layoutImage,
  hideSeatAvailability = false,
  hideSoldCount = false,
  onProceedToCheckout,
}: FestivalPackagePickerProps) {
  // Parse gaZoneConfig once — used for:
  //   1) Per-zone notes lookup by name match
  //   2) Display order (admin drag-reorder in seat editor)
  const zoneNotesMap = useMemo(() => {
    const map = new Map<string, string>()
    if (!gaZoneConfig) return map
    try {
      const zones = JSON.parse(gaZoneConfig)
      if (Array.isArray(zones)) {
        for (const z of zones) {
          if (z?.name && z?.notes) {
            map.set(String(z.name).toLowerCase(), String(z.notes))
          }
        }
      }
    } catch { /* ignore */ }
    return map
  }, [gaZoneConfig])

  const zoneOrderMap = useMemo(() => {
    const map = new Map<string, number>()
    if (!gaZoneConfig) return map
    try {
      const zones = JSON.parse(gaZoneConfig)
      if (Array.isArray(zones)) {
        zones.forEach((z: any, i: number) => {
          if (z?.name) map.set(String(z.name).toLowerCase(), i)
        })
      }
    } catch { /* ignore */ }
    return map
  }, [gaZoneConfig])

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
        // Primary: zone order from gaZoneConfig (admin drag-reorder in seat editor)
        const aOrder = zoneOrderMap.get(a.name.toLowerCase())
        const bOrder = zoneOrderMap.get(b.name.toLowerCase())
        if (aOrder !== undefined && bOrder !== undefined) {
          return aOrder - bOrder
        }
        // If only one is in gaZoneConfig, in-config first
        if (aOrder !== undefined) return -1
        if (bOrder !== undefined) return 1
        // Fallback: SINGLE first, then MULTI, then FULL
        const order = { SINGLE: 1, MULTI: 2, FULL: 3 }
        return (order[a.packageType as keyof typeof order] || 99) - (order[b.packageType as keyof typeof order] || 99)
      })
  }, [priceCategories, showDates, zoneOrderMap])

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

  // ─── AVAILABILITY ────────────────────────────────────────────────
  // CONCEPT: Each PriceCategory IS its own tiket pool.
  //   - "Day 2 Tiket" category → has its own seats (all for Day 2).
  //   - "Day 3 Tiket" category → has its own seats (all for Day 3).
  //   - "FULL Pass" category   → has its own seats (its own pool).
  //
  // So availability = count of AVAILABLE seats in this package's zone. Period.
  // No per-day breakdown. No min-across-days. No sum across days.
  //
  // `applicableDayIds` is ONLY metadata for:
  //   - Display ("Berlaku untuk X hari")
  //   - Check-in / scan logic (which days this ticket grants access to)
  // It does NOT affect availability calculation.
  //
  // Each tiket is 1 unit. 1 tiket in "Day 2" category = 1 seat in Day 2 pool.
  // 1 tiket in "FULL Pass" category = 1 seat in FULL Pass pool.
  // The pools are independent — selling a Day 2 tiket does not reduce FULL Pass pool.
  const [availability, setAvailability] = useState<Record<string, number>>({})
  useEffect(() => {
    async function fetchAvailability() {
      try {
        const res = await fetch(`/api/events/${eventId}/seats?admin=1`)
        if (!res.ok) return
        const data = await res.json()
        const seats: any[] = data.seats || []

        const avail: Record<string, number> = {}
        for (const pkg of packages) {
          // Count AVAILABLE seats in this package's zone (zoneName === package name).
          // That's it. The package IS the pool.
          avail[pkg.id] = seats.filter(s =>
            s.zoneName === pkg.name && s.status === 'AVAILABLE'
          ).length
        }
        setAvailability(avail)
      } catch (err) {
        console.error('[festival-picker] Availability fetch error:', err)
      }
    }
    if (packages.length > 0) fetchAvailability()
  }, [eventId, packages])

  const packageIcon = (pkgType: string | null | undefined) => {
    if (pkgType === 'FULL') return CalendarDays
    if (pkgType === 'MULTI') return CalendarRange
    return Calendar
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
        <p className="font-serif text-charcoal text-lg">Belum ada paket tiket untuk festival ini.</p>
        <p className="text-sm text-muted-foreground mt-1">Hubungi admin untuk informasi tiket.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header hint */}
      <div className="text-center mb-2">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold/10 border border-gold/30">
          <span className="w-1.5 h-1.5 rounded-full bg-gold" />
          <span className="text-xs font-medium text-gold tracking-wide">Festival Mode — Multi-Day Pass</span>
        </div>
        <p className="text-sm text-muted-foreground mt-3 max-w-xl mx-auto">
          Pilih paket sesuai kebutuhan Anda. 1 QR berlaku untuk semua hari yang tercantum di paket.
          Tiket bisa di-scan ulang setelah cooldown (anti-share tiket).
        </p>
      </div>

      {/* Layout venue image (uploaded from GA seat editor) */}
      {layoutImage && (
        <div className="bg-muted/20 rounded-xl p-3 border border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1 h-1 rounded-full bg-gold" />
            <span className="text-xs font-medium text-charcoal">Layout Venue</span>
          </div>
          <div className="w-full rounded-lg overflow-hidden border border-border/30 bg-white">
            <img
              src={layoutImage}
              alt="Layout venue festival"
              className="w-full h-auto max-h-96 object-contain"
            />
          </div>
        </div>
      )}

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
                    <div className="w-5 h-5 rounded-full border-2 border-gold bg-gold flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
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

                {/* Zone notes (from seat editor) */}
                {(() => {
                  const note = zoneNotesMap.get(pkg.name.toLowerCase()) || ''
                  if (!note) return null
                  return (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200/60 rounded-md px-2 py-1.5 leading-snug">
                      {note}
                    </p>
                  )
                })()}

                {/* Availability — respect hideSeatAvailability / hideSoldCount */}
                {!(hideSeatAvailability && (hideSoldCount || isSoldOut)) && (
                  <div className="flex items-center justify-between pt-2 border-t border-border/40">
                    {isSoldOut ? (
                      <span className="text-[11px] text-danger font-medium flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        Habis
                      </span>
                    ) : hideSeatAvailability ? (
                      <span className="text-[11px] text-muted-foreground italic">
                        Tersedia
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span><span className="font-medium text-charcoal">{avail}</span> tiket tersedia</span>
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Quantity selector + CTA — Liquid Glass overlay (Apple-style frosted glass) */}
      {selectedPkg && (
        <div className="sticky bottom-4 z-50">
          <div className="relative rounded-2xl border border-white/40 bg-white/60 backdrop-blur-2xl backdrop-saturate-150 shadow-2xl shadow-black/20 ring-1 ring-black/5 overflow-hidden">
            {/* Subtle gold tint overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-gold/10 via-transparent to-gold/5 pointer-events-none" />
            {/* Top highlight line (glass reflection) */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

            <div className="relative p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                {/* Selected package summary */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-charcoal/60 font-semibold flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-gold" />
                    Paket Terpilih
                  </p>
                  <p className="font-serif font-bold text-charcoal text-base sm:text-lg truncate drop-shadow-sm">
                    {selectedPkg.name}
                  </p>
                  <p className="text-xs text-charcoal/70">
                    {selectedPkg.parsedDayIds.length} hari · Rp {selectedPkg.price.toLocaleString('id-ID')}/paket
                  </p>
                </div>

                {/* Quantity selector */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-charcoal/70 hidden sm:block font-medium">Jumlah:</span>
                  <div className="flex items-center gap-2 bg-white/70 backdrop-blur-sm rounded-lg border-2 border-white/60 shadow-sm p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-white/80"
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
                      className="h-8 w-8 hover:bg-white/80"
                      onClick={() => setQuantity(q => Math.min(availability[selectedPkg.id] ?? 99, q + 1))}
                      disabled={quantity >= (availability[selectedPkg.id] ?? 99)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Total + CTA */}
                <div className="flex flex-col items-end gap-1">
                  <p className="text-[10px] uppercase tracking-wider text-charcoal/60 font-semibold">Total</p>
                  <p className="text-xl font-bold text-gold drop-shadow-sm">
                    Rp {(selectedPkg.price * quantity).toLocaleString('id-ID')}
                  </p>
                </div>

                <Button
                  onClick={handleProceed}
                  disabled={(availability[selectedPkg.id] ?? 0) === 0}
                  className="bg-charcoal hover:bg-charcoal/90 text-gold font-semibold px-6 sm:px-8 py-4 sm:py-5 shadow-lg shadow-charcoal/30 transition-all hover:scale-[1.02] active:scale-95"
                >
                  Lanjut ke Pembayaran
                </Button>
              </div>
            </div>
          </div>
        </div>
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
