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
  Gift, Send, Loader2, Ticket, Users, X, MapPin, Clock, Mail, Phone,
  AlertCircle, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventOption {
  id: string
  title: string
  category: string
  showDate: string
  location: string
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
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UsherComplimentaryPage() {
  // Events
  const [events, setEvents] = useState<EventOption[]>([])
  const [isLoadingEvents, setIsLoadingEvents] = useState(true)

  // Form
  const [selectedEventId, setSelectedEventId] = useState<string>('')
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [ticketQuantity, setTicketQuantity] = useState(1)

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null)

  // Recent tickets
  const [recentTickets, setRecentTickets] = useState<ComplimentaryTicket[]>([])
  const [isLoadingRecent, setIsLoadingRecent] = useState(true)

  // Admin info from localStorage
  const [adminInfo, setAdminInfo] = useState<{ id: string; name: string; role: string } | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('teateran_admin')
      if (stored) setAdminInfo(JSON.parse(stored))
    } catch {}
  }, [])

  // ─── Fetch events ───────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch('/api/admin/events')
        if (res.ok) {
          const data = await res.json()
          // Only show published events for usher
          setEvents((data.events || []).filter((e: any) => e.isPublished))
        }
      } catch {}
      finally {
        setIsLoadingEvents(false)
      }
    }
    fetchEvents()
  }, [])

  // ─── Fetch recent complimentary tickets ─────────────────────────────────

  useEffect(() => {
    async function fetchRecentTickets() {
      try {
        const res = await fetch('/api/admin/tickets/complimentary')
        if (res.ok) {
          const data = await res.json()
          setRecentTickets(data.tickets || [])
        }
      } catch {}
      finally {
        setIsLoadingRecent(false)
      }
    }
    fetchRecentTickets()
  }, [])

  // ─── Parse seat codes from JSON string ──────────────────────────────────

  function parseSeatCodes(codes: string): string[] {
    if (!codes) return []
    try { return JSON.parse(codes) } catch { return codes.split(',').map((s) => s.trim()).filter(Boolean) }
  }

  // ─── Submit ─────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!selectedEventId || !guestName || !guestEmail || !guestPhone) {
      setSubmitResult({ success: false, message: 'Harap lengkapi semua field yang wajib diisi.' })
      return
    }

    if (ticketQuantity < 1) {
      setSubmitResult({ success: false, message: 'Jumlah tiket minimal 1.' })
      return
    }

    // Generate seat codes for GA (ushers typically handle GA events)
    const seatCodes = Array.from({ length: ticketQuantity }, (_, i) => `GA-${i + 1}`)

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
          seatCodes,
          guestName,
          guestEmail,
          guestPhone,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setSubmitResult({
          success: true,
          message: `Tiket komplimen berhasil dibuat! TRX: ${data.transactionId}`,
        })
        // Reset form
        setGuestName('')
        setGuestEmail('')
        setGuestPhone('')
        setTicketQuantity(1)
        // Refresh recent tickets
        const recentRes = await fetch('/api/admin/tickets/complimentary')
        if (recentRes.ok) {
          const recentData = await recentRes.json()
          setRecentTickets(recentData.tickets || [])
        }
      } else {
        setSubmitResult({ success: false, message: data.error || 'Gagal membuat tiket komplimen.' })
      }
    } catch {
      setSubmitResult({ success: false, message: 'Terjadi kesalahan jaringan.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedEvent = useMemo(() => events.find((e) => e.id === selectedEventId) || null, [events, selectedEventId])

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
            <Gift className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-bold text-charcoal">Tiket Komplimen</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Buat tiket gratis untuk tamu undangan</p>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="font-serif text-lg text-charcoal flex items-center gap-2">
            <Send className="w-4 h-4 text-gold" />
            Buat Tiket Komplimen Baru
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Submit Result */}
          {submitResult && (
            <div className={cn(
              'flex items-start gap-3 p-4 rounded-lg text-sm',
              submitResult.success
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-red-50 border border-red-200 text-red-800',
            )}>
              {submitResult.success ? <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
              <p>{submitResult.message}</p>
              <button onClick={() => setSubmitResult(null)} className="ml-auto flex-shrink-0 hover:opacity-70"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Event Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              Pilih Event <span className="text-danger">*</span>
            </Label>
            {isLoadingEvents ? (
              <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-gold" /> Memuat event...
              </div>
            ) : (
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Pilih event..." /></SelectTrigger>
                <SelectContent>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{event.title}</span>
                        <span className="text-xs text-muted-foreground">{new Date(event.showDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} · {event.location}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedEvent && (
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-xs">{selectedEvent.category}</Badge>
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{selectedEvent.location}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Guest Info */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Informasi Tamu</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />Nama <span className="text-danger">*</span></Label>
                <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Nama tamu" className="bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />Email <span className="text-danger">*</span></Label>
                <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="email@contoh.com" className="bg-white" />
              </div>
            </div>
            <div className="space-y-1.5 sm:max-w-md">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />No. WhatsApp <span className="text-danger">*</span></Label>
              <Input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="08xxxxxxxxxx" className="bg-white" />
            </div>
          </div>

          <Separator />

          {/* Ticket Quantity */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2"><Ticket className="w-4 h-4 text-gold" />Jumlah Tiket</Label>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setTicketQuantity((q) => Math.max(1, q - 1))} disabled={ticketQuantity <= 1}>-</Button>
              <Input type="number" min={1} max={50} value={ticketQuantity} onChange={(e) => setTicketQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="h-9 w-20 text-center bg-white" />
              <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setTicketQuantity((q) => Math.min(50, q + 1))} disabled={ticketQuantity >= 50}>+</Button>
              <span className="text-xs text-muted-foreground">tiket</span>
            </div>
            <div className="bg-muted/20 rounded-lg p-3 text-xs">
              <p className="font-medium text-charcoal mb-1">Preview kode tiket:</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: Math.min(ticketQuantity, 10) }, (_, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">GA-{i + 1}</Badge>
                ))}
                {ticketQuantity > 10 && <Badge variant="secondary" className="text-[10px]">+{ticketQuantity - 10} lagi</Badge>}
              </div>
            </div>
          </div>

          <Separator />

          {/* Submit */}
          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedEventId || !guestName || !guestEmail || !guestPhone}
              className="bg-charcoal hover:bg-charcoal/90 text-gold min-w-[200px]"
            >
              {isSubmitting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengirim...</>) : (<><Send className="w-4 h-4 mr-2" />Kirim Tiket Komplimen</>)}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Complimentary Tickets */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="font-serif text-lg text-charcoal flex items-center gap-2">
            <Clock className="w-4 h-4 text-gold" />
            Riwayat Tiket Komplimen
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingRecent ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-gold animate-spin" /></div>
          ) : recentTickets.length === 0 ? (
            <div className="text-center py-12">
              <Gift className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Belum ada tiket komplimen</p>
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
