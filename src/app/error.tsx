'use client'

import { useEffect } from 'react'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Global Error Boundary]', error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-16 flex items-center justify-center">
        <div className="text-center px-4 max-w-md py-20">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-9 h-9 text-red-500" />
          </div>

          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-charcoal mb-3">
            Terjadi Kesalahan
          </h1>
          <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
            Maaf, terjadi error saat memuat halaman ini.
            Silakan coba lagi atau kembali ke beranda.
          </p>

          {error.digest && (
            <p className="text-xs text-muted-foreground/50 mb-6 font-mono">
              Error ID: {error.digest}
            </p>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button onClick={() => reset()} className="bg-charcoal hover:bg-charcoal/90 text-gold">
              <RotateCcw className="w-4 h-4 mr-2" />
              Coba Lagi
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">
                <Home className="w-4 h-4 mr-2" />
                Beranda
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
