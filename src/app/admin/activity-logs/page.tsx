'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Activity, Clock, Search, Filter, ChevronLeft, ChevronRight,
  User, Globe, FileText, CalendarDays, RotateCcw,
} from 'lucide-react'

interface ActivityLog {
  id: string
  adminId: string
  adminName: string | null
  action: string
  details: string | null
  ipAddress: string | null
  createdAt: string
}

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
  // Auth
  LOGIN: 'bg-blue-100 text-blue-700 border-blue-200',
  LOGOUT: 'bg-gray-100 text-gray-700 border-gray-200',
  // Tickets & Check-in
  CHECK_IN: 'bg-green-100 text-green-700 border-green-200',
  RESEND_EMAIL: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  CANCEL_TRANSACTION: 'bg-red-100 text-red-700 border-red-200',
  COMPLIMENTARY_TICKET: 'bg-pink-100 text-pink-700 border-pink-200',
  // Account management
  ACCOUNT_CREATED: 'bg-purple-100 text-purple-700 border-purple-200',
  ACCOUNT_UPDATED: 'bg-amber-100 text-amber-700 border-amber-200',
  DELETE_ACCOUNT: 'bg-red-100 text-red-700 border-red-200',
  // Events
  CREATE_EVENT: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  UPDATE_EVENT: 'bg-teal-100 text-teal-700 border-teal-200',
  DELETE_EVENT: 'bg-red-100 text-red-700 border-red-200',
  // Merchandise
  CREATE_MERCHANDISE: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  UPDATE_MERCHANDISE: 'bg-violet-100 text-violet-700 border-violet-200',
  DELETE_MERCHANDISE: 'bg-red-100 text-red-700 border-red-200',
  // Promo
  CREATE_PROMO: 'bg-lime-100 text-lime-700 border-lime-200',
  UPDATE_PROMO: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  DELETE_PROMO: 'bg-red-100 text-red-700 border-red-200',
  // Seats
  GENERATE_SEATS: 'bg-sky-100 text-sky-700 border-sky-200',
  UPDATE_SEATS: 'bg-orange-100 text-orange-700 border-orange-200',
  DELETE_SEATS: 'bg-red-100 text-red-700 border-red-200',
  // Email
  UPDATE_EMAIL_TEMPLATE: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  // Seat Maps
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

// Group actions for filter dropdown
const ACTION_GROUPS = [
  {
    label: 'Autentikasi',
    actions: ['LOGIN', 'LOGOUT'],
  },
  {
    label: 'Tiket & Transaksi',
    actions: ['CHECK_IN', 'COMPLIMENTARY_TICKET', 'RESEND_EMAIL', 'CANCEL_TRANSACTION'],
  },
  {
    label: 'Event',
    actions: ['CREATE_EVENT', 'UPDATE_EVENT', 'DELETE_EVENT'],
  },
  {
    label: 'Merchandise',
    actions: ['CREATE_MERCHANDISE', 'UPDATE_MERCHANDISE', 'DELETE_MERCHANDISE'],
  },
  {
    label: 'Kode Promo',
    actions: ['CREATE_PROMO', 'UPDATE_PROMO', 'DELETE_PROMO'],
  },
  {
    label: 'Kursi & Seat Map',
    actions: ['GENERATE_SEATS', 'UPDATE_SEATS', 'DELETE_SEATS', 'CREATE_SEAT_MAP', 'UPDATE_SEAT_MAP', 'DELETE_SEAT_MAP'],
  },
  {
    label: 'Akun & Lainnya',
    actions: ['ACCOUNT_CREATED', 'ACCOUNT_UPDATED', 'DELETE_ACCOUNT', 'UPDATE_EMAIL_TEMPLATE'],
  },
]

const PAGE_SIZE = 30

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(0)

  // Filters — default: only show usher activity
  const [roleFilter, setRoleFilter] = useState('usher') // 'usher' | 'admin' | ''
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(page * PAGE_SIZE))
      if (roleFilter) params.set('role', roleFilter)
      if (search) params.set('search', search)
      if (actionFilter) params.set('action', actionFilter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const res = await fetch(`/api/admin/activity-logs?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
        setTotal(data.total || 0)
      }
    } catch (err) {
      console.error('Failed to fetch activity logs:', err)
    } finally {
      setIsLoading(false)
    }
  }, [page, search, actionFilter, dateFrom, dateTo, roleFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(0)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const clearFilters = () => {
    setRoleFilter('usher')
    setSearch('')
    setSearchInput('')
    setActionFilter('')
    setDateFrom('')
    setDateTo('')
    setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasActiveFilters = roleFilter !== 'usher' || search || actionFilter || dateFrom || dateTo

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-charcoal flex items-center gap-2">
            <Activity className="w-6 h-6 text-gold" />
            Log Aktivitas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pantau aktivitas usher — scan tiket, OTS, check-in, dan lainnya
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reset Filter
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs"
          >
            <Filter className="w-3.5 h-3.5 mr-1" />
            {showFilters ? 'Sembunyikan' : 'Filter'}
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        {/* Search bar */}
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari aktivitas, nama, detail..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSearch}
            className="px-4"
          >
            Cari
          </Button>
        </div>

        {/* Role tabs */}
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg w-fit">
          <button
            onClick={() => { setRoleFilter('usher'); setPage(0) }}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
              roleFilter === 'usher'
                ? 'bg-charcoal text-gold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`
            }
          >
            Aktivitas Usher
          </button>
          <button
            onClick={() => { setRoleFilter('admin'); setPage(0) }}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
              roleFilter === 'admin'
                ? 'bg-charcoal text-gold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`
            }
          >
            Aktivitas Admin
          </button>
          <button
            onClick={() => { setRoleFilter(''); setPage(0) }}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
              roleFilter === ''
                ? 'bg-charcoal text-gold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`
            }
          >
            Semua
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <Card className="border-border/50">
            <CardContent className="p-4 space-y-4">
              {/* Action type filter */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                  Jenis Aktivitas
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setActionFilter(''); setPage(0) }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      !actionFilter
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
                          onClick={() => { setActionFilter(action === actionFilter ? '' : action); setPage(0) }}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                            actionFilter === action
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
                      value={dateFrom}
                      onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
                      className="w-40 text-xs h-8"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">s/d</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
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
          Total: <strong className="text-charcoal">{total}</strong> log
        </span>
        {hasActiveFilters && (
          <span className="text-gold font-medium">
            (Terfilter)
          </span>
        )}
        {totalPages > 1 && (
          <span>
            Halaman <strong className="text-charcoal">{page + 1}</strong> dari {totalPages}
          </span>
        )}
      </div>

      {/* Log entries */}
      {isLoading ? (
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
              {hasActiveFilters ? 'Tidak ada aktivitas yang cocok dengan filter' : 'Belum ada aktivitas tercatat'}
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
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
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(Math.max(0, page - 1))}
            className="text-xs"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Sebelumnya
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i
              } else if (page < 2) {
                pageNum = i
              } else if (page > totalPages - 3) {
                pageNum = totalPages - 5 + i
              } else {
                pageNum = page - 2 + i
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    pageNum === page
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
            disabled={page >= totalPages - 1}
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            className="text-xs"
          >
            Selanjutnya
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  )
}
