import { NextResponse } from 'next/server'
import { getTripayConfig, createTransactionSignature } from '@/lib/tripay'

/**
 * GET /api/admin/tripay-test-create — Test Tripay transaction creation with different formats
 * Tries 3 body formats to find which one Tripay accepts:
 *   1. JSON body (Content-Type: application/json)
 *   2. Form-encoded with JSON-stringified order_items
 *   3. Form-encoded with PHP-style nested array order_items
 */
export async function GET() {
  const config = getTripayConfig()

  if (!config.apiKey || !config.privateKey) {
    return NextResponse.json({ error: 'Tripay not configured' }, { status: 500 })
  }

  const testRef = 'DEBUG-' + Date.now()
  const testAmount = 10000
  const testSignature = createTransactionSignature(testRef, testAmount)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const testOrderItems = [
    { sku: 'TEST-SKU', name: 'Tiket Test', price: testAmount, quantity: 1 },
  ]

  const results: Record<string, any> = {}

  // ── Format 1: JSON body ──
  try {
    const jsonBody = JSON.stringify({
      method: 'BCAVA',
      merchant_ref: testRef,
      amount: testAmount,
      customer_name: 'Debug Test',
      customer_email: 'debug@test.com',
      customer_phone: '081234567890',
      order_items: testOrderItems,
      callback_url: appUrl + '/api/webhooks/tripay',
      return_url: appUrl + '/verify/' + testRef,
      expired_time: Math.floor(Date.now() / 1000) + 3600,
      signature: testSignature,
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (config.useProxy) {
      headers['X-Proxy-Auth'] = config.proxyAuthKey!
    } else {
      headers['Authorization'] = 'Bearer ' + config.apiKey
    }

    const targetUrl = config.useProxy
      ? config.baseUrl + '/api/transaction/create'
      : config.baseUrl + '/transaction/create'

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: jsonBody,
    })

    const resBody = await res.text()
    results.format1_json = {
      status: res.status,
      ok: res.ok,
      body: resBody.slice(0, 500),
    }
  } catch (e: any) {
    results.format1_json = { error: e.message }
  }

  // ── Format 2: Form-encoded with JSON-stringified order_items ──
  try {
    const formParts = [
      'method=' + encodeURIComponent('BCAVA'),
      'merchant_ref=' + encodeURIComponent(testRef),
      'amount=' + encodeURIComponent(String(testAmount)),
      'customer_name=' + encodeURIComponent('Debug Test'),
      'customer_email=' + encodeURIComponent('debug@test.com'),
      'customer_phone=' + encodeURIComponent('081234567890'),
      'order_items=' + encodeURIComponent(JSON.stringify(testOrderItems)),
      'callback_url=' + encodeURIComponent(appUrl + '/api/webhooks/tripay'),
      'return_url=' + encodeURIComponent(appUrl + '/verify/' + testRef),
      'expired_time=' + encodeURIComponent(String(Math.floor(Date.now() / 1000) + 3600)),
      'signature=' + encodeURIComponent(testSignature),
    ]
    const formBody = formParts.join('&')

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    }
    if (config.useProxy) {
      headers['X-Proxy-Auth'] = config.proxyAuthKey!
    } else {
      headers['Authorization'] = 'Bearer ' + config.apiKey
    }

    const targetUrl = config.useProxy
      ? config.baseUrl + '/api/transaction/create'
      : config.baseUrl + '/transaction/create'

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: formBody,
    })

    const resBody = await res.text()
    results.format2_form_json = {
      status: res.status,
      ok: res.ok,
      body: resBody.slice(0, 500),
    }
  } catch (e: any) {
    results.format2_form_json = { error: e.message }
  }

  // ── Format 3: Form-encoded with PHP-style nested array ──
  try {
    const item = testOrderItems[0]
    const parts = [
      'method=' + encodeURIComponent('BCAVA'),
      'merchant_ref=' + encodeURIComponent(testRef),
      'amount=' + encodeURIComponent(String(testAmount)),
      'customer_name=' + encodeURIComponent('Debug Test'),
      'customer_email=' + encodeURIComponent('debug@test.com'),
      'customer_phone=' + encodeURIComponent('081234567890'),
      'order_items%5B0%5D%5Bsku%5D=' + encodeURIComponent(item.sku),
      'order_items%5B0%5D%5Bname%5D=' + encodeURIComponent(item.name),
      'order_items%5B0%5D%5Bprice%5D=' + encodeURIComponent(String(item.price)),
      'order_items%5B0%5D%5Bquantity%5D=' + encodeURIComponent(String(item.quantity)),
      'order_items%5B0%5D%5Btotal%5D=' + encodeURIComponent(String(item.price * item.quantity)),
      'callback_url=' + encodeURIComponent(appUrl + '/api/webhooks/tripay'),
      'return_url=' + encodeURIComponent(appUrl + '/verify/' + testRef),
      'expired_time=' + encodeURIComponent(String(Math.floor(Date.now() / 1000) + 3600)),
      'signature=' + encodeURIComponent(testSignature),
    ]
    const formBody = parts.join('&')

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    }
    if (config.useProxy) {
      headers['X-Proxy-Auth'] = config.proxyAuthKey!
    } else {
      headers['Authorization'] = 'Bearer ' + config.apiKey
    }

    const targetUrl = config.useProxy
      ? config.baseUrl + '/api/transaction/create'
      : config.baseUrl + '/transaction/create'

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: formBody,
    })

    const resBody = await res.text()
    results.format3_form_php = {
      status: res.status,
      ok: res.ok,
      body: resBody.slice(0, 500),
    }
  } catch (e: any) {
    results.format3_form_php = { error: e.message }
  }

  // Find which format worked
  const workingFormat = Object.entries(results).find(
    ([, v]: [string, any]) => v.status && v.status >= 200 && v.status < 300
  )

  return NextResponse.json({
    testRef,
    testAmount,
    signatureValid: testSignature.length === 64,
    proxyMode: config.useProxy,
    results,
    workingFormat: workingFormat ? workingFormat[0] : null,
    suggestion: workingFormat
      ? `Format "${workingFormat[0]}" berhasil! Akan diupdate ke kode utama.`
      : 'Semua format gagal. Cek detail error di atas.',
  })
}
