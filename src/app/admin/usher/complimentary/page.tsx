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
  AlertCircle, CheckCircle2, Calendar, Zap,
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
}

interface SeatData {
  id: string
  seatCode: string
  status: string
  row: string
  col: number
  lockedUntil: string | null
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
  const parsedLayout = useMemo(() => parseLayoutData(layoutData) as ParsedLayout | null, [layoutData])

  // Form
  const [selectedEventId, setSelectedEventId] = useState<string>('')
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null)

  // Recent tickets
  const [recentTickets, setRecentTickets] = useState<ComplimentaryTicket[]>([])
  const [isLoadingRecent, setIsLoadingRecent] = useState(true)

  // Admin info
  const [adminInfo, setAdminInfo] = useState<{ id: string; name: string; role: string } | null>(null)

  // ─── Derived ──────────────────────────────────────────────────────────

  const selectedEvent = useMemo(() => events.find((e) => e.id === selectedEventId) || null, [events, selectedEventId])
  const isNumberedSeatMap = seatMapInfo?.seatType === 'NUMBERED'
  const useCanvasMode = !!(parsedLayout?.canvasSeats && parsedLayout.canvasSeats.length > 0)
  const availableSeatsCount = useMemo(() => seats.filter((s) => s.status === 'AVAILABLE').length, [seats])

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
          setEvents((data.events || []).filter((e: any) => e.isPublished))
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

    try {
      const seatsUrl = `/api/events/${eventId}/seats${showDateFilter ? `?showDateId=${showDateFilter}` : ''}`
      const seatsRes = await fetch(seatsUrl)
      if (seatsRes.ok) {
        const data = await seatsRes.json()
        setSeats(data.seats || [])
      }

      const eventRes = await fetch(`/api/events/${eventId}`)
      if (eventRes.ok) {
        const eventData = await eventRes.json()
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
          if (!showDateFilter) setSelectedShowDateId(eventData.showDates[0].id)
        } else {
          setShowDates([])
          setSelectedShowDateId('')
        }
      }
    } catch {}
    finally { setIsLoadingSeats(false) }
  }, [])

  useEffect(() => {
    if (selectedEventId) fetchSeatsForEvent(selectedEventId)
    else { setSeats([]); setSelectedSeats([]); setSeatMapInfo(null); setShowDates([]) }
  }, [selectedEventId, fetchSeatsForEvent])

  useEffect(() => {
    if (selectedEventId && selectedShowDateId) fetchSeatsForEvent(selectedEventId, selectedShowDateId)
  }, [selectedShowDateId])

  // ─── Seat actions ────────────────────────────────────────────────────

  function toggleSeat(seatCode: string) {
    setSelectedSeats((prev) => prev.includes(seatCode) ? prev.filter((s) => s !== seatCode) : [...prev, seatCode])
  }

  function removeSeat(seatCode: string) {
    setSelectedSeats((prev) => prev.filter((s) => s !== seatCode))
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
    if (!selectedEventId || !guestName || !guestEmail) {
      setSubmitResult({ success: false, message: 'Harap lengkapi semua field.' })
      return
    }
    if (selectedSeats.length === 0) {
      setSubmitResult({ success: false, message: 'Harap pilih minimal 1 kursi.' })
      return
    }

    setIsSubmitting(true)
    setSubmitResult(null)

    try {
      const res = await fetch('/api/admin/tickets/complimentary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminInfo ? { 'x-admin-id': adminInfo.id, 'x-admin-name': adminInfo.name || adminInfo.role } : {}),
        },
        body: JSON.stringify({
          eventId: selectedEventId,
          seatCodes: selectedSeats,
          guestName,
          guestEmail,
          guestPhone: '',
          showDateId: selectedShowDateId || undefined,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setSubmitResult({ success: true, message: `Tiket berhasil dikirim ke ${guestEmail}! TRX: ${data.transactionId}` })
        // Reset everything
        setGuestName('')
        setGuestEmail('')
        setSelectedSeats([])
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
          <p className="text-sm text-muted-foreground mt-0.5">On The Spot — buat & kirim tiket langsung di lokasi</p>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Nama <span className="text-danger">*</span></Label>
                    <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Nama tamu" className="bg-white" autoFocus />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Email <span className="text-danger">*</span></Label>
                    <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="email@contoh.com" className="bg-white" />
                  </div>
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
                  disabled={!guestName || !guestEmail}
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
              {/* Show date tabs */}
              {showDates.length > 1 && (
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
                /* ─── GA (no seat map) ─── */
                <p className="text-sm text-muted-foreground py-4 text-center">Event ini tidak memiliki seat map. Kursi akan di-generate otomatis.</p>
              )}

              <Separator />

              {/* Summary */}
              <div className="bg-charcoal/5 rounded-xl p-4 space-y-2 text-xs">
                <p className="font-medium text-charcoal text-sm">Ringkasan</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Nama:</span> <span className="font-medium">{guestName}</span></div>
                  <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{guestEmail}</span></div>
                  <div><span className="text-muted-foreground">Event:</span> <span className="font-medium">{selectedEvent?.title}</span></div>
                  <div>
                    <span className="text-muted-foreground">Kursi:</span>{' '}
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {selectedSeats.length > 0
                        ? selectedSeats.map((c) => <Badge key={c} className="bg-gold text-white text-[10px]">{c}</Badge>)
                        : <span className="text-muted-foreground italic">Auto-generate (GA)</span>
                      }
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 justify-between">
                <Button variant="outline" onClick={() => goToStep(1)}>Kembali</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || (isNumberedSeatMap && selectedSeats.length === 0)}
                  className="bg-charcoal hover:bg-charcoal/90 text-gold min-w-[180px]"
                >
                  {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengirim...</> : <><Send className="w-4 h-4 mr-2" />Kirim Tiket</>}
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
