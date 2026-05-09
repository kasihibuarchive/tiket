import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'

// POST /api/admin/tickets/update-email-status
// Manually set emailStatus for a transaction (by seatCode or transactionId)
// Body: { seatCode?: string, transactionId?: string, emailStatus: string, emailError?: string }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { seatCode, transactionId, emailStatus, emailError } = body

    if (!emailStatus) {
      return NextResponse.json({ error: 'emailStatus is required' }, { status: 400 })
    }

    if (!seatCode && !transactionId) {
      return NextResponse.json({ error: 'seatCode or transactionId is required' }, { status: 400 })
    }

    let targetTxnId = transactionId

    // If seatCode provided, find the transaction
    if (seatCode && !targetTxnId) {
      const results: any[] = await db.$queryRaw`
        SELECT "transactionId", "customerName", "customerEmail", "seatCodes", "paymentStatus", "emailStatus"
        FROM "Transaction"
        WHERE "seatCodes" IS NOT NULL
          AND "seatCodes" LIKE ${'%' + seatCode + '%'}
        ORDER BY
          CASE "paymentStatus"
            WHEN 'PAID' THEN 0
            WHEN 'PENDING' THEN 1
            ELSE 99
          END ASC
        LIMIT 1
      `

      if (results.length === 0) {
        return NextResponse.json(
          { error: `Tidak ada transaksi dengan kursi ${seatCode}` },
          { status: 404 }
        )
      }

      const txn = results[0]
      targetTxnId = txn.transactionId

      // Verify the seatCode actually exists in the parsed seatCodes
      let codes: string[] = []
      try {
        const parsed = JSON.parse(txn.seatCodes || '[]')
        if (Array.isArray(parsed)) codes = parsed
        else codes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
      } catch {
        codes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
      }

      const exactMatch = codes.some(c => c === seatCode || c.toLowerCase() === seatCode.toLowerCase())
      if (!exactMatch) {
        return NextResponse.json(
          { error: `Kursi ${seatCode} tidak ditemukan di transaksi ${txn.transactionId}. Seat codes: ${codes.join(', ')}` },
          { status: 404 }
        )
      }
    }

    // Update the transaction
    await db.transaction.update({
      where: { transactionId: targetTxnId },
      data: {
        emailStatus,
        emailError: emailError || null,
        lastEmailSentAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Email status untuk transaksi ${targetTxnId} diupdate ke ${emailStatus}`,
      transactionId: targetTxnId,
      emailStatus,
    })
  } catch (error) {
    console.error('[update-email-status] Error:', error)
    return NextResponse.json(
      { error: 'Gagal mengupdate email status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

// GET /api/admin/tickets/update-email-status?seatCode=D6
// Look up a seat code and return its transaction + email info
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const seatCode = searchParams.get('seatCode')
    const eventId = searchParams.get('eventId')

    if (!seatCode) {
      return NextResponse.json({ error: 'seatCode is required' }, { status: 400 })
    }

    const likePattern = '%' + seatCode + '%'

    let results: any[]
    if (eventId) {
      results = await db.$queryRaw`
        SELECT
          "transactionId", "customerName", "customerEmail", "customerWa",
          "seatCodes", "paymentStatus", "emailStatus", "emailError", "lastEmailSentAt"
        FROM "Transaction"
        WHERE "seatCodes" IS NOT NULL
          AND "seatCodes" LIKE ${likePattern}
          AND "eventId" = ${eventId}
        ORDER BY
          CASE "paymentStatus"
            WHEN 'PAID' THEN 0
            WHEN 'PENDING' THEN 1
            ELSE 99
          END ASC
        LIMIT 5
      `
    } else {
      results = await db.$queryRaw`
        SELECT
          "transactionId", "customerName", "customerEmail", "customerWa",
          "seatCodes", "paymentStatus", "emailStatus", "emailError", "lastEmailSentAt"
        FROM "Transaction"
        WHERE "seatCodes" IS NOT NULL
          AND "seatCodes" LIKE ${likePattern}
        ORDER BY
          CASE "paymentStatus"
            WHEN 'PAID' THEN 0
            WHEN 'PENDING' THEN 1
            ELSE 99
          END ASC
        LIMIT 5
      `
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: `Tidak ada transaksi dengan kursi ${seatCode}` },
        { status: 404 }
      )
    }

    // Parse seatCodes for each result
    const parsed = results.map((txn: any) => {
      let codes: string[] = []
      try {
        const p = JSON.parse(txn.seatCodes || '[]')
        if (Array.isArray(p)) codes = p.map((s: any) => String(s).trim()).filter(Boolean)
        else codes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
      } catch {
        codes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
      }
      return {
        transactionId: txn.transactionId,
        customerName: txn.customerName,
        customerEmail: txn.customerEmail,
        customerWa: txn.customerWa,
        seatCodes: codes,
        paymentStatus: txn.paymentStatus,
        emailStatus: txn.emailStatus || null,
        emailError: txn.emailError || null,
        lastEmailSentAt: txn.lastEmailSentAt?.toISOString?.() || null,
      }
    })

    return NextResponse.json({
      seatCode,
      transactions: parsed,
    })
  } catch (error) {
    console.error('[update-email-status GET] Error:', error)
    return NextResponse.json(
      { error: 'Gagal mencari data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
