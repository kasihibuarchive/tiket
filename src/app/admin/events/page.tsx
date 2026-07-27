'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatShortDate, toDatetimeLocalValue } from '@/lib/date'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import {
  Plus, Edit, Trash2, LayoutGrid, Eye, EyeOff, Loader2, Calendar, X, Banknote, Map, CheckCircle2, Video, Smartphone, Users, RotateCcw, Star, Ticket
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'

interface EventData {
  id: string
  title: string
  category: string
  showDate: string
  location: string
  isPublished: boolean
  isCompleted?: boolean
  priceCategories: Array<{
    id: string
    name: string
    price: number
    colorCode: string
    packageType?: string | null
    applicableDayIds?: string[] | null
  }>
  seatSummary?: { total: number; available: number; sold: number }
  seatMapId: string | null
  seatMapInfo?: { name: string; seatType: string } | null
  showDates?: Array<{ id: string; date: string; openGate: string | null; label: string | null }>
  posterUrl?: string | null
  synopsis?: string
  teaserVideoUrl?: string | null
  adminFee?: number
  seatType?: string | null
  reviewStats?: { total: number; average: number }
  // Festival Mode
  eventMode?: string
  multiDayPassEnabled?: boolean
  scanCooldownMinutes?: number
  cooldownEnabled?: boolean
  // GA Zone Config (JSON string from DB) — used to pre-fill capacity in price category form
  gaZoneConfig?: string | null
}

interface SeatMapOption {
  id: string
  name: string
  seatType: string
}

interface PriceCategoryForm {
  name: string
  price: number
  colorCode: string
  capacity?: number            // GA only — auto-generates GA zone with this capacity
  packageType?: string | null   // "SINGLE" | "MULTI" | "FULL" | null
  applicableDayIds?: string[]  // Array of showDate temp IDs (frontend only)
}

interface ShowDateForm {
  id?: string         // existing DB id (when editing)
  date: string
  openGate: string
  label: string
  tempId?: string     // frontend-only temp ID for matching price categories
}

interface EventFormData {
  title: string
  category: string
  showDate: string
  openGate: string
  location: string
  posterUrl: string
  teaserVideoUrl: string
  synopsis: string
  isPublished: boolean
  adminFee: number
  seatType: string
  priceCategories: PriceCategoryForm[]
  showDates: ShowDateForm[]
  // Festival Mode
  eventMode: string  // "REGULAR" | "FESTIVAL"
  scanCooldownMinutes: number
  cooldownEnabled: boolean
  // GA Zone Config (raw JSON string from DB, used to preserve existing zone notes/capacity on edits)
  gaZoneConfig?: string | null
}

const emptyForm: EventFormData = {
  title: '',
  category: 'Teater',
  showDate: '',
  openGate: '',
  location: '',
  posterUrl: '',
  teaserVideoUrl: '',
  synopsis: '',
  isPublished: false,
  adminFee: 0,
  seatType: 'NUMBERED',
  priceCategories: [
    { name: 'VIP', price: 150000, colorCode: '#C8A951', capacity: 100 },
    { name: 'Regular', price: 75000, colorCode: '#8B8680', capacity: 200 },
    { name: 'Student', price: 35000, colorCode: '#7BA7A5', capacity: 50 },
  ],
  showDates: [{ date: '', openGate: '', label: '', tempId: 'd1' }],
  eventMode: 'REGULAR',
  scanCooldownMinutes: 30,
  cooldownEnabled: true,
}

export default function AdminEventsPage() {
  const router = useRouter()
  const [events, setEvents] = useState<EventData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<EventFormData>(emptyForm)

  // Generate seats dialog state
  const [isGenDialogOpen, setIsGenDialogOpen] = useState(false)
  const [genEventId, setGenEventId] = useState<string | null>(null)
  const [genEventTitle, setGenEventTitle] = useState('')
  const [seatMaps, setSeatMaps] = useState<SeatMapOption[]>([])
  const [selectedSeatMapId, setSelectedSeatMapId] = useState('')
  const [isLoadingMaps, setIsLoadingMaps] = useState(false)
  const [isGeneratingSeats, setIsGeneratingSeats] = useState(false)

  // Publish/unpublish confirmation dialog
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false)
  const [publishEvent, setPublishEvent] = useState<EventData | null>(null)
  const [isTogglingPublish, setIsTogglingPublish] = useState(false)

  // Queue config dialog state
  const [isQueueDialogOpen, setIsQueueDialogOpen] = useState(false)
  const [queueEventId, setQueueEventId] = useState<string | null>(null)
  const [queueEventTitle, setQueueEventTitle] = useState('')
  const [queueEnabled, setQueueEnabled] = useState(false)
  const [queueMaxConcurrent, setQueueMaxConcurrent] = useState(50)
  const [queueStats, setQueueStats] = useState<{ activeUsers: number; waitingUsers: number; expiredUsers?: number } | null>(null)
  const [isSavingQueue, setIsSavingQueue] = useState(false)
  const [isLoadingQueue, setIsLoadingQueue] = useState(false)

  useEffect(() => {
    fetchEvents()
  }, [])

  async function fetchEvents() {
    setFetchError(null)
    try {
      const res = await fetch('/api/admin/events')
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
      } else {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }))
        setFetchError(data.error || `Error ${res.status}`)
        setEvents([])
      }
    } catch (err) {
      console.error('Failed to fetch events:', err)
      setFetchError('Gagal terhubung ke server. Coba refresh halaman.')
      setEvents([])
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingId(null)
    setFormData(emptyForm)
    setIsDialogOpen(true)
  }

  function openEditDialog(event: EventData) {
    setEditingId(event.id)
    // Build showDates with tempId for matching price categories
    const showDates: ShowDateForm[] = (event.showDates && event.showDates.length > 0)
      ? event.showDates.map((sd, idx) => ({
          id: sd.id,
          date: toDatetimeLocalValue(sd.date),
          openGate: sd.openGate ? toDatetimeLocalValue(sd.openGate) : '',
          label: sd.label || '',
          tempId: `d${idx + 1}`,
        }))
      : [
          { date: toDatetimeLocalValue(event.showDate), openGate: '', label: '', tempId: 'd1' },
        ]

    // Map price categories — convert DB applicableDayIds (array of showDate DB IDs) to tempIds for frontend editing
    // Use Record (plain object) instead of Map — avoids conflict with lucide-react's `Map` icon import
    const showDateIdToTempId: Record<string, string> = {}
    showDates.forEach(sd => {
      if (sd.id && sd.tempId) showDateIdToTempId[sd.id] = sd.tempId
    })

    setFormData({
      title: event.title,
      category: event.category,
      showDate: toDatetimeLocalValue(event.showDate),
      openGate: event.showDates?.[0]?.openGate ? toDatetimeLocalValue(event.showDates[0].openGate) : '',
      location: event.location,
      posterUrl: event.posterUrl || '',
      teaserVideoUrl: event.teaserVideoUrl || '',
      synopsis: event.synopsis || '',
      isPublished: event.isPublished,
      adminFee: event.adminFee || 0,
      seatType: event.seatType || 'NUMBERED',
      priceCategories: event.priceCategories.map((pc) => {
        // Pre-fill capacity from existing gaZoneConfig (if zone with matching name exists)
        let existingCapacity = 100
        try {
          if (event.gaZoneConfig) {
            const zones = JSON.parse(event.gaZoneConfig) as Array<{ name?: string; priceCategoryName?: string; capacity?: number }>
            const match = zones.find(z => z.priceCategoryName === pc.name || z.name === pc.name)
            if (match?.capacity) existingCapacity = match.capacity
          }
        } catch { /* ignore */ }
        return {
          name: pc.name,
          price: pc.price,
          colorCode: pc.colorCode,
          capacity: existingCapacity,
          packageType: pc.packageType || null,
          applicableDayIds: (pc.applicableDayIds || []).map((id: string) => showDateIdToTempId[id] || id),
        }
      }),
      showDates,
      // Festival Mode
      eventMode: event.eventMode || 'REGULAR',
      scanCooldownMinutes: event.scanCooldownMinutes ?? 30,
      cooldownEnabled: event.cooldownEnabled ?? true,
      // GA Zone Config — preserve original so we can extract notes when re-syncing zones
      gaZoneConfig: event.gaZoneConfig || null,
    })
    setIsDialogOpen(true)
  }

  function updatePriceCategory(index: number, field: string, value: string | number | string[] | null) {
    setFormData((prev) => {
      const updated = [...prev.priceCategories]
      updated[index] = { ...updated[index], [field]: value }
      return { ...prev, priceCategories: updated }
    })
  }

  function addPriceCategory() {
    setFormData((prev) => ({
      ...prev,
      priceCategories: [...prev.priceCategories, {
        name: '',
        price: 0,
        colorCode: '#8B8680',
        capacity: 100,
        // Festival defaults — inherit from previous category if exists
        packageType: prev.priceCategories.length > 0 ? prev.priceCategories[prev.priceCategories.length - 1].packageType : null,
        applicableDayIds: prev.priceCategories.length > 0 ? prev.priceCategories[prev.priceCategories.length - 1].applicableDayIds : [],
      }],
    }))
  }

  function removePriceCategory(index: number) {
    setFormData((prev) => ({
      ...prev,
      priceCategories: prev.priceCategories.filter((_, i) => i !== index),
    }))
  }

  function addShowDate() {
    setFormData((prev) => ({
      ...prev,
      showDates: [...prev.showDates, {
        date: '',
        openGate: '',
        label: `Hari ${prev.showDates.length + 1}`,
        tempId: `d${prev.showDates.length + 1}`,
      }],
    }))
  }

  function removeShowDate(index: number) {
    setFormData((prev) => {
      const removed = prev.showDates[index]
      const removedTempId = removed.tempId
      // Also remove this tempId from any price categories that reference it
      const updatedPriceCats = prev.priceCategories.map(pc => ({
        ...pc,
        applicableDayIds: (pc.applicableDayIds || []).filter(id => id !== removedTempId),
      }))
      return {
        ...prev,
        showDates: prev.showDates.filter((_, i) => i !== index),
        priceCategories: updatedPriceCats,
      }
    })
  }

  function updateShowDate(index: number, field: string, value: string) {
    setFormData((prev) => {
      const updated = [...prev.showDates]
      updated[index] = { ...updated[index], [field]: value }
      return { ...prev, showDates: updated }
    })
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      const url = editingId ? `/api/admin/events/${editingId}` : '/api/admin/events'
      const method = editingId ? 'PUT' : 'POST'

      const isFestival = formData.eventMode === 'FESTIVAL'

      // Build a map of showDate tempId → existing DB id (for editing existing events)
      // For new showDates (no DB id), they'll be saved first then matched to price categories in a second pass
      // Use Record (plain object) — avoids conflict with lucide-react's `Map` icon import
      const showDateTempToDbId: Record<string, string> = {}
      formData.showDates.forEach(sd => {
        if (sd.id && sd.tempId) showDateTempToDbId[sd.tempId] = sd.id
      })

      // Festival Mode: filter out empty price categories and serialize applicableDayIds
      const serializedPriceCategories = formData.priceCategories
        .filter(pc => pc.name.trim())
        .map(pc => {
          if (!isFestival) {
            // Regular event: no packageType / applicableDayIds
            const { packageType, applicableDayIds, ...rest } = pc
            void packageType; void applicableDayIds
            return rest
          }
          // Festival Mode
          const pkgType = pc.packageType || 'SINGLE'
          // FULL = all days (null), SINGLE/MULTI = specific days
          if (pkgType === 'FULL') {
            const { packageType: _pt, applicableDayIds: _ad, ...rest } = pc
            void _pt; void _ad
            return { ...rest, packageType: 'FULL', applicableDayIds: null }
          }
          // SINGLE or MULTI: convert tempIds to DB IDs where possible (fallback to tempId for new showDates)
          const dayIds = (pc.applicableDayIds || []).map(tempId =>
            showDateTempToDbId[tempId] || tempId
          )
          return {
            name: pc.name,
            price: pc.price,
            colorCode: pc.colorCode,
            packageType: pkgType,
            applicableDayIds: JSON.stringify(dayIds),
          }
        })

      // ─── GA Integration: auto-build gaZoneConfig from price categories ──
      // For GA events (REGULAR+GA or FESTIVAL), auto-generate one zone per
      // price category so admin doesn't have to redefine zones in seats page.
      const effectiveSeatType = isFestival ? 'GENERAL_ADMISSION' : formData.seatType
      const isGA = effectiveSeatType === 'GENERAL_ADMISSION'

      // Preserve existing zone notes if a zone with the same name already exists
      let existingZones: Array<{ name?: string; priceCategoryName?: string; notes?: string }> = []
      try {
        if (formData.gaZoneConfig) {
          existingZones = JSON.parse(formData.gaZoneConfig)
        }
      } catch { /* ignore */ }

      // Build new gaZoneConfig from price categories (1 zone per category)
      const gaZoneConfig = isGA
        ? JSON.stringify(formData.priceCategories
            .filter(pc => pc.name.trim())
            .map(pc => {
              const match = existingZones.find(z =>
                z.priceCategoryName === pc.name || z.name === pc.name)
              return {
                name: pc.name,
                capacity: pc.capacity ?? 100,
                price: pc.price,
                color: pc.colorCode,
                priceCategoryName: pc.name,
                notes: match?.notes || '',
              }
            }))
        : undefined

      const payload = {
        ...formData,
        // Use first showDate entry as the primary showDate (backward compat)
        showDate: formData.showDates[0]?.date
          ? new Date(formData.showDates[0].date).toISOString()
          : new Date().toISOString(),
        openGate: formData.showDates[0]?.openGate
          ? new Date(formData.showDates[0].openGate).toISOString()
          : null,
        showDates: formData.showDates
          .filter((sd) => sd.date)
          .map(sd => ({ id: sd.id, date: sd.date, openGate: sd.openGate, label: sd.label })),
        priceCategories: serializedPriceCategories,
        // Festival Mode
        eventMode: formData.eventMode,
        scanCooldownMinutes: formData.scanCooldownMinutes,
        cooldownEnabled: formData.cooldownEnabled,
        // Force seatType = GA when FESTIVAL
        seatType: isFestival ? 'GENERAL_ADMISSION' : formData.seatType,
        // GA Integration: auto-sync gaZoneConfig from price categories
        ...(gaZoneConfig !== undefined ? { gaZoneConfig } : {}),
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        // For FESTIVAL events with new showDates, we need a second pass to update applicableDayIds
        // with real DB IDs (since new showDates only got their IDs after the first save)
        if (isFestival && editingId) {
          // Refetch event to get actual DB IDs for showDates
          const refetchRes = await fetch(`/api/admin/events/${editingId}`)
          if (refetchRes.ok) {
            const refetchData = await refetchRes.json()
            const updatedShowDates = refetchData.event.showDates || []
            // Build new tempId → DB ID map using position in array (since order is preserved by date asc)
            const newTempToDbMap: Record<string, string> = {}
            const sortedShowDates = [...formData.showDates].filter(sd => sd.date)
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            updatedShowDates.forEach((dbSd: { id: string }, idx: number) => {
              if (sortedShowDates[idx]?.tempId) {
                newTempToDbMap[sortedShowDates[idx].tempId!] = dbSd.id
              }
            })
            // Check if any price category has applicableDayIds that need updating
            const needsUpdate = formData.priceCategories.some(pc =>
              pc.packageType && pc.packageType !== 'FULL' &&
              (pc.applicableDayIds || []).some(tempId => !showDateTempToDbId[tempId])
            )
            if (needsUpdate) {
              const updatedPriceCats = formData.priceCategories
                .filter(pc => pc.name.trim())
                .map(pc => {
                  if (!pc.packageType || pc.packageType === 'FULL') {
                    return {
                      name: pc.name,
                      price: pc.price,
                      colorCode: pc.colorCode,
                      packageType: pc.packageType || null,
                      applicableDayIds: null,
                    }
                  }
                  const dayIds = (pc.applicableDayIds || []).map(tempId =>
                    newTempToDbMap[tempId] || showDateTempToDbId[tempId] || tempId
                  )
                  return {
                    name: pc.name,
                    price: pc.price,
                    colorCode: pc.colorCode,
                    packageType: pc.packageType,
                    applicableDayIds: JSON.stringify(dayIds),
                  }
                })
              // Send second update to fix applicableDayIds
              await fetch(`/api/admin/events/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priceCategories: updatedPriceCats }),
              })
            }
          }
        }
        setIsDialogOpen(false)
        fetchEvents()
      } else {
        const data = await res.json()
        alert(data.error || 'Gagal menyimpan event')
      }
    } catch (err) {
      console.error('Save error:', err)
      alert('Terjadi kesalahan')
    } finally {
      setIsSaving(false)
    }
  }

  const [isSaving, setIsSaving] = useState(false)

  async function handleDelete(id: string) {
    if (!confirm('Apakah Anda yakin ingin menghapus event ini? Semua data terkait akan dihapus.')) return

    try {
      const res = await fetch(`/api/admin/events/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchEvents()
      }
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  function openPublishDialog(event: EventData) {
    setPublishEvent(event)
    setIsPublishDialogOpen(true)
  }

  async function handleTogglePublish() {
    if (!publishEvent) return
    setIsTogglingPublish(true)
    try {
      const res = await fetch(`/api/admin/events/${publishEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...publishEvent, isPublished: !publishEvent.isPublished }),
      })
      if (res.ok) {
        fetchEvents()
        setIsPublishDialogOpen(false)
      }
    } catch (err) {
      console.error('Toggle publish error:', err)
    } finally {
      setIsTogglingPublish(false)
    }
  }

  // ─── Toggle Completed ────────────────────────────────────────────────

  async function handleToggleComplete(event: EventData) {
    const newCompleted = !event.isCompleted
    const confirmed = confirm(
      newCompleted
        ? `Tandai "${event.title}" sebagai SELESAI?\n\nTiket tidak bisa dibeli lagi, tapi guest bisa memberikan review.`
        : `Buka kembali "${event.title}"?\n\nEvent akan bisa dibeli tiketnya lagi.`
    )
    if (!confirmed) return

    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: newCompleted }),
      })
      if (res.ok) {
        fetchEvents()
      } else {
        const data = await res.json()
        alert(data.error || 'Gagal mengubah status')
      }
    } catch (err) {
      console.error('Toggle complete error:', err)
      alert('Terjadi kesalahan')
    }
  }

  // ─── Queue Management ────────────────────────────────────────────────

  async function openQueueDialog(eventId: string, eventTitle: string) {
    setQueueEventId(eventId)
    setQueueEventTitle(eventTitle)
    setIsQueueDialogOpen(true)
    setIsLoadingQueue(true)

    try {
      const res = await fetch(`/api/events/${eventId}/queue/configure`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setQueueEnabled(data.enabled)
        setQueueMaxConcurrent(data.maxConcurrent)
        setQueueStats({
          activeUsers: data.activeUsers,
          waitingUsers: data.waitingUsers,
          expiredUsers: data.expiredUsers,
        })
      }
    } catch (err) {
      console.error('Failed to fetch queue config:', err)
    } finally {
      setIsLoadingQueue(false)
    }
  }

  async function handleSaveQueue() {
    if (!queueEventId) return
    setIsSavingQueue(true)

    try {
      const res = await fetch(`/api/events/${queueEventId}/queue/configure`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: queueEnabled, maxConcurrent: queueMaxConcurrent }),
      })

      if (res.ok) {
        const data = await res.json()
        setQueueEnabled(data.enabled)
        setQueueStats({
          activeUsers: data.activeUsers,
          waitingUsers: data.waitingUsers,
        })
      } else {
        const data = await res.json()
        alert(data.error || 'Gagal menyimpan konfigurasi queue')
      }
    } catch (err) {
      console.error('Save queue error:', err)
      alert('Terjadi kesalahan')
    } finally {
      setIsSavingQueue(false)
    }
  }

  // ─── Generate Seats from Seat Map ────────────────────────────────────

  function openGenerateDialog(eventId: string, eventTitle: string, currentSeatMapId: string | null) {
    setGenEventId(eventId)
    setGenEventTitle(eventTitle)
    setSelectedSeatMapId(currentSeatMapId || '')
    setIsGenDialogOpen(true)

    // Fetch available seat maps
    setIsLoadingMaps(true)
    fetch('/api/admin/seat-maps')
      .then((res) => res.ok ? res.json() : { seatMaps: [] })
      .then((data) => setSeatMaps(data.seatMaps || []))
      .catch(() => setSeatMaps([]))
      .finally(() => setIsLoadingMaps(false))
  }

  async function handleGenerateSeats() {
    if (!genEventId || !selectedSeatMapId) return

    // If event already has seats, confirm deletion first
    const currentSeats = genEvent?.seatSummary?.total || 0
    if (currentSeats > 0) {
      const confirmed = confirm(
        `Event ini sudah punya ${currentSeats} kursi.\n\nKursi lama akan dihapus dan diganti dengan yang baru dari seat map yang dipilih.\nLanjutkan?`
      )
      if (!confirmed) return
    }

    setIsGeneratingSeats(true)
    try {
      // Delete existing seats first if any
      if (currentSeats > 0) {
        const delRes = await fetch(`/api/admin/events/${genEventId}/seats`, { method: 'DELETE' })
        if (!delRes.ok) {
          const delData = await delRes.json()
          alert(delData.error || 'Gagal menghapus kursi lama')
          setIsGeneratingSeats(false)
          return
        }
      }

      const res = await fetch(`/api/admin/events/${genEventId}/generate-seats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatMapId: selectedSeatMapId }),
      })

      if (res.ok) {
        const data = await res.json()
        alert(`${data.message}`)
        setIsGenDialogOpen(false)
        fetchEvents()
      } else {
        const data = await res.json()
        alert(data.error || 'Gagal generate kursi')
      }
    } catch (err) {
      console.error('Generate seats error:', err)
      alert('Terjadi kesalahan')
    } finally {
      setIsGeneratingSeats(false)
    }
  }

  // ─── Get selected seat map info ──────────────────────────────────────

  const selectedMap = seatMaps.find((m) => m.id === selectedSeatMapId)
  const genEvent = events.find((e) => e.id === genEventId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-charcoal">Events</h1>
          <p className="text-sm text-muted-foreground mt-1">Kelola pertunjukan teater</p>
        </div>
        <Button onClick={openCreateDialog} className="bg-charcoal hover:bg-charcoal/90 text-gold">
          <Plus className="w-4 h-4 mr-2" />
          Buat Event
        </Button>
      </div>

      {/* Events Table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gold animate-spin" />
            </div>
          ) : fetchError ? (
            <div className="text-center py-12">
              <p className="text-destructive text-sm font-medium">{fetchError}</p>
              <Button onClick={fetchEvents} variant="outline" size="sm" className="mt-4">
                Coba Lagi
              </Button>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm">Belum ada event</p>
              <Button onClick={openCreateDialog} variant="outline" size="sm" className="mt-4">
                <Plus className="w-3 h-3 mr-1" />
                Buat Event Pertama
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Judul</TableHead>
                  <TableHead className="text-xs">Seat Map</TableHead>
                  <TableHead className="text-xs">Tanggal</TableHead>
                  <TableHead className="text-xs">Kursi</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <Link href={`/events/${event.id}`} className="font-medium text-charcoal hover:text-gold transition-colors">
                        {event.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground">{event.location}</p>
                        {event.eventMode === 'FESTIVAL' && (
                          <Badge variant="secondary" className="text-[9px] bg-gold/15 text-gold border-gold/30 px-1.5 py-0 h-4">
                            🎪 Festival
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {event.seatMapInfo ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium text-charcoal">{event.seatMapInfo.name}</span>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] w-fit ${
                              event.seatMapInfo.seatType === 'NUMBERED'
                                ? 'bg-blue-500/10 text-blue-600'
                                : event.seatMapInfo.seatType === 'PIANO_ROLL'
                                ? 'bg-purple-500/10 text-purple-600'
                                : 'bg-success/10 text-success'
                            }`}
                          >
                            {event.seatMapInfo.seatType === 'NUMBERED' ? 'Kursi Nomor' : event.seatMapInfo.seatType === 'PIANO_ROLL' ? 'Piano Roll' : 'Bebas Duduk'}
                          </Badge>
                        </div>
                      ) : event.seatSummary && event.seatSummary.total > 0 ? (
                        <Badge variant="secondary" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {event.seatSummary.total} kursi
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Belum generate
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.showDates && event.showDates.length > 1 ? (
                        <div className="flex flex-col gap-0.5">
                          <span>{formatShortDate(event.showDate)}</span>
                          <Badge variant="secondary" className="text-[9px] bg-gold/10 text-gold-dark w-fit">Multi-hari</Badge>
                        </div>
                      ) : (
                        formatShortDate(event.showDate)
                      )}
                    </TableCell>
                    <TableCell>
                      {event.seatSummary && event.seatSummary.total > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {event.seatSummary.available}/{event.seatSummary.total}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant="secondary"
                          className={`text-xs ${event.isPublished ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}
                        >
                          {event.isPublished ? 'Published' : 'Draft'}
                        </Badge>
                        {event.isCompleted && (
                          <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Selesai
                          </Badge>
                        )}
                        {event.isCompleted && event.reviewStats && event.reviewStats.total > 0 && (
                          <Badge variant="secondary" className="text-xs bg-gold/10 text-gold-dark">
                            <Star className="w-3 h-3 mr-1" />
                            {event.reviewStats.average} ({event.reviewStats.total})
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          asChild
                          title="Seat Editor"
                        >
                          <Link href={`/admin/events/${event.id}/seats`}>
                            <LayoutGrid className="w-3.5 h-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-8 w-8',
                            event.seatSummary && event.seatSummary.total > 0
                              ? 'text-amber-500 hover:text-amber-600'
                              : 'text-gold'
                          )}
                          onClick={() => openGenerateDialog(event.id, event.title, event.seatMapId)}
                          title={
                            event.seatSummary && event.seatSummary.total > 0
                              ? 'Regenerate Kursi (hapus & ganti)'
                              : 'Generate Kursi dari Seat Map'
                          }
                        >
                          <Map className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openPublishDialog(event)}
                          title={event.isPublished ? 'Unpublish' : 'Publish'}
                        >
                          {event.isPublished ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-8 w-8',
                            event.isCompleted
                              ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                              : 'text-muted-foreground hover:text-charcoal'
                          )}
                          onClick={() => handleToggleComplete(event)}
                          title={event.isCompleted ? 'Buka Kembali (Reopen)' : 'Tandai Selesai'}
                        >
                          {event.isCompleted ? <RotateCcw className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          asChild
                          title="Edit Event"
                        >
                          <Link href={`/admin/events/${event.id}`}>
                            <Edit className="w-3.5 h-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-8 w-8',
                            queueEventId === event.id && queueEnabled
                              ? 'text-gold'
                              : 'text-muted-foreground'
                          )}
                          onClick={() => openQueueDialog(event.id, event.title)}
                          title="Queue Settings"
                        >
                          <Users className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-danger"
                          onClick={() => handleDelete(event.id)}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Event Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">
              {editingId ? 'Edit Event' : 'Buat Event Baru'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Judul Event *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Contoh: Hamlet - Pertunjukan Spesial"
              />
            </div>

            {/* ── FESTIVAL MODE SELECTOR ── */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Mode Event</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({
                    ...formData,
                    eventMode: 'REGULAR',
                    // Reset festival fields when switching to REGULAR
                    seatType: formData.seatType === 'GENERAL_ADMISSION' ? 'NUMBERED' : formData.seatType,
                  })}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    formData.eventMode === 'REGULAR'
                      ? 'border-gold bg-gold/5'
                      : 'border-border/50 hover:border-gold/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">🎭</span>
                    <span className="text-sm font-semibold text-charcoal">Regular</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Single show. Numbered/GA seating. Untuk pertunjukan teater biasa.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({
                    ...formData,
                    eventMode: 'FESTIVAL',
                    // Force GA when FESTIVAL
                    seatType: 'GENERAL_ADMISSION',
                  })}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    formData.eventMode === 'FESTIVAL'
                      ? 'border-gold bg-gold/5'
                      : 'border-border/50 hover:border-gold/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">🎪</span>
                    <span className="text-sm font-semibold text-charcoal">Festival</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Multi-day pass (1/2/4 hari). GA only. Scan cooldown anti-share tiket.</p>
                </button>
              </div>
            </div>

            {/* ── FESTIVAL SETTINGS (only show when FESTIVAL) ── */}
            {formData.eventMode === 'FESTIVAL' && (
              <div className="rounded-lg border-2 border-gold/30 bg-gold/5 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-charcoal">🎪 Pengaturan Festival</span>
                  <Badge variant="secondary" className="text-[10px] bg-gold/20 text-gold border-gold/30">Festival Mode</Badge>
                </div>

                {/* Cooldown Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-charcoal">Aktifkan Cooldown Scan</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Setelah scan valid, tiket di-lock sementara untuk cegah share tiket antar penonton
                    </p>
                  </div>
                  <Switch
                    checked={formData.cooldownEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, cooldownEnabled: checked })}
                  />
                </div>

                {/* Cooldown Minutes */}
                {formData.cooldownEnabled && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Durasi Cooldown (menit)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={240}
                      value={formData.scanCooldownMinutes}
                      onChange={(e) => setFormData({
                        ...formData,
                        scanCooldownMinutes: Math.max(1, Number(e.target.value) || 30),
                      })}
                      className="h-9 text-sm max-w-[140px]"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Default 30 menit. Usher bisa reset manual kapan saja. Contoh: 30 menit cukup untuk cegah share, tapi tetap fleksibel untuk re-entry antar pertunjukan.
                    </p>
                  </div>
                )}

                <div className="text-[11px] text-muted-foreground bg-white/50 rounded p-2 border border-gold/20">
                  💡 <span className="font-medium">Tips setup Festival:</span><br />
                  • Tambah minimal 2 hari pertunjukan (gunakan tombol "Tambah Hari")<br />
                  • Bikin price category per paket: 1-Day, 2-Day, Full Pass<br />
                  • Setiap paket pilih hari mana saja yang berlaku<br />
                  • Seating otomatis di-lock ke General Admission (GA)
                </div>
              </div>
            )}

            {/* Category & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Kategori</Label>
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Teater"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Lokasi *</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Teateran, Yogyakarta"
                />
              </div>
            </div>

            {/* Seat Type */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                Tipe Kursi
                {formData.eventMode === 'FESTIVAL' && (
                  <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                    🔒 Locked to GA (Festival Mode)
                  </Badge>
                )}
              </Label>
              <Select
                value={formData.seatType}
                onValueChange={(val) => setFormData({ ...formData, seatType: val })}
                disabled={formData.eventMode === 'FESTIVAL'}
              >
                <SelectTrigger className={`bg-white ${formData.eventMode === 'FESTIVAL' ? 'opacity-60 cursor-not-allowed' : ''}`}>
                  <SelectValue placeholder="Pilih tipe kursi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NUMBERED" disabled={formData.eventMode === 'FESTIVAL'}>
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Kursi Nomor (Numbered) {formData.eventMode === 'FESTIVAL' && '— Tidak tersedia di Festival Mode'}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="GENERAL_ADMISSION">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5" />
                      <span>General Admission (GA)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formData.eventMode === 'FESTIVAL'
                  ? '🔒 Festival Mode hanya support General Admission. Numbered seating tidak tersedia untuk event multi-day pass.'
                  : formData.seatType === 'GENERAL_ADMISSION'
                    ? 'GA: Pengunjung memilih zona, bukan kursi individu. Upload layout gambar & definisi zona di halaman Seat Editor.'
                    : 'Kursi Nomor: Pengunjung memilih kursi individual dari seat map.'}
              </p>
            </div>

            {/* Dates */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Jadwal Pertunjukan *</Label>
                <Button variant="outline" size="sm" onClick={addShowDate} className="text-xs h-7">
                  <Plus className="w-3 h-3 mr-1" />
                  Tambah Hari
                </Button>
              </div>
              {formData.showDates.map((sd, idx) => (
                <div key={idx} className="relative rounded-lg border border-border/60 p-3 space-y-2 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {formData.showDates.length > 1 ? `Hari ${idx + 1}` : 'Tanggal & Waktu'}
                    </span>
                    {idx > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => removeShowDate(idx)} className="h-6 w-6 p-0 text-danger hover:text-danger hover:bg-danger/10">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Label</Label>
                      <Input
                        value={sd.label}
                        onChange={(e) => updateShowDate(idx, 'label', e.target.value)}
                        placeholder="contoh: Premiere, Gala..."
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Buka Pintu (WIB)</Label>
                      <Input
                        type="datetime-local"
                        value={sd.openGate}
                        onChange={(e) => updateShowDate(idx, 'openGate', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tanggal & Waktu Tayang (WIB) *</Label>
                    <Input
                      type="datetime-local"
                      value={sd.date}
                      onChange={(e) => updateShowDate(idx, 'date', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Poster URL */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">URL Poster (opsional)</Label>
              <Input
                value={formData.posterUrl}
                onChange={(e) => setFormData({ ...formData, posterUrl: e.target.value })}
                placeholder="https://example.com/poster.jpg"
              />
            </div>

            {/* Teaser Video URL */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Video className="w-4 h-4 text-gold" />
                URL Video Teaser (opsional)
              </Label>
              <Input
                value={formData.teaserVideoUrl}
                onChange={(e) => setFormData({ ...formData, teaserVideoUrl: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <p className="text-xs text-muted-foreground">Mendukung YouTube dan Vimeo. Video akan ditampilkan di halaman publik event.</p>
            </div>

            {/* Synopsis */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Sinopsis</Label>
              <Textarea
                value={formData.synopsis}
                onChange={(e) => setFormData({ ...formData, synopsis: e.target.value })}
                placeholder="Deskripsi singkat pertunjukan..."
                rows={4}
              />
            </div>

            {/* Admin Fee */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Banknote className="w-4 h-4 text-gold" />
                Biaya Admin per Tiket (Rp)
              </Label>
              <Input
                type="number"
                value={formData.adminFee}
                onChange={(e) => setFormData({ ...formData, adminFee: Number(e.target.value) || 0 })}
                placeholder="0"
                className="bg-white"
              />
              <p className="text-xs text-muted-foreground">Biaya tambahan per tiket. Set 0 jika tidak ada biaya admin.</p>
            </div>

            <Separator />

            {/* Price Categories */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Kategori Harga
                  {formData.eventMode === 'FESTIVAL' && (
                    <Badge variant="secondary" className="ml-2 text-[10px] bg-gold/20 text-gold border-gold/30">
                      Paket Festival
                    </Badge>
                  )}
                </Label>
                <Button variant="outline" size="sm" onClick={addPriceCategory}>
                  <Plus className="w-3 h-3 mr-1" />
                  Tambah
                </Button>
              </div>

              {formData.eventMode === 'FESTIVAL' && (
                <div className="text-[11px] text-muted-foreground bg-gold/5 border border-gold/20 rounded p-2">
                  🎪 <span className="font-medium">Paket Festival:</span> Setiap kategori = 1 paket tiket.
                  Pilih <span className="font-medium">Single</span> untuk 1 hari, <span className="font-medium">Multi</span> untuk beberapa hari (e.g., 2-day pass Hari 1+2),
                  atau <span className="font-medium">Full Pass</span> untuk akses semua hari.
                </div>
              )}

              {/* GA Integration hint */}
              {(formData.seatType === 'GENERAL_ADMISSION' || formData.eventMode === 'FESTIVAL') && (
                <div className="text-[11px] text-muted-foreground bg-emerald-50 border border-emerald-200 rounded p-2 flex items-start gap-1.5">
                  <Ticket className="w-3 h-3 text-emerald-600 mt-0.5 shrink-0" />
                  <span>
                    <span className="font-medium text-emerald-700">Auto GA Zona:</span> Isi kapasitas per kategori — zona GA akan otomatis ter-generate di halaman Seat Editor saat event disimpan. Tidak perlu input zona manual lagi.
                  </span>
                </div>
              )}

              {formData.priceCategories.map((pc, index) => (
                <div key={index} className="rounded-lg border border-border/60 p-3 space-y-2 bg-muted/20">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Nama</Label>
                      <Input
                        value={pc.name}
                        onChange={(e) => updatePriceCategory(index, 'name', e.target.value)}
                        placeholder={formData.eventMode === 'FESTIVAL' ? "Contoh: Day 1, 2-Day Pass, Full 4-Day" : "VIP"}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Harga (Rp)</Label>
                      <Input
                        type="number"
                        value={pc.price}
                        onChange={(e) => updatePriceCategory(index, 'price', Number(e.target.value))}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="w-16">
                      <Label className="text-xs text-muted-foreground">Warna</Label>
                      <Input
                        type="color"
                        value={pc.colorCode}
                        onChange={(e) => updatePriceCategory(index, 'colorCode', e.target.value)}
                        className="h-9 p-1"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-danger"
                      onClick={() => removePriceCategory(index)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* GA Integration: Capacity input (only for GA events) */}
                  {(formData.seatType === 'GENERAL_ADMISSION' || formData.eventMode === 'FESTIVAL') && (
                    <div className="flex items-end gap-2 pt-1">
                      <div className="w-40">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          Kapasitas Zona
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          value={pc.capacity ?? 100}
                          onChange={(e) => updatePriceCategory(index, 'capacity', Math.max(1, Number(e.target.value) || 0))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground pb-2">
                        Jumlah slot tersedia untuk kategori ini. Zona GA akan terbentuk otomatis di Seat Editor.
                      </p>
                    </div>
                  )}

                  {/* Festival Mode: Package Type + Applicable Days */}
                  {formData.eventMode === 'FESTIVAL' && (
                    <div className="space-y-2 pt-2 border-t border-border/40">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Tipe Paket</Label>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => updatePriceCategory(index, 'packageType', 'SINGLE')}
                            className={`text-[11px] px-2 py-1.5 rounded border transition-all ${
                              (pc.packageType || 'SINGLE') === 'SINGLE'
                                ? 'bg-gold/20 border-gold text-charcoal font-medium'
                                : 'bg-white border-border/50 text-muted-foreground hover:border-gold/30'
                            }`}
                          >
                            Single Day
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePriceCategory(index, 'packageType', 'MULTI')}
                            className={`text-[11px] px-2 py-1.5 rounded border transition-all ${
                              pc.packageType === 'MULTI'
                                ? 'bg-gold/20 border-gold text-charcoal font-medium'
                                : 'bg-white border-border/50 text-muted-foreground hover:border-gold/30'
                            }`}
                          >
                            Multi-Day
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePriceCategory(index, 'packageType', 'FULL')}
                            className={`text-[11px] px-2 py-1.5 rounded border transition-all ${
                              pc.packageType === 'FULL'
                                ? 'bg-emerald-100 border-emerald-400 text-emerald-700 font-medium'
                                : 'bg-white border-border/50 text-muted-foreground hover:border-emerald-300'
                            }`}
                          >
                            Full Pass
                          </button>
                        </div>
                      </div>

                      {/* Applicable Days — only for SINGLE and MULTI */}
                      {pc.packageType !== 'FULL' && (
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">
                            Hari yang Berlaku {(pc.packageType || 'SINGLE') === 'SINGLE' ? '(pilih 1)' : '(pilih yang sesuai)'}
                          </Label>
                          {formData.showDates.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground italic">Tambahkan jadwal hari pertunjukan dulu di atas ⤴</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {formData.showDates.map((sd, sdIdx) => {
                                const tempId = sd.tempId || `d${sdIdx + 1}`
                                const isSelected = (pc.applicableDayIds || []).includes(tempId)
                                const dayLabel = sd.label || `Hari ${sdIdx + 1}`
                                const dateLabel = sd.date ? new Date(sd.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '(no date)'
                                return (
                                  <button
                                    key={tempId}
                                    type="button"
                                    onClick={() => {
                                      const current = pc.applicableDayIds || []
                                      if (isSelected) {
                                        updatePriceCategory(index, 'applicableDayIds', current.filter(id => id !== tempId))
                                      } else {
                                        updatePriceCategory(index, 'applicableDayIds', [...current, tempId])
                                      }
                                    }}
                                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                                      isSelected
                                        ? 'bg-gold border-gold text-white font-medium'
                                        : 'bg-white border-border/50 text-muted-foreground hover:border-gold/40'
                                    }`}
                                  >
                                    {dayLabel} · {dateLabel}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Full Pass Info */}
                      {pc.packageType === 'FULL' && (
                        <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
                          ✓ Full Pass — berlaku untuk semua hari pertunjukan ({formData.showDates.length} hari)
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="text-sm">Batal</Button>
            </DialogClose>
            <Button
              onClick={handleSave}
              disabled={isSaving || !formData.title || !formData.location || !formData.showDates.some(sd => sd.date)}
              className="bg-charcoal hover:bg-charcoal/90 text-gold text-sm"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editingId ? 'Simpan Perubahan' : 'Buat Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Queue Config Dialog */}
      <Dialog open={isQueueDialogOpen} onOpenChange={setIsQueueDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-gold" />
              Virtual Waiting Room
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Event info */}
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Event</p>
              <p className="text-sm font-medium text-charcoal">{queueEventTitle}</p>
            </div>

            {/* Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
              <div>
                <p className="text-sm font-medium">Aktifkan Queue</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Batasi jumlah pengguna yang memilih kursi secara bersamaan
                </p>
              </div>
              <Switch
                checked={queueEnabled}
                onCheckedChange={setQueueEnabled}
                disabled={isLoadingQueue}
              />
            </div>

            {/* Max Concurrent */}
            {queueEnabled && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Maks. Pengguna Bersamaan
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={queueMaxConcurrent}
                  onChange={(e) => setQueueMaxConcurrent(Math.max(1, Number(e.target.value) || 1))}
                  className="bg-white"
                />
                <p className="text-xs text-muted-foreground">
                  Pengguna baru akan masuk antrian jika sudah ada {queueMaxConcurrent} pengguna aktif. Default: 50
                </p>
              </div>
            )}

            {/* Stats */}
            {queueEnabled && queueStats && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <p className="text-xs text-emerald-600 font-medium">Aktif</p>
                  <p className="text-xl font-bold text-emerald-700">{queueStats.activeUsers}</p>
                  <p className="text-[10px] text-emerald-500">sedang memilih kursi</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                  <p className="text-xs text-amber-600 font-medium">Menunggu</p>
                  <p className="text-xl font-bold text-amber-700">{queueStats.waitingUsers}</p>
                  <p className="text-[10px] text-amber-500">dalam antrian</p>
                </div>
              </div>
            )}

            {/* Info note */}
            <div className="bg-gold/5 rounded-lg p-3 border border-gold/10">
              <p className="text-xs text-muted-foreground">
                <strong className="text-charcoal">Admin bypass:</strong> Admin selalu bisa mengakses pemilihan kursi tanpa antrian.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Session pengguna aktif otomatis kadaluarsa setelah 5 menit tanpa aktivitas.
              </p>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="text-sm">Tutup</Button>
            </DialogClose>
            <Button
              onClick={handleSaveQueue}
              disabled={isSavingQueue || isLoadingQueue}
              className="bg-charcoal hover:bg-charcoal/90 text-gold text-sm"
            >
              {isSavingQueue ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Seats Dialog */}
      <Dialog open={isGenDialogOpen} onOpenChange={setIsGenDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg flex items-center gap-2">
              <Map className="w-5 h-5 text-gold" />
              Generate Kursi
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Event info */}
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Event</p>
              <p className="text-sm font-medium text-charcoal">{genEventTitle}</p>
              {genEvent?.seatSummary && genEvent.seatSummary.total > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ Kursi lama ({genEvent.seatSummary.total} kursi) akan dihapus dan diganti dengan yang baru.
                </p>
              )}
            </div>

            {/* Seat map selector — always show */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Pilih Seat Map *</Label>
              {isLoadingMaps ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-gold" />
                  Memuat seat maps...
                </div>
              ) : seatMaps.length === 0 ? (
                <div className="text-sm text-muted-foreground py-3 text-center bg-muted/30 rounded-lg">
                  Belum ada seat map.{' '}
                  <Link href="/admin/seat-maps/new/edit" className="text-gold underline" onClick={() => setIsGenDialogOpen(false)}>
                    Buat Seat Map dulu
                  </Link>
                </div>
              ) : (
                <Select value={selectedSeatMapId} onValueChange={setSelectedSeatMapId}>
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue placeholder="Pilih seat map..." />
                  </SelectTrigger>
                  <SelectContent>
                    {seatMaps.map((map) => (
                      <SelectItem key={map.id} value={map.id}>
                        <div className="flex items-center gap-2">
                          <Map className="w-3.5 h-3.5 text-gold" />
                          <span>{map.name}</span>
                          <Badge variant="secondary" className={`text-[10px] ml-auto ${
                            map.seatType === 'NUMBERED'
                              ? 'bg-blue-500/10 text-blue-600'
                              : map.seatType === 'PIANO_ROLL'
                              ? 'bg-purple-500/10 text-purple-600'
                              : 'bg-success/10 text-success'
                          }`}>
                            {map.seatType === 'NUMBERED' ? 'Kursi Nomor' : map.seatType === 'PIANO_ROLL' ? 'Piano Roll' : 'Bebas Duduk'}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedMap && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-success" />
                Seat map: <strong>{selectedMap.name}</strong> ({selectedMap.seatType === 'NUMBERED' ? 'Kursi Nomor' : selectedMap.seatType === 'PIANO_ROLL' ? 'Piano Roll' : 'General Admission'})
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Kursi akan di-generate sesuai layout seat map yang dipilih. Pastikan kategori harga di event cocok dengan section di seat map.
            </p>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="text-sm">Batal</Button>
            </DialogClose>
            <Button
              onClick={handleGenerateSeats}
              disabled={isGeneratingSeats || !selectedSeatMapId}
              className="bg-charcoal hover:bg-charcoal/90 text-gold text-sm"
            >
              {isGeneratingSeats ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <LayoutGrid className="w-4 h-4 mr-2" />
                  Generate Kursi
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish/Unpublish Confirmation Dialog */}
      <AlertDialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              {publishEvent?.isPublished ? 'Unpublish Event?' : 'Publish Event?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {publishEvent?.isPublished ? (
                <>
                  Event <strong>{publishEvent?.title}</strong> akan di-unpublish. Tamu tidak bisa lagi melihat atau membeli tiket event ini. Tiket yang sudah terlanjur dibeli tetap valid.
                </>
              ) : (
                <>
                  Event <strong>{publishEvent?.title}</strong> akan dipublish dan dapat dilihat serta dibeli tiketnya oleh tamu. Pastikan semua data event sudah benar sebelum publish.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTogglingPublish}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTogglePublish}
              disabled={isTogglingPublish}
              className={publishEvent?.isPublished ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}
            >
              {isTogglingPublish ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{'Memproses...'}</>
              ) : publishEvent?.isPublished ? (
                <><EyeOff className="w-4 h-4 mr-2" />Ya, Unpublish</>
              ) : (
                <><Eye className="w-4 h-4 mr-2" />Ya, Publish</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
