'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Lock,
  Save,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  Plus,
  Minus,
  GripVertical,
  Trash2,
  Edit3,
  Square,
  Rows3,
  Columns3,
  DoorOpen,
  Move,
  Maximize2,
  Palette,
  Users,
  ChevronDown,
  ChevronRight,
  Clock,
  X,
  AlertTriangle,
  Sparkles,
  Copy,
  Shapes,
} from 'lucide-react'
import { StageRenderer, ObjectsOverlay, type StageType } from '@/lib/stage-renderer'

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

interface LayoutObject {
  id: string
  type: 'FOH' | 'ENTRANCE' | 'CUSTOM_SHAPE'
  label: string
  r: number
  c: number
  w: number
  h: number
  color: string
}

interface CanvasEditorProps {
  seatMapId: string
  seatType: 'NUMBERED' | 'GENERAL_ADMISSION'
  initialLayoutData: any
  initialStageType?: string
  adminId: string
  adminName: string
  onSaveAndExit: (layoutData: any, stageType: string) => void
}

interface SeatPosition {
  r: number
  c: number
}

interface Section {
  name: string
  fromRow: number
  toRow: number
  colorCode: string
}

interface Zone {
  id: string
  name: string
  r: number
  c: number
  w: number
  h: number
  capacity: number
  colorCode: string
}

interface GridSize {
  rows: number
  cols: number
}

interface NumberedLayout {
  type: 'NUMBERED'
  gridSize: GridSize
  aisleColumns: number[]
  rowLabels: string[]
  seats: SeatPosition[]
  sections: Section[]
  embeddedRows?: Record<string, number>
  objects?: LayoutObject[]
}

interface GALayout {
  type: 'GENERAL_ADMISSION'
  gridSize: GridSize
  zones: Zone[]
  objects?: LayoutObject[]
}

type LayoutData = NumberedLayout | GALayout

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════

const MAX_HISTORY = 20
const AUTOSAVE_INTERVAL = 60000 // 1 minute
const CELL_SIZE = 28 // px per grid cell
const MIN_GRID = 1
const MAX_GRID = 30

const DEFAULT_COLORS = [
  '#C8A951', '#8B8680', '#7BA7A5', '#A08635',
  '#8B6BAE', '#C75050', '#4A7C59', '#D4843E',
  '#5B8DBE', '#D4A574',
]

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function seatKey(r: number, c: number) {
  return `${r},${c}`
}

function generateId() {
  return 'z' + Math.random().toString(36).substring(2, 8)
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

function getDefaultLayout(type: 'NUMBERED' | 'GENERAL_ADMISSION'): LayoutData {
  if (type === 'NUMBERED') {
    return {
      type: 'NUMBERED',
      gridSize: { rows: 8, cols: 10 },
      aisleColumns: [],
      rowLabels: Array.from({ length: 8 }, (_, i) => String.fromCharCode(65 + i)),
      seats: [],
      sections: [],
    }
  }
  return {
    type: 'GENERAL_ADMISSION',
    gridSize: { rows: 12, cols: 16 },
    zones: [],
  }
}

/**
 * Defensive normalizer: ensures all required array/object properties exist
 * with safe defaults so that .length, .includes(), .reduce(), [index] etc.
 * never throw on undefined/null.
 */
function normalizeLayoutData(raw: any, fallbackType: 'NUMBERED' | 'GENERAL_ADMISSION'): LayoutData {
  if (!raw || typeof raw !== 'object') {
    return getDefaultLayout(fallbackType)
  }

  const type = raw.type === 'GENERAL_ADMISSION' ? 'GENERAL_ADMISSION' as const : 'NUMBERED' as const
  const gridSize = (raw.gridSize && typeof raw.gridSize === 'object')
    ? { rows: Number(raw.gridSize.rows) || 1, cols: Number(raw.gridSize.cols) || 1 }
    : { rows: 8, cols: 10 }

  if (type === 'NUMBERED') {
    const seats = Array.isArray(raw.seats) ? raw.seats : []
    const aisleColumns = Array.isArray(raw.aisleColumns) ? raw.aisleColumns : []
    const rowLabels = Array.isArray(raw.rowLabels) ? raw.rowLabels : []
    const sections = Array.isArray(raw.sections) ? raw.sections : []
    const embeddedRows = (raw.embeddedRows && typeof raw.embeddedRows === 'object')
      ? raw.embeddedRows
      : undefined

    // Extend rowLabels if shorter than grid rows
    while (rowLabels.length < gridSize.rows) {
      rowLabels.push(String.fromCharCode(65 + (rowLabels.length % 26)))
    }

    return {
      type: 'NUMBERED',
      gridSize,
      seats,
      aisleColumns,
      rowLabels,
      sections,
      embeddedRows,
    }
  }

  const zones = Array.isArray(raw.zones) ? raw.zones : []
  return {
    type: 'GENERAL_ADMISSION',
    gridSize,
    zones,
  }
}

// ═══════════════════════════════════════════
// Section-level error boundary for debugging
// ═══════════════════════════════════════════

class SectionBoundary extends React.Component<
  { children: React.ReactNode; name: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; name: string }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[SectionBoundary:${this.props.name}]`, error.message, info.componentStack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 12 }}>
          <strong>Error ({this.props.name}):</strong> {this.state.error?.message}
        </div>
      )
    }
    return this.props.children
  }
}

// ═══════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════

export function CanvasEditor({
  seatMapId,
  seatType,
  initialLayoutData,
  initialStageType,
  adminId,
  adminName,
  onSaveAndExit,
}: CanvasEditorProps) {
  // Debug: log what we receive
  console.log('[CanvasEditor] initialLayoutData:', initialLayoutData ? JSON.stringify(initialLayoutData).slice(0, 200) : 'null')
  console.log('[CanvasEditor] seatType:', seatType)
  console.log('[CanvasEditor] initialStageType:', initialStageType)

  // ─── State ─────────────────────────────
  const [stageType, setStageType] = useState<StageType>((initialStageType as StageType) || 'PROSCENIUM')
  const [layoutData, setLayoutData] = useState<LayoutData>(() => {
    try {
      if (initialLayoutData && typeof initialLayoutData === 'object') {
        const normalized = normalizeLayoutData(deepClone(initialLayoutData), seatType)
        console.log('[CanvasEditor] Normalized OK, type:', normalized.type)
        return normalized
      }
    } catch (err) {
      console.error('[CanvasEditor] Failed to normalize initialLayoutData:', err)
    }
    return getDefaultLayout(seatType)
  })

  // Render error state for granular error catching
  const [renderError, setRenderError] = useState<string | null>(null)

  // NOTE: We do NOT re-normalize on initialLayoutData change anymore.
  // The parent already provides normalized data on mount. Re-normalizing on
  // every prop change causes double-rendering which triggers the .length crash.
  // Instead, we use a key={seatMapId} on the parent to force fresh mount.

  // Objects state
  const [objects, setObjects] = useState<LayoutObject[]>(() => {
    try {
      if (initialLayoutData?.objects && Array.isArray(initialLayoutData.objects)) {
        return initialLayoutData.objects as LayoutObject[]
      }
    } catch { /* ignore */ }
    return []
  })
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)

  const [isPreview, setIsPreview] = useState(false)
  const [aisleMode, setAisleMode] = useState(false)
  const [autoSaveTime, setAutoSaveTime] = useState<Date | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)

  // Section editing state (NUMBERED)
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false)
  const [editingSection, setEditingSection] = useState<Section | null>(null)
  const [sectionForm, setSectionForm] = useState({ name: '', fromRow: 0, toRow: 0, colorCode: '#C8A951' })

  // Object editing state
  const [objectDialogOpen, setObjectDialogOpen] = useState(false)
  const [editingObject, setEditingObject] = useState<LayoutObject | null>(null)
  const [objectForm, setObjectForm] = useState({ label: '', type: 'CUSTOM_SHAPE' as LayoutObject['type'], r: 0, c: 0, w: 2, h: 1, color: '#6B7280' })

  // Zone editing state (GA)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [isDraggingZone, setIsDraggingZone] = useState(false)
  const [isCreatingZone, setIsCreatingZone] = useState(false)
  const [isResizingZone, setIsResizingZone] = useState(false)
  const [zoneDragStart, setZoneDragStart] = useState<{ x: number; y: number } | null>(null)
  const [zoneCreateStart, setZoneCreateStart] = useState<{ r: number; c: number } | null>(null)
  const [zoneResizeHandle, setZoneResizeHandle] = useState<string | null>(null)

  // Refs for GA zone state — needed because mousedown/mouseup can fire
  // in rapid succession before React commits state updates. Using refs
  // ensures mouseup always reads the latest values set by mousedown.
  const isCreatingZoneRef = useRef(false)
  const zoneCreateStartRef = useRef<{ r: number; c: number } | null>(null)
  const isDraggingZoneRef = useRef(false)
  const zoneDragStartRef = useRef<{ x: number; y: number } | null>(null)
  const isResizingZoneRef = useRef(false)
  const zoneResizeHandleRef = useRef<string | null>(null)
  const selectedZoneIdRef = useRef<string | null>(null)

  // ─── Refs ──────────────────────────────
  const historyRef = useRef<LayoutData[]>([])
  const historyIndexRef = useRef(-1)
  const isUndoRedoRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragModeRef = useRef<'add' | 'remove'>('add')
  const currentCellRef = useRef<{ r: number; c: number } | null>(null)

  // ─── Computed ──────────────────────────
  // Defensive: layoutData should always be a valid LayoutData after normalization,
  // but add an extra guard in case of unexpected state.
  const safeLayoutData: LayoutData = useMemo(() => {
    try {
      if (layoutData && typeof layoutData === 'object' && layoutData.type) {
        return layoutData as LayoutData
      }
    } catch (e) {
      console.error('[CanvasEditor] safeLayoutData error:', e)
    }
    return getDefaultLayout(seatType)
  }, [layoutData, seatType])

  const isNumbered = safeLayoutData.type === 'NUMBERED'
  const gridSize = useMemo(() => {
    try {
      if (safeLayoutData.gridSize && typeof safeLayoutData.gridSize === 'object') {
        return {
          rows: Math.max(1, Math.min(MAX_GRID, Number(safeLayoutData.gridSize.rows) || 1)),
          cols: Math.max(1, Math.min(MAX_GRID, Number(safeLayoutData.gridSize.cols) || 1)),
        }
      }
    } catch (e) {
      console.error('[CanvasEditor] gridSize error:', e)
    }
    return { rows: 8, cols: 10 }
  }, [safeLayoutData])

  // Seat lookup set for fast checks (NUMBERED mode)
  const seatSet = useMemo(() => {
    if (safeLayoutData.type !== 'NUMBERED') return new Set<string>()
    const seats = Array.isArray(safeLayoutData.seats) ? safeLayoutData.seats : []
    const set = new Set<string>()
    for (const s of seats) {
      set.add(seatKey(s.r, s.c))
    }
    return set
  }, [safeLayoutData])

  // Section color lookup (NUMBERED mode)
  const sectionColorMap = useMemo(() => {
    if (safeLayoutData.type !== 'NUMBERED') return new Map<number, string>()
    const sections = Array.isArray(safeLayoutData.sections) ? safeLayoutData.sections : []
    const map = new Map<number, string>()
    for (const sec of sections) {
      for (let r = sec.fromRow; r <= sec.toRow; r++) {
        map.set(r, sec.colorCode)
      }
    }
    return map
  }, [safeLayoutData])

  // Seat count
  const totalSeats = useMemo(() => {
    if (safeLayoutData.type === 'NUMBERED') {
      return (Array.isArray(safeLayoutData.seats) ? safeLayoutData.seats : []).length
    }
    return (Array.isArray(safeLayoutData.zones) ? safeLayoutData.zones : []).reduce((sum, z) => sum + (z?.capacity || 0), 0)
  }, [safeLayoutData])

  // Selected zone
  const selectedZone = useMemo(() => {
    if (safeLayoutData.type !== 'GENERAL_ADMISSION') return null
    const zones = Array.isArray(safeLayoutData.zones) ? safeLayoutData.zones : []
    return zones.find((z) => z.id === selectedZoneId) || null
  }, [safeLayoutData, selectedZoneId])

  // ─── Object CRUD ─────────────────────
  const addObject = useCallback((type: LayoutObject['type']) => {
    const defaults: Partial<LayoutObject> = {
      FOH: { label: 'FOH', color: '#E5C07B', w: 4, h: 1 },
      ENTRANCE: { label: 'Pintu Masuk', color: '#61AFEF', w: 1, h: 2 },
      CUSTOM_SHAPE: { label: 'Objek Baru', color: '#6B7280', w: 2, h: 2 },
    }[type]

    const newObject: LayoutObject = {
      id: generateId(),
      type,
      label: defaults?.label || 'Objek',
      r: 0,
      c: 0,
      w: defaults?.w || 2,
      h: defaults?.h || 1,
      color: defaults?.color || '#6B7280',
    }
    setObjects((prev) => [...prev, newObject])
    setSelectedObjectId(newObject.id)
  }, [])

  const updateObject = useCallback((id: string, updates: Partial<LayoutObject>) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)))
  }, [])

  const deleteObject = useCallback((id: string) => {
    setObjects((prev) => prev.filter((o) => o.id !== id))
    if (selectedObjectId === id) setSelectedObjectId(null)
  }, [selectedObjectId])

  const openEditObjectDialog = useCallback((obj: LayoutObject) => {
    setEditingObject(obj)
    setObjectForm({ label: obj.label, type: obj.type, r: obj.r, c: obj.c, w: obj.w, h: obj.h, color: obj.color })
    setObjectDialogOpen(true)
  }, [])

  const handleSaveObject = useCallback(() => {
    if (!editingObject) return
    updateObject(editingObject.id, {
      label: objectForm.label,
      type: objectForm.type,
      r: objectForm.r,
      c: objectForm.c,
      w: objectForm.w,
      h: objectForm.h,
      color: objectForm.color,
    })
    setObjectDialogOpen(false)
  }, [editingObject, objectForm, updateObject])

  const selectedObject = useMemo(() => {
    return objects.find((o) => o.id === selectedObjectId) || null
  }, [objects, selectedObjectId])

  // ─── History (Undo/Redo) ───────────────
  const pushHistory = useCallback((newData: LayoutData) => {
    if (isUndoRedoRef.current) return
    const history = historyRef.current
    const idx = historyIndexRef.current

    // Discard redo states
    if (idx < history.length - 1) {
      historyRef.current = history.slice(0, idx + 1)
    }

    historyRef.current.push(deepClone(newData))
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift()
    } else {
      historyIndexRef.current = historyRef.current.length - 1
    }
  }, [])

  const undo = useCallback(() => {
    const idx = historyIndexRef.current
    if (idx <= 0) return
    isUndoRedoRef.current = true
    historyIndexRef.current = idx - 1
    setLayoutData(deepClone(historyRef.current[idx - 1]))
    setTimeout(() => {
      isUndoRedoRef.current = false
    }, 0)
  }, [])

  const redo = useCallback(() => {
    const idx = historyIndexRef.current
    if (idx >= historyRef.current.length - 1) return
    isUndoRedoRef.current = true
    historyIndexRef.current = idx + 1
    setLayoutData(deepClone(historyRef.current[idx + 1]))
    setTimeout(() => {
      isUndoRedoRef.current = false
    }, 0)
  }, [])

  const canUndo = historyIndexRef.current > 0
  const canRedo = historyIndexRef.current < historyRef.current.length - 1

  // Push initial state
  const hasInitializedRef = useRef(false)
  useEffect(() => {
    if (hasInitializedRef.current) return
    hasInitializedRef.current = true
    pushHistory(layoutData)
  }, [layoutData, pushHistory])

  // ─── Keyboard Shortcuts ────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  // ─── Auto-Save ─────────────────────────
  const performAutoSave = useCallback(async () => {
    setIsAutoSaving(true)
    try {
      const res = await fetch(`/api/admin/seat-maps/${seatMapId}/autosave`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutData, adminId }),
      })
      if (res.ok) {
        setAutoSaveTime(new Date())
      }
    } catch {
      // Silently fail
    } finally {
      setIsAutoSaving(false)
    }
  }, [seatMapId, layoutData])

  // Auto-save timer
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      performAutoSave()
    }, AUTOSAVE_INTERVAL)

    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current)
    }
  }, [performAutoSave])

  // Reset auto-save timer on changes
  const resetAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current)
    }
    autoSaveTimerRef.current = setInterval(() => {
      performAutoSave()
    }, AUTOSAVE_INTERVAL)
  }, [performAutoSave])

  // ─── Release Lock on Unmount ───────────
  useEffect(() => {
    return () => {
      fetch(`/api/admin/seat-maps/${seatMapId}/lock`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId }),
      }).catch(() => {})
    }
  }, [seatMapId, adminId])

  // ═════════════════════════════════════════
  // NUMBERED Mode Handlers
  // ═════════════════════════════════════════

  const updateLayout = useCallback(
    (updater: (prev: LayoutData) => LayoutData) => {
      setLayoutData((prev) => {
        const next = updater(prev)
        pushHistory(next)
        resetAutoSaveTimer()
        return next
      })
    },
    [pushHistory, resetAutoSaveTimer]
  )

  // Toggle seat
  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (isPreview || aisleMode) return
      if (layoutData.type !== 'NUMBERED') return
      const aisleCols = Array.isArray(layoutData.aisleColumns) ? layoutData.aisleColumns : []
      if (aisleCols.includes(c)) return

      const key = seatKey(r, c)

      updateLayout((prev) => {
        if (prev.type !== 'NUMBERED') return prev
        const has = prev.seats.some((s) => seatKey(s.r, s.c) === key)
        return {
          ...prev,
          seats: has
            ? prev.seats.filter((s) => seatKey(s.r, s.c) !== key)
            : [...prev.seats, { r, c }],
        }
      })
    },
    [isPreview, aisleMode, layoutData.type, layoutData.type === 'NUMBERED' ? (layoutData as NumberedLayout).aisleColumns : [], updateLayout]
  )

  // Mouse drag for adding/removing seats
  const handleCellMouseDown = useCallback(
    (r: number, c: number) => {
      if (isPreview || aisleMode || layoutData.type !== 'NUMBERED') return
      const aisleCols = Array.isArray(layoutData.aisleColumns) ? layoutData.aisleColumns : []
      if (aisleCols.includes(c)) return

      const key = seatKey(r, c)
      dragModeRef.current = seatSet.has(key) ? 'remove' : 'add'
      isDraggingRef.current = true

      updateLayout((prev) => {
        if (prev.type !== 'NUMBERED') return prev
        const has = prev.seats.some((s) => seatKey(s.r, s.c) === key)
        return {
          ...prev,
          seats: has
            ? prev.seats.filter((s) => seatKey(s.r, s.c) !== key)
            : [...prev.seats, { r, c }],
        }
      })
    },
    [isPreview, aisleMode, layoutData.type, layoutData.type === 'NUMBERED' ? (layoutData as NumberedLayout).aisleColumns : [], seatSet, updateLayout]
  )

  const handleCellMouseEnter = useCallback(
    (r: number, c: number) => {
      if (!isDraggingRef.current || layoutData.type !== 'NUMBERED') return
      const aisleCols = Array.isArray(layoutData.aisleColumns) ? layoutData.aisleColumns : []
      if (aisleCols.includes(c)) return

      const key = seatKey(r, c)
      if (dragModeRef.current === 'add' && !seatSet.has(key)) {
        updateLayout((prev) => {
          if (prev.type !== 'NUMBERED') return prev
          return { ...prev, seats: [...prev.seats, { r, c }] }
        })
      } else if (dragModeRef.current === 'remove' && seatSet.has(key)) {
        updateLayout((prev) => {
          if (prev.type !== 'NUMBERED') return prev
          return {
            ...prev,
            seats: prev.seats.filter((s) => seatKey(s.r, s.c) !== key),
          }
        })
      }
    },
    [layoutData.type, layoutData.type === 'NUMBERED' ? (layoutData as NumberedLayout).aisleColumns : [], seatSet, updateLayout]
  )

  // Toggle aisle column
  const handleToggleAisle = useCallback(
    (c: number) => {
      if (!aisleMode || layoutData.type !== 'NUMBERED') return
      updateLayout((prev) => {
        if (prev.type !== 'NUMBERED') return prev
        const has = prev.aisleColumns.includes(c)
        return {
          ...prev,
          aisleColumns: has
            ? prev.aisleColumns.filter((ac) => ac !== c)
            : [...prev.aisleColumns, c],
          seats: has
            ? prev.seats
            : prev.seats.filter((s) => s.c !== c),
        }
      })
    },
    [aisleMode, layoutData.type, updateLayout]
  )

  // Grid resize
  const handleResizeGrid = useCallback(
    (dimension: 'rows' | 'cols', delta: number) => {
      updateLayout((prev) => {
        const current = prev.gridSize[dimension]
        const next = Math.max(MIN_GRID, Math.min(MAX_GRID, current + delta))
        if (next === current) return prev

        const newGridSize = { ...prev.gridSize, [dimension]: next }

        if (prev.type === 'NUMBERED') {
          // Remove out-of-bounds seats
          const filteredSeats = prev.seats.filter(
            (s) => s.r < next && s.c < newGridSize.cols
          )
          // Remove out-of-bounds aisles
          const filteredAisles = prev.aisleColumns.filter(
            (ac) => ac < next
          )
          // Trim row labels
          const rowLabels =
            dimension === 'rows'
              ? prev.rowLabels.slice(0, next)
              : prev.rowLabels

          // Extend row labels if growing
          while (rowLabels.length < next) {
            rowLabels.push(
              String.fromCharCode(65 + (rowLabels.length % 26))
            )
          }

          return {
            ...prev,
            gridSize: newGridSize,
            seats: filteredSeats,
            aisleColumns: filteredAisles,
            rowLabels,
          }
        }

        return { ...prev, gridSize: newGridSize }
      })
    },
    [updateLayout]
  )

  // ─── Section CRUD ──────────────────────
  const openNewSectionDialog = useCallback(() => {
    setEditingSection(null)
    setSectionForm({ name: '', fromRow: 0, toRow: Math.min(2, gridSize.rows - 1), colorCode: DEFAULT_COLORS[0] })
    setSectionDialogOpen(true)
  }, [gridSize.rows])

  const openEditSectionDialog = useCallback(
    (section: Section, index: number) => {
      setEditingSection({ ...section, _index: index } as any)
      setSectionForm({
        name: section.name,
        fromRow: section.fromRow,
        toRow: section.toRow,
        colorCode: section.colorCode,
      })
      setSectionDialogOpen(true)
    },
    []
  )

  const handleSaveSection = useCallback(() => {
    if (!sectionForm.name.trim()) return

    updateLayout((prev) => {
      if (prev.type !== 'NUMBERED') return prev
      const newSection: Section = {
        name: sectionForm.name.trim(),
        fromRow: sectionForm.fromRow,
        toRow: sectionForm.toRow,
        colorCode: sectionForm.colorCode,
      }

      if (editingSection && (editingSection as any)._index !== undefined) {
        const idx = (editingSection as any)._index
        const newSections = [...prev.sections]
        newSections[idx] = newSection
        return { ...prev, sections: newSections }
      }

      return { ...prev, sections: [...prev.sections, newSection] }
    })

    setSectionDialogOpen(false)
  }, [sectionForm, editingSection, updateLayout])

  const handleDeleteSection = useCallback(
    (index: number) => {
      updateLayout((prev) => {
        if (prev.type !== 'NUMBERED') return prev
        return {
          ...prev,
          sections: prev.sections.filter((_, i) => i !== index),
        }
      })
    },
    [updateLayout]
  )

  // ═════════════════════════════════════════
  // GENERAL_ADMISSION Mode Handlers
  // ═════════════════════════════════════════

  // Get grid cell from mouse position
  const getCellFromEvent = useCallback(
    (e: React.MouseEvent): { r: number; c: number } | null => {
      const container = gridContainerRef.current
      if (!container) return null
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const c = Math.floor(x / CELL_SIZE)
      const r = Math.floor(y / CELL_SIZE)
      if (r < 0 || r >= gridSize.rows || c < 0 || c >= gridSize.cols) return null
      return { r, c }
    },
    [gridSize]
  )

  // Grid mouse down for GA mode
  const handleGridMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isPreview || layoutData.type !== 'GENERAL_ADMISSION') return

      const cell = getCellFromEvent(e)
      if (!cell) return

      // Check if clicking a zone resize handle
      if (selectedZoneId) {
        const zone = layoutData.zones.find((z) => z.id === selectedZoneId)
        if (zone) {
          const handle = getZoneResizeHandle(e, zone)
          if (handle) {
            setIsResizingZone(true)
            isResizingZoneRef.current = true
            setZoneResizeHandle(handle)
            zoneResizeHandleRef.current = handle
            setZoneDragStart({ x: e.clientX, y: e.clientY })
            zoneDragStartRef.current = { x: e.clientX, y: e.clientY }
            return
          }
        }
      }

      // Check if clicking inside a zone (for dragging)
      const clickedZone = layoutData.zones.find(
        (z) => cell.r >= z.r && cell.r < z.r + z.h && cell.c >= z.c && cell.c < z.c + z.w
      )
      if (clickedZone) {
        setSelectedZoneId(clickedZone.id)
        selectedZoneIdRef.current = clickedZone.id
        setIsDraggingZone(true)
        isDraggingZoneRef.current = true
        setZoneDragStart({ x: e.clientX, y: e.clientY })
        zoneDragStartRef.current = { x: e.clientX, y: e.clientY }
        return
      }

      // Start creating a new zone
      setSelectedZoneId(null)
      selectedZoneIdRef.current = null
      setIsCreatingZone(true)
      isCreatingZoneRef.current = true
      setZoneCreateStart(cell)
      zoneCreateStartRef.current = cell
    },
    [isPreview, layoutData, selectedZoneId, getCellFromEvent]
  )

  const handleGridMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (layoutData.type !== 'GENERAL_ADMISSION') return

      // Track current cell for zone creation preview
      const cell = getCellFromEvent(e)
      if (cell) {
        currentCellRef.current = cell
      }

      // Use refs for reading GA drag state to avoid stale closure issues
      const _isDraggingZone = isDraggingZoneRef.current
      const _selectedZoneId = selectedZoneIdRef.current
      const _zoneDragStart = zoneDragStartRef.current
      const _isResizingZone = isResizingZoneRef.current
      const _zoneResizeHandle = zoneResizeHandleRef.current

      if (_isDraggingZone && _selectedZoneId && _zoneDragStart) {
        const dx = Math.round((e.clientX - _zoneDragStart.x) / CELL_SIZE)
        const dy = Math.round((e.clientY - _zoneDragStart.y) / CELL_SIZE)

        updateLayout((prev) => {
          if (prev.type !== 'GENERAL_ADMISSION') return prev
          return {
            ...prev,
            zones: prev.zones.map((z) =>
              z.id === _selectedZoneId
                ? {
                    ...z,
                    r: Math.max(0, Math.min(gridSize.rows - z.h, z.r + dy)),
                    c: Math.max(0, Math.min(gridSize.cols - z.w, z.c + dx)),
                  }
                : z
            ),
          }
        })

        setZoneDragStart({ x: e.clientX, y: e.clientY })
        zoneDragStartRef.current = { x: e.clientX, y: e.clientY }
      }

      if (_isResizingZone && _selectedZoneId && _zoneDragStart && _zoneResizeHandle) {
        const dx = Math.round((e.clientX - _zoneDragStart.x) / CELL_SIZE)
        const dy = Math.round((e.clientY - _zoneDragStart.y) / CELL_SIZE)

        updateLayout((prev) => {
          if (prev.type !== 'GENERAL_ADMISSION') return prev
          return {
            ...prev,
            zones: prev.zones.map((z) => {
              if (z.id !== _selectedZoneId) return z
              let { r, c, w, h } = z

              if (_zoneResizeHandle.includes('e')) w = Math.max(1, Math.min(gridSize.cols - c, w + dx))
              if (_zoneResizeHandle.includes('w')) {
                const newC = Math.max(0, Math.min(c + dx, c + w - 1))
                w = w + (c - newC)
                c = newC
              }
              if (_zoneResizeHandle.includes('s')) h = Math.max(1, Math.min(gridSize.rows - r, h + dy))
              if (_zoneResizeHandle.includes('n')) {
                const newR = Math.max(0, Math.min(r + dy, r + h - 1))
                h = h + (r - newR)
                r = newR
              }

              return { ...z, r, c, w, h }
            }),
          }
        })

        setZoneDragStart({ x: e.clientX, y: e.clientY })
        zoneDragStartRef.current = { x: e.clientX, y: e.clientY }
      }
    },
    [
      layoutData.type,
      isDraggingZone,
      selectedZoneId,
      zoneDragStart,
      isResizingZone,
      zoneResizeHandle,
      gridSize,
      updateLayout,
      getCellFromEvent,
    ]
  )

  // Zone create finalize
  const createZoneFromDrag = useCallback(
    (endCell: { r: number; c: number }) => {
      // Use ref to avoid stale closure
      const start = zoneCreateStartRef.current
      if (!start) return
      const r = Math.min(start.r, endCell.r)
      const c = Math.min(start.c, endCell.c)
      const w = Math.abs(endCell.c - start.c) + 1
      const h = Math.abs(endCell.r - start.r) + 1

      if (w < 1 || h < 1) return

      const newZone: Zone = {
        id: generateId(),
        name: 'Zone Baru',
        r,
        c,
        w,
        h,
        capacity: w * h,
        colorCode: DEFAULT_COLORS[(layoutData.type === 'GENERAL_ADMISSION' ? (layoutData as GALayout).zones : []).length % DEFAULT_COLORS.length],
      }

      updateLayout((prev) => {
        if (prev.type !== 'GENERAL_ADMISSION') return prev
        return { ...prev, zones: [...prev.zones, newZone] }
      })

      setSelectedZoneId(newZone.id)
      selectedZoneIdRef.current = newZone.id
      setIsCreatingZone(false)
      isCreatingZoneRef.current = false
      setZoneCreateStart(null)
      zoneCreateStartRef.current = null
    },
    [layoutData, updateLayout]
  )

  const handleGridMouseUp = useCallback((e: React.MouseEvent) => {
    // Use refs to avoid stale closure — mousedown & mouseup can fire
    // in the same browser tick before React commits state updates.
    if (isCreatingZoneRef.current && zoneCreateStartRef.current) {
      const cell = getCellFromEvent(e)
      if (cell) {
        createZoneFromDrag(cell)
      } else if (currentCellRef.current) {
        createZoneFromDrag(currentCellRef.current)
      }
    }
    setIsDraggingZone(false)
    isDraggingZoneRef.current = false
    setIsResizingZone(false)
    isResizingZoneRef.current = false
    setIsCreatingZone(false)
    isCreatingZoneRef.current = false
    setZoneDragStart(null)
    zoneDragStartRef.current = null
    setZoneCreateStart(null)
    zoneCreateStartRef.current = null
    setZoneResizeHandle(null)
    zoneResizeHandleRef.current = null
    currentCellRef.current = null
  }, [getCellFromEvent, createZoneFromDrag])

  const handleGridMouseLeave = useCallback(() => {
    setIsDraggingZone(false)
    isDraggingZoneRef.current = false
    setIsResizingZone(false)
    isResizingZoneRef.current = false
    setIsCreatingZone(false)
    isCreatingZoneRef.current = false
    setZoneDragStart(null)
    zoneDragStartRef.current = null
    setZoneCreateStart(null)
    zoneCreateStartRef.current = null
    setZoneResizeHandle(null)
    zoneResizeHandleRef.current = null
    isDraggingRef.current = false
    currentCellRef.current = null
  }, [])

  // Handle grid cell click in GA mode (for creating zones via drag)
  const handleGACellClick = useCallback(
    (r: number, c: number) => {
      if (isPreview || layoutData.type !== 'GENERAL_ADMISSION') return

      if (isCreatingZone && zoneCreateStart) {
        createZoneFromDrag({ r, c })
        return
      }

      // Check if clicking a zone
      const clickedZone = layoutData.zones.find(
        (z) => r >= z.r && r < z.r + z.h && c >= z.c && c < z.c + z.w
      )
      setSelectedZoneId(clickedZone ? clickedZone.id : null)
    },
    [isPreview, layoutData, isCreatingZone, zoneCreateStart, createZoneFromDrag]
  )

  // Update zone properties
  const updateZoneProperty = useCallback(
    (zoneId: string, updates: Partial<Zone>) => {
      updateLayout((prev) => {
        if (prev.type !== 'GENERAL_ADMISSION') return prev
        return {
          ...prev,
          zones: prev.zones.map((z) =>
            z.id === zoneId ? { ...z, ...updates } : z
          ),
        }
      })
    },
    [updateLayout]
  )

  const deleteZone = useCallback(
    (zoneId: string) => {
      updateLayout((prev) => {
        if (prev.type !== 'GENERAL_ADMISSION') return prev
        return {
          ...prev,
          zones: prev.zones.filter((z) => z.id !== zoneId),
        }
      })
      if (selectedZoneId === zoneId) setSelectedZoneId(null)
    },
    [updateLayout, selectedZoneId]
  )

  // Detect resize handle hit
  const getZoneResizeHandle = useCallback(
    (e: React.MouseEvent, zone: Zone): string | null => {
      const container = gridContainerRef.current
      if (!container) return null
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const left = zone.c * CELL_SIZE
      const top = zone.r * CELL_SIZE
      const right = (zone.c + zone.w) * CELL_SIZE
      const bottom = (zone.r + zone.h) * CELL_SIZE
      const handleSize = 8

      const nearLeft = Math.abs(x - left) < handleSize
      const nearRight = Math.abs(x - right) < handleSize
      const nearTop = Math.abs(y - top) < handleSize
      const nearBottom = Math.abs(y - bottom) < handleSize

      if (nearTop && nearLeft) return 'nw'
      if (nearTop && nearRight) return 'ne'
      if (nearBottom && nearLeft) return 'sw'
      if (nearBottom && nearRight) return 'se'
      if (nearTop) return 'n'
      if (nearBottom) return 's'
      if (nearLeft) return 'w'
      if (nearRight) return 'e'

      return null
    },
    []
  )

  // Global mouseup listener — also handles GA zone creation cleanup
  // when mouse is released outside the grid container
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false
      // Reset all GA zone interaction state
      if (isCreatingZoneRef.current) {
        isCreatingZoneRef.current = false
        zoneCreateStartRef.current = null
        setIsCreatingZone(false)
        setZoneCreateStart(null)
      }
      if (isDraggingZoneRef.current) {
        isDraggingZoneRef.current = false
        zoneDragStartRef.current = null
        setIsDraggingZone(false)
        setZoneDragStart(null)
      }
      if (isResizingZoneRef.current) {
        isResizingZoneRef.current = false
        zoneDragStartRef.current = null
        zoneResizeHandleRef.current = null
        setIsResizingZone(false)
        setZoneDragStart(null)
        setZoneResizeHandle(null)
      }
      currentCellRef.current = null
    }
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])

  // ═════════════════════════════════════════
  // Layout Data getter
  // ═════════════════════════════════════════

  const getExportLayoutData = useCallback(() => {
    const data = deepClone(layoutData)
    return { ...data, objects: deepClone(objects), stageType }
  }, [layoutData, objects, stageType])

  // ═════════════════════════════════════════
  // Render helpers
  // ═════════════════════════════════════════

  const renderStageBar = () => (
    <StageRenderer stageType={stageType} size="sm" />
  )

  // ─── NUMBERED Grid Render ──────────────
  const renderNumberedGrid = () => {
    try {
      if (safeLayoutData.type !== 'NUMBERED') return null

      // Defensive: ensure arrays exist
      const aisleColumns = Array.isArray(safeLayoutData.aisleColumns) ? safeLayoutData.aisleColumns : []
      const rowLabels = Array.isArray(safeLayoutData.rowLabels) ? safeLayoutData.rowLabels : []
      const sections = Array.isArray(safeLayoutData.sections) ? safeLayoutData.sections : []

      const { rows, cols } = gridSize

      // Build row/col arrays safely
      const rowIndices = Array.from({ length: rows }, (_, i) => i)
      const colIndices = Array.from({ length: cols }, (_, i) => i)

    return (
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {rowIndices.map((r) => (
            <div key={r} className="flex items-center gap-0.5 mb-0.5">
              {/* Row label */}
              <div className="w-6 text-center text-[10px] font-semibold font-serif text-muted-foreground shrink-0">
                {rowLabels[r] || String.fromCharCode(65 + (r % 26))}
              </div>

              {/* Cells */}
              <div className="flex">
                {colIndices.map((c) => {
                  const isAisle = aisleColumns.includes(c)
                  const hasSeat = seatSet.has(seatKey(r, c))
                  const sectionColor = sectionColorMap.get(r)
                  const key = seatKey(r, c)

                  if (isAisle) {
                    return (
                      <div
                        key={key}
                        className={cn(
                          'shrink-0 flex items-center justify-center',
                          aisleMode && 'cursor-pointer'
                        )}
                        style={{ width: CELL_SIZE + 2, height: CELL_SIZE + 2 }}
                        onClick={() => handleToggleAisle(c)}
                      >
                        {aisleMode ? (
                          <div className="w-full h-full border border-dashed border-gold/40 rounded-sm bg-gold/5 flex items-center justify-center">
                            <Minus className="w-3 h-3 text-gold/60" />
                          </div>
                        ) : (
                          <div
                            className="w-full h-px bg-border/50"
                            style={{ width: CELL_SIZE }}
                          />
                        )}
                      </div>
                    )
                  }

                  return (
                    <button
                      key={key}
                      onMouseDown={(e) => {
                        // Only handle left-click (button 0) to prevent
                        // interference with right-click / context menu
                        if (e.button === 0) handleCellMouseDown(r, c)
                      }}
                      onMouseEnter={() => handleCellMouseEnter(r, c)}
                      className={cn(
                        'shrink-0 rounded-[4px] flex items-center justify-center transition-all duration-100 select-none',
                        hasSeat
                          ? 'border-2'
                          : aisleMode
                            ? 'cursor-pointer hover:bg-gold/10 border border-dashed border-border/30 rounded-[4px]'
                            : 'cursor-pointer hover:bg-border/30',
                        isPreview && 'pointer-events-none',
                        !isPreview && hasSeat && 'hover:scale-105'
                      )}
                      style={{
                        width: CELL_SIZE + 2,
                        height: CELL_SIZE + 2,
                        backgroundColor: hasSeat ? (sectionColor || '#ffffff') : 'transparent',
                        borderColor: hasSeat ? (sectionColor || '#C8A951') : 'transparent',
                      }}
                      title={
                        hasSeat
                          ? `${rowLabels[r]}${c + 1} (klik untuk hapus)`
                          : aisleMode
                            ? `Kolom ${c + 1} (klik untuk jadikan lorong)`
                            : `Klik untuk tambah kursi`
                      }
                    >
                      {hasSeat && (
                        <span
                          className="text-[8px] font-medium leading-none"
                          style={{ color: sectionColor ? '#ffffff' : '#1A1A2E' }}
                        >
                          {c + 1}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Row label right */}
              <div className="w-6 text-center text-[10px] font-semibold font-serif text-muted-foreground shrink-0">
                {rowLabels[r] || String.fromCharCode(65 + (r % 26))}
              </div>
            </div>
          ))}

          {/* Column numbers for aisle mode */}
          {aisleMode && (
            <div className="flex items-center gap-0.5 mt-1">
              <div className="w-6 shrink-0" />
              <div className="flex">
                {colIndices.map((c) => (
                  <div
                    key={c}
                    className="shrink-0 flex items-center justify-center text-[8px] text-muted-foreground/60"
                    style={{ width: CELL_SIZE + 2 }}
                  >
                    {c + 1}
                  </div>
                ))}
              </div>
              <div className="w-6 shrink-0" />
            </div>
          )}
        </div>
      </div>
    )
    } catch (err) {
      console.error('[CanvasEditor] renderNumberedGrid error:', err)
      setRenderError(`renderNumberedGrid: ${err instanceof Error ? err.message : String(err)}`)
      return <div className="text-center text-red-500 py-8">Error rendering grid: {err instanceof Error ? err.message : String(err)}</div>
    }
  }

  // ─── GA Grid Render ────────────────────
  const renderGAGrid = () => {
    try {
      if (safeLayoutData.type !== 'GENERAL_ADMISSION') return null
      const { rows, cols } = gridSize
      const gaZones = Array.isArray(safeLayoutData.zones) ? safeLayoutData.zones : []

    return (
      <div
        ref={gridContainerRef}
        className="relative select-none rounded-lg border-2 border-dashed border-gold/20 bg-gold/[0.02] cursor-crosshair"
        style={{
          width: cols * CELL_SIZE,
          height: rows * CELL_SIZE,
          minWidth: cols * CELL_SIZE,
          minHeight: rows * CELL_SIZE,
        }}
        onMouseDown={handleGridMouseDown}
        onMouseMove={handleGridMouseMove}
        onMouseUp={handleGridMouseUp}
        onMouseLeave={handleGridMouseLeave}
      >
        {/* Background grid — pointer-events-none to let clicks pass through */}
        <div
          className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(200,169,81,0.08) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(200,169,81,0.08) 1px, transparent 1px)
            `,
            backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
          }}
        />

        {/* Zones */}
        {gaZones.map((zone) => {
          const isSelected = zone.id === selectedZoneId
          return (
            <div
              key={zone.id}
              className={cn(
                'absolute rounded-md border-2 flex flex-col items-center justify-center gap-1 transition-shadow duration-150',
                isSelected
                  ? 'shadow-lg ring-2 ring-gold/30'
                  : 'shadow-sm hover:shadow-md',
                isPreview && 'pointer-events-none'
              )}
              style={{
                left: zone.c * CELL_SIZE,
                top: zone.r * CELL_SIZE,
                width: zone.w * CELL_SIZE,
                height: zone.h * CELL_SIZE,
                backgroundColor: zone.colorCode + '25',
                borderColor: isSelected ? zone.colorCode : zone.colorCode + '80',
                cursor: isPreview ? 'default' : isDraggingZone && isSelected ? 'grabbing' : 'grab',
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (!isPreview) setSelectedZoneId(zone.id)
              }}
            >
              <span
                className="text-[9px] font-bold leading-tight text-center px-1 truncate w-full"
                style={{ color: zone.colorCode }}
              >
                {zone.name}
              </span>
              <span className="text-[8px] text-muted-foreground">
                {zone.capacity} kursi
              </span>

              {/* Resize handles (when selected) */}
              {isSelected && !isPreview && (
                <>
                  {/* Corner handles */}
                  {(['nw', 'ne', 'sw', 'se'] as const).map((pos) => (
                    <div
                      key={pos}
                      className={cn(
                        'absolute w-2 h-2 rounded-full border-2 bg-white',
                        pos === 'nw' && 'top-[-4px] left-[-4px] cursor-nw-resize',
                        pos === 'ne' && 'top-[-4px] right-[-4px] cursor-ne-resize',
                        pos === 'sw' && 'bottom-[-4px] left-[-4px] cursor-sw-resize',
                        pos === 'se' && 'bottom-[-4px] right-[-4px] cursor-se-resize'
                      )}
                      style={{ borderColor: zone.colorCode }}
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        setIsResizingZone(true)
                        setZoneResizeHandle(pos)
                        setZoneDragStart({ x: e.clientX, y: e.clientY })
                      }}
                    />
                  ))}
                  {/* Edge handles */}
                  {(['n', 's', 'e', 'w'] as const).map((pos) => (
                    <div
                      key={pos}
                      className={cn(
                        'absolute bg-white border-2',
                        pos === 'n' && 'top-[-3px] left-1/2 -translate-x-1/2 w-6 h-1.5 cursor-n-resize rounded-sm',
                        pos === 's' && 'bottom-[-3px] left-1/2 -translate-x-1/2 w-6 h-1.5 cursor-s-resize rounded-sm',
                        pos === 'e' && 'right-[-3px] top-1/2 -translate-y-1/2 h-6 w-1.5 cursor-e-resize rounded-sm',
                        pos === 'w' && 'left-[-3px] top-1/2 -translate-y-1/2 h-6 w-1.5 cursor-w-resize rounded-sm'
                      )}
                      style={{ borderColor: zone.colorCode }}
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        setIsResizingZone(true)
                        setZoneResizeHandle(pos)
                        setZoneDragStart({ x: e.clientX, y: e.clientY })
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          )
        })}

        {/* Creating zone preview */}
        {isCreatingZone && zoneCreateStart && currentCellRef.current && (
          <div
            className="absolute border-2 border-dashed border-gold/60 rounded-md bg-gold/10 pointer-events-none"
            style={{
              left: Math.min(zoneCreateStart.c, currentCellRef.current.c) * CELL_SIZE,
              top: Math.min(zoneCreateStart.r, currentCellRef.current.r) * CELL_SIZE,
              width: (Math.abs(currentCellRef.current.c - zoneCreateStart.c) + 1) * CELL_SIZE,
              height: (Math.abs(currentCellRef.current.r - zoneCreateStart.r) + 1) * CELL_SIZE,
            }}
          />
        )}
      </div>
    )
    } catch (err) {
      console.error('[CanvasEditor] renderGAGrid error:', err)
      setRenderError(`renderGAGrid: ${err instanceof Error ? err.message : String(err)}`)
      return <div className="text-center text-red-500 py-8">Error rendering GA grid: {err instanceof Error ? err.message : String(err)}</div>
    }
  }

  // ═════════════════════════════════════════
  // Main Render
  // ═════════════════════════════════════════

  console.log('[CanvasEditor] Render - type:', safeLayoutData?.type, 'gridSize:', JSON.stringify(gridSize))

  if (renderError) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="max-w-lg p-6 bg-red-50 border border-red-200 rounded-xl text-center">
          <p className="font-semibold text-red-800 mb-2">Render Error</p>
          <pre className="text-xs text-left bg-white p-4 rounded-lg overflow-auto max-h-60 border border-red-100">
            {renderError}
          </pre>
          <button
            className="mt-4 px-4 py-2 bg-red-100 text-red-800 rounded-lg text-sm"
            onClick={() => setRenderError(null)}
          >
            Coba Lagi
          </button>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <SectionBoundary name="MainLayout">
      <div className="flex flex-col lg:flex-row h-full min-h-[600px] bg-warm-white rounded-xl border border-border/50 shadow-sm overflow-hidden">
        {/* ═══════ SIDEBAR ═══════ */}
        <div className="w-full lg:w-72 xl:w-80 bg-charcoal text-warm-white flex-shrink-0 flex flex-col">
          {/* Sidebar Header */}
          <div className="px-4 py-4 border-b border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-base font-semibold text-gold flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                {isNumbered ? 'Seat Editor' : 'Zone Editor'}
              </h2>
              <Badge
                variant="outline"
                className="text-[10px] border-gold/30 text-gold bg-gold/10"
              >
                {seatType === 'NUMBERED' ? 'Numbered' : 'General Admission'}
              </Badge>
            </div>

            {/* Lock + Auto-save */}
            <div className="flex items-center gap-2 text-[11px] text-warm-white/50">
              <Lock className="w-3 h-3" />
              <span>Dikunci oleh {adminName}</span>
            </div>
            {autoSaveTime && (
              <div className="flex items-center gap-1.5 text-[10px] text-gold/60 mt-1">
                <Clock className="w-3 h-3" />
                <span>Autosave {formatTime(autoSaveTime)}</span>
                {isAutoSaving && (
                  <span className="inline-block w-2 h-2 rounded-full bg-gold animate-pulse" />
                )}
              </div>
            )}
          </div>

          {/* Sidebar Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* ─── Undo/Redo ─── */}
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={undo}
                    disabled={!canUndo}
                    className="h-8 w-8 p-0 text-warm-white/70 hover:text-gold hover:bg-white/10"
                  >
                    <Undo2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Undo (Ctrl+Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={redo}
                    disabled={!canRedo}
                    className="h-8 w-8 p-0 text-warm-white/70 hover:text-gold hover:bg-white/10"
                  >
                    <Redo2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Redo (Ctrl+Y)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPreview(!isPreview)}
                    className={cn(
                      'h-8 w-8 p-0',
                      isPreview
                        ? 'text-gold bg-gold/15'
                        : 'text-warm-white/70 hover:text-gold hover:bg-white/10'
                    )}
                  >
                    {isPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {isPreview ? 'Exit Preview' : 'Preview Mode'}
                </TooltipContent>
              </Tooltip>
            </div>

            <Separator className="bg-white/10" />

            {/* ─── Seat Count ─── */}
            <div className="bg-white/5 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-warm-white/40 mb-1">
                {seatType === 'NUMBERED' ? 'Total Kursi' : 'Total Kapasitas'}
              </div>
              <div className="text-2xl font-serif font-bold text-gold">
                {totalSeats}
              </div>
              <div className="text-[10px] text-warm-white/40 mt-0.5">
                {seatType === 'NUMBERED'
                  ? `${gridSize.rows} baris × ${gridSize.cols} kolom`
                  : `${(safeLayoutData.type === 'GENERAL_ADMISSION' ? safeLayoutData.zones : []).length} zona`}
              </div>
            </div>

            {/* ─── Grid Controls ─── */}
            <div className="space-y-3">
              <h3 className="text-[11px] uppercase tracking-wider text-warm-white/40 font-medium">
                Grid Size
              </h3>

              {/* Rows */}
              <div className="flex items-center gap-2">
                <Rows3 className="w-3.5 h-3.5 text-warm-white/40" />
                <span className="text-xs text-warm-white/70 w-10">Baris</span>
                <div className="flex items-center gap-1 ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResizeGrid('rows', -1)}
                    disabled={gridSize.rows <= MIN_GRID}
                    className="h-6 w-6 p-0 text-warm-white/60 hover:text-gold hover:bg-white/10"
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-6 text-center text-xs font-mono text-gold">
                    {gridSize.rows}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResizeGrid('rows', 1)}
                    disabled={gridSize.rows >= MAX_GRID}
                    className="h-6 w-6 p-0 text-warm-white/60 hover:text-gold hover:bg-white/10"
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Cols */}
              <div className="flex items-center gap-2">
                <Columns3 className="w-3.5 h-3.5 text-warm-white/40" />
                <span className="text-xs text-warm-white/70 w-10">Kolom</span>
                <div className="flex items-center gap-1 ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResizeGrid('cols', -1)}
                    disabled={gridSize.cols <= MIN_GRID}
                    className="h-6 w-6 p-0 text-warm-white/60 hover:text-gold hover:bg-white/10"
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-6 text-center text-xs font-mono text-gold">
                    {gridSize.cols}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResizeGrid('cols', 1)}
                    disabled={gridSize.cols >= MAX_GRID}
                    className="h-6 w-6 p-0 text-warm-white/60 hover:text-gold hover:bg-white/10"
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>

            <Separator className="bg-white/10" />

            {/* ─── Stage Type Selector ─── */}
            <div className="space-y-3">
              <h3 className="text-[11px] uppercase tracking-wider text-warm-white/40 font-medium">
                Tipe Panggung
              </h3>
              <Select value={stageType} onValueChange={(v) => setStageType(v as StageType)}>
                <SelectTrigger className="h-8 text-xs bg-white/10 border-white/10 text-warm-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-charcoal border-white/10">
                  <SelectItem value="PROSCENIUM" className="text-xs text-warm-white">Proscenium</SelectItem>
                  <SelectItem value="AMPHITHEATER" className="text-xs text-warm-white">Amphitheater</SelectItem>
                  <SelectItem value="THRUST" className="text-xs text-warm-white">Thrust</SelectItem>
                  <SelectItem value="BLACK_BOX" className="text-xs text-warm-white">Black Box</SelectItem>
                  <SelectItem value="ARENA" className="text-xs text-warm-white">Arena</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex justify-center">
                <div className="scale-[0.45] origin-top">
                  <StageRenderer stageType={stageType} size="sm" />
                </div>
              </div>
            </div>

            <Separator className="bg-white/10" />

            {/* ─── NUMBERED: Aisle + Sections ─── */}
            {isNumbered && (
              <>
                {/* Aisle Mode */}
                <div className="space-y-2">
                  <h3 className="text-[11px] uppercase tracking-wider text-warm-white/40 font-medium">
                    Lorong (Aisle)
                  </h3>
                  <Button
                    variant={aisleMode ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setAisleMode(!aisleMode)}
                    className={cn(
                      'w-full justify-start gap-2 text-xs h-8',
                      aisleMode
                        ? 'bg-gold/15 text-gold border border-gold/30 hover:bg-gold/20'
                        : 'text-warm-white/60 hover:text-gold hover:bg-white/10'
                    )}
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                    {aisleMode ? 'Mode Lorong Aktif' : 'Toggle Lorong'}
                  </Button>
                  {aisleMode && (
                    <p className="text-[10px] text-gold/60 px-1">
                      Klik kolom untuk toggle lorong. Kursi di lorong akan otomatis dihapus.
                    </p>
                  )}
                  {(Array.isArray(safeLayoutData.aisleColumns) && safeLayoutData.aisleColumns.length > 0) && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {safeLayoutData.aisleColumns.map((c) => (
                        <Badge
                          key={c}
                          variant="outline"
                          className="text-[9px] border-gold/30 text-gold/80 bg-gold/5 h-5 px-1.5"
                        >
                          Kol {c + 1}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <Separator className="bg-white/10" />

                {/* Sections */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] uppercase tracking-wider text-warm-white/40 font-medium">
                      Seksion
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={openNewSectionDialog}
                      className="h-6 w-6 p-0 text-warm-white/60 hover:text-gold hover:bg-white/10"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {(Array.isArray(safeLayoutData.sections) && safeLayoutData.sections.length === 0) ? (
                    <p className="text-[10px] text-warm-white/30 px-1">
                      Belum ada seksion. Tambahkan untuk mengelompokkan baris.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {(safeLayoutData.sections || []).map((sec, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
                        >
                          <div
                            className="w-4 h-4 rounded-sm shrink-0"
                            style={{ backgroundColor: sec.colorCode }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-warm-white/80 truncate">
                              {sec.name}
                            </div>
                            <div className="text-[9px] text-warm-white/40">
                              Baris {sec.fromRow + 1}–{sec.toRow + 1}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditSectionDialog(sec, idx)}
                              className="h-5 w-5 p-0 text-warm-white/40 hover:text-gold"
                            >
                              <Edit3 className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteSection(idx)}
                              className="h-5 w-5 p-0 text-warm-white/40 hover:text-danger"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ─── GA: Zones List ─── */}
            {!isNumbered && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] uppercase tracking-wider text-warm-white/40 font-medium">
                    Zona
                  </h3>
                  <span className="text-[10px] text-gold/60">
                    Klik & drag untuk buat zona baru
                  </span>
                </div>

                {(Array.isArray(safeLayoutData.zones) && safeLayoutData.zones.length === 0) ? (
                  <div className="text-center py-6 bg-white/5 rounded-lg">
                    <Square className="w-8 h-8 text-warm-white/20 mx-auto mb-2" />
                    <p className="text-[10px] text-warm-white/30">
                      Klik dan drag pada grid untuk membuat zona pertama
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {(safeLayoutData.zones || []).map((zone) => (
                      <div
                        key={zone.id}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer group',
                          zone.id === selectedZoneId
                            ? 'bg-gold/15 border border-gold/30'
                            : 'bg-white/5 hover:bg-white/10 border border-transparent'
                        )}
                        onClick={() => {
                          setSelectedZoneId(zone.id)
                          selectedZoneIdRef.current = zone.id
                        }}
                      >
                        <div
                          className="w-4 h-4 rounded-sm shrink-0"
                          style={{ backgroundColor: zone.colorCode }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-warm-white/80 truncate">
                            {zone.name}
                          </div>
                          <div className="text-[9px] text-warm-white/40">
                            {zone.w}×{zone.h} · {zone.capacity} kursi
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteZone(zone.id)
                            }}
                            className="h-5 w-5 p-0 text-warm-white/40 hover:text-danger"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─── Objects Panel ─── */}
            <>
              <Separator className="bg-white/10" />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] uppercase tracking-wider text-warm-white/40 font-medium flex items-center gap-1.5">
                    <Shapes className="w-3 h-3" />
                    Objek
                  </h3>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addObject('FOH')}
                      className="h-5 px-1.5 text-[9px] text-warm-white/60 hover:text-gold hover:bg-white/10"
                    >
                      FOH
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addObject('ENTRANCE')}
                      className="h-5 px-1.5 text-[9px] text-warm-white/60 hover:text-gold hover:bg-white/10"
                    >
                      Pintu
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addObject('CUSTOM_SHAPE')}
                      className="h-5 px-1.5 text-[9px] text-warm-white/60 hover:text-gold hover:bg-white/10"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                </div>

                {objects.length === 0 ? (
                  <p className="text-[10px] text-warm-white/30 px-1">
                    Belum ada objek. Tambahkan FOH, pintu, atau bentuk kustom.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {objects.map((obj) => (
                      <div
                        key={obj.id}
                        className={cn(
                          'flex items-center gap-2 p-1.5 rounded-lg transition-colors cursor-pointer group',
                          obj.id === selectedObjectId
                            ? 'bg-white/10 border border-white/20'
                            : 'bg-white/5 hover:bg-white/8 border border-transparent'
                        )}
                        onClick={() => setSelectedObjectId(obj.id)}
                      >
                        <div className="w-3 h-3 rounded-sm shrink-0 border" style={{ backgroundColor: obj.color + '60', borderColor: obj.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-medium text-warm-white/80 truncate">
                            {obj.type === 'ENTRANCE' ? '🚪 ' : ''}{obj.label}
                          </div>
                          <div className="text-[8px] text-warm-white/40">
                            {obj.w}×{obj.h} @ ({obj.r},{obj.c})
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); openEditObjectDialog(obj) }}
                            className="h-4 w-4 p-0 text-warm-white/40 hover:text-gold"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); deleteObject(obj.id) }}
                            className="h-4 w-4 p-0 text-warm-white/40 hover:text-danger"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Object Properties */}
              {selectedObject && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10">
                    <div className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: selectedObject.color + '60', border: `1px solid ${selectedObject.color}` }} />
                    <span className="text-[10px] font-medium text-warm-white/80 flex-1 truncate">
                      {selectedObject.type === 'ENTRANCE' ? '🚪 ' : ''}{selectedObject.label}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditObjectDialog(selectedObject)}
                      className="h-5 w-5 p-0 text-warm-white/60 hover:text-gold"
                    >
                      <Edit3 className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteObject(selectedObject.id)}
                      className="h-5 w-5 p-0 text-warm-white/60 hover:text-danger"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <div>
                      <label className="text-[10px] text-warm-white/50 block mb-0.5">Nama</label>
                      <Input
                        value={selectedObject.label}
                        onChange={(e) => updateObject(selectedObject.id, { label: e.target.value })}
                        className="h-6 text-[10px] bg-white/10 border-white/10 text-warm-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] text-warm-white/50 block mb-0.5">Baris</label>
                        <Input
                          type="number" value={selectedObject.r} min={0}
                          onChange={(e) => updateObject(selectedObject.id, { r: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="h-6 text-[10px] bg-white/10 border-white/10 text-warm-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-warm-white/50 block mb-0.5">Kolom</label>
                        <Input
                          type="number" value={selectedObject.c} min={0}
                          onChange={(e) => updateObject(selectedObject.id, { c: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="h-6 text-[10px] bg-white/10 border-white/10 text-warm-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-warm-white/50 block mb-0.5">Lebar</label>
                        <Input
                          type="number" value={selectedObject.w} min={1}
                          onChange={(e) => updateObject(selectedObject.id, { w: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="h-6 text-[10px] bg-white/10 border-white/10 text-warm-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-warm-white/50 block mb-0.5">Tinggi</label>
                        <Input
                          type="number" value={selectedObject.h} min={1}
                          onChange={(e) => updateObject(selectedObject.id, { h: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="h-6 text-[10px] bg-white/10 border-white/10 text-warm-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-warm-white/50 block mb-0.5">Warna</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="color" value={selectedObject.color}
                          onChange={(e) => updateObject(selectedObject.id, { color: e.target.value })}
                          className="h-6 w-8 p-0.5 bg-white/10 border-white/10 cursor-pointer"
                        />
                        <span className="text-[9px] text-warm-white/40 font-mono">{selectedObject.color}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>

            {/* ─── GA: Zone Properties Panel ─── */}
            {!isNumbered && selectedZone && (
              <>
                <Separator className="bg-white/10" />
                <div className="space-y-3">
                  <h3 className="text-[11px] uppercase tracking-wider text-warm-white/40 font-medium flex items-center gap-1.5">
                    <Palette className="w-3 h-3" />
                    Properti Zona
                  </h3>

                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-warm-white/50 block mb-1">
                        Nama Zona
                      </label>
                      <Input
                        value={selectedZone.name}
                        onChange={(e) =>
                          updateZoneProperty(selectedZone.id, { name: e.target.value })
                        }
                        className="h-7 text-xs bg-white/10 border-white/10 text-warm-white placeholder:text-warm-white/30"
                        placeholder="Nama zona"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-warm-white/50 block mb-1">
                        Kapasitas
                      </label>
                      <Input
                        type="number"
                        value={selectedZone.capacity}
                        onChange={(e) =>
                          updateZoneProperty(selectedZone.id, {
                            capacity: Math.max(0, parseInt(e.target.value) || 0),
                          })
                        }
                        className="h-7 text-xs bg-white/10 border-white/10 text-warm-white"
                        min={0}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-warm-white/50 block mb-1">
                        Warna
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {DEFAULT_COLORS.map((color) => (
                          <button
                            key={color}
                            className={cn(
                              'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
                              selectedZone.colorCode === color
                                ? 'border-white scale-110'
                                : 'border-transparent'
                            )}
                            style={{ backgroundColor: color }}
                            onClick={() =>
                              updateZoneProperty(selectedZone.id, { colorCode: color })
                            }
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-warm-white/50 block mb-1">
                        Ukuran
                      </label>
                      <div className="flex items-center gap-2 text-[10px] text-warm-white/60">
                        <span>Pos: ({selectedZone.r}, {selectedZone.c})</span>
                        <span>·</span>
                        <span>Ukuran: {selectedZone.w}×{selectedZone.h}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ─── Preview Mode Info ─── */}
            {isPreview && (
              <div className="bg-gold/10 border border-gold/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-gold font-medium">
                  <Eye className="w-3.5 h-3.5" />
                  Preview Mode
                </div>
                <p className="text-[10px] text-gold/70">
                  Ini adalah tampilan yang akan dilihat pengunjung. Kembali ke mode edit untuk melanjutkan.
                </p>
              </div>
            )}
          </div>

          {/* Sidebar Footer - Sticky */}
          <div className="p-4 border-t border-white/10 space-y-2 bg-charcoal sticky bottom-0 z-10">
            {isAutoSaving && (
              <div className="flex items-center gap-1.5 text-[10px] text-gold/60">
                <span className="inline-block w-2 h-2 rounded-full bg-gold animate-pulse" />
                Menyimpan...
              </div>
            )}
            <Button
              onClick={() => {
                onSaveAndExit(getExportLayoutData(), stageType)
              }}
              className="w-full bg-gold hover:bg-gold-dark text-charcoal font-medium gap-2 h-9 text-sm"
            >
              <Save className="w-4 h-4" />
              Simpan & Keluar
            </Button>
          </div>
        </div>

        {/* ═══════ MAIN CANVAS ═══════ */}
        <div className="flex-1 overflow-auto bg-warm-white">
          <div className="p-4 sm:p-6 lg:p-8">
            {/* Canvas header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="font-serif text-lg sm:text-xl font-bold text-charcoal">
                  {isPreview ? 'Preview Seat Map' : 'Seat Map Builder'}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isPreview
                    ? 'Tampilan pengunjung (read-only)'
                    : isNumbered
                      ? 'Klik untuk tambah/hapus kursi. Drag untuk pilihan banyak.'
                      : 'Klik & drag pada grid untuk membuat zona.'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-[10px] border-border text-muted-foreground"
                >
                  <Users className="w-3 h-3 mr-1" />
                  {totalSeats} {seatType === 'NUMBERED' ? 'kursi' : 'kapasitas'}
                </Badge>
                {isPreview && (
                  <Badge className="bg-gold/15 text-gold-dark border-gold/30 text-[10px]">
                    <Eye className="w-3 h-3 mr-1" />
                    Preview
                  </Badge>
                )}
              </div>
            </div>

            {/* Canvas area */}
            <Card
              className={cn(
                'border-border/40 shadow-sm',
                isPreview ? 'bg-cream' : 'bg-white'
              )}
            >
              <div className="p-4 sm:p-6">
                {renderStageBar()}

                {/* Grid container */}
                <div
                  className="overflow-auto max-h-[60vh] rounded-lg p-4"
                  style={{
                    backgroundColor: isPreview ? 'transparent' : '#faf9f6',
                    backgroundImage: isPreview
                      ? undefined
                      : 'radial-gradient(circle, rgba(200,169,81,0.03) 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                  }}
                >
                  <div className="flex justify-center">
                    <SectionBoundary name="GridRender">
                    {isNumbered ? renderNumberedGrid() : renderGAGrid()}
                    </SectionBoundary>
                  </div>
                </div>

                {/* Legend (NUMBERED mode) */}
                {isNumbered && Array.isArray(safeLayoutData.sections) && safeLayoutData.sections.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
                    {safeLayoutData.sections.map((sec, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <div
                          className="w-4 h-4 rounded-sm border-2"
                          style={{
                            backgroundColor: sec.colorCode,
                            borderColor: sec.colorCode,
                          }}
                        />
                        <span className="text-muted-foreground">{sec.name}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-sm border-2 border-border/40 bg-white" />
                      <span className="text-muted-foreground">Tanpa Seksion</span>
                    </div>
                  </div>
                )}

                {/* Legend (Preview / GA mode) */}
                {isPreview && !isNumbered && Array.isArray(safeLayoutData.zones) && safeLayoutData.zones.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
                    {safeLayoutData.zones.map((zone) => (
                      <div key={zone.id} className="flex items-center gap-1.5">
                        <div
                          className="w-4 h-4 rounded-sm border-2"
                          style={{
                            backgroundColor: zone.colorCode + '40',
                            borderColor: zone.colorCode,
                          }}
                        />
                        <span className="text-muted-foreground">
                          {zone.name} ({zone.capacity})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Preview mode notice */}
            {isPreview && (
              <div className="mt-4 text-center">
                <p className="text-[10px] text-muted-foreground/50">
                  Ini adalah preview. Kembali ke mode edit untuk melanjutkan mengubah seat map.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      </SectionBoundary>

      {/* ═══════ OBJECT EDIT DIALOG ═══════ */}
      <Dialog open={objectDialogOpen} onOpenChange={setObjectDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base font-serif">Edit Objek</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nama</Label>
              <Input value={objectForm.label} onChange={(e) => setObjectForm((p) => ({ ...p, label: e.target.value }))} className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <Label className="text-[10px]">Baris</Label>
                <Input type="number" value={objectForm.r} min={0} onChange={(e) => setObjectForm((p) => ({ ...p, r: Math.max(0, parseInt(e.target.value) || 0) }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px]">Kolom</Label>
                <Input type="number" value={objectForm.c} min={0} onChange={(e) => setObjectForm((p) => ({ ...p, c: Math.max(0, parseInt(e.target.value) || 0) }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px]">Lebar</Label>
                <Input type="number" value={objectForm.w} min={1} onChange={(e) => setObjectForm((p) => ({ ...p, w: Math.max(1, parseInt(e.target.value) || 1) }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px]">Tinggi</Label>
                <Input type="number" value={objectForm.h} min={1} onChange={(e) => setObjectForm((p) => ({ ...p, h: Math.max(1, parseInt(e.target.value) || 1) }))} className="h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Warna</Label>
              <Input type="color" value={objectForm.color} onChange={(e) => setObjectForm((p) => ({ ...p, color: e.target.value }))} className="h-9 w-16 p-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setObjectDialogOpen(false)}>Batal</Button>
            <Button size="sm" onClick={handleSaveObject} className="bg-charcoal hover:bg-charcoal/90 text-gold">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ SECTION EDIT DIALOG ═══════ */}
      <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
        <DialogContent className="sm:max-w-[400px] p-0 gap-0 overflow-hidden border-border/50">
          <div className="bg-gradient-to-br from-charcoal to-charcoal/95 px-5 pt-5 pb-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent" />
            <div className="relative">
              <DialogHeader className="space-y-2">
                <DialogTitle className="text-base font-serif text-warm-white">
                  {editingSection ? 'Edit Seksion' : 'Tambah Seksion'}
                </DialogTitle>
              </DialogHeader>
            </div>
          </div>

          <div className="p-5 bg-warm-white space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-charcoal">Nama Seksion</Label>
              <Input
                value={sectionForm.name}
                onChange={(e) =>
                  setSectionForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="contoh: VIP, Regular, Student..."
                className="h-9 text-sm bg-white border-border/60"
              />
            </div>

            {/* Row range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-charcoal">Baris Awal</Label>
                <Input
                  type="number"
                  value={sectionForm.fromRow + 1}
                  onChange={(e) =>
                    setSectionForm((prev) => ({
                      ...prev,
                      fromRow: Math.max(0, parseInt(e.target.value) - 1 || 0),
                    }))
                  }
                  min={1}
                  max={gridSize.rows}
                  className="h-9 text-sm bg-white border-border/60"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-charcoal">Baris Akhir</Label>
                <Input
                  type="number"
                  value={sectionForm.toRow + 1}
                  onChange={(e) =>
                    setSectionForm((prev) => ({
                      ...prev,
                      toRow: Math.min(gridSize.rows - 1, parseInt(e.target.value) - 1 || 0),
                    }))
                  }
                  min={1}
                  max={gridSize.rows}
                  className="h-9 text-sm bg-white border-border/60"
                />
              </div>
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-charcoal">Warna</Label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'w-7 h-7 rounded-full border-2 transition-transform hover:scale-110',
                      sectionForm.colorCode === color
                        ? 'border-charcoal scale-110 ring-2 ring-offset-2 ring-gold/30'
                        : 'border-transparent hover:border-charcoal/20'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() =>
                      setSectionForm((prev) => ({ ...prev, colorCode: color }))
                    }
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            {sectionForm.name && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <div
                  className="w-5 h-5 rounded-sm"
                  style={{ backgroundColor: sectionForm.colorCode }}
                />
                <span className="text-xs text-charcoal font-medium">
                  {sectionForm.name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Baris {sectionForm.fromRow + 1}–{sectionForm.toRow + 1}
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="px-5 pb-5 pt-2 bg-warm-white gap-2">
            <Button
              variant="ghost"
              onClick={() => setSectionDialogOpen(false)}
              className="text-muted-foreground"
            >
              Batal
            </Button>
            <Button
              onClick={handleSaveSection}
              disabled={!sectionForm.name.trim()}
              className="bg-charcoal hover:bg-charcoal/90 text-gold text-sm"
            >
              {editingSection ? 'Simpan' : 'Tambah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}


