'use client'

import Link from 'next/link'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { Home, ArrowLeft, Search } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-16 flex items-center justify-center">
        <div className="text-center px-4 max-w-md py-20">
          {/* 404 visual */}
          <div className="relative mb-8">
            <span className="font-serif text-[120px] sm:text-[160px] font-bold text-charcoal/5 leading-none select-none">
              404
            </span>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-gold/10 flex items-center justify-center">
                <Search className="w-9 h-9 text-gold" />
              </div>
            </div>
          </div>

          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-charcoal mb-3">
            Halaman Tidak Ditemukan
          </h1>
          <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
            Maaf, halaman yang Anda cari tidak tersedia atau sudah dipindahkan.
            Mungkin link yang Anda gunakan sudah tidak valid.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild className="bg-charcoal hover:bg-charcoal/90 text-gold">
              <Link href="/">
                <Home className="w-4 h-4 mr-2" />
                Beranda
              </Link>
            </Button>
            <Button variant="outline" onClick={() => typeof window !== 'undefined' && window.history.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Kembali
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
