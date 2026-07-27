import { jsPDF } from 'jspdf'
import type { EmailTicketPayload, FestivalDayInfo } from '@/lib/festival-seats'

// Color palette
const CHARCOAL = '#1a1a2e'
const GOLD = '#C8A951'
const CREAM = '#f9f7f4'
const DARK_CHARCOAL = '#0f0f1e'
const LIGHT_GOLD = '#e8d48b'

// ── Helpers ────────────────────────────────────────────────────────

function formatDateForPdf(iso: string | Date): string {
  // "Sabtu, 5 Juli 2025"
  return new Date(iso).toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function formatTimeForPdf(iso: string | Date): string {
  // "19.00 WIB"
  return `${new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit',
  })} WIB`
}

function formatDayShortForPdf(iso: string | Date): string {
  // "Sab, 5 Jul"
  return new Date(iso).toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

// ── Main generator ─────────────────────────────────────────────────

export async function generateTicketPdf(data: EmailTicketPayload): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  // ── Header band ──────────────────────────────────────────
  doc.setFillColor(DARK_CHARCOAL)
  doc.rect(0, 0, pageW, 52, 'F')

  // Gold accent line at bottom of header
  doc.setDrawColor(GOLD)
  doc.setLineWidth(0.8)
  doc.line(0, 52, pageW, 52)

  // Brand text
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(GOLD)
  doc.text('TEATERAN', pageW / 2, 22, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(LIGHT_GOLD)
  doc.text('E-TIKET RESMI  |  OFFICIAL E-TICKET', pageW / 2, 30, { align: 'center' })

  // ── Event Title ──────────────────────────────────────────
  const yStart = 62

  doc.setFontSize(9)
  doc.setTextColor('#999999')
  doc.text('PERTUNJUKAN', pageW / 2, yStart, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(CHARCOAL)
  doc.text(data.eventName, pageW / 2, yStart + 10, { align: 'center' })

  // Decorative gold line under title
  const titleW = doc.getTextWidth(data.eventName)
  doc.setDrawColor(GOLD)
  doc.setLineWidth(0.3)
  doc.line((pageW - titleW) / 2 - 8, yStart + 13, (pageW + titleW) / 2 + 8, yStart + 13)

  // ── Event Details ────────────────────────────────────────
  const detailY = yStart + 22

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor('#666666')

  // Date
  doc.setFontSize(8)
  doc.setTextColor('#999999')
  doc.text('TANGGAL', pageW / 2, detailY, { align: 'center' })
  doc.setFontSize(11)
  doc.setTextColor(CHARCOAL)
  doc.text(data.showDate, pageW / 2, detailY + 7, { align: 'center' })

  // Open gate (regular tickets only — festival passes render per-day below)
  let nextY = detailY + 16
  if (data.openGate && !data.festivalDays) {
    doc.setFontSize(8)
    doc.setTextColor('#999999')
    doc.text('BUKA PINTU / OPEN GATE', pageW / 2, nextY, { align: 'center' })
    doc.setFontSize(11)
    doc.setTextColor(GOLD)
    doc.text(data.openGate + ' WIB', pageW / 2, nextY + 7, { align: 'center' })
    nextY += 16
  }

  // Location
  doc.setFontSize(8)
  doc.setTextColor('#999999')
  doc.text('LOKASI', pageW / 2, nextY, { align: 'center' })
  doc.setFontSize(11)
  doc.setTextColor(CHARCOAL)
  doc.text(data.location, pageW / 2, nextY + 7, { align: 'center' })
  nextY += 16

  // ── Festival: list each applicable day with open gate ──
  if (data.festivalDays && data.festivalDays.length > 0) {
    const festivalY = nextY + 2

    doc.setFontSize(8)
    doc.setTextColor(GOLD)
    doc.text('HARI PERTUNJUKAN / SHOW DAYS', pageW / 2, festivalY, { align: 'center' })

    // Each day: a row with date + time + (optional) open gate
    const rowH = 7
    const listTopY = festivalY + 4
    const listW = pageW - 60
    const listX = 30

    // Background card
    const cardH = data.festivalDays.length * rowH + 8
    doc.setFillColor(CREAM)
    doc.roundedRect(listX, listTopY, listW, cardH, 2, 2, 'F')

    doc.setFontSize(9)
    data.festivalDays.forEach((d: FestivalDayInfo, idx: number) => {
      const rowY = listTopY + 6 + idx * rowH
      const dateStr = formatDayShortForPdf(d.date)
      const timeStr = formatTimeForPdf(d.date)
      const gateStr = d.openGate ? formatTimeForPdf(d.openGate) : null
      const labelStr = d.label ? ` · ${d.label}` : ''

      doc.setFont('helvetica', 'bold')
      doc.setTextColor(CHARCOAL)
      doc.text(`${dateStr} · ${timeStr}${labelStr}`, listX + 4, rowY)

      if (gateStr) {
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(GOLD)
        doc.text(`Buka Pintu: ${gateStr}`, listX + listW - 4, rowY, { align: 'right' })
      }
    })

    nextY = listTopY + cardH + 6
  }

  // ── Seat Codes (prominent) ───────────────────────────────
  const seatY = nextY + 4

  // Background card for seats
  const cardPad = 10
  const seatLabelH = 7
  const seatCodeH = data.festivalDays ? 14 : 18  // smaller font if festival (longer text)
  const cardTotalH = seatLabelH + seatCodeH + cardPad * 2
  const cardW = pageW - 40
  const cardX = 20

  doc.setFillColor(CHARCOAL)
  doc.roundedRect(cardX, seatY, cardW, cardTotalH, 3, 3, 'F')

  doc.setFontSize(7)
  doc.setTextColor(GOLD)
  doc.text(
    data.festivalDays ? 'FESTIVAL PASS / KODE TRANSAKSI' : 'NOMOR KURSI  /  SEAT NUMBERS',
    pageW / 2, seatY + cardPad + 4, { align: 'center' }
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(data.festivalDays ? 14 : 28)
  doc.setTextColor('#ffffff')

  if (data.festivalDays) {
    // For festival passes: show deduplicated seat codes (strip the @dayId suffix)
    const uniqueSeats = [...new Set(data.seatCodes.map((c) => c.split('@')[0]))]
    doc.text(uniqueSeats.join('    '), pageW / 2, seatY + cardPad + seatLabelH + 10, { align: 'center' })
  } else {
    doc.text(data.seatCodes.join('    '), pageW / 2, seatY + cardPad + seatLabelH + 12, { align: 'center' })
  }

  // ── QR Code ──────────────────────────────────────────────
  const qrY = seatY + cardTotalH + 10
  const qrSize = 38
  const qrX = pageW / 2 - qrSize / 2

  // Add QR code image (base64 data URL)
  doc.addImage(data.qrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)

  doc.setFontSize(7)
  doc.setTextColor('#999999')
  doc.text('Scan QR Code di pintu masuk', pageW / 2, qrY + qrSize + 5, { align: 'center' })

  // ── Divider ──────────────────────────────────────────────
  const divY = qrY + qrSize + 12
  doc.setDrawColor('#e0e0e0')
  doc.setLineWidth(0.2)
  doc.line(30, divY, pageW - 30, divY)

  // ── Customer & Amount ────────────────────────────────────
  const infoY = divY + 8

  // Customer Name
  doc.setFontSize(7)
  doc.setTextColor('#999999')
  doc.text('NAMA PESANAN', 20, infoY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(CHARCOAL)
  doc.text(data.customerName, 20, infoY + 7)

  // Transaction ID
  doc.setFontSize(7)
  doc.setTextColor('#999999')
  doc.text('TRANSACTION ID', pageW - 20, infoY, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(CHARCOAL)
  doc.text(data.transactionId, pageW - 20, infoY + 7, { align: 'right' })

  // Total Amount
  const amtY = infoY + 18
  doc.setFontSize(7)
  doc.setTextColor('#999999')
  doc.text('TOTAL PEMBAYARAN', pageW / 2, amtY, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(GOLD)
  doc.text('Rp ' + data.totalAmount.toLocaleString('id-ID'), pageW / 2, amtY + 10, { align: 'center' })

  // ── Note ─────────────────────────────────────────────────
  const noteY = amtY + 22

  doc.setFillColor(CREAM)
  doc.roundedRect(20, noteY, pageW - 40, 18, 2, 2, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor('#666666')
  doc.text('Tunjukkan e-tiket ini ke meja registrasi saat hari H.', pageW / 2, noteY + 8, { align: 'center' })
  doc.text('Show this e-ticket at the registration desk on the event day.', pageW / 2, noteY + 13, { align: 'center' })

  // ── Footer ───────────────────────────────────────────────
  const footerY = pageH - 20
  doc.setFillColor(DARK_CHARCOAL)
  doc.rect(0, footerY - 2, pageW, 22, 'F')

  doc.setFontSize(7)
  doc.setTextColor(GOLD)
  doc.text('TEATERAN', pageW / 2, footerY + 5, { align: 'center' })
  doc.setFontSize(6)
  doc.setTextColor('#666666')
  doc.text('teateran.vercel.app  |  E-Tiket ini digenerate secara otomatis dan sah sebagai bukti pembayaran.', pageW / 2, footerY + 11, { align: 'center' })

  return Buffer.from(doc.output('arraybuffer'))
}
