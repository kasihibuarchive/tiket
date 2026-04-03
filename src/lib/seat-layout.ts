// Shared seat layout parsing utilities
// Used by both the public seat map (seat-map.tsx) and the usher seat map view

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

export function parseLayoutData(layoutData: any): ParsedLayout | null {
  if (!layoutData) return null
  const data = typeof layoutData === 'string' ? JSON.parse(layoutData) : layoutData
  if (!data || data.type !== 'NUMBERED' || !data.gridSize) return null

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

    const allHaveBlock = sorted.every((s: any) => s.block)
    let inferredBlocks: string[] | null = null
    if (!allHaveBlock) {
      inferredBlocks = inferBlocksForRow(sorted.map((s: any) => ({ c: s.c ?? s.col ?? 0 })))
    }

    rowSeatMap.set(r, sorted.map((s: any, idx: number) => ({
      c: s.c ?? s.col ?? 0,
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

  // Parse non-clickable objects
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
      }))
    : []

  // Parse stage type
  const stageType: string = data.stageType || 'PROSCENIUM'

  return { gridSize: { rows, cols }, rowLabels, sections, aisleColumns, rowSeatMap, embeddedRows, displayRows, objects, stageType }
}
