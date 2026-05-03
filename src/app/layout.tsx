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
  title: "Teateran - Ticketing Platform",
  description: "Official ticketing platform for Teateran. Book your seats for the finest theatrical productions.",
  keywords: ["Teateran", "Theater", "Ticketing", "Tiket Teater", "Pertunjukan"],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Teateran - Ticketing Platform",
    description: "Book your seats for the finest theatrical productions.",
    type: "website",
    images: [{ url: "/teateran-logo.png", width: 1024, height: 1024 }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
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
