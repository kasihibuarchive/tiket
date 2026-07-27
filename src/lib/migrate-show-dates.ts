import { db } from '@/lib/db'

/**
 * Auto-migration: ensure every event has at least one EventShowDate record.
 *
 * WHY: Events created before the multi-day feature (or during the transition)
 * only have `event.showDate` (legacy singular field) but NO `EventShowDate`
 * records. This breaks:
 *   - Admin edit page (shows "Belum ada jadwal pertunjukan")
 *   - Festival mode buyer page (parsedDayIds empty → availability = 0 → can't buy)
 *
 * WHAT THIS DOES:
 *   1. Checks if the event already has EventShowDate records.
 *   2. If not, creates one from `event.showDate` + `event.openGate`.
 *   3. Updates all seats with `eventShowDateId = null` to point to the new record.
 *
 * This is idempotent — once migrated, subsequent calls are a no-op (single
 * findFirst check, no writes).
 *
 * @returns The array of EventShowDate records for the event (after migration).
 */
export async function ensureShowDatesForEvent(eventId: string): Promise<void> {
  const existing = await db.eventShowDate.findFirst({
    where: { eventId },
    select: { id: true },
  })
  if (existing) return // already migrated — nothing to do

  // Fetch legacy fields
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { showDate: true, openGate: true },
  })
  if (!event) return // event doesn't exist

  // Create the first EventShowDate record from legacy fields
  const newShowDate = await db.eventShowDate.create({
    data: {
      eventId,
      date: event.showDate,
      openGate: event.openGate,
      label: null,
    },
  })

  // Update all seats that have no eventShowDateId to point to the new record
  // This ensures seat queries filtered by showDateId will still find them.
  await db.seat.updateMany({
    where: { eventId, eventShowDateId: null },
    data: { eventShowDateId: newShowDate.id },
  })
}
