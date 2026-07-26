import { db } from '@/lib/db'

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
