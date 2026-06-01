-- AlterTable: Add bundling discount, category restriction, and terms & conditions fields to PromoCode

-- 1. Bundling Discount: bundleSize (jumlah tiket per bundling) + bundleDiscount (diskon IDR per bundling)
ALTER TABLE "PromoCode" ADD COLUMN "bundleSize" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PromoCode" ADD COLUMN "bundleDiscount" INTEGER NOT NULL DEFAULT 0;

-- 2. Category Restriction: JSON array of PriceCategory IDs (null = semua kategori berlaku)
ALTER TABLE "PromoCode" ADD COLUMN "applicableCategoryIds" TEXT;

-- 3. Terms & Conditions per Promo: teks S&K yang bisa diedit (null = tidak ada S&K)
ALTER TABLE "PromoCode" ADD COLUMN "termsAndConditions" TEXT;
