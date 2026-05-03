const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['POST'],
}));

// Simple API key auth so only Teateran can use this proxy
const PROXY_AUTH_KEY = process.env.PROXY_AUTH_KEY || crypto.randomBytes(32).toString('hex');

// Tripay config
const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY;
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY;
const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE;
const TRIPAY_IS_PRODUCTION = process.env.TRIPAY_IS_PRODUCTION === 'true';

const TRIPAY_BASE_URL = TRIPAY_IS_PRODUCTION
  ? 'https://tripay.co.id/api'
  : 'https://tripay.co.id/api-sandbox';

function checkAuth(req, res) {
  const authHeader = req.headers['x-proxy-auth'];
  if (!authHeader || authHeader !== PROXY_AUTH_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// Health check (no auth needed)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    tripayMode: TRIPAY_IS_PRODUCTION ? 'production' : 'sandbox',
    hasApiKey: !!TRIPAY_API_KEY,
  });
});

// ─── Create Transaction (Closed Payment) ────────────────────────────────────
app.post('/api/transaction/create', async (req, res) => {
  if (!checkAuth(req, res)) return;

  try {
    const { method, merchant_ref, amount, customer_name, customer_email, customer_phone, order_items, callback_url, return_url, expired_time, signature } = req.body;

    if (!method || !merchant_ref || !amount || !signature) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Verify the signature locally
    const expectedSignature = crypto
      .createHmac('sha256', TRIPAY_PRIVATE_KEY)
      .update(TRIPAY_MERCHANT_CODE + merchant_ref + String(amount))
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const params = new URLSearchParams({
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

    const tripayRes = await fetch(TRIPAY_BASE_URL + '/transaction/create', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + TRIPAY_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await tripayRes.json();
    res.status(tripayRes.ok ? 200 : 502).json(data);
  } catch (err) {
    console.error('[proxy] Error:', err.message);
    res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
});

// ─── Get Transaction Detail ─────────────────────────────────────────────────
app.post('/api/transaction/detail', async (req, res) => {
  if (!checkAuth(req, res)) return;

  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Missing reference' });
    }

    const tripayRes = await fetch(TRIPAY_BASE_URL + '/transaction/detail?reference=' + encodeURIComponent(reference), {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + TRIPAY_API_KEY,
      },
    });

    const data = await tripayRes.json();
    res.status(tripayRes.ok ? 200 : 502).json(data);
  } catch (err) {
    console.error('[proxy] Error:', err.message);
    res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
});

// ─── Start Server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('=== Teateran Tripay Proxy ===');
  console.log('Mode:', TRIPAY_IS_PRODUCTION ? 'PRODUCTION' : 'SANDBOX');
  console.log('Listening on port:', PORT);
  console.log('Auth key:', PROXY_AUTH_KEY);
  console.log('IMPORTANT: Set this PROXY_AUTH_KEY in your Vercel env vars as TRIPAY_PROXY_AUTH_KEY');
  console.log('IMPORTANT: Whitelist this server\'s IP in Tripay dashboard');
});
