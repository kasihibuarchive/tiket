import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ketentuan Layanan - Teateran',
  description: 'Ketentuan layanan resmi platform Teateran. Syarat dan ketentuan penggunaan platform tiket teater.',
}

export default function KetentuanLayananPage() {
  return (
    <div className="min-h-screen flex flex-col bg-warm-white">
      <Navbar />
      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          {/* Header */}
          <div className="text-center mb-10">
            <p className="text-gold text-xs tracking-[0.3em] uppercase font-medium mb-2">Legal</p>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-charcoal">
              Ketentuan <span className="text-gold">Layanan</span>
            </h1>
            <div className="zen-divider w-16 mx-auto mt-4" />
            <p className="text-sm text-muted-foreground mt-3">
              Terakhir diperbarui: 4 Mei 2026
            </p>
          </div>

          {/* Content */}
          <div className="space-y-5 text-sm leading-relaxed text-charcoal/80">
            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">1. Ketentuan Umum</h2>
              <p className="mb-3">
                Selamat datang di Teateran. Dengan mengakses dan menggunakan platform Teateran, Anda dianggap telah membaca, memahami, dan menyetujui seluruh Ketentuan Layanan yang tercantum di halaman ini. Ketentuan Layanan ini berlaku sebagai perjanjian antara Anda (Pengguna) dan Teateran (Penyedia Layanan) yang beroperasi di bawah naungan YC Media.
              </p>
              <p>
                Platform Teateran menyediakan layanan penjualan tiket secara daring untuk pertunjukan teater dan acara seni pertunjukan lainnya. Kami berhak untuk mengubah, memodifikasi, atau memperbarui ketentuan ini kapan saja tanpa pemberitahuan terlebih dahulu.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">2. Akun dan Registrasi</h2>
              <p className="mb-2">
                Pengguna bertanggung jawab untuk memastikan bahwa informasi yang diberikan saat pembelian tiket adalah akurat dan lengkap. Pengguna wajib:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Memberikan nama lengkap, alamat email, dan nomor WhatsApp yang valid dan aktif.</li>
                <li>Menjaga kerahasiaan informasi akun dan kode transaksi yang diberikan.</li>
                <li>Segera memberitahu kami jika ada penggunaan akun yang tidak sah.</li>
                <li>Tidak menggunakan platform untuk tujuan yang melanggar hukum atau merugikan pihak lain.</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">3. Pembelian Tiket</h2>
              <p className="mb-3">
                Pemesanan tiket melalui platform Teateran dianggap sah setelah pembayaran berhasil dikonfirmasi oleh sistem. Berikut ketentuan yang berlaku untuk pembelian tiket:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Tiket yang sudah dibeli tidak dapat ditukar, dikembalikan, atau dipindah tangankan kepada orang lain tanpa persetujuan tertulis dari penyelenggara acara.</li>
                <li>Harga tiket yang tertera sudah termasuk biaya pelayanan platform dan biaya admin sesuai metode pembayaran yang dipilih.</li>
                <li>Pengguna diwajibkan memilih kursi dan menyelesaikan pembayaran dalam batas waktu yang ditentukan oleh sistem. Jika batas waktu habis, pemesanan akan otomatis dibatalkan.</li>
                <li>E-ticket akan dikirimkan melalui email yang terdaftar setelah pembayaran berhasil dikonfirmasi.</li>
                <li>Kuota pembelian tiket per transaksi dapat dibatasi oleh penyelenggara acara.</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">4. Metode Pembayaran</h2>
              <p className="mb-3">
                Platform Teateran menerima pembayaran melalui berbagai metode yang disediakan oleh Tripay sebagai gateway pembayaran resmi kami. Metode pembayaran yang tersedia meliputi:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>QRIS:</strong> Pembayaran melalui scan kode QR menggunakan aplikasi e-wallet atau mobile banking yang mendukung QRIS.</li>
                <li><strong>Virtual Account:</strong> Pembayaran melalui transfer bank ke rekening virtual (BCA, BNI, BRI, Mandiri, Permata).</li>
                <li><strong>E-Wallet:</strong> Pembayaran melalui saldo e-wallet (OVO, DANA, ShopeePay).</li>
                <li><strong>Toko Retail:</strong> Pembayaran melalui kasir minimarket (Alfamart, Indomaret).</li>
              </ul>
              <p className="mt-3">
                Seluruh proses pembayaran diatur dan diproses oleh Tripay sesuai dengan syarat dan ketentuan Tripay yang berlaku. Biaya admin dapat berbeda-beda tergantung pada metode pembayaran yang dipilih.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">5. Batas Waktu Pembayaran</h2>
              <p className="mb-3">
                Setelah pemesanan tiket dibuat, pengguna memiliki batas waktu tertentu untuk menyelesaikan pembayaran. Jika pembayaran tidak diselesaikan dalam batas waktu yang ditentukan, maka:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Pemesanan tiket akan otomatis dibatalkan oleh sistem.</li>
                <li>Kursi yang dipilih akan dikembalikan ke status tersedia untuk pengguna lain.</li>
                <li>Pengguna dapat melakukan pemesanan ulang jika kursi masih tersedia.</li>
              </ul>
              <p className="mt-3">
                Batas waktu pembayaran ditampilkan secara jelas pada halaman checkout dan halaman pembayaran. Kami tidak bertanggung jawab atas keterlambatan yang disebabkan oleh gangguan pada sistem pembayaran pihak ketiga.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">6. Kebijakan Refund dan Pembatalan</h2>
              <p className="mb-3">
                Kebijakan refund dan pembatalan tiket mengikuti ketentuan dari penyelenggara acara. Secara umum:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Tiket yang sudah dibeli dan pembayaran dikonfirmasi tidak dapat dibatalkan oleh pengguna, kecuali acara dibatalkan atau dijadwalkan ulang oleh penyelenggara.</li>
                <li>Jika acara dibatalkan oleh penyelenggara, pengguna berhak mendapatkan pengembalian dana penuh sesuai dengan nominal yang telah dibayarkan.</li>
                <li>Proses pengembalian dana memerlukan waktu 3-7 hari kerja dan akan dikembalikan melalui metode pembayaran yang sama.</li>
                <li>Pengembalian dana yang terkait dengan biaya admin gateway pembayaran tunduk pada kebijakan Tripay.</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">7. Kode Promo dan Diskon</h2>
              <p className="mb-3">
                Teateran dapat menyediakan kode promo dan program diskon dari waktu ke waktu. Ketentuan berikut berlaku:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Kode promo hanya berlaku untuk periode dan event tertentu sesuai dengan syarat yang ditentukan.</li>
                <li>Satu kode promo hanya dapat digunakan satu kali per transaksi.</li>
                <li>Kode promo memiliki kuota penggunaan terbatas dan dapat berakhir sebelum batas waktu yang ditentukan jika kuota habis.</li>
                <li>Teateran berhak membatalkan penggunaan kode promo jika terdeteksi penyalahgunaan.</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">8. Merchandise</h2>
              <p className="mb-3">
                Teateran dapat menyediakan penjualan merchandise terkait acara. Ketentuan berikut berlaku untuk pembelian merchandise:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Ketersediaan merchandise tergantung pada stok yang ada dan tidak dapat dijamin.</li>
                <li>Merchandise yang sudah dibeli tidak dapat ditukar atau dikembalikan kecuali terdapat cacat produksi.</li>
                <li>Pengiriman merchandise akan diatur oleh penyelenggara acara dan informasi lebih lanjut akan diberikan melalui email atau WhatsApp.</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">9. Kewajiban Pengguna di Lokasi Acara</h2>
              <p className="mb-2">Pengguna wajib mematuhi ketentuan berikut saat hadir di lokasi pertunjukan:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Menunjukkan e-ticket (dalam bentuk digital atau cetak) saat check-in di lokasi acara.</li>
                <li>Hadir minimal 30 menit sebelum waktu pertunjukan dimulai sesuai dengan jam buka pintu yang ditentukan.</li>
                <li>Duduk sesuai dengan kursi yang tertera pada tiket.</li>
                <li>Tidak membawa makanan dan minuman dari luar ke dalam area pertunjukan kecuali diizinkan.</li>
                <li>Menjaga ketertiban dan tidak mengganggu pertunjukan yang sedang berlangsung.</li>
                <li>Mematuhi peraturan dan protokol keselamatan yang ditetapkan oleh penyelenggara dan venue.</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">10. Batasan Tanggung Jawab</h2>
              <p className="mb-3">
                Teateran bertindak sebagai platform perantara penjualan tiket dan bukan penyelenggara acara. Dengan demikian:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Teateran tidak bertanggung jawab atas kualitas pertunjukan, perubahan jadwal, atau pembatalan acara yang dilakukan oleh penyelenggara.</li>
                <li>Teateran tidak bertanggung jawab atas kerugian yang timbul akibat force majeure, bencana alam, atau keadaan di luar kendali kami.</li>
                <li>Teateran tidak menjamin ketersediaan platform secara terus menerus tanpa gangguan teknis.</li>
                <li>Tanggung jawab maksimum kami terbatas pada nominal tiket yang telah dibayarkan oleh pengguna.</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">11. Hak Kekayaan Intelektual</h2>
              <p className="mb-3">
                Seluruh konten yang terdapat pada platform Teateran, termasuk namun tidak terbatas pada desain, logo, teks, grafis, gambar, dan kode program, merupakan hak kekayaan intelektual milik Teateran dan/atau YC Media. Pengguna dilarang:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Menggunakan, menyalin, memodifikasi, atau mendistribusikan konten tanpa izin tertulis.</li>
                <li>Melakukan reverse engineering terhadap platform atau sistem kami.</li>
                <li>Menggunakan nama, logo, atau merek Teateran untuk tujuan komersial tanpa persetujuan.</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">12. Hukum yang Berlaku</h2>
              <p>
                Ketentuan Layanan ini diatur dan ditafsirkan sesuai dengan hukum Republik Indonesia. Setiap perselisihan yang timbul akan diselesaikan secara musyawarah terlebih dahulu. Jika musyawarah tidak mencapai kesepakatan, perselisihan akan diselesaikan melalui Pengadilan Negeri Yogyakarta.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">13. Hubungi Kami</h2>
              <p className="mb-3">
                Untuk pertanyaan atau klarifikasi terkait Ketentuan Layanan ini, silakan hubungi kami:
              </p>
              <div className="bg-warm-white rounded-lg p-4 text-sm space-y-1">
                <p><strong>Teateran</strong></p>
                <p>Email: yunchaaruna@gmail.com</p>
                <p>Lokasi: Yogyakarta, Indonesia</p>
                <p>PH: YC Media</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
