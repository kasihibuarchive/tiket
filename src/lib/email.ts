import nodemailer from 'nodemailer'
import { generateTicketPdf } from '@/lib/generate-ticket-pdf'
import type { EmailTicketPayload, FestivalDayInfo } from '@/lib/festival-seats'

// Lazy transporter — created fresh on every call so runtime env vars are always used
function getTransporter() {
  const emailUser = process.env.EMAIL_USER
  const emailPass = process.env.EMAIL_PASS
  console.log('[EMAIL] Creating transporter — USER:', emailUser, '| PASS:', emailPass ? emailPass.substring(0, 4) + '...' : 'UNDEFINED')

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
    tls: {
      rejectUnauthorized: false,
      // Do NOT set ciphers: 'SSLv3' — it's been deprecated since 2014 and Gmail rejects it
    },
  })
}

function formatDayShort(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function formatTime(iso: string): string {
  return `${new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit',
  })} WIB`
}

// ── Build the .highlight info-rows block depending on ticket type ──
function buildInfoRows(data: EmailTicketPayload): string {
  const seatDisplay = data.festivalDays
    ? [...new Set(data.seatCodes.map((c) => c.split('@')[0]))].join(', ')
    : data.seatCodes.join(', ')

  // For regular tickets with openGate, render the open gate row
  const openGateRow = (data.openGate && !data.festivalDays)
    ? `<div class="info-row">
        <span class="info-label">Buka Pintu</span>
        <span class="info-value" style="color: #C8A951;">${data.openGate} WIB</span>
      </div>`
    : ''

  // For festival passes, render each applicable day as its own row
  let festivalRows = ''
  if (data.festivalDays && data.festivalDays.length > 0) {
    festivalRows = data.festivalDays.map((d: FestivalDayInfo, idx: number) => {
      const label = d.label ? ` (${d.label})` : ''
      const gateStr = d.openGate
        ? ` · Buka Pintu: <strong style="color:#C8A951;">${formatTime(d.openGate)}</strong>`
        : ''
      return `<div class="info-row">
        <span class="info-label">Hari ${idx + 1}${label}</span>
        <span class="info-value">${formatDayShort(d.date)} · ${formatTime(d.date)}${gateStr}</span>
      </div>`
    }).join('')
  }

  return `
    <div class="info-row">
      <span class="info-label">Acara</span>
      <span class="info-value">${data.eventName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Tanggal</span>
      <span class="info-value">${data.showDate}</span>
    </div>
    ${openGateRow}
    <div class="info-row">
      <span class="info-label">Lokasi</span>
      <span class="info-value">${data.location}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${data.festivalDays ? 'Kursi' : 'Kursi'}</span>
      <span class="info-value">${seatDisplay}</span>
    </div>
    ${festivalRows}
    <div class="info-row">
      <span class="info-label">Total</span>
      <span class="info-value" style="color: #C8A951;">Rp ${data.totalAmount.toLocaleString('id-ID')}</span>
    </div>
    <div class="info-row" style="border: none;">
      <span class="info-label">Transaction ID</span>
      <span class="info-value">${data.transactionId}</span>
    </div>
  `
}

export async function sendETicketEmail(data: EmailTicketData) {
  console.log('[EMAIL] sendETicketEmail called for:', data.customerEmail, '| order:', data.transactionId)

  // Check env vars first
  const emailUser = process.env.EMAIL_USER
  const emailPass = process.env.EMAIL_PASS
  if (!emailUser || !emailPass) {
    const msg = `[EMAIL] Missing EMAIL_USER or EMAIL_PASS! USER: ${emailUser ? 'SET' : 'UNDEF'}, PASS: ${emailPass ? 'SET' : 'UNDEF'}. Cannot send email.`
    console.error(msg)
    throw new Error(msg)
  }
  console.log('[EMAIL] Env vars OK, generating PDF...')

  // Generate PDF e-ticket
  let pdfBuffer: Buffer
  try {
    pdfBuffer = await generateTicketPdf({
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      eventName: data.eventName,
      showDate: data.showDate,
      openGate: data.openGate,
      location: data.location,
      seatCodes: data.seatCodes,
      transactionId: data.transactionId,
      totalAmount: data.totalAmount,
      qrCodeDataUrl: data.qrCodeDataUrl,
      festivalDays: data.festivalDays,
      template: data.template,
    })
    console.log('[EMAIL] PDF generated, size:', pdfBuffer.length, 'bytes. Sending email via SMTP...')
  } catch (pdfErr: any) {
    console.error('[EMAIL] ❌ Failed to generate PDF:', pdfErr.message || pdfErr)
    throw pdfErr
  }

  const infoRowsHtml = buildInfoRows(data)

  const festivalBanner = data.festivalDays && data.festivalDays.length > 0
    ? `<div style="margin: 16px 0; padding: 12px 14px; background: #fff8e1; border-left: 3px solid #C8A951; border-radius: 0 6px 6px 0;">
        <p style="margin: 0; font-size: 12px; color: #8a6d1d; line-height: 1.5;">
          <strong>Festival Pass:</strong> 1 QR berlaku untuk <strong>${data.festivalDays.length} hari</strong> pertunjukan.
          Tunjukkan QR yang sama di pintu masuk setiap hari. Jam buka pintu tertera per hari di atas.
        </p>
      </div>`
    : ''

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f9f7f4; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        .header { background: #1a1a2e; padding: 30px; text-align: center; }
        .header h1 { color: #C8A951; font-family: Georgia, serif; margin: 0; font-size: 22px; letter-spacing: 2px; }
        .header p { color: #999; margin: 6px 0 0; font-size: 13px; }
        .content { padding: 30px; }
        .greeting { font-size: 15px; color: #333; margin-bottom: 16px; line-height: 1.6; }
        .highlight { background: #f9f7f4; border-left: 3px solid #C8A951; padding: 14px 18px; border-radius: 0 8px 8px 0; margin: 20px 0; }
        .highlight p { color: #555; font-size: 13px; line-height: 1.6; margin: 0; }
        .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; gap: 12px; }
        .info-label { color: #999; flex-shrink: 0; }
        .info-value { color: #1a1a2e; font-weight: 600; text-align: right; }
        .note { text-align: center; margin-top: 20px; padding: 16px; background: #1a1a2e; border-radius: 8px; }
        .note p { color: #C8A951; font-size: 12px; margin: 0; }
        .footer { text-align: center; padding: 20px 30px; background: #faf8f5; color: #999; font-size: 11px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>TEATERAN</h1>
          <p>E-Tiket Resmi</p>
        </div>
        <div class="content">
          <p class="greeting">
            Halo <strong>${data.customerName}</strong>,
          </p>
          <p class="greeting">
            Ini adalah e-tiket kamu untuk pertunjukan di Teateran.
            Tunjukkan e-tiket ini (file PDF terlampir) ke meja registrasi saat hari H.
          </p>
          <div class="highlight">
            ${infoRowsHtml}
          </div>
          ${festivalBanner}
          <div class="note">
            <p>Tunjukkan e-tiket ini ke meja registrasi saat hari H</p>
          </div>
        </div>
        <div class="footer">
          <p>Terima kasih telah memilih Teateran.</p>
          <p style="margin-top: 5px; color: #bbb;">E-Tiket ini digenerate secara otomatis dan sah sebagai bukti pembayaran.</p>
        </div>
      </div>
    </body>
    </html>
  `

  const transporter = getTransporter()

  try {
    const info = await transporter.sendMail({
      from: `"Teateran" <${emailUser}>`,
      to: data.customerEmail,
      subject: 'E-TIKET TEATERAN',
      html,
      attachments: [
        {
          filename: `e-ticket-${data.transactionId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    })
    console.log('[EMAIL] ✅ Email sent successfully! MessageID:', info.messageId, 'to:', data.customerEmail)
  } catch (err: any) {
    console.error('[EMAIL] ❌ Failed to send email:', err.message || err)
    throw err
  }
}

// ── Backward-compat type alias ─────────────────────────────────────
// Existing callers that pass { customerName, ..., showDate, ... } (without openGate/festivalDays)
// still work because EmailTicketPayload has those fields as optional.
export type EmailTicketData = EmailTicketPayload
