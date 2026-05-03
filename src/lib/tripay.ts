import crypto from 'crypto'

const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY!
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY!
const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE!
const TRIPAY_IS_PRODUCTION = process.env.TRIPAY_IS_PRODUCTION === 'true'

export function getTripayConfig() {
  const baseUrl = TRIPAY_IS_PRODUCTION
    ? 'https://tripay.co.id/api'
    : 'https://tripay.co.id/api-sandbox'

  // If proxy is configured, route through it instead of direct Tripay API
  const proxyUrl = process.env.TRIPAY_PROXY_URL || null
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
 * Create a transaction via Tripay (direct or through proxy).
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

  if (config.useProxy) {
    // Route through static-IP proxy
    const res = await fetch(config.baseUrl + '/api/transaction/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Proxy-Auth': config.proxyAuthKey!,
      },
      body: JSON.stringify(params),
    })
    return res
  }

  // Direct call to Tripay (no proxy)
  const formParams = new URLSearchParams({
    method: params.method,
    merchant_ref: params.merchant_ref,
    amount: String(params.amount),
    customer_name: params.customer_name,
    customer_email: params.customer_email,
    customer_phone: params.customer_phone,
    order_items: JSON.stringify(params.order_items),
    callback_url: params.callback_url,
    return_url: params.return_url,
    expired_time: String(params.expired_time),
    signature: params.signature,
  })

  const res = await fetch(config.baseUrl + '/transaction/create', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + config.apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formParams.toString(),
  })
  return res
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
