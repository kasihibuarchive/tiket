/**
 * Hapus semua data sandbox — KEEP event "Pementasan Citra" & "Pementasan Pada Suatu Hari"
 *
 * Cara pakai:
 *
 * OPTION 1: Run locally (butuh DATABASE_URL Supabase di .env.local)
 *   DATABASE_URL="postgresql://..." npx tsx scripts/cleanup-sandbox.ts
 *
 * OPTION 2: Paste SQL langsung ke Supabase SQL Editor
 *   (SQL ada di bawah, copy bagian yang di-comment)
 *
 * OPTION 3: Run via Vercel serverless (bikin API route sementara)
 */

/*
-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SQL — Paste ke Supabase SQL Editor (paling gampang!)       ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Step 0: Cek dulu event yang akan di-keep
SELECT id, title FROM "Event" WHERE title ILIKE '%Citra%' OR title ILIKE '%Pada Suatu Hari%';

-- Simpan ID-nya! (ganti <KEEP_ID_1> dan <KEEP_ID_2> di bawah dengan ID yang muncul)

-- Step 1: Hapus data transaksi & kursi dari event yang BUKAN yang di-keep
-- Urutan penting karena foreign key constraints

-- 1a. Hapus transaction yang bukan dari event yang di-keep
DELETE FROM "Transaction"
WHERE "eventId" NOT IN (
  SELECT id FROM "Event" WHERE title ILIKE '%Citra%' OR title ILIKE '%Pada Suatu Hari%'
);

-- 1b. Hapus kursi dari event yang bukan yang di-keep
DELETE FROM "Seat"
WHERE "eventId" NOT IN (
  SELECT id FROM "Event" WHERE title ILIKE '%Citra%' OR title ILIKE '%Pada Suatu Hari%'
);

-- 1c. Hapus price categories dari event yang bukan yang di-keep
DELETE FROM "PriceCategory"
WHERE "eventId" NOT IN (
  SELECT id FROM "Event" WHERE title ILIKE '%Citra%' OR title ILIKE '%Pada Suatu Hari%'
);

-- 1d. Hapus merchandise dari event yang bukan yang di-keep
DELETE FROM "Merchandise"
WHERE "eventId" NOT IN (
  SELECT id FROM "Event" WHERE title ILIKE '%Citra%' OR title ILIKE '%Pada Suatu Hari%'
);

-- 1e. Hapus promo codes dari event yang bukan yang di-keep
DELETE FROM "PromoCode"
WHERE "eventId" NOT IN (
  SELECT id FROM "Event" WHERE title ILIKE '%Citra%' OR title ILIKE '%Pada Suatu Hari%'
)
OR "eventId" IS NULL;  -- hapus juga promo global sandbox

-- 1f. Hapus event show dates dari event yang bukan yang di-keep
DELETE FROM "EventShowDate"
WHERE "eventId" NOT IN (
  SELECT id FROM "Event" WHERE title ILIKE '%Citra%' OR title ILIKE '%Pada Suatu Hari%'
);

-- Step 2: Hapus event yang bukan yang di-keep
DELETE FROM "Event"
WHERE title NOT ILIKE '%Citra%' AND title NOT ILIKE '%Pada Suatu Hari%';

-- Step 3: Bersihin data orphan (yang ga punya event lagi)
DELETE FROM "ActivityLog" WHERE "createdAt" < NOW() - INTERVAL '7 days';
DELETE FROM "EventQueueToken" WHERE status IN ('EXPIRED', 'LEFT');
DELETE FROM "EventQueue" WHERE "eventId" NOT IN (SELECT id FROM "Event");

-- Step 4: Verifikasi
SELECT 'Events' as tabel, COUNT(*) as count FROM "Event"
UNION ALL
SELECT 'Transactions', COUNT(*) FROM "Transaction"
UNION ALL
SELECT 'Seats', COUNT(*) FROM "Seat"
UNION ALL
SELECT 'Merchandise', COUNT(*) FROM "Merchandise"
UNION ALL
SELECT 'PromoCodes', COUNT(*) FROM "PromoCode";

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  END SQL                                                    ║
-- ╚══════════════════════════════════════════════════════════════╝
*/

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const KEEP_EVENT_NAMES = ['Citra', 'Pada Suatu Hari']

async function main() {
  console.log('🧹 Cleanup Sandbox Data\n')
  console.log('Keeping events containing:', KEEP_EVENT_NAMES.join(', '))
  console.log('')

  // Find events to keep
  const keepEvents = await prisma.event.findMany({
    where: {
      OR: KEEP_EVENT_NAMES.map(name => ({ title: { contains: name, mode: 'insensitive' as const } })),
    },
    select: { id: true, title: true },
  })

  const keepIds = keepEvents.map(e => e.id)
  const keepTitles = keepEvents.map(e => e.title)

  console.log('✅ Events to KEEP:')
  keepEvents.forEach(e => console.log(`   - [${e.id}] ${e.title}`))

  if (keepIds.length === 0) {
    console.error('\n❌ No matching events found! Aborting to be safe.')
    console.error('Check the event names in KEEP_EVENT_NAMES')
    return
  }

  // Find events to delete
  const deleteEvents = await prisma.event.findMany({
    where: { id: { notIn: keepIds } },
    select: { id: true, title: true },
  })

  const deleteIds = deleteEvents.map(e => e.id)

  console.log(`\n🗑️  Events to DELETE (${deleteEvents.length}):`)
  deleteEvents.forEach(e => console.log(`   - [${e.id}] ${e.title}`))

  if (deleteIds.length === 0) {
    console.log('\nNothing to delete!')
    return
  }

  // Count before
  const beforeCounts = {
    transactions: await prisma.transaction.count({ where: { eventId: { in: deleteIds } } }),
    seats: await prisma.seat.count({ where: { eventId: { in: deleteIds } } }),
    priceCategories: await prisma.priceCategory.count({ where: { eventId: { in: deleteIds } } }),
    merchandise: await prisma.merchandise.count({ where: { eventId: { in: deleteIds } } }),
    promoCodes: await prisma.promoCode.count({
      where: { OR: [{ eventId: { in: deleteIds } }, { eventId: null }] },
    }),
    showDates: await prisma.eventShowDate.count({ where: { eventId: { in: deleteIds } } }),
  }

  console.log('\n📊 Data to be deleted:')
  console.log(`   Transactions:   ${beforeCounts.transactions.toLocaleString()}`)
  console.log(`   Seats:          ${beforeCounts.seats.toLocaleString()}`)
  console.log(`   Price Cats:     ${beforeCounts.priceCategories.toLocaleString()}`)
  console.log(`   Merchandise:    ${beforeCounts.merchandise.toLocaleString()}`)
  console.log(`   Promo Codes:    ${beforeCounts.promoCodes.toLocaleString()}`)
  console.log(`   Show Dates:     ${beforeCounts.showDates.toLocaleString()}`)

  // Execute deletes (order matters for FK constraints)
  console.log('\n⏳ Deleting...')

  const del1 = await prisma.transaction.deleteMany({ where: { eventId: { in: deleteIds } } })
  console.log(`   ✅ Transactions deleted: ${del1.count}`)

  const del2 = await prisma.seat.deleteMany({ where: { eventId: { in: deleteIds } } })
  console.log(`   ✅ Seats deleted: ${del2.count}`)

  const del3 = await prisma.priceCategory.deleteMany({ where: { eventId: { in: deleteIds } } })
  console.log(`   ✅ PriceCategories deleted: ${del3.count}`)

  const del4 = await prisma.merchandise.deleteMany({ where: { eventId: { in: deleteIds } } })
  console.log(`   ✅ Merchandise deleted: ${del4.count}`)

  const del5 = await prisma.promoCode.deleteMany({
    where: { OR: [{ eventId: { in: deleteIds } }, { eventId: null }] },
  })
  console.log(`   ✅ PromoCodes deleted: ${del5.count} (including global sandbox promos)`)

  const del6 = await prisma.eventShowDate.deleteMany({ where: { eventId: { in: deleteIds } } })
  console.log(`   ✅ ShowDates deleted: ${del6.count}`)

  const del7 = await prisma.event.deleteMany({ where: { id: { in: deleteIds } } })
  console.log(`   ✅ Events deleted: ${del7.count}`)

  // Cleanup orphan data
  const delLogs = await prisma.activityLog.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  })
  console.log(`   ✅ Old ActivityLogs deleted: ${delLogs.count} (>7 days)`)

  const delTokens = await prisma.eventQueueToken.deleteMany({
    where: { status: { in: ['EXPIRED', 'LEFT'] } },
  })
  console.log(`   ✅ Expired QueueTokens deleted: ${delTokens.count}`)

  const delQueues = await prisma.eventQueue.deleteMany({
    where: { eventId: { notIn: keepIds } },
  })
  console.log(`   ✅ Orphan Queues deleted: ${delQueues.count}`)

  // Verify
  console.log('\n📋 Remaining data:')
  const remaining = {
    events: await prisma.event.count(),
    transactions: await prisma.transaction.count(),
    seats: await prisma.seat.count(),
    merchandise: await prisma.merchandise.count(),
    promoCodes: await prisma.promoCode.count(),
  }
  console.log(`   Events:       ${remaining.events}`)
  console.log(`   Transactions: ${remaining.transactions}`)
  console.log(`   Seats:        ${remaining.seats}`)
  console.log(`   Merchandise:  ${remaining.merchandise}`)
  console.log(`   PromoCodes:   ${remaining.promoCodes}`)

  console.log('\n🧹 Done! Sandbox cleaned.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
