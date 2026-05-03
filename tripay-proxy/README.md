# Teateran Tripay Proxy

Proxy server dengan IP statis untuk menghubungkan Vercel (serverless) ke Tripay API.

## Masalah
Vercel serverless punya IP dinamis → tidak bisa di-whitelist di Tripay.

## Solusi
Proxy ini di-deploy di platform dengan IP statis (Render/Railway/Fly.io), lalu:
- Vercel → Proxy (IP statis) → Tripay
- Proxy IP di-whitelist di dashboard Tripay

---

## Deploy ke Render.com (Gratis)

1. **Fork/Upload repo ini** ke GitHub (atau buat repo baru, isi file `server.js`, `package.json`)

2. **Buka [render.com](https://render.com)** → Sign up dengan GitHub

3. **Buat Web Service baru:**
   - Klik **New → Web Service**
   - Connect repo GitHub kamu
   - Setting:
     - **Name**: `teateran-tripay-proxy`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `node server.js`
     - **Instance Type**: `Free`
   - Klik **Create Web Service**

4. **Set Environment Variables** (di bagian Environment):
   ```
   TRIPAY_API_KEY      = (isi dari dashboard Tripay)
   TRIPAY_PRIVATE_KEY  = (isi dari dashboard Tripay)
   TRIPAY_MERCHANT_CODE = (isi dari dashboard Tripay)
   TRIPAY_IS_PRODUCTION = false
   PROXY_AUTH_KEY      = (buat random string, misal: abc123xyz)
   ALLOWED_ORIGIN      = https://www.teateran.site
   ```

5. **Deploy** → Tunggu sampai aktif (status "Live")

6. **Copy URL proxy**, formatnya: `https://teateran-tripay-proxy.onrender.com`

7. **Dapatkan IP proxy:**
   ```
   curl https://api.ipify.org?hostname=teateran-tripay-proxy.onrender.com
   ```
   Atau: `nslookup teateran-tripay-proxy.onrender.com`

8. **Whitelist IP tersebut di Tripay Dashboard** → Preferensi → IP Whitelist

---

## Deploy ke Fly.io (Gratis, IP dedicated)

1. Install flyctl: `curl -L https://fly.io/install.sh | sh`
2. Login: `fly auth login`
3. Di folder proxy, jalankan:
   ```
   fly launch
   ```
4. Set secrets:
   ```
   fly secrets set TRIPAY_API_KEY=xxx
   fly secrets set TRIPAY_PRIVATE_KEY=xxx
   fly secrets set TRIPAY_MERCHANT_CODE=xxx
   fly secrets set TRIPAY_IS_PRODUCTION=false
   fly secrets set PROXY_AUTH_KEY=random_string
   fly secrets set ALLOWED_ORIGIN=https://www.teateran.site
   ```
5. Deploy: `fly deploy`
6. Dapatkan IP: `fly ips list`
7. Whitelist IP di Tripay

---

## Setup di Vercel (Teateran)

Setelah proxy aktif, tambahkan env var di Vercel:

```
TRIPAY_PROXY_URL = https://teateran-tripay-proxy.onrender.com
TRIPAY_PROXY_AUTH_KEY = (sama dengan PROXY_AUTH_KEY di proxy)
```

Kode Teateran sudah diupdate otomatis — kalau `TRIPAY_PROXY_URL` di-set, semua request ke Tripay akan lewat proxy.
