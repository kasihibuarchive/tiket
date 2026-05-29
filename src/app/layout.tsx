import type { Metadata } from "next";
import { Noto_Serif_JP, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PendingTransactionToast } from "@/components/pending-transaction-toast";


const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const notoSerif = Noto_Serif_JP({
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-serif",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.teateran.site'),
  title: {
    default: "Teateran - Platform Tiket Pertunjukan Teater",
    template: "%s | Teateran",
  },
  description: "Platform tiket resmi untuk pertunjukan teater di Indonesia. Pesan tiket online dengan pemilihan kursi interaktif, pembayaran aman via QRIS & e-wallet. E-ticket langsung dikirim ke email Anda.",
  keywords: [
    "Teateran", "tiket teater", "tiket pertunjukan", "beli tiket online",
    "teater Indonesia", "pementasan teater", "ticketing platform",
    "tiket seni pertunjukan", "booking tiket", "e-ticket teater",
  ],
  authors: [{ name: "Teateran by YC Media", url: "https://www.teateran.site" }],
  creator: "YC Media",
  publisher: "Teateran",
  formatDetection: {
    telephone: false,
  },
  alternates: {
    canonical: "https://www.teateran.site",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Teateran - Platform Tiket Pertunjukan Teater",
    description: "Platform tiket resmi untuk pertunjukan teater di Indonesia. Pesan tiket online dengan pemilihan kursi interaktif dan pembayaran aman.",
    type: "website",
    locale: "id_ID",
    siteName: "Teateran",
    url: "https://www.teateran.site",
    images: [{ url: "/teateran-logo.png", width: 1200, height: 630, alt: "Teateran - Platform Tiket Pertunjukan Teater" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Teateran - Platform Tiket Pertunjukan Teater",
    description: "Platform tiket resmi untuk pertunjukan teater di Indonesia. Pesan tiket online dengan pemilihan kursi interaktif dan pembayaran aman.",
    images: ["/teateran-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

// Organization JSON-LD for Google Knowledge Panel
const organizationJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Teateran',
  url: 'https://www.teateran.site',
  logo: 'https://www.teateran.site/teateran-logo.png',
  description: 'Platform tiket resmi untuk pertunjukan teater di Indonesia.',
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'yunchaaruna@gmail.com',
    contactType: 'customer service',
    areaServed: 'ID',
    availableLanguage: ['Indonesian', 'English'],
  },
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Yogyakarta',
    addressCountry: 'ID',
  },
  sameAs: [],
})

// WebSite JSON-LD for Google Sitelinks Search Box
const websiteJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Teateran',
  url: 'https://www.teateran.site',
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: organizationJsonLd }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: websiteJsonLd }}
        />
      </head>
      <body
        className={`${inter.variable} ${notoSerif.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
        <PendingTransactionToast />
        <Toaster />
      </body>
    </html>
  );
}
