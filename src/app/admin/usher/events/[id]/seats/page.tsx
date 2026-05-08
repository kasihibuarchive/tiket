'use client'

import React, { Component, useState, useEffect, ComponentType, ReactNode } from 'react'
import { Loader2, AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'

// ─── React Error Boundary (class component) ──────────────────────
// Catches render-time errors that useEffect .catch() cannot.
// This is needed because the "o.A is not a constructor" error
// occurs during React's render phase (inside useMemo), not during
// module loading.

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

class UsherErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[UsherSeatMap] Render error caught by boundary:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return null // Parent will handle display via error state
    }
    return this.props.children
  }
}

// ─── Page Component ──────────────────────────────────────────────

export default function UsherSeatMapPage() {
  const params = useParams()
  const router = useRouter()
  const [ContentComponent, setContentComponent] = useState<ComponentType | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<{ message: string; stack: string | null } | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    import('./usher-seats-content')
      .then((mod) => {
        if (!cancelled) {
          setContentComponent(() => mod.default)
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          console.error('[UsherSeatMap] Dynamic import failed:', err)
          setLoadError(err?.message || String(err))
        }
      })

    return () => { cancelled = true }
  }, [retryKey])

  const handleRetry = () => {
    setContentComponent(null)
    setLoadError(null)
    setRenderError(null)
    setRetryKey((k) => k + 1)
  }

  const handleRenderError = (error: Error) => {
    setRenderError({
      message: error?.message || String(error),
      stack: error?.stack || null,
    })
  }

  // Loading state
  if (!ContentComponent && !loadError && !renderError) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-gold animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Memuat peta kursi...</p>
        </div>
      </div>
    )
  }

  // Import error
  const displayError = loadError
    ? { message: loadError, stack: null as string | null }
    : renderError

  if (displayError) {
    return (
      <div className="flex items-center justify-center p-6 min-h-[400px]">
        <div className="max-w-xl w-full">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="font-serif text-lg font-bold text-amber-800 mb-2">
              Gagal Memuat Halaman
            </h2>
            <p className="text-sm text-amber-600 mb-4">
              {loadError
                ? 'Komponen gagal dimuat saat import.'
                : 'Komponen gagal saat render.'}
            </p>

            <div className="bg-white rounded-lg p-4 text-left mb-3 border border-amber-100">
              <p className="text-[10px] font-semibold text-amber-700 mb-1 uppercase tracking-wide">Error</p>
              <p className="text-xs font-mono text-amber-800 break-all">{displayError.message}</p>
            </div>

            {displayError.stack && (
              <div className="bg-white rounded-lg p-4 text-left mb-4 border border-amber-100">
                <p className="text-[10px] font-semibold text-amber-700 mb-1 uppercase tracking-wide">Stack Trace</p>
                <pre className="text-[9px] font-mono text-amber-600 whitespace-pre-wrap break-all max-h-48 overflow-y-auto leading-relaxed">
                  {displayError.stack}
                </pre>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleRetry}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Coba Lagi
              </button>
              <button
                onClick={() => router.back()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-amber-600 rounded-lg text-sm font-medium border border-amber-200 hover:bg-amber-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <UsherErrorBoundary onError={handleRenderError}>
      <ContentComponent key={retryKey} />
    </UsherErrorBoundary>
  )
}
