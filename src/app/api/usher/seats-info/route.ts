import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'

// GET /api/usher/seats-info?eventId=xxx
// Returns a map of seatCode -> transaction info for all occupied seats
// Also supports: GET /api/usher/seats-info?eventId=xxx&seatCode=A-1 (single seat lookup)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')
    const targetSeatCode = searchParams.get('seatCode')

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }

    // Verify event exists
    const event = await withDbRetry(() => db.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true },
    }))

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const isTargetedLookup = !!targetSeatCode

    // ── Use raw SQL for maximum reliability ──
    // This avoids all Prisma select/column mismatch issues
    // and handles cases where migration hasn't been run yet

    // Check if email columns exist
    let hasEmailColumns = false
    try {
      await db.$queryRaw`SELECT "emailStatus" FROM "Transaction" LIMIT 1`
      hasEmailColumns = true
    } catch {
      hasEmailColumns = false
    }

    console.log(`[seats-info] email columns available: ${hasEmailColumns}`)

    // Build status filter for raw SQL
    let statusFilter = ''
    if (!isTargetedLookup) {
      statusFilter = `AND "paymentStatus" IN ('PAID', 'PENDING', 'EXPIRED', 'FAILED', 'CANCELLED')`
    }

    const emailColumnsSelect = hasEmailColumns
      ? ', "emailStatus", "emailError", "lastEmailSentAt"'
      : ''

    const rawResults: any[] = await db.$queryRawUnsafe(`
      SELECT
        "transactionId", "customerName", "customerEmail", "customerWa",
        "seatCodes", "paymentStatus", "checkInTime", "paidAt",
        "totalAmount"${emailColumnsSelect}
      FROM "Transaction"
      WHERE "eventId" = $1
        AND "seatCodes" IS NOT NULL
        ${statusFilter}
      ORDER BY
        CASE "paymentStatus"
          WHEN 'PAID' THEN 0
          WHEN 'PENDING' THEN 1
          WHEN 'EXPIRED' THEN 2
          WHEN 'FAILED' THEN 3
          WHEN 'CANCELLED' THEN 4
          ELSE 99
        END ASC
    `, eventId)

    console.log(`[seats-info] Found ${rawResults.length} transactions for event ${eventId} (targeted: ${isTargetedLookup})`)

    // Build seatCode -> transaction info map
    const seatInfoMap: Record<string, {
      owner: string
      email: string
      phone: string
      transactionId: string
      paymentStatus: string
      checkInTime: string | null
      paidAt: string | null
      totalAmount: number
      emailStatus: string | null
      emailError: string | null
      lastEmailSentAt: string | null
    }> = {}

    const debugSeatCodes: string[] = []

    for (const txn of rawResults) {
      if (!txn.seatCodes) continue

      let seatCodes: string[] = []
      try {
        const parsed = JSON.parse(txn.seatCodes)
        if (Array.isArray(parsed)) {
          seatCodes = parsed.map((s: any) => String(s).trim()).filter(Boolean)
        } else if (typeof parsed === 'string') {
          seatCodes = parsed.split(',').map((s: string) => s.trim()).filter(Boolean)
        } else {
          seatCodes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
        }
      } catch {
        seatCodes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
      }

      for (const code of seatCodes) {
        debugSeatCodes.push(code)
        // First transaction wins (sorted by status priority above)
        if (!seatInfoMap[code]) {
          seatInfoMap[code] = {
            owner: txn.customerName,
            email: txn.customerEmail,
            phone: txn.customerWa,
            transactionId: txn.transactionId,
            paymentStatus: txn.paymentStatus,
            checkInTime: txn.checkInTime?.toISOString?.() || null,
            paidAt: txn.paidAt?.toISOString?.() || null,
            totalAmount: Number(txn.totalAmount),
            emailStatus: hasEmailColumns ? (txn.emailStatus || null) : null,
            emailError: hasEmailColumns ? (txn.emailError || null) : null,
            lastEmailSentAt: hasEmailColumns ? (txn.lastEmailSentAt?.toISOString?.() || null) : null,
          }
        }
      }
    }

    // ── Targeted lookup ──
    let targetResult = targetSeatCode ? (seatInfoMap[targetSeatCode] || null) : null

    if (targetSeatCode && !targetResult) {
      console.log(`[seats-info] Targeted lookup for "${targetSeatCode}": not found in parsed map`)
      console.log(`[seats-info] Parsed seat codes (${debugSeatCodes.length}): [${debugSeatCodes.slice(0, 30).join(', ')}]`)

      // Fallback: LIKE search directly in DB
      try {
        const fallbackResults: any[] = await db.$queryRaw`
          SELECT
            "transactionId", "customerName", "customerEmail", "customerWa",
            "seatCodes", "paymentStatus", "checkInTime", "paidAt",
            "totalAmount"
          FROM "Transaction"
          WHERE "eventId" = ${eventId}
            AND "seatCodes" IS NOT NULL
            AND "seatCodes" LIKE ${'%' + targetSeatCode + '%'}
          LIMIT 5
        `

        console.log(`[seats-info] LIKE fallback found ${fallbackResults.length} transactions containing "${targetSeatCode}"`)

        for (const txn of fallbackResults) {
          console.log(`[seats-info] LIKE fallback txn ${txn.transactionId} (status: ${txn.paymentStatus}) seatCodes: ${String(txn.seatCodes).substring(0, 100)}`)

          let codes: string[] = []
          try {
            const parsed = JSON.parse(txn.seatCodes || '[]')
            if (Array.isArray(parsed)) {
              codes = parsed.map((s: any) => String(s).trim()).filter(Boolean)
            } else {
              codes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
            }
          } catch {
            codes = String(txn.seatCodes).split(',').map((s: string) => s.trim()).filter(Boolean)
          }

          // Exact match
          if (codes.includes(targetSeatCode)) {
            targetResult = {
              owner: txn.customerName,
              email: txn.customerEmail,
              phone: txn.customerWa,
              transactionId: txn.transactionId,
              paymentStatus: txn.paymentStatus,
              checkInTime: txn.checkInTime?.toISOString?.() || null,
              paidAt: txn.paidAt?.toISOString?.() || null,
              totalAmount: Number(txn.totalAmount),
              emailStatus: null,
              emailError: null,
              lastEmailSentAt: null,
            }
            seatInfoMap[targetSeatCode] = targetResult
            console.log(`[seats-info] LIKE fallback exact match for "${targetSeatCode}"`)
            break
          }

          // Case-insensitive match
          const lowerTarget = targetSeatCode.toLowerCase()
          const matchCode = codes.find(c => c.toLowerCase() === lowerTarget)
          if (matchCode) {
            targetResult = {
              owner: txn.customerName,
              email: txn.customerEmail,
              phone: txn.customerWa,
              transactionId: txn.transactionId,
              paymentStatus: txn.paymentStatus,
              checkInTime: txn.checkInTime?.toISOString?.() || null,
              paidAt: txn.paidAt?.toISOString?.() || null,
              totalAmount: Number(txn.totalAmount),
              emailStatus: null,
              emailError: null,
              lastEmailSentAt: null,
            }
            seatInfoMap[targetSeatCode] = targetResult
            seatInfoMap[matchCode] = targetResult
            console.log(`[seats-info] LIKE fallback case-insensitive match: "${targetSeatCode}" ↔ "${matchCode}"`)
            break
          }
        }

        // Last resort
        if (!targetResult && fallbackResults.length > 0) {
          const txn = fallbackResults[0]
          targetResult = {
            owner: txn.customerName,
            email: txn.customerEmail,
            phone: txn.customerWa,
            transactionId: txn.transactionId,
            paymentStatus: txn.paymentStatus,
            checkInTime: txn.checkInTime?.toISOString?.() || null,
            paidAt: txn.paidAt?.toISOString?.() || null,
            totalAmount: Number(txn.totalAmount),
            emailStatus: null,
            emailError: null,
            lastEmailSentAt: null,
          }
          seatInfoMap[targetSeatCode] = targetResult
          console.log(`[seats-info] LIKE fallback substring match for "${targetSeatCode}"`)
        }
      } catch (fallbackErr) {
        console.error('[seats-info] LIKE fallback error:', fallbackErr)
      }
    } else if (targetSeatCode) {
      console.log(`[seats-info] Targeted lookup for "${targetSeatCode}": found (status: ${targetResult?.paymentStatus})`)
    }

    // Build response
    const response: any = {
      event: { id: event.id, title: event.title },
      seats: seatInfoMap,
      totalSold: Object.keys(seatInfoMap).length,
    }

    if (targetSeatCode) {
      response.targetSeat = targetResult
      response._debug = {
        lookupSeatCode: targetSeatCode,
        totalTransactions: rawResults.length,
        totalSeatCodesParsed: debugSeatCodes.length,
        foundInMap: !!seatInfoMap[targetSeatCode],
        seatCodesSample: debugSeatCodes.slice(0, 20),
        hasEmailColumns,
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[seats-info] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch seats info', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
