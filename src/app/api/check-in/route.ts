import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity-log'

/**
 * Check-in API — supports BOTH regular and festival mode tickets.
 *
 * REGULAR tickets (no '@' in seatCodes):
 *   - Single scan per transaction (legacy behavior)
 *   - Subsequent scans return WARNING with previous scan time
 *
 * FESTIVAL tickets (seatCodes contain '@dayId'):
 *   - Same QR can be scanned once per show date (multi-day re-entry)
 *   - Cooldown enforced between scans on the SAME day (anti-share, default 30 min)
 *   - Wrong-day scans are rejected (BLOCKED_WRONG_DAY) — but day is inferred from
 *     the current time vs. the event's show dates, since the QR itself only carries
 *     the transactionId
 *   - Usher can override: FORCE_VALID (let them in), FORCE_INVALID (reject),
 *     RESET_COOLDOWN (clear lastScanAt so they can re-enter immediately)
 *   - Every scan attempt is logged to TicketScan table
 */

// Cooldown enforced even on regular tickets? No — regular = single scan only.
const FESTIVAL_DEFAULT_COOLDOWN_MINUTES = 30

interface CheckInBody {
  transactionId: string
  // Optional: usher explicitly chose a day (used by admin override UI on events
  // where the auto-detected day is ambiguous). Falls back to "today" detection.
  showDateId?: string
  // Optional: usher override action — set by the scanner's "Override" buttons
  overrideAction?: 'FORCE_VALID' | 'FORCE_INVALID' | 'RESET_COOLDOWN'
  overrideNote?: string
  // Optional: usher admin ID (from admin_session cookie — set by middleware)
  usherId?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: CheckInBody = await request.json()
    const { transactionId, overrideAction, overrideNote } = body
    const explicitShowDateId = body.showDateId || null

    if (!transactionId) {
      return NextResponse.json(
        { status: 'ERROR', message: 'transactionId is required' },
        { status: 400 }
      )
    }

    // Identify the usher from admin_session cookie
    const usherId = await resolveUsherId(request)

    // Fetch transaction + event + show dates (we need ALL show dates for festival
    // to figure out which day "today" maps to)
    const transaction = await db.transaction.findUnique({
      where: { transactionId },
      include: {
        promoCode: {
          select: {
            code: true, discountType: true, discountValue: true, target: true,
            bundleSize: true, bundleDiscount: true,
          },
        },
        event: {
          select: {
            id: true, title: true, eventMode: true,
            scanCooldownMinutes: true, cooldownEnabled: true,
            showDates: { orderBy: { date: 'asc' } },
          },
        },
      },
    })

    if (!transaction) {
      return NextResponse.json({
        status: 'ERROR',
        message: 'Transaksi tidak ditemukan',
      })
    }

    if (transaction.paymentStatus !== 'PAID') {
      const statusMessages: Record<string, string> = {
        PENDING: 'Tiket belum dibayar',
        EXPIRED: 'Tiket sudah kadaluarsa',
        FAILED: 'Pembayaran gagal',
        CANCELLED: 'Transaksi telah dibatalkan',
      }
      return NextResponse.json({
        status: 'ERROR',
        message: statusMessages[transaction.paymentStatus] || 'Tiket belum dibayar',
      })
    }

    // Parse seatCodes — detect festival format
    let seatCodes: string[] = []
    try { seatCodes = JSON.parse(transaction.seatCodes) } catch { /* ignore */ }
    const isFestivalFormat = seatCodes.some((c) => c.includes('@'))

    // ============================================================
    // REGULAR MODE — single scan, legacy behavior
    // ============================================================
    if (!isFestivalFormat) {
      // Handle manual override for regular tickets (rare but possible)
      if (overrideAction === 'FORCE_INVALID') {
        await logTicketScan({
          transactionId: transaction.id,
          showDateId: null,
          usherId,
          isValid: false,
          scanType: 'FORCE_INVALID',
          reason: overrideNote || 'Usher force-invalidated ticket',
        })
        await logActivity(request, 'CHECK_IN', `Force-invalid regular ticket ${transactionId}`)
        return NextResponse.json({
          status: 'ERROR',
          message: 'Tiket ditolak manual oleh usher',
          transaction: serializeTransaction(transaction),
        })
      }

      if (overrideAction === 'FORCE_VALID' && transaction.checkInTime) {
        // Already scanned — usher overrides and lets them in anyway
        await logTicketScan({
          transactionId: transaction.id,
          showDateId: null,
          usherId,
          isValid: true,
          scanType: 'FORCE_VALID',
          reason: overrideNote || 'Usher force-validated already-scanned ticket',
        })
        await logActivity(request, 'CHECK_IN', `Force-valid re-entry ${transactionId}`)
        return NextResponse.json({
          status: 'SUCCESS',
          message: 'Tiket valid (override usher)',
          transaction: serializeTransaction(transaction),
        })
      }

      if (transaction.checkInTime) {
        // Already scanned — WARNING
        const scanTime = transaction.checkInTime
        return NextResponse.json({
          status: 'WARNING',
          message: `Sudah di-scan pada ${scanTime.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'short' })}`,
          transaction: serializeTransaction(transaction),
        })
      }

      // First scan — mark as checked in
      const checkedIn = await db.transaction.update({
        where: { transactionId },
        data: {
          checkInTime: new Date(),
          lastScanAt: new Date(),
        },
      })
      await logTicketScan({
        transactionId: transaction.id,
        showDateId: null,
        usherId,
        isValid: true,
        scanType: 'ENTRY',
        reason: 'Regular ticket — first scan',
      })
      await logActivity(request, 'CHECK_IN', `Check-in regular tiket ${transactionId} — ${checkedIn.customerName}`)

      return NextResponse.json({
        status: 'SUCCESS',
        transaction: serializeTransaction(checkedIn),
      })
    }

    // ============================================================
    // FESTIVAL MODE — multi-day, cooldown, override
    // ============================================================
    const event = transaction.event
    const applicableDayIds = [...new Set(seatCodes.map((c) => c.split('@')[1]))]
    const applicableShowDates = event.showDates.filter((d) => applicableDayIds.includes(d.id))

    // Resolve which day the usher is trying to scan
    // Priority: explicit > "today" detection (show date whose calendar day matches Jakarta today)
    let targetShowDateId: string | null = explicitShowDateId
    let targetShowDate = explicitShowDateId
      ? event.showDates.find((d) => d.id === explicitShowDateId) || null
      : null

    if (!targetShowDateId) {
      // Auto-detect: find the show date whose date is closest to "now" in Jakarta tz
      // Within ±12 hours of show start counts as that day's show.
      const now = new Date()
      const nowMs = now.getTime()
      let best: { id: string; diff: number; date: any } | null = null
      for (const d of applicableShowDates) {
        const diff = Math.abs(new Date(d.date).getTime() - nowMs)
        if (!best || diff < best.diff) {
          best = { id: d.id, diff, date: d }
        }
      }
      if (best && best.diff <= 12 * 60 * 60 * 1000) {
        targetShowDateId = best.id
        targetShowDate = best.date
      } else if (best) {
        // Outside ±12h window — pick the closest anyway but flag it
        targetShowDateId = best.id
        targetShowDate = best.date
      }
    }

    // Check if the target day is even in the buyer's package
    if (targetShowDateId && !applicableDayIds.includes(targetShowDateId)) {
      await logTicketScan({
        transactionId: transaction.id,
        showDateId: targetShowDateId,
        usherId,
        isValid: false,
        scanType: 'BLOCKED_WRONG_DAY',
        reason: `Paket tidak berlaku untuk hari ini (${targetShowDate ? formatDayLabel(targetShowDate.date) : targetShowDateId})`,
      })
      return NextResponse.json({
        status: 'ERROR',
        message: `Paket ini tidak berlaku untuk hari ini. Paket hanya berlaku untuk: ${applicableShowDates.map((d) => formatDayLabel(d.date)).join(', ')}`,
        transaction: serializeTransaction(transaction, {
          applicableShowDates,
          scannedShowDateIds: await getScannedShowDateIds(transaction.id),
          targetShowDateId,
        }),
      })
    }

    // ── OVERRIDE: RESET_COOLDOWN ──
    if (overrideAction === 'RESET_COOLDOWN') {
      await db.transaction.update({
        where: { transactionId },
        data: {
          lastScanAt: null,
          lastScanShowDateId: null,
        },
      })
      await logTicketScan({
        transactionId: transaction.id,
        showDateId: targetShowDateId,
        usherId,
        isValid: true,
        scanType: 'RESET_COOLDOWN',
        reason: overrideNote || 'Usher reset cooldown',
      })
      await logActivity(request, 'CHECK_IN', `Reset cooldown ${transactionId} (day ${targetShowDate ? formatDayLabel(targetShowDate.date) : '?'})`)
      return NextResponse.json({
        status: 'SUCCESS',
        message: 'Cooldown direset. Tiket bisa di-scan ulang sekarang.',
        transaction: serializeTransaction(transaction, {
          applicableShowDates,
          scannedShowDateIds: await getScannedShowDateIds(transaction.id),
          targetShowDateId,
        }),
      })
    }

    // ── OVERRIDE: FORCE_INVALID ──
    if (overrideAction === 'FORCE_INVALID') {
      await logTicketScan({
        transactionId: transaction.id,
        showDateId: targetShowDateId,
        usherId,
        isValid: false,
        scanType: 'FORCE_INVALID',
        reason: overrideNote || 'Usher menolak tiket',
      })
      await logActivity(request, 'CHECK_IN', `Force-invalid festival ticket ${transactionId}`)
      return NextResponse.json({
        status: 'ERROR',
        message: 'Tiket ditolak manual oleh usher',
        transaction: serializeTransaction(transaction, {
          applicableShowDates,
          scannedShowDateIds: await getScannedShowDateIds(transaction.id),
          targetShowDateId,
        }),
      })
    }

    // Get prior scans for this transaction on this show date (for cooldown + history)
    const priorScansToday = await db.ticketScan.findMany({
      where: {
        transactionId: transaction.id,
        showDateId: targetShowDateId,
        isValid: true,
        scanType: { in: ['ENTRY', 'RE_ENTRY', 'FORCE_VALID'] },
      },
      orderBy: { scanTime: 'desc' },
      take: 1,
    })

    const lastScan = priorScansToday[0] || null
    const hasBeenScannedToday = !!lastScan

    // ── OVERRIDE: FORCE_VALID (always succeeds, even if cooldown active) ──
    if (overrideAction === 'FORCE_VALID') {
      const scanType = hasBeenScannedToday ? 'FORCE_VALID' : 'ENTRY'
      await db.transaction.update({
        where: { transactionId },
        data: {
          lastScanAt: new Date(),
          lastScanShowDateId: targetShowDateId,
          checkInTime: transaction.checkInTime || new Date(), // keep first-ever scan
        },
      })
      await logTicketScan({
        transactionId: transaction.id,
        showDateId: targetShowDateId,
        usherId,
        isValid: true,
        scanType,
        reason: overrideNote || 'Usher force-validated entry',
      })
      await logActivity(request, 'CHECK_IN', `Force-valid festival entry ${transactionId} (day ${targetShowDate ? formatDayLabel(targetShowDate.date) : '?'})`)
      return NextResponse.json({
        status: 'SUCCESS',
        message: hasBeenScannedToday
          ? 'Re-entry diizinkan (override usher)'
          : 'Tiket valid',
        transaction: serializeTransaction(transaction, {
          applicableShowDates,
          scannedShowDateIds: await getScannedShowDateIds(transaction.id),
          targetShowDateId,
        }),
      })
    }

    // ── NORMAL FLOW: cooldown enforcement ──
    if (hasBeenScannedToday && event.cooldownEnabled) {
      const cooldownMs = (event.scanCooldownMinutes || FESTIVAL_DEFAULT_COOLDOWN_MINUTES) * 60 * 1000
      const elapsedMs = Date.now() - lastScan.scanTime.getTime()
      if (elapsedMs < cooldownMs) {
        const remainingMs = cooldownMs - elapsedMs
        const remainingMin = Math.ceil(remainingMs / 60000)
        await logTicketScan({
          transactionId: transaction.id,
          showDateId: targetShowDateId,
          usherId,
          isValid: false,
          scanType: 'BLOCKED_COOLDOWN',
          reason: `Cooldown aktif — sisa ${remainingMin} menit`,
        })
        return NextResponse.json({
          status: 'WARNING',
          message: `Cooldown aktif. Coba lagi dalam ${remainingMin} menit.`,
          transaction: serializeTransaction(transaction, {
            applicableShowDates,
            scannedShowDateIds: await getScannedShowDateIds(transaction.id),
            targetShowDateId,
            cooldownRemainingMs: remainingMs,
          }),
        })
      }
    }

    // ── NORMAL FLOW: valid entry (or re-entry) ──
    const scanType = hasBeenScannedToday ? 'RE_ENTRY' : 'ENTRY'
    await db.transaction.update({
      where: { transactionId },
      data: {
        lastScanAt: new Date(),
        lastScanShowDateId: targetShowDateId,
        checkInTime: transaction.checkInTime || new Date(),
      },
    })
    await logTicketScan({
      transactionId: transaction.id,
      showDateId: targetShowDateId,
      usherId,
      isValid: true,
      scanType,
      reason: scanType === 'RE_ENTRY'
        ? `Re-entry for day ${targetShowDate ? formatDayLabel(targetShowDate.date) : '?'}`
        : `First entry for day ${targetShowDate ? formatDayLabel(targetShowDate.date) : '?'}`,
    })
    await logActivity(
      request,
      'CHECK_IN',
      `${scanType === 'RE_ENTRY' ? 'Re-entry' : 'Check-in'} festival tiket ${transactionId} — ${transaction.customerName} (day ${targetShowDate ? formatDayLabel(targetShowDate.date) : '?'})`
    )

    return NextResponse.json({
      status: 'SUCCESS',
      message: scanType === 'RE_ENTRY' ? 'Re-entry berhasil' : 'Tiket valid',
      transaction: serializeTransaction(transaction, {
        applicableShowDates,
        scannedShowDateIds: await getScannedShowDateIds(transaction.id),
        targetShowDateId,
      }),
    })
  } catch (error) {
    console.error('Error checking in ticket:', error)
    return NextResponse.json(
      { status: 'ERROR', message: 'Gagal melakukan check-in' },
      { status: 500 }
    )
  }
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function formatDayLabel(dateInput: Date | string): string {
  const d = new Date(dateInput)
  return d.toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short',
    timeZone: 'Asia/Jakarta',
  })
}

async function resolveUsherId(request: NextRequest): Promise<string> {
  // Decode admin_session cookie → validate token → look up Admin by username
  try {
    const cookie = request.cookies.get('admin_session')?.value
    if (!cookie) return 'unknown'
    const { validateSessionToken } = await import('@/lib/auth')
    const result = await validateSessionToken(cookie)
    if (!result?.valid || !result.username) return 'unknown'
    const admin = await db.admin.findUnique({
      where: { username: result.username },
      select: { id: true },
    })
    return admin?.id || 'unknown'
  } catch {
    return 'unknown'
  }
}

async function getScannedShowDateIds(transactionInternalId: string): Promise<string[]> {
  const scans = await db.ticketScan.findMany({
    where: {
      transactionId: transactionInternalId,
      isValid: true,
      scanType: { in: ['ENTRY', 'RE_ENTRY', 'FORCE_VALID'] },
    },
    select: { showDateId: true },
    distinct: ['showDateId'],
  })
  return scans.map((s) => s.showDateId).filter(Boolean) as string[]
}

async function logTicketScan(args: {
  transactionId: string
  showDateId: string | null
  usherId: string
  isValid: boolean
  scanType: string
  reason: string
}) {
  // Fetch usher name for denormalized display
  let usherName: string | null = null
  if (args.usherId && args.usherId !== 'unknown') {
    const admin = await db.admin.findUnique({ where: { id: args.usherId }, select: { name: true, username: true } })
    usherName = admin?.name || admin?.username || null
  }
  return db.ticketScan.create({
    data: {
      transactionId: args.transactionId,
      showDateId: args.showDateId,
      usherId: args.usherId,
      usherName,
      isValid: args.isValid,
      scanType: args.scanType,
      reason: args.reason,
    },
  })
}

function serializeTransaction(
  txn: any,
  festival?: {
    applicableShowDates?: any[]
    scannedShowDateIds?: string[]
    targetShowDateId?: string | null
    cooldownRemainingMs?: number
  }
) {
  const base: any = {
    transactionId: txn.transactionId,
    customerName: txn.customerName,
    customerEmail: txn.customerEmail,
    customerWa: txn.customerWa,
    seatCodes: txn.seatCodes,
    totalAmount: txn.totalAmount,
    adminFeeApplied: txn.adminFeeApplied,
    paymentStatus: txn.paymentStatus,
    checkInTime: txn.checkInTime,
    paidAt: txn.paidAt,
    merchandiseData: txn.merchandiseData,
    lastScanAt: txn.lastScanAt,
    lastScanShowDateId: txn.lastScanShowDateId,
    manualValidityOverride: txn.manualValidityOverride,
    overrideNote: txn.overrideNote,
    eventTitle: txn.event?.title || null,
    eventMode: txn.event?.eventMode || 'REGULAR',
    promoCode: txn.promoCode?.code || null,
    promoDetails: txn.promoCode ? {
      discountType: txn.promoCode.discountType,
      discountValue: txn.promoCode.discountValue,
      target: txn.promoCode.target,
      bundleSize: txn.promoCode.bundleSize,
      bundleDiscount: txn.promoCode.bundleDiscount,
    } : null,
  }
  if (festival) {
    base.festival = {
      applicableShowDates: (festival.applicableShowDates || []).map((d) => ({
        id: d.id,
        date: d.date,
        label: d.label,
        isScanned: festival.scannedShowDateIds?.includes(d.id) || false,
      })),
      scannedShowDateIds: festival.scannedShowDateIds || [],
      targetShowDateId: festival.targetShowDateId || null,
      cooldownRemainingMs: festival.cooldownRemainingMs ?? null,
      cooldownEnabled: txn.event?.cooldownEnabled ?? true,
      cooldownMinutes: txn.event?.scanCooldownMinutes ?? 30,
    }
  }
  return base
}
