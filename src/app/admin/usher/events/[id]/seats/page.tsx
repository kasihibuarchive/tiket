'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// Dynamic import to bypass production bundling issues
// This prevents "k.A is not a constructor" errors from module resolution
const UsherSeatMapContent = dynamic(() => import('./usher-seats-content'), {
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 text-gold animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Memuat peta kursi...</p>
      </div>
    </div>
  ),
  ssr: false,
})

export default function UsherSeatMapPage() {
  return <UsherSeatMapContent />
}
