const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PROXY_AUTH_KEY = process.env.PROXY_AUTH_KEY || 'changeme';
const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY;
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY;
const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE;
const TRIPAY_IS_PRODUCTION = process.env.TRIPAY_IS_PRODUCTION === 'true';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const TRIPAY_HOST = 'tripay.co.id';
const TRIPAY_BASE_PATH = TRIPAY_IS_PRODUCTION ? '/api' : '/api-sandbox';

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Auth',
  });
  res.end(JSON.stringify(data));
}

/**
 * Manually build a URL-encoded form body from a flat key-value object.
 * Uses encodeURIComponent for both keys and values — avoids any URLSearchParams
 * edge cases with special characters in JSON strings.
 */
function buildFormBody(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
    .join('&');
}

/**
 * Forward a raw form-encoded body directly to Tripay.
 */
function tripayForward(path, method, rawBody) {
  return new Promise((resolve, reject) => {
    const isPost = method === 'POST';
    const options = {
      hostname: TRIPAY_HOST,
      port: 443,
      path: TRIPAY_BASE_PATH + path,
      method,
      headers: {
        'Authorization': 'Bearer ' + TRIPAY_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(isPost && rawBody ? { 'Content-Length': Buffer.byteLength(rawBody) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (isPost && rawBody) req.write(rawBody);
    req.end();
  });
}

/**
 * Build the form-encoded body for Tripay transaction create.
 * order_items must be a JSON-stringified array — we build it manually
 * to avoid URLSearchParams issues with nested JSON in form values.
 */
function buildTransactionFormBody(params) {
  return buildFormBody({
    method: params.method,
    merchant_ref: params.merchant_ref,
    amount: String(params.amount),
    customer_name: params.customer_name || '',
    customer_email: params.customer_email || '',
    customer_phone: params.customer_phone || '',
    order_items: JSON.stringify(params.order_items),
    callback_url: params.callback_url,
    return_url: params.return_url,
    expired_time: String(params.expired_time),
    signature: params.signature,
  });
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Auth',
    });
    return res.end();
  }

  // Health check (no auth)
  if (req.method === 'GET' && req.url === '/health') {
    return sendJSON(res, 200, {
      status: 'ok',
      tripayMode: TRIPAY_IS_PRODUCTION ? 'production' : 'sandbox',
      hasApiKey: !!TRIPAY_API_KEY,
    });
  }

  // Auth check
  const authHeader = req.headers['x-proxy-auth'];
  if (authHeader !== PROXY_AUTH_KEY) {
    return sendJSON(res, 401, { error: 'Unauthorized' });
  }

  // Create transaction
  if (req.method === 'POST' && req.url === '/api/transaction/create') {
    try {
      const rawBody = await readRawBody(req);
      const contentType = (req.headers['content-type'] || '').toLowerCase();
      let method, merchant_ref, amount, signature, order_items;
      let formBodyToSend;

      if (contentType.includes('application/json')) {
        // JSON from older Next.js versions — parse and re-encode manually
        const json = JSON.parse(rawBody);
        method = json.method;
        merchant_ref = json.merchant_ref;
        amount = json.amount;
        signature = json.signature;
        order_items = json.order_items;

        if (!method || !merchant_ref || !amount || !signature) {
          return sendJSON(res, 400, { error: 'Missing required params' });
        }

        // Build form body manually — this is the critical fix
        formBodyToSend = buildTransactionFormBody(json);
      } else {
        // form-urlencoded from newer Next.js — parse params for verification
        const params = new URLSearchParams(rawBody);
        method = params.get('method');
        merchant_ref = params.get('merchant_ref');
        amount = params.get('amount');
        signature = params.get('signature');

        if (!method || !merchant_ref || !amount || !signature) {
          return sendJSON(res, 400, { error: 'Missing required params' });
        }

        // Forward raw body as-is
        formBodyToSend = rawBody;
      }

      // Verify signature
      const expected = crypto
        .createHmac('sha256', TRIPAY_PRIVATE_KEY)
        .update(TRIPAY_MERCHANT_CODE + merchant_ref + String(amount))
        .digest('hex');

      if (signature !== expected) {
        return sendJSON(res, 403, { error: 'Invalid signature' });
      }

      // Forward to Tripay
      const result = await tripayForward('/transaction/create', 'POST', formBodyToSend);
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { error: 'Proxy error: ' + err.message });
    }
  }

  // Transaction detail — accept both JSON and form-encoded
  if (req.method === 'POST' && req.url === '/api/transaction/detail') {
    try {
      const rawBody = await readRawBody(req);
      const contentType = (req.headers['content-type'] || '').toLowerCase();
      let reference;

      if (contentType.includes('application/json')) {
        const json = JSON.parse(rawBody);
        reference = json.reference;
      } else {
        const params = new URLSearchParams(rawBody);
        reference = params.get('reference');
      }

      if (!reference) {
        return sendJSON(res, 400, { error: 'Missing reference' });
      }

      const result = await tripayForward('/transaction/detail?reference=' + encodeURIComponent(reference), 'GET');
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { error: 'Proxy error: ' + err.message });
    }
  }

  // Payment channels (GET, proxy forwards to Tripay)
  if (req.method === 'GET' && req.url === '/api/merchant/payment-channel') {
    try {
      const result = await tripayForward('/merchant/payment-channel', 'GET');
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { error: 'Proxy error: ' + err.message });
    }
  }

  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log('=== Teateran Tripay Proxy ===');
  console.log('Mode:', TRIPAY_IS_PRODUCTION ? 'PRODUCTION' : 'SANDBOX');
  console.log('Port:', PORT);
  console.log('Auth key:', PROXY_AUTH_KEY);
  console.log('IMPORTANT: Set PROXY_AUTH_KEY as TRIPAY_PROXY_AUTH_KEY in Vercel');
  console.log('IMPORTANT: Whitelist this server IP in Tripay dashboard');
});
