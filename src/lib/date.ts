/**
 * Date / time formatting helpers.
 *
 * NOTE: We intentionally do NOT apply any GMT+7 / Asia/Jakarta timezone
 * conversion. Datetimes stored in the DB are treated as wall-clock WIB
 * times and displayed as-is. We only append the "WIB" label on time
 * outputs so users know the timezone context.
 */

/**
 * Format a date string as a long-form date (no time, no WIB label).
 * Example: "Sabtu, 15 Januari 2025"
 */
export function formatEventDate(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Format a date string as a time with WIB label.
 * Example: "19.00 WIB"
 */
export function formatEventTime(dateStr: string | Date): string {
  const t = new Date(dateStr).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${t} WIB`
}

/**
 * Format a date string as a full date + time with WIB label.
 * Example: "Sabtu, 15 Januari 2025 19.00 WIB"
 */
export function formatEventDateTime(dateStr: string | Date): string {
  const d = new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const t = new Date(dateStr).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${d} ${t} WIB`
}

/**
 * Format a date string as a short date (no time, no WIB label).
 * Example: "15 Jan 2025"
 */
export function formatShortDate(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Convert an ISO date string (or Date) into a value suitable for
 * `<input type="datetime-local">` — formatted as "YYYY-MM-DDTHH:MM"
 * using LOCAL wall-clock components (no UTC shift).
 *
 * This replaces the old `new Date(...).toISOString().slice(0, 16)` pattern
 * which incorrectly shifted the displayed value by 7 hours on WIB servers.
 *
 * Returns empty string if the input is null/undefined/invalid.
 */
export function toDatetimeLocalValue(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}
