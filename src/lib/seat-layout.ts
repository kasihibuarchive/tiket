// Shared seat layout parsing utilities
// Used by both the public seat map (seat-map.tsx) and the usher seat map view
// NOTE: No 'use client' directive — this is a pure utility module with no React/JSX.
// Adding 'use client' can cause webpack ESM/CJS interop issues with global
// built-ins like Map/Set in production builds.

export type LayoutObjectType = 'FOH' | 'ENTRANCE' | 'CUSTOM_SHAPE'

export interface LayoutObject {
  id: string
  type: LayoutObjectType
  label: string
  r: number
  c: number
  w: number
  h: number
  color: string
  // Pixel-based positions from canvas drag-and-drop (preferred for rendering)
  x?: number
  y?: number
  pixelW?: number
  pixelH?: number
}

/**
 * Canvas-to-guest-view coordinate transform computed from seatColumns.
 * Consumers use these bounds to map canvas pixel coords (stage, objects)
 * into guest-view grid coordinates.
 */
export interface CanvasSeatBounds {
  /** Canvas pixel X of the leftmost seat */
  originX: number
  /** Canvas pixel Y of the topmost seat */
  originY: number
  /** Canvas pixel span of the seat grid horizontally (rightmost right edge - leftmost left edge) */
  spanX: number
  /** Canvas pixel span of the seat grid vertically (bottommost bottom edge - topmost top edge) */
  spanY: number
}

export interface ParsedLayout {
  gridSize: { rows: number; cols: number }
  rowLabels: string[]
  sections: Array<{ name: string; fromRow: number; toRow: number; colorCode: string }>
  aisleColumns: number[]
  rowSeatMap: Map<number, Array<{ c: number; seatNum: number; block?: string }>>
  embeddedRows: Record<string, number> // source row index → target row index
  displayRows: number[] // row indices to actually render (excludes embedded source rows)
  objects?: LayoutObject[]
  stageType?: string
  /** Stage position in canvas pixel coordinates */
  stagePosition?: { x: number; y: number; width: number; height: number }
  thrustWidth?: number
  thrustDepth?: number
  canvasWidth?: number
  canvasHeight?: number
  /** Bounding box of seats in canvas pixel space (for coordinate mapping) */
  canvasSeatBounds?: CanvasSeatBounds
  /** Individual seats with canvas pixel positions (for canvas-based rendering) */
  canvasSeats?: Array<{
    x: number
    y: number
    seatCode: string
    seatNum: number
    rowLabel: string
  }>
  /** Full canvas bounds encompassing seats + stage + objects */
  fullCanvasBounds?: {
    x: number
    y: number
    width: number
    height: number
  }
  /** GA zone information for General Admission layouts */
  gaZones?: Array<{
    id: string
    name: string
    capacity: number
    color: string
    row: number
    col: number
    rows: number
    cols: number
  }>
  /** Whether this is a General Admission layout */
  isGA?: boolean
  /** URL of exported layout image (GA only) */
  layoutImageUrl?: string | null
}

/**
 * Infer blocks for a row based on column position patterns.
 * Detects center rows (small cluster in middle) vs left+right rows (gap in middle).
 */
function inferBlocksForRow(
  rowSeats: Array<{ c: number }>
): Array<string> {
  if (rowSeats.length === 0) return []

  const sorted = [...rowSeats].sort((a, b) => a.c - b.c)
  const n = sorted.length

  // Find the largest gap between consecutive seats
  let maxGap = 0
  let maxGapIdx = -1
  for (let i = 1; i < n; i++) {
    const gap = sorted[i].c - sorted[i - 1].c - 1
    if (gap > maxGap) {
      maxGap = gap
      maxGapIdx = i
    }
  }

  // Small row (<=4 seats) with no big gap → center
  if (n <= 4 && maxGap <= 2) {
    return sorted.map(() => 'center')
  }

  // Large gap (>=4 empty columns) → split into left/right
  if (maxGap >= 4) {
    return sorted.map((_, i) => (i < maxGapIdx ? 'left' : 'right'))
  }

  // Medium gap (2-3 empty columns) → split there
  if (maxGap >= 2 && maxGapIdx > 0 && maxGapIdx < n) {
    return sorted.map((_, i) => (i < maxGapIdx ? 'left' : 'right'))
  }

  // No significant gap but wide span → split at midpoint
  const minC = sorted[0].c
  const maxC = sorted[n - 1].c
  const midCol = (minC + maxC) / 2
  return sorted.map((s) => (s.c <= midCol ? 'left' : 'right'))
}

function inferEmbeddedRows(
  rowSeatMap: Map<number, Array<{ c: number; seatNum: number; block?: string }>>,
  totalRows: number,
  cols: number
): Record<string, number> {
  const embedded: Record<string, number> = {}
  const maxEmbedSearch = Math.min(6, totalRows)

  const candidates: number[] = []
  for (let r = 0; r < maxEmbedSearch; r++) {
    const rowSeats = rowSeatMap.get(r)
    if (!rowSeats || rowSeats.length === 0) continue
    const blocks = inferBlocksForRow(rowSeats)
    const allCenter = blocks.every((b) => b === 'center')
    if (allCenter && rowSeats.length <= 4) {
      candidates.push(r)
    } else {
      break
    }
  }

  if (candidates.length === 0) return embedded

  const lastCandidate = candidates[candidates.length - 1]
  const targets: number[] = []
  for (let tr = lastCandidate + 1; tr < totalRows; tr++) {
    const targetSeats = rowSeatMap.get(tr)
    if (!targetSeats || targetSeats.length === 0) continue
    const targetBlocks = inferBlocksForRow(targetSeats)
    if (targetBlocks.includes('left') && targetBlocks.includes('right')) {
      targets.push(tr)
    }
    if (targets.length >= candidates.length) break
  }

  for (let i = 0; i < Math.min(candidates.length, targets.length); i++) {
    embedded[String(candidates[i])] = targets[i]
  }

  return embedded
}

/**
 * Convert a grid row index to a row label letter(s): 0→A, 25→Z, 26→AA, etc.
 */
function getRowLabelFromIndex(gridRow: number): string {
  let label = ''
  let n = gridRow
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}

export function parseLayoutData(layoutData: any): ParsedLayout | null {
  if (!layoutData) return null
  const data = typeof layoutData === 'string' ? JSON.parse(layoutData) : layoutData
  if (!data) return null

  // ═══ GENERAL_ADMISSION layout ═══
  if (data.type === 'GENERAL_ADMISSION') {
    const gridRows: number = data.gridRows || 15
    const gridCols: number = data.gridCols || 25
    const cellSize: number = data.cellSize || 32
    const zones: any[] = Array.isArray(data.zones) ? data.zones : []

    // Build GA zones array
    const gaZones = zones.map((zone: any) => ({
      id: zone.id || 'ga-' + Math.random().toString(36).slice(2, 8),
      name: zone.name || 'GA',
      capacity: zone.capacity || (zone.rows || 1) * (zone.cols || 1),
      color: zone.color || '#8B8680',
      row: zone.row ?? 0,
      col: zone.col ?? 0,
      rows: zone.rows ?? 1,
      cols: zone.cols ?? 1,
    }))

    // Stage info
    const stageType = data.stage?.stageType || 'PROSCENIUM'
    let stagePosition: { x: number; y: number; width: number; height: number } | undefined
    if (data.stage && typeof data.stage.row === 'number') {
      stagePosition = {
        x: (data.stage.col || 0) * cellSize,
        y: (data.stage.row || 0) * cellSize,
        width: (data.stage.cols || 5) * cellSize,
        height: cellSize,
      }
    }

    // Parse objects
    const objects: LayoutObject[] = Array.isArray(data.objects)
      ? data.objects.map((o: any) => ({
          id: o.id || `obj-${Math.random().toString(36).slice(2, 8)}`,
          type: (o.type || 'CUSTOM_SHAPE') as LayoutObjectType,
          label: o.label || '',
          r: o.row ?? o.r ?? 0,
          c: o.col ?? o.c ?? 0,
          w: o.cols ?? o.w ?? 1,
          h: o.rows ?? o.h ?? 1,
          color: '#6B7280',
          x: (o.col ?? o.c ?? 0) * cellSize,
          y: (o.row ?? o.r ?? 0) * cellSize,
          pixelW: (o.cols ?? o.w ?? 1) * cellSize,
          pixelH: (o.rows ?? o.h ?? 1) * cellSize,
        }))
      : []

    return {
      gridSize: { rows: 1, cols: 1 },
      rowLabels: [],
      sections: [],
      aisleColumns: [],
      rowSeatMap: new Map(),
      embeddedRows: {},
      displayRows: [],
      objects,
      stageType,
      stagePosition,
      canvasWidth: gridCols * cellSize,
      canvasHeight: gridRows * cellSize,
      gaZones,
      isGA: true,
      layoutImageUrl: data.layoutImageUrl || null,
    }
  }

  // ═══ PIANO_ROLL layout ═══
  if (data.type === 'PIANO_ROLL') {
    const gridRows: number = data.gridRows || 15
    const gridCols: number = data.gridCols || 25
    const cellSize: number = data.cellSize || 32
    const zones: any[] = Array.isArray(data.zones) ? data.zones : []

    // Build seats from zones — each zone generates seats at every grid position
    const rawSeats: any[] = []
    const sections: any[] = []
    const rowLabels: string[] = []

    // Collect unique row indices used by any zone
    const usedRows = new Set<number>()
    for (const zone of zones) {
      const zr = zone.row ?? 0
      const zc = zone.col ?? 0
      const zRows = zone.rows ?? 1
      const zCols = zone.cols ?? 1
      for (let r = zr; r < zr + zRows; r++) {
        usedRows.add(r)
      }
    }

    // Sort row indices for consistent ordering
    const sortedRows = [...usedRows].sort((a, b) => a - b)

    // Assign row labels: A, B, C... based on sorted order
    const rowIndexMap = new Map<number, number>()
    for (let i = 0; i < sortedRows.length; i++) {
      rowIndexMap.set(sortedRows[i], i)
      rowLabels.push(getRowLabelFromIndex(i))
    }

    // Build section from each zone
    for (const zone of zones) {
      const zr = zone.row ?? 0
      const zRows = zone.rows ?? 1
      const fromRow = rowIndexMap.get(zr) ?? 0
      const toRow = rowIndexMap.get(zr + zRows - 1) ?? fromRow
      sections.push({
        name: zone.name || 'Zone',
        fromRow,
        toRow,
        colorCode: zone.color || '#8B8680',
      })
    }

    // Build rowSeatMap and rawSeats
    const rowSeatMap = new Map<number, Array<{ c: number; seatNum: number }>>()
    for (const zone of zones) {
      const zr = zone.row ?? 0
      const zc = zone.col ?? 0
      const zRows = zone.rows ?? 1
      const zCols = zone.cols ?? 1
      for (let r = zr; r < zr + zRows; r++) {
        const mappedRow = rowIndexMap.get(r) ?? 0
        if (!rowSeatMap.has(mappedRow)) rowSeatMap.set(mappedRow, [])
        const rowSeats = rowSeatMap.get(mappedRow)!

        // Collect all column positions in this row across all zones
        for (let c = zc; c < zc + zCols; c++) {
          rawSeats.push({ r: mappedRow, c })
          rowSeats.push({ c, seatNum: 0 }) // seatNum will be assigned below
        }
      }
    }

    // Assign sequential seatNum per row
    for (const [rowIdx, rowSeats] of rowSeatMap) {
      const sorted = [...rowSeats].sort((a, b) => a.c - b.c)
      const colToNum = new Map<number, number>()
      sorted.forEach((s, idx) => {
        colToNum.set(s.c, idx + 1)
      })
      rowSeatMap.set(rowIdx, sorted.map(s => ({ c: s.c, seatNum: colToNum.get(s.c) || 1 })))
    }

    const displayRows = sortedRows.map((_, i) => i)
    const totalRows = sortedRows.length
    const maxCol = rawSeats.length > 0 ? Math.max(...rawSeats.map(s => s.c)) + 1 : gridCols

    // Build canvasSeats for canvas-based rendering
    // CRITICAL: seatCode format must match generate-seats API output.
    // generate-seats uses `${rowLabel}${gridCol + 1}` (e.g., A1, B3, C15)
    // where gridCol is the absolute grid column index, NOT sequential seat number.
    const canvasSeats: Array<{ x: number; y: number; seatCode: string; seatNum: number; rowLabel: string }> = []
    for (const [rowIdx, rowSeats] of rowSeatMap) {
      const label = rowLabels[rowIdx] || getRowLabelFromIndex(rowIdx)
      const sorted = [...rowSeats].sort((a, b) => a.c - b.c)
      for (const s of sorted) {
        canvasSeats.push({
          x: s.c * cellSize,
          y: rowIdx * cellSize,
          // seatCode must match generate-seats: ${rowLabel}${gridCol + 1}
          seatCode: `${label}${s.c + 1}`,
          // seatNum is sequential display number within the row
          seatNum: s.seatNum,
          rowLabel: label,
        })
      }
    }

    // Parse objects
    const objects: LayoutObject[] = Array.isArray(data.objects)
      ? data.objects.map((o: any) => ({
          id: o.id || `obj-${Math.random().toString(36).slice(2, 8)}`,
          type: (o.type || 'CUSTOM_SHAPE') as LayoutObjectType,
          label: o.label || '',
          r: o.row ?? o.r ?? 0,
          c: o.col ?? o.c ?? 0,
          w: o.cols ?? o.w ?? 1,
          h: o.rows ?? o.h ?? 1,
          color: '#6B7280',
          x: (o.col ?? o.c ?? 0) * cellSize,
          y: (o.row ?? o.r ?? 0) * cellSize,
          pixelW: (o.cols ?? o.w ?? 1) * cellSize,
          pixelH: (o.rows ?? o.h ?? 1) * cellSize,
        }))
      : []

    // Stage info
    const stageType = data.stage?.stageType || 'PROSCENIUM'
    let stagePosition: { x: number; y: number; width: number; height: number } | undefined
    if (data.stage && typeof data.stage.row === 'number') {
      stagePosition = {
        x: (data.stage.col || 0) * cellSize,
        y: (data.stage.row || 0) * cellSize,
        width: (data.stage.cols || 5) * cellSize,
        height: cellSize,
      }
    }

    // Canvas bounds
    const canvasWidth = gridCols * cellSize
    const canvasHeight = totalRows * cellSize

    return {
      gridSize: { rows: totalRows, cols: maxCol },
      rowLabels,
      sections,
      aisleColumns: [],
      rowSeatMap,
      embeddedRows: {},
      displayRows,
      objects,
      stageType,
      stagePosition,
      canvasWidth,
      canvasHeight,
      canvasSeats,
      fullCanvasBounds: { x: 0, y: 0, width: canvasWidth, height: canvasHeight },
    }
  }

  // ═══ NUMBERED layout (original) ═══
  if (data.type !== 'NUMBERED' || !data.gridSize) return null

  const rawSeats: any[] = data.seats || []
  const rowLabels: string[] = data.rowLabels || []
  const sections = data.sections || []
  const aisleColumns: number[] = Array.isArray(data.aisleColumns) ? data.aisleColumns : []
  const { rows, cols } = data.gridSize

  // Group by row and assign seat numbers
  const rowGroups: Record<number, any[]> = {}
  for (const s of rawSeats) {
    const r = s.r ?? s.row ?? 0
    if (!rowGroups[r]) rowGroups[r] = []
    rowGroups[r].push(s)
  }

  const rowSeatMap = new Map<number, Array<{ c: number; seatNum: number; block?: string }>>()
  for (const [rStr, rowSeats] of Object.entries(rowGroups)) {
    const r = parseInt(rStr)
    const sorted = [...rowSeats].sort((a: any, b: any) => (a.c ?? a.col ?? 0) - (b.c ?? b.col ?? 0))

    // Deduplicate c values within each row: if two seats share the same c,
    // shift the later one(s) right. This prevents Map.set from silently
    // overwriting duplicates in the grid renderer.
    const deduped: typeof sorted = []
    const usedC = new Set<number>()
    for (const s of sorted) {
      let c = s.c ?? s.col ?? 0
      while (usedC.has(c)) c++
      usedC.add(c)
      deduped.push({ ...s, c })
    }

    // Infer blocks AFTER dedup so positions are accurate
    const allHaveBlock = deduped.every((s: any) => s.block)
    let inferredBlocks: string[] | null = null
    if (!allHaveBlock) {
      inferredBlocks = inferBlocksForRow(deduped.map((s: any) => ({ c: s.c })))
    }

    rowSeatMap.set(r, deduped.map((s: any, idx: number) => ({
      c: s.c,
      seatNum: idx + 1,
      block: s.block || (inferredBlocks ? inferredBlocks[idx] : undefined),
    })))
  }

  let embeddedRows: Record<string, number> = data.embeddedRows || {}
  if (Object.keys(embeddedRows).length === 0) {
    embeddedRows = inferEmbeddedRows(rowSeatMap, rows, cols)
  }

  const embeddedSourceRows = new Set(Object.keys(embeddedRows).map(Number))
  const displayRows: number[] = []
  for (let r = 0; r < rows; r++) {
    if (!embeddedSourceRows.has(r)) {
      displayRows.push(r)
    }
  }

  // Parse non-clickable objects (preserve pixel positions from canvas editor)
  const objects: LayoutObject[] = Array.isArray(data.objects)
    ? data.objects.map((o: any) => ({
        id: o.id || `obj-${Math.random().toString(36).slice(2, 8)}`,
        type: (o.type || 'CUSTOM_SHAPE') as LayoutObjectType,
        label: o.label || '',
        r: o.r ?? 0,
        c: o.c ?? 0,
        w: o.w ?? 1,
        h: o.h ?? 1,
        color: o.color || '#6B7280',
        // Preserve pixel-based positions from canvas drag-and-drop
        ...(typeof o.x === 'number' && { x: o.x }),
        ...(typeof o.y === 'number' && { y: o.y }),
        ...(typeof o.pixelW === 'number' && { pixelW: o.pixelW }),
        ...(typeof o.pixelH === 'number' && { pixelH: o.pixelH }),
      }))
    : []

  // Parse stage type and position
  const stageType: string = data.stageType || 'PROSCENIUM'
  const stagePosition = (data.stagePosition && typeof data.stagePosition === 'object' && typeof data.stagePosition.x === 'number')
    ? { x: data.stagePosition.x, y: data.stagePosition.y, width: data.stagePosition.width || 320, height: data.stagePosition.height || 60 }
    : undefined
  const thrustWidth = data.thrustWidth || undefined
  const thrustDepth = data.thrustDepth || undefined

  const canvasWidth = typeof data.canvasWidth === 'number' ? data.canvasWidth : undefined
  const canvasHeight = typeof data.canvasHeight === 'number' ? data.canvasHeight : undefined

  // Compute canvas seat bounds from seatColumns for coordinate mapping.
  // This allows consumers to map stage/objects canvas pixel positions
  // to the guest-view grid coordinate system.
  let canvasSeatBounds: CanvasSeatBounds | undefined
  const SNAP = 32
  const PAINTED_SEAT = 28
  if (Array.isArray(data.seatColumns) && data.seatColumns.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const col of data.seatColumns) {
      if (!Array.isArray(col.seats)) continue
      for (const s of col.seats) {
        const sx = typeof s.x === 'number' ? s.x : 0
        const sy = typeof s.y === 'number' ? s.y : 0
        if (sx < minX) minX = sx
        if (sy < minY) minY = sy
        if (sx + PAINTED_SEAT > maxX) maxX = sx + PAINTED_SEAT
        if (sy + PAINTED_SEAT > maxY) maxY = sy + PAINTED_SEAT
      }
    }
    if (minX < Infinity && minY < Infinity) {
      canvasSeatBounds = {
        originX: minX,
        originY: minY,
        spanX: Math.max(maxX - minX, PAINTED_SEAT),
        spanY: Math.max(maxY - minY, PAINTED_SEAT),
      }
    }
  }

  // Build canvasSeats: map each seat's grid (r,c) to canvas (x,y) and seatCode
  let canvasSeats: Array<{ x: number; y: number; seatCode: string; seatNum: number; rowLabel: string }> | undefined
  if (Array.isArray(data.seatColumns) && data.seatColumns.length > 0) {
    // Collect all canvas seats with their column info
    type CanvasSeatRaw = { x: number; y: number; colLabel: string; colIdx: number }
    const rawCanvasSeats: CanvasSeatRaw[] = []
    for (const col of data.seatColumns) {
      if (!Array.isArray(col.seats)) continue
      const colIdx = data.seatColumns.indexOf(col)
      for (const s of col.seats) {
        rawCanvasSeats.push({
          x: typeof s.x === 'number' ? s.x : 0,
          y: typeof s.y === 'number' ? s.y : 0,
          colLabel: typeof col.label === 'string' ? col.label : '',
          colIdx,
        })
      }
    }

    // Deduplicate canvas seats by pixel (x, y) — keep first occurrence.
    // Painting the same cell twice in the editor can create duplicates that
    // cause visual overlapping seats with the same number.
    const seenPixels = new Set<string>()
    const allCanvasSeats: CanvasSeatRaw[] = []
    for (const s of rawCanvasSeats) {
      const key = `${s.x},${s.y}`
      if (seenPixels.has(key)) continue
      seenPixels.add(key)
      allCanvasSeats.push(s)
    }

    // Group by snapped Y to create rows (MUST match deriveGridSeats behavior).
    // deriveGridSeats uses Math.round(y / SNAP) for row grouping, so we must do
    // the same here. Using raw Y values would split a single logical row into
    // multiple rows when seats have slightly different Y positions (e.g., y=63
    // vs y=64), causing duplicate seat numbers in the rendered layout.
    const yGroups = new Map<number, CanvasSeatRaw[]>()
    for (const s of allCanvasSeats) {
      const yKey = Math.round(s.y / SNAP)
      if (!yGroups.has(yKey)) yGroups.set(yKey, [])
      yGroups.get(yKey)!.push(s)
    }

    // Sort groups by snapped Y (top to bottom) and assign sequential row indices
    const sortedYKeys = [...yGroups.keys()].sort((a, b) => a - b)
    const rowSeats = new Map<number, CanvasSeatRaw[]>()
    for (let i = 0; i < sortedYKeys.length; i++) {
      const yKey = sortedYKeys[i]
      const group = yGroups.get(yKey)!
      group.sort((a, b) => a.x - b.x)
      // Deduplicate by X within each snapped-Y row (keep first occurrence).
      // Also snap X to SNAP for dedup matching deriveGridSeats column logic.
      const deduped: CanvasSeatRaw[] = []
      const usedXSnapped = new Set<number>()
      for (const s of group) {
        const xSnapped = Math.round(s.x / SNAP)
        if (usedXSnapped.has(xSnapped)) continue
        usedXSnapped.add(xSnapped)
        deduped.push(s)
      }
      rowSeats.set(i, deduped)
    }

    // Build canvasSeats — assign seatNum sequentially within each snapped-Y row.
    // IMPORTANT: Do NOT use rowSeatMap to look up seatNum because rowSeatMap is
    // derived from deriveGridSeats which may use a DIFFERENT row assignment mode
    // (column-per-row vs position-based). Mismatching modes causes wrong seatNum
    // mapping (e.g., duplicate seatCodes). Instead, number seats 1,2,3... left
    // to right within each snapped-Y row — this matches how generateSeatsFromLayout
    // assigns seatCodes in the DB.
    canvasSeats = []
    for (const [r, sortedSeats] of rowSeats) {
      const label = rowLabels[r] || String.fromCharCode(65 + r)
      for (let i = 0; i < sortedSeats.length; i++) {
        const s = sortedSeats[i]
        const seatNum = i + 1
        canvasSeats.push({
          x: s.x,
          y: s.y,
          seatCode: `${label}-${seatNum}`,
          seatNum,
          rowLabel: label,
        })
      }
    }
  }

  // Compute fullCanvasBounds — bounding box of everything on the canvas
  let fullCanvasBounds: { x: number; y: number; width: number; height: number } | undefined
  if (canvasWidth !== undefined && canvasHeight !== undefined) {
    fullCanvasBounds = { x: 0, y: 0, width: canvasWidth, height: canvasHeight }
  } else if (canvasSeatBounds) {
    let bx = canvasSeatBounds.originX
    let by = canvasSeatBounds.originY
    let bw = canvasSeatBounds.spanX
    let bh = canvasSeatBounds.spanY

    if (stagePosition) {
      if (stagePosition.x < bx) { bw += bx - stagePosition.x; bx = stagePosition.x }
      if (stagePosition.y < by) { bh += by - stagePosition.y; by = stagePosition.y }
      if (stagePosition.x + stagePosition.width > bx + bw) bw = stagePosition.x + stagePosition.width - bx
      if (stagePosition.y + stagePosition.height > by + bh) bh = stagePosition.y + stagePosition.height - by
    }

    for (const obj of objects) {
      if (typeof obj.x === 'number' && typeof obj.y === 'number') {
        const ow = obj.pixelW || 60
        const oh = obj.pixelH || 30
        if (obj.x < bx) { bw += bx - obj.x; bx = obj.x }
        if (obj.y < by) { bh += by - obj.y; by = obj.y }
        if (obj.x + ow > bx + bw) bw = obj.x + ow - bx
        if (obj.y + oh > by + bh) bh = obj.y + oh - by
      }
    }

    fullCanvasBounds = { x: bx, y: by, width: bw, height: bh }
  }

  return { gridSize: { rows, cols }, rowLabels, sections, aisleColumns, rowSeatMap, embeddedRows, displayRows, objects, stageType, stagePosition, thrustWidth, thrustDepth, canvasWidth, canvasHeight, canvasSeatBounds, canvasSeats, fullCanvasBounds }
}
