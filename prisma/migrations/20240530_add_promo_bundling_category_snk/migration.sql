-- Add new enum value for DiscountType
ALTER TYPE "DiscountType" ADD VALUE IF NOT EXISTS 'BUNDLING_TICKET';

-- Add new columns to PromoCode
ALTER TABLE "PromoCode" ADD COLUMN IF NOT EXISTS "bundlingQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PromoCode" ADD COLUMN IF NOT EXISTS "bundlingDiscount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PromoCode" ADD COLUMN IF NOT EXISTS "targetPriceCategoryIds" TEXT;
ALTER TABLE "PromoCode" ADD COLUMN IF NOT EXISTS "termsAndConditions" TEXT;
