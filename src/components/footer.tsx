import Link from 'next/link'
import Image from 'next/image'

export function Footer() {
  return (
    <footer className="bg-charcoal text-white/70 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Image src="/teateran-logo.png" alt="Teateran" width={24} height={24} className="rounded" />
              <span className="font-serif text-lg font-semibold text-white">
                TEATERAN
              </span>
            </div>
            <p className="text-sm leading-relaxed text-white/50">
              Platform tiket resmi untuk pertunjukan teater terbaik.
              Pengalaman teater yang elegan dan modern.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-serif text-sm font-semibold text-white mb-4">
              Navigasi
            </h4>
            <div className="flex flex-col gap-2">
              <Link href="/#events" className="text-sm hover:text-gold transition-colors">
                Pertunjukan
              </Link>
              <Link href="/verify" className="text-sm hover:text-gold transition-colors">
                Cek Tiket
              </Link>
              <Link href="/tentang" className="text-sm hover:text-gold transition-colors">
                Tentang Kami
              </Link>
              <Link href="/kebijakan-privasi" className="text-sm hover:text-gold transition-colors">
                Kebijakan Privasi
              </Link>
              <Link href="/ketentuan-layanan" className="text-sm hover:text-gold transition-colors">
                Ketentuan Layanan
              </Link>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-serif text-sm font-semibold text-white mb-4">
              Informasi
            </h4>
            <div className="flex flex-col gap-2 text-sm">
              <p>📧 yunchaaruna@gmail.com</p>
              <p>📍 Teateran, Jakarta</p>
              <p>🏢 PH: YC Media</p>
              <p>👤 Owner: Yuncha</p>
              <p className="text-white/40 text-xs mt-4">
                © {new Date().getFullYear()} Teateran. All rights reserved.
              </p>
            </div>
          </div>
        </div>

        <div className="zen-divider mt-8 mb-4" />

        <p className="text-center text-xs text-white/30">
          Designed with elegance. Powered by modern technology.
        </p>
      </div>
    </footer>
  )
}
