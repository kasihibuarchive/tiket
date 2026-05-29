'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface OptimizedImageProps {
  src: string | null | undefined
  alt: string
  className?: string
  fallback?: React.ReactNode
  /** Fallback letter when no image (uses first char of alt) */
  fallbackLetter?: boolean
}

/**
 * Optimized image component with:
 * - Native lazy loading (loading="lazy")
 * - Loading skeleton while image loads
 * - Error fallback
 * - Decoding async for better perf
 */
export function OptimizedImage({
  src,
  alt,
  className,
  fallback,
  fallbackLetter = false,
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  if (!src || hasError) {
    if (fallback) return <>{fallback}</>
    if (fallbackLetter) {
      return (
        <div className={cn('flex items-center justify-center bg-gradient-to-br from-charcoal to-charcoal/80', className)}>
          <span className="font-serif text-gold text-3xl select-none">
            {alt.charAt(0).toUpperCase()}
          </span>
        </div>
      )
    }
    return null
  }

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Loading skeleton */}
      {isLoading && (
        <div className="absolute inset-0 bg-charcoal/10 animate-pulse" />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false)
          setHasError(true)
        }}
        className={cn(
          'w-full h-full object-cover transition-opacity duration-300',
          isLoading ? 'opacity-0' : 'opacity-100'
        )}
      />
    </div>
  )
}
