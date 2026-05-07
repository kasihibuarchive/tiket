'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
  MousePointer2,
  Pencil,
  Eraser,
  Save,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  Lock,
  Trash2,
  ChevronDown,
  ChevronRight,
  Settings2,
  Move,
  GripVertical,
  Maximize2,
  LayoutGrid,
  DoorOpen,
  Download,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

export interface PianoRollZone {
  id: string
  name: string
  row: number
  col: number
  rows: number
  cols: number
  color: string
  capacity?: number
  shape?: 'rectangle' | 'rounded-rect' | 'ellipse' | 'polygon'
  points?: { row: number; col: number }[]
}

interface PianoRollObject {
  id: string
  type: string
  label?: string
  row: number
  col: number
  rows: number
  cols: number
}

interface PianoRollStage {
  row: number
  col: number
  rows: number
  cols: number
  stageType: 'PROSCENIUM' | 'AMPHITHEATER' | 'BLACK_BOX' | 'THRUST' | 'ARENA'
}

export interface PianoRollLayoutData {
  type: 'PIANO_ROLL' | 'GENERAL_ADMISSION'
  gridRows: number
  gridCols: number
  cellSize: number
  zones: PianoRollZone[]
  stage: PianoRollStage | null
  objects: PianoRollObject[]
  canvasWidth: number
  canvasHeight: number
  layoutImageUrl?: string
}

interface PianoRollEditorProps {
  seatMapId: string
  initialLayoutData: any
  initialStageType?: string
  adminId: string
  adminName: string
  seatType?: string
  onSaveAndExit: (layoutData: any, stageType?: string) => void
}

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════

const MAX_HISTORY = 30
const AUTOSAVE_INTERVAL = 60000
const DEFAULT_CELL_SIZE = 32
const MIN_CELL_SIZE = 20
const MAX_CELL_SIZE = 48
const MIN_GRID_ROWS = 4
const MAX_GRID_ROWS = 30
const MIN_GRID_COLS = 4
const MAX_GRID_COLS = 40

const ZONE_COLORS = [
  '#C8A951', '#8B8680', '#7BA7A5', '#A08635',
  '#8B6BAE', '#C75050', '#4A7C59', '#D4843E',
  '#5B8DBE', '#D4A574', '#E06C75', '#61AFEF',
  '#98C379', '#E5C07B', '#56B6C2', '#BE5046',
]

const OBJECT_PRESETS = [
  { type: 'door', label: 'Pintu Masuk', emoji: '🚪', rows: 1, cols: 2, color: '#4A7C59' },
  { type: 'exit', label: 'Pintu Keluar', emoji: '🚶', rows: 1, cols: 2, color: '#C75050' },
  { type: 'toilet', label: 'Toilet', emoji: '🚻', rows: 1, cols: 2, color: '#5B8DBE' },
  { type: 'info', label: 'Info', emoji: 'ℹ️', rows: 1, cols: 1, color: '#D4843E' },
  { type: 'food', label: 'F&B', emoji: '🍜', rows: 1, cols: 2, color: '#8B6BAE' },
]

type EditorMode = 'select' | 'draw' | 'erase' | 'object' | 'polygon'
type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | null

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function generateId() {
  return 'z' + Math.random().toString(36).substring(2, 8)
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

function getRowLabel(gridRow: number): string {
  // Convert grid row index to letter(s): 0→A, 25→Z, 26→AA, etc.
  let label = ''
  let n = gridRow
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

function getDefaultLayout(): PianoRollLayoutData {
  return {
    type: 'PIANO_ROLL',
    gridRows: 15,
    gridCols: 25,
    cellSize: DEFAULT_CELL_SIZE,
    zones: [],
    stage: null,
    objects: [],
    canvasWidth: 25 * DEFAULT_CELL_SIZE + 60,
    canvasHeight: 15 * DEFAULT_CELL_SIZE + 60,
  }
}

function normalizeLayoutData(raw: any): PianoRollLayoutData {
  if (!raw || typeof raw !== 'object' || (raw.type !== 'PIANO_ROLL' && raw.type !== 'GENERAL_ADMISSION')) {
    return getDefaultLayout()
  }

  const cellSize = clamp(Number(raw.cellSize) || DEFAULT_CELL_SIZE, MIN_CELL_SIZE, MAX_CELL_SIZE)
  const gridRows = clamp(Number(raw.gridRows) || 15, MIN_GRID_ROWS, MAX_GRID_ROWS)
  const gridCols = clamp(Number(raw.gridCols) || 25, MIN_GRID_COLS, MAX_GRID_COLS)

  return {
    type: raw.type === 'GENERAL_ADMISSION' ? 'GENERAL_ADMISSION' : 'PIANO_ROLL',
    gridRows,
    gridCols,
    cellSize,
    zones: Array.isArray(raw.zones) ? raw.zones.filter((z: any) =>
      z && typeof z.id === 'string' && typeof z.row === 'number' &&
      typeof z.col === 'number' && typeof z.rows === 'number' && typeof z.cols === 'number'
    ) : [],
    stage: (raw.stage && typeof raw.stage.row === 'number') ? { ...raw.stage, rows: raw.stage.rows || 2 } : null,
    objects: Array.isArray(raw.objects) ? raw.objects : [],
    canvasWidth: Number(raw.canvasWidth) || gridCols * cellSize + 60,
    canvasHeight: Number(raw.canvasHeight) || gridRows * cellSize + 60,
    layoutImageUrl: raw.layoutImageUrl || undefined,
  }
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

// ─── Polygon Helpers ─────────────────────
function pointInPolygon(row: number, col: number, polygon: { row: number; col: number }[]): boolean {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].col, yi = polygon[i].row
    const xj = polygon[j].col, yj = polygon[j].row
    if (((yi > row) !== (yj > row)) && (col < (xj - xi) * (row - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

function getPolygonBounds(points: { row: number; col: number }[]): { row: number; col: number; rows: number; cols: number } {
  const minRow = Math.min(...points.map(p => p.row))
  const maxRow = Math.max(...points.map(p => p.row))
  const minCol = Math.min(...points.map(p => p.col))
  const maxCol = Math.max(...points.map(p => p.col))
  return { row: minRow, col: minCol, rows: maxRow - minRow + 1, cols: maxCol - minCol + 1 }
}

function getPolygonCells(points: { row: number; col: number }[]): Set<string> {
  const bounds = getPolygonBounds(points)
  const cells = new Set<string>()
  for (let r = bounds.row; r < bounds.row + bounds.rows; r++) {
    for (let c = bounds.col; c < bounds.col + bounds.cols; c++) {
      if (pointInPolygon(r, c, points)) {
        cells.add(`${r},${c}`)
      }
    }
  }
  return cells
}

// ═══════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════

export function PianoRollEditor({
  seatMapId,
  initialLayoutData,
  initialStageType,
  adminId,
  adminName,
  seatType,
  onSaveAndExit,
}: PianoRollEditorProps) {
  const { toast } = useToast()

  const isGA = seatType === 'GENERAL_ADMISSION'

  // ─── State ─────────────────────────────
  const [layoutData, setLayoutData] = useState<PianoRollLayoutData>(() => {
    try {
      return normalizeLayoutData(deepClone(initialLayoutData))
    } catch (err) {
      console.error('[PianoRollEditor] Failed to normalize:', err)
    }
    return getDefaultLayout()
  })

  const [mode, setMode] = useState<EditorMode>('select')
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [selectedStage, setSelectedStage] = useState(false)
  const [isPreview, setIsPreview] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState<{ row: number; col: number } | null>(null)
  const [drawEnd, setDrawEnd] = useState<{ row: number; col: number } | null>(null)

  // Dragging state
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState<{ row: number; col: number } | null>(null)
  const [dragOrigin, setDragOrigin] = useState<{ row: number; col: number } | null>(null)

  // Resizing state
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle>(null)
  const [resizeOrigin, setResizeOrigin] = useState<{ row: number; col: number; rows: number; cols: number } | null>(null)

  // Zone creation dialog
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false)
  const [pendingZone, setPendingZone] = useState<{ row: number; col: number; rows: number; cols: number } | null>(null)
  const [zoneFormName, setZoneFormName] = useState('')
  const [zoneFormColor, setZoneFormColor] = useState(ZONE_COLORS[0])
  const [zoneFormCapacity, setZoneFormCapacity] = useState<number | undefined>(undefined)
  const [zoneFormShape, setZoneFormShape] = useState<'rectangle' | 'rounded-rect' | 'ellipse' | 'polygon'>('rectangle')

  // Grid snap (GA only)
  const [snapToGrid, setSnapToGrid] = useState(true)

  // Polygon drawing state
  const [polygonPoints, setPolygonPoints] = useState<{ row: number; col: number }[]>([])
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false)

  // Grid visibility (GA only)
  const [showGrid, setShowGrid] = useState(true)

  // Object palette (GA only)
  const [selectedObjectType, setSelectedObjectType] = useState<string | null>(null)

  // Auto-save
  const [autoSaveTime, setAutoSaveTime] = useState<Date | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)

  // ─── Refs ──────────────────────────────
  const historyRef = useRef<PianoRollLayoutData[]>([])
  const historyIndexRef = useRef(-1)
  const isUndoRedoRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const isDrawingRef = useRef(false)
  const isResizingRef = useRef(false)
  const isDraggingStageRef = useRef(false)
  const isResizingStageRef = useRef(false)
  const isDraggingObjectRef = useRef(false)
  const dragObjectIdRef = useRef<string | null>(null)

  // ─── Computed ──────────────────────────
  const { gridRows, gridCols, cellSize, zones, stage, objects } = layoutData

  const selectedZone = useMemo(() => {
    return zones.find((z) => z.id === selectedZoneId) || null
  }, [zones, selectedZoneId])

  const totalSeats = useMemo(() => {
    if (isGA) {
      return zones.reduce((sum, z) => {
        if (z.shape === 'polygon' && z.points && z.points.length >= 3) {
          return sum + (z.capacity || getPolygonCells(z.points).size)
        }
        return sum + (z.capacity || z.rows * z.cols)
      }, 0)
    }
    return zones.reduce((sum, z) => sum + z.rows * z.cols, 0)
  }, [zones, isGA])

  // Build a set of cells covered by each zone for rendering
  const zoneCellMap = useMemo(() => {
    const map = new Map<string, string>() // "row,col" → zoneId
    for (const zone of zones) {
      if (zone.shape === 'polygon' && zone.points && zone.points.length >= 3) {
        const cells = getPolygonCells(zone.points)
        for (const cell of cells) {
          map.set(cell, zone.id)
        }
      } else {
        for (let r = zone.row; r < zone.row + zone.rows; r++) {
          for (let c = zone.col; c < zone.col + zone.cols; c++) {
            map.set(`${r},${c}`, zone.id)
          }
        }
      }
    }
    return map
  }, [zones])

  // ─── History ───────────────────────────
  const pushHistory = useCallback((newData: PianoRollLayoutData) => {
    if (isUndoRedoRef.current) return
    const history = historyRef.current
    const idx = historyIndexRef.current
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
    setSelectedZoneId(null)
    setTimeout(() => { isUndoRedoRef.current = false }, 0)
  }, [])

  const redo = useCallback(() => {
    const idx = historyIndexRef.current
    if (idx >= historyRef.current.length - 1) return
    isUndoRedoRef.current = true
    historyIndexRef.current = idx + 1
    setLayoutData(deepClone(historyRef.current[idx + 1]))
    setSelectedZoneId(null)
    setTimeout(() => { isUndoRedoRef.current = false }, 0)
  }, [])

  const canUndo = historyIndexRef.current > 0
  const canRedo = historyIndexRef.current < historyRef.current.length - 1

  // Init history
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
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't delete if user is typing in an input
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
        if (selectedZoneId) {
          e.preventDefault()
          handleDeleteZone(selectedZoneId)
        }
      }
      if (e.key === '1') {
        if ((e.target as HTMLElement).tagName !== 'INPUT') setMode('select')
      }
      if (e.key === '2') {
        if ((e.target as HTMLElement).tagName !== 'INPUT') setMode('draw')
      }
      if (e.key === '3') {
        if ((e.target as HTMLElement).tagName !== 'INPUT') setMode('erase')
      }
      if (e.key === '4' && isGA) {
        if ((e.target as HTMLElement).tagName !== 'INPUT') setMode('object')
      }
      if (e.key === '5' && isGA) {
        if ((e.target as HTMLElement).tagName !== 'INPUT') setMode('polygon')
      }
      // Escape to cancel polygon drawing
      if (e.key === 'Escape' && isDrawingPolygon) {
        setPolygonPoints([])
        setIsDrawingPolygon(false)
        setMode('select')
      }
      // Enter to finish polygon drawing
      if (e.key === 'Enter' && isDrawingPolygon && polygonPoints.length >= 3) {
        if ((e.target as HTMLElement).tagName !== 'INPUT') {
          finishPolygon()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, selectedZoneId, isGA, isDrawingPolygon, polygonPoints])

  // ─── Auto-Save ─────────────────────────
  const performAutoSave = useCallback(async () => {
    setIsAutoSaving(true)
    try {
      const res = await fetch(`/api/admin/seat-maps/${seatMapId}/autosave`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutData: deepClone(layoutData), adminId }),
      })
      if (res.ok) setAutoSaveTime(new Date())
    } catch { /* silent */ } finally { setIsAutoSaving(false) }
  }, [seatMapId, layoutData, adminId])

  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => { performAutoSave() }, AUTOSAVE_INTERVAL)
    return () => { if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current) }
  }, [performAutoSave])

  const resetAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setInterval(() => { performAutoSave() }, AUTOSAVE_INTERVAL)
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

  // ─── Layout Updater ────────────────────
  const updateLayout = useCallback(
    (updater: (prev: PianoRollLayoutData) => PianoRollLayoutData) => {
      setLayoutData((prev) => {
        const next = updater(prev)
        pushHistory(next)
        resetAutoSaveTimer()
        return next
      })
    },
    [pushHistory, resetAutoSaveTimer]
  )

  // ─── Zone CRUD ─────────────────────────
  const handleDeleteZone = useCallback((zoneId: string) => {
    updateLayout((prev) => ({
      ...prev,
      zones: prev.zones.filter((z) => z.id !== zoneId),
    }))
    setSelectedZoneId((prev) => (prev === zoneId ? null : prev))
  }, [updateLayout])

  const handleUpdateZone = useCallback((zoneId: string, updates: Partial<PianoRollZone>) => {
    updateLayout((prev) => ({
      ...prev,
      zones: prev.zones.map((z) => (z.id === zoneId ? { ...z, ...updates } : z)),
    }))
  }, [updateLayout])

  // ─── Grid Cell Hit Testing ─────────────
  const getCellFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    const gridEl = gridRef.current
    if (!gridEl) return null
    const rect = gridEl.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    // Account for the label area offset
    const labelW = 32
    const headerH = 28
    const gx = (x - labelW) / (cellSize * zoom)
    const gy = (y - headerH) / (cellSize * zoom)
    const col = Math.floor(gx)
    const row = Math.floor(gy)
    if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) return null
    return { row, col }
  }, [cellSize, gridCols, gridRows, zoom])

  const getResizeHandle = useCallback((e: React.MouseEvent) => {
    if (!selectedZone) return null
    const gridEl = gridRef.current
    if (!gridEl) return null
    const rect = gridEl.getBoundingClientRect()
    const labelW = 32
    const headerH = 28
    const x = e.clientX - rect.left - labelW
    const y = e.clientY - rect.top - headerH
    const zoneLeft = selectedZone.col * cellSize * zoom
    const zoneTop = selectedZone.row * cellSize * zoom
    const zoneRight = (selectedZone.col + selectedZone.cols) * cellSize * zoom
    const zoneBottom = (selectedZone.row + selectedZone.rows) * cellSize * zoom
    const threshold = 6

    // Check corners first
    if (Math.abs(x - zoneLeft) < threshold && Math.abs(y - zoneTop) < threshold) return 'nw'
    if (Math.abs(x - zoneRight) < threshold && Math.abs(y - zoneTop) < threshold) return 'ne'
    if (Math.abs(x - zoneLeft) < threshold && Math.abs(y - zoneBottom) < threshold) return 'sw'
    if (Math.abs(x - zoneRight) < threshold && Math.abs(y - zoneBottom) < threshold) return 'se'

    // Check edges
    if (Math.abs(y - zoneTop) < threshold && x > zoneLeft + threshold && x < zoneRight - threshold) return 'n'
    if (Math.abs(y - zoneBottom) < threshold && x > zoneLeft + threshold && x < zoneRight - threshold) return 's'
    if (Math.abs(x - zoneLeft) < threshold && y > zoneTop + threshold && y < zoneBottom - threshold) return 'w'
    if (Math.abs(x - zoneRight) < threshold && y > zoneTop + threshold && y < zoneBottom - threshold) return 'e'

    return null
  }, [selectedZone, cellSize, zoom])

  const getStageResizeHandle = useCallback((e: React.MouseEvent): ResizeHandle => {
    if (!selectedStage || !stage) return null
    const gridEl = gridRef.current
    if (!gridEl) return null
    const rect = gridEl.getBoundingClientRect()
    const labelW = 32
    const headerH = 28
    const x = e.clientX - rect.left - labelW
    const y = e.clientY - rect.top - headerH
    const stageRows = stage.rows || 2
    const stageLeft = stage.col * cellSize * zoom
    const stageTop = stage.row * cellSize * zoom
    const stageRight = (stage.col + stage.cols) * cellSize * zoom
    const stageBottom = (stage.row + stageRows) * cellSize * zoom
    const threshold = 6

    // Check corners first
    if (Math.abs(x - stageLeft) < threshold && Math.abs(y - stageTop) < threshold) return 'nw'
    if (Math.abs(x - stageRight) < threshold && Math.abs(y - stageTop) < threshold) return 'ne'
    if (Math.abs(x - stageLeft) < threshold && Math.abs(y - stageBottom) < threshold) return 'sw'
    if (Math.abs(x - stageRight) < threshold && Math.abs(y - stageBottom) < threshold) return 'se'

    // Check edges
    if (Math.abs(y - stageTop) < threshold && x > stageLeft + threshold && x < stageRight - threshold) return 'n'
    if (Math.abs(y - stageBottom) < threshold && x > stageLeft + threshold && x < stageRight - threshold) return 's'
    if (Math.abs(x - stageLeft) < threshold && y > stageTop + threshold && y < stageBottom - threshold) return 'w'
    if (Math.abs(x - stageRight) < threshold && y > stageTop + threshold && y < stageBottom - threshold) return 'e'

    return null
  }, [selectedStage, stage, cellSize, zoom])

  const isOnStage = useCallback((cell: { row: number; col: number }): boolean => {
    if (!stage) return false
    const stageRows = stage.rows || 2
    return cell.row >= stage.row && cell.row < stage.row + stageRows &&
           cell.col >= stage.col && cell.col < stage.col + stage.cols
  }, [stage])

  // ─── Stage Update ───────────────────────
  const handleUpdateStage = useCallback((updates: Partial<PianoRollStage>) => {
    updateLayout((prev) => ({
      ...prev,
      stage: prev.stage ? { ...prev.stage, ...updates } : null,
    }))
  }, [updateLayout])

  // ─── Polygon Finish ─────────────────────
  const finishPolygon = useCallback(() => {
    if (polygonPoints.length < 3) return
    const cells = getPolygonCells(polygonPoints)
    const bounds = getPolygonBounds(polygonPoints)
    // Check overlap with existing zones
    let overlaps = false
    for (const cellKey of cells) {
      if (zoneCellMap.has(cellKey)) {
        overlaps = true
        break
      }
    }
    if (overlaps) {
      toast({ title: 'Tumpang tindih', description: 'Area polygon ini overlap dengan zona lain.', variant: 'destructive' })
      setPolygonPoints([])
      setIsDrawingPolygon(false)
      return
    }
    setPendingZone({ row: bounds.row, col: bounds.col, rows: bounds.rows, cols: bounds.cols })
    setZoneFormName('')
    setZoneFormColor(ZONE_COLORS[zones.length % ZONE_COLORS.length])
    setZoneFormCapacity(cells.size)
    setZoneFormShape('polygon')
    setZoneDialogOpen(true)
    setIsDrawingPolygon(false)
  }, [polygonPoints, zoneCellMap, toast, zones])

  // ─── Object Hit Testing ─────────────────
  const getObjectAtCell = useCallback((cell: { row: number; col: number }) => {
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i]
      if (cell.row >= obj.row && cell.row < obj.row + obj.rows &&
          cell.col >= obj.col && cell.col < obj.col + obj.cols) {
        return obj
      }
    }
    return null
  }, [objects])

  // ─── Mouse Handlers ────────────────────
  const handleGridMouseDown = useCallback((e: React.MouseEvent) => {
    if (isPreview) return
    if (e.button !== 0) return

    const cell = getCellFromEvent(e)
    if (!cell) return

    // Polygon mode: click to add vertices
    if (mode === 'polygon' && cell) {
      setIsDrawingPolygon(true)
      // Check if clicking near first point to close polygon (double-click simulation)
      if (polygonPoints.length >= 3) {
        const first = polygonPoints[0]
        if (Math.abs(cell.row - first.row) <= 1 && Math.abs(cell.col - first.col) <= 1) {
          finishPolygon()
          return
        }
      }
      setPolygonPoints(prev => [...prev, { row: cell.row, col: cell.col }])
      return
    }

    if (mode === 'object' && cell && selectedObjectType) {
      const preset = OBJECT_PRESETS.find(p => p.type === selectedObjectType)
      if (preset) {
        const newObject: PianoRollObject = {
          id: generateId(),
          type: preset.type,
          label: preset.label,
          row: cell.row,
          col: cell.col,
          rows: preset.rows,
          cols: preset.cols,
        }
        updateLayout(prev => ({ ...prev, objects: [...prev.objects, newObject] }))
        toast({ title: 'Objek ditambahkan', description: preset.label })
      }
      return
    }

    if (mode === 'draw') {
      // Start drawing a new zone
      isDrawingRef.current = true
      setIsDrawing(true)
      setDrawStart(cell)
      setDrawEnd(cell)
      return
    }

    if (mode === 'erase') {
      // Find zone at this cell and delete it
      const zoneId = zoneCellMap.get(`${cell.row},${cell.col}`)
      if (zoneId) {
        handleDeleteZone(zoneId)
        toast({ title: 'Zona dihapus', description: 'Zona berhasil dihapus.' })
      }
      // Also check for objects to erase
      const obj = getObjectAtCell(cell)
      if (obj) {
        updateLayout(prev => ({ ...prev, objects: prev.objects.filter(o => o.id !== obj.id) }))
        toast({ title: 'Objek dihapus', description: obj.label || obj.type })
      }
      return
    }

    if (mode === 'select') {
      // Priority: resize handle (zone or stage) > object > stage > zone > empty

      // 1. Check for resize handle on selected stage (highest priority)
      if (selectedStage && stage) {
        const handle = getStageResizeHandle(e)
        if (handle) {
          isResizingStageRef.current = true
          isResizingRef.current = true
          setIsResizing(true)
          setResizeHandle(handle)
          setResizeOrigin({ row: stage.row, col: stage.col, rows: stage.rows || 2, cols: stage.cols })
          setDragOffset(cell)
          return
        }
      }

      // 2. Check for resize handle on selected zone
      if (selectedZone && selectedZone.shape !== 'polygon') {
        const handle = getResizeHandle(e)
        if (handle) {
          isResizingRef.current = true
          setIsResizing(true)
          setResizeHandle(handle)
          setResizeOrigin({ row: selectedZone.row, col: selectedZone.col, rows: selectedZone.rows, cols: selectedZone.cols })
          setDragOffset(cell)
          return
        }
      }

      // 3. Check if clicking on a decorative object (drag it)
      const hitObj = getObjectAtCell(cell)
      if (hitObj) {
        setSelectedZoneId(null)
        setSelectedStage(false)
        isDraggingObjectRef.current = true
        dragObjectIdRef.current = hitObj.id
        isDraggingRef.current = true
        setIsDragging(true)
        setDragOrigin({ row: hitObj.row, col: hitObj.col })
        setDragOffset(cell)
        return
      }

      // 4. Check if clicking on stage
      if (isOnStage(cell)) {
        setSelectedZoneId(null)
        setSelectedStage(true)
        isDraggingStageRef.current = true
        isDraggingRef.current = true
        setIsDragging(true)
        setDragOrigin({ row: stage!.row, col: stage!.col })
        setDragOffset(cell)
        return
      }

      // 5. Check if clicking inside a zone
      const zoneId = zoneCellMap.get(`${cell.row},${cell.col}`)
      if (zoneId) {
        setSelectedZoneId(zoneId)
        setSelectedStage(false)
        const zone = zones.find((z) => z.id === zoneId)
        if (zone && zone.shape !== 'polygon') {
          isDraggingRef.current = true
          setIsDragging(true)
          setDragOrigin({ row: zone.row, col: zone.col })
          setDragOffset(cell)
        }
      } else {
        setSelectedZoneId(null)
        setSelectedStage(false)
      }
    }
  }, [mode, isPreview, getCellFromEvent, zoneCellMap, handleDeleteZone, selectedZone, getResizeHandle, zones, toast, stage, selectedStage, getStageResizeHandle, isOnStage, handleUpdateStage, selectedObjectType, updateLayout, polygonPoints, finishPolygon, getObjectAtCell])

  const handleGridMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDrawingRef.current) {
      const cell = getCellFromEvent(e)
      if (cell) setDrawEnd(cell)
      return
    }

    // Object dragging
    if (isDraggingObjectRef.current && dragObjectIdRef.current && dragOrigin && dragOffset) {
      const cell = getCellFromEvent(e)
      if (!cell) return
      const deltaRow = cell.row - dragOffset.row
      const deltaCol = cell.col - dragOffset.col
      const obj = objects.find(o => o.id === dragObjectIdRef.current)
      if (!obj) return
      const newRow = clamp(dragOrigin.row + deltaRow, 0, gridRows - obj.rows)
      const newCol = clamp(dragOrigin.col + deltaCol, 0, gridCols - obj.cols)
      updateLayout(prev => ({
        ...prev,
        objects: prev.objects.map(o => o.id === dragObjectIdRef.current ? { ...o, row: newRow, col: newCol } : o)
      }))
      return
    }

    // Stage dragging
    if (isDraggingStageRef.current && stage && dragOrigin && dragOffset) {
      const cell = getCellFromEvent(e)
      if (!cell) return
      const deltaRow = cell.row - dragOffset.row
      const deltaCol = cell.col - dragOffset.col
      const stageRows = stage.rows || 2
      const newRow = clamp(dragOrigin.row + deltaRow, 0, gridRows - stageRows)
      const newCol = clamp(dragOrigin.col + deltaCol, 0, gridCols - stage.cols)
      handleUpdateStage({ row: newRow, col: newCol })
      return
    }

    // Stage resizing
    if (isResizingStageRef.current && stage && resizeOrigin && dragOffset) {
      const cell = getCellFromEvent(e)
      if (!cell) return
      const deltaRow = cell.row - dragOffset.row
      const deltaCol = cell.col - dragOffset.col
      let newRow = resizeOrigin.row
      let newCol = resizeOrigin.col
      let newRows = resizeOrigin.rows
      let newCols = resizeOrigin.cols

      switch (resizeHandle) {
        case 'n': {
          const dr = Math.min(deltaRow, resizeOrigin.rows - 1)
          newRow = resizeOrigin.row + dr
          newRows = resizeOrigin.rows - dr
          break
        }
        case 's':
          newRows = clamp(resizeOrigin.rows + deltaRow, 1, gridRows - resizeOrigin.row)
          break
        case 'w': {
          const dc = Math.min(deltaCol, resizeOrigin.cols - 2)
          newCol = resizeOrigin.col + dc
          newCols = resizeOrigin.cols - dc
          break
        }
        case 'e':
          newCols = clamp(resizeOrigin.cols + deltaCol, 2, gridCols - resizeOrigin.col)
          break
        case 'nw': {
          const dr = Math.min(deltaRow, resizeOrigin.rows - 1)
          const dc = Math.min(deltaCol, resizeOrigin.cols - 2)
          newRow = resizeOrigin.row + dr
          newRows = resizeOrigin.rows - dr
          newCol = resizeOrigin.col + dc
          newCols = resizeOrigin.cols - dc
          break
        }
        case 'ne': {
          const dr = Math.min(deltaRow, resizeOrigin.rows - 1)
          const dc = deltaCol
          newRow = resizeOrigin.row + dr
          newRows = resizeOrigin.rows - dr
          newCols = clamp(resizeOrigin.cols + dc, 2, gridCols - resizeOrigin.col)
          break
        }
        case 'sw': {
          const dr = deltaRow
          const dc = Math.min(deltaCol, resizeOrigin.cols - 2)
          newCol = resizeOrigin.col + dc
          newCols = resizeOrigin.cols - dc
          newRows = clamp(resizeOrigin.rows + dr, 1, gridRows - resizeOrigin.row)
          break
        }
        case 'se':
          newRows = clamp(resizeOrigin.rows + deltaRow, 1, gridRows - resizeOrigin.row)
          newCols = clamp(resizeOrigin.cols + deltaCol, 2, gridCols - resizeOrigin.col)
          break
      }

      // Clamp bounds
      if (newRow < 0) { newRows += newRow; newRow = 0 }
      if (newCol < 0) { newCols += newCol; newCol = 0 }
      if (newRow + newRows > gridRows) newRows = gridRows - newRow
      if (newCol + newCols > gridCols) newCols = gridCols - newCol
      if (newRows < 1) newRows = 1
      if (newCols < 2) newCols = 2

      handleUpdateStage({ row: newRow, col: newCol, rows: newRows, cols: newCols })
      return
    }

    // Zone dragging
    if (isDraggingRef.current && selectedZoneId && dragOrigin && dragOffset) {
      const cell = getCellFromEvent(e)
      if (!cell) return
      const deltaRow = cell.row - dragOffset.row
      const deltaCol = cell.col - dragOffset.col
      const newRow = clamp(dragOrigin.row + deltaRow, 0, gridRows - (selectedZone?.rows ?? 1))
      const newCol = clamp(dragOrigin.col + deltaCol, 0, gridCols - (selectedZone?.cols ?? 1))
      handleUpdateZone(selectedZoneId, { row: newRow, col: newCol })
    }

    if (isResizingRef.current && selectedZoneId && resizeOrigin && dragOffset) {
      const cell = getCellFromEvent(e)
      if (!cell) return
      const deltaRow = cell.row - dragOffset.row
      const deltaCol = cell.col - dragOffset.col
      let newRow = resizeOrigin.row
      let newCol = resizeOrigin.col
      let newRows = resizeOrigin.rows
      let newCols = resizeOrigin.cols

      switch (resizeHandle) {
        case 'n': {
          const dr = Math.min(deltaRow, resizeOrigin.rows - 1)
          newRow = resizeOrigin.row + dr
          newRows = resizeOrigin.rows - dr
          break
        }
        case 's':
          newRows = clamp(resizeOrigin.rows + deltaRow, 1, gridRows - resizeOrigin.row)
          break
        case 'w': {
          const dc = Math.min(deltaCol, resizeOrigin.cols - 1)
          newCol = resizeOrigin.col + dc
          newCols = resizeOrigin.cols - dc
          break
        }
        case 'e':
          newCols = clamp(resizeOrigin.cols + deltaCol, 1, gridCols - resizeOrigin.col)
          break
        case 'nw': {
          const dr = Math.min(deltaRow, resizeOrigin.rows - 1)
          const dc = Math.min(deltaCol, resizeOrigin.cols - 1)
          newRow = resizeOrigin.row + dr
          newRows = resizeOrigin.rows - dr
          newCol = resizeOrigin.col + dc
          newCols = resizeOrigin.cols - dc
          break
        }
        case 'ne': {
          const dr = Math.min(deltaRow, resizeOrigin.rows - 1)
          const dc = deltaCol
          newRow = resizeOrigin.row + dr
          newRows = resizeOrigin.rows - dr
          newCols = clamp(resizeOrigin.cols + dc, 1, gridCols - resizeOrigin.col)
          break
        }
        case 'sw': {
          const dr = deltaRow
          const dc = Math.min(deltaCol, resizeOrigin.cols - 1)
          newCol = resizeOrigin.col + dc
          newCols = resizeOrigin.cols - dc
          newRows = clamp(resizeOrigin.rows + dr, 1, gridRows - resizeOrigin.row)
          break
        }
        case 'se':
          newRows = clamp(resizeOrigin.rows + deltaRow, 1, gridRows - resizeOrigin.row)
          newCols = clamp(resizeOrigin.cols + deltaCol, 1, gridCols - resizeOrigin.col)
          break
      }

      // Clamp bounds
      if (newRow < 0) { newRows += newRow; newRow = 0 }
      if (newCol < 0) { newCols += newCol; newCol = 0 }
      if (newRow + newRows > gridRows) newRows = gridRows - newRow
      if (newCol + newCols > gridCols) newCols = gridCols - newCol
      if (newRows < 1) newRows = 1
      if (newCols < 1) newCols = 1

      handleUpdateZone(selectedZoneId, { row: newRow, col: newCol, rows: newRows, cols: newCols })
    }
  }, [isDrawingRef, isDraggingRef, isResizingRef, isDraggingStageRef, isResizingStageRef, selectedZoneId, selectedZone, selectedStage, stage, dragOrigin, dragOffset, resizeOrigin, resizeHandle, gridRows, gridCols, getCellFromEvent, handleUpdateZone, handleUpdateStage])

  const handleGridMouseUp = useCallback(() => {
    if (isDrawingRef.current && drawStart && drawEnd) {
      isDrawingRef.current = false
      setIsDrawing(false)

      const minRow = Math.min(drawStart.row, drawEnd.row)
      const maxRow = Math.max(drawStart.row, drawEnd.row)
      const minCol = Math.min(drawStart.col, drawEnd.col)
      const maxCol = Math.max(drawStart.col, drawEnd.col)
      const rows = maxRow - minRow + 1
      const cols = maxCol - minCol + 1

      if (rows >= 1 && cols >= 1) {
        // Check overlap with existing zones
        let overlaps = false
        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            if (zoneCellMap.has(`${r},${c}`)) {
              overlaps = true
              break
            }
          }
          if (overlaps) break
        }

        if (overlaps) {
          toast({ title: 'Tumpang tindih', description: 'Area ini sudah terisi zona lain.', variant: 'destructive' })
        } else {
          setPendingZone({ row: minRow, col: minCol, rows, cols })
          setZoneFormName('')
          setZoneFormColor(ZONE_COLORS[zones.length % ZONE_COLORS.length])
          setZoneFormCapacity(isGA ? rows * cols : undefined)
          setZoneFormShape('rectangle')
          setZoneDialogOpen(true)
        }
      }

      setDrawStart(null)
      setDrawEnd(null)
    }

    if (isDraggingRef.current) {
      isDraggingRef.current = false
      setIsDragging(false)
      setDragOrigin(null)
      setDragOffset(null)
    }

    if (isDraggingObjectRef.current) {
      isDraggingObjectRef.current = false
      dragObjectIdRef.current = null
    }

    if (isDraggingStageRef.current) {
      isDraggingStageRef.current = false
      // Only reset the shared isDraggingRef if zone dragging isn't also active
      if (!isDraggingRef.current) {
        setIsDragging(false)
        setDragOrigin(null)
        setDragOffset(null)
      }
    }

    if (isResizingRef.current) {
      isResizingRef.current = false
      setIsResizing(false)
      setResizeHandle(null)
      setResizeOrigin(null)
      setDragOffset(null)
    }

    if (isResizingStageRef.current) {
      isResizingStageRef.current = false
      if (!isResizingRef.current) {
        setIsResizing(false)
        setResizeHandle(null)
        setResizeOrigin(null)
        setDragOffset(null)
      }
    }
  }, [drawStart, drawEnd, zones, toast, zoneCellMap, isGA])

  // ─── Zone Dialog Submit ────────────────
  const handleZoneDialogSubmit = useCallback(() => {
    if (!pendingZone || !zoneFormName.trim()) return

    const newZone: PianoRollZone = {
      id: generateId(),
      name: zoneFormName.trim(),
      row: pendingZone.row,
      col: pendingZone.col,
      rows: pendingZone.rows,
      cols: pendingZone.cols,
      color: zoneFormColor,
      ...(isGA && zoneFormCapacity ? { capacity: zoneFormCapacity } : {}),
      ...(isGA ? { shape: zoneFormShape } : {}),
      // Store polygon points if shape is polygon
      ...(zoneFormShape === 'polygon' && polygonPoints.length >= 3 ? { points: [...polygonPoints] } : {}),
    }

    updateLayout((prev) => ({
      ...prev,
      zones: [...prev.zones, newZone],
    }))

    // Clear polygon state
    setPolygonPoints([])
    setZoneDialogOpen(false)
    setPendingZone(null)
    setSelectedZoneId(newZone.id)
    setMode('select')
    if (isGA) {
      toast({ title: 'Zona dibuat', description: `${zoneFormName.trim()} (${zoneFormCapacity || pendingZone.rows * pendingZone.cols} orang)` })
    } else {
      toast({ title: 'Zona dibuat', description: `${zoneFormName.trim()} (${pendingZone.rows}×${pendingZone.cols})` })
    }
  }, [pendingZone, zoneFormName, zoneFormColor, zoneFormCapacity, zoneFormShape, updateLayout, toast, isGA, polygonPoints])

  // ─── Grid Settings Handlers ────────────
  const handleGridRowsChange = useCallback((value: number) => {
    updateLayout((prev) => {
      const newRows = clamp(value, MIN_GRID_ROWS, MAX_GRID_ROWS)
      // Remove zones that go out of bounds
      const filteredZones = prev.zones.filter((z) => z.row + z.rows <= newRows)
      return {
        ...prev,
        gridRows: newRows,
        zones: filteredZones,
        canvasHeight: newRows * prev.cellSize + 60,
      }
    })
  }, [updateLayout])

  const handleGridColsChange = useCallback((value: number) => {
    updateLayout((prev) => {
      const newCols = clamp(value, MIN_GRID_COLS, MAX_GRID_COLS)
      const filteredZones = prev.zones.filter((z) => z.col + z.cols <= newCols)
      return {
        ...prev,
        gridCols: newCols,
        zones: filteredZones,
        canvasWidth: newCols * prev.cellSize + 60,
      }
    })
  }, [updateLayout])

  const handleCellSizeChange = useCallback((value: number) => {
    updateLayout((prev) => {
      const newSize = clamp(value, MIN_CELL_SIZE, MAX_CELL_SIZE)
      return {
        ...prev,
        cellSize: newSize,
        canvasWidth: prev.gridCols * newSize + 60,
        canvasHeight: prev.gridRows * newSize + 60,
      }
    })
  }, [updateLayout])

  // ─── Layout Image Export ───────────────
  const exportLayoutAsImage = useCallback(() => {
    const canvas = document.createElement('canvas')
    const scale = 2
    const padding = 40
    const w = layoutData.canvasWidth * scale
    const h = layoutData.canvasHeight * scale
    canvas.width = w + padding * 2
    canvas.height = h + padding * 2
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = isGA ? '#ffffff' : '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const offsetX = padding
    const offsetY = padding

    if (layoutData.stage) {
      const s = layoutData.stage
      const sx = offsetX + s.col * layoutData.cellSize * scale
      const sy = offsetY + s.row * layoutData.cellSize * scale
      const sw = s.cols * layoutData.cellSize * scale
      const sh = (s.rows || 2) * layoutData.cellSize * scale
      const grad = ctx.createLinearGradient(sx, sy, sx, sy + sh)
      if (isGA) {
        grad.addColorStop(0, '#818CF8')
        grad.addColorStop(0.5, '#6366F1')
        grad.addColorStop(1, '#4F46E5')
      } else {
        grad.addColorStop(0, '#4A4A4A')
        grad.addColorStop(1, '#333333')
      }
      ctx.fillStyle = grad
      ctx.fillRect(sx, sy, sw, sh)
      ctx.strokeStyle = isGA ? '#4338CA' : '#666'
      ctx.lineWidth = 2
      ctx.strokeRect(sx, sy, sw, sh)
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${14 * scale}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('STAGE', sx + sw / 2, sy + sh / 2 + 5 * scale)
    }

    for (const zone of layoutData.zones) {
      const zx = offsetX + zone.col * layoutData.cellSize * scale
      const zy = offsetY + zone.row * layoutData.cellSize * scale
      const zw = zone.cols * layoutData.cellSize * scale
      const zh = zone.rows * layoutData.cellSize * scale

      ctx.save()
      ctx.fillStyle = zone.color + '40'

      const shape = zone.shape || 'rectangle'
      if (shape === 'polygon' && zone.points && zone.points.length >= 3) {
        // Draw polygon shape
        ctx.beginPath()
        const firstP = zone.points[0]
        ctx.moveTo(offsetX + firstP.col * layoutData.cellSize * scale + (layoutData.cellSize * scale) / 2, offsetY + firstP.row * layoutData.cellSize * scale + (layoutData.cellSize * scale) / 2)
        for (let i = 1; i < zone.points.length; i++) {
          const p = zone.points[i]
          ctx.lineTo(offsetX + p.col * layoutData.cellSize * scale + (layoutData.cellSize * scale) / 2, offsetY + p.row * layoutData.cellSize * scale + (layoutData.cellSize * scale) / 2)
        }
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = zone.color + '80'
        ctx.lineWidth = 2
        ctx.stroke()
      } else if (shape === 'rounded-rect') {
        const r = 12 * scale
        ctx.beginPath()
        ctx.roundRect(zx, zy, zw, zh, r)
        ctx.fill()
        ctx.strokeStyle = zone.color + '80'
        ctx.lineWidth = 2
        ctx.stroke()
      } else if (shape === 'ellipse') {
        ctx.beginPath()
        ctx.ellipse(zx + zw / 2, zy + zh / 2, zw / 2, zh / 2, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = zone.color + '80'
        ctx.lineWidth = 2
        ctx.stroke()
      } else {
        ctx.fillRect(zx, zy, zw, zh)
        ctx.strokeStyle = zone.color + '80'
        ctx.lineWidth = 2
        ctx.strokeRect(zx, zy, zw, zh)
      }
      ctx.fillStyle = isGA ? zone.color + '35' : zone.color + '40'
      const cap = zone.capacity || zone.rows * zone.cols
      ctx.fillText(`${cap} org`, zx + zw / 2, zy + zh / 2 + 7 * scale)
      ctx.shadowBlur = 0
    }

    for (const obj of layoutData.objects) {
      const ox = offsetX + obj.col * layoutData.cellSize * scale
      const oy = offsetY + obj.row * layoutData.cellSize * scale
      const ow = obj.cols * layoutData.cellSize * scale
      const oh = obj.rows * layoutData.cellSize * scale

      ctx.fillStyle = isGA ? '#059669' : '#2A3A5C'
      ctx.fillRect(ox, oy, ow, oh)
      ctx.strokeStyle = isGA ? '#10B981' : '#4A6FA5'
      ctx.lineWidth = 1
      ctx.strokeRect(ox, oy, ow, oh)

      ctx.fillStyle = isGA ? '#ffffff' : '#8BB8E8'
      ctx.font = `${8 * scale}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(obj.label || obj.type, ox + ow / 2, oy + oh / 2)
    }

    return canvas.toDataURL('image/png')
  }, [layoutData])

  // ─── Save & Exit ───────────────────────
  const handleSaveAndExit = useCallback(async () => {
    const stageTypeValue = stage?.stageType || initialStageType || 'PROSCENIUM'
    const outputData = deepClone(layoutData)
    if (isGA) {
      outputData.type = 'GENERAL_ADMISSION'
      try {
        const imageUrl = exportLayoutAsImage()
        if (imageUrl) {
          const uploadRes = await fetch('/api/admin/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: imageUrl.split(',')[1],
              fileName: `layout-${seatMapId}-${Date.now()}.png`,
            }),
          })
          if (uploadRes.ok) {
            const { url } = await uploadRes.json()
            outputData.layoutImageUrl = url
          }
        }
      } catch (err) {
        console.error('Failed to export layout image:', err)
      }
    }
    onSaveAndExit(outputData, stageTypeValue)
  }, [layoutData, stage, initialStageType, onSaveAndExit, isGA, seatMapId, exportLayoutAsImage])

  // ─── Cursor Style ──────────────────────
  const getCursorStyle = useMemo(() => {
    if (isPreview) return 'cursor-default'
    if (mode === 'draw') return 'cursor-crosshair'
    if (mode === 'erase') return 'cursor-pointer'
    if (mode === 'object') return 'cursor-copy'
    if (mode === 'polygon') return 'cursor-crosshair'
    if (mode === 'select') return 'cursor-default'
    return 'cursor-default'
  }, [mode, isPreview])

  // ─── Render Drawing Preview ────────────
  const drawPreview = useMemo(() => {
    if (!isDrawing || !drawStart || !drawEnd) return null
    const minRow = Math.min(drawStart.row, drawEnd.row)
    const maxRow = Math.max(drawStart.row, drawEnd.row)
    const minCol = Math.min(drawStart.col, drawEnd.col)
    const maxCol = Math.max(drawStart.col, drawEnd.col)
    return { row: minRow, col: minCol, rows: maxRow - minRow + 1, cols: maxCol - minCol + 1 }
  }, [isDrawing, drawStart, drawEnd])

  // ─── Sidebar Width ─────────────────────
  const sidebarWidth = sidebarCollapsed ? 0 : 280

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-screen bg-gray-900 text-gray-200">
        {/* ─── Top Toolbar ─── */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
          {/* Left: Mode buttons */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={mode === 'select' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('select')}
                  className={cn(
                    'h-8 w-8 p-0',
                    mode === 'select' && 'bg-gray-600 text-white'
                  )}
                >
                  <MousePointer2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Select (1)
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={mode === 'draw' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('draw')}
                  className={cn(
                    'h-8 w-8 p-0',
                    mode === 'draw' && 'bg-gray-600 text-white'
                  )}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Draw Zone (2)
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={mode === 'erase' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('erase')}
                  className={cn(
                    'h-8 w-8 p-0',
                    mode === 'erase' && 'bg-red-900/50 text-red-300'
                  )}
                >
                  <Eraser className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Erase (3)
              </TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6 mx-2 bg-gray-700" />

            {/* Object Mode Button (GA only) */}
            {isGA && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={mode === 'object' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setMode('object')}
                    className={cn('h-8 w-8 p-0', mode === 'object' && 'bg-blue-900/50 text-blue-300')}
                  >
                    <DoorOpen className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Place Object (4)</TooltipContent>
              </Tooltip>
            )}

            {/* Snap Toggle (GA only) */}
            {isGA && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={snapToGrid ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setSnapToGrid(s => !s)}
                    className={cn('h-8 px-2 text-[10px] gap-1', snapToGrid && 'bg-gray-600 text-white')}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Snap
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Grid Snap</TooltipContent>
              </Tooltip>
            )}

            {/* Polygon Mode Button (GA only) */}
            {isGA && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={mode === 'polygon' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      if (mode === 'polygon') {
                        setMode('select')
                        setPolygonPoints([])
                        setIsDrawingPolygon(false)
                      } else {
                        setMode('polygon')
                      }
                    }}
                    className={cn('h-8 px-2 text-[10px] gap-1', mode === 'polygon' && 'bg-purple-900/50 text-purple-300')}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Polygon
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Draw Polygon (5)</TooltipContent>
              </Tooltip>
            )}

            {/* Grid Visibility Toggle (GA only) */}
            {isGA && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showGrid ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setShowGrid(s => !s)}
                    className={cn('h-8 px-2 text-[10px] gap-1', showGrid && 'bg-gray-600 text-white')}
                  >
                    {showGrid ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    Grid
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Toggle Grid</TooltipContent>
              </Tooltip>
            )}

            <Badge variant="outline" className="text-[10px] font-mono text-gray-400 border-gray-700 bg-gray-800">
              {mode === 'select' ? 'SELECT' : mode === 'draw' ? 'DRAW' : mode === 'erase' ? 'ERASE' : mode === 'object' ? 'OBJECT' : 'POLYGON'}
            </Badge>
          </div>

          {/* Center: Status */}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="font-mono">{gridRows}×{gridCols}</span>
            <span>•</span>
            <span>{zones.length} zones</span>
            <span>•</span>
            <span className="text-gold font-semibold">{totalSeats} {isGA ? 'orang' : 'seats'}</span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} className="h-8 w-8 p-0">
                  <Undo2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} className="h-8 w-8 p-0">
                  <Redo2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Redo (Ctrl+Y)</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6 mx-1 bg-gray-700" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom((z) => Math.min(z + 0.15, 2))}
                  disabled={zoom >= 2}
                  className="h-8 w-8 p-0"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Zoom In</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))}
                  disabled={zoom <= 0.4}
                  className="h-8 w-8 p-0"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Zoom Out</TooltipContent>
            </Tooltip>

            <span className="text-[10px] font-mono text-gray-500 w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>

            <Separator orientation="vertical" className="h-6 mx-1 bg-gray-700" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isPreview ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setIsPreview((p) => !p)}
                  className={cn('h-8 w-8 p-0', isPreview && 'bg-gray-600 text-white')}
                >
                  {isPreview ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Preview</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarCollapsed((s) => !s)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className={cn('w-4 h-4 transition-transform', !sidebarCollapsed && 'rotate-180')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Toggle Sidebar</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6 mx-1 bg-gray-700" />

            {isAutoSaving && (
              <span className="text-[10px] text-gray-500 animate-pulse">Saving...</span>
            )}
            {autoSaveTime && !isAutoSaving && (
              <span className="text-[10px] text-gray-600">Saved {formatTime(autoSaveTime)}</span>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const dataUrl = exportLayoutAsImage()
                if (dataUrl) {
                  const link = document.createElement('a')
                  link.download = `seatmap-${seatMapId}-${Date.now()}.png`
                  link.href = dataUrl
                  link.click()
                }
              }}
              className="h-8 text-gray-400 hover:text-white gap-1.5"
              title="Download Gambar"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs">Download Gambar</span>
            </Button>
            <Button
              size="sm"
              onClick={handleSaveAndExit}
              className="h-8 bg-amber-700 hover:bg-amber-600 text-white gap-1.5 ml-1"
            >
              <Save className="w-3.5 h-3.5" />
              Save & Exit
            </Button>
          </div>
        </div>

        {/* ─── Main Content ─── */}
        <div className="flex flex-1 overflow-hidden">
          {/* ─── Grid Area ─── */}
          <div className={cn('flex-1 overflow-auto p-4', isGA ? 'bg-gray-100' : '')} onMouseUp={handleGridMouseUp} onMouseLeave={handleGridMouseUp}>
            <div className="inline-block">
              <div
                ref={gridRef}
                className={cn('relative select-none', getCursorStyle)}
                onMouseDown={handleGridMouseDown}
                onMouseMove={handleGridMouseMove}
                style={{
                  width: (gridCols * cellSize * zoom) + 32,
                  height: (gridRows * cellSize * zoom) + 28,
                }}
              >
                {/* Column Headers */}
                {!(isGA && !showGrid) && (
                <div className="absolute left-8 top-0 flex" style={{ height: 28 }}>
                  {Array.from({ length: gridCols }, (_, c) => (
                    <div
                      key={`col-${c}`}
                      className="flex items-center justify-center font-mono text-[10px]"
                      style={{ width: cellSize * zoom, height: 28, color: isGA ? '#6B7280' : '#6B7280' }}
                    >
                      {c + 1}
                    </div>
                  ))}
                </div>
                )}

                {/* Row Labels */}
                {!(isGA && !showGrid) && (
                <div className="absolute left-0 top-7 flex flex-col">
                  {Array.from({ length: gridRows }, (_, r) => (
                    <div
                      key={`row-${r}`}
                      className="flex items-center justify-end pr-2 font-mono text-[10px] text-gray-500"
                      style={{ width: 32, height: cellSize * zoom, color: isGA ? '#6B7280' : undefined }}
                    >
                      {getRowLabel(r)}
                    </div>
                  ))}
                </div>
                )}

                {/* Grid Cells */}
                <div
                  className="absolute left-8 top-7"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${gridCols}, ${cellSize * zoom}px)`,
                    gridTemplateRows: `repeat(${gridRows}, ${cellSize * zoom}px)`,
                  }}
                >
                  {Array.from({ length: gridRows * gridCols }, (_, i) => {
                    const r = Math.floor(i / gridCols)
                    const c = i % gridCols
                    const zoneId = zoneCellMap.get(`${r},${c}`)
                    const zone = zoneId ? zones.find((z) => z.id === zoneId) : null
                    const isSelected = selectedZoneId === zoneId
                    const isStageCell = stage ? r >= stage.row && r < stage.row + (stage.rows || 2) && c >= stage.col && c < stage.col + stage.cols : false
                    const isObjectCell = objects.some((o) => r >= o.row && r < o.row + o.rows && c >= o.col && c < o.col + o.cols)

                    // Check if this cell is part of the draw preview
                    const isDrawPreviewCell = drawPreview
                      ? r >= drawPreview.row && r < drawPreview.row + drawPreview.rows &&
                        c >= drawPreview.col && c < drawPreview.col + drawPreview.cols
                      : false

                    let bgColor = isGA ? '#ffffff' : 'transparent'
                    let borderColor = isGA ? 'border-gray-300/60' : 'border-gray-700/30'

                    if (zone) {
                      bgColor = isGA ? zone.color + '35' : zone.color + '40'
                      borderColor = isGA ? zone.color + '90' : zone.color + '80'
                    }

                    if (isStageCell) {
                      bgColor = isGA ? '#4F46E5' : '#3D3D3D'
                      borderColor = isGA ? '#6366F1' : '#555'
                    }

                    if (isObjectCell) {
                      bgColor = isGA ? '#059669' : '#2A3A5C'
                      borderColor = isGA ? '#10B981' : '#4A6FA5'
                    }

                    if (isDrawPreviewCell) {
                      bgColor = '#F59E0B'
                      borderColor = '#D97706'
                    }

                    return (
                      <div
                        key={`cell-${r}-${c}`}
                        className={cn(
                          'border-r border-b transition-colors duration-75',
                          (isGA && !showGrid) ? 'border-gray-200/40' : borderColor,
                          isPreview && mode === 'erase' && zone && 'opacity-80'
                        )}
                        style={{
                          width: cellSize * zoom,
                          height: cellSize * zoom,
                          backgroundColor: bgColor,
                          ...(isSelected ? {
                            outline: '2px dashed #F59E0B',
                            outlineOffset: '-1px',
                          } : {}),
                        }}
                      >
                        {/* Show small dot for occupied cells in preview */}
                        {isPreview && zone && (
                          <div
                            className="w-2 h-2 rounded-full mx-auto mt-1"
                            style={{ backgroundColor: zone.color }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Zone Labels (overlay on top of grid) */}
                {!isPreview && zones.map((zone) => {
                  const isSelected = selectedZoneId === zone.id
                  const shape = zone.shape || 'rectangle'
                  const shapeStyle: React.CSSProperties = {}
                  if (isGA && shape === 'rounded-rect') {
                    shapeStyle.borderRadius = '12px'
                    shapeStyle.overflow = 'hidden'
                  } else if (isGA && shape === 'ellipse') {
                    shapeStyle.borderRadius = '50%'
                    shapeStyle.overflow = 'hidden'
                  }
                  // Calculate capacity display for polygon zones
                  const displayCapacity = (() => {
                    if (shape === 'polygon' && zone.points && zone.points.length >= 3) {
                      return zone.capacity || getPolygonCells(zone.points).size
                    }
                    return zone.capacity || zone.rows * zone.cols
                  })()
                  return (
                    <div
                      key={`label-${zone.id}`}
                      className={cn(
                        'absolute pointer-events-none flex items-center justify-center text-[9px] font-medium truncate px-1',
                        isSelected ? (isGA ? 'text-white font-bold' : 'text-white font-bold') : (isGA ? 'text-gray-800 font-semibold' : 'text-gray-300')
                      )}
                      style={{
                        left: 32 + zone.col * cellSize * zoom,
                        top: 28 + zone.row * cellSize * zoom,
                        width: zone.cols * cellSize * zoom,
                        height: zone.rows * cellSize * zoom,
                        zIndex: 5,
                        textShadow: isGA ? '0 1px 2px rgba(255,255,255,0.8)' : '0 1px 3px rgba(0,0,0,0.8)',
                        ...shapeStyle,
                      }}
                    >
                      {zone.name}
                      {isGA ? (
                        <span className="ml-1 opacity-60 text-[8px]">({displayCapacity} org)</span>
                      ) : (
                        <span className="ml-1 opacity-60 text-[8px]">({zone.rows * zone.cols})</span>
                      )}
                    </div>
                  )
                })}

                {/* Polygon Zone Outlines (visual overlay for non-rectangular zones) */}
                {!isPreview && zones.filter(z => z.shape === 'polygon' && z.points && z.points.length >= 3).map(zone => {
                  const isSelected = selectedZoneId === zone.id
                  const points = zone.points!
                  return (
                    <svg
                      key={`poly-outline-${zone.id}`}
                      className="absolute pointer-events-none"
                      style={{
                        left: 32,
                        top: 28,
                        width: gridCols * cellSize * zoom,
                        height: gridRows * cellSize * zoom,
                        zIndex: 4,
                      }}
                    >
                      <polygon
                        points={points.map(p => `${p.col * cellSize * zoom + cellSize * zoom / 2},${p.row * cellSize * zoom + cellSize * zoom / 2}`).join(' ')}
                        fill="none"
                        stroke={isSelected ? '#F59E0B' : zone.color + 'AA'}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        strokeDasharray={isSelected ? '6 3' : 'none'}
                      />
                    </svg>
                  )
                })}

                {/* Polygon Drawing In-Progress Points */}
                {isDrawingPolygon && polygonPoints.length > 0 && !isPreview && (
                  <svg
                    className="absolute pointer-events-none"
                    style={{
                      left: 32,
                      top: 28,
                      width: gridCols * cellSize * zoom,
                      height: gridRows * cellSize * zoom,
                      zIndex: 20,
                    }}
                  >
                    {/* Lines connecting placed points */}
                    {polygonPoints.length >= 2 && (
                      <polyline
                        points={polygonPoints.map(p => `${p.col * cellSize * zoom + cellSize * zoom / 2},${p.row * cellSize * zoom + cellSize * zoom / 2}`).join(' ')}
                        fill="none"
                        stroke="#A855F7"
                        strokeWidth={2}
                        strokeDasharray="6 3"
                      />
                    )}
                    {/* Vertex dots */}
                    {polygonPoints.map((p, i) => (
                      <circle
                        key={`vp-${i}`}
                        cx={p.col * cellSize * zoom + cellSize * zoom / 2}
                        cy={p.row * cellSize * zoom + cellSize * zoom / 2}
                        r={i === 0 && polygonPoints.length >= 3 ? 6 : 4}
                        fill={i === 0 ? '#F59E0B' : '#A855F7'}
                        stroke="#fff"
                        strokeWidth={1.5}
                      />
                    ))}
                    {/* Preview polygon fill if >= 3 points */}
                    {polygonPoints.length >= 3 && (
                      <polygon
                        points={polygonPoints.map(p => `${p.col * cellSize * zoom + cellSize * zoom / 2},${p.row * cellSize * zoom + cellSize * zoom / 2}`).join(' ')}
                        fill="#A855F720"
                        stroke="none"
                      />
                    )}
                  </svg>
                )}

                {/* Polygon Drawing Hint */}
                {mode === 'polygon' && !isDrawingPolygon && !isPreview && (
                  <div className={cn('absolute bottom-4 left-1/2 -translate-x-1/2 border rounded-lg px-3 py-2 text-[10px] z-30 pointer-events-none', isGA ? 'bg-white/90 border-purple-400 text-purple-700' : 'bg-gray-800/90 border-purple-500/50 text-purple-300')}>
                    Click to place vertices. Click near first point or press Enter to close. Esc to cancel.
                    {polygonPoints.length > 0 && ` (${polygonPoints.length} points)`}
                  </div>
                )}
                {mode === 'polygon' && isDrawingPolygon && !isPreview && (
                  <div className={cn('absolute bottom-4 left-1/2 -translate-x-1/2 border rounded-lg px-3 py-2 text-[10px] z-30 pointer-events-none', isGA ? 'bg-white/90 border-purple-400 text-purple-700' : 'bg-gray-800/90 border-purple-500/50 text-purple-300')}>
                    {polygonPoints.length < 3
                      ? `Click to add more points (min 3). ${polygonPoints.length} placed.`
                      : `Click near first point or press Enter to finish. ${polygonPoints.length} points. Esc to cancel.`}
                  </div>
                )}

                {/* Stage Overlay */}
                {stage && (
                  <div
                    className={cn(
                      'absolute flex items-center justify-center text-xs font-bold pointer-events-none',
                      selectedStage
                        ? (isGA ? 'text-white' : 'text-white')
                        : (isGA ? 'text-white' : 'text-gray-300')
                    )}
                    style={{
                      left: 32 + stage.col * cellSize * zoom,
                      top: 28 + stage.row * cellSize * zoom,
                      width: stage.cols * cellSize * zoom,
                      height: (stage.rows || 2) * cellSize * zoom,
                      zIndex: 6,
                      textShadow: isGA ? '0 1px 2px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.8)',
                      background: isGA
                        ? (selectedStage
                          ? 'linear-gradient(180deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%)'
                          : 'linear-gradient(180deg, #818CF8 0%, #6366F1 50%, #4F46E5 100%)')
                        : (selectedStage
                          ? 'linear-gradient(180deg, #5A5A5A 0%, #4A4A4A 50%, #3D3D3D 100%)'
                          : 'linear-gradient(180deg, #4A4A4A 0%, #3D3D3D 50%, #333 100%)'),
                      borderTop: selectedStage ? '2px solid #F59E0B' : (isGA ? '2px solid #4338CA' : '2px solid #666'),
                      borderLeft: selectedStage ? '2px solid #F59E0B' : (isGA ? '1px solid #6366F1' : '1px solid #555'),
                      borderRight: selectedStage ? '2px solid #F59E0B' : (isGA ? '1px solid #6366F1' : '1px solid #555'),
                      borderBottom: selectedStage ? '2px solid #F59E0B' : (isGA ? '1px solid #6366F1' : '1px solid #555'),
                      ...(selectedStage ? {
                        outline: '2px dashed #F59E0B',
                        outlineOffset: '-1px',
                      } : {}),
                    }}
                  >
                    <div className="text-center">
                      <div>STAGE</div>
                      <div className="text-[8px] font-normal opacity-60 mt-0.5">{stage.stageType.replace('_', ' ')}</div>
                      <div className="text-[8px] font-normal opacity-40 mt-0.5">{stage.cols}×{stage.rows || 2}</div>
                    </div>
                  </div>
                )}

                {/* Object Labels */}
                {objects.map((obj) => (
                  <div
                    key={`obj-${obj.id}`}
                    className="absolute pointer-events-none flex items-center justify-center text-[8px] font-medium text-blue-300"
                    style={{
                      left: 32 + obj.col * cellSize * zoom,
                      top: 28 + obj.row * cellSize * zoom,
                      width: obj.cols * cellSize * zoom,
                      height: obj.rows * cellSize * zoom,
                      zIndex: 5,
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                    }}
                  >
                    {obj.label || obj.type}
                  </div>
                ))}

                {/* Resize Handles */}
                {mode === 'select' && selectedZone && !isPreview && (
                  <ResizeHandles
                    zone={selectedZone}
                    cellSize={cellSize}
                    zoom={zoom}
                  />
                )}

                {/* Stage Resize Handles */}
                {mode === 'select' && selectedStage && stage && !isPreview && (
                  <StageResizeHandles
                    stage={stage}
                    cellSize={cellSize}
                    zoom={zoom}
                  />
                )}

                {/* Draw Preview Rectangle */}
                {isDrawing && drawPreview && (
                  <div
                    className={cn(
                      'absolute pointer-events-none border-2 border-dashed border-amber-400 bg-amber-400/10',
                      isGA && zoneFormShape === 'rounded-rect' && 'rounded-xl',
                      isGA && zoneFormShape === 'ellipse' && 'rounded-full',
                      !isGA && 'rounded-sm'
                    )}
                    style={{
                      left: 32 + drawPreview.col * cellSize * zoom,
                      top: 28 + drawPreview.row * cellSize * zoom,
                      width: drawPreview.cols * cellSize * zoom,
                      height: drawPreview.rows * cellSize * zoom,
                      zIndex: 20,
                    }}
                  >
                    <div className="flex items-center justify-center w-full h-full text-[10px] text-amber-300 font-mono">
                      {drawPreview.rows}×{drawPreview.cols}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── Sidebar ─── */}
          {!sidebarCollapsed && (
            <div className="w-[280px] shrink-0 bg-gray-800 border-l border-gray-700 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
                {/* Object Palette (GA only, when in object mode) */}
                {isGA && mode === 'object' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <DoorOpen className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-semibold">Object Palette</span>
                    </div>
                    <p className="text-[10px] text-gray-500">Select an object, then click on the grid to place it.</p>
                    <div className="space-y-1.5">
                      {OBJECT_PRESETS.map((preset) => (
                        <button
                          key={preset.type}
                          onClick={() => setSelectedObjectType(selectedObjectType === preset.type ? null : preset.type)}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all',
                            selectedObjectType === preset.type
                              ? 'border-blue-500 bg-blue-900/20 text-blue-300'
                              : 'border-gray-700 bg-gray-700/30 text-gray-300 hover:border-gray-600 hover:bg-gray-700/50'
                          )}
                        >
                          <span className="text-lg">{preset.emoji}</span>
                          <div className="flex-1">
                            <div className="text-xs font-medium">{preset.label}</div>
                            <div className="text-[9px] text-gray-500">{preset.rows}×{preset.cols}</div>
                          </div>
                          {selectedObjectType === preset.type && (
                            <div className="w-2 h-2 rounded-full bg-blue-400" />
                          )}
                        </button>
                      ))}
                    </div>

                    <Separator className="bg-gray-700" />

                    {/* Objects list */}
                    {objects.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[10px] text-gray-500 font-medium">Placed Objects ({objects.length})</span>
                        <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                          {objects.map((obj) => {
                            const preset = OBJECT_PRESETS.find(p => p.type === obj.type)
                            return (
                              <div
                                key={obj.id}
                                className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-700/30 text-gray-300"
                              >
                                <span className="text-sm">{preset?.emoji || '📦'}</span>
                                <span className="text-xs flex-1 truncate">{obj.label || obj.type}</span>
                                <button
                                  onClick={() => updateLayout(prev => ({
                                    ...prev,
                                    objects: prev.objects.filter(o => o.id !== obj.id)
                                  }))}
                                  className="text-gray-600 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                <>
                {/* Zone Info / Stage Info / General Info */}
                {selectedZone ? (
                  <ZoneProperties
                    zone={selectedZone}
                    gridRows={gridRows}
                    gridCols={gridCols}
                    isGA={isGA}
                    onUpdate={(updates) => handleUpdateZone(selectedZone.id, updates)}
                    onDelete={() => handleDeleteZone(selectedZone.id)}
                  />
                ) : selectedStage && stage ? (
                  <StageProperties
                    stage={stage}
                    gridRows={gridRows}
                    gridCols={gridCols}
                    onUpdate={handleUpdateStage}
                  />
                ) : (
                  <GeneralInfo
                    totalZones={zones.length}
                    totalSeats={totalSeats}
                    gridRows={gridRows}
                    gridCols={gridCols}
                    zones={zones}
                    onSelectZone={(id) => {
                      setSelectedZoneId(id)
                      setMode('select')
                    }}
                  />
                )}

                <Separator className="bg-gray-700" />

                {/* Grid Settings */}
                <GridSettings
                  gridRows={gridRows}
                  gridCols={gridCols}
                  cellSize={cellSize}
                  onGridRowsChange={handleGridRowsChange}
                  onGridColsChange={handleGridColsChange}
                  onCellSizeChange={handleCellSizeChange}
                />

                <Separator className="bg-gray-700" />

                {/* Stage Settings */}
                <StageSettings
                  stage={stage}
                  gridRows={gridRows}
                  gridCols={gridCols}
                  onUpdate={(newStage) => {
                    updateLayout((prev) => ({ ...prev, stage: newStage }))
                  }}
                />

                <Separator className="bg-gray-700" />

                {/* Keyboard Shortcuts */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Settings2 className="w-3.5 h-3.5" />
                    <span className="font-medium">Shortcuts</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500">
                    <div><kbd className="bg-gray-700 px-1 rounded">1</kbd> Select</div>
                    <div><kbd className="bg-gray-700 px-1 rounded">2</kbd> Draw</div>
                    <div><kbd className="bg-gray-700 px-1 rounded">3</kbd> Erase</div>
                    {isGA && <div><kbd className="bg-gray-700 px-1 rounded">4</kbd> Object</div>}
                    {isGA && <div><kbd className="bg-gray-700 px-1 rounded">5</kbd> Polygon</div>}
                    <div><kbd className="bg-gray-700 px-1 rounded">Del</kbd> Delete</div>
                    <div><kbd className="bg-gray-700 px-1 rounded">⌘Z</kbd> Undo</div>
                    <div><kbd className="bg-gray-700 px-1 rounded">⌘Y</kbd> Redo</div>
                    {isGA && <div><kbd className="bg-gray-700 px-1 rounded">Esc</kbd> Cancel Poly</div>}
                    {isGA && <div><kbd className="bg-gray-700 px-1 rounded">Enter</kbd> Close Poly</div>}
                  </div>
                </div>
                </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── Bottom Toolbar ─── */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-t border-gray-700 shrink-0">
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span>{isGA ? 'GENERAL ADMISSION EDITOR' : 'PIANO ROLL EDITOR'}</span>
            <span>•</span>
            <span>Cell: {cellSize}px</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setZoom(1)} className="h-6 text-[10px] text-gray-400 hover:text-gray-200">
              Reset Zoom
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Zone Creation Dialog ─── */}
      <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
        <DialogContent className="sm:max-w-[380px] bg-gray-800 border-gray-700 text-gray-200">
          <DialogHeader>
            <DialogTitle className="text-sm">Zona Baru ({pendingZone?.rows}×{pendingZone?.cols})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Shape Selector (GA only) */}
            {isGA && (
              <div className="space-y-2">
                <Label className="text-xs text-gray-400">Shape</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setZoneFormShape('rectangle')}
                    className={cn(
                      'flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-lg border-2 transition-all',
                      zoneFormShape === 'rectangle'
                        ? 'border-amber-500 bg-amber-900/20'
                        : 'border-gray-600 hover:border-gray-500'
                    )}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-300">
                      <rect x="3" y="5" width="18" height="14" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    <span className="text-[10px] text-gray-400">Rectangle</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoneFormShape('rounded-rect')}
                    className={cn(
                      'flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-lg border-2 transition-all',
                      zoneFormShape === 'rounded-rect'
                        ? 'border-amber-500 bg-amber-900/20'
                        : 'border-gray-600 hover:border-gray-500'
                    )}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-300">
                      <rect x="3" y="5" width="18" height="14" rx="4" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    <span className="text-[10px] text-gray-400">Rounded</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoneFormShape('ellipse')}
                    className={cn(
                      'flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-lg border-2 transition-all',
                      zoneFormShape === 'ellipse'
                        ? 'border-amber-500 bg-amber-900/20'
                        : 'border-gray-600 hover:border-gray-500'
                    )}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-300">
                      <ellipse cx="12" cy="12" rx="9" ry="7" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    <span className="text-[10px] text-gray-400">Ellipse</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoneFormShape('polygon')}
                    className={cn(
                      'flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-lg border-2 transition-all',
                      zoneFormShape === 'polygon'
                        ? 'border-amber-500 bg-amber-900/20'
                        : 'border-gray-600 hover:border-gray-500'
                    )}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-300">
                      <polygon points="12,3 21,10 18,21 6,21 3,10" stroke="currentColor" strokeWidth="2" fill="none" />
                    </svg>
                    <span className="text-[10px] text-gray-400">Polygon</span>
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs text-gray-400">Zone Name</Label>
              <Input
                value={zoneFormName}
                onChange={(e) => setZoneFormName(e.target.value)}
                placeholder="e.g. VIP Left, Regular Center"
                className="bg-gray-700 border-gray-600 text-gray-200 h-9 text-sm"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleZoneDialogSubmit() }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-gray-400">Color</Label>
              <div className="flex flex-wrap gap-2">
                {ZONE_COLORS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'w-7 h-7 rounded-md border-2 transition-all',
                      zoneFormColor === color ? 'border-white scale-110' : 'border-transparent hover:border-gray-500'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setZoneFormColor(color)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Label className="text-[10px] text-gray-500">Custom:</Label>
                <Input
                  value={zoneFormColor}
                  onChange={(e) => setZoneFormColor(e.target.value)}
                  className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-xs font-mono w-24"
                  maxLength={7}
                />
                <div className="w-7 h-7 rounded-md border border-gray-600" style={{ backgroundColor: zoneFormColor }} />
              </div>
            </div>
            {isGA && (
              <div className="space-y-2">
                <Label className="text-xs text-gray-400">Kapasitas (orang)</Label>
                <Input
                  type="number"
                  value={zoneFormCapacity ?? ''}
                  onChange={(e) => setZoneFormCapacity(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder={pendingZone ? `${pendingZone.rows * pendingZone.cols}` : ''}
                  className="bg-gray-700 border-gray-600 text-gray-200 h-9 text-sm"
                  min={1}
                />
                <p className="text-[10px] text-gray-500">Kosongkan = {pendingZone?.rows || 0}×{pendingZone?.cols || 0} = {pendingZone ? pendingZone.rows * pendingZone.cols : 0}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setZoneDialogOpen(false)} className="text-gray-400">
              Cancel
            </Button>
            <Button
              onClick={handleZoneDialogSubmit}
              disabled={!zoneFormName.trim()}
              className="bg-amber-700 hover:bg-amber-600 text-white"
            >
              Create Zone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}

// ═══════════════════════════════════════════
// Sub-Components
// ═══════════════════════════════════════════

function ResizeHandles({ zone, cellSize, zoom }: { zone: PianoRollZone; cellSize: number; zoom: number }) {
  const handleSize = 6
  const x = zone.col * cellSize * zoom
  const y = zone.row * cellSize * zoom
  const w = zone.cols * cellSize * zoom
  const h = zone.rows * cellSize * zoom

  const handles: { key: string; cx: number; cy: number; cursor: string }[] = [
    { key: 'n', cx: x + w / 2, cy: y, cursor: 'ns-resize' },
    { key: 's', cx: x + w / 2, cy: y + h, cursor: 'ns-resize' },
    { key: 'e', cx: x + w, cy: y + h / 2, cursor: 'ew-resize' },
    { key: 'w', cx: x, cy: y + h / 2, cursor: 'ew-resize' },
    { key: 'nw', cx: x, cy: y, cursor: 'nwse-resize' },
    { key: 'ne', cx: x + w, cy: y, cursor: 'nesw-resize' },
    { key: 'sw', cx: x, cy: y + h, cursor: 'nesw-resize' },
    { key: 'se', cx: x + w, cy: y + h, cursor: 'nwse-resize' },
  ]

  return (
    <div className="absolute pointer-events-none" style={{ zIndex: 15 }}>
      {handles.map(({ key, cx, cy, cursor }) => (
        <div
          key={key}
          className="absolute bg-amber-400 border border-amber-300 pointer-events-auto"
          style={{
            left: 32 + cx - handleSize / 2,
            top: 28 + cy - handleSize / 2,
            width: handleSize,
            height: handleSize,
            cursor,
          }}
        />
      ))}
    </div>
  )
}

function StageResizeHandles({ stage, cellSize, zoom }: { stage: PianoRollStage; cellSize: number; zoom: number }) {
  const handleSize = 6
  const stageRows = stage.rows || 2
  const x = stage.col * cellSize * zoom
  const y = stage.row * cellSize * zoom
  const w = stage.cols * cellSize * zoom
  const h = stageRows * cellSize * zoom

  const handles: { key: string; cx: number; cy: number; cursor: string }[] = [
    { key: 'n', cx: x + w / 2, cy: y, cursor: 'ns-resize' },
    { key: 's', cx: x + w / 2, cy: y + h, cursor: 'ns-resize' },
    { key: 'e', cx: x + w, cy: y + h / 2, cursor: 'ew-resize' },
    { key: 'w', cx: x, cy: y + h / 2, cursor: 'ew-resize' },
    { key: 'nw', cx: x, cy: y, cursor: 'nwse-resize' },
    { key: 'ne', cx: x + w, cy: y, cursor: 'nesw-resize' },
    { key: 'sw', cx: x, cy: y + h, cursor: 'nesw-resize' },
    { key: 'se', cx: x + w, cy: y + h, cursor: 'nwse-resize' },
  ]

  return (
    <div className="absolute pointer-events-none" style={{ zIndex: 15 }}>
      {handles.map(({ key, cx, cy, cursor }) => (
        <div
          key={key}
          className="absolute bg-cyan-400 border border-cyan-300 pointer-events-auto"
          style={{
            left: 32 + cx - handleSize / 2,
            top: 28 + cy - handleSize / 2,
            width: handleSize,
            height: handleSize,
            cursor,
          }}
        />
      ))}
    </div>
  )
}

function ZoneProperties({
  zone,
  gridRows,
  gridCols,
  isGA,
  onUpdate,
  onDelete,
}: {
  zone: PianoRollZone
  gridRows: number
  gridCols: number
  isGA?: boolean
  onUpdate: (updates: Partial<PianoRollZone>) => void
  onDelete: () => void
}) {
  // Calculate effective capacity for polygon zones
  const effectiveCapacity = useMemo(() => {
    if (zone.shape === 'polygon' && zone.points && zone.points.length >= 3) {
      return zone.capacity || getPolygonCells(zone.points).size
    }
    return zone.capacity || zone.rows * zone.cols
  }, [zone])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: zone.color }} />
          <span className="text-xs font-semibold">Zone Properties</span>
        </div>
        <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-700 bg-gray-800">
          {isGA ? `${effectiveCapacity} orang` : `${zone.rows * zone.cols} seats`}
        </Badge>
      </div>

      {/* Name */}
      <div className="space-y-1">
        <Label className="text-[10px] text-gray-500">Name</Label>
        <Input
          value={zone.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="bg-gray-700 border-gray-600 text-gray-200 h-8 text-xs"
        />
      </div>

      {/* Capacity (GA only) */}
      {isGA && (
        <div className="space-y-1">
          <Label className="text-[10px] text-gray-500">Kapasitas (orang)</Label>
          <Input
            type="number"
            value={zone.capacity ?? ''}
            onChange={(e) => onUpdate({ capacity: e.target.value ? Number(e.target.value) : undefined })}
            placeholder={String(effectiveCapacity)}
            className="bg-gray-700 border-gray-600 text-gray-200 h-8 text-xs"
            min={1}
          />
          <p className="text-[9px] text-gray-600">Kosongkan = auto ({effectiveCapacity})</p>
        </div>
      )}

      {/* Shape Info */}
      {isGA && zone.shape && (
        <div className="text-[10px] text-gray-500 font-mono bg-gray-700/50 rounded px-2 py-1.5">
          Shape: {zone.shape === 'polygon' ? `Polygon (${zone.points?.length || 0} vertices)` : zone.shape}
        </div>
      )}

      {/* Color */}
      <div className="space-y-1">
        <Label className="text-[10px] text-gray-500">Color</Label>
        <div className="flex flex-wrap gap-1.5">
          {ZONE_COLORS.map((color) => (
            <button
              key={color}
              className={cn(
                'w-5 h-5 rounded border transition-all',
                zone.color === color ? 'border-white scale-110' : 'border-transparent hover:border-gray-500'
              )}
              style={{ backgroundColor: color }}
              onClick={() => onUpdate({ color })}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Input
            value={zone.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-[10px] font-mono w-20"
            maxLength={7}
          />
          <div className="w-5 h-5 rounded border border-gray-600" style={{ backgroundColor: zone.color }} />
        </div>
      </div>

      {/* Position (hidden for polygon zones) */}
      {zone.shape !== 'polygon' && (
      <div className="space-y-1">
        <Label className="text-[10px] text-gray-500">Position</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[9px] text-gray-600">Row</span>
            <Input
              type="number"
              value={zone.row}
              onChange={(e) => onUpdate({ row: clamp(Number(e.target.value), 0, gridRows - 1) })}
              className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-xs font-mono"
              min={0}
              max={gridRows - 1}
            />
          </div>
          <div>
            <span className="text-[9px] text-gray-600">Col</span>
            <Input
              type="number"
              value={zone.col}
              onChange={(e) => onUpdate({ col: clamp(Number(e.target.value), 0, gridCols - 1) })}
              className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-xs font-mono"
              min={0}
              max={gridCols - 1}
            />
          </div>
          <div>
            <span className="text-[9px] text-gray-600">Rows</span>
            <Input
              type="number"
              value={zone.rows}
              onChange={(e) => onUpdate({ rows: clamp(Number(e.target.value), 1, gridRows - zone.row) })}
              className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-xs font-mono"
              min={1}
              max={gridRows - zone.row}
            />
          </div>
          <div>
            <span className="text-[9px] text-gray-600">Cols</span>
            <Input
              type="number"
              value={zone.cols}
              onChange={(e) => onUpdate({ cols: clamp(Number(e.target.value), 1, gridCols - zone.col) })}
              className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-xs font-mono"
              min={1}
              max={gridCols - zone.col}
            />
          </div>
        </div>
      </div>
      )}

      {/* Row/Col Range Display (hidden for polygon) */}
      {zone.shape !== 'polygon' && (
      <div className="text-[10px] text-gray-500 font-mono bg-gray-700/50 rounded px-2 py-1.5">
        {getRowLabel(zone.row)}{zone.col + 1} → {getRowLabel(zone.row + zone.rows - 1)}{zone.col + zone.cols}
      </div>
      )}

      {/* Delete */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="w-full h-8 text-red-400 hover:text-red-300 hover:bg-red-900/20 text-xs gap-1.5"
      >
        <Trash2 className="w-3 h-3" />
        Delete Zone
      </Button>
    </div>
  )
}

function StageProperties({
  stage,
  gridRows,
  gridCols,
  onUpdate,
}: {
  stage: PianoRollStage
  gridRows: number
  gridCols: number
  onUpdate: (updates: Partial<PianoRollStage>) => void
}) {
  const stageTypes: Array<PianoRollStage['stageType']> = ['PROSCENIUM', 'AMPHITHEATER', 'BLACK_BOX', 'THRUST', 'ARENA']

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-semibold">Stage Properties</span>
        </div>
        <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-700 bg-gray-800">
          {stage.cols}×{stage.rows || 2}
        </Badge>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] text-gray-500">Stage Type</Label>
        <Select
          value={stage.stageType}
          onValueChange={(v) => onUpdate({ stageType: v as PianoRollStage['stageType'] })}
        >
          <SelectTrigger className="bg-gray-700 border-gray-600 text-gray-200 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700">
            {stageTypes.map((t) => (
              <SelectItem key={t} value={t} className="text-gray-200 text-xs">
                {t.replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] text-gray-500">Position</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[9px] text-gray-600">Row</span>
            <Input
              type="number"
              value={stage.row}
              onChange={(e) => onUpdate({ row: clamp(Number(e.target.value), 0, gridRows - 1) })}
              className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-xs font-mono"
              min={0}
              max={gridRows - 1}
            />
          </div>
          <div>
            <span className="text-[9px] text-gray-600">Col</span>
            <Input
              type="number"
              value={stage.col}
              onChange={(e) => onUpdate({ col: clamp(Number(e.target.value), 0, gridCols - 2) })}
              className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-xs font-mono"
              min={0}
              max={gridCols - 2}
            />
          </div>
          <div>
            <span className="text-[9px] text-gray-600">Rows</span>
            <Input
              type="number"
              value={stage.rows || 2}
              onChange={(e) => onUpdate({ rows: clamp(Number(e.target.value), 1, gridRows - stage.row) })}
              className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-xs font-mono"
              min={1}
              max={gridRows - stage.row}
            />
          </div>
          <div>
            <span className="text-[9px] text-gray-600">Cols</span>
            <Input
              type="number"
              value={stage.cols}
              onChange={(e) => onUpdate({ cols: clamp(Number(e.target.value), 2, gridCols - stage.col) })}
              className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-xs font-mono"
              min={2}
              max={gridCols - stage.col}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function GeneralInfo({
  totalZones,
  totalSeats,
  gridRows,
  gridCols,
  zones,
  onSelectZone,
}: {
  totalZones: number
  totalSeats: number
  gridRows: number
  gridCols: number
  zones: PianoRollZone[]
  onSelectZone: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <LayoutGrid className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-semibold">Overview</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-700/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-gold">{totalSeats}</div>
          <div className="text-[10px] text-gray-500">Total Seats</div>
        </div>
        <div className="bg-gray-700/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-gray-300">{totalZones}</div>
          <div className="text-[10px] text-gray-500">Zones</div>
        </div>
      </div>

      <div className="text-[10px] text-gray-500">
        Grid: {gridRows} rows × {gridCols} cols
      </div>

      {zones.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-gray-500 font-medium">Zones:</span>
          <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
            {zones.map((z) => (
              <button
                key={z.id}
                onClick={() => onSelectZone(z.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700/50 transition-colors text-left"
              >
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: z.color }} />
                <span className="text-xs text-gray-300 truncate flex-1">{z.name}</span>
                <span className="text-[10px] text-gray-500 font-mono">{z.rows * z.cols}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {zones.length === 0 && (
        <div className="text-center py-6">
          <Pencil className="w-6 h-6 text-gray-600 mx-auto mb-2" />
          <p className="text-[10px] text-gray-600">No zones yet.</p>
          <p className="text-[10px] text-gray-600">Select Draw mode (2) and drag on the grid.</p>
        </div>
      )}
    </div>
  )
}

function GridSettings({
  gridRows,
  gridCols,
  cellSize,
  onGridRowsChange,
  onGridColsChange,
  onCellSizeChange,
}: {
  gridRows: number
  gridCols: number
  cellSize: number
  onGridRowsChange: (v: number) => void
  onGridColsChange: (v: number) => void
  onCellSizeChange: (v: number) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Settings2 className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-semibold">Grid Settings</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-gray-500">Rows ({MIN_GRID_ROWS}–{MAX_GRID_ROWS})</Label>
          <Input
            type="number"
            value={gridRows}
            onChange={(e) => onGridRowsChange(Number(e.target.value))}
            className="bg-gray-700 border-gray-600 text-gray-200 h-8 text-xs font-mono"
            min={MIN_GRID_ROWS}
            max={MAX_GRID_ROWS}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-gray-500">Cols ({MIN_GRID_COLS}–{MAX_GRID_COLS})</Label>
          <Input
            type="number"
            value={gridCols}
            onChange={(e) => onGridColsChange(Number(e.target.value))}
            className="bg-gray-700 border-gray-600 text-gray-200 h-8 text-xs font-mono"
            min={MIN_GRID_COLS}
            max={MAX_GRID_COLS}
          />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] text-gray-500">Cell Size: {cellSize}px</Label>
        </div>
        <input
          type="range"
          min={MIN_CELL_SIZE}
          max={MAX_CELL_SIZE}
          step={2}
          value={cellSize}
          onChange={(e) => onCellSizeChange(Number(e.target.value))}
          className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-amber-500"
        />
        <div className="flex justify-between text-[9px] text-gray-600">
          <span>{MIN_CELL_SIZE}px</span>
          <span>{MAX_CELL_SIZE}px</span>
        </div>
      </div>
    </div>
  )
}

function StageSettings({
  stage,
  gridRows,
  gridCols,
  onUpdate,
}: {
  stage: PianoRollStage | null
  gridRows: number
  gridCols: number
  onUpdate: (stage: PianoRollStage | null) => void
}) {
  const hasStage = !!stage
  const stageTypes: Array<PianoRollStage['stageType']> = ['PROSCENIUM', 'AMPHITHEATER', 'BLACK_BOX', 'THRUST', 'ARENA']

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Maximize2 className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold">Stage</span>
        </div>
        <Switch
          checked={hasStage}
          onCheckedChange={(checked) => {
            if (checked) {
              onUpdate({
                row: 0,
                col: Math.floor(gridCols / 2) - 5,
                rows: 2,
                cols: Math.min(10, gridCols),
                stageType: 'PROSCENIUM',
              })
            } else {
              onUpdate(null)
            }
          }}
        />
      </div>

      {stage && (
        <div className="space-y-2 pl-1">
          <div className="space-y-1">
            <Label className="text-[10px] text-gray-500">Type</Label>
            <Select
              value={stage.stageType}
              onValueChange={(v) => onUpdate({ ...stage, stageType: v as PianoRollStage['stageType'] })}
            >
              <SelectTrigger className="bg-gray-700 border-gray-600 text-gray-200 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                {stageTypes.map((t) => (
                  <SelectItem key={t} value={t} className="text-gray-200 text-xs">
                    {t.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-gray-500">Row</Label>
              <Input
                type="number"
                value={stage.row}
                onChange={(e) => onUpdate({ ...stage, row: clamp(Number(e.target.value), 0, gridRows - 1) })}
                className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-xs font-mono"
                min={0}
                max={gridRows - 1}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-gray-500">Start Col</Label>
              <Input
                type="number"
                value={stage.col}
                onChange={(e) => onUpdate({ ...stage, col: clamp(Number(e.target.value), 0, gridCols - 2) })}
                className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-xs font-mono"
                min={0}
                max={gridCols - 2}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-gray-500">Height (rows)</Label>
              <Input
                type="number"
                value={stage.rows || 2}
                onChange={(e) => onUpdate({ ...stage, rows: clamp(Number(e.target.value), 1, gridRows - stage.row) })}
                className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-xs font-mono"
                min={1}
                max={gridRows - stage.row}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-gray-500">Width (cols)</Label>
              <Input
                type="number"
                value={stage.cols}
                onChange={(e) => onUpdate({ ...stage, cols: clamp(Number(e.target.value), 2, gridCols - stage.col) })}
                className="bg-gray-700 border-gray-600 text-gray-200 h-7 text-xs font-mono"
                min={2}
                max={gridCols - stage.col}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
