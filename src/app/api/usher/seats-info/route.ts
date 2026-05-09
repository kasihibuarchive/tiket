import { NextRequest, NextResponse } from 'next/server'
import { db, withDbRetry } from '@/lib/db'

// GET /api/usher/seats-info?eventId=xxx
// Returns a map of seatCode -> transaction info for all occupied seats
// Also supports: GET /api/usher/seats-info?eventId=xxx&seatCode=A-1 (single seat lookup)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')
    const targetSeatCode = searchParams.get('seatCode') // optional: single seat lookup

    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId is required' },
        { status: 400 }
      )
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

    // ── STEP 1: Query all transactions for this event ──
    // We try with email columns first. If the migration hasn't been run yet,
    // the query will fail, and we retry without those columns.
    const whereClause: any = {
      eventId,
    }

    if (!isTargetedLookup) {
      whereClause.paymentStatus = { in: ['PAID', 'PENDING', 'EXPIRED', 'FAILED', 'CANCELLED'] }
    }

    // Try with email columns, fall back without them if migration not yet applied
    let transactions: any[] = []
    let hasEmailColumns = true

    try {
      transactions = await withDbRetry(() => db.transaction.findMany({
        where: whereClause,
        select: {
          transactionId: true,
          customerName: true,
          customerEmail: true,
          customerWa: true,
          seatCodes: true,
          paymentStatus: true,
          checkInTime: true,
          paidAt: true,
          totalAmount: true,
          emailStatus: true,
          emailError: true,
          lastEmailSentAt: true,
          id: true,
        },
      }))
    } catch (selectErr: any) {
      if (selectErr?.message?.includes('emailStatus') || selectErr?.message?.includes('emailError') || selectErr?.message?.includes('lastEmailSentAt')) {
        console.log('[seats-info] Email columns not found in DB — falling back to query without them')
        hasEmailColumns = false
        transactions = await withDbRetry(() => db.transaction.findMany({
          where: whereClause,
          select: {
            transactionId: true,
            customerName: true,
            customerEmail: true,
            customerWa: true,
            seatCodes: true,
            paymentStatus: true,
            checkInTime: true,
            paidAt: true,
            totalAmount: true,
            id: true,
          },
        }))
      } else {
        throw selectErr
      }
    }

    console.log(`[seats-info] Found ${transactions.length} transactions for event ${eventId} (targeted: ${isTargetedLookup}, emailCols: ${hasEmailColumns})`)

    // Build seatCode -> transaction info map
    const statusPriority: Record<string, number> = {
      PAID: 0,
      PENDING: 1,
      EXPIRED: 2,
      FAILED: 3,
      CANCELLED: 4,
    }

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

    for (const txn of transactions) {
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
        const existing = seatInfoMap[code]
        const existingPriority = existing ? (statusPriority[existing.paymentStatus] ?? 99) : 99
        const currentPriority = statusPriority[txn.paymentStatus] ?? 99

        if (!existing || currentPriority < existingPriority) {
          seatInfoMap[code] = {
            owner: txn.customerName,
            email: txn.customerEmail,
            phone: txn.customerWa,
            transactionId: txn.transactionId,
            paymentStatus: txn.paymentStatus,
            checkInTime: txn.checkInTime?.toISOString() || null,
            paidAt: txn.paidAt?.toISOString() || null,
            totalAmount: txn.totalAmount,
            emailStatus: hasEmailColumns ? (txn.emailStatus || null) : null,
            emailError: hasEmailColumns ? (txn.emailError || null) : null,
            lastEmailSentAt: hasEmailColumns ? (txn.lastEmailSentAt?.toISOString() || null) : null,
          }
        }
      }
    }

    // ── STEP 2: Targeted lookup fallback via raw SQL ──
    let targetResult = targetSeatCode ? (seatInfoMap[targetSeatCode] || null) : null

    if (targetSeatCode && !targetResult) {
      console.log(`[seats-info] Targeted lookup for "${targetSeatCode}": not found in parsed map`)
      console.log(`[seats-info] Parsed seat codes (${debugSeatCodes.length}): [${debugSeatCodes.slice(0, 30).join(', ')}]`)

      try {
        // Use raw SQL — only select columns that definitely exist
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

        console.log(`[seats-info] Raw SQL fallback found ${fallbackResults.length} transactions containing "${targetSeatCode}"`)

        for (const txn of fallbackResults) {
          console.log(`[seats-info] Raw fallback txn ${txn.transactionId} (status: ${txn.paymentStatus}) seatCodes: ${String(txn.seatCodes).substring(0, 100)}`)

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
              checkInTime: txn.checkInTime?.toISOString() || null,
              paidAt: txn.paidAt?.toISOString() || null,
              totalAmount: Number(txn.totalAmount),
              emailStatus: null,
              emailError: null,
              lastEmailSentAt: null,
            }
            seatInfoMap[targetSeatCode] = targetResult
            console.log(`[seats-info] Raw fallback exact match for "${targetSeatCode}"`)
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
              checkInTime: txn.checkInTime?.toISOString() || null,
              paidAt: txn.paidAt?.toISOString() || null,
              totalAmount: Number(txn.totalAmount),
              emailStatus: null,
              emailError: null,
              lastEmailSentAt: null,
            }
            seatInfoMap[targetSeatCode] = targetResult
            seatInfoMap[matchCode] = targetResult
            console.log(`[seats-info] Raw fallback case-insensitive match: "${targetSeatCode}" ↔ "${matchCode}"`)
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
            checkInTime: txn.checkInTime?.toISOString() || null,
            paidAt: txn.paidAt?.toISOString() || null,
            totalAmount: Number(txn.totalAmount),
            emailStatus: null,
            emailError: null,
            lastEmailSentAt: null,
          }
          seatInfoMap[targetSeatCode] = targetResult
          console.log(`[seats-info] Raw fallback substring match for "${targetSeatCode}"`)
        }
      } catch (fallbackErr) {
        console.error('[seats-info] Raw fallback error:', fallbackErr)
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
        totalTransactions: transactions.length,
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
