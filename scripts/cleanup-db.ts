/**
 * One-time DB cleanup script — run locally with your Supabase DATABASE_URL.
 *
 * Usage:
 *   $env:DATABASE_URL = "postgresql://..."
 *   npx tsx scripts/cleanup-db.ts
 *
 * Or paste the SQL directly into Supabase SQL Editor.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== DB Cleanup ===\n')

  // 1. Count before cleanup
  const activityLogCount = await prisma.activityLog.count()
  const queueTokenCount = await prisma.eventQueueToken.count()
  const expiredTokenCount = await prisma.eventQueueToken.count({
    where: { status: { in: ['EXPIRED', 'LEFT'] } },
  })

  console.log('Before cleanup:')
  console.log(`  ActivityLog:          ${activityLogCount.toLocaleString()} rows`)
  console.log(`  EventQueueToken:      ${queueTokenCount.toLocaleString()} rows`)
  console.log(`    - EXPIRED/LEFT:     ${expiredTokenCount.toLocaleString()} rows`)

  // 2. Delete old ActivityLog (keep last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const deletedLogs = await prisma.activityLog.deleteMany({
    where: { createdAt: { lt: thirtyDaysAgo } },
  })
  console.log(`\nDeleted ${deletedLogs.count.toLocaleString()} old ActivityLog entries (>30 days)`)

  // 3. Delete expired/left queue tokens
  const deletedTokens = await prisma.eventQueueToken.deleteMany({
    where: { status: { in: ['EXPIRED', 'LEFT'] } },
  })
  console.log(`Deleted ${deletedTokens.count.toLocaleString()} expired/LEFT queue tokens`)

  // 4. Count after cleanup
  const afterLogCount = await prisma.activityLog.count()
  const afterTokenCount = await prisma.eventQueueToken.count()
  const afterExpiredCount = await prisma.eventQueueToken.count({
    where: { status: { in: ['EXPIRED', 'LEFT'] } },
  })

  console.log('\nAfter cleanup:')
  console.log(`  ActivityLog:          ${afterLogCount.toLocaleString()} rows`)
  console.log(`  EventQueueToken:      ${afterTokenCount.toLocaleString()} rows`)
  console.log(`    - EXPIRED/LEFT:     ${afterExpiredCount.toLocaleString()} rows`)

  // 5. Table size estimate (PostgreSQL)
  try {
    const sizes = await prisma.$queryRaw<
      Array<{ table_name: string; total_size_mb: string }>
    >`
      SELECT
        schemaname || '.' || tablename as table_name,
        pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as total_size_mb
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
      LIMIT 10
    `
    console.log('\nTop 10 tables by size:')
    for (const row of sizes) {
      console.log(`  ${row.table_name.padEnd(45)} ${row.total_size_mb}`)
    }

    const dbSize = await prisma.$queryRaw<Array<{ size: string }>>`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `
    console.log(`\nTotal DB size: ${dbSize[0]?.size}`)
  } catch (e) {
    console.log('\nCould not get table sizes:', e)
  }

  console.log('\n=== Done ===')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
