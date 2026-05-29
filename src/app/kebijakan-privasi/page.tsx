import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Kebijakan Privasi',
  description: 'Kebijakan privasi resmi platform Teateran. Pelajari bagaimana kami mengelola dan melindungi data pribadi Anda.',
  alternates: {
    canonical: 'https://www.teateran.site/kebijakan-privasi',
  },
  openGraph: {
    title: 'Kebijakan Privasi - Teateran',
    description: 'Kebijakan privasi resmi platform Teateran. Pelajari bagaimana kami mengelola dan melindungi data pribadi Anda.',
    url: 'https://www.teateran.site/kebijakan-privasi',
    siteName: 'Teateran',
    locale: 'id_ID',
    type: 'website',
  },
}

export default function KebijakanPrivasiPage() {
  return (
    <div className="min-h-screen flex flex-col bg-warm-white">
      <Navbar />
      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          {/* Header */}
          <div className="text-center mb-10">
            <p className="text-gold text-xs tracking-[0.3em] uppercase font-medium mb-2">Legal</p>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-charcoal">
              Kebijakan <span className="text-gold">Privasi</span>
            </h1>
            <div className="zen-divider w-16 mx-auto mt-4" />
            <p className="text-sm text-muted-foreground mt-3">
              Terakhir diperbarui: 4 Mei 2026
            </p>
          </div>

          {/* Content */}
          <div className="space-y-5 text-sm leading-relaxed text-charcoal/80">
            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">1. Pendahuluan</h2>
              <p className="mb-3">
                Selamat datang di Teateran. Kami berkomitmen untuk melindungi privasi dan data pribadi Anda. Kebijakan Privasi ini menjelaskan bagaimana kami mengumpulkan, menggunakan, menyimpan, dan melindungi informasi yang Anda berikan saat menggunakan platform kami, termasuk situs web, aplikasi, dan layanan terkait yang disediakan oleh Teateran.
              </p>
              <p>
                Dengan mengakses atau menggunakan layanan kami, Anda menyetujui pengumpulan dan penggunaan informasi sesuai dengan kebijakan ini. Jika Anda tidak setuju dengan kebijakan ini, mohon untuk tidak menggunakan layanan kami.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">2. Informasi yang Kami Kumpulkan</h2>
              <p className="mb-2">
                Kami mengumpulkan beberapa jenis informasi untuk menyediakan dan meningkatkan layanan kami:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Informasi Pribadi:</strong> Nama lengkap, alamat email, dan nomor WhatsApp yang Anda berikan saat melakukan pembelian tiket atau mendaftar akun.</li>
                <li><strong>Informasi Transaksi:</strong> Detail pembelian tiket termasuk jenis kursi, jumlah tiket, metode pembayaran, dan total harga yang dibayarkan.</li>
                <li><strong>Informasi Teknis:</strong> Alamat IP, jenis browser, sistem operasi, dan data cookies yang digunakan untuk meningkatkan performa dan keamanan platform.</li>
                <li><strong>Informasi Promosi:</strong> Kode promo yang digunakan dan riwayat penggunaan diskon dalam transaksi Anda.</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">3. Penggunaan Informasi</h2>
              <p className="mb-2">Informasi yang kami kumpulkan digunakan untuk tujuan berikut:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Memproses dan mengelola pemesanan tiket, termasuk pembuatan e-ticket dan konfirmasi pembayaran.</li>
                <li>Mengirimkan notifikasi penting terkait transaksi, seperti konfirmasi pembelian, status pembayaran, dan e-ticket melalui email.</li>
                <li>Memproses pembayaran melalui gateway pembayaran yang terpercaya (Tripay) untuk memastikan keamanan transaksi Anda.</li>
                <li>Meningkatkan kualitas layanan, performa platform, dan pengalaman pengguna secara keseluruhan.</li>
                <li>Mematuhi kewajiban hukum dan peraturan yang berlaku di Republik Indonesia.</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">4. Pembayaran dan Keamanan Transaksi</h2>
              <p className="mb-3">
                Seluruh transaksi pembayaran di platform Teateran diproses melalui Tripay, sebuah gateway pembayaran resmi yang terdaftar dan diawasi oleh Bank Indonesia. Kami tidak menyimpan data kartu kredit, nomor rekening bank, atau informasi keuangan sensitif Anda secara langsung.
              </p>
              <p>
                Tripay bertanggung jawab atas keamanan proses pembayaran sesuai dengan standar keamanan industri yang berlaku. Informasi terkait kebijakan privasi Tripay dapat dilihat langsung di situs resmi Tripay.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">5. Perlindungan Data</h2>
              <p className="mb-3">
                Kami menerapkan langkah-langkah teknis dan organisasi yang sesuai untuk melindungi data pribadi Anda dari akses yang tidak sah, pengubahan, pengungkapan, atau penghancuran. Langkah-langkah ini termasuk enkripsi data, kontrol akses yang ketat, dan pemantauan keamanan secara berkala.
              </p>
              <p>
                Meskipun kami berupaya semaksimal mungkin untuk melindungi informasi Anda, tidak ada metode transmisi melalui internet atau penyimpanan elektronik yang sepenuhnya aman. Kami tidak dapat menjamin keamanan absolut dari data Anda.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">6. Berbagi Informasi dengan Pihak Ketiga</h2>
              <p className="mb-3">
                Kami tidak menjual, memperdagangkan, atau menyewakan data pribadi Anda kepada pihak ketiga. Namun, kami dapat membagikan informasi Anda dalam situasi berikut:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Gateway Pembayaran:</strong> Informasi transaksi yang diperlukan untuk memproses pembayaran melalui Tripay.</li>
                <li><strong>Penyelenggara Acara:</strong> Nama dan informasi tiket yang diperlukan oleh penyelenggara acara untuk keperluan check-in di lokasi pertunjukan.</li>
                <li><strong>Kewajiban Hukum:</strong> Jika diwajibkan oleh hukum, regulasi, atau proses hukum yang berlaku.</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">7. Penyimpanan Data</h2>
              <p className="mb-3">
                Data pribadi Anda disimpan selama diperlukan untuk memenuhi tujuan pengumpulan data, termasuk memenuhi kewajiban hukum, akuntansi, atau pelaporan. Data transaksi disimpan selama minimal 5 (lima) tahun sesuai dengan peraturan perpajakan yang berlaku di Indonesia.
              </p>
              <p>
                Setelah periode penyimpanan berakhir, data Anda akan dihapus atau dianonimkan secara aman kecuali jika diperlukan untuk tujuan lain yang sah.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">8. Hak Pengguna</h2>
              <p className="mb-2">Sebagai pengguna, Anda memiliki hak untuk:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Mengakses dan melihat data pribadi yang kami simpan tentang Anda.</li>
                <li>Meminta perbaikan data yang tidak akurat atau tidak lengkap.</li>
                <li>Meminta penghapusan data pribadi Anda, dengan tunduk pada kewajiban hukum yang berlaku.</li>
                <li>Menarik persetujuan atas penggunaan data Anda untuk tujuan pemasaran kapan saja.</li>
              </ul>
              <p className="mt-3">
                Untuk mengajukan permintaan terkait hak Anda, silakan hubungi kami melalui email: yunchaaruna@gmail.com
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">9. Cookies</h2>
              <p>
                Platform kami menggunakan cookies untuk meningkatkan pengalaman pengguna. Cookies membantu kami mengingat preferensi Anda, menjaga sesi login, dan menganalisis penggunaan platform. Anda dapat mengatur browser Anda untuk menolak cookies, namun hal ini dapat mempengaruhi fungsionalitas platform kami.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">10. Perubahan Kebijakan</h2>
              <p>
                Kami berhak untuk memperbarui atau mengubah Kebijakan Privasi ini kapan saja. Perubahan akan berlaku efektif segera setelah dipublikasikan di halaman ini. Kami menyarankan Anda untuk meninjau halaman ini secara berkala untuk mengetahui perubahan terbaru. Penggunaan layanan kami yang berkelanjutan setelah perubahan kebijakan berarti Anda menyetujui kebijakan yang telah diperbarui.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-border/50">
              <h2 className="font-serif text-lg font-semibold text-charcoal mb-3">11. Hubungi Kami</h2>
              <p className="mb-3">
                Jika Anda memiliki pertanyaan, keluhan, atau saran terkait Kebijakan Privasi ini, silakan hubungi kami melalui:
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
