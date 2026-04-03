'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DoorOpen, Check, X, Crown, User, GraduationCap, Loader2,
  ArrowLeft, Mail, Phone, Hash, Clock, CreditCard, Users, ChevronRight
} from 'lucide-react'

// =====================
// Types
// =====================
interface SeatData {
  id: string
  seatCode: string
  status: string
  row: string
  col: number
  priceCategory: {
    id: string
    name: string
    price: number
    colorCode: string
  } | null
  lockedUntil: string | null
}

interface PriceCategoryData {
  id: string
  name: string
  price: number
  colorCode: string
}

interface SeatOwnerInfo {
  owner: string
  email: string
  phone: string
  transactionId: string
  paymentStatus: string
  checkInTime: string | null
  paidAt: string | null
  totalAmount: number
}

interface EventData {
  id: string
  title: string
  category: string
  showDate: string
  location: string
}

// Seat layout configuration (same as public seat map)
const ROW_CONFIG = [
  { row: 'A', count: 8, category: 'VIP' },
  { row: 'B', count: 8, category: 'VIP' },
  { row: 'C', count: 10, category: 'VIP' },
  { row: 'D', count: 10, category: 'Regular' },
  { row: 'E', count: 10, category: 'Regular' },
  { row: 'F', count: 10, category: 'Regular' },
  { row: 'G', count: 10, category: 'Student' },
  { row: 'H', count: 10, category: 'Student' },
  { row: 'I', count: 12, category: 'Student' },
  { row: 'J', count: 12, category: 'Student' },
]

// Category display config
const CATEGORY_CONFIG: Record<string, { icon: typeof Crown; label: string; defaultColor: string }> = {
  VIP: { icon: Crown, label: 'VIP', defaultColor: '#C8A951' },
  Regular: { icon: User, label: 'Regular', defaultColor: '#8B8680' },
  Student: { icon: GraduationCap, label: 'Student', defaultColor: '#7BA7A5' },
}

export default function UsherSeatMapPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [seats, setSeats] = useState<SeatData[]>([])
  const [priceCategories, setPriceCategories] = useState<PriceCategoryData[]>([])
  const [event, setEvent] = useState<EventData | null>(null)
  const [seatOwnerMap, setSeatOwnerMap] = useState<Record<string, SeatOwnerInfo>>({})
  const [selectedSeat, setSelectedSeat] = useState<SeatOwnerInfo | null>(null)
  const [selectedSeatCode, setSelectedSeatCode] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch seats, event, and price categories
  useEffect(() => {
    if (!eventId) return

    async function fetchData() {
      try {
        const [seatsRes, eventRes, infoRes] = await Promise.all([
          fetch(`/api/events/${eventId}/seats`),
          fetch(`/api/events/${eventId}`),
          fetch(`/api/usher/seats-info?eventId=${eventId}`),
        ])

        if (!seatsRes.ok || !eventRes.ok) throw new Error('Failed to fetch event data')

        const seatsData = await seatsRes.json()
        const eventData = await eventRes.json()

        setSeats(seatsData.seats || [])
        setPriceCategories(seatsData.priceCategories || [])
        setEvent({
          id: eventData.id,
          title: eventData.title,
          category: eventData.category,
          showDate: eventData.showDate,
          location: eventData.location,
        })

        // Parse usher seats info
        if (infoRes.ok) {
          const infoData = await infoRes.json()
          setSeatOwnerMap(infoData.seats || {})
        }
      } catch (err) {
        setError('Gagal memuat data event')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()

    // Auto-refresh seats every 5 seconds
    const interval = setInterval(async () => {
      try {
        const [seatsRes, infoRes] = await Promise.all([
          fetch(`/api/events/${eventId}/seats`),
          fetch(`/api/usher/seats-info?eventId=${eventId}`),
        ])

        if (seatsRes.ok) {
          const seatsData = await seatsRes.json()
          setSeats(seatsData.seats || [])
        }

        if (infoRes.ok) {
          const infoData = await infoRes.json()
          setSeatOwnerMap(infoData.seats || {})

          // Refresh selected seat info if it's still selected
          if (selectedSeatCode && infoData.seats?.[selectedSeatCode]) {
            setSelectedSeat(infoData.seats[selectedSeatCode])
          }
        }
      } catch {
        // Silently ignore refresh errors
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [eventId, selectedSeatCode])

  // Handle seat click (read-only — only sold seats show info)
  const handleSeatClick = useCallback((seat: SeatData) => {
    if (seat.status === 'SOLD') {
      const ownerInfo = seatOwnerMap[seat.seatCode]
      if (ownerInfo) {
        setSelectedSeatCode(seat.seatCode)
        setSelectedSeat(ownerInfo)
      }
    } else {
      setSelectedSeatCode(null)
      setSelectedSeat(null)
    }
  }, [seatOwnerMap])

  // Compute seat stats
  const totalSeats = seats.length
  const soldSeats = seats.filter((s) => s.status === 'SOLD').length
  const availableSeats = seats.filter((s) => s.status === 'AVAILABLE').length
  const lockedSeats = seats.filter((s) => s.status === 'LOCKED_TEMPORARY').length
  const checkedInSeats = Object.values(seatOwnerMap).filter((s) => s.checkInTime).length

  const getSeatColor = (seat: SeatData) => {
    if (seat.status === 'SOLD') {
      // Checked-in seats get a different shade
      const ownerInfo = seatOwnerMap[seat.seatCode]
      if (ownerInfo?.checkInTime) {
        return 'bg-success'
      }
      return 'bg-seat-sold'
    }
    if (seat.status === 'LOCKED_TEMPORARY') return 'bg-seat-locked'
    if (seat.status === 'INVITATION') return 'bg-seat-invitation'
    if (seat.status === 'UNAVAILABLE') return 'bg-gray-200 opacity-30'
    return 'bg-white border-2'
  }

  const getSeatBorderColor = (seat: SeatData) => {
    if (seat.status === 'AVAILABLE') {
      return seat.priceCategory?.colorCode || '#C8A951'
    }
    return 'transparent'
  }

  const getRowColor = (row: string) => {
    const config = ROW_CONFIG.find((r) => r.row === row)
    if (!config) return '#8B8680'
    return CATEGORY_CONFIG[config.category]?.defaultColor || '#8B8680'
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-gold animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Memuat peta kursi...</p>
        </div>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="text-center py-20">
        <p className="text-danger text-sm">{error || 'Event tidak ditemukan'}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="mt-3"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Kembali
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <button
            onClick={() => router.push('/admin/usher/events')}
            className="text-xs text-muted-foreground hover:text-charcoal transition-colors flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Database Penonton
          </button>
          <h1 className="font-serif text-xl font-bold text-charcoal">
            {event.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Peta Kursi — Mode Baca Saja
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Kursi</p>
            <p className="text-lg font-bold text-charcoal">{totalSeats}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Terjual</p>
            <p className="text-lg font-bold text-charcoal">{soldSeats}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Check-In</p>
            <p className="text-lg font-bold text-success">{checkedInSeats}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Tersedia</p>
            <p className="text-lg font-bold text-charcoal">{availableSeats}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Dikunci</p>
            <p className="text-lg font-bold text-seat-locked">{lockedSeats}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content: Seat Map + Info Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Seat Map */}
        <div className="lg:col-span-2">
          <Card className="border-border/50">
            <CardContent className="p-4 sm:p-6">
              <div className="w-full max-w-3xl mx-auto">
                {/* Stage */}
                <div className="relative mb-6">
                  <div className="bg-charcoal rounded-xl py-5 px-8 text-center stage-glow border border-gold/20">
                    <p className="font-serif text-gold text-lg sm:text-xl tracking-[0.3em] font-semibold">
                      S T A G E
                    </p>
                    <p className="font-serif text-gold/60 text-xs sm:text-sm tracking-[0.2em] mt-1">
                      T E A T E R &nbsp; R E N D R A
                    </p>
                  </div>
                </div>

                {/* Entrance */}
                <div className="flex items-center justify-center gap-2 mb-4 text-muted-foreground">
                  <DoorOpen className="w-4 h-4" />
                  <span className="text-xs tracking-widest uppercase">Entrance</span>
                  <DoorOpen className="w-4 h-4" />
                </div>

                {/* Seat Grid */}
                <div className="overflow-x-auto pb-4">
                  <div className="min-w-[320px]">
                    {ROW_CONFIG.map((rowConfig) => (
                      <div key={rowConfig.row} className="flex items-center gap-1 mb-1">
                        {/* Row Label */}
                        <div
                          className="w-6 text-center text-xs font-semibold font-serif shrink-0"
                          style={{ color: getRowColor(rowConfig.row) }}
                        >
                          {rowConfig.row}
                        </div>

                        {/* Left Section */}
                        <div className="flex gap-1 justify-center flex-1">
                          {Array.from({ length: Math.ceil(rowConfig.count / 2) }, (_, i) => {
                            const seatCode = `${rowConfig.row}-${i + 1}`
                            const seat = seats.find((s) => s.seatCode === seatCode)
                            if (!seat) return <div key={seatCode} className="w-7 h-7 sm:w-8 sm:h-8" />

                            const isSold = seat.status === 'SOLD'
                            const isLocked = seat.status === 'LOCKED_TEMPORARY'
                            const isUnavailable = seat.status === 'UNAVAILABLE'
                            const isInvitation = seat.status === 'INVITATION'
                            const isClickable = isSold
                            const isSelected = selectedSeatCode === seatCode

                            return (
                              <button
                                key={seatCode}
                                onClick={() => handleSeatClick(seat)}
                                className={cn(
                                  'w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center text-[9px] sm:text-[10px] font-medium transition-all duration-200',
                                  getSeatColor(seat),
                                  isClickable && 'cursor-pointer hover:scale-110 hover:shadow-md',
                                  !isClickable && 'cursor-default',
                                  isUnavailable && 'opacity-20',
                                  isSold && 'text-white',
                                  isLocked && 'text-white',
                                  isSelected && 'ring-2 ring-gold ring-offset-1'
                                )}
                                style={
                                  seat.status === 'AVAILABLE'
                                    ? { borderColor: getSeatBorderColor(seat) }
                                    : undefined
                                }
                                title={
                                  isSold
                                    ? `${seatCode} — Klik untuk detail`
                                    : isLocked
                                    ? `${seatCode} — Dikunci`
                                    : seat.status === 'AVAILABLE'
                                    ? `${seatCode} — Tersedia`
                                    : `${seatCode}`
                                }
                              >
                                {isSold && <Check className="w-3 h-3" />}
                                {isLocked && <span className="text-[8px]">⏳</span>}
                                {isUnavailable && <X className="w-3 h-3" />}
                                {isInvitation && <span className="text-[8px]">🎉</span>}
                                {!isSold && !isLocked && !isUnavailable && !isInvitation && (
                                  <span className="sm:hidden">{i + 1}</span>
                                )}
                                {!isSold && !isLocked && !isUnavailable && !isInvitation && (
                                  <span className="hidden sm:inline">{i + 1}</span>
                                )}
                              </button>
                            )
                          })}
                        </div>

                        {/* Aisle */}
                        <div className="w-6 sm:w-8 shrink-0" />

                        {/* Right Section */}
                        <div className="flex gap-1 justify-center flex-1">
                          {Array.from({ length: Math.floor(rowConfig.count / 2) }, (_, i) => {
                            const seatNum = Math.ceil(rowConfig.count / 2) + i + 1
                            const seatCode = `${rowConfig.row}-${seatNum}`
                            const seat = seats.find((s) => s.seatCode === seatCode)
                            if (!seat) return <div key={seatCode} className="w-7 h-7 sm:w-8 sm:h-8" />

                            const isSold = seat.status === 'SOLD'
                            const isLocked = seat.status === 'LOCKED_TEMPORARY'
                            const isUnavailable = seat.status === 'UNAVAILABLE'
                            const isInvitation = seat.status === 'INVITATION'
                            const isClickable = isSold
                            const isSelected = selectedSeatCode === seatCode

                            return (
                              <button
                                key={seatCode}
                                onClick={() => handleSeatClick(seat)}
                                className={cn(
                                  'w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center text-[9px] sm:text-[10px] font-medium transition-all duration-200',
                                  getSeatColor(seat),
                                  isClickable && 'cursor-pointer hover:scale-110 hover:shadow-md',
                                  !isClickable && 'cursor-default',
                                  isUnavailable && 'opacity-20',
                                  isSold && 'text-white',
                                  isLocked && 'text-white',
                                  isSelected && 'ring-2 ring-gold ring-offset-1'
                                )}
                                style={
                                  seat.status === 'AVAILABLE'
                                    ? { borderColor: getSeatBorderColor(seat) }
                                    : undefined
                                }
                                title={
                                  isSold
                                    ? `${seatCode} — Klik untuk detail`
                                    : isLocked
                                    ? `${seatCode} — Dikunci`
                                    : seat.status === 'AVAILABLE'
                                    ? `${seatCode} — Tersedia`
                                    : `${seatCode}`
                                }
                              >
                                {isSold && <Check className="w-3 h-3" />}
                                {isLocked && <span className="text-[8px]">⏳</span>}
                                {isUnavailable && <X className="w-3 h-3" />}
                                {isInvitation && <span className="text-[8px]">🎉</span>}
                                {!isSold && !isLocked && !isUnavailable && !isInvitation && (
                                  <span className="sm:hidden">{seatNum}</span>
                                )}
                                {!isSold && !isLocked && !isUnavailable && !isInvitation && (
                                  <span className="hidden sm:inline">{seatNum}</span>
                                )}
                              </button>
                            )
                          })}
                        </div>

                        {/* Row Label Right */}
                        <div
                          className="w-6 text-center text-xs font-semibold font-serif shrink-0"
                          style={{ color: getRowColor(rowConfig.row) }}
                        >
                          {rowConfig.row}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Legend */}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded border-2 bg-white" style={{ borderColor: '#C8A951' }} />
                    <span>Tersedia</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded bg-seat-sold" />
                    <span>Terjual</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded bg-success" />
                    <span>Sudah Check-In</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded bg-seat-locked" />
                    <span>Dikunci</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded bg-seat-invitation" />
                    <span>Undangan</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded bg-gray-200 opacity-30" />
                    <span>Tidak Tersedia</span>
                  </div>
                </div>

                {/* Price Category Legend */}
                {priceCategories.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
                    {priceCategories.map((cat) => {
                      const catConfig = CATEGORY_CONFIG[cat.name]
                      const Icon = catConfig?.icon || User
                      return (
                        <div key={cat.id} className="flex items-center gap-1.5">
                          <Icon className="w-4 h-4" style={{ color: cat.colorCode || catConfig?.defaultColor }} />
                          <span className="text-muted-foreground">{cat.name}</span>
                          <span className="font-medium text-charcoal">Rp {cat.price.toLocaleString('id-ID')}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Seat Info Panel */}
        <div className="lg:col-span-1">
          {selectedSeat && selectedSeatCode ? (
            <Card className="border-gold/30 animate-fade-in sticky top-4">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-serif text-base text-charcoal flex items-center gap-2">
                    <Hash className="w-4 h-4 text-gold" />
                    {selectedSeatCode}
                  </CardTitle>
                  <button
                    onClick={() => { setSelectedSeat(null); setSelectedSeatCode(null) }}
                    className="text-muted-foreground hover:text-charcoal text-xs"
                  >
                    Tutup
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Owner Info */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Nama Pemesan</p>
                    <p className="text-sm font-semibold text-charcoal">{selectedSeat.owner}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Mail className="w-3 h-3" /> Email
                    </p>
                    <p className="text-sm text-charcoal break-all">{selectedSeat.email}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Phone className="w-3 h-3" /> WhatsApp
                    </p>
                    <p className="text-sm text-charcoal">{selectedSeat.phone}</p>
                  </div>
                </div>

                {/* Divider */}
                <div className="zen-divider" />

                {/* Transaction Details */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Hash className="w-3 h-3" /> Transaction ID
                    </p>
                    <p className="text-xs font-mono text-charcoal bg-gray-50 px-2 py-1 rounded break-all">
                      {selectedSeat.transactionId}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <CreditCard className="w-3 h-3" /> Total Pembayaran
                    </p>
                    <p className="text-sm font-semibold text-charcoal">
                      Rp {selectedSeat.totalAmount.toLocaleString('id-ID')}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Status Pembayaran</p>
                    <Badge className="bg-success/10 text-success border-success/20 text-xs">
                      {selectedSeat.paymentStatus}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Status Check-In
                    </p>
                    {selectedSeat.checkInTime ? (
                      <div className="space-y-1">
                        <Badge className="bg-success/10 text-success border-success/20 text-xs">
                          ✓ Sudah Check-In
                        </Badge>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(selectedSeat.checkInTime).toLocaleString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    ) : (
                      <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                        Belum Check-In
                      </Badge>
                    )}
                  </div>

                  {selectedSeat.paidAt && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Waktu Bayar</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(selectedSeat.paidAt).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/30">
              <CardContent className="p-6 text-center">
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-charcoal/5 flex items-center justify-center mx-auto">
                    <Users className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Detail Penonton
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Klik kursi yang <span className="font-semibold">terjual</span> untuk melihat informasi pemesan
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
