'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  Loader2, Save, ArrowLeft, Users, Star, Plus, Trash2, Edit, X, Check, MessageSquareQuote,
  Link2, Copy, ExternalLink, MousePointerClick,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────

interface GuestReview {
  id: string
  authorName: string
  rating: number
  comment: string
  createdAt: string
}

// ─── Guest Reviews Card (reads from Review model via API) ────────────

function GuestReviewsCard({ eventId, isCompleted }: { eventId: string; isCompleted: boolean }) {
  const [reviews, setReviews] = useState<GuestReview[]>([])
  const [stats, setStats] = useState<{ average: number; total: number } | null>(null)
  const [isLoading, setIsLoading] = useState(isCompleted)

  useEffect(() => {
    if (!isCompleted) return
    fetch(`/api/events/${eventId}/reviews`)
      .then((res) => res.ok ? res.json() : { reviews: [], stats: null })
      .then((data) => {
        setReviews(data.reviews || [])
        setStats(data.stats || null)
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [eventId, isCompleted])

  async function handleDeleteReview(reviewId: string) {
    if (!confirm('Hapus review ini?')) return
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}`, { method: 'DELETE' })
      if (res.ok) {
        setReviews(reviews.filter((r) => r.id !== reviewId))
      }
    } catch (err) {
      console.error('Delete review error:', err)
    }
  }

  if (!isCompleted) return null

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquareQuote className="w-5 h-5 text-gold" />
            <CardTitle className="font-serif text-lg text-charcoal">Guest Reviews</CardTitle>
            <Badge variant="secondary" className="text-xs bg-gold/10 text-gold-dark">
              {reviews.length} review
            </Badge>
          </div>
          {stats && stats.total > 0 && (
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-gold fill-gold" />
              <span className="text-sm font-semibold text-charcoal">{stats.average}</span>
              <span className="text-xs text-muted-foreground">/5</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 text-gold animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-6 rounded-lg border border-dashed border-border/60 bg-muted/20">
            <MessageSquareQuote className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Belum ada review dari guest</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="rounded-lg border border-border/60 p-3 bg-white"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-charcoal">{review.authorName}</span>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={cn(
                            'w-3 h-3',
                            star <= review.rating ? 'fill-gold text-gold' : 'fill-none text-muted-foreground/30'
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground/50">
                      {new Date(review.createdAt).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDeleteReview(review.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                {review.comment && (
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    &ldquo;{review.comment}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface CastMember {
  name: string
  role: string
  imageUrl: string
}

interface Review {
  authorName: string
  rating: number
  comment: string
  createdAt: string
}

interface ShowDateData {
  id: string
  date: string
  openGate: string | null
  label: string | null
}

interface PriceCategoryData {
  id: string
  name: string
  price: number
  colorCode: string
}

interface EventData {
  id: string
  title: string
  category: string
  showDate: string
  openGate: string | null
  location: string
  posterUrl: string | null
  synopsis: string
  teaserVideoUrl: string | null
  isPublished: boolean
  isCompleted?: boolean
  adminFee: number
  adminFeeQris: number
  adminFeeNonQris: number
  seatType: string | null
  castData: string | null
  reviewsData: string | null
  priceCategories: PriceCategoryData[]
  showDates: ShowDateData[]
}

// ─── Helper: safe JSON parse ──────────────────────────────────────

function safeParseArray<T>(raw: string | null | undefined, fallback: T[]): T[] {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

// ─── Star Rating Component ────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readonly = false,
  size = 'sm',
}: {
  value: number
  onChange?: (v: number) => void
  readonly?: boolean
  size?: 'sm' | 'md'
}) {
  const iconSize = size === 'md' ? 'w-5 h-5' : 'w-4 h-4'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          className={cn(
            'transition-colors',
            readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
          )}
        >
          <Star
            className={cn(
              iconSize,
              star <= value
                ? 'fill-gold text-gold'
                : 'fill-none text-muted-foreground/30'
            )}
          />
        </button>
      ))}
    </div>
  )
}

// ─── Short Links Card ──────────────────────────────────────────────

interface ShortLinkData {
  id: string
  slug: string
  clickCount: number
  isActive: boolean
  createdAt: string
  event: { id: string; title: string }
}

function ShortLinksCard({ eventId }: { eventId: string }) {
  const [shortLinks, setShortLinks] = useState<ShortLinkData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newSlug, setNewSlug] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  useEffect(() => {
    fetchShortLinks()
  }, [eventId])

  async function fetchShortLinks() {
    try {
      const res = await fetch(`/api/admin/short-links?eventId=${eventId}`)
      if (res.ok) {
        const data = await res.json()
        setShortLinks(data.shortLinks || [])
      }
    } catch (err) {
      console.error('Fetch short links error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleCreate() {
    if (!newSlug.trim()) return
    setIsCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/short-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: newSlug.trim(), eventId }),
      })
      if (res.ok) {
        setNewSlug('')
        fetchShortLinks()
      } else {
        const data = await res.json()
        setError(data.error || 'Gagal membuat short link')
      }
    } catch {
      setError('Terjadi kesalahan')
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDelete(id: string, slug: string) {
    if (!confirm(`Hapus short link "${slug}"?`)) return
    try {
      const res = await fetch(`/api/admin/short-links/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setShortLinks(shortLinks.filter((sl) => sl.id !== id))
      }
    } catch (err) {
      console.error('Delete short link error:', err)
    }
  }

  function handleCopy(slug: string) {
    const url = `${window.location.origin}/${slug}`
    navigator.clipboard.writeText(url)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), 2000)
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-gold" />
          <CardTitle className="font-serif text-lg text-charcoal">Short Links</CardTitle>
          <Badge variant="secondary" className="text-xs bg-gold/10 text-gold-dark">
            {shortLinks.length} link
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create new short link */}
        <div className="border border-dashed border-border/60 rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Buat Short Link Baru</p>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-muted/50 border border-border/60 rounded-md px-3 h-9 text-sm text-muted-foreground shrink-0">
              teateran.site/
            </div>
            <Input
              value={newSlug}
              onChange={(e) => {
                setNewSlug(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30))
                setError(null)
              }}
              placeholder="tajoc"
              className="h-9"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button
              onClick={handleCreate}
              disabled={isCreating || !newSlug.trim()}
              size="sm"
              className="bg-gold hover:bg-gold/90 text-charcoal shrink-0"
            >
              {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Buat
            </Button>
          </div>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          <p className="text-xs text-muted-foreground/60 mt-2">
            Hanya huruf, angka, strip (-), underscore (_). 2-30 karakter. Sekali pakai per event.
          </p>
        </div>

        {/* List of existing short links */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 text-gold animate-spin" />
          </div>
        ) : shortLinks.length === 0 ? (
          <div className="text-center py-6 rounded-lg border border-dashed border-border/60 bg-muted/20">
            <Link2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Belum ada short link</p>
            <p className="text-xs text-muted-foreground/60">Buat short link di atas untuk mempermudah berbagi</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {shortLinks.map((sl) => (
              <div
                key={sl.id}
                className="rounded-lg border border-border/60 p-3 bg-white flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-charcoal">/{sl.slug}</span>
                    <Badge variant="secondary" className="text-[10px] bg-gold/10 text-gold-dark px-1.5 py-0">
                      <MousePointerClick className="w-2.5 h-2.5 mr-0.5" />
                      {sl.clickCount}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    teateran.site/{sl.slug}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-charcoal"
                    onClick={() => handleCopy(sl.slug)}
                    title="Copy link"
                  >
                    {copiedSlug === sl.slug ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <a
                    href={`/${sl.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-charcoal hover:bg-accent"
                    title="Buka link"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(sl.id, sl.slug)}
                    title="Hapus"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Main Page Component ──────────────────────────────────────────

export default function AdminEventEditPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [event, setEvent] = useState<EventData | null>(null)

  // Form fields
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Teater')
  const [location, setLocation] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [teaserVideoUrl, setTeaserVideoUrl] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [adminFee, setAdminFee] = useState(0)
  const [isPublished, setIsPublished] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)

  // Cast & Crew
  const [cast, setCast] = useState<CastMember[]>([])
  const [editingCastIdx, setEditingCastIdx] = useState<number | null>(null)
  const [newCast, setNewCast] = useState<CastMember>({ name: '', role: '', imageUrl: '' })

  // Reviews
  const [reviews, setReviews] = useState<Review[]>([])
  const [editingReviewIdx, setEditingReviewIdx] = useState<number | null>(null)
  const [newReview, setNewReview] = useState<Review>({
    authorName: '',
    rating: 5,
    comment: '',
    createdAt: new Date().toISOString().slice(0, 10),
  })

  // ─── Fetch event data ──────────────────────────────────────────
  useEffect(() => {
    async function fetchEvent() {
      try {
        const res = await fetch(`/api/admin/events/${eventId}`)
        if (!res.ok) {
          setError('Event tidak ditemukan')
          return
        }
        const data = await res.json()
        const ev: EventData = data.event

        setEvent(ev)
        setTitle(ev.title)
        setCategory(ev.category)
        setLocation(ev.location)
        setPosterUrl(ev.posterUrl || '')
        setTeaserVideoUrl(ev.teaserVideoUrl || '')
        setSynopsis(ev.synopsis || '')
        setAdminFee(ev.adminFee || 0)
        setIsPublished(ev.isPublished)
        setIsCompleted(ev.isCompleted || false)

        // Parse cast & reviews
        setCast(safeParseArray<CastMember>(ev.castData, []))
        setReviews(safeParseArray<Review>(ev.reviewsData, []))
      } catch (err) {
        console.error('Failed to fetch event:', err)
        setError('Gagal memuat data event')
      } finally {
        setIsLoading(false)
      }
    }
    fetchEvent()
  }, [eventId])

  // ─── Save handler ──────────────────────────────────────────────
  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category,
          location,
          posterUrl: posterUrl || null,
          teaserVideoUrl: teaserVideoUrl || null,
          synopsis,
          adminFee,
          isPublished,
          isCompleted,
          castData: JSON.stringify(cast),
          reviewsData: JSON.stringify(reviews),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Gagal menyimpan perubahan')
        return
      }

      const data = await res.json()
      setEvent(data.event)
      alert('Perubahan berhasil disimpan!')
    } catch (err) {
      console.error('Save error:', err)
      alert('Terjadi kesalahan saat menyimpan')
    } finally {
      setIsSaving(false)
    }
  }

  // ─── Cast handlers ─────────────────────────────────────────────
  function addCastMember() {
    if (!newCast.name.trim()) {
      alert('Nama cast wajib diisi')
      return
    }
    setCast([...cast, { ...newCast }])
    setNewCast({ name: '', role: '', imageUrl: '' })
  }

  function removeCastMember(idx: number) {
    setCast(cast.filter((_, i) => i !== idx))
    if (editingCastIdx === idx) setEditingCastIdx(null)
  }

  function updateCastMember(idx: number, field: keyof CastMember, value: string) {
    const updated = [...cast]
    updated[idx] = { ...updated[idx], [field]: value }
    setCast(updated)
  }

  function saveCastEdit(idx: number) {
    if (!cast[idx].name.trim()) {
      alert('Nama cast wajib diisi')
      return
    }
    setEditingCastIdx(null)
  }

  // ─── Review handlers ───────────────────────────────────────────
  function addReview() {
    if (!newReview.authorName.trim()) {
      alert('Nama penulis wajib diisi')
      return
    }
    if (!newReview.comment.trim()) {
      alert('Komentar wajib diisi')
      return
    }
    setReviews([...reviews, { ...newReview, createdAt: newReview.createdAt || new Date().toISOString().slice(0, 10) }])
    setNewReview({ authorName: '', rating: 5, comment: '', createdAt: new Date().toISOString().slice(0, 10) })
  }

  function removeReview(idx: number) {
    setReviews(reviews.filter((_, i) => i !== idx))
    if (editingReviewIdx === idx) setEditingReviewIdx(null)
  }

  function updateReview(idx: number, field: keyof Review, value: string | number) {
    const updated = [...reviews]
    updated[idx] = { ...updated[idx], [field]: value }
    setReviews(updated)
  }

  function saveReviewEdit(idx: number) {
    if (!reviews[idx].authorName.trim()) {
      alert('Nama penulis wajib diisi')
      return
    }
    setEditingReviewIdx(null)
  }

  // ─── Render ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-gold animate-spin" />
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="text-center py-24">
        <p className="text-destructive text-sm font-medium">{error || 'Event tidak ditemukan'}</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/admin/events">Kembali ke Events</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link href="/admin/events">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-serif text-2xl font-bold text-charcoal">Edit Event</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{event.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className={cn(
              'text-xs',
              isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'
            )}
          >
            {isPublished ? 'Published' : 'Draft'}
          </Badge>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-charcoal hover:bg-charcoal/90 text-gold"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Simpan
          </Button>
        </div>
      </div>

      {/* ─── Basic Info Card ────────────────────────────────────── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg text-charcoal">Informasi Dasar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Judul Event</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Judul event"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Kategori</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Teater"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Lokasi</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Teateran, Yogyakarta"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">URL Poster</Label>
              <Input
                value={posterUrl}
                onChange={(e) => setPosterUrl(e.target.value)}
                placeholder="https://example.com/poster.jpg"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">URL Video Teaser</Label>
              <Input
                value={teaserVideoUrl}
                onChange={(e) => setTeaserVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Sinopsis</Label>
            <Textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="Deskripsi singkat pertunjukan..."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Biaya Admin per Tiket (Rp)</Label>
              <Input
                type="number"
                value={adminFee}
                onChange={(e) => setAdminFee(Number(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Status Publikasi</Label>
              <div className="flex items-center gap-3 h-9">
                <button
                  type="button"
                  onClick={() => setIsPublished(!isPublished)}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    isPublished ? 'bg-emerald-500' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      isPublished ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
                <span className="text-sm text-muted-foreground">
                  {isPublished ? 'Published' : 'Draft'}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Status Pementasan</Label>
              <div className="flex items-center gap-3 h-9">
                <button
                  type="button"
                  onClick={() => setIsCompleted(!isCompleted)}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    isCompleted ? 'bg-emerald-600' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      isCompleted ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
                <span className="text-sm text-muted-foreground">
                  {isCompleted ? 'Selesai (Guest bisa review)' : 'Aktif (Bisa beli tiket)'}
                </span>
              </div>
              {isCompleted && (
                <p className="text-xs text-emerald-600 font-medium">
                  Pementasan selesai — tiket tidak bisa dibeli, guest bisa memberikan review.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Cast & Crew Card ───────────────────────────────────── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-gold" />
              <CardTitle className="font-serif text-lg text-charcoal">Cast & Crew</CardTitle>
              <Badge variant="secondary" className="text-xs bg-gold/10 text-gold-dark">
                {cast.length} anggota
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing cast members */}
          {cast.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {cast.map((member, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-border/60 p-3 bg-white"
                >
                  {editingCastIdx === idx ? (
                    // ── Edit mode ──
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Nama</Label>
                          <Input
                            value={member.name}
                            onChange={(e) => updateCastMember(idx, 'name', e.target.value)}
                            className="h-8 text-sm"
                            placeholder="Nama lengkap"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Peran</Label>
                          <Input
                            value={member.role}
                            onChange={(e) => updateCastMember(idx, 'role', e.target.value)}
                            className="h-8 text-sm"
                            placeholder="contoh: Hamlet"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">URL Foto</Label>
                          <Input
                            value={member.imageUrl}
                            onChange={(e) => updateCastMember(idx, 'imageUrl', e.target.value)}
                            className="h-8 text-sm"
                            placeholder="https://..."
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingCastIdx(null)}
                          className="h-7 text-xs"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Batal
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveCastEdit(idx)}
                          className="h-7 text-xs bg-gold hover:bg-gold/90 text-charcoal"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Simpan
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // ── Display mode ──
                    <div className="flex items-center gap-3">
                      {member.imageUrl ? (
                        <img
                          src={member.imageUrl}
                          alt={member.name}
                          className="w-10 h-10 rounded-full object-cover border border-border/50 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-gold" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-charcoal truncate">{member.name}</p>
                        {member.role && (
                          <p className="text-xs text-muted-foreground truncate">sebagai {member.role}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-charcoal"
                          onClick={() => setEditingCastIdx(idx)}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => removeCastMember(idx)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {cast.length === 0 && (
            <div className="text-center py-6 rounded-lg border border-dashed border-border/60 bg-muted/20">
              <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Belum ada cast & crew</p>
              <p className="text-xs text-muted-foreground/60">Tambahkan anggota cast di bawah</p>
            </div>
          )}

          {/* Add new cast member form */}
          <div className="border border-dashed border-border/60 rounded-lg p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Tambah Cast / Crew Baru</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Nama *</Label>
                <Input
                  value={newCast.name}
                  onChange={(e) => setNewCast({ ...newCast, name: e.target.value })}
                  className="h-8 text-sm"
                  placeholder="Nama lengkap"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Peran</Label>
                <Input
                  value={newCast.role}
                  onChange={(e) => setNewCast({ ...newCast, role: e.target.value })}
                  className="h-8 text-sm"
                  placeholder="contoh: Hamlet, Director"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">URL Foto</Label>
                <Input
                  value={newCast.imageUrl}
                  onChange={(e) => setNewCast({ ...newCast, imageUrl: e.target.value })}
                  className="h-8 text-sm"
                  placeholder="https://..."
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={addCastMember}
                disabled={!newCast.name.trim()}
                className="text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Tambah Cast
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Reviews / Testimonials Card ─────────────────────────── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-gold" />
              <CardTitle className="font-serif text-lg text-charcoal">Reviews & Testimonials</CardTitle>
              <Badge variant="secondary" className="text-xs bg-gold/10 text-gold-dark">
                {reviews.length} review
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing reviews */}
          {reviews.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {reviews.map((review, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-border/60 p-3 bg-white"
                >
                  {editingReviewIdx === idx ? (
                    // ── Edit mode ──
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Nama Penulis *</Label>
                          <Input
                            value={review.authorName}
                            onChange={(e) => updateReview(idx, 'authorName', e.target.value)}
                            className="h-8 text-sm"
                            placeholder="Nama penulis"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Rating</Label>
                          <div className="h-8 flex items-center">
                            <StarRating
                              value={review.rating}
                              onChange={(v) => updateReview(idx, 'rating', v)}
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Komentar</Label>
                        <Textarea
                          value={review.comment}
                          onChange={(e) => updateReview(idx, 'comment', e.target.value)}
                          className="text-sm min-h-[60px]"
                          placeholder="Tulis komentar..."
                        />
                      </div>
                      <div className="w-48">
                        <Label className="text-xs text-muted-foreground">Tanggal</Label>
                        <Input
                          type="date"
                          value={review.createdAt ? review.createdAt.slice(0, 10) : ''}
                          onChange={(e) => updateReview(idx, 'createdAt', e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingReviewIdx(null)}
                          className="h-7 text-xs"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Batal
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveReviewEdit(idx)}
                          className="h-7 text-xs bg-gold hover:bg-gold/90 text-charcoal"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Simpan
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // ── Display mode ──
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-charcoal">{review.authorName}</span>
                          <StarRating value={review.rating} readonly size="sm" />
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-charcoal"
                            onClick={() => setEditingReviewIdx(idx)}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => removeReview(idx)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      {review.comment && (
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                          &ldquo;{review.comment}&rdquo;
                        </p>
                      )}
                      {review.createdAt && (
                        <p className="text-xs text-muted-foreground/50 mt-1">
                          {new Date(review.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {reviews.length === 0 && (
            <div className="text-center py-6 rounded-lg border border-dashed border-border/60 bg-muted/20">
              <Star className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Belum ada review</p>
              <p className="text-xs text-muted-foreground/60">Tambahkan review di bawah</p>
            </div>
          )}

          {/* Add new review form */}
          <div className="border border-dashed border-border/60 rounded-lg p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Tambah Review Baru</p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Nama Penulis *</Label>
                  <Input
                    value={newReview.authorName}
                    onChange={(e) => setNewReview({ ...newReview, authorName: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="Nama penulis review"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Rating</Label>
                  <div className="h-8 flex items-center">
                    <StarRating
                      value={newReview.rating}
                      onChange={(v) => setNewReview({ ...newReview, rating: v })}
                      size="md"
                    />
                    <span className="ml-2 text-sm font-medium text-charcoal">{newReview.rating}/5</span>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Komentar *</Label>
                <Textarea
                  value={newReview.comment}
                  onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                  className="text-sm min-h-[60px]"
                  placeholder="Tulis komentar review..."
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="w-48">
                  <Label className="text-xs text-muted-foreground">Tanggal</Label>
                  <Input
                    type="date"
                    value={newReview.createdAt}
                    onChange={(e) => setNewReview({ ...newReview, createdAt: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addReview}
                  disabled={!newReview.authorName.trim() || !newReview.comment.trim()}
                  className="text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Tambah Review
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Guest Reviews Card (from Review model) ──────────────────── */}
      <GuestReviewsCard eventId={eventId} isCompleted={isCompleted} />

      {/* ─── Short Links Card ─────────────────────────────────────── */}
      <ShortLinksCard eventId={eventId} />

      {/* ─── Bottom Actions ──────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2 pb-8">
        <Button variant="outline" asChild>
          <Link href="/admin/events">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Kembali ke Events
          </Link>
        </Button>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-charcoal hover:bg-charcoal/90 text-gold"
        >
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Simpan Semua Perubahan
        </Button>
      </div>
    </div>
  )
}
