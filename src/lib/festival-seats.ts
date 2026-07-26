import { db } from '@/lib/db'

// ───────────────────────────────────────────────────────────────────
// Email / PDF payload types
// ───────────────────────────────────────────────────────────────────

export interface FestivalDayInfo {
  date: string        // ISO date string
  openGate: string | null  // ISO open gate time, or null
  label: string | null
}

export interface EmailTicketPayload {
  customerName: string
  customerEmail: string
  eventName: string
  showDate: string         // Formatted for display (e.g., "Sabtu, 5 Juli 2025, 19:00")
  openGate: string | null  // Formatted for display (e.g., "18:00"), or null
  location: string
  seatCodes: string[]
  transactionId: string
  totalAmount: number
  qrCodeDataUrl: string
  // For festival passes: list of all applicable days (each with its own openGate)
  festivalDays?: FestivalDayInfo[]
  template?: {
    greeting: string
    rules: string
    notes: string
    footer: string
  }
}

// ───────────────────────────────────────────────────────────────────
// Helper: format a Date for email/PDF display
// ───────────────────────────────────────────────────────────────────

const JAKARTA_TZ = 'Asia/Jakarta'

function formatShowDateDisplay(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: JAKARTA_TZ,
  })
}

function formatOpenGateDisplay(iso: string | Date | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit',
    timeZone: JAKARTA_TZ,
  })
}

// ───────────────────────────────────────────────────────────────────
// Helper: Build the email/PDF payload from a transaction ID.
// Resolves showDate + openGate from EventShowDate (REGULAR) or all
// applicable days (FESTIVAL). Falls back to event-level fields.
// ───────────────────────────────────────────────────────────────────

export async function buildEmailTicketPayload(
  tx: {
    transactionId: string
    customerName: string
    customerEmail: string
    seatCodes: string
    totalAmount: number
    eventId: string
    showDateId?: string | null
  },
  event: { title: string; location: string; showDate: Date; openGate: Date | null },
  qrCodeDataUrl: string,
  emailTemplate?: { greeting: string; rules: string; notes: string; footer: string } | null
): Promise<EmailTicketPayload> {
  let seatCodes: string[] = []
  try { seatCodes = JSON.parse(tx.seatCodes) } catch { /* ignore */ }
  const isFestivalFormat = seatCodes.some((c) => c.includes('@'))

  let showDateDisplay: string
  let openGateDisplay: string | null = null
  let festivalDays: FestivalDayInfo[] | undefined

  if (isFestivalFormat) {
    // FESTIVAL — show all applicable days
    const applicableDayIds = [...new Set(seatCodes.map((c) => c.split('@')[1]))]
    const showDates = await db.eventShowDate.findMany({
      where: { id: { in: applicableDayIds } },
      orderBy: { date: 'asc' },
    })

    festivalDays = showDates.map((d) => ({
      date: d.date.toISOString(),
      openGate: d.openGate ? d.openGate.toISOString() : null,
      label: d.label,
    }))

    // Use the earliest show date as the "primary" showDate shown in the email header
    const earliest = showDates[0]?.date || event.showDate
    showDateDisplay = formatShowDateDisplay(earliest)
    // For festival passes, openGate is per-day — show null at top level (PDF/email
    // will render per-day open gates inside the festival section)
    openGateDisplay = null
  } else {
    // REGULAR — use the transaction's showDateId if available, else event-level
    let sd: { date: Date; openGate: Date | null } | null = null
    if (tx.showDateId) {
      sd = await db.eventShowDate.findUnique({
        where: { id: tx.showDateId },
        select: { date: true, openGate: true },
      })
    }
    if (!sd) {
      sd = { date: event.showDate, openGate: event.openGate }
    }
    showDateDisplay = formatShowDateDisplay(sd.date)
    openGateDisplay = formatOpenGateDisplay(sd.openGate)
  }

  return {
    customerName: tx.customerName,
    customerEmail: tx.customerEmail,
    eventName: event.title,
    showDate: showDateDisplay,
    openGate: openGateDisplay,
    location: event.location,
    seatCodes,
    transactionId: tx.transactionId,
    totalAmount: tx.totalAmount,
    qrCodeDataUrl,
    festivalDays,
    template: emailTemplate ? {
      greeting: emailTemplate.greeting,
      rules: emailTemplate.rules,
      notes: emailTemplate.notes,
      footer: emailTemplate.footer,
    } : undefined,
  }
}

/**
 * Festival Mode: seatCodes are stored as `seatCode@dayId` format.
 * This helper parses them and marks the actual seats (matched by seatCode + eventShowDateId) as SOLD/AVAILABLE.
 *
 * For REGULAR transactions (no '@' in seatCodes), this falls back to the
 * legacy behavior of matching by seatCode only.
 */
export type SeatStatus = 'SOLD' | 'AVAILABLE'

export async function markSeatsForTransaction(
  eventId: string,
  rawSeatCodesJson: string,
  newStatus: SeatStatus,
  extras: { lockedUntil?: Date | null; lockedBy?: string | null } = {}
): Promise<number> {
  let seatCodes: string[] = []
  try {
    seatCodes = JSON.parse(rawSeatCodesJson)
  } catch {
    return 0
  }
  if (!Array.isArray(seatCodes) || seatCodes.length === 0) return 0

  // Check if any seatCode has '@' (festival format: seatCode@dayId)
  const isFestivalFormat = seatCodes.some((code) => code.includes('@'))

  if (!isFestivalFormat) {
    // REGULAR mode: match by seatCode only (legacy behavior)
    const result = await db.seat.updateMany({
      where: { eventId, seatCode: { in: seatCodes } },
      data: { status: newStatus, ...extras },
    })
    return result.count
  }

  // Festival mode: split into (seatCode, dayId) pairs and update each
  // Group by seatCode for efficient querying
  const pairs = seatCodes.map((code) => {
    const [seatCode, dayId] = code.split('@')
    return { seatCode, dayId }
  })

  // Build OR clauses for each (seatCode, eventShowDateId) pair
  const orClauses = pairs.map((p) => ({
    AND: [
      { eventId },
      { seatCode: p.seatCode },
      { eventShowDateId: p.dayId },
    ],
  }))

  const result = await db.seat.updateMany({
    where: { OR: orClauses },
    data: { status: newStatus, ...extras },
  })
  return result.count
}

/**
 * Build QR text content for a transaction.
 *
 * REGULAR: "NAMA: John | KURSI: ["A-1","A-2"] | KODE TRX: TRX-ABC123"
 * FESTIVAL: "NAMA: John | FESTIVAL: Day 1 Pass (1 tiket) | HARI: [day1, day2] | KODE TRX: TRX-ABC123"
 */
export async function buildQrText(transaction: {
  transactionId: string
  customerName: string
  seatCodes: string
  eventId: string
}): Promise<string> {
  let seatCodes: string[] = []
  try {
    seatCodes = JSON.parse(transaction.seatCodes)
  } catch { /* ignore */ }

  const isFestivalFormat = seatCodes.some((code) => code.includes('@'))

  if (!isFestivalFormat) {
    // REGULAR mode
    return 'NAMA: ' + transaction.customerName +
      ' | KURSI: ' + transaction.seatCodes +
      ' | KODE TRX: ' + transaction.transactionId
  }

  // Festival mode — fetch price category info to display package name
  // Get the first seat to find the price category, then derive package info
  const firstPair = seatCodes[0].split('@')
  const firstSeat = await db.seat.findFirst({
    where: { eventId: transaction.eventId, seatCode: firstPair[0], eventShowDateId: firstPair[1] },
    select: { priceCategoryId: true },
  })

  let packageName = 'Festival Pass'
  let applicableDayIds: string[] = [...new Set(seatCodes.map((c) => c.split('@')[1]))]

  if (firstSeat?.priceCategoryId) {
    const pc = await db.priceCategory.findUnique({
      where: { id: firstSeat.priceCategoryId },
      select: { name: true, packageType: true, applicableDayIds: true },
    })
    if (pc) {
      packageName = pc.name
      // For FULL pass, applicableDayIds is null in DB — use the actual day IDs from seatCodes
      if (pc.packageType !== 'FULL' && pc.applicableDayIds) {
        try {
          applicableDayIds = JSON.parse(pc.applicableDayIds)
        } catch { /* use derived */ }
      }
    }
  }

  // Count unique tickets (one ticket = one seat per day; quantity = total seats / days)
  const ticketCount = Math.floor(seatCodes.length / applicableDayIds.length) || seatCodes.length

  return 'NAMA: ' + transaction.customerName +
    ' | FESTIVAL: ' + packageName + ' (' + ticketCount + ' tiket)' +
    ' | HARI: ' + applicableDayIds.length + ' hari' +
    ' | KODE TRX: ' + transaction.transactionId
}
