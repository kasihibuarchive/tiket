'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Users, Plus, Pencil, Trash2, Eye, EyeOff,
  Power, PowerOff, Search, Activity, Clock, User, ChevronDown, ChevronUp, AlertTriangle,
  Filter, ChevronLeft, ChevronRight, Globe, FileText, CalendarDays, RotateCcw,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Usher {
  id: string
  username: string
  name: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count?: { activityLogs: number }
}

interface ActivityLog {
  id: string
  adminId: string
  adminName: string | null
  action: string
  details: string | null
  ipAddress: string | null
  createdAt: string
}

// ─── Action Configs ──────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  CHECK_IN: 'Scan Tiket',
  RESEND_EMAIL: 'Kirim Ulang Email',
  CANCEL_TRANSACTION: 'Batalkan Transaksi',
  ACCOUNT_CREATED: 'Akun Dibuat',
  ACCOUNT_UPDATED: 'Akun Diubah',
  DELETE_ACCOUNT: 'Akun Dihapus',
  CREATE_EVENT: 'Buat Event',
  UPDATE_EVENT: 'Edit Event',
  DELETE_EVENT: 'Hapus Event',
  CREATE_MERCHANDISE: 'Buat Merchandise',
  UPDATE_MERCHANDISE: 'Edit Merchandise',
  DELETE_MERCHANDISE: 'Hapus Merchandise',
  CREATE_PROMO: 'Buat Kode Promo',
  UPDATE_PROMO: 'Edit Kode Promo',
  DELETE_PROMO: 'Hapus Kode Promo',
  COMPLIMENTARY_TICKET: 'Tiket Komplimen/OTS',
  GENERATE_SEATS: 'Generate Kursi',
  UPDATE_SEATS: 'Update Kursi',
  DELETE_SEATS: 'Hapus Kursi',
  UPDATE_EMAIL_TEMPLATE: 'Edit Template Email',
  CREATE_SEAT_MAP: 'Buat Seat Map',
  UPDATE_SEAT_MAP: 'Edit Seat Map',
  DELETE_SEAT_MAP: 'Hapus Seat Map',
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'bg-blue-100 text-blue-700 border-blue-200',
  LOGOUT: 'bg-gray-100 text-gray-700 border-gray-200',
  CHECK_IN: 'bg-green-100 text-green-700 border-green-200',
  RESEND_EMAIL: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  CANCEL_TRANSACTION: 'bg-red-100 text-red-700 border-red-200',
  ACCOUNT_CREATED: 'bg-purple-100 text-purple-700 border-purple-200',
  ACCOUNT_UPDATED: 'bg-amber-100 text-amber-700 border-amber-200',
  DELETE_ACCOUNT: 'bg-red-100 text-red-700 border-red-200',
  CREATE_EVENT: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  UPDATE_EVENT: 'bg-teal-100 text-teal-700 border-teal-200',
  DELETE_EVENT: 'bg-red-100 text-red-700 border-red-200',
  CREATE_MERCHANDISE: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  UPDATE_MERCHANDISE: 'bg-violet-100 text-violet-700 border-violet-200',
  DELETE_MERCHANDISE: 'bg-red-100 text-red-700 border-red-200',
  CREATE_PROMO: 'bg-lime-100 text-lime-700 border-lime-200',
  UPDATE_PROMO: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  DELETE_PROMO: 'bg-red-100 text-red-700 border-red-200',
  COMPLIMENTARY_TICKET: 'bg-pink-100 text-pink-700 border-pink-200',
  GENERATE_SEATS: 'bg-sky-100 text-sky-700 border-sky-200',
  UPDATE_SEATS: 'bg-orange-100 text-orange-700 border-orange-200',
  DELETE_SEATS: 'bg-red-100 text-red-700 border-red-200',
  UPDATE_EMAIL_TEMPLATE: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  CREATE_SEAT_MAP: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  UPDATE_SEAT_MAP: 'bg-teal-100 text-teal-700 border-teal-200',
  DELETE_SEAT_MAP: 'bg-red-100 text-red-700 border-red-200',
}

const ACTION_ICONS: Record<string, string> = {
  LOGIN: '🔐',
  LOGOUT: '🚪',
  CHECK_IN: '✅',
  RESEND_EMAIL: '📧',
  CANCEL_TRANSACTION: '❌',
  COMPLIMENTARY_TICKET: '🎟️',
  ACCOUNT_CREATED: '👤',
  ACCOUNT_UPDATED: '✏️',
  DELETE_ACCOUNT: '🗑️',
  CREATE_EVENT: '🎉',
  UPDATE_EVENT: '📝',
  DELETE_EVENT: '🗑️',
  CREATE_MERCHANDISE: '🛍️',
  UPDATE_MERCHANDISE: '✏️',
  DELETE_MERCHANDISE: '🗑️',
  CREATE_PROMO: '🏷️',
  UPDATE_PROMO: '✏️',
  DELETE_PROMO: '🗑️',
  GENERATE_SEATS: '💺',
  UPDATE_SEATS: '✏️',
  DELETE_SEATS: '🗑️',
  UPDATE_EMAIL_TEMPLATE: '💌',
  CREATE_SEAT_MAP: '🗺️',
  UPDATE_SEAT_MAP: '✏️',
  DELETE_SEAT_MAP: '🗑️',
}

const ACTION_GROUPS = [
  { label: 'Autentikasi', actions: ['LOGIN', 'LOGOUT'] },
  { label: 'Tiket & Transaksi', actions: ['CHECK_IN', 'COMPLIMENTARY_TICKET', 'RESEND_EMAIL', 'CANCEL_TRANSACTION'] },
  { label: 'Event', actions: ['CREATE_EVENT', 'UPDATE_EVENT', 'DELETE_EVENT'] },
  { label: 'Merchandise', actions: ['CREATE_MERCHANDISE', 'UPDATE_MERCHANDISE', 'DELETE_MERCHANDISE'] },
  { label: 'Kode Promo', actions: ['CREATE_PROMO', 'UPDATE_PROMO', 'DELETE_PROMO'] },
  { label: 'Kursi & Seat Map', actions: ['GENERATE_SEATS', 'UPDATE_SEATS', 'DELETE_SEATS', 'CREATE_SEAT_MAP', 'UPDATE_SEAT_MAP', 'DELETE_SEAT_MAP'] },
  { label: 'Akun & Lainnya', actions: ['ACCOUNT_CREATED', 'ACCOUNT_UPDATED', 'DELETE_ACCOUNT', 'UPDATE_EMAIL_TEMPLATE'] },
]

const LOG_PAGE_SIZE = 30

// ─── Tab Keys ────────────────────────────────────────────────────────────────
type TabKey = 'daftar' | 'aktivitas'

// ─── Main Component ──────────────────────────────────────────────────────────

export default function UsherManagementPage() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<TabKey>('daftar')

  // ─── Usher List State ────────────────────────────────────────────────────
  const [ushers, setUshers] = useState<Usher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Form state
  const [formUsername, setFormUsername] = useState('')
  const [formName, setFormName] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [showFormPassword, setShowFormPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Edit state
  const [editingUsher, setEditingUsher] = useState<Usher | null>(null)
  const [editName, setEditName] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [editIsActive, setEditIsActive] = useState(true)

  // Delete state
  const [deletingUsher, setDeletingUsher] = useState<Usher | null>(null)

  // Expanded usher for quick view
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [quickLogs, setQuickLogs] = useState<ActivityLog[]>([])

  // ─── Activity Log State ──────────────────────────────────────────────────
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPage, setLogsPage] = useState(0)
  const [logSearch, setLogSearch] = useState('')
  const [logSearchInput, setLogSearchInput] = useState('')
  const [logActionFilter, setLogActionFilter] = useState('')
  const [logDateFrom, setLogDateFrom] = useState('')
  const [logDateTo, setLogDateTo] = useState('')
  const [logUsherFilter, setLogUsherFilter] = useState('')
  const [showLogFilters, setShowLogFilters] = useState(false)

  // ─── Fetch Ushers ────────────────────────────────────────────────────────
  const fetchUshers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ushers')
      if (res.ok) {
        const data = await res.json()
        setUshers(data.ushers || [])
      }
    } catch (err) {
      console.error('Failed to fetch ushers:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUshers()
  }, [fetchUshers])

  // ─── Fetch Activity Logs ─────────────────────────────────────────────────
  const fetchActivityLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('role', 'usher')
      params.set('limit', String(LOG_PAGE_SIZE))
      params.set('offset', String(logsPage * LOG_PAGE_SIZE))
      if (logSearch) params.set('search', logSearch)
      if (logActionFilter) params.set('action', logActionFilter)
      if (logDateFrom) params.set('dateFrom', logDateFrom)
      if (logDateTo) params.set('dateTo', logDateTo)
      if (logUsherFilter) params.set('adminId', logUsherFilter)

      const res = await fetch(`/api/admin/activity-logs?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
        setLogsTotal(data.total || 0)
      }
    } catch (err) {
      console.error('Failed to fetch activity logs:', err)
    } finally {
      setLogsLoading(false)
    }
  }, [logsPage, logSearch, logActionFilter, logDateFrom, logDateTo, logUsherFilter])

  useEffect(() => {
    if (activeTab === 'aktivitas') {
      fetchActivityLogs()
    }
  }, [activeTab, fetchActivityLogs])

  // ─── Fetch Quick Logs (per usher) ────────────────────────────────────────
  const fetchQuickLogs = async (adminId: string) => {
    try {
      const res = await fetch(`/api/admin/activity-logs?adminId=${adminId}&limit=5`)
      if (res.ok) {
        const data = await res.json()
        setQuickLogs(data.logs || [])
      }
    } catch {}
  }

  // ─── Create Usher ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formUsername.trim() || !formPassword.trim()) {
      toast({ title: 'Error', description: 'Username dan password harus diisi', variant: 'destructive' })
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/admin/ushers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formUsername.trim(),
          password: formPassword,
          name: formName.trim() || formUsername.trim(),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast({ title: 'Gagal', description: data.error || 'Gagal membuat usher', variant: 'destructive' })
        return
      }
      toast({ title: 'Berhasil', description: `Usher "${formUsername}" berhasil dibuat` })
      setShowCreateDialog(false)
      setFormUsername('')
      setFormName('')
      setFormPassword('')
      fetchUshers()
    } catch {
      toast({ title: 'Error', description: 'Terjadi kesalahan koneksi', variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Update Usher ────────────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!editingUsher) return
    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {}
      if (editName !== editingUsher.name) body.name = editName
      if (editPassword) body.password = editPassword
      if (editIsActive !== editingUsher.isActive) body.isActive = editIsActive

      if (Object.keys(body).length === 0) {
        toast({ title: 'Info', description: 'Tidak ada perubahan' })
        setShowEditDialog(false)
        return
      }

      const res = await fetch(`/api/admin/ushers/${editingUsher.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        toast({ title: 'Gagal', description: data.error || 'Gagal mengupdate usher', variant: 'destructive' })
        return
      }
      toast({ title: 'Berhasil', description: `Usher "${editingUsher.username}" berhasil diupdate` })
      setShowEditDialog(false)
      setEditPassword('')
      fetchUshers()
    } catch {
      toast({ title: 'Error', description: 'Terjadi kesalahan koneksi', variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Delete Usher ────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deletingUsher) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/admin/ushers/${deletingUsher.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        toast({ title: 'Gagal', description: data.error || 'Gagal menghapus usher', variant: 'destructive' })
        return
      }
      toast({ title: 'Berhasil', description: `Usher "${deletingUsher.username}" berhasil dihapus` })
      setShowDeleteDialog(false)
      fetchUshers()
    } catch {
      toast({ title: 'Error', description: 'Terjadi kesalahan koneksi', variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Toggle Active ───────────────────────────────────────────────────────
  const handleToggleActive = async (usher: Usher) => {
    try {
      const res = await fetch(`/api/admin/ushers/${usher.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !usher.isActive }),
      })
      if (res.ok) {
        toast({
          title: 'Berhasil',
          description: `Usher "${usher.username}" ${usher.isActive ? 'dinonaktifkan' : 'diaktifkan'}`,
        })
        fetchUshers()
      }
    } catch {}
  }

  // ─── Open Edit Dialog ────────────────────────────────────────────────────
  const openEdit = (usher: Usher) => {
    setEditingUsher(usher)
    setEditName(usher.name || '')
    setEditPassword('')
    setEditIsActive(usher.isActive)
    setShowEditDialog(true)
  }

  // ─── Toggle Expand Quick Logs ────────────────────────────────────────────
  const toggleExpand = (usher: Usher) => {
    if (expandedId === usher.id) {
      setExpandedId(null)
      setQuickLogs([])
    } else {
      setExpandedId(usher.id)
      fetchQuickLogs(usher.id)
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const filteredUshers = ushers.filter(u =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatRelativeTime = (dateStr: string) => {
    const now = new Date()
    const date = new Date(dateStr)
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHour = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)

    if (diffMin < 1) return 'Baru saja'
    if (diffMin < 60) return `${diffMin} menit lalu`
    if (diffHour < 24) return `${diffHour} jam lalu`
    if (diffDay < 7) return `${diffDay} hari lalu`
    return formatDate(dateStr)
  }

  // ─── Activity Log Helpers ────────────────────────────────────────────────
  const handleLogSearch = () => {
    setLogSearch(logSearchInput)
    setLogsPage(0)
  }

  const handleLogSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogSearch()
  }

  const clearLogFilters = () => {
    setLogSearch('')
    setLogSearchInput('')
    setLogActionFilter('')
    setLogDateFrom('')
    setLogDateTo('')
    setLogUsherFilter('')
    setLogsPage(0)
  }

  const logTotalPages = Math.ceil(logsTotal / LOG_PAGE_SIZE)
  const hasActiveLogFilters = logSearch || logActionFilter || logDateFrom || logDateTo || logUsherFilter

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-charcoal flex items-center gap-2">
            <Users className="w-6 h-6 text-gold" />
            Manajemen Usher
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kelola akun usher, pantau aktivitas, dan kontrol akses
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          className="bg-charcoal hover:bg-charcoal/90 text-gold font-medium"
        >
          <Plus className="w-4 h-4 mr-2" />
          Tambah Usher
        </Button>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('daftar')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'daftar'
              ? 'bg-charcoal text-gold shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="w-4 h-4" />
          Daftar Usher
        </button>
        <button
          onClick={() => setActiveTab('aktivitas')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'aktivitas'
              ? 'bg-charcoal text-gold shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Activity className="w-4 h-4" />
          Pantau Aktivitas
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 1: DAFTAR USHER
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'daftar' && (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari usher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-charcoal">{ushers.length}</p>
                <p className="text-xs text-muted-foreground">Total Usher</p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{ushers.filter(u => u.isActive).length}</p>
                <p className="text-xs text-muted-foreground">Aktif</p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-red-500">{ushers.filter(u => !u.isActive).length}</p>
                <p className="text-xs text-muted-foreground">Nonaktif</p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{ushers.reduce((s, u) => s + (u._count?.activityLogs || 0), 0)}</p>
                <p className="text-xs text-muted-foreground">Total Aktivitas</p>
              </CardContent>
            </Card>
          </div>

          {/* Usher List */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : filteredUshers.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="p-12 text-center">
                <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'Tidak ada usher yang cocok' : 'Belum ada akun usher'}
                </p>
                {!searchQuery && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCreateDialog(true)}
                    className="mt-4"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Tambah Usher Pertama
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredUshers.map(usher => (
                <Card key={usher.id} className="border-border/50 overflow-hidden">
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleExpand(usher)}
                  >
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      usher.isActive ? 'bg-gold/20' : 'bg-gray-200'
                    }`}>
                      <User className={`w-5 h-5 ${usher.isActive ? 'text-gold' : 'text-gray-400'}`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-charcoal truncate">{usher.name || usher.username}</p>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            usher.isActive
                              ? 'border-green-200 text-green-700 bg-green-50'
                              : 'border-red-200 text-red-700 bg-red-50'
                          }`}
                        >
                          {usher.isActive ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        @{usher.username} &middot; Bergabung {formatDate(usher.createdAt)}
                      </p>
                    </div>

                    {/* Activity count */}
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-sm font-medium text-charcoal">{usher._count?.activityLogs || 0}</p>
                      <p className="text-[10px] text-muted-foreground">aktivitas</p>
                    </div>

                    {/* Expand toggle */}
                    {expandedId === usher.id
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    }
                  </div>

                  {/* Expanded section */}
                  {expandedId === usher.id && (
                    <div className="border-t border-border/30 px-4 py-3 bg-muted/10">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); openEdit(usher) }}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); handleToggleActive(usher) }}
                        >
                          {usher.isActive ? (
                            <><PowerOff className="w-3.5 h-3.5 mr-1 text-red-500" /> Nonaktifkan</>
                          ) : (
                            <><Power className="w-3.5 h-3.5 mr-1 text-green-500" /> Aktifkan</>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            setLogUsherFilter(usher.id)
                            setActiveTab('aktivitas')
                          }}
                        >
                          <Activity className="w-3.5 h-3.5 mr-1" />
                          Lihat Log
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => { e.stopPropagation(); setDeletingUsher(usher); setShowDeleteDialog(true) }}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Hapus
                        </Button>
                      </div>

                      {/* Quick logs preview */}
                      {quickLogs.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Aktivitas Terakhir</p>
                          {quickLogs.slice(0, 3).map(log => (
                            <div key={log.id} className="flex items-center gap-2 text-xs">
                              <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground shrink-0">{formatRelativeTime(log.createdAt)}</span>
                              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                                {ACTION_ICONS[log.action]} {ACTION_LABELS[log.action] || log.action}
                              </Badge>
                              <span className="text-muted-foreground truncate">{log.details || ''}</span>
                            </div>
                          ))}
                          {usher._count && usher._count.activityLogs > 3 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setLogUsherFilter(usher.id)
                                setActiveTab('aktivitas')
                              }}
                              className="text-[10px] text-gold hover:underline"
                            >
                              Lihat semua {usher._count.activityLogs} aktivitas...
                            </button>
                          )}
                        </div>
                      )}

                      {quickLogs.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-2">Belum ada aktivitas</p>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 2: PANTAU AKTIVITAS
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'aktivitas' && (
        <>
          {/* Search & Usher Filter Bar */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Cari aktivitas, detail..."
                  value={logSearchInput}
                  onChange={(e) => setLogSearchInput(e.target.value)}
                  onKeyDown={handleLogSearchKeyDown}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogSearch}
                className="px-4"
              >
                Cari
              </Button>

              {/* Usher filter dropdown */}
              <div className="flex items-center gap-2">
                <select
                  value={logUsherFilter}
                  onChange={(e) => { setLogUsherFilter(e.target.value); setLogsPage(0) }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Semua Usher</option>
                  {ushers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.username}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter toggle */}
              <div className="flex items-center gap-2">
                {hasActiveLogFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearLogFilters}
                    className="text-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Reset
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLogFilters(!showLogFilters)}
                  className="text-xs"
                >
                  <Filter className="w-3.5 h-3.5 mr-1" />
                  {showLogFilters ? 'Sembunyikan' : 'Filter'}
                </Button>
              </div>
            </div>

            {/* Active usher filter badge */}
            {logUsherFilter && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Menampilkan aktivitas:</span>
                <Badge variant="outline" className="text-xs bg-gold/10 text-gold-dark border-gold/20">
                  {ushers.find(u => u.id === logUsherFilter)?.name || ushers.find(u => u.id === logUsherFilter)?.username || 'Usher'}
                  <button
                    onClick={() => { setLogUsherFilter(''); setLogsPage(0) }}
                    className="ml-1.5 hover:text-red-500 transition-colors"
                  >
                    ×
                  </button>
                </Badge>
              </div>
            )}

            {/* Filter Panel */}
            {showLogFilters && (
              <Card className="border-border/50">
                <CardContent className="p-4 space-y-4">
                  {/* Action type filter */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                      Jenis Aktivitas
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => { setLogActionFilter(''); setLogsPage(0) }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          !logActionFilter
                            ? 'bg-charcoal text-gold border-charcoal'
                            : 'bg-white text-muted-foreground border-border/50 hover:border-charcoal/30'
                        }`}
                      >
                        Semua
                      </button>
                      {ACTION_GROUPS.map((group) => (
                        <div key={group.label} className="flex flex-wrap gap-1.5 items-center">
                          <span className="text-[10px] text-muted-foreground/50 font-medium mr-1">{group.label}:</span>
                          {group.actions.map((action) => (
                            <button
                              key={action}
                              onClick={() => { setLogActionFilter(action === logActionFilter ? '' : action); setLogsPage(0) }}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                                logActionFilter === action
                                  ? `${ACTION_COLORS[action] || 'bg-charcoal text-white border-charcoal'} ring-1 ring-charcoal/20`
                                  : 'bg-white text-muted-foreground border-border/50 hover:border-charcoal/30'
                              }`}
                            >
                              {ACTION_ICONS[action]} {ACTION_LABELS[action]}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Date range filter */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                      Rentang Tanggal
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          type="date"
                          value={logDateFrom}
                          onChange={(e) => { setLogDateFrom(e.target.value); setLogsPage(0) }}
                          className="w-40 text-xs h-8"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">s/d</span>
                      <Input
                        type="date"
                        value={logDateTo}
                        onChange={(e) => { setLogDateTo(e.target.value); setLogsPage(0) }}
                        className="w-40 text-xs h-8"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Stats summary */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              Total: <strong className="text-charcoal">{logsTotal}</strong> aktivitas
            </span>
            {hasActiveLogFilters && (
              <span className="text-gold font-medium">(Terfilter)</span>
            )}
            {logTotalPages > 1 && (
              <span>
                Halaman <strong className="text-charcoal">{logsPage + 1}</strong> dari {logTotalPages}
              </span>
            )}
          </div>

          {/* Log entries */}
          {logsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="p-12 text-center">
                <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {hasActiveLogFilters ? 'Tidak ada aktivitas yang cocok dengan filter' : 'Belum ada aktivitas usher tercatat'}
                </p>
                {hasActiveLogFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearLogFilters}
                    className="mt-4"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset Filter
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <Card key={log.id} className="border-border/50 hover:border-border/80 transition-colors">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      {/* Action badge */}
                      <div className="shrink-0 mt-0.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-2 py-0.5 ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700 border-gray-200'}`}
                        >
                          {ACTION_ICONS[log.action] || '📋'} {ACTION_LABELS[log.action] || log.action}
                        </Badge>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-charcoal leading-relaxed">
                          {log.details || log.action}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(log.createdAt)}
                            <span className="text-muted-foreground/50">({formatDate(log.createdAt)})</span>
                          </span>
                          {log.adminName && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {log.adminName}
                            </span>
                          )}
                          {log.ipAddress && (
                            <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              {log.ipAddress}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {logTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={logsPage === 0}
                onClick={() => setLogsPage(Math.max(0, logsPage - 1))}
                className="text-xs"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Sebelumnya
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, logTotalPages) }, (_, i) => {
                  let pageNum: number
                  if (logTotalPages <= 5) {
                    pageNum = i
                  } else if (logsPage < 2) {
                    pageNum = i
                  } else if (logsPage > logTotalPages - 3) {
                    pageNum = logTotalPages - 5 + i
                  } else {
                    pageNum = logsPage - 2 + i
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setLogsPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                        pageNum === logsPage
                          ? 'bg-charcoal text-gold'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  )
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={logsPage >= logTotalPages - 1}
                onClick={() => setLogsPage(Math.min(logTotalPages - 1, logsPage + 1))}
                className="text-xs"
              >
                Selanjutnya
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          DIALOGS
         ═══════════════════════════════════════════════════════════════════════ */}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2">
              <Plus className="w-5 h-5 text-gold" />
              Tambah Usher Baru
            </DialogTitle>
            <DialogDescription>
              Buat akun usher baru untuk scan tiket dan mengelola penonton
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Username *</Label>
              <Input
                placeholder="contoh: usher1"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>Nama Lengkap</Label>
              <Input
                placeholder="contoh: Budi Santoso"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <div className="relative">
                <Input
                  type={showFormPassword ? 'text' : 'password'}
                  placeholder="Minimal 4 karakter"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowFormPassword(!showFormPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showFormPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Batal</Button>
            <Button
              onClick={handleCreate}
              disabled={isSubmitting || !formUsername.trim() || !formPassword.trim()}
              className="bg-charcoal hover:bg-charcoal/90 text-gold"
            >
              {isSubmitting ? 'Menyimpan...' : 'Buat Usher'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2">
              <Pencil className="w-5 h-5 text-gold" />
              Edit Usher: {editingUsher?.name || editingUsher?.username}
            </DialogTitle>
            <DialogDescription>
              Ubah informasi akun usher
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nama Lengkap</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Password Baru (kosongkan jika tidak ingin mengubah)</Label>
              <div className="relative">
                <Input
                  type={showEditPassword ? 'text' : 'password'}
                  placeholder="Password baru"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="text-sm font-medium">Status Akun</p>
                <p className="text-xs text-muted-foreground">
                  {editIsActive ? 'Usher dapat login dan melakukan tugas' : 'Usher tidak dapat login'}
                </p>
              </div>
              <Button
                variant={editIsActive ? 'default' : 'destructive'}
                size="sm"
                onClick={() => setEditIsActive(!editIsActive)}
              >
                {editIsActive ? (
                  <><Power className="w-4 h-4 mr-1" /> Aktif</>
                ) : (
                  <><PowerOff className="w-4 h-4 mr-1" /> Nonaktif</>
                )}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Batal</Button>
            <Button
              onClick={handleUpdate}
              disabled={isSubmitting}
              className="bg-charcoal hover:bg-charcoal/90 text-gold"
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Hapus Usher
            </DialogTitle>
            <DialogDescription>
              Tindakan ini tidak dapat dibatalkan
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Apakah Anda yakin ingin menghapus akun usher{' '}
              <strong className="text-charcoal">&quot;{deletingUsher?.name || deletingUsher?.username}&quot;</strong>?
              Semua data aktivitas terkait juga akan dihapus.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Batal</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Menghapus...' : 'Ya, Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
