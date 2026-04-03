'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export type StageType = 'PROSCENIUM' | 'AMPHITHEATER' | 'BLACK_BOX' | 'THRUST' | 'ARENA'

interface StageRendererProps {
  stageType?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  // Thrust customization (only for THRUST type)
  thrustWidth?: number    // 30-100, percentage of total width
  thrustDepth?: number    // 1-8, number of grid rows for extension
}

const SIZE_CLASSES = {
  sm: { container: 'max-w-xs py-2 px-6', main: 'text-[10px] sm:text-xs', sub: 'text-[8px] sm:text-[10px]', scale: 0.7 },
  md: { container: 'max-w-sm py-3 px-8', main: 'text-sm sm:text-base', sub: 'text-[10px] sm:text-xs', scale: 1 },
  lg: { container: 'max-w-md py-5 px-8', main: 'text-lg sm:text-xl', sub: 'text-xs sm:text-sm', scale: 1.3 },
}

export function StageRenderer({ stageType = 'PROSCENIUM', size = 'md', className, thrustWidth = 45, thrustDepth = 3 }: StageRendererProps) {
  const sz = SIZE_CLASSES[size]

  const label = (
    <div className="text-center relative z-10">
      <p className={cn('font-serif text-gold tracking-[0.3em] font-semibold', sz.main)}>
        S T A G E
      </p>
      <p className={cn('font-serif text-gold/60 tracking-[0.2em] mt-0.5', sz.sub)}>
        T E A T E R &nbsp; R E N D R A
      </p>
    </div>
  )

  switch (stageType) {
    case 'AMPHITHEATER': {
      // Amphitheater: semicircular stage — audience sits in curved/arc rows
      // wrapping around a central stage area. Stage is wider and rounded.
      return (
        <div className={cn('mb-5 flex justify-center', className)}>
          <div
            className={cn(
              'bg-charcoal border border-gold/20 stage-glow text-center overflow-hidden relative',
              sz.container,
              'py-6 px-8'
            )}
            style={{
              borderRadius: '50% 50% 12% 12%',
              maxWidth: size === 'sm' ? 320 : size === 'md' ? 420 : 520,
            }}
          >
            {/* Curved seating indicators at bottom */}
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 opacity-30">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-0.5 rounded-full bg-gold"
                  style={{
                    width: `${30 + i * 12}px`,
                    borderRadius: '9999px',
                  }}
                />
              ))}
            </div>
            {label}
          </div>
        </div>
      )
    }

    case 'THRUST': {
      // Thrust stage (panggung tonjok): Main proscenium stage at back,
      // with a T-shaped extension jutting into the audience seating area.
      // Audience sits on 3 sides of the extension.
      // thrustWidth controls how wide the extension is (30-100%)
      // thrustDepth controls how far it extends into the audience (1-8 rows)
      const extWidth = Math.max(30, Math.min(100, thrustWidth))
      const extDepth = Math.max(1, Math.min(8, thrustDepth))
      const extHeightPx = extDepth * 8 * sz.scale

      return (
        <div className={cn('mb-5 flex flex-col items-center', className)}>
          {/* Main back stage (proscenium-like) */}
          <div
            className={cn(
              'bg-charcoal border border-gold/20 stage-glow',
              sz.container
            )}
            style={{
              borderBottom: 'none',
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
            }}
          >
            {label}
          </div>
          {/* Thrust extension — narrower T-shape going into audience */}
          <div
            className="bg-charcoal border-x border-b border-gold/20 stage-glow relative"
            style={{
              width: `${extWidth}%`,
              height: `${extHeightPx}px`,
              borderBottomLeftRadius: 6,
              borderBottomRightRadius: 6,
              minWidth: 80,
            }}
          >
            {/* Side audience indicators */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pr-1 flex flex-col gap-1 opacity-30">
              {Array.from({ length: Math.min(extDepth, 4) }).map((_, i) => (
                <div key={`l${i}`} className="w-1.5 h-1.5 rounded-full bg-gold/60" />
              ))}
            </div>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-1 flex flex-col gap-1 opacity-30">
              {Array.from({ length: Math.min(extDepth, 4) }).map((_, i) => (
                <div key={`r${i}`} className="w-1.5 h-1.5 rounded-full bg-gold/60" />
              ))}
            </div>
          </div>
        </div>
      )
    }

    case 'BLACK_BOX': {
      // Black Box: Flexible/performance space with a raised square platform
      // in the CENTER of the seating area. Audience sits on all sides
      // (typically 3 or 4 sides). The stage is more intimate, smaller.
      return (
        <div className={cn('mb-5 flex justify-center', className)}>
          <div className="relative flex flex-col items-center">
            {/* Audience area indicator (top rows) */}
            <div className="flex items-center gap-1 mb-2 opacity-25">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="w-2 h-1 rounded-full bg-gold" />
              ))}
            </div>

            {/* Center stage */}
            <div
              className={cn(
                'bg-charcoal border-2 border-dashed border-gold/30 stage-glow text-center relative',
              )}
              style={{
                borderRadius: 4,
                width: size === 'sm' ? 140 : size === 'md' ? 180 : 220,
                height: size === 'sm' ? 90 : size === 'md' ? 110 : 130,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {label}
              {/* Corner markers */}
              <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-gold/40" />
              <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-gold/40" />
              <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-gold/40" />
              <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-gold/40" />
              {/* Side audience indicators */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pr-2 flex flex-col gap-1.5 opacity-25">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-gold" />
                ))}
              </div>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-2 flex flex-col gap-1.5 opacity-25">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-gold" />
                ))}
              </div>
            </div>

            {/* Audience area indicator (bottom rows) */}
            <div className="flex items-center gap-1 mt-2 opacity-25">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="w-2 h-1 rounded-full bg-gold" />
              ))}
            </div>
          </div>
        </div>
      )
    }

    case 'ARENA': {
      // Arena / Theater-in-the-round: Central stage completely surrounded
      // by audience on all 4 sides. Like a boxing ring or circular performance.
      // The stage is typically circular/oval in the center.
      const diameter = size === 'sm' ? 160 : size === 'md' ? 200 : 250

      return (
        <div className={cn('mb-5 flex justify-center', className)}>
          <div className="relative flex flex-col items-center">
            {/* Top audience indicator */}
            <div className="flex items-center gap-1 mb-3 opacity-25">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-2 h-1 rounded-full bg-gold" />
              ))}
            </div>

            <div className="flex items-center gap-4">
              {/* Left audience indicator */}
              <div className="flex flex-col items-center gap-1 opacity-25">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="w-1 h-2 rounded-full bg-gold" />
                ))}
              </div>

              {/* Central oval stage */}
              <div
                className={cn(
                  'bg-charcoal border border-gold/20 stage-glow text-center overflow-hidden',
                )}
                style={{
                  borderRadius: '50%',
                  width: diameter,
                  height: diameter * 0.55,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {label}
              </div>

              {/* Right audience indicator */}
              <div className="flex flex-col items-center gap-1 opacity-25">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="w-1 h-2 rounded-full bg-gold" />
                ))}
              </div>
            </div>

            {/* Bottom audience indicator */}
            <div className="flex items-center gap-1 mt-3 opacity-25">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-2 h-1 rounded-full bg-gold" />
              ))}
            </div>
          </div>
        </div>
      )
    }

    case 'PROSCENIUM':
    default: {
      // Proscenium: Standard stage at front, audience faces it from one direction.
      // The most common theater layout — rectangular stage with an arch frame.
      return (
        <div className={cn('mb-5 flex justify-center', className)}>
          <div className={cn('bg-charcoal rounded-xl border border-gold/20 stage-glow text-center', sz.container)}>
            {label}
          </div>
        </div>
      )
    }
  }
}

/** Renders non-clickable objects overlay on the grid */
export function ObjectsOverlay({
  objects,
  cellSize = 28,
  className,
  offsetX = 0,
  offsetY = 0,
}: {
  objects?: Array<{ id: string; type: string; label: string; r: number; c: number; w: number; h: number; color: string }>
  cellSize?: number
  className?: string
  offsetX?: number
  offsetY?: number
}) {
  if (!objects || objects.length === 0) return null

  return (
    <div className={cn('absolute inset-0 pointer-events-none', className)} style={{ left: offsetX, top: offsetY }}>
      {objects.map((obj) => (
        <div
          key={obj.id}
          className="absolute flex items-center justify-center overflow-hidden"
          style={{
            left: obj.c * cellSize,
            top: obj.r * cellSize,
            width: obj.w * cellSize,
            height: obj.h * cellSize,
            backgroundColor: obj.color + '25',
            border: `2px dashed ${obj.color}80`,
            borderRadius: 4,
          }}
        >
          <div className="text-center px-1">
            <span
              className="text-[8px] sm:text-[9px] font-bold leading-tight block truncate max-w-full"
              style={{ color: obj.color }}
            >
              {obj.type === 'ENTRANCE' ? '🚪 ' : ''}
              {obj.label || obj.type}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
