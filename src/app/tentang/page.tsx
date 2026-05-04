import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tentang Kami - Teateran',
  description: 'Pelajari tentang Teateran, platform tiket resmi untuk pertunjukan teater terbaik di Indonesia.',
}

export default function TentangPage() {
  return (
    <div className="min-h-screen flex flex-col bg-warm-white">
      <Navbar />
      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          {/* Header */}
          <div className="text-center mb-10">
            <p className="text-gold text-xs tracking-[0.3em] uppercase font-medium mb-2">About</p>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-charcoal">
              Tentang <span className="text-gold">Kami</span>
            </h1>
            <div className="zen-divider w-16 mx-auto mt-4" />
          </div>

          {/* Content */}
          <div className="space-y-5 text-sm leading-relaxed text-charcoal/80">
            {/* Brand Story */}
            <div className="bg-white rounded-xl p-6 border border-border/50">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-charcoal flex items-center justify-center flex-shrink-0">
                  <Image src="/teateran-logo.png" alt="Teateran" width={28} height={28} className="rounded" />
                </div>
                <div>
                  <h2 className="font-serif text-lg font-semibold text-charcoal">Teateran</h2>
                  <p className="text-xs text-muted-foreground">Official Ticketing Platform</p>
                </div>
              </div>
              <p className="mb-3">
                Teateran adalah platform tiket daring yang didedikasikan untuk memajukan industri pertunjukan teater di Indonesia. Kami hadir sebagai solusi modern yang menggabungkan kemudahan teknologi dengan keanggunan seni pertunjukan, menciptakan pengalaman pemesanan tiket yang elegan dan terpercaya bagi para penikmat seni.
              </p>
              <p>
                Didirikan oleh YC Media, Teateran lahir dari semangat untuk mendigitalisasi proses penjualan tiket teater yang selama ini masih banyak dilakukan secara manual. Dengan platform ini, kami ingin memudahkan penonton dalam mendapatkan tiket pertunjukan favorit mereka, sekaligus membantu para penyelenggara acara dalam mengelola penjualan dan distribusi tiket secara efisien.
              </p>
            </div>

            {/* Visi */}
            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">Visi</h2>
              <p>
                Menjadi platform tiket teater terdepan di Indonesia yang menghadirkan pengalaman pemesanan tiket terbaik dengan teknologi modern, serta berkontribusi dalam pertumbuhan dan kemajuan industri seni pertunjukan tanah air.
              </p>
            </div>

            {/* Misi */}
            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">Misi</h2>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-gold mt-0.5 flex-shrink-0">&#9670;</span>
                  <span>Menyediakan platform pemesanan tiket yang mudah, cepat, dan aman untuk seluruh pertunjukan teater dan acara seni pertunjukan.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gold mt-0.5 flex-shrink-0">&#9670;</span>
                  <span>Menawarkan pengalaman pengguna yang elegan dan modern, mulai dari pemilihan kursi interaktif hingga e-ticket digital yang mudah digunakan.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gold mt-0.5 flex-shrink-0">&#9670;</span>
                  <span>Mendukung para penyelenggara acara dengan fitur manajemen tiket yang komprehensif, termasuk pemetaan kursi, manajemen usher, dan pelaporan penjualan.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gold mt-0.5 flex-shrink-0">&#9670;</span>
                  <span>Memastikan keamanan transaksi melalui kerjasama dengan gateway pembayaran resmi dan terpercaya yang diawasi oleh otoritas keuangan Indonesia.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gold mt-0.5 flex-shrink-0">&#9670;</span>
                  <span>Menjalin kemitraan dengan komunitas teater, sekolah seni, dan berbagai penyelenggara acara untuk memperluas jangkauan seni pertunjukan kepada masyarakat luas.</span>
                </li>
              </ul>
            </div>

            {/* Layanan Kami */}
            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">Layanan Kami</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-gold text-sm font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-charcoal text-sm">Pemesanan Tiket Online</h3>
                    <p className="text-muted-foreground mt-1">
                      Pilih kursi favorit secara interaktif melalui peta kursi digital. Bayar dengan berbagai metode pembayaran melalui Tripay yang terjamin keamanannya. E-ticket langsung dikirim ke email Anda.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-gold text-sm font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-charcoal text-sm">Pemetaan Kursi Interaktif</h3>
                    <p className="text-muted-foreground mt-1">
                      Fitur seat map yang canggih dengan dukungan berbagai tata panggung seperti proscenium, amphitheater, dan black box. Pengguna dapat memilih kategori kursi VIP, Regular, atau Student sesuai preferensi.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-gold text-sm font-bold">3</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-charcoal text-sm">Manajemen Acara</h3>
                    <p className="text-muted-foreground mt-1">
                      Dashboard admin yang lengkap untuk mengelola event, kursi, harga, merchandise, kode promo, dan pelaporan penjualan. Sistem usher untuk check-in tiket di lokasi acara secara digital.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-gold text-sm font-bold">4</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-charcoal text-sm">Verifikasi Tiket Digital</h3>
                    <p className="text-muted-foreground mt-1">
                      Sistem verifikasi tiket yang aman dengan QR code. Penonton dan penyelenggara dapat memverifikasi keaslian tiket melalui halaman cek tiket di platform kami.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Pembayaran */}
            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">Keamanan Pembayaran</h2>
              <p className="mb-3">
                Teateran bekerja sama dengan Tripay sebagai gateway pembayaran resmi untuk memastikan seluruh transaksi keuangan berjalan dengan aman dan terpercaya. Tripay merupakan penyedia layanan pembayaran yang telah terdaftar dan diawasi oleh Bank Indonesia.
              </p>
              <p className="mb-3">
                Kami mendukung berbagai metode pembayaran untuk kenyamanan Anda, termasuk QRIS, Virtual Account (BCA, BNI, BRI, Mandiri, Permata), E-Wallet (OVO, DANA, ShopeePay), dan pembayaran melalui gerai retail (Alfamart, Indomaret).
              </p>
              <p>
                Seluruh proses transaksi dienkripsi dan dilindungi sesuai dengan standar keamanan industri keuangan, sehingga Anda dapat bertransaksi dengan tenang dan aman.
              </p>
            </div>

            {/* Kontak */}
            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">Hubungi Kami</h2>
              <p className="mb-3">
                Kami selalu terbuka untuk pertanyaan, saran, dan peluang kerjasama. Jangan ragu untuk menghubungi kami:
              </p>
              <div className="bg-warm-white rounded-lg p-4 text-sm space-y-2">
                <p><strong>Teateran by YC Media</strong></p>
                <p>Email: yunchaaruna@gmail.com</p>
                <p>Lokasi: Jakarta, Indonesia</p>
                <p>Owner: Yuncha</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
