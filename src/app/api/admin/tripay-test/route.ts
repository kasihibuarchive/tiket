import { NextRequest, NextResponse } from 'next/server'
import { getTripayConfig, createTransactionSignature, getTripayPaymentChannels } from '@/lib/tripay'

/**
 * GET /api/admin/tripay-test — Diagnose Tripay configuration
 * Tests full connectivity: proxy health AND actual Tripay API reach.
 */
export async function GET(request: NextRequest) {
  const config = getTripayConfig()

  // 1. Check required env vars
  const issues: string[] = []
  if (!config.apiKey) issues.push('TRIPAY_API_KEY tidak terisi')
  if (!config.privateKey) issues.push('TRIPAY_PRIVATE_KEY tidak terisi')
  if (!config.merchantCode) issues.push('TRIPAY_MERCHANT_CODE tidak terisi')

  const isConfigured = issues.length === 0

  // 2. Check production mode
  const mode = config.isProduction ? 'PRODUCTION' : 'SANDBOX'

  // 3. Check proxy config
  const proxyInfo = config.useProxy
    ? { enabled: true, proxyUrl: config.baseUrl, hasAuthKey: !!config.proxyAuthKey }
    : { enabled: false }

  // 4. Generate a test signature to verify private key works
  const testRef = 'TEST-' + Date.now()
  const testAmount = 10000
  let testSignature = ''
  let signatureValid = false
  try {
    testSignature = createTransactionSignature(testRef, testAmount)
    signatureValid = testSignature.length === 64 // HMAC-SHA256 = 64 hex chars
  } catch (e: any) {
    issues.push('Gagal generate signature: ' + e.message)
  }

  // 5. Test connectivity — two levels
  let proxyReachable = false
  let proxyError = ''
  let tripayReachable = false
  let tripayError = ''
  let tripayResponseData: any = null

  if (isConfigured) {
    // 5a. Test proxy health (only if proxy mode)
    if (config.useProxy) {
      try {
        const healthRes = await fetch(config.baseUrl + '/health', {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        })
        proxyReachable = healthRes.ok
        if (!proxyReachable) {
          const errBody = await healthRes.text().catch(() => '')
          proxyError = 'HTTP ' + healthRes.status + ': ' + errBody.slice(0, 200)
        } else {
          tripayResponseData = await healthRes.json().catch(() => null)
        }
      } catch (e: any) {
        proxyError = e.message || 'Connection failed'
      }
    }

    // 5b. Test ACTUAL Tripay API reach (through proxy or direct)
    try {
      const res = await getTripayPaymentChannels()
      tripayReachable = res.ok
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        tripayError = 'HTTP ' + res.status + ': ' + errBody.slice(0, 300)
      }
    } catch (e: any) {
      tripayError = e.message || 'Connection failed'
    }
  }

  // 6. Check if amount >= 10000 (Tripay minimum for production)
  const minAmountNote = config.isProduction
    ? 'Production mode: minimal transaksi Rp 10.000'
    : 'Sandbox mode: minimal transaksi Rp 1'

  // 7. Build suggestion based on actual Tripay reach, not just proxy health
  let suggestion = ''
  if (!isConfigured) {
    suggestion = 'Isi semua environment variables Tripay di Vercel (.env.local)'
  } else if (config.useProxy && !proxyReachable) {
    suggestion = 'Proxy tidak bisa dijangkau — cek TRIPAY_PROXY_URL atau pastikan service di Render aktif (bukan sleep)'
  } else if (!tripayReachable) {
    if (tripayError.includes('401')) {
      suggestion = 'API key Tripay tidak valid — cek TRIPAY_API_KEY di Tripay dashboard'
    } else if (tripayError.includes('403') || tripayError.includes('Unauthorized IP')) {
      suggestion = 'IP proxy TIDAK di-whitelist di Tripay! Tambahkan IP proxy ke dashboard Tripay (Settings > Whitelist IP). IP bisa berubah tiap Render spin-up.'
    } else if (tripayError.includes('404')) {
      suggestion = 'Endpoint Tripay tidak ditemukan — kemungkinan TRIPAY_IS_PRODUCTION tidak sesuai dengan API key'
    } else {
      suggestion = 'Tidak bisa konek ke Tripay melalui proxy — cek proxy config dan koneksi'
    }
  } else {
    suggestion = 'Konfigurasi Tripay benar dan terkoneksi penuh'
  }

  return NextResponse.json({
    status: tripayReachable ? 'ok' : issues.length > 0 ? 'config_error' : 'connection_error',
    mode,
    merchantCode: config.merchantCode,
    apiKeySet: !!config.apiKey,
    apiKeyPreview: config.apiKey ? config.apiKey.slice(0, 8) + '...' + config.apiKey.slice(-4) : null,
    privateKeySet: !!config.privateKey,
    signatureTest: signatureValid ? 'OK (64 chars)' : 'FAILED',
    proxy: proxyInfo,
    connectivity: config.useProxy
      ? {
          proxyReachable,
          proxyError: proxyError || undefined,
          tripayReachable,
          tripayError: tripayError || undefined,
        }
      : {
          tripayReachable,
          tripayError: tripayError || undefined,
        },
    minAmountNote,
    issues: issues.length > 0 ? issues : undefined,
    diagnostics: {
      suggestion,
      envCheck: {
        TRIPAY_API_KEY: config.apiKey ? 'SET (' + config.apiKey.length + ' chars)' : 'NOT SET',
        TRIPAY_PRIVATE_KEY: config.privateKey ? 'SET (' + config.privateKey.length + ' chars)' : 'NOT SET',
        TRIPAY_MERCHANT_CODE: config.merchantCode || 'NOT SET',
        TRIPAY_IS_PRODUCTION: String(config.isProduction),
        TRIPAY_PROXY_URL: process.env.TRIPAY_PROXY_URL || 'NOT SET (direct mode)',
      },
    },
  })
}
