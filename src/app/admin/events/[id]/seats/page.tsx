'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Loader2, Save, Check, X, Lock, Crown, RotateCcw, Trash2, RefreshCw, CalendarDays,
  ImagePlus, Pencil, Plus, Trash2 as TrashIcon, Upload, Zap, Users
} from 'lucide-react'
import { StageRenderer, ObjectsOverlay } from '@/lib/stage-renderer'
import { parseLayoutData, type ParsedLayout } from '@/lib/seat-layout'
import { CanvasSeatLayout } from '@/components/canvas-seat-layout'

const CATEGORY_CONFIG: Record<string, { icon: typeof Crown; label: string; defaultColor: string }> = {
  VIP: { icon: Crown, label: 'VIP', defaultColor: '#C8A951' },
  Regular: { icon: Lock, label: 'Regular', defaultColor: '#8B8680' },
  Student: { icon: Crown, label: 'Student', defaultColor: '#7BA7A5' },
}

const SEAT_W = 28
const SEAT_GAP = 3
const LABEL_W = 24 // w-6 = 24px row label area

interface SeatData {
  id: string
  seatCode: string
  status: string
  row: string
  col: number
  priceCategoryId: string | null
  priceCategory: { id: string; name: string; price: number; colorCode: string } | null
  eventShowDateId?: string | null
}

interface PriceCategoryData {
  id: string
  name: string
  price: number
  colorCode: string
}

interface ShowDateData {
  id: string
  date: string
  openGate: string | null
  label: string | null
}

interface EventInfo {
  id: string
  title: string
  seatMapId: string | null
  seatType?: string
  showDates?: ShowDateData[]
  layoutImage?: string | null
  gaZoneConfig?: string | null
}

interface GaZoneDef {
  name: string
  capacity: number
  price: number
  color: string
  priceCategoryName: string
}

// ─── GA Zone Management Panel (always shown for GA events) ──
function GaZoneManagementPanel({
  eventId,
  eventInfo,
  gaZonesDef,
  setGaZonesDef,
  layoutImage,
  layoutImagePreview,
  setLayoutImage,
  setLayoutImagePreview,
  isUploading,
  setIsUploading,
  isSavingZones,
  setIsSavingZones,
  isGeneratingFromZones,
  setIsGeneratingFromZones,
  newZone,
  setNewZone,
  priceCategories,
  fileInputRef,
  existingZoneSummary,
  existingSeatsCount,
}: {
  eventId: string
  eventInfo: EventInfo | null
  gaZonesDef: GaZoneDef[]
  setGaZonesDef: React.Dispatch<React.SetStateAction<GaZoneDef[]>>
  layoutImage: string | null
  layoutImagePreview: string | null
  setLayoutImage: React.Dispatch<React.SetStateAction<string | null>>
  setLayoutImagePreview: React.Dispatch<React.SetStateAction<string | null>>
  isUploading: boolean
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>
  isSavingZones: boolean
  setIsSavingZones: React.Dispatch<React.SetStateAction<boolean>>
  isGeneratingFromZones: boolean
  setIsGeneratingFromZones: React.Dispatch<React.SetStateAction<boolean>>
  newZone: GaZoneDef
  setNewZone: React.Dispatch<React.SetStateAction<GaZoneDef>>
  priceCategories: PriceCategoryData[]
  fileInputRef: React.RefObject<HTMLInputElement | null>
  existingZoneSummary?: Record<string, { total: number; available: number; sold: number; locked: number }>
  existingSeatsCount?: number
}) {
  const hasExistingSeats = (existingSeatsCount ?? 0) > 0

  // ─── Image upload handler ───────────────────────────────────────────
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran file maksimal 5MB')
      return
    }

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string
      setLayoutImagePreview(base64)

      setIsUploading(true)
      try {
        const res = await fetch(`/api/admin/events/${eventId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ layoutImage: base64 }),
        })
        if (res.ok) {
          setLayoutImage(base64)
        } else {
          alert('Gagal mengupload gambar')
          setLayoutImagePreview(layoutImage)
        }
      } catch {
        alert('Gagal mengupload gambar')
        setLayoutImagePreview(layoutImage)
      } finally {
        setIsUploading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleRemoveImage() {
    setIsUploading(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutImage: null }),
      })
      if (res.ok) {
        setLayoutImage(null)
        setLayoutImagePreview(null)
      } else {
        alert('Gagal menghapus gambar')
      }
    } catch {
      alert('Gagal menghapus gambar')
    } finally {
      setIsUploading(false)
    }
  }

  // ─── Zone management handlers ───────────────────────────────────────
  function handleAddZone() {
    if (!newZone.name.trim()) {
      alert('Nama zona wajib diisi')
      return
    }
    if (newZone.capacity <= 0) {
      alert('Kapasitas harus lebih dari 0')
      return
    }
    if (gaZonesDef.some(z => z.name.toLowerCase() === newZone.name.trim().toLowerCase())) {
      alert('Nama zona sudah digunakan')
      return
    }
    setGaZonesDef([...gaZonesDef, { ...newZone, name: newZone.name.trim() }])
    setNewZone({ name: '', capacity: 100, price: 0, color: '#22c55e', priceCategoryName: '' })
  }

  function handleRemoveZone(index: number) {
    setGaZonesDef(gaZonesDef.filter((_, i) => i !== index))
  }

  async function handleSaveZones() {
    setIsSavingZones(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gaZoneConfig: JSON.stringify(gaZonesDef) }),
      })
      if (res.ok) {
        alert('Zona berhasil disimpan!')
      } else {
        alert('Gagal menyimpan zona')
      }
    } catch {
      alert('Gagal menyimpan zona')
    } finally {
      setIsSavingZones(false)
    }
  }

  async function handleGenerateSeats() {
    if (gaZonesDef.length === 0) {
      alert('Tambahkan minimal 1 zona terlebih dahulu')
      return
    }
    const totalCapacity = gaZonesDef.reduce((sum, z) => sum + z.capacity, 0)

    let confirmMsg = `Generate ${totalCapacity} kursi dari ${gaZonesDef.length} zona?\n\nZona:\n${gaZonesDef.map(z => `• ${z.name}: ${z.capacity} kursi`).join('\n')}`

    // Warn if seats already exist
    if (hasExistingSeats) {
      confirmMsg = `⚠️ PERHATIAN!\nEvent ini sudah punya ${existingSeatsCount} kursi.\n\nKursi lama akan DIHAPUS dan diganti dengan yang baru.\n\n${confirmMsg}\n\nYAKIN ingin melanjutkan?`
    }

    const confirmed = confirm(confirmMsg)
    if (!confirmed) return

    // Save zones first, then generate
    setIsSavingZones(true)
    try {
      const saveRes = await fetch(`/api/admin/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gaZoneConfig: JSON.stringify(gaZonesDef) }),
      })
      if (!saveRes.ok) {
        alert('Gagal menyimpan zona')
        return
      }
    } catch {
      alert('Gagal menyimpan zona')
      return
    } finally {
      setIsSavingZones(false)
    }

    setIsGeneratingFromZones(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/generate-seats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useGaZoneConfig: true }),
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.message)
        // Reload to show generated seats
        window.location.reload()
      } else {
        const data = await res.json()
        alert(data.error || 'Gagal generate kursi')
      }
    } catch {
      alert('Gagal generate kursi')
    } finally {
      setIsGeneratingFromZones(false)
    }
  }

  const totalCapacity = gaZonesDef.reduce((sum, z) => sum + z.capacity, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl font-bold text-charcoal">GA Zone Setup</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {eventInfo?.title && <span className="font-medium">{eventInfo.title}</span>}
          {' — Konfigurasi zona General Admission'}
        </p>
      </div>

      {/* 1. Layout Image Upload */}
      <Card className="border-gold/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <ImagePlus className="w-4 h-4 text-gold" />
            <h2 className="font-serif text-lg font-semibold text-charcoal">Layout Image</h2>
            <span className="text-xs text-muted-foreground">(Opsional)</span>
          </div>

          {(layoutImagePreview || layoutImage) ? (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden border border-border/50 bg-gray-50">
                <img
                  src={layoutImagePreview || layoutImage || ''}
                  alt="Layout"
                  className="max-h-64 w-full object-contain"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Ganti Gambar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveImage}
                  disabled={isUploading}
                  className="text-red-500 border-red-200 hover:bg-red-50"
                >
                  <TrashIcon className="w-3.5 h-3.5 mr-1.5" />
                  Hapus Gambar
                </Button>
                {isUploading && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border/60 rounded-lg p-8 text-center cursor-pointer hover:border-gold/40 hover:bg-gold/5 transition-all"
            >
              <Upload className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Klik untuk upload gambar layout venue
              </p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                PNG, JPG, SVG — Maks. 5MB
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
        </CardContent>
      </Card>

      {/* 2. Manual Zone Definition */}
      <Card className="border-gold/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-gold" />
              <h2 className="font-serif text-lg font-semibold text-charcoal">Definisi Zona</h2>
            </div>
            <Button
              size="sm"
              onClick={handleSaveZones}
              disabled={isSavingZones || gaZonesDef.length === 0}
              className="bg-gold hover:bg-gold/90 text-charcoal font-semibold text-xs"
            >
              {isSavingZones ? (
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-3 h-3 mr-1.5" />
              )}
              Simpan Zona
            </Button>
          </div>

          {/* Existing zones */}
          {gaZonesDef.length > 0 && (
            <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
              {gaZonesDef.map((zone, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-white"
                >
                  <div
                    className="w-4 h-4 rounded-sm shrink-0"
                    style={{ backgroundColor: zone.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm text-charcoal">{zone.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {zone.capacity} kursi
                    </span>
                    {zone.priceCategoryName && (
                      <Badge variant="secondary" className="text-[10px] ml-2">
                        {zone.priceCategoryName}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs font-medium text-charcoal">
                    Rp {zone.price.toLocaleString('id-ID')}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveZone(idx)}
                    className="text-red-400 hover:text-red-600 h-7 w-7 p-0"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              <div className="text-xs text-muted-foreground pt-1">
                Total Kapasitas: <span className="font-semibold text-charcoal">{totalCapacity.toLocaleString('id-ID')}</span> kursi
              </div>
            </div>
          )}

          {/* Add new zone form */}
          <div className="border border-dashed border-border/60 rounded-lg p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Tambah Zona Baru</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nama Zona</label>
                <input
                  type="text"
                  value={newZone.name}
                  onChange={(e) => setNewZone({ ...newZone, name: e.target.value })}
                  placeholder="cth: VIP, Festival A"
                  className="w-full h-8 px-3 text-sm rounded-md border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Kapasitas</label>
                <input
                  type="number"
                  value={newZone.capacity}
                  onChange={(e) => setNewZone({ ...newZone, capacity: parseInt(e.target.value) || 0 })}
                  placeholder="100"
                  className="w-full h-8 px-3 text-sm rounded-md border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Harga (Rp)</label>
                <input
                  type="number"
                  value={newZone.price}
                  onChange={(e) => setNewZone({ ...newZone, price: parseInt(e.target.value) || 0 })}
                  placeholder="85000"
                  className="w-full h-8 px-3 text-sm rounded-md border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Warna</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newZone.color}
                    onChange={(e) => setNewZone({ ...newZone, color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-border"
                  />
                  <span className="text-xs text-muted-foreground">{newZone.color}</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Kategori Harga</label>
                <Select
                  value={newZone.priceCategoryName}
                  onValueChange={(val) => setNewZone({ ...newZone, priceCategoryName: val })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Pilih kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {priceCategories.map((pc) => (
                      <SelectItem key={pc.id} value={pc.name}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: pc.colorCode }} />
                          {pc.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddZone}
                  className="w-full"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Tambah Zona
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Existing Seats Summary (shown when seats already generated) */}
      {hasExistingSeats && existingZoneSummary && (
        <Card className="border-gold/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-gold" />
              <h2 className="font-serif text-lg font-semibold text-charcoal">Status Kursi Saat Ini</h2>
              <Badge variant="secondary" className="text-xs bg-emerald-50 text-emerald-700">
                {existingSeatsCount?.toLocaleString('id-ID')} kursi
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(existingZoneSummary).map(([zoneName, stats]) => (
                <div key={zoneName} className="rounded-lg border border-border/50 p-3 bg-white">
                  <p className="text-sm font-semibold text-charcoal">{zoneName}</p>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div>
                      <p className="text-lg font-bold text-emerald-600">{stats.available}</p>
                      <p className="text-[10px] text-muted-foreground">Tersedia</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-red-500">{stats.sold}</p>
                      <p className="text-[10px] text-muted-foreground">Terjual</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-amber-500">{stats.locked}</p>
                      <p className="text-[10px] text-muted-foreground">Dikunci</p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${stats.total > 0 ? (stats.available / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {stats.total > 0 ? Math.round((stats.available / stats.total) * 100) : 0}% tersisa
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. Generate / Regenerate Seats */}
      <Card className={cn("border-gold/20", hasExistingSeats ? "bg-amber-50/50 border-amber-200" : "bg-gold/5")}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-gold" />
                <h2 className="font-serif text-lg font-semibold text-charcoal">
                  {hasExistingSeats ? 'Regenerate Kursi' : 'Generate Kursi'}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {gaZonesDef.length > 0 ? (
                  <>
                    <span className="font-medium text-charcoal">{totalCapacity.toLocaleString('id-ID')}</span> kursi dari{' '}
                    <span className="font-medium text-charcoal">{gaZonesDef.length}</span> zona akan di-generate.
                    {hasExistingSeats && (
                      <span className="text-amber-600 font-medium"> (kursi lama akan dihapus)</span>
                    )}
                  </>
                ) : (
                  'Tambahkan minimal 1 zona untuk generate kursi.'
                )}
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleGenerateSeats}
              disabled={isGeneratingFromZones || gaZonesDef.length === 0}
              className={cn(
                "font-semibold",
                hasExistingSeats
                  ? "bg-amber-500 hover:bg-amber-600 text-white"
                  : "bg-gold hover:bg-gold/90 text-charcoal"
              )}
            >
              {isGeneratingFromZones ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : hasExistingSeats ? (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Regenerate
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Generate Kursi
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Back link */}
      <div className="text-center pt-4">
        <a href="/admin/events" className="text-gold underline text-sm inline-block">
          ← Kembali ke Events
        </a>
      </div>
    </div>
  )
}

export default function SeatEditorPage() {
  const params = useParams()
  const eventId = params.id as string

  const [allSeats, setAllSeats] = useState<SeatData[]>([])
  const [priceCategories, setPriceCategories] = useState<PriceCategoryData[]>([])
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [layoutData, setLayoutData] = useState<any>(null)
  const [selectedSeatCodes, setSelectedSeatCodes] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [showDates, setShowDates] = useState<ShowDateData[]>([])
  const [selectedShowDateIdx, setSelectedShowDateIdx] = useState(-1) // -1 = all days
  const [isSaving, setIsSaving] = useState(false)
  const [isDeletingSeats, setIsDeletingSeats] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // ─── GA Zone Config state ──────────────────────────────────────────
  const [gaZonesDef, setGaZonesDef] = useState<GaZoneDef[]>([])
  const [layoutImage, setLayoutImage] = useState<string | null>(null)
  const [layoutImagePreview, setLayoutImagePreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isSavingZones, setIsSavingZones] = useState(false)
  const [isGeneratingFromZones, setIsGeneratingFromZones] = useState(false)
  const [newZone, setNewZone] = useState<GaZoneDef>({ name: '', capacity: 100, price: 0, color: '#22c55e', priceCategoryName: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isDraggingRef = useRef(false)
  const dragModeRef = useRef<'select' | 'deselect'>('select')

  // Active show date
  const activeShowDate = selectedShowDateIdx >= 0 && showDates[selectedShowDateIdx]
    ? showDates[selectedShowDateIdx]
    : null

  // Group seats by showDateId for "Semua Hari" divider view
  const seatsByDate = useMemo(() => {
    if (activeShowDate) return null // Single day mode — no grouping needed
    if (showDates.length <= 1) return null // Only 1 day — no divider needed
    const groups = new Map<string | null, SeatData[]>()
    for (const s of allSeats) {
      const key = s.eventShowDateId || null
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(s)
    }
    return groups
  }, [allSeats, activeShowDate, showDates.length])

  // Filter seats based on selected day — ONLY match explicit showDateId, no orphan fallback
  const seats = useMemo(() => {
    if (!activeShowDate) return allSeats
    return allSeats.filter(s => s.eventShowDateId === activeShowDate.id)
  }, [allSeats, activeShowDate])

  useEffect(() => {
    async function fetchData() {
      try {
        const [seatsRes, eventRes] = await Promise.all([
          fetch(`/api/events/${eventId}/seats`),
          fetch(`/api/admin/events/${eventId}`),
        ])

        if (seatsRes.ok) {
          const data = await seatsRes.json()
          setAllSeats(data.seats || [])
          setPriceCategories(data.priceCategories || [])
        }

        if (eventRes.ok) {
          const data = await eventRes.json()
          const ev = data.event || null
          setEventInfo(ev)
          // Populate show dates
          if (ev?.showDates && ev.showDates.length > 1) {
            setShowDates(ev.showDates)
            setSelectedShowDateIdx(0)
          }
          // Load GA zone config and layout image
          if (ev?.gaZoneConfig) {
            try {
              setGaZonesDef(JSON.parse(ev.gaZoneConfig))
            } catch { /* ignore */ }
          }
          if (ev?.layoutImage) {
            setLayoutImage(ev.layoutImage)
            setLayoutImagePreview(ev.layoutImage)
          }
          // Fetch layoutData from the seat map
          if (ev?.seatMapId) {
            try {
              const mapRes = await fetch(`/api/admin/seat-maps/${ev.seatMapId}`)
              if (mapRes.ok) {
                const mapData = await mapRes.json()
                if (mapData.seatMap?.layoutData) {
                  setLayoutData(mapData.seatMap.layoutData)
                }
              }
            } catch { /* ignore */ }
          }
        }
      } catch (err) {
        console.error('Failed to fetch seats:', err)
      } finally {
        setIsLoading(false)
      }
    }

    if (eventId) fetchData()
  }, [eventId])

  // Re-fetch seats when active show date changes
  useEffect(() => {
    if (!eventId) return
    const url = activeShowDate
      ? `/api/events/${eventId}/seats?showDateId=${activeShowDate.id}`
      : `/api/events/${eventId}/seats`
    let cancelled = false
    fetch(url)
      .then(res => res.ok ? res.json() : { seats: [], priceCategories: [] })
      .then(data => {
        if (cancelled) return
        setAllSeats(data.seats || [])
        if (data.priceCategories) setPriceCategories(data.priceCategories)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeShowDate?.id, eventId])

  // ─── Parse layoutData for flat grid rendering (1:1 with seat map editor) ──
  const parsedLayout = useMemo(() => parseLayoutData(layoutData) as ParsedLayout | null, [layoutData])

  // Component-level canvas mode flag (shared across renderFlatGridInner and JSX)
  const isCanvasMode = !!(parsedLayout?.canvasSeats && parsedLayout.canvasSeats.length > 0)

  // ─── Stage & Objects coordinate mapping (canvas → admin grid) ──
  const stageLayout = useMemo(() => {
    if (!parsedLayout) return null
    const { gridSize, displayRows, stagePosition, canvasSeatBounds: csb, cols } = parsedLayout
    const CELL_TOTAL = SEAT_W + SEAT_GAP
    const guestGridW = cols * CELL_TOTAL
    const guestGridH = displayRows.length * CELL_TOTAL
    const hasBounds = !!csb && cols > 0 && displayRows.length > 0
    const hasCustomStagePos = stagePosition && typeof stagePosition.x === 'number'
    const stageType = parsedLayout.stageType || 'PROSCENIUM'
    const isInsetStage = stageType === 'BLACK_BOX' || stageType === 'ARENA'
    const stageSize = isInsetStage ? 'md' : 'lg'

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

    // Calculate paddingTop for elements above the seat grid
    let stageGuest = hasCustomStagePos && hasBounds
      ? toGuest(stagePosition.x, stagePosition.y, stagePosition.width, stagePosition.height)
      : null
    const allGuestYs: number[] = []
    if (stageGuest) allGuestYs.push(stageGuest.y)
    if (parsedLayout.objects) {
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

    return {
      stageType,
      isInsetStage,
      stageSize,
      hasCustomStagePos: !!hasCustomStagePos && hasBounds,
      stageGuest,
      paddingTop,
      canvasSeatBounds: csb,
      cols,
      displayRowsCount: displayRows.length,
    }
  }, [parsedLayout])

  // Build seat lookup by seatCode
  const seatLookup = useMemo(() => {
    const map = new Map<string, SeatData>()
    for (const seat of seats) {
      map.set(seat.seatCode, seat)
    }
    return map
  }, [seats])

  // ─── Build dynamic row layout (fallback for GA / no layoutData) ──────
  const rowLayout = useMemo(() => {
    if (seats.length === 0) return []
    if (parsedLayout) return [] // Use parsedLayout instead

    const rowMap = new Map<string, SeatData[]>()
    for (const seat of seats) {
      if (!rowMap.has(seat.row)) rowMap.set(seat.row, [])
      rowMap.get(seat.row)!.push(seat)
    }

    const rowEntries = [...rowMap.entries()].sort((a, b) => {
      if (a[0].length === 1 && b[0].length === 1) return a[0].localeCompare(b[0])
      return (a[1][0]?.col || 0) - (b[1][0]?.col || 0)
    })

    return rowEntries.map(([rowName, rowSeats]) => {
      const sorted = [...rowSeats].sort((a, b) => a.col - b.col)
      return { rowName, seats: sorted, totalSeats: sorted.length }
    })
  }, [seats, parsedLayout])

  // ─── Check if GA (General Admission) type ───────────────────────────
  const gaZones = parsedLayout?.isGA ? (parsedLayout.gaZones || []) : []
  const isGA = useMemo(() => {
    if (parsedLayout?.isGA && gaZones.length > 0) return true
    if (parsedLayout) return false
    if (seats.length === 0) return false
    const uniqueRows = new Set(seats.map(s => s.row))
    return uniqueRows.size <= 5 && seats.length / uniqueRows.size > 10
  }, [seats, parsedLayout, gaZones.length])

  // Clear selection when switching days
  useEffect(() => {
    setSelectedSeatCodes(new Set())
    setHasUnsavedChanges(false)
  }, [selectedShowDateIdx])

  // ─── Mouse handlers ─────────────────────────────────────────────────
  const handleMouseDown = useCallback((seat: SeatData) => {
    if (selectedSeatCodes.has(seat.seatCode)) {
      dragModeRef.current = 'deselect'
      setSelectedSeatCodes((prev) => {
        const next = new Set(prev)
        next.delete(seat.seatCode)
        return next
      })
    } else {
      dragModeRef.current = 'select'
      setSelectedSeatCodes((prev) => new Set(prev).add(seat.seatCode))
    }
    isDraggingRef.current = true
  }, [selectedSeatCodes])

  const handleMouseEnter = useCallback((seat: SeatData) => {
    if (!isDraggingRef.current) return

    if (dragModeRef.current === 'select') {
      setSelectedSeatCodes((prev) => new Set(prev).add(seat.seatCode))
    } else {
      setSelectedSeatCodes((prev) => {
        const next = new Set(prev)
        next.delete(seat.seatCode)
        return next
      })
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  const clearSelection = () => setSelectedSeatCodes(new Set())

  const selectAll = () => {
    setSelectedSeatCodes(new Set(seats.map((s) => s.seatCode)))
  }

  // ─── Seat operations (local state only — use Simpan button to persist) ─
  function assignPriceCategory(priceCategoryId: string) {
    if (selectedSeatCodes.size === 0) return
    setAllSeats((prev) =>
      prev.map((s) =>
        selectedSeatCodes.has(s.seatCode)
          ? { ...s, priceCategoryId, priceCategory: priceCategories.find((pc) => pc.id === priceCategoryId) || null }
          : s
      )
    )
    setHasUnsavedChanges(true)
    clearSelection()
  }

  function setSeatStatus(status: string) {
    if (selectedSeatCodes.size === 0) return
    setAllSeats((prev) =>
      prev.map((s) =>
        selectedSeatCodes.has(s.seatCode) ? { ...s, status } : s
      )
    )
    setHasUnsavedChanges(true)
    clearSelection()
  }

  // ─── Save all changes to server ───────────────────────────────────
  async function saveAllChanges() {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seats`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showDateId: activeShowDate?.id || undefined,
          seats: seats.map((s) => ({
            seatCode: s.seatCode,
            status: s.status,
            priceCategoryId: s.priceCategoryId,
          })),
        }),
      })
      if (res.ok) {
        setHasUnsavedChanges(false)
      } else {
        alert('Gagal menyimpan. Coba lagi.')
      }
    } catch (err) {
      console.error('Save error:', err)
      alert('Gagal menyimpan. Coba lagi.')
    } finally {
      setIsSaving(false)
    }
  }

  // ─── Delete & Regenerate ────────────────────────────────────────────
  async function handleDeleteAndRegenerate() {
    const confirmed = confirm(
      `Hapus semua ${seats.length} kursi?\n\nEvent akan kembali ke keadaan belum generate kursi. Kamu bisa generate ulang dari halaman Events.`
    )
    if (!confirmed) return

    setIsDeletingSeats(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seats`, { method: 'DELETE' })
      if (res.ok) {
        setAllSeats([])
        setSelectedSeatCodes(new Set())
      } else {
        const data = await res.json()
        alert(data.error || 'Gagal menghapus kursi')
      }
    } catch (err) {
      console.error('Delete error:', err)
    } finally {
      setIsDeletingSeats(false)
    }
  }

  // ─── Seat styling ───────────────────────────────────────────────────
  const getSeatStyle = (seat: SeatData) => {
    const isSelected = selectedSeatCodes.has(seat.seatCode)

    switch (seat.status) {
      case 'SOLD':
        return 'bg-seat-sold text-white'
      case 'LOCKED_TEMPORARY':
        return 'bg-seat-locked text-white'
      case 'INVITATION':
        return 'bg-seat-invitation text-white'
      case 'UNAVAILABLE':
        return 'bg-gray-300 opacity-40'
      default:
        if (isSelected) return 'bg-gold text-charcoal ring-2 ring-gold ring-offset-1'
        return 'bg-white border-2'
    }
  }

  const getSeatBorderColor = (seat: SeatData) => {
    if (seat.status !== 'AVAILABLE' || selectedSeatCodes.has(seat.seatCode)) return 'transparent'
    return seat.priceCategory?.colorCode || '#C8A951'
  }

  // ─── Build row layout from seat data (fallback when no parsedLayout) ──
  function buildRowLayout(seatList: SeatData[]) {
    if (seatList.length === 0) return []
    const rowMap = new Map<string, SeatData[]>()
    for (const seat of seatList) {
      if (!rowMap.has(seat.row)) rowMap.set(seat.row, [])
      rowMap.get(seat.row)!.push(seat)
    }
    const rowEntries = [...rowMap.entries()].sort((a, b) => {
      if (a[0].length === 1 && b[0].length === 1) return a[0].localeCompare(b[0])
      return (a[1][0]?.col || 0) - (b[1][0]?.col || 0)
    })
    return rowEntries.map(([rowName, rowSeats]) => {
      const sorted = [...rowSeats].sort((a, b) => a.col - b.col)
      return { rowName, seats: sorted, totalSeats: sorted.length }
    })
  }

  // ─── Render flat grid from layoutData (reusable for multi-day divider) ─
  function renderFlatGridInner(lookup: Map<string, SeatData>) {
    if (!parsedLayout) return null
    const { gridSize, rowLabels: lLabels, rowSeatMap, embeddedRows, displayRows, sections, canvasSeats, fullCanvasBounds } = parsedLayout
    const { cols } = gridSize
    const aisleColumns = parsedLayout.aisleColumns || []

    // Check if we should use canvas-based rendering
    const useCanvasMode = !!canvasSeats && canvasSeats.length > 0

    // ─── Canvas Mode: preserve empty space like guest view ─────────────
    if (useCanvasMode) {
      return (
        <CanvasSeatLayout
          parsedLayout={parsedLayout}
          seatLookup={lookup as Map<string, any>}
          renderSeat={(seatData, canvasSeat, scaledX, scaledY, size, key) => {
            const isSelected = selectedSeatCodes.has(seatData.seatCode)
            const num = canvasSeat.seatNum
            return (
              <button
                key={key}
                onMouseDown={(e) => { if (e.button === 0) handleMouseDown(seatData) }}
                onMouseEnter={() => handleMouseEnter(seatData)}
                className={cn(
                  'absolute rounded-md flex items-center justify-center text-[9px] sm:text-[10px] font-medium transition-all duration-100 select-none cursor-pointer',
                  seatData.status === 'SOLD' && 'bg-seat-sold text-white',
                  seatData.status === 'LOCKED_TEMPORARY' && 'bg-seat-locked text-white',
                  seatData.status === 'INVITATION' && 'bg-seat-invitation text-white',
                  seatData.status === 'UNAVAILABLE' && 'bg-gray-300 opacity-40',
                  isSelected && 'bg-gold text-charcoal ring-2 ring-gold ring-offset-1',
                  !isSelected && seatData.status === 'AVAILABLE' && 'bg-white border-2',
                )}
                style={{
                  left: scaledX,
                  top: scaledY,
                  width: size,
                  height: size,
                  ...(seatData.status === 'AVAILABLE' && !isSelected
                    ? { borderColor: getSeatBorderColor(seatData) }
                    : {}),
                }}
                title={`${canvasSeat.seatCode} | ${seatData.priceCategory?.name || '-'} | ${seatData.status}`}
              >
                {seatData.status === 'SOLD' && <Check className="w-3 h-3" />}
                {seatData.status === 'LOCKED_TEMPORARY' && <Lock className="w-3 h-3" />}
                {seatData.status === 'UNAVAILABLE' && <X className="w-3 h-3" />}
                {seatData.status === 'INVITATION' && <Crown className="w-3 h-3" />}
                {(seatData.status === 'AVAILABLE' || isSelected) && num}
              </button>
            )
          }}
          renderEmpty={(x, y, size, key) => (
            <div
              key={key}
              className="absolute"
              style={{ left: x, top: y, width: size, height: size }}
            />
          )}
        />
      )
    }

    // Build reverse map: target row → source rows
    const embeddedInto: Record<number, number[]> = {}
    for (const [srcStr, tgt] of Object.entries(embeddedRows)) {
      const src = parseInt(srcStr)
      if (!embeddedInto[tgt]) embeddedInto[tgt] = []
      embeddedInto[tgt].push(src)
    }

    // Build grid lookup: displayRow → col → { seatCode, seatNum }
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
    const middleRowIndex = stageLayout?.isInsetStage && !stageLayout?.hasCustomStagePos
      ? Math.floor(displayRows.length / 2) : -1

    const getRowColor = (rowIdx: number) => {
      const section = sections.find(s => rowIdx >= s.fromRow && rowIdx <= s.toRow)
      if (section) return CATEGORY_CONFIG[section.name]?.defaultColor || section.colorCode
      return '#8B8680'
    }

    return (
      <>
        {displayRows.map((ri, idx) => {
          const label = lLabels[ri] || String.fromCharCode(65 + ri)
          const colMap = gridLookup.get(ri) || new Map()
          const rowColor = getRowColor(ri)

          return (
            <React.Fragment key={ri}>
              {/* Inset stage (BLACK_BOX / ARENA) in middle of rows — only if no custom position */}
              {stageLayout?.isInsetStage && !stageLayout?.hasCustomStagePos && idx === middleRowIndex && (
                <div className="flex justify-center my-2">
                  <StageRenderer
                    stageType={stageLayout.stageType}
                    size={stageLayout.stageSize}
                    thrustWidth={parsedLayout.thrustWidth}
                    thrustDepth={parsedLayout.thrustDepth}
                  />
                </div>
              )}
              <div
                className="flex items-center mb-[3px]"
                style={{ height: SEAT_W }}
              >
                <div className="w-6 text-center text-xs font-semibold font-serif shrink-0" style={{ color: rowColor }}>
                  {label}
                </div>
                <div className="flex items-center" style={{ gap: SEAT_GAP, height: SEAT_W }}>
                  {Array.from({ length: cols }, (_, ci) => {
                    const c = ci
                    if (aisleColumns.includes(c)) {
                      return (
                        <div key={c} className="shrink-0 bg-border/30 rounded-full mx-0.5" style={{ width: 2, height: SEAT_W * 0.6 }} />
                      )
                    }
                    const seatInfo = colMap.get(c)
                    if (seatInfo) {
                      const seatData = lookup.get(seatInfo.seatCode)
                      return renderSeatButton(seatData, seatInfo.seatCode, seatInfo.seatNum)
                    }
                    return <div key={c} style={{ width: SEAT_W, height: SEAT_W }} className="shrink-0" />
                  })}
                </div>
                <div className="w-6 text-center text-xs font-semibold font-serif shrink-0" style={{ color: rowColor }}>
                  {label}
                </div>
              </div>
            </React.Fragment>
          )
        })}
      </>
    )
  }

  // ─── Render seat button ─────────────────────────────────────────────
  const renderSeatButton = (seat: SeatData | undefined, seatCode?: string, displayNum?: number) => {
    if (!seat) {
      // Empty placeholder — position in layoutData but no seat generated
      return (
        <div
          key={seatCode || 'empty'}
          style={{ width: SEAT_W, height: SEAT_W }}
          className="shrink-0 rounded-md bg-gray-100/50 border border-dashed border-gray-200/60 flex items-center justify-center text-[8px] text-gray-300"
        >
          {displayNum}
        </div>
      )
    }
    const num = displayNum ?? seat.col
    const seatCodeFinal = seatCode || seat.seatCode
    return (
      <button
        key={seat.id}
        onMouseDown={(e) => { if (e.button === 0) handleMouseDown(seat) }}
        onMouseEnter={() => handleMouseEnter(seat)}
        className={cn(
          'shrink-0 rounded-md flex items-center justify-center text-[9px] sm:text-[10px] font-medium transition-all duration-100 select-none cursor-pointer',
          getSeatStyle(seat)
        )}
        style={{
          width: SEAT_W,
          height: SEAT_W,
          ...(seat.status === 'AVAILABLE' && !selectedSeatCodes.has(seat.seatCode)
            ? { borderColor: getSeatBorderColor(seat) }
            : {}),
        }}
        title={`${seat.seatCode} | ${seat.priceCategory?.name || '-'} | ${seat.status}`}
      >
        {seat.status === 'SOLD' && <Check className="w-3 h-3" />}
        {seat.status === 'LOCKED_TEMPORARY' && <Lock className="w-3 h-3" />}
        {seat.status === 'UNAVAILABLE' && <X className="w-3 h-3" />}
        {seat.status === 'INVITATION' && <Crown className="w-3 h-3" />}
        {(seat.status === 'AVAILABLE' || selectedSeatCodes.has(seat.seatCode)) && num}
      </button>
    )
  }

  // ─── Loading & Empty states ─────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-gold animate-spin" />
      </div>
    )
  }

  // ─── Determine if this event is GA type ──
  // GA if: event has seatType GENERAL_ADMISSION, OR has manual zone config
  // PIANO_ROLL must NOT be treated as GA — it has its own panel flow.
  const isEventGA = eventInfo?.seatType === 'GENERAL_ADMISSION' || !!eventInfo?.gaZoneConfig

  // ─── For GA events: ALWAYS show the GA Zone Management Panel ────────
  // regardless of whether seats already exist or not.
  if (isEventGA) {
    // Build zone summary from existing seats (grouped by zoneName)
    const zoneSummary = new Map<string, { total: number; available: number; sold: number; locked: number }>()
    for (const s of allSeats) {
      const zone = s.zoneName || 'Tanpa Zona'
      if (!zoneSummary.has(zone)) zoneSummary.set(zone, { total: 0, available: 0, sold: 0, locked: 0 })
      const z = zoneSummary.get(zone)!
      z.total++
      if (s.status === 'AVAILABLE') z.available++
      else if (s.status === 'SOLD') z.sold++
      else if (s.status === 'LOCKED_TEMPORARY') z.locked++
    }

    return <GaZoneManagementPanel
      eventId={eventId}
      eventInfo={eventInfo}
      gaZonesDef={gaZonesDef}
      setGaZonesDef={setGaZonesDef}
      layoutImage={layoutImage}
      layoutImagePreview={layoutImagePreview}
      setLayoutImage={setLayoutImage}
      setLayoutImagePreview={setLayoutImagePreview}
      isUploading={isUploading}
      setIsUploading={setIsUploading}
      isSavingZones={isSavingZones}
      setIsSavingZones={setIsSavingZones}
      isGeneratingFromZones={isGeneratingFromZones}
      setIsGeneratingFromZones={setIsGeneratingFromZones}
      newZone={newZone}
      setNewZone={setNewZone}
      priceCategories={priceCategories}
      fileInputRef={fileInputRef}
      existingZoneSummary={Object.fromEntries(zoneSummary)}
      existingSeatsCount={allSeats.length}
    />
  }

  // ─── Non-GA events: show "no seats" message if empty ───────────────
  if (allSeats.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Belum ada kursi untuk event ini.</p>
        <p className="text-xs text-muted-foreground/50 mt-1">Generate kursi dari halaman Events terlebih dahulu.</p>
        <a href="/admin/events" className="text-gold underline text-sm mt-4 inline-block">
          ← Kembali ke Events
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header - Sticky */}
      <div className="flex items-center justify-between sticky top-0 z-10 bg-[#F8F6F3] py-2 -mt-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-charcoal">Seat Map Editor</h1>
          {isEventGA && eventInfo?.layoutImage && (
            <div className="mt-3 rounded-lg overflow-hidden border border-border/50 inline-block">
              <img src={eventInfo.layoutImage} alt="Layout" className="max-h-40 object-contain" />
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            {eventInfo?.title && <span className="font-medium">{eventInfo.title}</span>}
            {' — '}
            {seats.length} kursi
            {allSeats.length !== seats.length && <span className="text-muted-foreground/60"> (dari {allSeats.length} total)</span>}
            {selectedSeatCodes.size > 0
              ? ` — ${selectedSeatCodes.size} dipilih`
              : ' — Klik dan drag untuk memilih'}
          </p>
          {/* Multi-day tabs */}
          {showDates.length > 1 && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => setSelectedShowDateIdx(-1)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  selectedShowDateIdx === -1
                    ? 'bg-gold text-charcoal'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                Semua Hari
              </button>
              {showDates.map((sd, idx) => (
                <button
                  key={sd.id || idx}
                  onClick={() => setSelectedShowDateIdx(idx)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                    idx === selectedShowDateIdx
                      ? 'bg-gold text-charcoal'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {sd.label || `Hari ${idx + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-600 font-medium hidden sm:inline">● Ada perubahan belum disimpan</span>
          )}
          <Button
            size="sm"
            onClick={saveAllChanges}
            disabled={isSaving || !hasUnsavedChanges}
            className={cn(
              "text-sm",
              hasUnsavedChanges
                ? "bg-gold hover:bg-gold/90 text-charcoal font-semibold"
                : "bg-muted text-muted-foreground"
            )}
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Simpan
          </Button>
          <Button variant="outline" size="sm" onClick={selectAll}>
            <Check className="w-3 h-3 mr-1" />
            Pilih Semua
          </Button>
          <Button variant="outline" size="sm" onClick={clearSelection} disabled={selectedSeatCodes.size === 0}>
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      {selectedSeatCodes.size > 0 && (
        <Card className="border-gold/20 animate-fade-in">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-charcoal">
                Assign ke:
              </span>
              <Select onValueChange={assignPriceCategory}>
                <SelectTrigger className="w-40 h-8 text-sm">
                  <SelectValue placeholder="Kategori Harga" />
                </SelectTrigger>
                <SelectContent>
                  {priceCategories.map((pc) => (
                    <SelectItem key={pc.id} value={pc.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: pc.colorCode }} />
                        {pc.name} (Rp {pc.price.toLocaleString('id-ID')})
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Separator orientation="vertical" className="h-6" />

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSeatStatus('INVITATION')}
                className="text-xs"
              >
                <Crown className="w-3 h-3 mr-1" />
                Undangan
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSeatStatus('UNAVAILABLE')}
                className="text-xs"
              >
                <X className="w-3 h-3 mr-1" />
                Tidak Tersedia
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSeatStatus('AVAILABLE')}
                className="text-xs"
              >
                Tersedia
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Seat Grid — Dynamic Layout from actual data */}
      <div className="bg-white rounded-xl p-6 border border-border/50">
        <div className="max-w-4xl mx-auto">
          {/* Stage — only for grid mode (canvas mode renders its own stage inside CanvasSeatLayout) */}
          {!isCanvasMode && stageLayout && !stageLayout.hasCustomStagePos && !stageLayout.isInsetStage && (
            <StageRenderer
              stageType={stageLayout.stageType}
              size={stageLayout.stageSize}
              thrustWidth={parsedLayout?.thrustWidth}
              thrustDepth={parsedLayout?.thrustDepth}
            />
          )}

          {/* ─── Multi-Day Divider View (Semua Hari) ───*/}
          {seatsByDate && showDates.length > 1 && !activeShowDate ? (
            <div className="space-y-8 mt-4">
              {showDates.map((sd, dayIdx) => {
                const daySeats = allSeats.filter(s => s.eventShowDateId === sd.id || (!s.eventShowDateId && dayIdx === 0))
                const dayLookup = new Map<string, SeatData>()
                for (const s of daySeats) dayLookup.set(s.seatCode, s)
                const dayAvailable = daySeats.filter(s => s.status === 'AVAILABLE').length
                const daySold = daySeats.filter(s => s.status === 'SOLD').length

                return (
                  <div key={sd.id || dayIdx}>
                    {/* Day divider header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
                      <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-charcoal text-gold">
                        <CalendarDays className="w-3.5 h-3.5" />
                        <span className="text-xs font-semibold">{sd.label || `Hari ${dayIdx + 1}`}</span>
                        <Separator orientation="vertical" className="h-3 bg-gold/30" />
                        <span className="text-[10px] text-gold/70">{daySeats.length} kursi</span>
                        <span className="text-[10px] text-gold/50">•</span>
                        <span className="text-[10px] text-emerald-400">{dayAvailable} tersedia</span>
                        <span className="text-[10px] text-gold/50">•</span>
                        <span className="text-[10px] text-red-400">{daySold} terjual</span>
                      </div>
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
                    </div>

                    {/* Day grid */}
                    <div className="overflow-x-auto pb-2">
                      <div className="min-w-[320px]">
                        {parsedLayout ? (
                          <div className={cn(
                            isCanvasMode
                              ? 'overflow-x-auto flex justify-center'
                              : 'relative mx-auto w-fit flex flex-col items-center',
                          )} style={!isCanvasMode ? { minWidth: (() => {
                            const CELL_TOTAL = SEAT_W + SEAT_GAP
                            const ec = parsedLayout.gridSize.cols
                            return ec * CELL_TOTAL - SEAT_GAP + 60
                          })() } : undefined}>
                            {!isCanvasMode && stageLayout && stageLayout.hasCustomStagePos && stageLayout.stageGuest && (
                              <div
                                className="absolute pointer-events-none"
                                style={{
                                  left: stageLayout.stageGuest.x,
                                  top: stageLayout.stageGuest.y,
                                  width: stageLayout.stageGuest.w,
                                  height: stageLayout.stageGuest.h,
                                  zIndex: 10,
                                }}
                              >
                                <StageRenderer
                                  stageType={stageLayout.stageType}
                                  size={stageLayout.stageSize}
                                  thrustWidth={parsedLayout?.thrustWidth}
                                  thrustDepth={parsedLayout?.thrustDepth}
                                  fillParent
                                />
                              </div>
                            )}
                            {renderFlatGridInner(dayLookup)}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {(() => {
                              const dayRowLayout = buildRowLayout(daySeats)
                              return dayRowLayout.map((row) => (
                                <div key={row.rowName} className="flex items-center gap-1 mb-1">
                                  <div className="w-6 text-center text-xs font-semibold font-serif text-muted-foreground shrink-0">
                                    {row.rowName}
                                  </div>
                                  <div className="flex gap-1">
                                    {row.seats.map((seat: SeatData, i: number) => renderSeatButton(seat, undefined, i + 1))}
                                  </div>
                                </div>
                              ))
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
          <>
          {/* ─── Single Day / Normal Grid ─── */}

          {/* Grid */}
          <div className="overflow-x-auto pb-4">
            <div
              className="min-w-[320px]"
              id="admin-grid-wrapper"
              style={!isCanvasMode && !isGA && stageLayout && stageLayout.hasCustomStagePos ? { paddingTop: stageLayout.paddingTop } : undefined}
            >
              {isGA ? (
                /* ─── GA Layout: zones with capacity cards + seat grid ─── */
                <div className="space-y-6">
                  {/* Stage */}
                  <div className="flex justify-center">
                    <StageRenderer
                      stageType={parsedLayout?.stageType || 'PROSCENIUM'}
                      size="lg"
                      thrustWidth={parsedLayout?.thrustWidth}
                      thrustDepth={parsedLayout?.thrustDepth}
                    />
                  </div>

                  {/* GA Zone Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {gaZones.map((zone) => {
                      const zoneSeats = seats.filter((s) => s.row === zone.name)
                      const available = zoneSeats.filter((s) => s.status === 'AVAILABLE').length
                      const sold = zoneSeats.filter((s) => s.status === 'SOLD').length
                      const locked = zoneSeats.filter((s) => s.status === 'LOCKED_TEMPORARY').length
                      const isSelected = zoneSeats.some((s) => selectedSeatCodes.has(s.seatCode))

                      return (
                        <div
                          key={zone.id}
                          className={cn(
                            'p-4 rounded-xl border-2 transition-all',
                            isSelected
                              ? 'border-gold bg-gold/5 shadow-sm'
                              : 'border-border/50 hover:border-gold/30'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-4 h-4 rounded-sm shrink-0"
                              style={{ backgroundColor: zone.color }}
                            />
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-sm text-charcoal truncate">
                                {zone.name}
                              </h3>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Kapasitas: {zone.capacity} orang
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs">
                            <span className="text-green-600">{available} tersedia</span>
                            <span className="text-red-500">{sold} terjual</span>
                            <span className="text-amber-600">{locked} terkunci</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* GA Seat Grid — grouped by zone (row) */}
                  <div className="space-y-4">
                    {(() => {
                      const zoneGroups = new Map<string, SeatData[]>()
                      for (const s of seats) {
                        const key = s.row || 'Unknown'
                        if (!zoneGroups.has(key)) zoneGroups.set(key, [])
                        zoneGroups.get(key)!.push(s)
                      }

                      return [...zoneGroups.entries()].map(([zoneName, zoneSeats]) => {
                        const sorted = [...zoneSeats].sort((a, b) => a.col - b.col)
                        const zoneInfo = gaZones.find(z => z.name === zoneName)
                        return (
                          <div key={zoneName}>
                            <div className="flex items-center gap-2 mb-2">
                              {zoneInfo && (
                                <div
                                  className="w-3 h-3 rounded-sm"
                                  style={{ backgroundColor: zoneInfo.color }}
                                />
                              )}
                              <span className="text-xs font-semibold font-serif text-muted-foreground">
                                {zoneName}
                              </span>
                              <span className="text-xs text-muted-foreground/60">
                                ({sorted.length} kursi)
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1 ml-5">
                              {sorted.map((seat) => renderSeatButton(seat, undefined, undefined))}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>
              ) : parsedLayout ? (
                /* Centered wrapper — canvas mode has its own stage/objects inside */
                <div className={cn(
                  isCanvasMode
                    ? 'overflow-x-auto flex justify-center'
                    : 'relative mx-auto w-fit flex flex-col items-center',
                )} style={!isCanvasMode ? { minWidth: (() => {
                  const CELL_TOTAL = SEAT_W + SEAT_GAP
                  const ec = parsedLayout.gridSize.cols
                  return ec * CELL_TOTAL - SEAT_GAP + 60
                })() } : undefined}>
                  {/* Grid mode: Custom stage position overlay */}
                  {!isCanvasMode && stageLayout && stageLayout.hasCustomStagePos && stageLayout.stageGuest && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: stageLayout.stageGuest.x,
                        top: stageLayout.stageGuest.y,
                        width: stageLayout.stageGuest.w,
                        height: stageLayout.stageGuest.h,
                        zIndex: 10,
                      }}
                    >
                      <StageRenderer
                        stageType={stageLayout.stageType}
                        size={stageLayout.stageSize}
                        thrustWidth={parsedLayout?.thrustWidth}
                        thrustDepth={parsedLayout?.thrustDepth}
                        fillParent
                      />
                    </div>
                  )}
                  {renderFlatGridInner(seatLookup)}
                  {/* Grid mode: Objects overlay */}
                  {!isCanvasMode && parsedLayout?.objects && parsedLayout.objects.length > 0 && stageLayout && (
                    <ObjectsOverlay
                      objects={parsedLayout.objects}
                      cellSize={SEAT_W + SEAT_GAP}
                      offsetX={LABEL_W}
                      canvasSeatBounds={stageLayout.canvasSeatBounds}
                      gridCols={stageLayout.cols}
                      gridRows={stageLayout.displayRowsCount}
                      paddingTop={stageLayout.paddingTop}
                    />
                  )}
                </div>
              ) : isGA ? (
                /* ─── GA Layout: zones as rows ─────────────────────────── */
                <div className="space-y-4">
                  {rowLayout.map((row) => (
                    <div key={row.rowName}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 text-center text-xs font-semibold font-serif text-muted-foreground">
                          {row.rowName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ({row.totalSeats} kursi)
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 ml-8">
                        {(row as any).seats.map((seat: SeatData) => renderSeatButton(seat, undefined, undefined))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* ─── Fallback: simple row list ────────────────────────── */
                <>
                  {rowLayout.map((row) => (
                    <div key={row.rowName} className="flex items-center gap-1 mb-1">
                      <div className="w-6 text-center text-xs font-semibold font-serif text-muted-foreground shrink-0">
                        {row.rowName}
                      </div>
                      <div className="flex gap-1">
                        {(row as any).seats.map((seat: SeatData, i: number) => renderSeatButton(seat, undefined, i + 1))}
                      </div>
                    </div>
                  ))}
                </>
              )}

            </div>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <Card className="border-danger/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-danger">Hapus Semua Kursi</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Hapus semua kursi event ini untuk regenerate ulang dari seat map.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteAndRegenerate}
              disabled={isDeletingSeats}
              className="text-danger border-danger/30 hover:bg-danger/10"
            >
              {isDeletingSeats ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3 mr-1" />
              )}
              Hapus Kursi
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
