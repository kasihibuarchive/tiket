# Teateran Tripay Proxy

Proxy tanpa dependency (pure Node.js) untuk menghubungkan Vercel ke Tripay API.

## Deploy ke Render.com

1. **Buka [render.com](https://render.com)** → Sign up dengan GitHub

2. **New → Web Service** → Connect repo `kasihibuarchive/tiket`

3. **PENTING** — Setting:
   - **Root Directory**: `tripay-proxy`
   - **Build Command**: (kosongkan / hapus isi defaultnya)
   - **Start Command**: `node server.js`
   - **Instance Type**: **Free**

4. **Environment Variables**:
   | Key | Value |
   |-----|-------|
   | `TRIPAY_API_KEY` | dari dashboard Tripay |
   | `TRIPAY_PRIVATE_KEY` | dari dashboard Tripay |
   | `TRIPAY_MERCHANT_CODE` | dari dashboard Tripay |
   | `TRIPAY_IS_PRODUCTION` | `false` |
   | `PROXY_AUTH_KEY` | bikin random string |
   | `ALLOWED_ORIGIN` | `https://www.teateran.site` |

5. **Create Web Service** → tunggu Live

6. **Test**: buka `https://nama-service.onrender.com/health`
   - Harus keluar `{"status":"ok",...}`

7. **Cari IP**: buka terminal → `nslookup nama-service.onrender.com`

8. **Whitelist IP** di Tripay Dashboard

9. **Set Vercel env vars**:
   - `TRIPAY_PROXY_URL` = `https://nama-service.onrender.com`
   - `TRIPAY_PROXY_AUTH_KEY` = (sama dengan PROXY_AUTH_KEY di atas)
