'use client'

import React from 'react'
import { StageRenderer } from '@/lib/stage-renderer'
import type { ParsedLayout } from '@/lib/seat-layout'

/**
 * Shared canvas-based seat map renderer.
 * Uses absolute pixel positioning from the seat builder canvas,
 * preserving empty space exactly as designed.
 *
 * This component handles:
 * - Scale calculation to fit container
 * - Row labels from canvas data
 * - Stage positioning (z-index 10, above seats)
 * - Objects overlay (z-index 5)
 * - Seats layer (z-index 1)
 *
 * Each consumer passes a `renderSeat` callback to customize
 * how individual seats are rendered (click behavior, colors, etc.)
 */

export interface CanvasSeatLayoutProps {
  parsedLayout: ParsedLayout
  seatLookup: Map<string, any>
  /** Render callback for individual seats */
  renderSeat: (
    seatData: any,
    canvasSeat: { x: number; y: number; seatCode: string; seatNum: number; rowLabel: string },
    scaledX: number,
    scaledY: number,
    size: number,
    key: number
  ) => React.ReactNode
  /** Render callback for empty seat positions */
  renderEmpty?: (
    x: number,
    y: number,
    size: number,
    key: number
  ) => React.ReactNode
  /** Max container width (default 600) */
  maxContainerWidth?: number
  /** Additional class for outer wrapper */
  className?: string
}

const PAINTED_SEAT = 28

export function CanvasSeatLayout({
  parsedLayout,
  seatLookup,
  renderSeat,
  renderEmpty,
  maxContainerWidth = 600,
  className = '',
}: CanvasSeatLayoutProps) {
  const canvasSeats = parsedLayout.canvasSeats
  if (!canvasSeats || canvasSeats.length === 0) return null

  const bounds = parsedLayout.fullCanvasBounds

  // Calculate scale to fit container
  const rawCanvasW = bounds ? bounds.width + bounds.x : (parsedLayout.canvasWidth || 400)
  const rawCanvasH = bounds ? bounds.height + bounds.y : (parsedLayout.canvasHeight || 400)
  const scale = Math.min(maxContainerWidth / rawCanvasW, 1.2)

  const renderedW = rawCanvasW * scale
  const renderedH = rawCanvasH * scale
  const seatSize = PAINTED_SEAT * scale

  const cStagePos = parsedLayout.stagePosition
  const hasStage = cStagePos && typeof cStagePos.x === 'number'

  // Group seats by rowLabel for row labels.
  // IMPORTANT: Do NOT group by raw Y — seats within a single logical row may
  // have slightly different Y pixel values (e.g., y=63 vs y=64) due to the
  // seat builder's painting mechanism. Using rowLabel (already computed
  // correctly in parseLayoutData with snapped-Y grouping) prevents duplicate
  // row labels for the same logical row.
  const labelGroups = new Map<string, typeof canvasSeats[0][]>()
  let minLabelY = Infinity
  let maxLabelY = -Infinity
  for (const s of canvasSeats) {
    if (!labelGroups.has(s.rowLabel)) labelGroups.set(s.rowLabel, [])
    labelGroups.get(s.rowLabel)!.push(s)
    if (s.y < minLabelY) minLabelY = s.y
    if (s.y > maxLabelY) maxLabelY = s.y
  }
  // Sort labels by their first seat's Y position (top to bottom)
  const sortedLabels = [...labelGroups.entries()].sort((a, b) => {
    const aMinY = Math.min(...a[1].map(s => s.y))
    const bMinY = Math.min(...b[1].map(s => s.y))
    return aMinY - bMinY
  })

  // Section color lookup for row labels
  const getRowColor = (rowIdx: number) => {
    const section = parsedLayout.sections.find(
      (s) => rowIdx >= s.fromRow && rowIdx <= s.toRow
    )
    if (section) {
      const config: Record<string, string> = {
        VIP: '#C8A951',
        Regular: '#8B8680',
        Student: '#7BA7A5',
      }
      return config[section.name] || section.colorCode
    }
    return '#8B8680'
  }

  const defaultRenderEmpty = (x: number, y: number, size: number, key: number) => (
    <div
      key={key}
      className="absolute"
      style={{ left: x, top: y, width: size, height: size }}
    />
  )

  return (
    <div className={`relative ${className}`} style={{ width: renderedW + 40, height: renderedH + 10 }}>
      {/* Row labels on the left — grouped by rowLabel, positioned at min Y of group */}
      {sortedLabels.map(([label, seats], rowIdx) => {
        const rowColor = getRowColor(rowIdx)
        const labelY = Math.min(...seats.map(s => s.y))
        const scaledY = labelY * scale

        return (
          <div
            key={label}
            className="absolute text-center text-xs font-semibold font-serif"
            style={{
              left: 0,
              top: scaledY,
              width: 28,
              height: seatSize,
              lineHeight: `${seatSize}px`,
              color: rowColor,
            }}
          >
            {label}
          </div>
        )
      })}

      {/* Seat grid area (offset by label width) */}
      <div className="absolute" style={{ left: 32, top: 0 }}>
        {/* Stage layer (z-index 10, above seats) */}
        {hasStage && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: cStagePos.x * scale,
              top: cStagePos.y * scale,
              width: cStagePos.width * scale,
              height: cStagePos.height * scale,
              zIndex: 10,
            }}
          >
            <StageRenderer
              stageType={parsedLayout.stageType || 'PROSCENIUM'}
              size="lg"
              thrustWidth={parsedLayout.thrustWidth}
              thrustDepth={parsedLayout.thrustDepth}
              fillParent
            />
          </div>
        )}

        {/* Objects layer (z-index 5) */}
        {parsedLayout.objects?.map((obj) => {
          if (typeof obj.x !== 'number' || typeof obj.y !== 'number') return null
          return (
            <div
              key={obj.id}
              className="absolute pointer-events-none rounded"
              style={{
                left: obj.x * scale,
                top: obj.y * scale,
                width: (obj.pixelW || 60) * scale,
                height: (obj.pixelH || 30) * scale,
                backgroundColor: obj.color || '#6B7280',
                opacity: 0.6,
                zIndex: 5,
              }}
            >
              {obj.label && (
                <span className="text-[8px] text-white px-1">{obj.label}</span>
              )}
            </div>
          )
        })}

        {/* Seats layer (z-index 1) */}
        {canvasSeats.map((seat, idx) => {
          const seatData = seatLookup.get(seat.seatCode)
          const scaledX = seat.x * scale
          const scaledY = seat.y * scale

          if (seatData) {
            return renderSeat(seatData, seat, scaledX, scaledY, seatSize, idx)
          }
          return (renderEmpty || defaultRenderEmpty)(scaledX, scaledY, seatSize, idx)
        })}
      </div>
    </div>
  )
}
