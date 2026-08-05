import crypto from 'crypto'

const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY!
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY!
const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE!
const TRIPAY_IS_PRODUCTION = process.env.TRIPAY_IS_PRODUCTION === 'true'

// Timeout untuk semua request ke Tripay (ms).
// 15 detik cukup untuk normal response, tidak terlalu lama sampai user bingung.
const TRIPAY_TIMEOUT_MS = 15000

// Berapa kali retry kalau network error (timeout, DNS, connection reset).
// HTTP error (4xx/5xx) TIDAK di-retry — itu masalah config/auth, retry gak akan bantu.
const TRIPAY_NETWORK_RETRY = 1

/**
 * Error class untuk distinguish network error (timeout, DNS, koneksi) dari HTTP error.
 * Dipakai di catch block checkout route untuk kasih pesan yang sesuai ke user.
 */
export class TripayNetworkError extends Error {
  public readonly isTimeout: boolean
  public readonly cause: unknown

  constructor(message: string, opts: { isTimeout?: boolean; cause?: unknown } = {}) {
    super(message)
    this.name = 'TripayNetworkError'
    this.isTimeout = opts.isTimeout ?? false
    this.cause = opts.cause
  }
}

export function getTripayConfig() {
  const baseUrl = TRIPAY_IS_PRODUCTION
    ? 'https://tripay.co.id/api'
    : 'https://tripay.co.id/api-sandbox'

  // If proxy is configured, route through it instead of direct Tripay API
  const proxyUrl = process.env.TRIPAY_PROXY_URL
    ? process.env.TRIPAY_PROXY_URL.replace(/\/+$/, '')
    : null
  const proxyAuthKey = process.env.TRIPAY_PROXY_AUTH_KEY || null
  const useProxy = !!proxyUrl && !!proxyAuthKey

  return {
    baseUrl: useProxy ? proxyUrl : baseUrl,
    apiKey: TRIPAY_API_KEY,
    privateKey: TRIPAY_PRIVATE_KEY,
    merchantCode: TRIPAY_MERCHANT_CODE,
    isProduction: TRIPAY_IS_PRODUCTION,
    useProxy,
    proxyAuthKey,
  }
}

/**
 * Helper: fetch ke Tripay dengan timeout + retry untuk network error.
 *
 * - Timeout 15s (TRIPAY_TIMEOUT_MS).
 * - Retry 1x untuk network error (AbortError, TypeError "fetch failed", connection reset).
 * - HTTP error (4xx/5xx) TIDAK di-retry — return response apa adanya, caller yang handle.
 *
 * Throws TripayNetworkError kalau semua retry habis dan masih network error.
 */
async function tripayFetch(
  url: string,
  init: RequestInit,
  retryLabel: string
): Promise<Response> {
  let lastErr: unknown = null

  for (let attempt = 0; attempt <= TRIPAY_NETWORK_RETRY; attempt++) {
    const isLastAttempt = attempt === TRIPAY_NETWORK_RETRY
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(TRIPAY_TIMEOUT_MS),
      })
      // HTTP response diterima (bahkan 4xx/5xx) — return apa adanya.
      // Caller bertanggung jawab handle status code.
      return res
    } catch (err: any) {
      lastErr = err
      const isAbort = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      const isNetwork =
        isAbort ||
        err?.name === 'TypeError' ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ECONNREFUSED' ||
        err?.code === 'ENOTFOUND' ||
        err?.code === 'ETIMEDOUT'

      console.warn(
        `[tripay:${retryLabel}] attempt ${attempt + 1}/${TRIPAY_NETWORK_RETRY + 1} failed:`,
        err?.name, err?.message || err
      )

      if (!isNetwork || isLastAttempt) {
        // Bukan network error (programmer bug, dsb.) ATAU retry habis — lempar ke atas
        throw new TripayNetworkError(
          isAbort
            ? `Tripay tidak merespons dalam ${TRIPAY_TIMEOUT_MS / 1000} detik (timeout). Coba lagi beberapa saat.`
            : `Gagal terhubung ke Tripay: ${err?.message || 'unknown network error'}`,
          { isTimeout: isAbort, cause: err }
        )
      }

      // Retry: tunggu 500ms sebelum coba lagi
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  // Seharusnya tidak tercapai, tapi untuk TypeScript safety
  throw new TripayNetworkError(
    `Gagal terhubung ke Tripay setelah ${TRIPAY_NETWORK_RETRY + 1} percobaan: ${String(lastErr)}`,
    { cause: lastErr }
  )
}

/**
 * Create a transaction via Tripay (direct or through proxy).
 * Uses JSON body with order_items as a real array (Tripay verified format).
 */
export async function createTripayTransaction(params: {
  method: string
  merchant_ref: string
  amount: number
  customer_name: string
  customer_email: string
  customer_phone: string
  order_items: any[]
  callback_url: string
  return_url: string
  expired_time: number
  signature: string
}) {
  const config = getTripayConfig()
  const jsonBody = JSON.stringify(params)

  if (config.useProxy) {
    return tripayFetch(config.baseUrl + '/api/transaction/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Proxy-Auth': config.proxyAuthKey!,
      },
      body: jsonBody,
    }, 'create-proxy')
  }

  // Direct call to Tripay
  return tripayFetch(config.baseUrl + '/transaction/create', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + config.apiKey,
      'Content-Type': 'application/json',
    },
    body: jsonBody,
  }, 'create-direct')
}

/**
 * Generate HMAC-SHA256 signature for closed payment transaction creation.
 * signature = HMAC-SHA256(privateKey, merchantCode + merchantRef + amount)
 */
export function createTransactionSignature(
  merchantRef: string,
  amount: number
): string {
  const config = getTripayConfig()
  return crypto
    .createHmac('sha256', config.privateKey)
    .update(config.merchantCode + merchantRef + String(amount))
    .digest('hex')
}

/**
 * Get transaction detail from Tripay (direct or through proxy).
 */
export async function getTripayTransactionDetail(reference: string): Promise<Response> {
  const config = getTripayConfig()

  if (config.useProxy) {
    // Proxy forwards as form-encoded POST
    const formParams = new URLSearchParams({ reference })
    return tripayFetch(config.baseUrl + '/api/transaction/detail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Proxy-Auth': config.proxyAuthKey!,
      },
      body: formParams.toString(),
    }, 'detail-proxy')
  }

  // Direct call to Tripay
  return tripayFetch(config.baseUrl + '/transaction/detail?reference=' + encodeURIComponent(reference), {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + config.apiKey,
    },
  }, 'detail-direct')
}

/**
 * Get payment channels from Tripay (direct or through proxy).
 */
export async function getTripayPaymentChannels(): Promise<Response> {
  const config = getTripayConfig()

  if (config.useProxy) {
    return tripayFetch(config.baseUrl + '/api/merchant/payment-channel', {
      method: 'GET',
      headers: {
        'X-Proxy-Auth': config.proxyAuthKey!,
      },
    }, 'channels-proxy')
  }

  return tripayFetch(config.baseUrl + '/merchant/payment-channel', {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + config.apiKey,
    },
  }, 'channels-direct')
}

/**
 * Verify callback webhook signature from Tripay.
 * Tripay sends signature in X-Callback-Signature header.
 * Signature is built from sorted key=value pairs joined by '&' then HMAC-SHA256'd.
 */
export function verifyCallbackSignature(
  body: Record<string, unknown>,
  xCallbackSignature: string
): boolean {
  const config = getTripayConfig()

  // Sort all keys alphabetically, exclude null/undefined values
  const sortedKeys = Object.keys(body)
    .filter((k) => body[k] !== null && body[k] !== undefined)
    .sort()

  // Build signature string: key1=value1&key2=value2&...
  const signatureString = sortedKeys
    .map((key) => `${key}=${body[key]}`)
    .join('&')

  const calculatedSignature = crypto
    .createHmac('sha256', config.privateKey)
    .update(signatureString)
    .digest('hex')

  return calculatedSignature === xCallbackSignature
}

/**
 * Tripay payment channel definitions.
 * Grouped by category for the payment method selector UI.
 */
export interface TripayChannel {
  code: string
  name: string
  icon: string // lucide icon name
  group: 'VA' | 'EWALLET' | 'QRIS' | 'CONVENIENCE_STORE'
}

export const TRIPAY_CHANNELS: TripayChannel[] = [
  // Virtual Accounts
  { code: 'BCAVA', name: 'BCA Virtual Account', icon: 'Landmark', group: 'VA' },
  { code: 'BNIVA', name: 'BNI Virtual Account', icon: 'Landmark', group: 'VA' },
  { code: 'BRIVA', name: 'BRI Virtual Account', icon: 'Landmark', group: 'VA' },
  { code: 'MANDIRIVA', name: 'Mandiri Virtual Account', icon: 'Landmark', group: 'VA' },
  { code: 'PERMATAVA', name: 'Permata Virtual Account', icon: 'Landmark', group: 'VA' },

  // E-Wallets
  { code: 'OVO', name: 'OVO', icon: 'Wallet', group: 'EWALLET' },
  { code: 'DANA', name: 'DANA', icon: 'Wallet', group: 'EWALLET' },
  { code: 'SHOPEEPAY', name: 'ShopeePay', icon: 'Wallet', group: 'EWALLET' },

  // QRIS
  { code: 'QRIS', name: 'QRIS', icon: 'QrCode', group: 'QRIS' },

  // Convenience Stores
  { code: 'ALFAMART', name: 'Alfamart', icon: 'Store', group: 'CONVENIENCE_STORE' },
  { code: 'INDOMARET', name: 'Indomaret', icon: 'Store', group: 'CONVENIENCE_STORE' },
]

/**
 * Map legacy payment method (QRIS/NON_QRIS) to Tripay default channels.
 * Used for backward compatibility.
 */
export const LEGACY_METHOD_MAP: Record<string, string> = {
  QRIS: 'QRIS',
  NON_QRIS: 'BCAVA',
}
