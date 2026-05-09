import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendETicketEmail } from '@/lib/email'
import QRCode from 'qrcode'

// POST /api/usher/resend-email
// Resend e-ticket email for a given transactionId
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { transactionId } = body

    if (!transactionId) {
      return NextResponse.json(
        { error: 'transactionId is required' },
        { status: 400 }
      )
    }

    // Find the transaction
    const transaction = await db.transaction.findUnique({
      where: { transactionId },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaksi tidak ditemukan' },
        { status: 404 }
      )
    }

    if (transaction.paymentStatus !== 'PAID') {
      return NextResponse.json(
        { error: 'Hanya transaksi yang sudah dibayar yang bisa dikirim ulang' },
        { status: 400 }
      )
    }

    // Parse seat codes
    let seatCodes: string[]
    try {
      seatCodes = JSON.parse(transaction.seatCodes)
    } catch {
      seatCodes = transaction.seatCodes.split(',').map((s: string) => s.trim()).filter(Boolean)
    }

    // Get event info
    const event = await db.event.findUnique({
      where: { id: transaction.eventId },
    })

    if (!event) {
      return NextResponse.json(
        { error: 'Event tidak ditemukan' },
        { status: 404 }
      )
    }

    // Get or generate QR code
    let qrDataUrl = transaction.qrCodeUrl || ''
    if (!qrDataUrl || qrDataUrl === transactionId) {
      const qrText = 'NAMA: ' + transaction.customerName + ' | KURSI: ' + JSON.stringify(seatCodes) + ' | KODE TRX: ' + transaction.transactionId
      qrDataUrl = await QRCode.toDataURL(qrText)

      // Save QR code to transaction
      await db.transaction.update({
        where: { transactionId },
        data: { qrCodeUrl: qrDataUrl },
      })
    }

    // Get email template
    const emailTemplate = await db.emailTemplate.findFirst({ where: { isActive: true } })

    // Format date
    const showDate = new Date(event.showDate).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    // Send email (synchronous — wait for result)
    try {
      await sendETicketEmail({
        customerName: transaction.customerName,
        customerEmail: transaction.customerEmail,
        eventName: event.title,
        showDate,
        location: event.location,
        seatCodes,
        transactionId: transaction.transactionId,
        totalAmount: transaction.totalAmount,
        qrCodeDataUrl: qrDataUrl,
        template: emailTemplate
          ? {
              greeting: emailTemplate.greeting,
              rules: emailTemplate.rules,
              notes: emailTemplate.notes,
              footer: emailTemplate.footer,
            }
          : undefined,
      })

      // Track successful delivery
      await db.transaction.update({
        where: { transactionId },
        data: { emailStatus: 'SENT', emailError: null, lastEmailSentAt: new Date() },
      })

      return NextResponse.json({
        success: true,
        message: `E-tiket berhasil dikirim ulang ke ${transaction.customerEmail}`,
      })
    } catch (emailError: any) {
      const errMsg = emailError?.message || String(emailError)
      console.error('[RESEND-EMAIL] Failed to send email:', errMsg)

      // Track failed delivery
      const isBounce = errMsg.includes('OverQuota') || errMsg.includes('out of storage') || errMsg.includes('452') || errMsg.includes('550')
      await db.transaction.update({
        where: { transactionId },
        data: {
          emailStatus: isBounce ? 'BOUNCED' : 'FAILED',
          emailError: errMsg.substring(0, 500),
          lastEmailSentAt: new Date(),
        },
      }).catch(() => {})

      // Give user-friendly error message for common bounce reasons
      let userMessage = `Gagal mengirim email: ${errMsg}`
      if (isBounce) {
        userMessage = 'Inbox email penerima penuh (over quota). Minta penerima untuk mengosongkan inbox Gmail-nya, lalu coba kirim ulang.'
      } else if (errMsg.includes('ENOTFOUND') || errMsg.includes('Invalid recipient')) {
        userMessage = 'Alamat email tidak valid. Pastikan email penerima benar.'
      }

      return NextResponse.json(
        { error: userMessage },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[RESEND-EMAIL] Error:', error)
    return NextResponse.json(
      { error: 'Gagal mengirim ulang e-tiket' },
      { status: 500 }
    )
  }
}
