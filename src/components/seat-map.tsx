'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { DoorOpen, Lock, Unlock, Check, X, Crown, User, GraduationCap, Loader2, AlertTriangle, Minus, Plus, Ticket, Clock } from 'lucide-react'
import { StageRenderer, ObjectsOverlay } from '@/lib/stage-renderer'
import { Button } from '@/components/ui/button'
import { cleanupExpiredLocks } from '@/lib/seat-cleanup'
import { getSessionId } from '@/lib/session-id'
import { useSeatSocket } from '@/lib/socket'
import { parseLayoutData, type ParsedLayout } from '@/lib/seat-layout'

// =====================
// Types
// =====================
interface SeatData {
  id: string
  seatCode: string
  status: string
  row: string
  col: number
  zoneName?: string | null
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

interface SeatMapProps {
  eventId: string
  showDateId?: string | null
  seats: SeatData[]
  priceCategories: PriceCategoryData[]
  layoutData?: any
  layoutImage?: string | null
  gaZoneConfig?: string | null
  seatType?: string | null
  onSelectionChange?: (selectedSeats: SeatData[], totalPrice: number) => void
  onProceedToCheckout?: (selectedSeats: SeatData[]) => void
}

// Category display config
const CATEGORY_CONFIG: Record<string, { icon: typeof Crown; label: string; defaultColor: string }> = {
  VIP: { icon: Crown, label: 'VIP', defaultColor: '#C8A951' },
  Regular: { icon: User, label: 'Regular', defaultColor: '#8B8680' },
  Student: { icon: GraduationCap, label: 'Student', defaultColor: '#7BA7A5' },
}

const LOCK_DURATION = 10 * 60 * 1000 // 10 minutes
const SEAT_W = 28 // px per seat
const SEAT_GAP = 3 // px gap between seats in a block



// =====================
// Seat Map Component
// =====================
export function SeatMap({ eventId, showDateId, seats: initialSeats, priceCategories, layoutData, layoutImage, gaZoneConfig, seatType, onSelectionChange, onProceedToCheckout }: SeatMapProps) {
  const [seats, setSeats] = useState<SeatData[]>(initialSeats)
  const [selectedSeatCodes, setSelectedSeatCodes] = useState<Set<string>>(new Set())
  const [isLocked, setIsLocked] = useState(false) // Whether seats are confirmed locked via API
  const [lockCountdown, setLockCountdown] = useState<number | null>(null)
  const [isLocking, setIsLocking] = useState(false)
  const [lockRejectionMsg, setLockRejectionMsg] = useState<string | null>(null)
  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const sessionId = useRef(getSessionId())
  const selectedSeatCodesRef = useRef<Set<string>>(new Set())

  // GA-specific state
  const [selectedGAZoneId, setSelectedGAZoneId] = useState<string | null>(null)
  const [selectedGAQty, setSelectedGAQty] = useState(1)

  // Sync seats from props when initialSeats changes
  const [prevInitialSeats, setPrevInitialSeats] = useState(initialSeats)
  if (initialSeats !== prevInitialSeats) {
    setPrevInitialSeats(initialSeats)
    setSeats(initialSeats)
    setSelectedSeatCodes(new Set())
    setIsLocked(false)
    setLockCountdown(null)
    setSelectedGAZoneId(null)
    setSelectedGAQty(1)
  }

  const onSelectionChangeRef = useRef(onSelectionChange)
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange
  }, [onSelectionChange])

  // Parse layoutData
  const parsedLayout = useMemo(() => parseLayoutData(layoutData), [layoutData]) as ParsedLayout | null

  // Build seat lookup by seatCode
  const seatLookup = useMemo(() => {
    const map = new Map<string, SeatData>()
    for (const seat of seats) {
      map.set(seat.seatCode, seat)
    }
    return map
  }, [seats])

  // Auto-dismiss lock rejection message
  useEffect(() => {
    if (!lockRejectionMsg) return
    const t = setTimeout(() => setLockRejectionMsg(null), 5000)
    return () => clearTimeout(t)
  }, [lockRejectionMsg])

  const {
    isConnected,
    onSeatLocked,
    onSeatUnlocked,
    onSeatSold,
    onAllSeatsStatus,
    lockSeats,
    unlockSeats,
    onSeatLockRejected,
    onSeatsLockRejected,
  } = useSeatSocket(eventId)

  // Keep ref in sync with state
  useEffect(() => {
    selectedSeatCodesRef.current = selectedSeatCodes
  }, [selectedSeatCodes])

  // Socket event handlers
  useEffect(() => {
    onSeatLocked((payload) => {
      const myCodes = selectedSeatCodesRef.current
      if (payload.sessionId !== sessionId.current && myCodes.has(payload.seatCode)) {
        setSelectedSeatCodes((prev) => {
          const next = new Set(prev)
          next.delete(payload.seatCode)
          return next
        })
        setLockRejectionMsg('Kursi ' + payload.seatCode + ' diambil orang lain')
        return
      }
      setSeats((prev) =>
        prev.map((s) =>
          s.seatCode === payload.seatCode
            ? { ...s, status: 'LOCKED_TEMPORARY', lockedUntil: new Date(payload.lockedUntil).toISOString() }
            : s
        )
      )
    })

    onSeatUnlocked((payload) => {
      setSeats((prev) =>
        prev.map((s) =>
          s.seatCode === payload.seatCode
            ? { ...s, status: 'AVAILABLE', lockedUntil: null }
            : s
        )
      )
    })

    onSeatSold((payload) => {
      const myCodes = selectedSeatCodesRef.current
      if (myCodes.has(payload.seatCode)) {
        setSelectedSeatCodes((prev) => {
          const next = new Set(prev)
          next.delete(payload.seatCode)
          if (next.size === 0) {
            setIsLocked(false)
            setLockCountdown(null)
          }
          return next
        })
        setLockRejectionMsg('Kursi ' + payload.seatCode + ' sudah terbeli')
        return
      }
      setSeats((prev) =>
        prev.map((s) =>
          s.seatCode === payload.seatCode
            ? { ...s, status: 'SOLD', lockedUntil: null }
            : s
        )
      )
    })

    onAllSeatsStatus((payload) => {
      if (payload.eventId !== eventId) return
      const myCodes = selectedSeatCodesRef.current
      const stolenSeats: string[] = []
      setSeats((prev) => {
        const updated = prev.map((s) => {
          const lockInfo = payload.seats.find((ls) => ls.seatCode === s.seatCode)
          if (!lockInfo) return s
          if (lockInfo.status === 'SOLD') {
            if (myCodes.has(s.seatCode)) stolenSeats.push(s.seatCode)
            return { ...s, status: 'SOLD', lockedUntil: null }
          }
          if (lockInfo.status === 'AVAILABLE') {
            if (myCodes.has(s.seatCode)) return s
            return { ...s, status: 'AVAILABLE', lockedUntil: null }
          }
          if (lockInfo.status === 'LOCKED_TEMPORARY' && lockInfo.lockedUntil > Date.now()) {
            if (lockInfo.sessionId !== sessionId.current && myCodes.has(s.seatCode)) {
              stolenSeats.push(s.seatCode)
              return s
            }
            return { ...s, status: 'LOCKED_TEMPORARY', lockedUntil: new Date(lockInfo.lockedUntil).toISOString() }
          }
          return s
        })
        return updated
      })
      if (stolenSeats.length > 0) {
        setSelectedSeatCodes((prev) => {
          const next = new Set(prev)
          for (const code of stolenSeats) next.delete(code)
          if (next.size === 0) {
            setIsLocked(false)
            setLockCountdown(null)
          }
          return next
        })
        setLockRejectionMsg('Kursi ' + stolenSeats.join(', ') + ' sedang dipilih orang lain')
      }
    })

    onSeatLockRejected((payload) => {
      const myCodes = selectedSeatCodesRef.current
      if (myCodes.has(payload.seatCode)) {
        setSelectedSeatCodes((prev) => {
          const next = new Set(prev)
          next.delete(payload.seatCode)
          if (next.size === 0) {
            setIsLocked(false)
            setLockCountdown(null)
          }
          return next
        })
        setLockRejectionMsg('Kursi ' + payload.seatCode + ' sedang dipilih orang lain')
      }
    })

    onSeatsLockRejected((payload) => {
      if (payload.rejectedSeats.length > 0) {
        const rejectedCodes = payload.rejectedSeats.map((r) => r.seatCode)
        setSelectedSeatCodes((prev) => {
          const next = new Set(prev)
          for (const code of rejectedCodes) next.delete(code)
          if (next.size === 0) {
            setIsLocked(false)
            setLockCountdown(null)
          }
          return next
        })
        setLockRejectionMsg('Kursi ' + rejectedCodes.join(', ') + ' sedang dipilih orang lain')
      }
    })

    return () => {}
  }, [onSeatLocked, onSeatUnlocked, onSeatSold, onAllSeatsStatus, onSeatLockRejected, onSeatsLockRejected, eventId])

  // Poll seats from API every 3 seconds
  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    const pollSeats = async () => {
      try {
        const myCodes = selectedSeatCodesRef.current
        const bust = '_t=' + Date.now()
        const url = '/api/events/' + eventId + '/seats?' + (showDateId ? 'showDateId=' + showDateId + '&' : '') + bust
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (cancelled) return
        const data = Array.isArray(json) ? json : json.seats
        if (!Array.isArray(data)) return
        setSeats((prev) =>
          prev.map((s) => {
            if (myCodes.has(s.seatCode)) return s
            const fresh = data.find((f: any) => f.id === s.id)
            if (!fresh) return s
            if (fresh.status !== s.status || fresh.lockedUntil !== s.lockedUntil) {
              return { ...s, status: fresh.status, lockedUntil: fresh.lockedUntil }
            }
            return s
          })
        )
      } catch { /* silent */ }
    }
    const timeout = setTimeout(() => { pollSeats() }, 2000)
    const interval = setInterval(pollSeats, 3000)
    return () => { cancelled = true; clearTimeout(timeout); clearInterval(interval) }
  }, [eventId, showDateId])

  // Cleanup expired locks locally
  useEffect(() => {
    const CLOCK_SKEW_TOLERANCE = 2000
    const interval = setInterval(() => {
      const myCodes = selectedSeatCodesRef.current
      setSeats((prev) =>
        prev.map((s) => {
          if (myCodes.has(s.seatCode)) return s
          if (s.status === 'LOCKED_TEMPORARY' && s.lockedUntil) {
            if (Date.now() > new Date(s.lockedUntil).getTime() + CLOCK_SKEW_TOLERANCE) {
              return { ...s, status: 'AVAILABLE', lockedUntil: null }
            }
          }
          return s
        })
      )
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const notifyParentWithCodes = useCallback((codes: Set<string>) => {
    const handler = onSelectionChangeRef.current
    if (!handler) return
    const currentSeats = seats.filter((s) => codes.has(s.seatCode))
    const price = currentSeats.reduce((sum, s) => {
      const cat = priceCategories.find((pc) => pc.id === s.priceCategory?.id)
      return sum + (cat?.price || 0)
    }, 0)
    handler(currentSeats, price)
  }, [seats, priceCategories])

  // ═══════════════════════════════════════════════════════════
  // NEW FLOW: Manual Lock
  // ═══════════════════════════════════════════════════════════

  // Step 1: Select/deselect seats locally (no API call)
  const handleSeatClick = useCallback(async (seat: SeatData) => {
    // If seats are already locked, don't allow changing selection
    if (isLocked) return
    if (seat.status !== 'AVAILABLE' && !selectedSeatCodes.has(seat.seatCode)) return

    if (selectedSeatCodes.has(seat.seatCode)) {
      // Deselect
      const newCodes = new Set(selectedSeatCodes)
      newCodes.delete(seat.seatCode)
      setSelectedSeatCodes(newCodes)
      notifyParentWithCodes(newCodes)
    } else {
      // Select (visual only, no lock yet)
      const newCodes = new Set(selectedSeatCodes)
      newCodes.add(seat.seatCode)
      setSelectedSeatCodes(newCodes)
      notifyParentWithCodes(newCodes)
    }
  }, [selectedSeatCodes, isLocked, notifyParentWithCodes])

  // Step 2: Lock all selected seats via API
  const handleLockSeats = useCallback(async () => {
    if (selectedSeatCodes.size === 0 || isLocked || isLocking) return

    setIsLocking(true)
    setLockRejectionMsg(null)
    const allCodes = Array.from(selectedSeatCodes)

    try {
      // Socket broadcast (optimistic)
      lockSeats(allCodes, sessionId.current)

      // HTTP API lock (authoritative)
      const res = await fetch('/api/seats/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, seatCodes: allCodes, sessionId: sessionId.current, showDateId: showDateId || undefined }),
      })

      if (res.ok) {
        setIsLocked(true)
        setLockCountdown(LOCK_DURATION / 1000) // 10 minutes
      } else {
        const data = await res.json().catch(() => ({}))
        const rejected = data.rejectedSeats || []
        if (rejected.length > 0) {
          setSelectedSeatCodes((prev) => {
            const next = new Set(prev)
            for (const code of rejected) next.delete(code)
            return next
          })
          setLockRejectionMsg(data.error || 'Beberapa kursi sudah diambil orang lain')
          // Unlock the rejected seats via socket
          unlockSeats(rejected, sessionId.current)
        } else {
          setLockRejectionMsg(data.error || 'Gagal mengunci kursi')
        }
      }
    } catch (err) {
      console.error('Failed to lock seats:', err)
      setLockRejectionMsg('Gagal mengunci kursi. Coba lagi.')
    } finally {
      setIsLocking(false)
    }
  }, [selectedSeatCodes, isLocked, isLocking, eventId, showDateId, lockSeats, unlockSeats])

  // Step 3: Manual unlock — user clicks "Buka Kunci"
  const handleUnlockSeats = useCallback(async () => {
    const codes = Array.from(selectedSeatCodes)
    if (codes.length === 0) return

    unlockSeats(codes, sessionId.current)
    try {
      await fetch('/api/seats/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, seatCodes: codes, sessionId: sessionId.current, showDateId: showDateId || undefined }),
      })
    } catch (err) {
      console.error('Failed to unlock seats:', err)
    }

    setSelectedSeatCodes(new Set())
    setIsLocked(false)
    setLockCountdown(null)
    notifyParentWithCodes(new Set())
  }, [selectedSeatCodes, eventId, showDateId, unlockSeats, notifyParentWithCodes])

  // Auto-clear when countdown reaches 0
  const handleClearSelection = useCallback(async () => {
    const codes = Array.from(selectedSeatCodes)
    if (codes.length > 0) {
      unlockSeats(codes, sessionId.current)
      try {
        await fetch('/api/seats/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, seatCodes: codes, sessionId: sessionId.current, showDateId: showDateId || undefined }),
        })
      } catch (err) {
        console.error('Failed to unlock seats via API:', err)
      }
    }
    setSelectedSeatCodes(new Set())
    setIsLocked(false)
    setLockCountdown(null)
    notifyParentWithCodes(new Set())
  }, [selectedSeatCodes, eventId, showDateId, unlockSeats, notifyParentWithCodes])

  // Countdown timer
  useEffect(() => {
    if (lockCountdown === null) {
      if (lockTimerRef.current) clearInterval(lockTimerRef.current)
      return
    }
    lockTimerRef.current = setInterval(() => {
      setLockCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (lockTimerRef.current) clearInterval(lockTimerRef.current)
          handleClearSelection()
          return null
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (lockTimerRef.current) clearInterval(lockTimerRef.current) }
  }, [lockCountdown, handleClearSelection])

  // Calculate totals
  const selectedSeats = seats.filter((s) => selectedSeatCodes.has(s.seatCode))
  const totalPrice = selectedSeats.reduce((sum, s) => {
    const cat = priceCategories.find((pc) => pc.id === s.priceCategory?.id)
    return sum + (cat?.price || 0)
  }, 0)

  const getSeatColor = (seat: SeatData) => {
    if (seat.status === 'SOLD') return 'bg-seat-sold'
    if (selectedSeatCodes.has(seat.seatCode)) return 'bg-gold seat-selected'
    if (seat.status === 'LOCKED_TEMPORARY') return 'bg-seat-locked'
    if (seat.status === 'INVITATION') return 'bg-seat-invitation'
    if (seat.status === 'UNAVAILABLE') return 'bg-gray-200 opacity-30'
    return 'bg-white border-2'
  }

  const getSeatBorderColor = (seat: SeatData) => {
    if (seat.status === 'AVAILABLE' && !selectedSeatCodes.has(seat.seatCode)) {
      return seat.priceCategory?.colorCode || '#C8A951'
    }
    return 'transparent'
  }

  // Category color from sections (for layoutData mode)
  const getRowColorFromSections = (rowIdx: number) => {
    if (!parsedLayout) return '#8B8680'
    const section = parsedLayout.sections.find(s => rowIdx >= s.fromRow && rowIdx <= s.toRow)
    if (section) return CATEGORY_CONFIG[section.name]?.defaultColor || section.colorCode
    return '#8B8680'
  }

  // ═══════════════════════════════════════════════════════════
  // Seat Button Renderer (shared by both modes)
  // ═══════════════════════════════════════════════════════════
  const renderSeatButton = (seatData: SeatData | undefined, seatCode: string, displayNum: number, key: string) => {
    if (!seatData) {
      return (
        <div key={key} style={{ width: SEAT_W, height: SEAT_W }} className="shrink-0" />
      )
    }

    const isSelected = selectedSeatCodes.has(seatData.seatCode)
    const isClickable = (seatData.status === 'AVAILABLE' || isSelected) && !isLocked
    const isSold = seatData.status === 'SOLD'
    const isLockedByOther = seatData.status === 'LOCKED_TEMPORARY' && !isSelected
    const isUnavailable = seatData.status === 'UNAVAILABLE'

    return (
      <button
        key={key}
        onClick={() => isClickable && handleSeatClick(seatData)}
        disabled={!isClickable}
        className={cn(
          'shrink-0 rounded-md flex items-center justify-center text-[9px] sm:text-[10px] font-medium transition-all duration-200 relative',
          getSeatColor(seatData),
          isClickable && 'cursor-pointer hover:scale-110 hover:shadow-md',
          !isClickable && (isSelected ? 'cursor-default' : 'cursor-not-allowed'),
          isUnavailable && 'opacity-20',
          isSold && 'text-white',
          isLockedByOther && 'text-white',
          isSelected && 'text-charcoal font-bold'
        )}
        style={{
          width: SEAT_W,
          height: SEAT_W,
          ...(seatData.status === 'AVAILABLE' && !isSelected
            ? { borderColor: getSeatBorderColor(seatData) }
            : {}),
        }}
        title={
          isSold
            ? `${seatCode} - Sold`
            : isLockedByOther
            ? `${seatCode} - Dikunci orang lain`
            : isSelected
            ? isLocked
              ? `${seatCode} - Terkunci (klik Buka Kunci untuk mepasang)`
              : `${seatCode} - Terpilih (klik untuk batal)`
            : isLocked
            ? `${seatCode} - Pilihan terkunci`
            : `${seatCode} - ${seatData.priceCategory?.name || 'Uncategorized'} - Rp ${(seatData.priceCategory?.price || 0).toLocaleString('id-ID')}`
        }
      >
        {isSold && <Check className="w-3 h-3" />}
        {isLockedByOther && <Lock className="w-3 h-3" />}
        {isUnavailable && <X className="w-3 h-3" />}
        {!isSold && !isLockedByOther && !isUnavailable && (
          <span>{displayNum}</span>
        )}
      </button>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // Bottom Action Bar (shared by both NUMBERED and GA)
  // ═══════════════════════════════════════════════════════════
  const renderActionBar = () => {
    if (selectedSeatCodes.size === 0 && !isLocked) return null

    return (
      <div className="p-4 bg-white rounded-xl border border-[#C8A951]/20 shadow-sm animate-fade-in">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-charcoal">
              <Ticket className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              {selectedSeatCodes.size} tiket {isLocked ? 'terkunci' : 'dipilih'}
            </p>
            <p className="font-serif text-lg font-semibold text-[#C8A951] mt-1">
              Rp {totalPrice.toLocaleString('id-ID')}
            </p>
            {lockCountdown !== null && (
              <p className={cn(
                'text-xs font-mono font-semibold mt-1',
                lockCountdown < 120 ? 'text-red-500' : 'text-muted-foreground'
              )}>
                <Clock className="w-3 h-3 inline mr-1 -mt-0.5" />
                Waktu tersisa: {formatTime(lockCountdown)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isLocked ? (
              <>
                {/* Phase 1: Seats selected but not locked yet */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedSeatCodes(new Set())
                    setIsLocked(false)
                    setLockCountdown(null)
                    notifyParentWithCodes(new Set())
                  }}
                  className="text-xs text-muted-foreground"
                >
                  Batal
                </Button>
                <Button
                  onClick={handleLockSeats}
                  disabled={isLocking}
                  className="bg-[#C8A951] hover:bg-[#C8A951]/90 text-charcoal font-medium text-sm disabled:opacity-50"
                >
                  {isLocking ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengunci...</>
                  ) : (
                    <><Lock className="w-4 h-4 mr-2" />Kunci Kursi</>
                  )}
                </Button>
              </>
            ) : (
              <>
                {/* Phase 2: Seats are locked, ready for checkout */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUnlockSeats}
                  className="text-xs text-muted-foreground"
                >
                  <Unlock className="w-3 h-3 mr-1" />Buka Kunci
                </Button>
                <Button
                  onClick={() => onProceedToCheckout?.(selectedSeats)}
                  className="bg-charcoal hover:bg-charcoal/90 text-[#C8A951] font-medium text-sm"
                >
                  Lanjut Bayar
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // GA (General Admission) Hooks — always called, used conditionally
  // ═══════════════════════════════════════════════════════════

  const isSeatTypeGA = seatType === 'GENERAL_ADMISSION'

  const manualGAZones = useMemo(() => {
    if (!gaZoneConfig) return null
    try {
      const zones = JSON.parse(gaZoneConfig)
      if (!Array.isArray(zones) || zones.length === 0) return null
      return zones.map((z: any, i: number) => ({
        id: `ga-${i}`,
        name: z.name,
        capacity: z.capacity,
        color: z.color || '#22c55e',
        price: z.price || 0,
        priceCategoryName: z.priceCategoryName || '',
      }))
    } catch { return null }
  }, [gaZoneConfig, parsedLayout?.isGA])

  const isManualGA = !!manualGAZones || isSeatTypeGA

  const gaZones = manualGAZones || (parsedLayout?.isGA ? (parsedLayout.gaZones || []) : [])
  const isGA = isSeatTypeGA || gaZones.length > 0

  const zoneAvailability = useMemo(() => {
    if (!isGA) return new Map<string, { total: number; available: number; price: number; priceCatId: string | null }>()
    const avail = new Map<string, { total: number; available: number; price: number; priceCatId: string | null }>()
    for (const zone of gaZones) {
      const zoneSeats = seats.filter((s) => s.zoneName === zone.name)
      const total = zoneSeats.length
      const available = zoneSeats.filter((s) => s.status === 'AVAILABLE').length
      const firstSeat = zoneSeats[0]
      const price = firstSeat?.priceCategory?.price || 0
      const priceCatId = firstSeat?.priceCategory?.id || null
      avail.set(zone.id, { total, available, price, priceCatId })
    }
    return avail
  }, [seats, gaZones, isGA])

  const selectedGAZoneData = isGA && selectedGAZoneId ? zoneAvailability.get(selectedGAZoneId) || null : null

  const gaSelectedSeats = useMemo(() => {
    if (!isGA || !selectedGAZoneId) return []
    return seats.filter((s) => selectedSeatCodes.has(s.seatCode) && s.zoneName === gaZones.find(z => z.id === selectedGAZoneId)?.name)
  }, [seats, selectedSeatCodes, selectedGAZoneId, gaZones, isGA])

  // GA: Click zone card → select zone (visual only, no lock)
  const handleGAZoneClick = useCallback((zone: any) => {
    if (!isGA || isLocked) return
    if (selectedGAZoneId === zone.id) {
      // Deselect zone
      setSelectedGAZoneId(null)
      setSelectedGAQty(1)
      const zoneCodes = seats
        .filter((s) => selectedSeatCodes.has(s.seatCode) && s.zoneName === zone.name)
        .map((s) => s.seatCode)
      if (zoneCodes.length > 0) {
        const newCodes = new Set(selectedSeatCodes)
        for (const c of zoneCodes) newCodes.delete(c)
        setSelectedSeatCodes(newCodes)
        notifyParentWithCodes(newCodes)
      }
      return
    }

    // Switching zones — clear previous zone selection
    if (selectedGAZoneId) {
      const prevZone = gaZones.find((z) => z.id === selectedGAZoneId)
      const prevCodes = seats
        .filter((s) => selectedSeatCodes.has(s.seatCode) && prevZone && s.zoneName === prevZone.name)
        .map((s) => s.seatCode)
      if (prevCodes.length > 0) {
        const newCodes = new Set(selectedSeatCodes)
        for (const c of prevCodes) newCodes.delete(c)
        setSelectedSeatCodes(newCodes)
      }
    }

    setSelectedGAZoneId(zone.id)
    setSelectedGAQty(1)
  }, [isGA, isLocked, selectedGAZoneId, selectedSeatCodes, seats, gaZones, notifyParentWithCodes])

  // GA: Quantity change (visual only, no lock)
  const handleGAQtyChange = useCallback((newQty: number) => {
    if (!isGA || !selectedGAZoneId || isLocked) return
    const currentQty = selectedSeatCodes.size
    const zone = gaZones.find((z) => z.id === selectedGAZoneId)
    if (!zone) return
    const zoneSeats = seats.filter((s) => s.zoneName === zone.name && s.status === 'AVAILABLE')
    const clampedQty = Math.max(1, Math.min(newQty, zoneSeats.length + currentQty))
    setSelectedGAQty(clampedQty)
  }, [isGA, selectedGAZoneId, isLocked, selectedSeatCodes.size, seats, gaZones])

  // GA: Confirm quantity → update visual selection (no lock yet)
  const handleGAQtyConfirm = useCallback((targetQtyOverride?: number) => {
    if (!isGA || !selectedGAZoneId || !selectedGAZoneData || isLocked) return
    const zone = gaZones.find((z) => z.id === selectedGAZoneId)
    if (!zone) return

    const currentSelected = new Set(
      seats.filter((s) => selectedSeatCodes.has(s.seatCode) && s.zoneName === zone.name).map((s) => s.seatCode)
    )
    const targetQty = targetQtyOverride ?? selectedGAQty
    const needMore = targetQty - currentSelected.size

    if (needMore > 0) {
      const availableSeats = seats.filter(
        (s) => s.zoneName === zone.name && s.status === 'AVAILABLE' && !currentSelected.has(s.seatCode)
      )
      const toAdd = availableSeats.slice(0, needMore).map((s) => s.seatCode)
      if (toAdd.length === 0) return

      const newCodes = new Set(selectedSeatCodes)
      for (const c of toAdd) newCodes.add(c)
      setSelectedSeatCodes(newCodes)
      notifyParentWithCodes(newCodes)
    } else if (needMore < 0) {
      const selectedCodes = Array.from(currentSelected)
      const toRemove = selectedCodes.slice(0, Math.abs(needMore))

      const newCodes = new Set(selectedSeatCodes)
      for (const c of toRemove) newCodes.delete(c)
      setSelectedSeatCodes(newCodes)

      if (newCodes.size === 0) {
        setSelectedGAZoneId(null)
        setSelectedGAQty(1)
      }
      notifyParentWithCodes(newCodes)
    }
  }, [isGA, selectedGAZoneId, isLocked, selectedSeatCodes, selectedGAQty, seats, gaZones, notifyParentWithCodes, selectedGAZoneData])

  // GA: Quantity change with confirm
  const handleGAQtyChangeWithConfirm = useCallback((newQty: number) => {
    if (!isGA || !selectedGAZoneId || isLocked) return
    const currentQty = selectedSeatCodes.size
    const zone = gaZones.find((z) => z.id === selectedGAZoneId)
    if (!zone) return
    const zoneSeats = seats.filter((s) => s.zoneName === zone.name && s.status === 'AVAILABLE')
    const clampedQty = Math.max(1, Math.min(newQty, zoneSeats.length + currentQty))
    setSelectedGAQty(clampedQty)
    handleGAQtyConfirm(clampedQty)
  }, [isGA, selectedGAZoneId, isLocked, selectedSeatCodes.size, seats, gaZones, handleGAQtyConfirm])

  // GA: Clear all (unlock if locked, then clear)
  const handleGAClear = useCallback(async () => {
    if (!isGA || !selectedGAZoneId) return
    const zone = gaZones.find((z) => z.id === selectedGAZoneId)
    if (!zone) return

    const zoneCodes = seats
      .filter((s) => selectedSeatCodes.has(s.seatCode) && s.zoneName === zone.name)
      .map((s) => s.seatCode)

    if (isLocked && zoneCodes.length > 0) {
      unlockSeats(zoneCodes, sessionId.current)
      try {
        await fetch('/api/seats/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, seatCodes: zoneCodes, sessionId: sessionId.current, showDateId: showDateId || undefined }),
        })
      } catch { /* silent */ }
    }

    setSelectedGAZoneId(null)
    setSelectedGAQty(1)
    setSelectedSeatCodes(new Set())
    setIsLocked(false)
    setLockCountdown(null)
    notifyParentWithCodes(new Set())
  }, [isGA, isLocked, selectedGAZoneId, selectedSeatCodes, seats, gaZones, eventId, showDateId, unlockSeats, notifyParentWithCodes])

  // GA: Lock seats (same as numbered, but for GA zones)
  const handleGALockSeats = useCallback(async () => {
    if (selectedSeatCodes.size === 0 || isLocked || isLocking) return

    setIsLocking(true)
    setLockRejectionMsg(null)
    const allCodes = Array.from(selectedSeatCodes)

    try {
      lockSeats(allCodes, sessionId.current)
      const res = await fetch('/api/seats/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, seatCodes: allCodes, sessionId: sessionId.current, showDateId: showDateId || undefined }),
      })

      if (res.ok) {
        setIsLocked(true)
        setLockCountdown(LOCK_DURATION / 1000)
      } else {
        const data = await res.json().catch(() => ({}))
        const rejected = data.rejectedSeats || []
        if (rejected.length > 0) {
          setSelectedSeatCodes((prev) => {
            const next = new Set(prev)
            for (const code of rejected) next.delete(code)
            return next
          })
          setLockRejectionMsg(data.error || 'Beberapa kursi sudah diambil orang lain')
          unlockSeats(rejected, sessionId.current)
        } else {
          setLockRejectionMsg(data.error || 'Gagal mengunci kursi')
        }
      }
    } catch (err) {
      console.error('Failed to lock GA seats:', err)
      setLockRejectionMsg('Gagal mengunci kursi. Coba lagi.')
    } finally {
      setIsLocking(false)
    }
  }, [selectedSeatCodes, isLocked, isLocking, eventId, showDateId, lockSeats, unlockSeats])

  // GA: Clear zone selection when all locked GA seats are lost
  const [prevGASelectedCodes, setPrevGASelectedCodes] = useState<Set<string>>(new Set())
  if (isGA && selectedGAZoneId) {
    const currentLockedCodes = new Set(
      seats.filter((s) => selectedSeatCodes.has(s.seatCode) && s.zoneName === gaZones.find(z => z.id === selectedGAZoneId)?.name).map((s) => s.seatCode)
    )
    if (currentLockedCodes.size === 0 && prevGASelectedCodes.size > 0) {
      setSelectedGAQty(1)
      setSelectedGAZoneId(null)
      setIsLocked(false)
      setLockCountdown(null)
    }
    if (currentLockedCodes.size !== prevGASelectedCodes.size) {
      setPrevGASelectedCodes(currentLockedCodes)
    }
  } else {
    if (prevGASelectedCodes.size > 0) setPrevGASelectedCodes(new Set())
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: General Admission (GA) Mode
  // ═══════════════════════════════════════════════════════════
  if (isGA) {
    const gaStageType = parsedLayout?.stageType || 'PROSCENIUM'
    const effectiveLayoutImage = layoutImage || parsedLayout?.layoutImageUrl || null

    return (
      <div className="w-full space-y-4">
        {/* Lock rejection notice */}
        {lockRejectionMsg && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 animate-fade-in flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {lockRejectionMsg}
          </div>
        )}

        {/* Stage — only for layout-based GA */}
        {!isManualGA && (
          <div className="flex justify-center">
            <StageRenderer stageType={gaStageType} size="lg" thrustWidth={parsedLayout?.thrustWidth} thrustDepth={parsedLayout?.thrustDepth} />
          </div>
        )}

        {/* Layout Image */}
        {effectiveLayoutImage && (
          <div className="w-full rounded-xl overflow-hidden border border-gray-200">
            <img
              src={effectiveLayoutImage}
              alt="Layout Venue"
              className="w-full h-auto"
            />
          </div>
        )}

        {/* GA Zones Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {gaZones.map((zone) => {
            const avail = zoneAvailability.get(zone.id)
            const isSelected = selectedGAZoneId === zone.id
            const available = avail?.available || 0
            const price = avail?.price || 0

            return (
              <button
                key={zone.id}
                type="button"
                onClick={() => handleGAZoneClick(zone)}
                disabled={available === 0 && !isSelected}
                className={cn(
                  'p-4 rounded-xl border-2 text-left transition-all duration-200 w-full',
                  isSelected
                    ? 'border-[#C8A951] bg-[#C8A951]/5 shadow-sm'
                    : available === 0
                    ? 'border-gray-200 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 hover:border-[#C8A951]/50 hover:shadow-sm cursor-pointer'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-sm shrink-0"
                    style={{ backgroundColor: zone.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className={cn(
                      'font-semibold text-sm text-charcoal truncate',
                      isSelected && 'text-[#C8A951]'
                    )}>
                      {zone.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Kapasitas: {zone.capacity} orang
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className={cn(
                    'text-sm font-medium',
                    available === 0 ? 'text-red-500' : 'text-green-600'
                  )}>
                    Tersedia: {available}
                  </p>
                  {price > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Rp {price.toLocaleString('id-ID')}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Quantity Picker for Selected Zone */}
        {selectedGAZoneId && selectedGAZoneData && (
          <div className="p-4 bg-white rounded-xl border border-[#C8A951]/20 shadow-sm animate-fade-in">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-charcoal">
                  {selectedGAZoneData.available} kursi tersedia di zona ini
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {gaZones.find(z => z.id === selectedGAZoneId)?.name}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {lockCountdown !== null && (
                  <div className={cn(
                    'px-3 py-1 rounded-full text-xs font-mono font-semibold',
                    lockCountdown < 120 ? 'bg-red-50 text-red-600' : 'bg-[#C8A951]/10 text-[#C8A951]'
                  )}>
                    ⏱ {formatTime(lockCountdown)}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleGAQtyChangeWithConfirm(selectedGAQty - 1)}
                    disabled={selectedGAQty <= 1 || isLocked}
                    className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-10 text-center text-lg font-semibold text-charcoal">
                    {selectedSeatCodes.size}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleGAQtyChangeWithConfirm(selectedGAQty + 1)}
                    disabled={selectedSeatCodes.size >= selectedGAZoneData.available || isLocked}
                    className="w-8 h-8 rounded-full border border-[#C8A951]/50 flex items-center justify-center text-[#C8A951] hover:bg-[#C8A951]/5 disabled:opacity-30 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGAClear}
                  className="text-xs text-muted-foreground"
                >
                  Batal
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Action Bar: Lock / Unlock / Checkout */}
        {renderActionBar()}
      </div>
    )
  }

  
  // ═══════════════════════════════════════════════════════════
  // RENDER: LayoutData Mode — Flat Grid (1:1 match with editor)
  // ═══════════════════════════════════════════════════════════
  if (parsedLayout) {
    const { gridSize, rowLabels: lLabels, rowSeatMap, embeddedRows, displayRows, sections, canvasSeats, fullCanvasBounds } = parsedLayout
    const { cols } = gridSize
    const aisleColumns: number[] = (parsedLayout as any).aisleColumns || []

    const embeddedInto: Record<number, number[]> = {}
    for (const [srcStr, tgt] of Object.entries(embeddedRows)) {
      const src = parseInt(srcStr)
      if (!embeddedInto[tgt]) embeddedInto[tgt] = []
      embeddedInto[tgt].push(src)
    }

    const gridLookup = new Map<number, Map<number, { seatCode: string; seatNum: number }>>()
    for (const ri of displayRows) {
      const colMap = new Map<number, { seatCode: string; seatNum: number }>()
      const rowSeats = rowSeatMap.get(ri) || []
      for (const s of rowSeats) {
        const label = lLabels[ri] || String.fromCharCode(65 + ri)
        colMap.set(s.c, { seatCode: `${label}-${s.seatNum}`, seatNum: s.seatNum })
      }
      const srcRows = embeddedInto[ri] || []
      for (const srcRi of srcRows) {
        const srcSeats = rowSeatMap.get(srcRi) || []
        const srcLabel = lLabels[srcRi] || String.fromCharCode(65 + srcRi)
        for (const s of srcSeats) {
          colMap.set(s.c, { seatCode: `${srcLabel}-${s.seatNum}`, seatNum: s.seatNum })
        }
      }
      gridLookup.set(ri, colMap)
    }

    const CELL_TOTAL = SEAT_W + SEAT_GAP
    const gridW = cols * CELL_TOTAL - SEAT_GAP + 60
    const LABEL_W = 24
    const middleRowIndex = isInsetStage ? Math.floor(displayRows.length / 2) : -1

    // Check if canvas mode
    const useCanvasMode = !!canvasSeats && canvasSeats.length > 0

    // ── Canvas Mode ──
    if (useCanvasMode) {
      return (
        <div className="w-full space-y-4">
          {lockRejectionMsg && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 animate-fade-in flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {lockRejectionMsg}
            </div>
          )}
          <div className="flex justify-center">
            <CanvasSeatLayoutRenderer
              parsedLayout={parsedLayout}
              seatLookup={seatLookup}
              renderSeatButton={renderSeatButton}
            />
          </div>
          {renderActionBar()}
        </div>
      )
    }

    // ── Grid Mode ──
    // (legacy grid rendering — this part is very long and mostly unchanged)
    // We'll use the same approach as before but with the new action bar

    const stagePosition = parsedLayout?.stagePosition
    const hasCustomStagePosition = stagePosition && typeof stagePosition.x === 'number'
    const csb = parsedLayout?.canvasSeatBounds
    const hasBounds = !!csb && cols > 0 && displayRows.length > 0

    return (
      <div className="w-full space-y-4">
        {lockRejectionMsg && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 animate-fade-in flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {lockRejectionMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <div className="flex justify-center">
            <StageRenderer stageType={stageType as any || 'PROSCENIUM'} size="md" thrustWidth={parsedLayout?.thrustWidth} thrustDepth={parsedLayout?.thrustDepth} />
          </div>
          <div className="flex justify-center" style={{ minWidth: gridW }}>
            <div style={{ width: gridW }}>
              {displayRows.map((ri, rowIdx) => {
                const colMap = gridLookup.get(ri)
                if (!colMap) return null
                const label = lLabels[ri] || String.fromCharCode(65 + ri)
                const isMiddleRow = isInsetStage && rowIdx === middleRowIndex
                return (
                  <div key={ri} className={cn('flex items-center gap-0 justify-center', isMiddleRow && 'mt-6')}>
                    <div className="w-6 text-center text-[9px] text-muted-foreground font-medium shrink-0">{label}</div>
                    <div className="flex" style={{ gap: SEAT_GAP }}>
                      {Array.from({ length: cols }, (_, ci) => {
                        const info = colMap.get(ci)
                        if (!info) return <div key={ci} style={{ width: SEAT_W, height: SEAT_W }} className="shrink-0" />
                        const seatData = seatLookup.get(info.seatCode)
                        return renderSeatButton(seatData, info.seatCode, info.seatNum, `${ri}-${ci}`)
                      })}
                    </div>
                    <div className="w-6 text-center text-[9px] text-muted-foreground font-medium shrink-0">{label}</div>
                    {isMiddleRow && (
                      <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '50%' }}>
                        <StageRenderer stageType="PROSCENIUM" size="sm" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {renderActionBar()}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: Fallback — No layout data, show simple list
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="w-full space-y-4">
      {lockRejectionMsg && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 animate-fade-in flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {lockRejectionMsg}
        </div>
      )}

      <div className="flex justify-center">
        <StageRenderer stageType="PROSCENIUM" size="md" />
      </div>

      {/* Simple seat grid */}
      <div className="flex flex-wrap gap-2 justify-center">
        {seats.map((seat) => renderSeatButton(seat, seat.seatCode, seat.col, seat.id))}
      </div>

      {renderActionBar()}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// Canvas Seat Layout Renderer (helper component)
// ═══════════════════════════════════════════════════════════
function CanvasSeatLayoutRenderer({
  parsedLayout,
  seatLookup,
  renderSeatButton,
}: {
  parsedLayout: ParsedLayout
  seatLookup: Map<string, SeatData>
  renderSeatButton: (seatData: SeatData | undefined, seatCode: string, displayNum: number, key: string) => React.ReactNode
}) {
  const { canvasSeats, fullCanvasBounds } = parsedLayout
  if (!canvasSeats || canvasSeats.length === 0 || !fullCanvasBounds) return null

  const { width: canvasW, height: canvasH } = fullCanvasBounds
  const containerW = 600
  const scale = containerW / canvasW
  const containerH = canvasH * scale

  return (
    <div className="relative mx-auto" style={{ width: containerW, height: containerH }}>
      {canvasSeats.map((cs, idx) => {
        const scaledX = cs.x * scale
        const scaledY = cs.y * scale
        const size = cs.size * scale
        const seatData = seatLookup.get(cs.seatCode)
        return (
          <div key={idx} className="absolute" style={{ left: scaledX, top: scaledY, width: size, height: size }}>
            {renderSeatButton(seatData, cs.seatCode, cs.seatNum, `canvas-${idx}`)}
          </div>
        )
      })}
    </div>
  )
}
