'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export type StageType = 'PROSCENIUM' | 'AMPHITHEATER' | 'BLACK_BOX' | 'THRUST' | 'ARENA'

interface StageRendererProps {
  stageType?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASSES = {
  sm: { container: 'max-w-xs py-2 px-6', main: 'text-[10px] sm:text-xs', sub: 'text-[8px] sm:text-[10px]' },
  md: { container: 'max-w-sm py-3 px-8', main: 'text-sm sm:text-base', sub: 'text-[10px] sm:text-xs' },
  lg: { container: 'max-w-md py-5 px-8', main: 'text-lg sm:text-xl', sub: 'text-xs sm:text-sm' },
}

export function StageRenderer({ stageType = 'PROSCENIUM', size = 'md', className }: StageRendererProps) {
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
    case 'AMPHITHEATER':
      return (
        <div className={cn('mb-5 flex justify-center', className)}>
          <div
            className={cn(
              'bg-charcoal border border-gold/20 stage-glow text-center overflow-hidden',
              sz.container,
              'py-8 pt-6'
            )}
            style={{ borderRadius: '50% 50% 8px 8%' }}
          >
            {label}
          </div>
        </div>
      )

    case 'THRUST':
      return (
        <div className={cn('mb-5 flex flex-col items-center', className)}>
          {/* Wide base */}
          <div
            className={cn(
              'bg-charcoal border border-gold/20 stage-glow',
              sz.container
            )}
            style={{ borderBottom: 'none', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
          >
            {label}
          </div>
          {/* Narrow extension */}
          <div
            className="bg-charcoal border-x border-b border-gold/20 stage-glow"
            style={{
              width: '40%',
              height: 28,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 8,
            }}
          />
        </div>
      )

    case 'BLACK_BOX':
      return (
        <div className={cn('mb-5 flex justify-center', className)}>
          <div
            className={cn(
              'bg-charcoal border-2 border-dashed border-gold/30 stage-glow text-center relative',
              sz.container
            )}
            style={{ borderRadius: 4 }}
          >
            {label}
            {/* Corner markers */}
            <div className="absolute top-1 left-1 w-2 h-2 border-t border-l border-gold/50" />
            <div className="absolute top-1 right-1 w-2 h-2 border-t border-r border-gold/50" />
            <div className="absolute bottom-1 left-1 w-2 h-2 border-b border-l border-gold/50" />
            <div className="absolute bottom-1 right-1 w-2 h-2 border-b border-r border-gold/50" />
          </div>
        </div>
      )

    case 'ARENA':
      return (
        <div className={cn('mb-5 flex justify-center', className)}>
          <div
            className={cn(
              'bg-charcoal border border-gold/20 stage-glow text-center overflow-hidden',
              sz.container
            )}
            style={{
              borderRadius: '50%',
              width: size === 'sm' ? 200 : size === 'md' ? 280 : 340,
              height: size === 'sm' ? 80 : size === 'md' ? 100 : 110,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {label}
          </div>
        </div>
      )

    case 'PROSCENIUM':
    default:
      return (
        <div className={cn('mb-5 flex justify-center', className)}>
          <div className={cn('bg-charcoal rounded-xl border border-gold/20 stage-glow text-center', sz.container)}>
            {label}
          </div>
        </div>
      )
  }
}

/** Renders non-clickable objects overlay on the grid */
export function ObjectsOverlay({
  objects,
  cellSize = 28,
  className,
}: {
  objects?: Array<{ id: string; type: string; label: string; r: number; c: number; w: number; h: number; color: string }>
  cellSize?: number
  className?: string
}) {
  if (!objects || objects.length === 0) return null

  return (
    <div className={cn('absolute inset-0 pointer-events-none', className)}>
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
