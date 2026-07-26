'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  QrCode, RotateCcw, LogIn, ArrowLeft, Loader2, CheckCircle, AlertTriangle, XCircle, Tag,
  CalendarDays, Clock, RefreshCw, ShieldCheck, ShieldX, Sparkles,
} from 'lucide-react'

type ScanResultState = 'SCANNING' | 'LOADING' | 'SUCCESS' | 'WARNING' | 'ERROR'

interface PromoDetails {
  discountType: string
  discountValue: number
  target: string
  bundleSize: number
  bundleDiscount: number
}

interface FestivalShowDate {
  id: string
  date: string
  label: string | null
  isScanned: boolean
}

interface FestivalPayload {
  applicableShowDates: FestivalShowDate[]
  scannedShowDateIds: string[]
  targetShowDateId: string | null
  cooldownRemainingMs?: number | null
  cooldownEnabled?: boolean
  cooldownMinutes?: number
}

interface CheckInTransaction {
  transactionId: string
  customerName: string
  customerEmail: string
  customerWa: string
  seatCodes: string
  paymentStatus: string
  checkInTime: string | null
  paidAt: string | null
  merchandiseData: string | null
  totalAmount: number
  adminFeeApplied: number
  eventTitle: string | null
  eventMode?: string  // REGULAR | FESTIVAL
  lastScanAt?: string | null
  lastScanShowDateId?: string | null
  manualValidityOverride?: string | null
  promoCode: string | null
  promoDetails: PromoDetails | null
  festival?: FestivalPayload | null
}

interface ScanResult {
  status: 'SUCCESS' | 'WARNING' | 'ERROR'
  message: string
  transaction?: CheckInTransaction
}

export default function UsherScannerPage() {
  const [scanState, setScanState] = useState<ScanResultState>('SCANNING')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(null)
  const [lastTargetDayId, setLastTargetDayId] = useState<string | null>(null)
  const [overrideLoading, setOverrideLoading] = useState<'FORCE_VALID' | 'FORCE_INVALID' | 'RESET_COOLDOWN' | null>(null)
  const [overrideDialog, setOverrideDialog] = useState<null | 'FORCE_VALID' | 'FORCE_INVALID' | 'RESET_COOLDOWN'>(null)
  const [overrideNote, setOverrideNote] = useState('')
  const scannerRef = useRef<any>(null)
  const scannerContainerRef = useRef<HTMLDivElement>(null)

  // Format promo description for display
  function formatPromoDescription(promo: PromoDetails): string {
    if (promo.discountType === 'BUNDLING_TICKET') {
      return `Bundling: beli ${promo.bundleSize} tiket, diskon Rp ${promo.bundleDiscount.toLocaleString('id-ID')}/bundle`
    }
    const valueStr = promo.discountType === 'PERCENT'
      ? `${promo.discountValue}%`
      : `Rp ${promo.discountValue.toLocaleString('id-ID')}`
    const targetMap: Record<string, string> = {
      ALL: 'semua',
      TICKET: 'tiket',
      MERCH: 'merchandise',
      BUNDLING: 'tiket + merchandise',
    }
    const targetStr = targetMap[promo.target] || promo.target
    return `Diskon ${valueStr} (${targetStr})`
  }

  function parseMerchandise(data: string | null): Array<{ name: string; quantity: number }> {
    if (!data) return []
    try { return JSON.parse(data) } catch { return [] }
  }

  function parseSeatCodes(codes: string | null): string[] {
    if (!codes) return []
    try { return JSON.parse(codes) } catch {
      return codes.split(',').map((s) => s.trim()).filter(Boolean)
    }
  }

  function extractTransactionId(qrText: string): string | null {
    const parts = qrText.split('KODE TRX:')
    if (parts.length < 2) return null
    return parts[1].trim()
  }

  async function performCheckIn(transactionId: string, overrideAction?: 'FORCE_VALID' | 'FORCE_INVALID' | 'RESET_COOLDOWN', overrideNote?: string) {
    setScanState('LOADING')
    setLastTransactionId(transactionId)
    if (overrideAction) setOverrideLoading(overrideAction)

    try {
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          overrideAction,
          overrideNote: overrideNote || undefined,
        }),
      })

      const data = await res.json()

      if (data.status === 'SUCCESS') {
        setScanState('SUCCESS')
      } else if (data.status === 'WARNING') {
        setScanState('WARNING')
      } else {
        setScanState('ERROR')
      }

      setResult(data)
      // Track which day was targeted so the override UI can hint at it
      setLastTargetDayId(data.transaction?.festival?.targetShowDateId || null)
    } catch (err) {
      setScanState('ERROR')
      setResult({
        status: 'ERROR',
        message: 'Gagal terhubung ke server. Silakan coba lagi.',
      })
    } finally {
      setOverrideLoading(null)
    }
  }

  function handleScanSuccess(decodedText: string) {
    const transactionId = extractTransactionId(decodedText)
    if (!transactionId) {
      setScanState('ERROR')
      setResult({
        status: 'ERROR',
        message: 'Format QR tidak valid. Pastikan QR tiket yang benar.',
      })
      return
    }
    stopScanner()
    performCheckIn(transactionId)
  }

  async function startScanner() {
    await stopScanner()
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('qr-reader')
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1.0,
        },
        (decodedText: string) => handleScanSuccess(decodedText),
        () => { /* QR not found in frame - ignore */ }
      )
      scannerRef.current = scanner
      setScanState('SCANNING')
    } catch (err) {
      console.error('Failed to start scanner:', err)
      setScanState('ERROR')
      setResult({
        status: 'ERROR',
        message: 'Gagal mengakses kamera. Pastikan izin kamera diberikan.',
      })
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState()
        if (state === 2) await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch { /* ignore */ }
      scannerRef.current = null
    }
  }

  function resetScanner() {
    setResult(null)
    setLastTransactionId(null)
    setLastTargetDayId(null)
    setOverrideNote('')
    setOverrideDialog(null)
    setScanState('SCANNING')
    setTimeout(() => startScanner(), 300)
  }

  function handleCheckInAgain() {
    if (lastTransactionId) performCheckIn(lastTransactionId)
  }

  // ── Override handler — opens dialog for note input ──
  function openOverrideDialog(action: 'FORCE_VALID' | 'FORCE_INVALID' | 'RESET_COOLDOWN') {
    setOverrideDialog(action)
    setOverrideNote('')
  }

  async function confirmOverride() {
    if (!lastTransactionId || !overrideDialog) return
    const action = overrideDialog
    setOverrideDialog(null)
    await performCheckIn(lastTransactionId, action, overrideNote)
  }

  useEffect(() => {
    const timer = setTimeout(() => startScanner(), 500)
    return () => {
      clearTimeout(timer)
      stopScanner()
    }
  }, [])

  // ============================================================
  // RENDER
  // ============================================================

  if (scanState === 'LOADING') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-white">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-charcoal animate-spin mx-auto" />
          <p className="text-charcoal font-medium text-lg">Memverifikasi tiket...</p>
        </div>
      </div>
    )
  }

  // ── SUCCESS ──
  if (scanState === 'SUCCESS' && result?.transaction) {
    const txn = result.transaction
    const allSeats = parseSeatCodes(txn.seatCodes)
    const isFestival = allSeats.some((c) => c.includes('@'))
    const seats = isFestival
      ? [...new Set(allSeats.map((c) => c.split('@')[0]))]
      : allSeats
    const merch = parseMerchandise(txn.merchandiseData)
    const festival = txn.festival

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: '#4A7C59' }}>
        <div className="max-w-md w-full text-center text-white space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center">
              <CheckCircle className="w-14 h-14 text-white" />
            </div>
          </div>

          {/* Title */}
          <div>
            <h1 className="text-3xl font-bold font-serif">Tiket Valid ✓</h1>
            {isFestival && (
              <Badge className="mt-2 bg-white/20 text-white border-white/30">
                <Sparkles className="w-3 h-3 mr-1" />
                Festival Pass
              </Badge>
            )}
          </div>

          {/* Event */}
          {txn.eventTitle && (
            <p className="text-white/80 text-lg">{txn.eventTitle}</p>
          )}

          {/* Customer Info */}
          <div className="bg-white/15 rounded-xl p-5 space-y-3 text-left">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-wider">Nama Pemesan</p>
              <p className="text-lg font-semibold">{txn.customerName}</p>
            </div>

            {/* Festival: show applicable days */}
            {isFestival && festival ? (
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  Status Hari Pertunjukan
                </p>
                <div className="mt-2 space-y-1.5">
                  {festival.applicableShowDates.map((d) => {
                    const date = new Date(d.date)
                    const weekday = date.toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'Asia/Jakarta' })
                    const dayMonth = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })
                    const isToday = d.id === festival.targetShowDateId
                    return (
                      <div
                        key={d.id}
                        className={`flex items-center justify-between p-2 rounded-md text-sm ${
                          isToday
                            ? 'bg-white/30 ring-1 ring-white/50'
                            : d.isScanned
                              ? 'bg-white/10'
                              : 'bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono opacity-80">{weekday}, {dayMonth}</span>
                          {isToday && (
                            <Badge className="bg-white text-[#4A7C59] text-[9px] px-1.5 py-0">Scan sekarang</Badge>
                          )}
                          {d.label && <span className="text-[10px] opacity-60">· {d.label}</span>}
                        </div>
                        {d.isScanned && (
                          <CheckCircle className="w-4 h-4 text-white/90" />
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-white/60 mt-2">
                  Hijau: hari ini dipindai · Tanda centang: sudah pernah dipindai
                </p>
              </div>
            ) : (
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider">Kursi</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {seats.map((seat) => (
                    <span key={seat} className="bg-white/20 px-3 py-1 rounded-full text-sm font-mono font-medium">
                      {seat}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {merch.length > 0 && (
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider">Merchandise</p>
                <ul className="mt-1 space-y-1">
                  {merch.map((m, i) => (
                    <li key={i} className="text-sm text-white/90">
                      {m.name} × {m.quantity}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Promo Info */}
            {txn.promoCode ? (
              <div className="bg-yellow-400/20 border border-yellow-400/30 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-yellow-300 shrink-0" />
                  <p className="text-yellow-200 text-xs uppercase tracking-wider font-medium">Promo</p>
                </div>
                <p className="text-white font-semibold mt-1">{txn.promoCode}</p>
                {txn.promoDetails && (
                  <p className="text-white/70 text-xs mt-0.5">{formatPromoDescription(txn.promoDetails)}</p>
                )}
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-white/30 shrink-0" />
                  <p className="text-white/30 text-xs">Tanpa promo</p>
                </div>
              </div>
            )}
          </div>

          {/* Cooldown reminder for festival re-entries */}
          {isFestival && festival?.cooldownEnabled && (
            <div className="bg-white/10 rounded-lg p-3 text-xs text-white/80 flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p className="text-left">
                Setelah scan berhasil, ada cooldown {festival.cooldownMinutes || 30} menit di hari yang sama.
                Usher bisa reset cooldown manual jika ada kendala.
              </p>
            </div>
          )}

          {/* Action Button — confirm entry */}
          <Button
            onClick={resetScanner}
            className="w-full min-h-[56px] text-lg font-semibold bg-white text-[#4A7C59] hover:bg-white/90 rounded-xl"
          >
            <QrCode className="w-5 h-5 mr-2" />
            Scan Tiket Berikutnya
          </Button>
        </div>
      </div>
    )
  }

  // ── WARNING (cooldown active or already scanned) ──
  if (scanState === 'WARNING' && result?.transaction) {
    const txn = result.transaction
    const allSeats = parseSeatCodes(txn.seatCodes)
    const isFestival = allSeats.some((c) => c.includes('@'))
    const seats = isFestival
      ? [...new Set(allSeats.map((c) => c.split('@')[0]))]
      : allSeats
    const festival = txn.festival
    const cooldownMs = festival?.cooldownRemainingMs || 0
    const cooldownMin = Math.ceil(cooldownMs / 60000)

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: '#D4843E' }}>
        <div className="max-w-md w-full text-center space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center">
              <AlertTriangle className="w-14 h-14 text-white" />
            </div>
          </div>

          {/* Title */}
          <div>
            <h1 className="text-3xl font-bold font-serif text-white">Peringatan</h1>
            <p className="text-white/90 text-lg font-medium mt-1">
              {isFestival && cooldownMs > 0 ? 'Cooldown Aktif' : 'Tiket sudah di-scan'}
            </p>
          </div>

          {/* Warning Details */}
          <div className="bg-white/15 rounded-xl p-5 space-y-3 text-left text-white">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-wider">Pesan</p>
              <p className="text-base font-semibold">{result.message}</p>
            </div>

            <div>
              <p className="text-white/60 text-xs uppercase tracking-wider">Nama Pemesan</p>
              <p className="text-lg font-semibold">{txn.customerName}</p>
            </div>

            {/* Festival: show scanned days */}
            {isFestival && festival ? (
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider">Status Hari</p>
                <div className="mt-2 space-y-1.5">
                  {festival.applicableShowDates.map((d) => {
                    const date = new Date(d.date)
                    const weekday = date.toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'Asia/Jakarta' })
                    const dayMonth = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })
                    const isToday = d.id === festival.targetShowDateId
                    return (
                      <div
                        key={d.id}
                        className={`flex items-center justify-between p-2 rounded-md text-sm ${
                          isToday ? 'bg-white/30 ring-1 ring-white/50' : 'bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono opacity-80">{weekday}, {dayMonth}</span>
                          {isToday && <Badge className="bg-white text-[#D4843E] text-[9px] px-1.5 py-0">Hari ini</Badge>}
                        </div>
                        {d.isScanned && <CheckCircle className="w-4 h-4 text-white/90" />}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider">Kursi</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {seats.map((seat) => (
                    <span key={seat} className="bg-white/20 px-3 py-1 rounded-full text-sm font-mono font-medium">
                      {seat}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Promo Info */}
            {txn.promoCode ? (
              <div className="bg-yellow-400/20 border border-yellow-400/30 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-yellow-300 shrink-0" />
                  <p className="text-yellow-200 text-xs uppercase tracking-wider font-medium">Promo</p>
                </div>
                <p className="text-white font-semibold mt-1">{txn.promoCode}</p>
                {txn.promoDetails && (
                  <p className="text-white/70 text-xs mt-0.5">{formatPromoDescription(txn.promoDetails)}</p>
                )}
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-white/30 shrink-0" />
                  <p className="text-white/30 text-xs">Tanpa promo</p>
                </div>
              </div>
            )}
          </div>

          {/* Cooldown info banner */}
          {isFestival && cooldownMs > 0 && (
            <div className="bg-white/10 rounded-lg p-3 text-xs text-white/80 flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p className="text-left">
                Cooldown {cooldownMin} menit lagi untuk hari ini. Jika ini kasus darurat
                (mis. penonton keluar sejenak untuk toilet), gunakan tombol Reset Cooldown.
              </p>
            </div>
          )}

          {/* Override Actions */}
          <div className="space-y-2">
            {isFestival && cooldownMs > 0 && (
              <Button
                onClick={() => openOverrideDialog('RESET_COOLDOWN')}
                disabled={overrideLoading === 'RESET_COOLDOWN'}
                className="w-full min-h-[48px] bg-white hover:bg-white/90 rounded-xl"
                style={{ color: '#D4843E' }}
              >
                {overrideLoading === 'RESET_COOLDOWN' ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Reset Cooldown
              </Button>
            )}
            <Button
              onClick={() => openOverrideDialog('FORCE_VALID')}
              disabled={overrideLoading === 'FORCE_VALID'}
              variant="outline"
              className="w-full min-h-[48px] bg-transparent border-white/40 text-white hover:bg-white/10 rounded-xl"
            >
              {overrideLoading === 'FORCE_VALID' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4 mr-2" />
              )}
              Tetap Masukkan (Override)
            </Button>
            <Button
              onClick={resetScanner}
              className="w-full min-h-[48px] bg-white/10 hover:bg-white/20 text-white rounded-xl"
            >
              <QrCode className="w-4 h-4 mr-2" />
              Scan Tiket Berikutnya
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── ERROR (wrong day, force-invalid, not found, etc.) ──
  if (scanState === 'ERROR') {
    const txn = result?.transaction
    const allSeats = txn ? parseSeatCodes(txn.seatCodes) : []
    const isFestival = allSeats.some((c) => c.includes('@'))
    const festival = txn?.festival

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: '#C75050' }}>
        <div className="max-w-md w-full text-center text-white space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center">
              <XCircle className="w-14 h-14 text-white" />
            </div>
          </div>

          {/* Title */}
          <div>
            <h1 className="text-3xl font-bold font-serif">Tiket Tidak Valid</h1>
            <p className="text-white/90 text-base font-medium mt-1">Tiket ditolak</p>
          </div>

          {/* Error Message */}
          <div className="bg-white/15 rounded-xl p-5">
            <p className="text-white/90 text-base">{result?.message || 'Terjadi kesalahan saat memverifikasi tiket.'}</p>
          </div>

          {/* If festival wrong-day, show which days ARE valid */}
          {isFestival && festival && (
            <div className="bg-white/10 rounded-xl p-4 text-left">
              <p className="text-white/70 text-xs uppercase tracking-wider mb-2">Hari Berlaku di Paket Ini:</p>
              <div className="space-y-1.5">
                {festival.applicableShowDates.map((d) => {
                  const date = new Date(d.date)
                  const weekday = date.toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'Asia/Jakarta' })
                  const dayMonth = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })
                  const time = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
                  return (
                    <div key={d.id} className="flex items-center justify-between text-sm">
                      <span className="font-mono">{weekday}, {dayMonth} · {time}</span>
                      {d.isScanned && <CheckCircle className="w-3.5 h-3.5 text-white/70" />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Customer Info (if we have it) */}
          {txn && (
            <div className="bg-white/15 rounded-xl p-4 text-left text-white">
              <p className="text-white/60 text-xs uppercase tracking-wider">Nama Pemesan</p>
              <p className="text-base font-semibold">{txn.customerName}</p>
              <p className="text-white/60 text-xs mt-2">TRX: {txn.transactionId}</p>
            </div>
          )}

          {/* Override Action (only if we have a transaction) */}
          {txn && (
            <Button
              onClick={() => openOverrideDialog('FORCE_VALID')}
              disabled={overrideLoading === 'FORCE_VALID'}
              variant="outline"
              className="w-full min-h-[48px] bg-transparent border-white/40 text-white hover:bg-white/10 rounded-xl"
            >
              {overrideLoading === 'FORCE_VALID' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4 mr-2" />
              )}
              Tetap Masukkan (Override)
            </Button>
          )}

          <Button
            onClick={resetScanner}
            className="w-full min-h-[56px] text-lg font-semibold bg-white hover:bg-white/90 rounded-xl"
            style={{ color: '#C75050' }}
          >
            <RotateCcw className="w-5 h-5 mr-2" />
            Scan Ulang
          </Button>
        </div>
      </div>
    )
  }

  // ── Override Note Dialog ──
  const overrideTitle =
    overrideDialog === 'FORCE_VALID' ? 'Override: Tetap Masukkan'
    : overrideDialog === 'FORCE_INVALID' ? 'Override: Tolak Tiket'
    : overrideDialog === 'RESET_COOLDOWN' ? 'Reset Cooldown'
    : ''
  const overrideDesc =
    overrideDialog === 'FORCE_VALID' ? 'Tiket akan diizinkan masuk meskipun tidak valid. Catat alasannya untuk audit.'
    : overrideDialog === 'FORCE_INVALID' ? 'Tiket akan ditolak secara permanen. Catat alasannya untuk audit.'
    : overrideDialog === 'RESET_COOLDOWN' ? 'Cooldown untuk hari ini akan direset. Penonton bisa langsung di-scan ulang.'
    : ''
  const overrideIcon =
    overrideDialog === 'FORCE_VALID' ? ShieldCheck
    : overrideDialog === 'FORCE_INVALID' ? ShieldX
    : RefreshCw

  const OverrideIcon = overrideIcon

  return (
    <div className="min-h-screen flex flex-col bg-warm-white">
      {/* Header */}
      <div className="bg-charcoal text-white px-4 py-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="text-white/70 hover:text-white hover:bg-white/10 h-11 w-11"
          onClick={async () => {
            await stopScanner()
            window.history.back()
          }}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="font-serif text-lg font-semibold">Scanner Tiket</h1>
          <p className="text-white/50 text-xs">Arahkan QR Code ke kamera</p>
        </div>
      </div>

      {/* Scanner Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Scanner Container */}
          <div
            ref={scannerContainerRef}
            id="qr-reader"
            className="rounded-2xl overflow-hidden shadow-lg border-2 border-charcoal/20"
            style={{ minHeight: '320px' }}
          />

          {/* Instructions */}
          <div className="mt-6 text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-charcoal/70">
              <QrCode className="w-5 h-5" />
              <p className="text-sm font-medium">Menunggu QR Code...</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Pastikan QR Code berada dalam bingkai scanner
            </p>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="px-4 py-4 border-t border-border/50">
        <p className="text-center text-xs text-muted-foreground">
          QR Format: NAMA: ... | KURSI/FESTIVAL: ... | KODE TRX: ...
        </p>
      </div>

      {/* Override Note Dialog */}
      <Dialog open={overrideDialog !== null} onOpenChange={(open) => { if (!open) setOverrideDialog(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg flex items-center gap-2">
              {OverrideIcon && <OverrideIcon className="w-5 h-5 text-gold" />}
              {overrideTitle}
            </DialogTitle>
            <DialogDescription>{overrideDesc}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Label htmlFor="override-note" className="text-sm font-medium">
              Alasan Override (wajib untuk audit log)
            </Label>
            <Input
              id="override-note"
              placeholder="Contoh: Penonton keluar toilet sejenak, sistem cooldown error"
              value={overrideNote}
              onChange={(e) => setOverrideNote(e.target.value)}
              autoFocus
            />
            {!overrideNote.trim() && (
              <p className="text-[11px] text-muted-foreground">
                Catatan ini akan tersimpan di log scan tiket.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOverrideDialog(null)}>
              Batal
            </Button>
            <Button
              onClick={confirmOverride}
              disabled={!overrideNote.trim() || overrideLoading !== null}
              className={
                overrideDialog === 'FORCE_INVALID'
                  ? 'bg-danger hover:bg-danger/90 text-white'
                  : 'bg-charcoal hover:bg-charcoal/90 text-gold'
              }
            >
              {overrideLoading !== null ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : overrideDialog === 'FORCE_VALID' ? (
                <ShieldCheck className="w-4 h-4 mr-2" />
              ) : overrideDialog === 'FORCE_INVALID' ? (
                <ShieldX className="w-4 h-4 mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Konfirmasi Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
