/**
 * Diagnose & Fix: Seats missing for newly-added show dates.
 *
 * PROBLEM:
 *   - Event dibuat dengan 1 show date (bug lama) → seats di-generate hanya untuk hari 1.
 *   - User tambah hari 2-4 lewat edit event page → hari 2-4 ada di DB tapi NO seats.
 *   - Akibatnya paket untuk hari 2-4 muncul "Habis" di halaman pembeli.
 *
 * SCRIPT INI:
 *   1. Cari event berdasarkan ID (atau scan semua event festival)
 *   2. Tampilkan jumlah kursi per show date
 *   3. Jika ada hari yang kurang kursi → duplikat dari hari yang sudah ada
 *      (preserve zoneName, priceCategoryId, seatCode, row, col)
 *   4. Jangan hapus kursi yang sudah ada (hanya nambah yang kurang)
 *
 * CARA PAKAI:
 *   npx tsx scripts/diagnose-and-fix-seats.ts <eventId>
 *   npx tsx scripts/diagnose-and-fix-seats.ts --all
 *
 * SAFE: tidak menghapus data apa pun. Hanya INSERT kursi baru untuk hari yang kosong.
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function diagnoseEvent(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      eventMode: true,
      seatType: true,
      isPublished: true,
    },
  })

  if (!event) {
    console.log(`❌ Event ${eventId} tidak ditemukan`)
    return
  }

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`🎬 EVENT: ${event.title}`)
  console.log(`   ID: ${event.id}`)
  console.log(`   Mode: ${event.eventMode} | Seat Type: ${event.seatType} | Published: ${event.isPublished}`)
  console.log(`${'═'.repeat(70)}`)

  const showDates = await db.eventShowDate.findMany({
    where: { eventId },
    orderBy: { date: 'asc' },
  })

  if (showDates.length === 0) {
    console.log(`\n⚠️  Event ini TIDAK punya show date sama sekali!`)
    console.log(`   Tambah hari dulu di edit event page, lalu jalankan script ini lagi.`)
    return
  }

  console.log(`\n📅 JADWAL PERTUNJUKAN (${showDates.length} hari):`)

  const seatCountsByDay: { date: Date; id: string; label: string | null; seatCount: number; available: number; sold: number }[] = []

  for (const sd of showDates) {
    const seats = await db.seat.findMany({
      where: { eventShowDateId: sd.id },
      select: { status: true },
    })
    const available = seats.filter(s => s.status === 'AVAILABLE').length
    const sold = seats.filter(s => s.status === 'SOLD').length
    seatCountsByDay.push({
      date: sd.date,
      id: sd.id,
      label: sd.label,
      seatCount: seats.length,
      available,
      sold,
    })

    const status = seats.length === 0 ? '❌ NO SEATS' : sold > 0 ? `⚠️  ${sold} SOLD` : '✅ OK'
    console.log(`   ${status}  Hari ${seatCountsByDay.length}: ${sd.date.toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} (${sd.label || 'no label'}) → ${seats.length} kursi (${available} avail, ${sold} sold)`)
  }

  // Check which days are missing seats
  const daysWithSeats = seatCountsByDay.filter(d => d.seatCount > 0)
  const daysWithoutSeats = seatCountsByDay.filter(d => d.seatCount === 0)

  if (daysWithoutSeats.length === 0) {
    console.log(`\n✅ SEMUA HARI SUDAH PUNYA KURSI. Tidak perlu fix.`)
    return
  }

  if (daysWithSeats.length === 0) {
    console.log(`\n❌ SEMUA HARI KOSONG. Belum ada kursi di-generate sama sekali.`)
    console.log(`   → Generate kursi dulu dari admin seat editor (pilih seat map / sync zona).`)
    return
  }

  console.log(`\n🔧 DITEMUKAN ${daysWithoutSeats.length} HARI TANPA KURSI:`)
  for (const d of daysWithoutSeats) {
    console.log(`   - ${d.date.toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })} (${d.label || 'no label'})`)
  }

  // Find source day — prefer a day with 0 sold seats (clean copy)
  // Otherwise use the first day with seats
  const cleanSource = daysWithSeats.find(d => d.sold === 0) || daysWithSeats[0]
  console.log(`\n📦 SOURCE: akan duplikat dari Hari ${seatCountsByDay.indexOf(cleanSource) + 1} (${cleanSource.date.toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })})`)
  console.log(`   Source punya ${cleanSource.seatCount} kursi, ${cleanSource.sold} sold`)

  return { eventId, sourceDayId: cleanSource.id, targetDays: daysWithoutSeats, sourceSeatCount: cleanSource.seatCount }
}

async function fixMissingSeats(
  eventId: string,
  sourceDayId: string,
  targetDays: { id: string; date: Date; label: string | null }[]
) {
  // Fetch source seats
  const sourceSeats = await db.seat.findMany({
    where: { eventShowDateId: sourceDayId },
    select: {
      seatCode: true,
      status: true,
      row: true,
      col: true,
      zoneName: true,
      priceCategoryId: true,
    },
  })

  console.log(`\n🚀 MEMULAI FIX: duplikat ${sourceSeats.length} kursi ke ${targetDays.length} hari...`)

  let totalCreated = 0

  for (const targetDay of targetDays) {
    // Skip duplicates — only create if no seats exist for this day
    const existing = await db.seat.count({ where: { eventShowDateId: targetDay.id } })
    if (existing > 0) {
      console.log(`   ⏭️  Hari ${targetDay.label || targetDay.id}: sudah ada ${existing} kursi, skip`)
      continue
    }

    // Create seats for this day — preserve zoneName, priceCategoryId, seatCode, row, col
    // Status: set all to AVAILABLE (don't copy SOLD status — new day = fresh inventory)
    const result = await db.seat.createMany({
      data: sourceSeats.map(s => ({
        eventId,
        eventShowDateId: targetDay.id,
        seatCode: s.seatCode,
        status: 'AVAILABLE' as const, // Always fresh
        row: s.row,
        col: s.col,
        zoneName: s.zoneName,
        priceCategoryId: s.priceCategoryId,
      })),
    })

    console.log(`   ✅ Hari ${targetDay.label || targetDay.id} (${targetDay.date.toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}): ${result.count} kursi dibuat`)
    totalCreated += result.count
  }

  console.log(`\n🎉 SELESAI! Total ${totalCreated} kursi baru dibuat untuk ${targetDays.length} hari.`)
}

async function main() {
  const arg = process.argv[2]

  if (!arg) {
    console.log(`
Usage:
  npx tsx scripts/diagnose-and-fix-seats.ts <eventId>   Diagnose & fix one event
  npx tsx scripts/diagnose-and-fix-seats.ts --all        Scan ALL festival events
  npx tsx scripts/diagnose-and-fix-seats.ts --dry-run <eventId>   Diagnose only, no fix
`)
    process.exit(1)
  }

  const dryRun = process.argv.includes('--dry-run')

  try {
    if (arg === '--all') {
      // Scan all FESTIVAL events
      const events = await db.event.findMany({
        where: { eventMode: 'FESTIVAL' },
        select: { id: true, title: true },
      })
      console.log(`Scanning ${events.length} festival events...`)

      for (const ev of events) {
        const diag = await diagnoseEvent(ev.id)
        if (diag && !dryRun) {
          await fixMissingSeats(diag.eventId, diag.sourceDayId, diag.targetDays)
        }
      }
    } else {
      const diag = await diagnoseEvent(arg)
      if (diag && !dryRun) {
        console.log(`\n${'─'.repeat(70)}`)
        console.log(`Apakah kamu yakin ingin menambahkan kursi untuk ${diag.targetDays.length} hari?`)
        console.log(`Ini HANYA menambah kursi (tidak menghapus apapun).`)
        console.log(`Status kursi baru = AVAILABLE (fresh).`)
        console.log(`${'─'.repeat(70)}`)

        // Auto-proceed (user already confirmed by running script)
        await fixMissingSeats(diag.eventId, diag.sourceDayId, diag.targetDays)
      }
    }
  } catch (err) {
    console.error('❌ Error:', err)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

main()
