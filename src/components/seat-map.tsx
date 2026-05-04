'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { DoorOpen, Lock, Check, X, Crown, User, GraduationCap, Loader2, AlertTriangle, Minus, Plus, Ticket } from 'lucide-react'
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
export function SeatMap({ eventId, showDateId, seats: initialSeats, priceCategories, layoutData, onSelectionChange, onProceedToCheckout }: SeatMapProps) {
  const [seats, setSeats] = useState<SeatData[]>(initialSeats)
  const [selectedSeatCodes, setSelectedSeatCodes] = useState<Set<string>>(new Set())
  const [lockCountdown, setLockCountdown] = useState<number | null>(null)
  const [isLocking, setIsLocking] = useState(false)
  const [lockRejectionMsg, setLockRejectionMsg] = useState<string | null>(null)
  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pendingLockRef = useRef<Set<string>>(new Set())
  const [hasPendingLock, setHasPendingLock] = useState(false)

  const sessionId = useRef(getSessionId())
  const selectedSeatCodesRef = useRef<Set<string>>(new Set())

  // GA-specific state
  const [selectedGAZoneId, setSelectedGAZoneId] = useState<string | null>(null)
  const [selectedGAQty, setSelectedGAQty] = useState(1)

  // Sync seats from props when initialSeats changes (e.g., switching show dates).
  // Uses the "adjusting state during render" pattern recommended by React docs,
  // because useEffect + setState is not allowed in React 19 strict mode.
  const [prevInitialSeats, setPrevInitialSeats] = useState(initialSeats)
  if (initialSeats !== prevInitialSeats) {
    setPrevInitialSeats(initialSeats)
    setSeats(initialSeats)
    setSelectedSeatCodes(new Set())
    setLockCountdown(null)
    setHasPendingLock(false)
    setSelectedGAZoneId(null)
    setSelectedGAQty(1)
  }

  const onSelectionChangeRef = useRef(onSelectionChange)
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange
  }, [onSelectionChange])

  // Parse layoutData
  const parsedLayout = useMemo(() => parseLayoutData(layoutData), [layoutData]) as ParsedLayout | null

  // Build seat lookup by seatCode (state-derived, not ref, to avoid render-time ref access)
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

  // Keep ref in sync with state (no re-register needed)
  useEffect(() => {
    selectedSeatCodesRef.current = selectedSeatCodes
  }, [selectedSeatCodes])

  // Socket event handlers — use refs, NOT selectedSeatCodes in deps
  // This prevents re-registering listeners on every seat click (which caused flickering)
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
          // Handle all status transitions, not just LOCKED_TEMPORARY
          if (lockInfo.status === 'SOLD') {
            if (myCodes.has(s.seatCode)) stolenSeats.push(s.seatCode)
            return { ...s, status: 'SOLD', lockedUntil: null }
          }
          if (lockInfo.status === 'AVAILABLE') {
            // Only update to AVAILABLE if the seat wasn't just locked by us
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
          if (next.size === 0) setLockCountdown(null)
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
          if (next.size === 0) setLockCountdown(null)
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
          if (next.size === 0) setLockCountdown(null)
          return next
        })
        setLockRejectionMsg('Kursi ' + rejectedCodes.join(', ') + ' sedang dipilih orang lain')
      }
    })

    return () => {}
  }, [onSeatLocked, onSeatUnlocked, onSeatSold, onAllSeatsStatus, onSeatLockRejected, onSeatsLockRejected, eventId])

  // Poll seats from API every 2 seconds — uses refs, NOT selectedSeatCodes in deps
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
    const timeout = setTimeout(() => { pollSeats() }, 1500)
    const interval = setInterval(pollSeats, 2000)
    return () => { cancelled = true; clearTimeout(timeout); clearInterval(interval) }
  }, [eventId, showDateId])

  // Cleanup expired locks locally — with 2s clock skew tolerance to prevent flickering
  useEffect(() => {
    const CLOCK_SKEW_TOLERANCE = 2000 // 2 seconds buffer
    const interval = setInterval(() => {
      const myCodes = selectedSeatCodesRef.current
      setSeats((prev) =>
        prev.map((s) => {
          if (myCodes.has(s.seatCode)) return s // never expire own locks locally
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

  const updatePendingState = useCallback((codes: Set<string>) => {
    const hasPending = codes.size > 0 && Array.from(codes).some(c => pendingLockRef.current.has(c))
    setHasPendingLock(hasPending)
  }, [])

  const handleSeatClick = useCallback(async (seat: SeatData) => {
    if (seat.status !== 'AVAILABLE') return

    if (selectedSeatCodes.has(seat.seatCode)) {
      const newCodes = new Set(selectedSeatCodes)
      newCodes.delete(seat.seatCode)
      setSelectedSeatCodes(newCodes)
      pendingLockRef.current.delete(seat.seatCode)
      updatePendingState(newCodes)
      unlockSeats([seat.seatCode], sessionId.current)
      fetch('/api/seats/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, seatCodes: [seat.seatCode], sessionId: sessionId.current, showDateId: showDateId || undefined }),
      }).catch(() => {})
      notifyParentWithCodes(newCodes)
    } else {
      const newCodes = new Set(selectedSeatCodes)
      newCodes.add(seat.seatCode)
      setSelectedSeatCodes(newCodes)
      const allCodes = Array.from(newCodes)
      for (const c of allCodes) pendingLockRef.current.add(c)
      setHasPendingLock(true)
      lockSeats(allCodes, sessionId.current)
      fetch('/api/seats/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, seatCodes: allCodes, sessionId: sessionId.current, showDateId: showDateId || undefined }),
      }).then((res) => {
        for (const c of allCodes) pendingLockRef.current.delete(c)
        updatePendingState(newCodes)
        if (!res.ok) {
          res.json().then((data) => {
            const rejected = data.rejectedSeats || []
            if (rejected.length > 0) {
              setSelectedSeatCodes((prev) => {
                const next = new Set(prev)
                for (const code of rejected) next.delete(code)
                if (next.size === 0) setLockCountdown(null)
                return next
              })
              setLockRejectionMsg(data.error || 'Kursi sudah diambil orang lain')
            }
          }).catch(() => {})
        }
      }).catch((err) => {
        for (const c of allCodes) pendingLockRef.current.delete(c)
        updatePendingState(newCodes)
        console.error('Failed to lock seat via API:', err)
      })
      if (selectedSeatCodes.size === 0) {
        setLockCountdown(LOCK_DURATION / 1000)
      }
      notifyParentWithCodes(newCodes)
    }
  }, [selectedSeatCodes, eventId, lockSeats, unlockSeats, notifyParentWithCodes, updatePendingState, showDateId])

  const handleClearSelection = useCallback(async () => {
    const codes = Array.from(selectedSeatCodes)
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
    setSelectedSeatCodes(new Set())
    pendingLockRef.current.clear()
    setHasPendingLock(false)
    setLockCountdown(null)
    notifyParentWithCodes(new Set())
  }, [selectedSeatCodes, eventId, unlockSeats, notifyParentWithCodes, showDateId])

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
      // Empty placeholder — no seat in DB for this position
      return (
        <div key={key} style={{ width: SEAT_W, height: SEAT_W }} className="shrink-0" />
      )
    }

    const isClickable = seatData.status === 'AVAILABLE' || selectedSeatCodes.has(seatData.seatCode)
    const isSold = seatData.status === 'SOLD'
    const isLocked = seatData.status === 'LOCKED_TEMPORARY' && !selectedSeatCodes.has(seatData.seatCode)
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
          !isClickable && 'cursor-not-allowed',
          isUnavailable && 'opacity-20',
          isSold && 'text-white',
          isLocked && 'text-white',
          selectedSeatCodes.has(seatData.seatCode) && 'text-charcoal font-bold'
        )}
        style={{
          width: SEAT_W,
          height: SEAT_W,
          ...(seatData.status === 'AVAILABLE' && !selectedSeatCodes.has(seatData.seatCode)
            ? { borderColor: getSeatBorderColor(seatData) }
            : {}),
        }}
        title={
          isSold
            ? `${seatCode} - Sold`
            : isLocked
            ? `${seatCode} - Locked`
            : selectedSeatCodes.has(seatData.seatCode)
            ? `${seatCode} - Selected (click to deselect)`
            : `${seatCode} - ${seatData.priceCategory?.name || 'Uncategorized'} - Rp ${(seatData.priceCategory?.price || 0).toLocaleString('id-ID')}`
        }
      >
        {isSold && <Check className="w-3 h-3" />}
        {isLocked && <Lock className="w-3 h-3" />}
        {isUnavailable && <X className="w-3 h-3" />}
        {!isSold && !isLocked && !isUnavailable && (
          <span className="sm:hidden">{displayNum}</span>
        )}
        {!isSold && !isLocked && !isUnavailable && (
          <span className="hidden sm:inline">{displayNum}</span>
        )}
      </button>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // GA (General Admission) Hooks — always called, used conditionally
  // ═══════════════════════════════════════════════════════════
  const gaZones = parsedLayout?.isGA ? (parsedLayout.gaZones || []) : []
  const isGA = parsedLayout?.isGA && gaZones.length > 0

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

  const handleGAZoneClick = useCallback((zone: any) => {
    if (!isGA) return
    if (selectedGAZoneId === zone.id) {
      setSelectedGAZoneId(null)
      setSelectedGAQty(1)
      const zoneCodes = seats
        .filter((s) => selectedSeatCodes.has(s.seatCode) && s.zoneName === zone.name)
        .map((s) => s.seatCode)
      if (zoneCodes.length > 0) {
        const newCodes = new Set(selectedSeatCodes)
        for (const c of zoneCodes) newCodes.delete(c)
        setSelectedSeatCodes(newCodes)
        unlockSeats(zoneCodes, sessionId.current)
        fetch('/api/seats/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, seatCodes: zoneCodes, sessionId: sessionId.current, showDateId: showDateId || undefined }),
        }).catch(() => {})
        notifyParentWithCodes(newCodes)
        if (newCodes.size === 0) setLockCountdown(null)
      }
      return
    }

    if (selectedGAZoneId) {
      const prevZone = gaZones.find((z) => z.id === selectedGAZoneId)
      const prevCodes = seats
        .filter((s) => selectedSeatCodes.has(s.seatCode) && prevZone && s.zoneName === prevZone.name)
        .map((s) => s.seatCode)
      if (prevCodes.length > 0) {
        const newCodes = new Set(selectedSeatCodes)
        for (const c of prevCodes) newCodes.delete(c)
        setSelectedSeatCodes(newCodes)
        unlockSeats(prevCodes, sessionId.current)
      }
    }

    setSelectedGAZoneId(zone.id)
    setSelectedGAQty(1)
  }, [isGA, selectedGAZoneId, selectedSeatCodes, seats, gaZones, eventId, showDateId, unlockSeats, notifyParentWithCodes])

  const handleGAQtyChange = useCallback((newQty: number) => {
    if (!isGA || !selectedGAZoneId) return
    const currentQty = selectedSeatCodes.size
    const zone = gaZones.find((z) => z.id === selectedGAZoneId)
    if (!zone) return
    const zoneSeats = seats.filter((s) => s.zoneName === zone.name && s.status === 'AVAILABLE')
    const clampedQty = Math.max(1, Math.min(newQty, zoneSeats.length + currentQty))
    setSelectedGAQty(clampedQty)
  }, [isGA, selectedGAZoneId, selectedSeatCodes.size, seats, gaZones])

  const handleGAQtyConfirm = useCallback(async () => {
    if (!isGA || !selectedGAZoneId || !selectedGAZoneData) return
    const zone = gaZones.find((z) => z.id === selectedGAZoneId)
    if (!zone) return

    const currentLocked = new Set(
      seats.filter((s) => selectedSeatCodes.has(s.seatCode) && s.zoneName === zone.name).map((s) => s.seatCode)
    )
    const targetQty = selectedGAQty
    const needMore = targetQty - currentLocked.size

    if (needMore > 0) {
      const availableSeats = seats.filter(
        (s) => s.zoneName === zone.name && s.status === 'AVAILABLE' && !currentLocked.has(s.seatCode)
      )
      const toLock = availableSeats.slice(0, needMore).map((s) => s.seatCode)
      if (toLock.length === 0) return

      const newCodes = new Set(selectedSeatCodes)
      for (const c of toLock) newCodes.add(c)
      for (const c of toLock) pendingLockRef.current.add(c)
      setSelectedSeatCodes(newCodes)
      setHasPendingLock(true)

      lockSeats(Array.from(newCodes), sessionId.current)
      fetch('/api/seats/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, seatCodes: Array.from(newCodes), sessionId: sessionId.current, showDateId: showDateId || undefined }),
      }).then((res) => {
        for (const c of toLock) pendingLockRef.current.delete(c)
        setHasPendingLock(false)
        if (!res.ok) {
          res.json().then((data) => {
            const rejected = data.rejectedSeats || []
            if (rejected.length > 0) {
              setSelectedSeatCodes((prev) => {
                const next = new Set(prev)
                for (const code of rejected) next.delete(code)
                if (next.size === 0) setLockCountdown(null)
                return next
              })
              setLockRejectionMsg(data.error || 'Kursi sudah diambil orang lain')
            }
          }).catch(() => {})
        }
      }).catch(() => {
        for (const c of toLock) pendingLockRef.current.delete(c)
        setHasPendingLock(false)
      })

      if (currentLocked.size === 0) setLockCountdown(LOCK_DURATION / 1000)
    }

    notifyParentWithCodes(new Set(selectedSeatCodes))
  }, [isGA, selectedGAZoneId, selectedSeatCodes, selectedGAQty, seats, gaZones, eventId, showDateId, lockSeats, notifyParentWithCodes, selectedGAZoneData])

  const handleGAClear = useCallback(async () => {
    if (!isGA || !selectedGAZoneId) return
    const zone = gaZones.find((z) => z.id === selectedGAZoneId)
    if (!zone) return

    const zoneCodes = seats
      .filter((s) => selectedSeatCodes.has(s.seatCode) && s.zoneName === zone.name)
      .map((s) => s.seatCode)

    unlockSeats(zoneCodes, sessionId.current)
    try {
      await fetch('/api/seats/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, seatCodes: zoneCodes, sessionId: sessionId.current, showDateId: showDateId || undefined }),
      })
    } catch { /* silent */ }

    setSelectedGAZoneId(null)
    setSelectedGAQty(1)
    setSelectedSeatCodes(new Set())
    pendingLockRef.current.clear()
    setHasPendingLock(false)
    setLockCountdown(null)
    notifyParentWithCodes(new Set())
  }, [isGA, selectedGAZoneId, selectedSeatCodes, seats, gaZones, eventId, showDateId, unlockSeats, notifyParentWithCodes])

  // GA: Clear zone selection when all locked GA seats are lost (sold/locked by others)
  // Uses "adjusting state during render" pattern (React 19 compatible)
  const [prevGASelectedCodes, setPrevGASelectedCodes] = useState<Set<string>>(new Set())
  if (isGA && selectedGAZoneId) {
    const currentLockedCodes = new Set(
      seats.filter((s) => selectedSeatCodes.has(s.seatCode) && s.zoneName === gaZones.find(z => z.id === selectedGAZoneId)?.name).map((s) => s.seatCode)
    )
    if (currentLockedCodes.size === 0 && prevGASelectedCodes.size > 0) {
      setSelectedGAQty(1)
      setSelectedGAZoneId(null)
    }
    if (currentLockedCodes.size !== prevGASelectedCodes.size) {
      setPrevGASelectedCodes(currentLockedCodes)
    }
  } else {
    if (prevGASelectedCodes.size > 0) setPrevGASelectedCodes(new Set())
  }

  // Integrate qty confirmation directly into the qty change handler
  const handleGAQtyChangeWithConfirm = useCallback((newQty: number) => {
    if (!isGA || !selectedGAZoneId) return
    const currentQty = selectedSeatCodes.size
    const zone = gaZones.find((z) => z.id === selectedGAZoneId)
    if (!zone) return
    const zoneSeats = seats.filter((s) => s.zoneName === zone.name && s.status === 'AVAILABLE')
    const clampedQty = Math.max(1, Math.min(newQty, zoneSeats.length + currentQty))
    setSelectedGAQty(clampedQty)
    setTimeout(() => handleGAQtyConfirm(), 0)
  }, [isGA, selectedGAZoneId, selectedSeatCodes.size, seats, gaZones, selectedGAQty, handleGAQtyConfirm])

  // ═══════════════════════════════════════════════════════════
  // RENDER: General Admission (GA) Mode — Zone Cards with Capacity
  // ═══════════════════════════════════════════════════════════
  if (isGA) {
    const gaStageType = parsedLayout?.stageType || 'PROSCENIUM'

    return (
      <div className="w-full space-y-4">
        {/* Lock rejection notice */}
        {lockRejectionMsg && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 animate-fade-in flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {lockRejectionMsg}
          </div>
        )}

        {/* Stage */}
        <div className="flex justify-center">
          <StageRenderer stageType={gaStageType} size="lg" thrustWidth={parsedLayout?.thrustWidth} thrustDepth={parsedLayout?.thrustDepth} />
        </div>

        {/* Layout Image (if exported) */}
        {parsedLayout?.layoutImageUrl && (
          <div className="w-full rounded-xl overflow-hidden border border-gray-200">
            <img
              src={parsedLayout.layoutImageUrl}
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
                {lockCountdown && (
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
                    disabled={selectedGAQty <= 1}
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
                    disabled={selectedSeatCodes.size >= selectedGAZoneData.available}
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

        {/* Checkout Button */}
        {selectedSeatCodes.size > 0 && (
          <div className="p-4 bg-white rounded-xl border border-[#C8A951]/20 shadow-sm animate-fade-in">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-charcoal">
                  <Ticket className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  {selectedSeatCodes.size} tiket dipilih
                </p>
                <p className="font-serif text-lg font-semibold text-[#C8A951] mt-1">
                  Rp {totalPrice.toLocaleString('id-ID')}
                </p>
              </div>
              <Button
                onClick={() => onProceedToCheckout?.(selectedSeats)}
                disabled={hasPendingLock}
                className="bg-charcoal hover:bg-charcoal/90 text-[#C8A951] font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title={hasPendingLock ? 'Menunggu konfirmasi...' : undefined}
              >
                {hasPendingLock ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengunci...</>
                ) : (
                  'Lanjut Bayar'
                )}
              </Button>
            </div>
          </div>
        )}
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

    // Build reverse map: target row → source rows
    const embeddedInto: Record<number, number[]> = {}
    for (const [srcStr, tgt] of Object.entries(embeddedRows)) {
      const src = parseInt(srcStr)
      if (!embeddedInto[tgt]) embeddedInto[tgt] = []
      embeddedInto[tgt].push(src)
    }

    // Build grid lookup: displayRow → col → { seatCode, seatNum }
    // This merges embedded row seats into their target rows at the same column positions
    const gridLookup = new Map<number, Map<number, { seatCode: string; seatNum: number }>>()
    for (const ri of displayRows) {
      const colMap = new Map<number, { seatCode: string; seatNum: number }>()

      // This row's own seats
      const rowSeats = rowSeatMap.get(ri) || []
      for (const s of rowSeats) {
        const label = lLabels[ri] || String.fromCharCode(65 + ri)
        colMap.set(s.c, { seatCode: `${label}-${s.seatNum}`, seatNum: s.seatNum })
      }

      // Embedded source rows' seats — injected at their actual column positions
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

    // Calculate container width from grid columns
    const CELL_TOTAL = SEAT_W + SEAT_GAP // each grid cell (seat + gap)
    const gridW = cols * CELL_TOTAL - SEAT_GAP + 60 // +60 for row labels
    const LABEL_W = 24 // w-6 = 24px row label area

    // Stage placement: use stagePosition from layoutData if available, otherwise default
    const stageType = parsedLayout?.stageType || 'PROSCENIUM'
    const isInsetStage = stageType === 'BLACK_BOX' || stageType === 'ARENA'
    const stageSize = isInsetStage ? 'md' : 'lg'
    const middleRowIndex = isInsetStage ? Math.floor(displayRows.length / 2) : -1
    const stagePosition = parsedLayout?.stagePosition
    const hasCustomStagePosition = stagePosition && typeof stagePosition.x === 'number'

    // Check if we should use canvas-based rendering (when canvasSeats are available)
    const useCanvasMode = !!canvasSeats && canvasSeats.length > 0

    // ── Canvas → Guest View coordinate mapping ──────────────────────────
    // Map canvas pixel positions (stage, objects) to the guest view grid.
    // We use canvasSeatBounds (bounding box of seats in canvas pixels)
    // and map that to the guest grid area (cols × displayRows × CELL_TOTAL).
    const csb = parsedLayout?.canvasSeatBounds
    const hasBounds = !!csb && cols > 0 && displayRows.length > 0
    const guestGridW = cols * CELL_TOTAL
    const guestGridH = displayRows.length * CELL_TOTAL

    // Helper: transform canvas (cx, cy, cw, ch) → guest (gx, gy, gw, gh)
    function toGuest(cx: number, cy: number, cw: number, ch: number) {
      if (!csb) return { x: cx, y: cy, w: cw, h: ch }
      return {
        x: LABEL_W + ((cx - csb.originX) / csb.spanX) * guestGridW,
        y: ((cy - csb.originY) / csb.spanY) * guestGridH,
        w: (cw / csb.spanX) * guestGridW,
        h: (ch / csb.spanY) * guestGridH,
      }
    }

    // Calculate paddingTop to accommodate elements above the seat grid.
    // If stage/objects are above the first seat row (canvas Y < seatOriginY),
    // they would get negative guest Y. We add paddingTop to shift everything down.
    let stageGuest = hasCustomStagePosition && hasBounds
      ? toGuest(stagePosition.x, stagePosition.y, stagePosition.width, stagePosition.height) : null
    const allGuestYs: number[] = []
    if (stageGuest) allGuestYs.push(stageGuest.y)
    if (parsedLayout?.objects) {
      for (const obj of parsedLayout.objects) {
        if (typeof obj.x === 'number' && typeof obj.y === 'number' && hasBounds) {
          const g = toGuest(obj.x, obj.y, obj.pixelW || 60, obj.pixelH || 30)
          allGuestYs.push(g.y)
        }
      }
    }
    const minGuestY = allGuestYs.length > 0 ? Math.min(...allGuestYs) : 0
    const paddingTop = minGuestY < 0 ? Math.ceil(-minGuestY) + 4 : 0

    // Re-calculate stage guest position with paddingTop offset
    if (stageGuest && paddingTop > 0) {
      stageGuest = { ...stageGuest, y: stageGuest.y + paddingTop }
    }

    // ══════════════════════════════════════════════════════════════════════
    // RENDER: Canvas-Based Mode (free-form absolute positioning)
    // ══════════════════════════════════════════════════════════════════════
    if (useCanvasMode) {
      const cSeats = canvasSeats!
      const bounds = fullCanvasBounds

      // Calculate scale to fit container
      const CONTAINER_MAX_W = 600
      const rawCanvasW = bounds ? bounds.width + bounds.x : (parsedLayout.canvasWidth || 400)
      const rawCanvasH = bounds ? bounds.height + bounds.y : (parsedLayout.canvasHeight || 400)
      const scale = Math.min(CONTAINER_MAX_W / rawCanvasW, 1.2)

      const PAINTED_SEAT = 28
      const renderedW = rawCanvasW * scale
      const renderedH = rawCanvasH * scale
      const seatSize = PAINTED_SEAT * scale

      const cStagePos = parsedLayout.stagePosition
      const hasStage = cStagePos && typeof cStagePos.x === 'number'

      // Group seats by rowLabel for row labels (NOT raw Y — prevents duplicate
      // labels when seats in the same logical row have slightly different Y values)
      const labelGroups = new Map<string, typeof cSeats[0][]>()
      for (const s of cSeats) {
        if (!labelGroups.has(s.rowLabel)) labelGroups.set(s.rowLabel, [])
        labelGroups.get(s.rowLabel)!.push(s)
      }
      // Sort labels by their first seat's Y position (top to bottom)
      const sortedLabels = [...labelGroups.entries()].sort((a, b) => {
        const aMinY = Math.min(...a[1].map(s => s.y))
        const bMinY = Math.min(...b[1].map(s => s.y))
        return aMinY - bMinY
      })

      // Canvas seat renderer
      const renderCanvasSeatButton = (seatData: SeatData | undefined, canvasSeat: typeof cSeats[0], x: number, y: number, size: number, key: number) => {
        if (!seatData) {
          return (
            <div
              key={key}
              className="absolute"
              style={{ left: x, top: y, width: size, height: size }}
            />
          )
        }

        const isClickable = seatData.status === 'AVAILABLE' || selectedSeatCodes.has(seatData.seatCode)
        const isSold = seatData.status === 'SOLD'
        const isLocked = seatData.status === 'LOCKED_TEMPORARY' && !selectedSeatCodes.has(seatData.seatCode)
        const isUnavailable = seatData.status === 'UNAVAILABLE'

        return (
          <button
            key={key}
            onClick={() => isClickable && handleSeatClick(seatData)}
            disabled={!isClickable}
            className={cn(
              'absolute rounded-md flex items-center justify-center text-[9px] font-medium transition-all duration-200',
              getSeatColor(seatData),
              isClickable && 'cursor-pointer hover:scale-110 hover:shadow-md',
              !isClickable && 'cursor-not-allowed',
              isUnavailable && 'opacity-20',
              isSold && 'text-white',
              isLocked && 'text-white',
              selectedSeatCodes.has(seatData.seatCode) && 'text-charcoal font-bold'
            )}
            style={{
              left: x,
              top: y,
              width: size,
              height: size,
              ...(seatData.status === 'AVAILABLE' && !selectedSeatCodes.has(seatData.seatCode)
                ? { borderColor: getSeatBorderColor(seatData) }
                : {}),
            }}
            title={
              isSold
                ? `${canvasSeat.seatCode} - Sold`
                : isLocked
                ? `${canvasSeat.seatCode} - Locked`
                : selectedSeatCodes.has(seatData.seatCode)
                ? `${canvasSeat.seatCode} - Selected (click to deselect)`
                : `${canvasSeat.seatCode} - ${seatData.priceCategory?.name || 'Uncategorized'} - Rp ${(seatData.priceCategory?.price || 0).toLocaleString('id-ID')}`
            }
          >
            {isSold && <Check className="w-3 h-3" />}
            {isLocked && <Lock className="w-3 h-3" />}
            {isUnavailable && <X className="w-3 h-3" />}
            {!isSold && !isLocked && !isUnavailable && (
              <span>{canvasSeat.seatNum}</span>
            )}
          </button>
        )
      }

      return (
        <div className="w-full">
          {/* Lock rejection notice */}
          {lockRejectionMsg && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 animate-fade-in flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {lockRejectionMsg}
            </div>
          )}

          <div className="overflow-x-auto pb-4">
            <div className="min-w-[320px] px-2 flex justify-center">
              <div
                className="relative"
                style={{
                  width: renderedW + 40,
                  height: renderedH + 10,
                }}
              >
                {/* Row labels on the left — grouped by rowLabel, positioned at min Y of group */}
                {sortedLabels.map(([label, seats], rowIdx) => {
                  const rowColor = getRowColorFromSections(rowIdx)
                  const labelY = Math.min(...seats.map(s => s.y))
                  const scaledY = labelY * scale

                  return (
                    <div
                      key={label}
                      className="absolute text-center text-xs font-semibold font-serif"
                      style={{
                        left: 0,
                        top: scaledY,
                        width: 28,
                        height: seatSize,
                        lineHeight: `${seatSize}px`,
                        color: rowColor,
                      }}
                    >
                      {label}
                    </div>
                  )
                })}

                {/* Seat grid area (offset by label width) */}
                <div className="absolute" style={{ left: 32, top: 0 }}>
                  {/* Stage layer (z-index 10, above seats) */}
                  {hasStage && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: cStagePos.x * scale,
                        top: cStagePos.y * scale,
                        width: cStagePos.width * scale,
                        height: cStagePos.height * scale,
                        zIndex: 10,
                      }}
                    >
                      <StageRenderer
                        stageType={parsedLayout.stageType || 'PROSCENIUM'}
                        size="lg"
                        thrustWidth={parsedLayout.thrustWidth}
                        thrustDepth={parsedLayout.thrustDepth}
                        fillParent
                      />
                    </div>
                  )}

                  {/* Objects layer (z-index 5) */}
                  {parsedLayout.objects?.map((obj) => {
                    if (typeof obj.x !== 'number' || typeof obj.y !== 'number') return null
                    return (
                      <div
                        key={obj.id}
                        className="absolute pointer-events-none rounded"
                        style={{
                          left: obj.x * scale,
                          top: obj.y * scale,
                          width: (obj.pixelW || 60) * scale,
                          height: (obj.pixelH || 30) * scale,
                          backgroundColor: obj.color || '#6B7280',
                          opacity: 0.6,
                          zIndex: 5,
                        }}
                      >
                        {obj.label && (
                          <span className="text-[8px] text-white px-1">{obj.label}</span>
                        )}
                      </div>
                    )
                  })}

                  {/* Seats layer (z-index 1) */}
                  {cSeats.map((seat, idx) => {
                    const seatData = seatLookup.get(seat.seatCode)
                    const scaledX = seat.x * scale
                    const scaledY = seat.y * scale
                    return renderCanvasSeatButton(seatData, seat, scaledX, scaledY, seatSize, idx)
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Selection Summary */}
          {selectedSeatCodes.size > 0 && (
            <div className="mt-6 p-4 bg-white rounded-xl border border-gold/20 shadow-sm animate-fade-in">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-charcoal">
                    {selectedSeatCodes.size} kursi dipilih
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedSeats.map((s) => s.seatCode).join(', ')}
                  </p>
                  <p className="font-serif text-lg font-semibold text-gold mt-1">
                    Rp {totalPrice.toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {lockCountdown && (
                    <div className={cn(
                      'px-3 py-1 rounded-full text-xs font-mono font-semibold',
                      lockCountdown < 120 ? 'bg-red-50 text-danger' : 'bg-gold/10 text-gold-dark'
                    )}>
                      ⏱ {formatTime(lockCountdown)}
                    </div>
                  )}
                  <Button variant="ghost" size="sm" onClick={handleClearSelection} className="text-xs text-muted-foreground">
                    Batal
                  </Button>
                  <Button
                    onClick={() => onProceedToCheckout?.(selectedSeats)}
                    disabled={hasPendingLock}
                    className="bg-charcoal hover:bg-charcoal/90 text-gold font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title={hasPendingLock ? 'Menunggu konfirmasi kursi...' : undefined}
                  >
                    {hasPendingLock ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengunci...</>
                    ) : (
                      'Lanjut Bayar'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )
    } // end canvas mode

    // ══════════════════════════════════════════════════════════════════════
    // RENDER: Grid Mode (fallback for legacy data without seatColumns)
    // ══════════════════════════════════════════════════════════════════════
    return (
      <div className="w-full">
        {/* Lock rejection notice */}
        {lockRejectionMsg && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 animate-fade-in flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {lockRejectionMsg}
          </div>
        )}

        <div className="overflow-x-auto pb-4">
          <div className="min-w-[320px] px-2">
            <div className="relative mx-auto w-fit flex flex-col items-center" style={{ minWidth: gridW, paddingTop }}>
              {/* Stage — INSIDE scroll container */}
              {hasCustomStagePosition && stageGuest ? (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: stageGuest.x,
                    top: stageGuest.y,
                    width: stageGuest.w,
                    height: stageGuest.h,
                    zIndex: 10,
                  }}
                >
                  <StageRenderer
                    stageType={stageType}
                    size={stageSize}
                    thrustWidth={parsedLayout?.thrustWidth}
                    thrustDepth={parsedLayout?.thrustDepth}
                    fillParent
                  />
                </div>
              ) : !isInsetStage ? (
                <StageRenderer
                  stageType={stageType}
                  size={stageSize}
                  thrustWidth={parsedLayout?.thrustWidth}
                  thrustDepth={parsedLayout?.thrustDepth}
                />
              ) : null}
              {displayRows.map((ri, idx) => {
                const label = lLabels[ri] || String.fromCharCode(65 + ri)
                const colMap = gridLookup.get(ri) || new Map()
                const rowColor = getRowColorFromSections(ri)

                return (
                  <React.Fragment key={ri}>
                    {isInsetStage && !hasCustomStagePosition && idx === middleRowIndex && (
                      <div className="flex justify-center my-2">
                        <StageRenderer
                          stageType={stageType}
                          size={stageSize}
                          thrustWidth={(parsedLayout as any)?.thrustWidth}
                          thrustDepth={(parsedLayout as any)?.thrustDepth}
                        />
                      </div>
                    )}
                  <div
                    className="flex items-center mb-[3px]"
                    style={{ height: SEAT_W }}
                  >
                    <div
                      className="w-6 text-center text-xs font-semibold font-serif shrink-0"
                      style={{ color: rowColor }}
                    >
                      {label}
                    </div>

                    <div className="flex items-center" style={{ gap: SEAT_GAP, height: SEAT_W }}>
                      {Array.from({ length: cols }, (_, ci) => {
                        const c = ci
                        if (aisleColumns.includes(c)) {
                          return (
                            <div
                              key={c}
                              className="shrink-0 bg-border/30 rounded-full mx-0.5"
                              style={{ width: 2, height: SEAT_W * 0.6 }}
                            />
                          )
                        }

                        const seatInfo = colMap.get(c)
                        if (seatInfo) {
                          const seatData = seatLookup.get(seatInfo.seatCode)
                          return renderSeatButton(seatData, seatInfo.seatCode, seatInfo.seatNum, `${ri}-${c}`)
                        }

                        return (
                          <div key={c} style={{ width: SEAT_W, height: SEAT_W }} className="shrink-0" />
                        )
                      })}
                    </div>

                    <div
                      className="w-6 text-center text-xs font-semibold font-serif shrink-0"
                      style={{ color: rowColor }}
                    >
                      {label}
                    </div>
                  </div>
                  </React.Fragment>
                )
              })}
              {parsedLayout?.objects && parsedLayout.objects.length > 0 && (
                <ObjectsOverlay
                  objects={parsedLayout.objects}
                  cellSize={SEAT_W + SEAT_GAP}
                  offsetX={LABEL_W}
                  canvasSeatBounds={csb}
                  gridCols={cols}
                  gridRows={displayRows.length}
                  paddingTop={paddingTop}
                />
              )}
            </div>
          </div>
        </div>

        {/* Selection Summary */}
        {selectedSeatCodes.size > 0 && (
          <div className="mt-6 p-4 bg-white rounded-xl border border-gold/20 shadow-sm animate-fade-in">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-charcoal">
                  {selectedSeatCodes.size} kursi dipilih
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedSeats.map((s) => s.seatCode).join(', ')}
                </p>
                <p className="font-serif text-lg font-semibold text-gold mt-1">
                  Rp {totalPrice.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {lockCountdown && (
                  <div className={cn(
                    'px-3 py-1 rounded-full text-xs font-mono font-semibold',
                    lockCountdown < 120 ? 'bg-red-50 text-danger' : 'bg-gold/10 text-gold-dark'
                  )}>
                    ⏱ {formatTime(lockCountdown)}
                  </div>
                )}
                <Button variant="ghost" size="sm" onClick={handleClearSelection} className="text-xs text-muted-foreground">
                  Batal
                </Button>
                <Button
                  onClick={() => onProceedToCheckout?.(selectedSeats)}
                  disabled={hasPendingLock}
                  className="bg-charcoal hover:bg-charcoal/90 text-gold font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  title={hasPendingLock ? 'Menunggu konfirmasi kursi...' : undefined}
                >
                  {hasPendingLock ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengunci...</>
                  ) : (
                    'Lanjut Bayar'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded border-2 bg-white" style={{ borderColor: '#C8A951' }} />
            <span>Tersedia</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded bg-gold seat-selected" />
            <span>Dipilih</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded bg-seat-locked" />
            <span>Dikunci</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded bg-seat-sold" />
            <span>Terjual</span>
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

        {/* Connection status */}
        <div className="mt-4 text-center">
          <p className="text-[10px] text-muted-foreground/50">
            {isConnected ? '🟢 Real-time aktif' : '🔴 Menghubungkan...'}
          </p>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: Legacy Mode (hardcoded ROW_CONFIG)
  // ═══════════════════════════════════════════════════════════
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

  const getRowColor = (row: string) => {
    const config = ROW_CONFIG.find((r) => r.row === row)
    if (!config) return '#8B8680'
    return CATEGORY_CONFIG[config.category]?.defaultColor || '#8B8680'
  }

  return (
    <div className="w-full">
      {/* Lock rejection notice */}
      {lockRejectionMsg && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 animate-fade-in flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {lockRejectionMsg}
        </div>
      )}

      {/* Seat Grid — Stage inside so it scrolls on mobile */}
      <div className="overflow-x-auto pb-4">
        <div className="min-w-[320px] relative">
          {/* Stage — inside scroll container */}
          <StageRenderer stageType="PROSCENIUM" size="lg" />
          {ROW_CONFIG.map((rowConfig) => (
            <div key={rowConfig.row} className="flex items-center gap-1 mb-1">
              <div className="w-6 text-center text-xs font-semibold font-serif shrink-0" style={{ color: getRowColor(rowConfig.row) }}>
                {rowConfig.row}
              </div>
              <div className="flex gap-1 justify-center flex-1">
                {Array.from({ length: Math.ceil(rowConfig.count / 2) }, (_, i) => {
                  const seatCode = `${rowConfig.row}-${i + 1}`
                  const seat = seats.find((s) => s.seatCode === seatCode)
                  if (!seat) return <div key={seatCode} className="w-7 h-7 sm:w-8 sm:h-8" />
                  const isClickable = seat.status === 'AVAILABLE' || selectedSeatCodes.has(seat.seatCode)
                  const isSold = seat.status === 'SOLD'
                  const isLocked = seat.status === 'LOCKED_TEMPORARY' && !selectedSeatCodes.has(seat.seatCode)
                  const isUnavailable = seat.status === 'UNAVAILABLE'
                  return (
                    <button
                      key={seatCode}
                      onClick={() => isClickable && handleSeatClick(seat)}
                      disabled={!isClickable}
                      className={cn(
                        'w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center text-[9px] sm:text-[10px] font-medium transition-all duration-200 relative',
                        getSeatColor(seat),
                        isClickable && 'cursor-pointer hover:scale-110 hover:shadow-md',
                        !isClickable && 'cursor-not-allowed',
                        isUnavailable && 'opacity-20',
                        isSold && 'text-white',
                        isLocked && 'text-white',
                        selectedSeatCodes.has(seat.seatCode) && 'text-charcoal font-bold'
                      )}
                      style={seat.status === 'AVAILABLE' && !selectedSeatCodes.has(seat.seatCode) ? { borderColor: getSeatBorderColor(seat) } : undefined}
                      title={
                        isSold ? `${seatCode} - Sold` : isLocked ? `${seatCode} - Locked` : selectedSeatCodes.has(seat.seatCode) ? `${seatCode} - Selected` : `${seatCode} - ${seat.priceCategory?.name || 'Uncategorized'} - Rp ${(seat.priceCategory?.price || 0).toLocaleString('id-ID')}`
                      }
                    >
                      {isSold && <Check className="w-3 h-3" />}
                      {isLocked && <Lock className="w-3 h-3" />}
                      {isUnavailable && <X className="w-3 h-3" />}
                      {!isSold && !isLocked && !isUnavailable && <span className="sm:hidden">{i + 1}</span>}
                      {!isSold && !isLocked && !isUnavailable && <span className="hidden sm:inline">{i + 1}</span>}
                    </button>
                  )
                })}
              </div>
              <div className="w-6 sm:w-8 shrink-0" />
              <div className="flex gap-1 justify-center flex-1">
                {Array.from({ length: Math.floor(rowConfig.count / 2) }, (_, i) => {
                  const seatNum = Math.ceil(rowConfig.count / 2) + i + 1
                  const seatCode = `${rowConfig.row}-${seatNum}`
                  const seat = seats.find((s) => s.seatCode === seatCode)
                  if (!seat) return <div key={seatCode} className="w-7 h-7 sm:w-8 sm:h-8" />
                  const isClickable = seat.status === 'AVAILABLE' || selectedSeatCodes.has(seat.seatCode)
                  const isSold = seat.status === 'SOLD'
                  const isLocked = seat.status === 'LOCKED_TEMPORARY' && !selectedSeatCodes.has(seat.seatCode)
                  const isUnavailable = seat.status === 'UNAVAILABLE'
                  return (
                    <button
                      key={seatCode}
                      onClick={() => isClickable && handleSeatClick(seat)}
                      disabled={!isClickable}
                      className={cn(
                        'w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center text-[9px] sm:text-[10px] font-medium transition-all duration-200 relative',
                        getSeatColor(seat),
                        isClickable && 'cursor-pointer hover:scale-110 hover:shadow-md',
                        !isClickable && 'cursor-not-allowed',
                        isUnavailable && 'opacity-20',
                        isSold && 'text-white',
                        isLocked && 'text-white',
                        selectedSeatCodes.has(seat.seatCode) && 'text-charcoal font-bold'
                      )}
                      style={seat.status === 'AVAILABLE' && !selectedSeatCodes.has(seat.seatCode) ? { borderColor: getSeatBorderColor(seat) } : undefined}
                      title={
                        isSold ? `${seatCode} - Sold` : isLocked ? `${seatCode} - Locked` : selectedSeatCodes.has(seat.seatCode) ? `${seatCode} - Selected` : `${seatCode} - ${seat.priceCategory?.name || 'Uncategorized'} - Rp ${(seat.priceCategory?.price || 0).toLocaleString('id-ID')}`
                      }
                    >
                      {isSold && <Check className="w-3 h-3" />}
                      {isLocked && <Lock className="w-3 h-3" />}
                      {isUnavailable && <X className="w-3 h-3" />}
                      {!isSold && !isLocked && !isUnavailable && <span className="sm:hidden">{seatNum}</span>}
                      {!isSold && !isLocked && !isUnavailable && <span className="hidden sm:inline">{seatNum}</span>}
                    </button>
                  )
                })}
              </div>
              <div className="w-6 text-center text-xs font-semibold font-serif shrink-0" style={{ color: getRowColor(rowConfig.row) }}>
                {rowConfig.row}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selection Summary */}
      {selectedSeatCodes.size > 0 && (
        <div className="mt-6 p-4 bg-white rounded-xl border border-gold/20 shadow-sm animate-fade-in">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-charcoal">{selectedSeatCodes.size} kursi dipilih</p>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedSeats.map((s) => s.seatCode).join(', ')}</p>
              <p className="font-serif text-lg font-semibold text-gold mt-1">Rp {totalPrice.toLocaleString('id-ID')}</p>
            </div>
            <div className="flex items-center gap-3">
              {lockCountdown && (
                <div className={cn(
                  'px-3 py-1 rounded-full text-xs font-mono font-semibold',
                  lockCountdown < 120 ? 'bg-red-50 text-danger' : 'bg-gold/10 text-gold-dark'
                )}>⏱ {formatTime(lockCountdown)}</div>
              )}
              <Button variant="ghost" size="sm" onClick={handleClearSelection} className="text-xs text-muted-foreground">Batal</Button>
              <Button
                onClick={() => onProceedToCheckout?.(selectedSeats)}
                disabled={hasPendingLock}
                className="bg-charcoal hover:bg-charcoal/90 text-gold font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title={hasPendingLock ? 'Menunggu konfirmasi kursi...' : undefined}
              >
                {hasPendingLock ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengunci...</>) : 'Lanjut Bayar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded border-2 bg-white" style={{ borderColor: '#C8A951' }} />
          <span>Tersedia</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-gold seat-selected" />
          <span>Dipilih</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-seat-locked" />
          <span>Dikunci</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-seat-sold" />
          <span>Terjual</span>
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

      {/* Connection status */}
      <div className="mt-4 text-center">
        <p className="text-[10px] text-muted-foreground/50">
          {isConnected ? '🟢 Real-time aktif' : '🔴 Menghubungkan...'}
        </p>
      </div>
    </div>
  )
}
