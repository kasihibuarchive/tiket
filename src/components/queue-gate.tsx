'use client'

import { useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { getSessionId } from '@/lib/session-id'
import { Loader2, Users, Clock, ArrowRight, CheckCircle2 } from 'lucide-react'

interface QueueStatus {
  enabled: boolean
  status?: 'ACTIVE' | 'WAITING'
  position?: number
  totalWaiting?: number
  estimatedWait?: number
  isAdmin?: boolean
}

interface QueueGateProps {
  eventId: string
  children: ReactNode
}

function formatWaitTime(seconds: number): string {
  if (seconds < 60) return `${seconds} detik`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes === 0) return `${remainingSeconds} detik`
  return remainingSeconds > 0
    ? `~${minutes} menit ${remainingSeconds} detik`
    : `~${minutes} menit`
}

export function QueueGate({ eventId, children }: QueueGateProps) {
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  const [isPromoting, setIsPromoting] = useState(false)
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const sessionIdRef = useRef<string>('')

  const checkQueueStatus = useCallback(async () => {
    if (!sessionIdRef.current) return

    try {
      const res = await fetch(
        `/api/events/${eventId}/queue?sessionId=${encodeURIComponent(sessionIdRef.current)}`
      )
      if (res.ok) {
        const data: QueueStatus = await res.json()
        setQueueStatus(data)
        return data
      }
    } catch (err) {
      console.error('Queue check error:', err)
    }
    return null
  }, [eventId])

  // Initial check on mount
  useEffect(() => {
    sessionIdRef.current = getSessionId()

    async function init() {
      setIsChecking(true)
      const status = await checkQueueStatus()
      setIsChecking(false)

      if (!status) return

      if (status.enabled && status.status === 'ACTIVE') {
        // Start heartbeat every 15 seconds
        heartbeatRef.current = setInterval(checkQueueStatus, 15_000)
      } else if (status.enabled && status.status === 'WAITING') {
        // Start polling every 5 seconds (reduced from 3s to lower DB load on Supabase free tier)
        pollRef.current = setInterval(async () => {
          const newStatus = await checkQueueStatus()
          if (newStatus && newStatus.status === 'ACTIVE') {
            // Promoted! Stop polling, start heartbeat
            if (pollRef.current) clearInterval(pollRef.current)
            setIsPromoting(true)
            setTimeout(() => setIsPromoting(false), 800)
            heartbeatRef.current = setInterval(checkQueueStatus, 15_000)
          }
        }, 5_000)
      }
    }

    init()

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [checkQueueStatus])

  // Leave queue on unmount
  useEffect(() => {
    return () => {
      if (sessionIdRef.current && queueStatus?.enabled) {
        // Fire-and-forget leave request
        fetch(`/api/events/${eventId}/queue/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        }).catch(() => {})
      }
    }
  }, [])

  // Loading state
  if (isChecking) {
    return (
      <div className="fixed inset-0 z-50 bg-charcoal flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-gold animate-spin mx-auto mb-4" />
          <p className="text-white/70 text-sm">Memeriksa antrian...</p>
        </div>
      </div>
    )
  }

  // Queue not enabled — render children normally
  if (!queueStatus?.enabled) {
    return <>{children}</>
  }

  // Active — render children with smooth transition
  if (queueStatus.status === 'ACTIVE') {
    return (
      <div className={`transition-opacity duration-700 ${isPromoting ? 'animate-fade-in' : ''}`}>
        {children}
      </div>
    )
  }

  // Waiting — show waiting room UI
  return (
    <WaitingRoomUI
      eventId={eventId}
      position={queueStatus.position || 0}
      totalWaiting={queueStatus.totalWaiting || 0}
      estimatedWait={queueStatus.estimatedWait || 0}
    />
  )
}

// ─── Waiting Room UI ─────────────────────────────────────────────────────────

function WaitingRoomUI({
  position,
  totalWaiting,
  estimatedWait,
}: {
  eventId: string
  position: number
  totalWaiting: number
  estimatedWait: number
}) {
  const [dots, setDots] = useState('')

  // Animated dots for "auto-refresh" indicator
  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.')
    }, 500)
    return () => clearInterval(dotInterval)
  }, [])

  // Determine progress percentage (inverse — closer to 1 means closer to front)
  const progressPercent = totalWaiting > 0
    ? Math.max(5, Math.min(95, ((totalWaiting - position + 1) / totalWaiting) * 100))
    : 50

  return (
    <div className="fixed inset-0 z-50 bg-charcoal flex items-center justify-center overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gold/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gold/3 rounded-full blur-3xl" />
      </div>

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(200,169,81,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(200,169,81,0.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 text-center max-w-md mx-auto px-6">
        {/* Logo/Brand */}
        <div className="mb-8">
          <div className="w-16 h-16 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center mx-auto mb-6">
            <Users className="w-7 h-7 text-gold" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-white mb-2">
            Mohon Tunggu
          </h1>
          <p className="text-white/40 text-sm tracking-widest uppercase">
            Virtual Waiting Room
          </p>
        </div>

        {/* Queue Position */}
        <div
          key={position}
          className="animate-fade-in"
        >
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 mb-6">
            <p className="text-white/50 text-xs tracking-wider uppercase mb-2">
              Anda berada di posisi
            </p>
            <div className="flex items-baseline justify-center gap-2 mb-1">
              <span className="font-serif text-6xl sm:text-7xl font-bold text-gold">
                #{position}
              </span>
            </div>
            <p className="text-white/30 text-sm">
              dari {totalWaiting} orang dalam antrian
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-8 px-2">
          <div className="flex items-center justify-between text-xs text-white/40 mb-2">
            <span>Antrian</span>
            <span>Anda</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gold-dark via-gold to-gold-light rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Estimated Wait */}
        <div className="flex items-center justify-center gap-6 mb-8">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gold/60" />
            <span className="text-white/50 text-sm">
              Perkiraan waktu: <strong className="text-white/70">{formatWaitTime(estimatedWait)}</strong>
            </span>
          </div>
        </div>

        {/* Auto-refresh indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-gold" />
          </span>
          <p className="text-white/30 text-xs">
            Memperbarui otomatis{dots}
          </p>
        </div>

        {/* Promoted notice */}
        <div className="bg-white/5 rounded-xl border border-gold/20 p-4">
          <div className="flex items-center justify-center gap-2 text-gold/60">
            <ArrowRight className="w-4 h-4" />
            <p className="text-xs">
              Anda akan dialihkan otomatis saat giliran tiba
            </p>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-white/20 text-[11px] mt-6">
          Jangan tutup halaman ini. Posisi antrian Anda akan tetap terjaga.
        </p>
      </div>
    </div>
  )
}
