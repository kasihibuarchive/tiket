import { NextResponse } from 'next/server'

// One-time migration endpoint to add new PromoCode columns
// DELETE this file after running the migration!
import { db } from '@/lib/db'

export async function POST() {
  try {
    // Use raw SQL to add the new columns if they don't exist
    await db.$executeRawUnsafe(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PromoCode' AND column_name = 'bundleSize') THEN
          ALTER TABLE "PromoCode" ADD COLUMN "bundleSize" INTEGER NOT NULL DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PromoCode' AND column_name = 'bundleDiscount') THEN
          ALTER TABLE "PromoCode" ADD COLUMN "bundleDiscount" INTEGER NOT NULL DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PromoCode' AND column_name = 'applicableCategoryIds') THEN
          ALTER TABLE "PromoCode" ADD COLUMN "applicableCategoryIds" TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PromoCode' AND column_name = 'termsAndConditions') THEN
          ALTER TABLE "PromoCode" ADD COLUMN "termsAndConditions" TEXT;
        END IF;
      END $$;
    `)

    return NextResponse.json({ success: true, message: 'Migration completed successfully! New columns added to PromoCode table.' })
  } catch (error: any) {
    console.error('Migration error:', error)
    return NextResponse.json({ success: false, error: error.message || 'Migration failed' }, { status: 500 })
  }
}
