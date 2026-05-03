'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { clearPendingTrx } from '@/lib/pending-trx'
import { formatEventDateTime } from '@/lib/date'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  CreditCard,
  Calendar,
  MapPin,
  User,
  RefreshCw,
  ArrowLeft,
  Ticket,
  ExternalLink,
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
  paymentMethod?: string | null
  paymentUrl?: string | null
  event: {
    title: string
    showDate: string
    location: string
  }
}

export default function CheckoutStatusPage() {
  const params = useParams()
  const router = useRouter()
  const transactionId = params.transactionId as string

  const [transaction, setTransaction] = useState<TransactionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [repayLoading, setRepayLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTransaction = useCallback(async (showLoading = false) => {
    if (showLoading) setIsRefreshing(true)
    try {
      const res = await fetch('/api/verify/' + transactionId)
      if (!res.ok) {
        setError('Transaksi tidak ditemukan')
        setIsLoading(false)
        return null
      }
      const data = await res.json()
      setTransaction(data.transaction)
      return data.transaction as TransactionData
    } catch {
      setError('Gagal memuat data transaksi')
      return null
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [transactionId])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Polling for PENDING transactions
  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      const trx = await fetchTransaction()
      if (trx && trx.paymentStatus !== 'PENDING') {
        stopPolling()
        if (trx.paymentStatus === 'PAID') {
          clearPendingTrx()
          router.push('/verify/' + transactionId)
        }
      }
    }, 5000)
  }, [fetchTransaction, transactionId, router, stopPolling])

  // Initial fetch
  useEffect(() => {
    if (transactionId) {
      fetchTransaction()
    }
    return () => stopPolling()
  }, [transactionId, fetchTransaction, stopPolling])

  // Start polling when transaction is PENDING
  useEffect(() => {
    if (transaction?.paymentStatus === 'PENDING') {
      startPolling()
    }
    return () => stopPolling()
  }, [transaction?.paymentStatus, startPolling, stopPolling])

  // Redirect if PAID
  useEffect(() => {
    if (transaction?.paymentStatus === 'PAID') {
      clearPendingTrx()
      router.replace('/verify/' + transactionId)
    }
  }, [transaction?.paymentStatus, transactionId, router])

  const handlePayNow = async () => {
    if (!transaction) return
    setRepayLoading(true)

    try {
      // Re-create Tripay transaction and get new checkout URL
      const res = await fetch('/api/snap-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: transaction.transactionId }),
      })

      if (!res.ok) {
        setError('Gagal mendapatkan halaman pembayaran')
        setRepayLoading(false)
        return
      }

      const data = await res.json()
      if (!data.checkoutUrl) {
        setError('Gagal mendapatkan halaman pembayaran')
        setRepayLoading(false)
        return
      }

      // Redirect to Tripay checkout page
      window.location.href = data.checkoutUrl
    } catch {
      setError('Terjadi kesalahan. Coba lagi.')
      setRepayLoading(false)
    }
  }

  const handleCheckStatus = async () => {
    await fetchTransaction(true)
  }

  const isPending = transaction?.paymentStatus === 'PENDING'
  const isExpired = transaction?.paymentStatus === 'EXPIRED'
  const isFailed = transaction?.paymentStatus === 'FAILED'
  const seatCodes = transaction?.seatCodes ? JSON.parse(transaction.seatCodes) : []

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

  if (error || !transaction) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <Card className="w-full max-w-md text-center p-8">
            <AlertCircle className="w-16 h-16 text-danger mx-auto mb-4" />
            <h1 className="font-serif text-xl font-bold text-charcoal mb-2">Transaksi Tidak Ditemukan</h1>
            <p className="text-sm text-muted-foreground">{error || 'ID transaksi tidak valid'}</p>
            <div className="mt-6">
              <Button variant="outline" onClick={() => router.push('/')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Kembali ke Beranda
              </Button>
            </div>
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
          {/* Status Header */}
          <div className="flex justify-center mb-6">
            {isPending ? (
              <div className="animate-fade-in text-center">
                <Clock className="w-20 h-20 text-gold mx-auto" />
                <h1 className="font-serif text-2xl font-bold text-charcoal text-center mt-4">
                  Menunggu Pembayaran
                </h1>
                <p className="text-sm text-muted-foreground text-center mt-1">
                  Selesaikan pembayaran untuk mendapatkan e-tiket
                </p>
              </div>
            ) : isExpired ? (
              <div className="animate-fade-in text-center">
                <XCircle className="w-20 h-20 text-danger mx-auto" />
                <h1 className="font-serif text-2xl font-bold text-danger text-center mt-4">
                  Pembayaran Expired
                </h1>
                <p className="text-sm text-muted-foreground text-center mt-1">
                  Batas waktu pembayaran telah habis
                </p>
              </div>
            ) : isFailed ? (
              <div className="animate-fade-in text-center">
                <XCircle className="w-20 h-20 text-danger mx-auto" />
                <h1 className="font-serif text-2xl font-bold text-danger text-center mt-4">
                  Pembayaran Gagal
                </h1>
                <p className="text-sm text-muted-foreground text-center mt-1">
                  Transaksi tidak berhasil
                </p>
              </div>
            ) : null}
          </div>

          {/* Transaction Card */}
          <Card className="overflow-hidden border-gold/20">
            <div className="bg-charcoal p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <Ticket className="w-4 h-4 text-gold" />
                <span className="text-gold text-xs tracking-widest uppercase">Detail Transaksi</span>
              </div>
              <h2 className="font-serif text-white text-lg font-semibold mt-1">
                {transaction.event.title}
              </h2>
            </div>

            <CardContent className="p-6 space-y-4">
              {/* Transaction ID */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Transaction ID</span>
                <span className="text-xs font-mono text-charcoal">{transaction.transactionId}</span>
              </div>

              {/* Customer */}
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-gold" />
                <div>
                  <p className="text-xs text-muted-foreground">Nama Pemesan</p>
                  <p className="text-sm font-semibold text-charcoal">{transaction.customerName}</p>
                </div>
              </div>

              {/* Date */}
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-gold" />
                <div>
                  <p className="text-xs text-muted-foreground">Tanggal Pertunjukan</p>
                  <p className="text-sm font-medium text-charcoal">
                    {formatEventDateTime(transaction.event.showDate)}
                  </p>
                </div>
              </div>

              {/* Location */}
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-gold" />
                <div>
                  <p className="text-xs text-muted-foreground">Lokasi</p>
                  <p className="text-sm font-medium text-charcoal">{transaction.event.location}</p>
                </div>
              </div>

              {/* Seats */}
              <div className="bg-warm-white rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Nomor Kursi</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {seatCodes.map((code: string) => (
                    <Badge key={code} variant="secondary" className="bg-charcoal text-gold text-sm px-3 py-1 font-mono">
                      {code}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div className="text-center pt-1">
                <p className="text-xs text-muted-foreground">Total Pembayaran</p>
                <p className="font-serif text-xl font-bold text-gold">
                  Rp {transaction.totalAmount.toLocaleString('id-ID')}
                </p>
              </div>

              {/* Status Badge */}
              <div className="flex items-center justify-center gap-2">
                <Badge
                  variant="secondary"
                  className={
                    isPending
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
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="mt-6 space-y-3">
            {isPending && (
              <Button
                onClick={handlePayNow}
                disabled={repayLoading}
                className="w-full bg-charcoal hover:bg-charcoal/90 text-gold font-semibold py-5"
              >
                {repayLoading ? (
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
            )}

            {isPending && transaction.paymentUrl && (
              <Button
                onClick={() => window.open(transaction.paymentUrl!, '_blank')}
                variant="outline"
                className="w-full border-gold/20 text-charcoal hover:bg-warm-white"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Buka Halaman Pembayaran
              </Button>
            )}

            {isPending && (
              <Button
                variant="outline"
                onClick={handleCheckStatus}
                disabled={isRefreshing}
                className="w-full border-gold/20 text-charcoal hover:bg-warm-white"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Cek Status
              </Button>
            )}

            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Kembali ke Beranda
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
