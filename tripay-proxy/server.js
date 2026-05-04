const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;
const PROXY_AUTH_KEY = process.env.PROXY_AUTH_KEY || 'changeme';
const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY;
const TRIPAY_IS_PRODUCTION = process.env.TRIPAY_IS_PRODUCTION === 'true';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const TRIPAY_HOST = 'tripay.co.id';
const TRIPAY_BASE_PATH = TRIPAY_IS_PRODUCTION ? '/api' : '/api-sandbox';

/**
 * Read raw body bytes from request (no parsing, no decoding).
 */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Auth',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Transparently forward a request to Tripay.
 * Reads raw body, adds Authorization header, forwards bytes as-is.
 * No JSON parsing, no form parsing, no encoding/decoding.
 */
function tripayPassthrough(tripayPath, method, rawBodyBuffer, contentType) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Authorization': 'Bearer ' + TRIPAY_API_KEY,
    };
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    if (rawBodyBuffer && rawBodyBuffer.length > 0) {
      headers['Content-Length'] = rawBodyBuffer.length;
    }

    const options = {
      hostname: TRIPAY_HOST,
      port: 443,
      path: TRIPAY_BASE_PATH + tripayPath,
      method,
      headers,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        let parsed;
        try { parsed = JSON.parse(body.toString()); }
        catch { parsed = body.toString(); }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    if (rawBodyBuffer && rawBodyBuffer.length > 0) req.write(rawBodyBuffer);
    req.end();
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

  // Health + version check (no auth) — use this to verify proxy is running latest code
  if (req.method === 'GET' && req.url === '/health') {
    return sendJSON(res, 200, {
      status: 'ok',
      version: 3,
      tripayMode: TRIPAY_IS_PRODUCTION ? 'production' : 'sandbox',
      hasApiKey: !!TRIPAY_API_KEY,
      message: 'Transparent passthrough proxy — no body parsing',
    });
  }

  // Auth check
  const authHeader = req.headers['x-proxy-auth'];
  if (authHeader !== PROXY_AUTH_KEY) {
    return sendJSON(res, 401, { error: 'Unauthorized' });
  }

  // ── Route: POST /api/transaction/create ──
  // Pure transparent passthrough. Reads raw bytes, forwards to Tripay as-is.
  if (req.method === 'POST' && req.url === '/api/transaction/create') {
    try {
      const rawBody = await readRawBody(req);
      const contentType = req.headers['content-type'] || 'application/x-www-form-urlencoded';

      console.log('[transaction/create] Forwarding', rawBody.length, 'bytes, content-type:', contentType);

      const result = await tripayPassthrough('/transaction/create', 'POST', rawBody, contentType);
      console.log('[transaction/create] Tripay responded:', result.status);
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      console.error('[transaction/create] Error:', err.message);
      return sendJSON(res, 500, { error: 'Proxy error: ' + err.message });
    }
  }

  // ── Route: POST /api/transaction/detail ──
  // Transparent passthrough for transaction detail queries.
  if (req.method === 'POST' && req.url === '/api/transaction/detail') {
    try {
      const rawBody = await readRawBody(req);

      // Need to extract reference from body — try form-encoded first, then JSON
      let reference = null;
      try {
        // form-encoded
        const params = new URLSearchParams(rawBody.toString());
        reference = params.get('reference');
      } catch {
        // JSON
        try {
          const json = JSON.parse(rawBody.toString());
          reference = json.reference;
        } catch {}
      }

      if (!reference) {
        return sendJSON(res, 400, { error: 'Missing reference' });
      }

      const result = await tripayPassthrough(
        '/transaction/detail?reference=' + encodeURIComponent(reference),
        'GET',
        null,
        null
      );
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { error: 'Proxy error: ' + err.message });
    }
  }

  // ── Route: GET /api/merchant/payment-channel ──
  if (req.method === 'GET' && req.url === '/api/merchant/payment-channel') {
    try {
      const result = await tripayPassthrough('/merchant/payment-channel', 'GET', null, null);
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { error: 'Proxy error: ' + err.message });
    }
  }

  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log('=== Teateran Tripay Proxy v3 ===');
  console.log('Mode:', TRIPAY_IS_PRODUCTION ? 'PRODUCTION' : 'SANDBOX');
  console.log('Port:', PORT);
  console.log('Auth key:', PROXY_AUTH_KEY);
  console.log('Strategy: Transparent passthrough (no body parsing)');
  console.log('IMPORTANT: Whitelist this server IP in Tripay dashboard');
});
