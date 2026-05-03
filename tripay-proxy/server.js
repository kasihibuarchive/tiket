const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;
const PROXY_AUTH_KEY = process.env.PROXY_AUTH_KEY || 'changeme';
const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY;
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY;
const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE;
const TRIPAY_IS_PRODUCTION = process.env.TRIPAY_IS_PRODUCTION === 'true';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const TRIPAY_HOST = 'tripay.co.id';
const TRIPAY_BASE_PATH = TRIPAY_IS_PRODUCTION ? '/api' : '/api-sandbox';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON')); }
    });
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

function tripayRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const isPost = method === 'POST';
    let bodyStr = '';
    if (isPost && body) {
      bodyStr = new URLSearchParams(body).toString();
    }
    const options = {
      hostname: TRIPAY_HOST,
      port: 443,
      path: TRIPAY_BASE_PATH + path,
      method,
      headers: {
        'Authorization': 'Bearer ' + TRIPAY_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(isPost ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
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
    if (isPost && bodyStr) req.write(bodyStr);
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
      const body = await readBody(req);
      const { method, merchant_ref, amount, customer_name, customer_email, customer_phone, order_items, callback_url, return_url, expired_time, signature } = body;

      if (!method || !merchant_ref || !amount || !signature) {
        return sendJSON(res, 400, { error: 'Missing required params' });
      }

      // Verify signature
      const crypto = require('crypto');
      const expected = crypto
        .createHmac('sha256', TRIPAY_PRIVATE_KEY)
        .update(TRIPAY_MERCHANT_CODE + merchant_ref + String(amount))
        .digest('hex');

      if (signature !== expected) {
        return sendJSON(res, 403, { error: 'Invalid signature' });
      }

      const result = await tripayRequest('/transaction/create', 'POST', {
        method,
        merchant_ref,
        amount: String(amount),
        customer_name: customer_name || '',
        customer_email: customer_email || '',
        customer_phone: customer_phone || '',
        order_items: JSON.stringify(order_items),
        callback_url,
        return_url,
        expired_time: String(expired_time),
        signature,
      });

      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { error: 'Proxy error: ' + err.message });
    }
  }

  // Transaction detail
  if (req.method === 'POST' && req.url === '/api/transaction/detail') {
    try {
      const body = await readBody(req);
      if (!body.reference) {
        return sendJSON(res, 400, { error: 'Missing reference' });
      }
      const result = await tripayRequest('/transaction/detail?reference=' + encodeURIComponent(body.reference), 'GET');
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
