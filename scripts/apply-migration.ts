// Run this script against your production database to apply the Tripay migration.
// Usage: npx tsx scripts/apply-migration.ts
// Or run the SQL directly in Supabase SQL Editor.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Checking if paymentMethod column exists...')

  try {
    // Try selecting the new columns to see if they exist
    await prisma.$queryRaw`SELECT "paymentMethod" FROM "Transaction" LIMIT 0`
    console.log('✓ Columns already exist, no migration needed.')
  } catch {
    console.log('Applying migration: adding paymentMethod and paymentUrl columns...')
    await prisma.$executeRawUnsafe(`ALTER TABLE "Transaction" ADD COLUMN "paymentMethod" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "Transaction" ADD COLUMN "paymentUrl" TEXT`)
    console.log('✓ Migration applied successfully!')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
