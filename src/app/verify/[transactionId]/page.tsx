'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatEventDateTime } from '@/lib/date'
import { clearPendingTrx } from '@/lib/pending-trx'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Ticket,
  Calendar,
  MapPin,
  User,
  QrCode,
  ArrowLeft,
  RefreshCw,
  CreditCard,
  ExternalLink,
  Ban,
  Clock,
  AlertTriangle,
} from 'lucide-react'

interface TransactionData {
  transactionId: string
  customerName: string
  customerEmail: string
  customerWa: string
  seatCodes: string
  totalAmount: number
  paymentStatus: string
  qrCodeUrl: string | null
  paidAt: string | null
  createdAt: string
  paymentUrl?: string | null
  merchandiseData: string | null
  adminFeeApplied: number
  promoCodeId: string | null
  event: {
    title: string
    showDate: string
    location: string
  }
}

interface VerifyResponse {
  transaction: TransactionData
  justPaid?: boolean
}

export default function VerifyPage() {
  const params = useParams()
  const transactionId = params.transactionId as string

  const [transaction, setTransaction] = useState<TransactionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pollCount, setPollCount] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [payLoading, setPayLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoCancelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)

  const fetchTransaction = useCallback(async (showLoading = false) => {
    if (showLoading) setIsRefreshing(true)
    try {
      const res = await fetch('/api/verify/' + transactionId)
      if (!res.ok) {
        setError('Transaksi tidak ditemukan')
        setIsLoading(false)
        return null
      }
      const data: VerifyResponse = await res.json()
      setTransaction(data.transaction)
      return data
    } catch (err) {
      setError('Gagal memuat data transaksi')
      return null
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [transactionId])

  // Clear pending transaction if status is PAID
  useEffect(() => {
    if (transaction?.paymentStatus === 'PAID') {
      clearPendingTrx()
    }
  }, [transaction?.paymentStatus])

  // Initial fetch + auto-cancel timer
  useEffect(() => {
    if (transactionId) {
      fetchTransaction().then((data) => {
        setIsLoading(false)
        // If pending, start polling + auto-cancel timer
        if (data?.transaction?.paymentStatus === 'PENDING') {
          startPolling()
          startAutoCancelCountdown()
        }
        // Clear localStorage if already paid
        if (data?.transaction?.paymentStatus === 'PAID') {
          clearPendingTrx()
        }
      })
    }
    return () => {
      stopPolling()
      clearAutoCancelTimeout()
    }
  }, [transactionId, fetchTransaction])

  const startPolling = useCallback(() => {
    stopPolling()
    pollIntervalRef.current = setInterval(async () => {
      const data = await fetchTransaction()
      if (data) {
        setPollCount((prev) => prev + 1)
        // Stop polling if no longer pending
        if (data.transaction.paymentStatus !== 'PENDING') {
          stopPolling()
          clearAutoCancelTimeout()
          setCountdown(null)
        }
      }
    }, 3000) // Poll every 3 seconds
  }, [fetchTransaction])

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  // 10-minute auto-cancel countdown
  const startAutoCancelCountdown = useCallback(() => {
    clearAutoCancelTimeout()
    // 10 minutes = 600 seconds
    const tenMinutes = 10 * 60
    setCountdown(tenMinutes)

    autoCancelTimeoutRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          // Time's up — auto cancel
          autoCancelTransaction()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  const clearAutoCancelTimeout = useCallback(() => {
    if (autoCancelTimeoutRef.current) {
      clearInterval(autoCancelTimeoutRef.current)
      autoCancelTimeoutRef.current = null
    }
  }, [])

  // Stop polling when component unmounts
  useEffect(() => {
    return () => {
      stopPolling()
      clearAutoCancelTimeout()
    }
  }, [stopPolling, clearAutoCancelTimeout])

  const handleManualRefresh = async () => {
    await fetchTransaction(true)
  }

  // Pay now — redirect to Tripay checkout page
  const handlePayNow = async () => {
    if (!transaction) return
    setPayLoading(true)
    try {
      // Re-create Tripay transaction to get fresh checkout URL
      const res = await fetch('/api/snap-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: transaction.transactionId }),
      })

      if (!res.ok) {
        setError('Gagal mendapatkan halaman pembayaran')
        setPayLoading(false)
        return
      }

      const data = await res.json()
      if (!data.checkoutUrl) {
        setError('Gagal mendapatkan halaman pembayaran')
        setPayLoading(false)
        return
      }

      // Redirect to Tripay checkout page
      window.location.href = data.checkoutUrl
    } catch {
      setError('Terjadi kesalahan. Coba lagi.')
      setPayLoading(false)
    }
  }

  // Open existing payment URL
  const handleOpenPayment = () => {
    if (transaction?.paymentUrl) {
      window.open(transaction.paymentUrl, '_blank')
    }
  }

  // Cancel transaction
  const autoCancelTransaction = async () => {
    if (!transaction) return
    try {
      await fetch('/api/cancel/' + transaction.transactionId, { method: 'POST' })
      // Refetch to show cancelled state
      await fetchTransaction()
      clearPendingTrx()
    } catch (err) {
      console.error('[auto-cancel] failed:', err)
    }
  }

  const handleCancel = async () => {
    if (!transaction) return
    setCancelLoading(true)
    setCancelError(null)
    try {
      const res = await fetch('/api/cancel/' + transaction.transactionId, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setCancelError(data.error || 'Gagal membatalkan transaksi')
        setCancelLoading(false)
        setShowCancelConfirm(false)
        return
      }
      // Success — refetch and stop polling
      stopPolling()
      clearAutoCancelTimeout()
      setCountdown(null)
      await fetchTransaction()
      clearPendingTrx()
      setShowCancelConfirm(false)
    } catch {
      setCancelError('Terjadi kesalahan. Coba lagi.')
      setCancelLoading(false)
      setShowCancelConfirm(false)
    }
  }

  const isPaid = transaction?.paymentStatus === 'PAID'
  const isPending = transaction?.paymentStatus === 'PENDING'
  const isExpired = transaction?.paymentStatus === 'EXPIRED'
  const isFailed = transaction?.paymentStatus === 'FAILED'
  const isCancelled = transaction?.paymentStatus === 'CANCELLED'
  const seatCodes = transaction?.seatCodes ? JSON.parse(transaction.seatCodes) : []
  const merchItems = transaction?.merchandiseData ? JSON.parse(transaction.merchandiseData) : []

  // Format countdown
  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m + ':' + String(s).padStart(2, '0')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-gold animate-spin" />
        </div>
      </div>
    )
  }

  if (error && !transaction) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <Card className="w-full max-w-md text-center p-8">
            <XCircle className="w-16 h-16 text-danger mx-auto mb-4" />
            <h1 className="font-serif text-xl font-bold text-charcoal mb-2">Tiket Tidak Valid</h1>
            <p className="text-sm text-muted-foreground">{error || 'Transaksi tidak ditemukan'}</p>
            <p className="text-xs text-muted-foreground/50 mt-2">ID: {transactionId}</p>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-warm-white">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* Status Badge */}
          <div className="flex justify-center mb-6">
            {isPaid ? (
              <div className="animate-fade-in">
                <CheckCircle2 className="w-24 h-24 text-success mx-auto" />
                <h1 className="font-serif text-2xl font-bold text-success text-center mt-3">
                  TIKET VALID
                </h1>
                <p className="text-sm text-muted-foreground text-center mt-1">Pembayaran berhasil dikonfirmasi</p>
              </div>
            ) : isPending ? (
              <div className="animate-fade-in">
                <Loader2 className="w-24 h-24 text-gold mx-auto animate-spin" />
                <h1 className="font-serif text-2xl font-bold text-gold text-center mt-3">
                  MENUNGGU PEMBAYARAN
                </h1>
                <p className="text-sm text-muted-foreground text-center mt-1">
                  Menunggu konfirmasi pembayaran...
                </p>
                {pollCount > 0 && (
                  <p className="text-xs text-muted-foreground/50 text-center mt-1">
                    Sudah mengecek {pollCount}x
                  </p>
                )}
              </div>
            ) : isExpired ? (
              <div className="animate-fade-in">
                <XCircle className="w-24 h-24 text-danger mx-auto" />
                <h1 className="font-serif text-2xl font-bold text-danger text-center mt-3">
                  PEMBAYARAN EXPIRED
                </h1>
                <p className="text-sm text-muted-foreground text-center mt-1">Batas waktu pembayaran telah habis</p>
              </div>
            ) : isCancelled ? (
              <div className="animate-fade-in">
                <Ban className="w-24 h-24 text-danger mx-auto" />
                <h1 className="font-serif text-2xl font-bold text-danger text-center mt-3">
                  TRANSAKSI DIBATALKAN
                </h1>
                <p className="text-sm text-muted-foreground text-center mt-1">
                  Transaksi telah dibatalkan oleh pengguna
                </p>
              </div>
            ) : isFailed ? (
              <div className="animate-fade-in">
                <XCircle className="w-24 h-24 text-danger mx-auto" />
                <h1 className="font-serif text-2xl font-bold text-danger text-center mt-3">
                  PEMBAYARAN GAGAL
                </h1>
                <p className="text-sm text-muted-foreground text-center mt-1">Pembayaran tidak berhasil</p>
              </div>
            ) : (
              <div className="animate-fade-in">
                <XCircle className="w-24 h-24 text-danger mx-auto" />
                <h1 className="font-serif text-2xl font-bold text-danger text-center mt-3">
                  TIKET TIDAK VALID
                </h1>
              </div>
            )}
          </div>

          {/* Ticket Card */}
          <Card className="overflow-hidden border-gold/20">
            <div className="bg-charcoal p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <Ticket className="w-4 h-4 text-gold" />
                <span className="text-gold text-xs tracking-widest uppercase">E-Ticket</span>
              </div>
              <h2 className="font-serif text-white text-lg font-semibold mt-1">
                {transaction.event.title}
              </h2>
            </div>

            <CardContent className="p-6 space-y-4">
              {/* Customer Info */}
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-gold" />
                <div>
                  <p className="text-xs text-muted-foreground">Nama Pemesan</p>
                  <p className="text-sm font-semibold text-charcoal">{transaction.customerName}</p>
                </div>
              </div>

              {/* Event Details */}
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-gold" />
                <div>
                  <p className="text-xs text-muted-foreground">Tanggal Pertunjukan</p>
                  <p className="text-sm font-medium text-charcoal">
                    {formatEventDateTime(transaction.event.showDate)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-gold" />
                <div>
                  <p className="text-xs text-muted-foreground">Lokasi</p>
                  <p className="text-sm font-medium text-charcoal">{transaction.event.location}</p>
                </div>
              </div>

              {/* Seats */}
              <div className="bg-warm-white rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Nomor Kursi</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {seatCodes.map((code: string) => (
                    <Badge key={code} variant="secondary" className="bg-charcoal text-gold text-sm px-3 py-1 font-mono">
                      {code}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Merchandise */}
              {merchItems.length > 0 && (
                <div className="bg-gold/5 rounded-lg p-4">
                  <p className="text-xs text-gold-dark uppercase tracking-widest mb-2 text-center">Merchandise</p>
                  <div className="space-y-1.5">
                    {merchItems.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="text-charcoal">{item.name} <span className="text-muted-foreground">x{item.quantity}</span></span>
                        <span className="text-charcoal font-medium">Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Amount */}
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Pembayaran</p>
                <p className="font-serif text-xl font-bold text-gold">
                  Rp {transaction.totalAmount.toLocaleString('id-ID')}
                </p>
              </div>

              {/* QR Code — only show when PAID */}
              {isPaid && transaction.qrCodeUrl && (
                <div className="text-center pt-2 animate-fade-in">
                  <QrCode className="w-4 h-4 text-gold mx-auto mb-2" />
                  <img
                    src={transaction.qrCodeUrl}
                    alt="QR Code"
                    className="w-48 h-48 mx-auto rounded-lg border border-border"
                  />
                  <p className="text-[10px] text-muted-foreground/50 mt-2">
                    Transaction ID: {transaction.transactionId}
                  </p>
                </div>
              )}

              {/* Payment Status */}
              <div className="flex items-center justify-center gap-2 pt-2">
                <Badge
                  variant="secondary"
                  className={
                    isPaid
                      ? 'bg-success/10 text-success'
                      : isPending
                      ? 'bg-gold/10 text-gold-dark'
                      : 'bg-danger/10 text-danger'
                  }
                >
                  {transaction.paymentStatus}
                </Badge>
                {isPending && (
                  <span className="text-xs text-muted-foreground/50 animate-pulse">
                    auto-refresh
                  </span>
                )}
              </div>

              {/* Manual Refresh Button */}
              <div className="flex justify-center pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="text-xs text-muted-foreground"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh Status
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="mt-6 space-y-3">
            {isPending && (
              <>
                {/* Countdown Timer */}
                {countdown !== null && countdown > 0 && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4 text-gold" />
                    <span>Batas pembayaran: </span>
                    <span className="font-mono font-semibold text-charcoal">{formatCountdown(countdown)}</span>
                    <span className="text-xs text-muted-foreground/50">lagi</span>
                  </div>
                )}

                {/* Pay Now Button */}
                <Button
                  onClick={handlePayNow}
                  disabled={payLoading}
                  className="w-full bg-charcoal hover:bg-charcoal/90 text-gold font-semibold py-5"
                >
                  {payLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Memuat Payment...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Bayar Sekarang
                    </>
                  )}
                </Button>

                {/* Open existing payment page */}
                {transaction.paymentUrl && (
                  <Button
                    onClick={handleOpenPayment}
                    variant="outline"
                    className="w-full border-gold/20 text-charcoal hover:bg-warm-white"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Buka Halaman Pembayaran
                  </Button>
                )}

                {/* Cancel Button */}
                {!showCancelConfirm ? (
                  <Button
                    onClick={() => setShowCancelConfirm(true)}
                    variant="outline"
                    className="w-full border-danger/20 text-danger hover:bg-danger/5"
                  >
                    <Ban className="w-4 h-4 mr-2" />
                    Batalkan Transaksi
                  </Button>
                ) : (
                  <div className="border border-danger/30 rounded-lg p-4 space-y-3 animate-fade-in">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                      <p className="text-sm text-charcoal">
                        Yakin ingin membatalkan transaksi ini? Kursi yang dipilih akan dilepaskan dan transaksi tidak bisa dikembalikan.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleCancel}
                        disabled={cancelLoading}
                        className="flex-1 bg-danger hover:bg-danger/90 text-white"
                      >
                        {cancelLoading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Ban className="w-4 h-4 mr-2" />
                        )}
                        Ya, Batalkan
                      </Button>
                      <Button
                        onClick={() => setShowCancelConfirm(false)}
                        variant="outline"
                        className="flex-1"
                      >
                        Batal
                      </Button>
                    </div>
                    {cancelError && (
                      <p className="text-xs text-danger text-center">{cancelError}</p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Cancelled info */}
            {isCancelled && (
              <div className="border border-muted rounded-lg p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Transaksi ini telah dibatalkan. Kursi yang dipilih sudah dilepaskan dan tersedia kembali untuk pemesanan lain.
                </p>
              </div>
            )}

            <div className="text-center mt-2">
              <Button variant="ghost" size="sm" asChild>
                <a href="/">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Kembali ke Beranda
                </a>
              </Button>
            </div>
          </div>

          {/* Pending notice */}
          {isPending && (
            <div className="mt-4 text-center">
              <p className="text-xs text-muted-foreground/70 bg-gold/5 rounded-lg px-4 py-3">
                Halaman ini otomatis mengecek status pembayaran setiap 3 detik.
                <br />
                Transaksi akan otomatis dibatalkan jika tidak ada pembayaran dalam 10 menit.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
