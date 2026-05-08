'use client'

import { useState, useEffect, ComponentType } from 'react'
import { Loader2, AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'

export default function UsherSeatMapPage() {
  const params = useParams()
  const router = useRouter()
  const [ContentComponent, setContentComponent] = useState<ComponentType | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errorStack, setErrorStack] = useState<string | null>(null)
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
          setErrorStack(err?.stack || null)
        }
      })

    return () => { cancelled = true }
  }, [retryKey])

  // Retry handler
  const handleRetry = () => {
    setContentComponent(null)
    setLoadError(null)
    setErrorStack(null)
    setRetryKey((k) => k + 1)
  }

  // Loading state
  if (!ContentComponent && !loadError) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-gold animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Memuat peta kursi...</p>
        </div>
      </div>
    )
  }

  // Error state — show detailed error with stack trace for debugging
  if (loadError) {
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
              Komponen peta kursi gagal dimuat. Detail error di bawah ini.
            </p>

            {/* Error message */}
            <div className="bg-white rounded-lg p-4 text-left mb-3 border border-amber-100">
              <p className="text-[10px] font-semibold text-amber-700 mb-1 uppercase tracking-wide">Error</p>
              <p className="text-xs font-mono text-amber-800 break-all">{loadError}</p>
            </div>

            {/* Stack trace */}
            {errorStack && (
              <div className="bg-white rounded-lg p-4 text-left mb-4 border border-amber-100">
                <p className="text-[10px] font-semibold text-amber-700 mb-1 uppercase tracking-wide">Stack Trace</p>
                <pre className="text-[9px] font-mono text-amber-600 whitespace-pre-wrap break-all max-h-40 overflow-y-auto leading-relaxed">
                  {errorStack}
                </pre>
              </div>
            )}

            {/* Actions */}
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

  return <ContentComponent key={retryKey} />
}
