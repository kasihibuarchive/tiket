'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Send, Loader2, Ticket, Users, X, MapPin, Clock, Mail,
  AlertCircle, CheckCircle2, Calendar, Zap, Image,
  CalendarDays, CalendarRange,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatShortDate, formatEventDateTime } from '@/lib/date'
import { parseLayoutData, type ParsedLayout } from '@/lib/seat-layout'
import { CanvasSeatLayout } from '@/components/canvas-seat-layout'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventOption {
  id: string
  title: string
  category: string
  showDate: string
  location: string
  seatSummary?: { total: number; available: number; sold: number }
  seatMapId: string | null
  eventMode?: string | null
  gaZoneConfig?: string | null
  priceCategories?: Array<{
    id: string
    name: string
    price: number
    colorCode: string
    packageType?: string | null
    applicableDayIds?: string[] | null
  }>
}

interface SeatData {
  id: string
  seatCode: string
  status: string
  row: string
  col: number
  lockedUntil: string | null
  zoneName: string | null
  priceCategory: { id: string; name: string; price: number; colorCode: string } | null
}

interface ComplimentaryTicket {
  id: string
  transactionId: string
  customerName: string
  customerEmail: string
  customerWa: string
  seatCodes: string
  eventTitle: string
  createdAt: string
  emailSent?: boolean
}

interface SeatMapInfo {
  id: string
  name: string
  seatType: string
}

// ─── Steps ───────────────────────────────────────────────────────────────────

const STEPS = ['Pilih Event', 'Detail Tamu', 'Pilih Kursi'] as const

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OTSTicketPage() {
  // Step tracking
  const [currentStep, setCurrentStep] = useState(0)

  // Events
  const [events, setEvents] = useState<EventOption[]>([])
  const [isLoadingEvents, setIsLoadingEvents] = useState(true)

  // Show dates
  const [showDates, setShowDates] = useState<any[]>([])
  const [selectedShowDateId, setSelectedShowDateId] = useState<string>('')

  // Seats
  const [seats, setSeats] = useState<SeatData[]>([])
  const [isLoadingSeats, setIsLoadingSeats] = useState(false)
  const [selectedSeats, setSelectedSeats] = useState<string[]>([])
  const [seatMapInfo, setSeatMapInfo] = useState<SeatMapInfo | null>(null)
  const [layoutData, setLayoutData] = useState<any>(null)
  const [eventSeatType, setEventSeatType] = useState<string | null>(null)
  const [eventLayoutImage, setEventLayoutImage] = useState<string | null>(null)
  const parsedLayout = useMemo(() => parseLayoutData(layoutData) as ParsedLayout | null, [layoutData])

  // Form
  const [selectedEventId, setSelectedEventId] = useState<string>('')
  const [guestName, setGuestName] = useState('')

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null)

  // Recent tickets
  const [recentTickets, setRecentTickets] = useState<ComplimentaryTicket[]>([])
  const [isLoadingRecent, setIsLoadingRecent] = useState(true)

  // GA (General Admission)
  const [selectedGaZone, setSelectedGaZone] = useState<string>('')
  const [gaQuantity, setGaQuantity] = useState<number>(1)

  // FESTIVAL mode: package picker
  const [selectedFestivalPkgId, setSelectedFestivalPkgId] = useState<string | null>(null)
  const [festivalQty, setFestivalQty] = useState<number>(1)

  // Admin info
  const [adminInfo, setAdminInfo] = useState<{ id: string; name: string; role: string } | null>(null)

  // ─── Derived ──────────────────────────────────────────────────────────

  const selectedEvent = useMemo(() => events.find((e) => e.id === selectedEventId) || null, [events, selectedEventId])
  const isNumberedSeatMap = eventSeatType === 'NUMBERED' || seatMapInfo?.seatType === 'NUMBERED'
  const useCanvasMode = !!(parsedLayout?.canvasSeats && parsedLayout.canvasSeats.length > 0)
  const availableSeatsCount = useMemo(() => seats.filter((s) => s.status === 'AVAILABLE').length, [seats])

  // ── FESTIVAL MODE helpers ──
  const isFestivalMode = selectedEvent?.eventMode === 'FESTIVAL'

  // Parse + sort festival packages (same logic as FestivalPackagePicker)
  const festivalPackages = useMemo(() => {
    if (!isFestivalMode || !selectedEvent?.priceCategories) return []
    // Build zone order map from gaZoneConfig (admin drag-reorder)
    const zoneOrderMap = new Map<string, number>()
    if (selectedEvent.gaZoneConfig) {
      try {
        const zones = JSON.parse(selectedEvent.gaZoneConfig)
        if (Array.isArray(zones)) {
          zones.forEach((z: any, i: number) => {
            if (z?.name) zoneOrderMap.set(String(z.name).toLowerCase(), i)
          })
        }
      } catch { /* ignore */ }
    }
    return selectedEvent.priceCategories
      .filter(pc => pc.packageType)
      .sort((a, b) => {
        const aOrder = zoneOrderMap.get(a.name.toLowerCase())
        const bOrder = zoneOrderMap.get(b.name.toLowerCase())
        if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder
        if (aOrder !== undefined) return -1
        if (bOrder !== undefined) return 1
        const order = { SINGLE: 1, MULTI: 2, FULL: 3 }
        return (order[a.packageType as keyof typeof order] || 99) - (order[b.packageType as keyof typeof order] || 99)
      })
  }, [isFestivalMode, selectedEvent])

  // Availability per festival package (count AVAILABLE seats where zoneName === package name)
  const festivalAvailability = useMemo(() => {
    const map: Record<string, number> = {}
    for (const pkg of festivalPackages) {
      map[pkg.id] = seats.filter(s => s.zoneName === pkg.name && s.status === 'AVAILABLE').length
    }
    return map
  }, [festivalPackages, seats])

  const selectedFestivalPkg = useMemo(
    () => festivalPackages.find(p => p.id === selectedFestivalPkgId) || null,
    [festivalPackages, selectedFestivalPkgId]
  )

  const seatLookup = useMemo(() => {
    const map = new Map<string, SeatData>()
    for (const seat of seats) map.set(seat.seatCode, seat)
    return map
  }, [seats])

  const seatsByRow = useMemo(() => {
    const groups: Record<string, SeatData[]> = {}
    for (const seat of seats) {
      if (!groups[seat.row]) groups[seat.row] = []
      groups[seat.row].push(seat)
    }
    for (const row of Object.keys(groups)) groups[row].sort((a, b) => a.col - b.col)
    return groups
  }, [seats])

  const sortedRowKeys = useMemo(() => Object.keys(seatsByRow).sort(), [seatsByRow])

  // GA zone groups: group AVAILABLE seats by zoneName
  const zoneGroups = useMemo(() => {
    const groups: Record<string, { seats: SeatData[]; priceCategory: SeatData['priceCategory'] }> = {}
    for (const seat of seats) {
      if (seat.status !== 'AVAILABLE') continue
      const zone = seat.zoneName || 'General'
      if (!groups[zone]) groups[zone] = { seats: [], priceCategory: seat.priceCategory }
      groups[zone].seats.push(seat)
    }
    return groups
  }, [seats])

  const zoneGroupKeys = useMemo(() => Object.keys(zoneGroups).sort(), [zoneGroups])

  // GA selected zone available count
  const selectedGaZoneInfo = useMemo(() => {
    if (!selectedGaZone || !zoneGroups[selectedGaZone]) return null
    return zoneGroups[selectedGaZone]
  }, [selectedGaZone, zoneGroups])

  // ─── Init ─────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem('teateran_admin')
      if (stored) setAdminInfo(JSON.parse(stored))
    } catch {}
  }, [])

  // ─── Fetch events ─────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch('/api/admin/events')
        if (res.ok) {
          const data = await res.json()
          setEvents(data.events || [])
        }
      } catch {}
      finally { setIsLoadingEvents(false) }
    }
    fetchEvents()
  }, [])

  // ─── Fetch recent tickets ─────────────────────────────────────────────

  useEffect(() => {
    async function fetchRecent() {
      try {
        const res = await fetch('/api/admin/tickets/complimentary')
        if (res.ok) {
          const data = await res.json()
          setRecentTickets(data.tickets || [])
        }
      } catch {}
      finally { setIsLoadingRecent(false) }
    }
    fetchRecent()
  }, [])

  // ─── Fetch seats when event selected ──────────────────────────────────

  const fetchSeatsForEvent = useCallback(async (eventId: string, showDateFilter?: string) => {
    setIsLoadingSeats(true)
    setSelectedSeats([])
    setSeatMapInfo(null)
    setLayoutData(null)
    setEventSeatType(null)
    setEventLayoutImage(null)
    // Reset festival state
    setSelectedFestivalPkgId(null)
    setFestivalQty(1)
    setSelectedGaZone('')
    setGaQuantity(1)

    try {
      // Fetch event details first so we can detect FESTIVAL mode
      const eventRes = await fetch(`/api/events/${eventId}?admin=1`)
      let eventData: any = null
      if (eventRes.ok) {
        eventData = await eventRes.json()
        setEventSeatType(eventData.seatType || null)
        setEventLayoutImage(eventData.layoutImage || null)
        if (eventData.seatMapId) {
          const mapRes = await fetch('/api/admin/seat-maps')
          if (mapRes.ok) {
            const mapsData = await mapRes.json()
            const map = (mapsData.seatMaps || []).find((m: any) => m.id === eventData.seatMapId)
            if (map) {
              setSeatMapInfo({ id: map.id, name: map.name, seatType: map.seatType })
              setLayoutData(map.layoutData || null)
            }
          }
        }
        if (eventData.showDates?.length > 0) {
          setShowDates(eventData.showDates)
          // For FESTIVAL mode, don't auto-set showDateId — festival seats have no eventShowDateId,
          // filtering by a specific day would hide all festival package seats.
          if (eventData.eventMode !== 'FESTIVAL' && !showDateFilter) {
            setSelectedShowDateId(eventData.showDates[0].id)
          } else if (eventData.eventMode === 'FESTIVAL') {
            setSelectedShowDateId('')
          }
        } else {
          setShowDates([])
          setSelectedShowDateId('')
        }
      }

      // For FESTIVAL mode, fetch ALL seats (no showDateId filter).
      // For REGULAR multi-day, fetch only seats for the selected show date.
      const isFestival = eventData?.eventMode === 'FESTIVAL'
      const effectiveShowDateFilter = isFestival ? undefined : showDateFilter
      const seatsUrl = `/api/events/${eventId}/seats?admin=1${effectiveShowDateFilter ? `&showDateId=${effectiveShowDateFilter}` : ''}`
      const seatsRes = await fetch(seatsUrl)
      if (seatsRes.ok) {
        const data = await seatsRes.json()
        setSeats(data.seats || [])
      }
    } catch {}
    finally { setIsLoadingSeats(false) }
  }, [])

  useEffect(() => {
    if (selectedEventId) fetchSeatsForEvent(selectedEventId)
    else { setSeats([]); setSelectedSeats([]); setSeatMapInfo(null); setShowDates([]) }
  }, [selectedEventId, fetchSeatsForEvent])

  useEffect(() => {
    // Skip showDate-driven refetch for FESTIVAL mode — seats are pooled across days
    if (isFestivalMode) return
    if (selectedEventId && selectedShowDateId) fetchSeatsForEvent(selectedEventId, selectedShowDateId)
  }, [selectedShowDateId, isFestivalMode])

  // ─── Seat actions ────────────────────────────────────────────────────

  function toggleSeat(seatCode: string) {
    setSelectedSeats((prev) => prev.includes(seatCode) ? prev.filter((s) => s !== seatCode) : [...prev, seatCode])
  }

  function removeSeat(seatCode: string) {
    setSelectedSeats((prev) => prev.filter((s) => s !== seatCode))
  }

  function addGaTickets() {
    if (!selectedGaZone || !selectedGaZoneInfo || gaQuantity < 1) return
    const available = selectedGaZoneInfo.seats
    const qty = Math.min(gaQuantity, available.length)

    // Find existing seat codes for this zone that are already selected
    const existingInZone = selectedSeats.filter((s) => s.startsWith(`${selectedGaZone}-`))
    const existingNumbers = existingInZone.map((s) => {
      const parts = s.split('-')
      return parseInt(parts[parts.length - 1], 10) || 0
    })
    const maxExisting = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0

    // Also check existing seat codes in the available seats for this zone to avoid duplicates
    const allExistingCodes = new Set(seats.map((s) => s.seatCode))
    const nextStart = Math.max(maxExisting, ...Array.from(allExistingCodes)
      .filter((c) => c.startsWith(`${selectedGaZone}-`))
      .map((c) => parseInt(c.split('-').pop() || '0', 10) || 0)) + 1

    const newCodes: string[] = []
    for (let i = 0; i < qty; i++) {
      newCodes.push(`${selectedGaZone}-${nextStart + i}`)
    }

    setSelectedSeats((prev) => [...prev, ...newCodes])
    setGaQuantity(1)
  }

  function removeGaTicketsForZone(zoneName: string) {
    setSelectedSeats((prev) => prev.filter((s) => !s.startsWith(`${zoneName}-`)))
  }

  function getSeatColorClass(seat: SeatData): string {
    if (seat.status !== 'AVAILABLE') return 'bg-gray-300 text-gray-500 cursor-not-allowed'
    if (selectedSeats.includes(seat.seatCode)) return 'bg-gold text-white cursor-pointer hover:bg-gold-dark shadow-sm ring-2 ring-gold/50'
    return 'bg-emerald-100 text-emerald-800 cursor-pointer hover:bg-emerald-200 hover:shadow-sm'
  }

  // ─── Step navigation ──────────────────────────────────────────────────

  function goToStep(step: number) {
    setCurrentStep(step)
    setSubmitResult(null)
  }

  // ─── Submit ──────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!selectedEventId || !guestName) {
      setSubmitResult({ success: false, message: 'Harap masukkan nama tamu.' })
      return
    }

    // Validate selection based on mode
    if (isFestivalMode) {
      if (!selectedFestivalPkg || festivalQty < 1) {
        setSubmitResult({ success: false, message: 'Harap pilih paket festival & jumlah tiket.' })
        return
      }
      const avail = festivalAvailability[selectedFestivalPkg.id] ?? 0
      if (festivalQty > avail) {
        setSubmitResult({ success: false, message: `Stok paket "${selectedFestivalPkg.name}" tidak cukup. Tersedia: ${avail}, diminta: ${festivalQty}.` })
        return
      }
    } else if (selectedSeats.length === 0) {
      setSubmitResult({ success: false, message: 'Harap pilih minimal 1 kursi.' })
      return
    }

    setIsSubmitting(true)
    setSubmitResult(null)

    try {
      const body: any = {
        eventId: selectedEventId,
        guestName,
        guestEmail: '',
        guestPhone: '',
        showDateId: isFestivalMode ? undefined : (selectedShowDateId || undefined),
      }

      if (isFestivalMode && selectedFestivalPkg) {
        // FESTIVAL: send festivalPackage — API will pick N AVAILABLE seats from the package's zone
        body.seatCodes = []  // empty — API will fill from pool
        body.festivalPackage = {
          priceCategoryId: selectedFestivalPkg.id,
          quantity: festivalQty,
        }
      } else {
        // REGULAR / GA: send explicit seat codes
        body.seatCodes = selectedSeats
      }

      const res = await fetch('/api/admin/tickets/complimentary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminInfo ? { 'x-admin-id': adminInfo.id, 'x-admin-name': adminInfo.name || adminInfo.role } : {}),
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (res.ok) {
        const qtyText = isFestivalMode
          ? `${festivalQty} tiket paket "${selectedFestivalPkg?.name}"`
          : `${selectedSeats.length} kursi`
        setSubmitResult({ success: true, message: `Tiket OTS berhasil dibuat! ${qtyText} — TRX: ${data.transactionId}` })
        // Reset everything
        setGuestName('')
        setSelectedSeats([])
        setSelectedFestivalPkgId(null)
        setFestivalQty(1)
        setSelectedGaZone('')
        setGaQuantity(1)
        setCurrentStep(0)
        setSelectedEventId('')
        // Refresh history
        const recentRes = await fetch('/api/admin/tickets/complimentary')
        if (recentRes.ok) {
          const recentData = await recentRes.json()
          setRecentTickets(recentData.tickets || [])
        }
      } else {
        setSubmitResult({ success: false, message: data.error || 'Gagal mengirim tiket.' })
      }
    } catch {
      setSubmitResult({ success: false, message: 'Terjadi kesalahan jaringan.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  function parseSeatCodes(codes: string): string[] {
    if (!codes) return []
    try { return JSON.parse(codes) } catch { return codes.split(',').map((s) => s.trim()).filter(Boolean) }
  }

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
          <Zap className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold text-charcoal">OTS Ticket</h1>
          <p className="text-sm text-muted-foreground mt-0.5">On The Spot — buat tiket langsung di lokasi, cukup nama pembeli</p>
        </div>
      </div>

      {/* Result banner */}
      {submitResult && (
        <div className={cn(
          'flex items-start gap-3 p-4 rounded-lg text-sm',
          submitResult.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800',
        )}>
          {submitResult.success ? <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
          <p>{submitResult.message}</p>
          <button onClick={() => setSubmitResult(null)} className="ml-auto flex-shrink-0 hover:opacity-70"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Main form card */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="font-serif text-lg text-charcoal">Buat Tiket OTS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {STEPS.map((step, idx) => (
              <button
                key={step}
                onClick={() => idx < currentStep ? goToStep(idx) : undefined}
                disabled={idx > currentStep}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  idx === currentStep
                    ? 'bg-gold text-white'
                    : idx < currentStep
                      ? 'bg-gold/20 text-gold cursor-pointer hover:bg-gold/30'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                  {idx < currentStep ? '✓' : idx + 1}
                </span>
                {step}
              </button>
            ))}
          </div>

          <Separator />

          {/* Step 0: Pilih Event */}
          {currentStep === 0 && (
            <div className="space-y-4 py-2">
              <Label className="text-sm font-medium">Pilih Event</Label>
              {isLoadingEvents ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-gold" /> Memuat event...
                </div>
              ) : events.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Tidak ada event aktif.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {events.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => { setSelectedEventId(event.id); goToStep(1) }}
                      className={cn(
                        'text-left p-4 rounded-xl border-2 transition-all',
                        selectedEventId === event.id
                          ? 'border-gold bg-gold/5'
                          : 'border-border/50 bg-white hover:border-gold/30 hover:shadow-sm',
                      )}
                    >
                      <p className="font-medium text-charcoal text-sm">{event.title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-[10px]">{event.category}</Badge>
                        {event.eventMode === 'FESTIVAL' && (
                          <Badge className="text-[10px] bg-gold/15 text-gold border border-gold/30">Festival</Badge>
                        )}
                        <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{formatShortDate(event.showDate)}</span>
                        <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{event.location}</span>
                      </div>
                      {event.seatSummary && (
                        <p className="text-[10px] text-muted-foreground mt-2">
                          <Ticket className="w-3 h-3 inline mr-0.5" />
                          {event.seatSummary.available} kursi tersedia
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 1: Detail Tamu */}
          {currentStep === 1 && (
            <div className="space-y-5 py-2">
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2"><Users className="w-4 h-4 text-gold" />Informasi Tamu</Label>
                <div className="space-y-1.5 max-w-md">
                  <Label className="text-xs text-muted-foreground">Nama <span className="text-danger">*</span></Label>
                  <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Nama pembeli" className="bg-white" autoFocus />
                </div>
              </div>

              {selectedEvent && (
                <div className="bg-muted/20 rounded-lg p-3 text-xs text-muted-foreground">
                  <span className="font-medium text-charcoal">Event: </span>{selectedEvent.title}
                  <span className="mx-2">·</span>
                  {formatEventDateTime(selectedEvent.showDate)}
                  <span className="mx-2">·</span>
                  {selectedEvent.location}
                </div>
              )}

              <div className="flex items-center gap-3 justify-between">
                <Button variant="outline" onClick={() => goToStep(0)}>Kembali</Button>
                <Button
                  disabled={!guestName}
                  onClick={() => { fetchSeatsForEvent(selectedEventId, selectedShowDateId || undefined); goToStep(2) }}
                  className="bg-charcoal hover:bg-charcoal/90 text-gold"
                >
                  Pilih Kursi
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Pilih Kursi */}
          {currentStep === 2 && (
            <div className="space-y-4 py-2">
              {/* Show date tabs — hidden for FESTIVAL mode (paket festival carry their own applicableDayIds metadata) */}
              {!isFestivalMode && showDates.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  {showDates.map((sd: any, idx: number) => (
                    <button
                      key={sd.id}
                      onClick={() => setSelectedShowDateId(sd.id)}
                      className={cn(
                        'px-3 py-1 rounded-full text-xs font-medium transition-all border',
                        selectedShowDateId === sd.id
                          ? 'bg-gold text-white border-gold'
                          : 'bg-white text-muted-foreground border-border hover:border-gold/50',
                      )}
                    >
                      {sd.label || `Hari ${idx + 1}`} ({new Date(sd.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})
                    </button>
                  ))}
                </div>
              )}

              {isLoadingSeats ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin text-gold" /> Memuat kursi...
                </div>
              ) : isFestivalMode ? (
                /* ─── FESTIVAL: Package Picker ─── */
                <div className="space-y-4">
                  {/* Layout Image (if any) */}
                  {eventLayoutImage && (
                    <div className="bg-muted/20 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Image className="w-3.5 h-3.5 text-gold" />
                        <span className="text-xs font-medium text-charcoal">Layout Venue</span>
                      </div>
                      <div className="w-full rounded-lg overflow-hidden border border-border/30">
                        <img
                          src={eventLayoutImage}
                          alt="Layout venue"
                          className="w-full h-auto max-h-64 object-contain"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Pilih paket festival di bawah ini
                    </p>
                    {festivalPackages.length === 0 && (
                      <Badge variant="secondary" className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200">
                        Belum ada paket
                      </Badge>
                    )}
                  </div>

                  {festivalPackages.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Belum ada paket tiket untuk festival ini. Tambahkan price category dengan <span className="font-mono">packageType</span> (SINGLE/MULTI/FULL) lewat halaman Edit Event.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {festivalPackages.map((pkg) => {
                        const isSelected = selectedFestivalPkgId === pkg.id
                        const avail = festivalAvailability[pkg.id] ?? 0
                        const PkgIcon = pkg.packageType === 'FULL' ? CalendarDays : pkg.packageType === 'MULTI' ? CalendarRange : Calendar
                        const pkgLabel = pkg.packageType === 'FULL' ? 'Full Pass' : pkg.packageType === 'MULTI' ? 'Multi-Day' : 'Single Day'
                        // Resolve applicable day labels
                        let dayCount = 0
                        if (pkg.applicableDayIds && Array.isArray(pkg.applicableDayIds)) {
                          dayCount = pkg.applicableDayIds.length
                        } else if (pkg.packageType === 'FULL') {
                          dayCount = showDates.length
                        }
                        return (
                          <button
                            key={pkg.id}
                            type="button"
                            onClick={() => { setSelectedFestivalPkgId(pkg.id); setFestivalQty(1) }}
                            disabled={avail === 0}
                            className={cn(
                              'text-left p-4 rounded-xl border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                              isSelected
                                ? 'border-gold bg-gold/5 shadow-sm'
                                : 'border-border/50 bg-white hover:border-gold/30 hover:shadow-sm',
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <PkgIcon className="w-4 h-4 text-gold shrink-0" />
                                  <p className="font-medium text-sm text-charcoal truncate">{pkg.name}</p>
                                </div>
                                <p className="text-[10px] text-muted-foreground pl-6">
                                  {pkgLabel}{dayCount > 0 ? ` · ${dayCount} hari` : ''} · Rp{pkg.price.toLocaleString('id-ID')}
                                </p>
                              </div>
                              <div
                                className="w-3 h-3 rounded-full shrink-0 mt-1"
                                style={{ backgroundColor: pkg.colorCode }}
                                title={pkg.colorCode}
                              />
                            </div>
                            <div className="mt-3 pl-6 flex items-center gap-2 text-[11px]">
                              {avail > 0 ? (
                                <span className="text-emerald-700 font-medium">{avail} tiket tersedia</span>
                              ) : (
                                <span className="text-red-600 font-medium">Habis</span>
                              )}
                              {isSelected && (
                                <Badge className="bg-gold text-white text-[9px] ml-auto">Dipilih</Badge>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Quantity picker — show only when a package is selected */}
                  {selectedFestivalPkg && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 p-4 bg-muted/20 rounded-xl">
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Jumlah tiket</Label>
                        <p className="text-sm text-charcoal">
                          Paket: <span className="font-medium">{selectedFestivalPkg.name}</span>
                          <span className="text-muted-foreground ml-2">· Rp{selectedFestivalPkg.price.toLocaleString('id-ID')}/tiket</span>
                        </p>
                      </div>
                      <div className="w-full sm:w-32 space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Qty</Label>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            disabled={festivalQty <= 1}
                            onClick={() => setFestivalQty((q) => Math.max(1, q - 1))}
                          >
                            −
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            max={festivalAvailability[selectedFestivalPkg.id] ?? 1}
                            value={festivalQty}
                            onChange={(e) => setFestivalQty(Math.max(1, parseInt(e.target.value) || 1))}
                            className="h-9 text-center bg-white"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            disabled={festivalQty >= (festivalAvailability[selectedFestivalPkg.id] ?? 1)}
                            onClick={() => setFestivalQty((q) => Math.min(festivalAvailability[selectedFestivalPkg.id] ?? 1, q + 1))}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : isNumberedSeatMap ? (
                /* ─── Numbered Seat Map ─── */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Tersedia: <span className="font-semibold text-charcoal">{availableSeatsCount}</span>
                    </p>
                    {selectedSeats.length > 0 && (
                      <Badge className="bg-gold text-white text-xs">{selectedSeats.length} dipilih</Badge>
                    )}
                  </div>

                  <div className="bg-muted/20 rounded-xl p-4 overflow-x-auto">
                    {useCanvasMode && parsedLayout ? (
                      <div className="flex justify-center">
                        <CanvasSeatLayout
                          parsedLayout={parsedLayout}
                          seatLookup={seatLookup as Map<string, any>}
                          renderSeat={(seatData, canvasSeat, scaledX, scaledY, size, key) => {
                            const isAvailable = seatData.status === 'AVAILABLE'
                            const isSelected = selectedSeats.includes(canvasSeat.seatCode)
                            return (
                              <button
                                key={key}
                                onClick={() => isAvailable ? toggleSeat(canvasSeat.seatCode) : undefined}
                                disabled={!isAvailable}
                                className={cn(
                                  'absolute rounded text-[10px] font-medium flex items-center justify-center transition-all',
                                  isSelected ? 'bg-gold text-white shadow-sm ring-2 ring-gold/50 cursor-pointer'
                                    : isAvailable ? 'bg-emerald-100 text-emerald-800 cursor-pointer hover:bg-emerald-200 hover:shadow-sm'
                                    : 'bg-gray-300 text-gray-500 cursor-not-allowed',
                                )}
                                style={{ left: scaledX, top: scaledY, width: size, height: size }}
                                title={`${canvasSeat.seatCode} - ${seatData.status}`}
                              >
                                {canvasSeat.seatNum}
                              </button>
                            )
                          }}
                          renderEmpty={(x, y, size, key) => (
                            <div key={key} className="absolute" style={{ left: x, top: y, width: size, height: size }} />
                          )}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="text-center mb-3">
                          <div className="bg-charcoal text-white text-[10px] uppercase tracking-widest px-6 py-1.5 rounded-full inline-block">Panggung</div>
                        </div>
                        <div className="mx-auto w-full flex flex-col items-center">
                          {sortedRowKeys.map((row) => (
                            <div key={row} className="flex items-center gap-2 mb-1.5">
                              <span className="w-6 text-xs font-mono font-semibold text-charcoal/60 text-right">{row}</span>
                              <div className="flex gap-1 flex-1">
                                {seatsByRow[row].map((seat) => (
                                  <button
                                    key={seat.id}
                                    onClick={() => seat.status === 'AVAILABLE' ? toggleSeat(seat.seatCode) : undefined}
                                    disabled={seat.status !== 'AVAILABLE'}
                                    className={cn('w-8 h-8 rounded text-[10px] font-mono font-medium flex items-center justify-center transition-all', getSeatColorClass(seat))}
                                    title={`${seat.seatCode} - ${seat.status}`}
                                  >
                                    {seat.col}
                                  </button>
                                ))}
                              </div>
                              <span className="w-6 text-xs font-mono font-semibold text-charcoal/60">{row}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Legend */}
                    <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-emerald-100 border border-emerald-200" />Tersedia</div>
                      <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-gold border border-gold-dark" />Dipilih</div>
                      <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-gray-300" />Terisi</div>
                    </div>
                  </div>

                  {/* Selected seats */}
                  {selectedSeats.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Kursi dipilih:</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedSeats.map((code) => (
                          <Badge key={code} className="bg-gold text-white text-xs cursor-pointer hover:bg-gold-dark transition-colors" onClick={() => removeSeat(code)}>
                            {code} <X className="w-3 h-3 ml-1" />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ─── GA (General Admission) Zone Selector ─── */
                <div className="space-y-4">
                  {/* Layout Image for GA events */}
                  {eventLayoutImage && (
                    <div className="bg-muted/20 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Image className="w-3.5 h-3.5 text-gold" />
                        <span className="text-xs font-medium text-charcoal">Layout Venue</span>
                      </div>
                      <div className="w-full rounded-lg overflow-hidden border border-border/30">
                        <img
                          src={eventLayoutImage}
                          alt="Layout venue"
                          className="w-full h-auto max-h-64 object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {/* Zone info cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {zoneGroupKeys.map((zone) => {
                      const group = zoneGroups[zone]
                      const selectedInZone = selectedSeats.filter((s) => s.startsWith(`${zone}-`)).length
                      return (
                        <div
                          key={zone}
                          className={cn(
                            'rounded-xl border-2 p-4 transition-all',
                            selectedGaZone === zone
                              ? 'border-gold bg-gold/5'
                              : 'border-border/50 bg-white hover:border-gold/30',
                          )}
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                                <p className="font-medium text-sm text-charcoal">{zone}</p>
                              </div>
                              <p className="text-xs text-muted-foreground pl-[18px]">
                                Tersedia: <span className="font-semibold text-emerald-700">{group.seats.length}</span>
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {group.priceCategory && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                  style={{ borderColor: group.priceCategory.colorCode, borderWidth: 1 }}
                                >
                                  {group.priceCategory.name}
                                </Badge>
                              )}
                              {selectedInZone > 0 && (
                                <Badge className="bg-gold text-white text-[10px]">+{selectedInZone}</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {zoneGroupKeys.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">Tidak ada kursi tersedia untuk event ini.</p>
                  )}

                  {/* Zone selector + quantity picker */}
                  {zoneGroupKeys.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 p-4 bg-muted/20 rounded-xl">
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Pilih Zona</Label>
                        <Select value={selectedGaZone} onValueChange={(v) => { setSelectedGaZone(v); setGaQuantity(1) }}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Pilih zona..." />
                          </SelectTrigger>
                          <SelectContent>
                            {zoneGroupKeys.map((zone) => (
                              <SelectItem key={zone} value={zone}>
                                <div className="flex items-center gap-2">
                                  <span>{zone}</span>
                                  <span className="text-muted-foreground text-xs">({zoneGroups[zone].seats.length} tersedia)</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="w-full sm:w-32 space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Jumlah</Label>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            disabled={!selectedGaZone || gaQuantity <= 1}
                            onClick={() => setGaQuantity((q) => Math.max(1, q - 1))}
                          >
                            −
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            max={selectedGaZoneInfo ? selectedGaZoneInfo.seats.length : 99}
                            value={gaQuantity}
                            onChange={(e) => setGaQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                            className="h-9 text-center bg-white"
                            disabled={!selectedGaZone}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            disabled={!selectedGaZone || !selectedGaZoneInfo || gaQuantity >= selectedGaZoneInfo.seats.length}
                            onClick={() => setGaQuantity((q) => Math.min(selectedGaZoneInfo!.seats.length, q + 1))}
                          >
                            +
                          </Button>
                        </div>
                      </div>

                      <Button
                        onClick={addGaTickets}
                        disabled={!selectedGaZone || !selectedGaZoneInfo || gaQuantity < 1}
                        className="bg-gold hover:bg-gold-dark text-white h-9 whitespace-nowrap"
                      >
                        <Ticket className="w-4 h-4 mr-1.5" />
                        Tambah ({gaQuantity})
                      </Button>
                    </div>
                  )}

                  {/* Selected GA tickets as badges */}
                  {selectedSeats.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Tiket dipilih:</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedSeats.map((code) => {
                          const zone = code.includes('-') ? code.split('-').slice(0, -1).join('-') : code
                          return (
                            <Badge
                              key={code}
                              className="bg-gold text-white text-xs cursor-pointer hover:bg-gold-dark transition-colors"
                              onClick={() => removeSeat(code)}
                            >
                              <MapPin className="w-3 h-3 mr-1" />
                              {code} <X className="w-3 h-3 ml-1" />
                            </Badge>
                          )
                        })}
                      </div>
                      <div className="flex gap-2">
                        {zoneGroupKeys
                          .filter((z) => selectedSeats.some((s) => s.startsWith(`${z}-`)))
                          .map((z) => (
                            <Button
                              key={z}
                              variant="ghost"
                              size="sm"
                              className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => removeGaTicketsForZone(z)}
                            >
                              Hapus semua zona {z}
                            </Button>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Separator />

              {/* Summary */}
              <div className="bg-charcoal/5 rounded-xl p-4 space-y-2 text-xs">
                <p className="font-medium text-charcoal text-sm">Ringkasan</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Nama:</span> <span className="font-medium">{guestName}</span></div>
                  <div><span className="text-muted-foreground">Event:</span> <span className="font-medium">{selectedEvent?.title}</span></div>
                  <div className="col-span-2">
                    {isFestivalMode ? (
                      <div>
                        <span className="text-muted-foreground">Paket:</span>{' '}
                        {selectedFestivalPkg ? (
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            <Badge className="bg-gold text-white text-[10px]">{selectedFestivalPkg.name}</Badge>
                            <span className="text-muted-foreground">×</span>
                            <Badge variant="secondary" className="text-[10px]">{festivalQty} tiket</Badge>
                            <span className="text-muted-foreground ml-1">· Rp{(selectedFestivalPkg.price * festivalQty).toLocaleString('id-ID')}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic ml-1">Belum dipilih</span>
                        )}
                      </div>
                    ) : (
                      <>
                        <span className="text-muted-foreground">Kursi:</span>{' '}
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {selectedSeats.length > 0
                            ? selectedSeats.map((c) => <Badge key={c} className="bg-gold text-white text-[10px]">{c}</Badge>)
                            : isNumberedSeatMap
                              ? <span className="text-muted-foreground italic">Belum dipilih</span>
                              : <span className="text-muted-foreground italic">Pilih zona & jumlah di atas</span>
                          }
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 justify-between">
                <Button variant="outline" onClick={() => goToStep(1)}>Kembali</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || (isFestivalMode ? (!selectedFestivalPkg || festivalQty < 1) : selectedSeats.length === 0)}
                  className="bg-charcoal hover:bg-charcoal/90 text-gold min-w-[180px]"
                >
                  {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{'Menyimpan...'}</> : <><Send className="w-4 h-4 mr-2" />Simpan Tiket</>}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent OTS Tickets */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="font-serif text-lg text-charcoal flex items-center gap-2">
            <Clock className="w-4 h-4 text-gold" />
            Riwayat OTS Ticket
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingRecent ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-gold animate-spin" /></div>
          ) : recentTickets.length === 0 ? (
            <div className="text-center py-12">
              <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Belum ada tiket OTS</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">TRX ID</TableHead>
                    <TableHead className="text-xs">Nama</TableHead>
                    <TableHead className="text-xs">Event</TableHead>
                    <TableHead className="text-xs">Kursi</TableHead>
                    <TableHead className="text-xs">Waktu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTickets.map((ticket) => {
                    const codes = parseSeatCodes(ticket.seatCodes)
                    return (
                      <TableRow key={ticket.id}>
                        <TableCell><span className="font-mono text-xs font-semibold text-gold">{ticket.transactionId}</span></TableCell>
                        <TableCell>
                          <div><p className="text-sm font-medium">{ticket.customerName}</p><p className="text-xs text-muted-foreground">{ticket.customerEmail}</p></div>
                        </TableCell>
                        <TableCell className="text-xs">{ticket.eventTitle}</TableCell>
                        <TableCell><div className="flex flex-wrap gap-1">{codes.map((c) => <Badge key={c} variant="secondary" className="text-[9px]">{c}</Badge>)}</div></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(ticket.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
