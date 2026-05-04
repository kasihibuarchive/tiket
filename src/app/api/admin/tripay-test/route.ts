import { NextRequest, NextResponse } from 'next/server'
import { getTripayConfig, createTransactionSignature } from '@/lib/tripay'

/**
 * GET /api/admin/tripay-test — Diagnose Tripay configuration
 * Tests API connectivity and validates credentials without creating a real transaction.
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

  // 5. Test actual API connectivity (make a minimal request to Tripay)
  let apiReachable = false
  let apiError = ''
  if (isConfigured) {
    try {
      const targetUrl = config.useProxy
        ? config.baseUrl + '/health'
        : config.baseUrl + '/merchant/payment-channel'

      const headers: Record<string, string> = config.useProxy
        ? { 'X-Proxy-Auth': config.proxyAuthKey! }
        : { 'Authorization': 'Bearer ' + config.apiKey }

      const res = await fetch(targetUrl, {
        method: config.useProxy ? 'GET' : 'GET',
        headers,
        signal: AbortSignal.timeout(10000),
      })

      apiReachable = res.ok
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        apiError = 'HTTP ' + res.status + ': ' + errBody.slice(0, 200)
      }
    } catch (e: any) {
      apiError = e.message || 'Connection failed'
    }
  }

  // 6. Check if amount >= 10000 (Tripay minimum for production)
  const minAmount = config.isProduction ? 10000 : 1
  const minAmountNote = config.isProduction
    ? 'Production mode: minimal transaksi Rp 10.000'
    : 'Sandbox mode: minimal transaksi Rp 1'

  return NextResponse.json({
    status: isConfigured && apiReachable ? 'ok' : issues.length > 0 ? 'config_error' : 'connection_error',
    mode,
    merchantCode: config.merchantCode,
    apiKeySet: !!config.apiKey,
    apiKeyPreview: config.apiKey ? config.apiKey.slice(0, 8) + '...' + config.apiKey.slice(-4) : null,
    privateKeySet: !!config.privateKey,
    signatureTest: signatureValid ? 'OK (64 chars)' : 'FAILED',
    proxy: proxyInfo,
    apiReachable,
    apiError: apiError || undefined,
    minAmountNote,
    issues: issues.length > 0 ? issues : undefined,
    diagnostics: {
      suggestion: !isConfigured
        ? 'Isi semua environment variables Tripay di Vercel (.env.local)'
        : !apiReachable
          ? apiError.includes('401')
            ? 'API key tidak valid — cek TRIPAY_API_KEY di Tripay dashboard'
            : apiError.includes('403')
              ? 'Akses ditolak — kemungkinan: (1) TRIPAY_IS_PRODUCTION belum true padahal pakai production key, (2) IP server belum di-whitelist di dashboard Tripay, (3) Private key/merchant code salah'
              : 'Tidak bisa konek ke Tripay — cek koneksi atau proxy config'
          : 'Konfigurasi Tripay terlihat benar',
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
