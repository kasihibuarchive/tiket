-- ============================================================
-- MIGRATION: Festival Mode (Multi-Day Pass + Cooldown + Scan Tracking)
-- Date: 2026-07-27
-- Description: Adds Festival mode support for multi-day events with
--              per-day ticket packages, scan cooldown, and scan history.
-- ============================================================

-- ── 1. EVENT TABLE: Add Festival mode fields ──
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "eventMode" TEXT NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN IF NOT EXISTS "multiDayPassEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "scanCooldownMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "cooldownEnabled" BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN "Event"."eventMode" IS 'REGULAR or FESTIVAL — Festival enables multi-day packages and scan cooldown';
COMMENT ON COLUMN "Event"."multiDayPassEnabled" IS 'Auto-true when FESTIVAL; enables 1-day/2-day/4-day packages';
COMMENT ON COLUMN "Event"."scanCooldownMinutes" IS 'Cooldown (minutes) after successful scan — Festival only';
COMMENT ON COLUMN "Event"."cooldownEnabled" IS 'Toggle cooldown on/off per event';

-- ── 2. PRICE CATEGORY TABLE: Add multi-day package fields ──
ALTER TABLE "PriceCategory"
  ADD COLUMN IF NOT EXISTS "packageType" TEXT,
  ADD COLUMN IF NOT EXISTS "applicableDayIds" TEXT;

COMMENT ON COLUMN "PriceCategory"."packageType" IS 'SINGLE | MULTI | FULL — null for REGULAR events';
COMMENT ON COLUMN "PriceCategory"."applicableDayIds" IS 'JSON array of EventShowDate IDs. Null = all days (FULL or REGULAR)';

-- ── 3. TRANSACTION TABLE: Add scan & cooldown tracking fields ──
ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "lastScanAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastScanShowDateId" TEXT,
  ADD COLUMN IF NOT EXISTS "manualValidityOverride" TEXT,
  ADD COLUMN IF NOT EXISTS "overrideNote" TEXT,
  ADD COLUMN IF NOT EXISTS "overrideBy" TEXT,
  ADD COLUMN IF NOT EXISTS "overrideAt" TIMESTAMP(3);

COMMENT ON COLUMN "Transaction"."lastScanAt" IS 'Last successful scan time (for cooldown calculation)';
COMMENT ON COLUMN "Transaction"."lastScanShowDateId" IS 'Which day was last scanned (for multi-day validation)';
COMMENT ON COLUMN "Transaction"."manualValidityOverride" IS 'null | FORCE_VALID | FORCE_INVALID';
COMMENT ON COLUMN "Transaction"."overrideNote" IS 'Reason for override';
COMMENT ON COLUMN "Transaction"."overrideBy" IS 'Usher/Admin ID who set override';
COMMENT ON COLUMN "Transaction"."overrideAt" IS 'When override was set';

-- ── 4. TICKET SCAN TABLE: New model for scan history ──
CREATE TABLE IF NOT EXISTS "TicketScan" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "showDateId" TEXT,
  "scanTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usherId" TEXT NOT NULL,
  "usherName" TEXT,
  "isValid" BOOLEAN NOT NULL,
  "scanType" TEXT NOT NULL,
  "reason" TEXT NOT NULL,

  CONSTRAINT "TicketScan_pkey" PRIMARY KEY ("id")
);

-- Indexes for TicketScan
CREATE INDEX IF NOT EXISTS "TicketScan_transactionId_idx" ON "TicketScan"("transactionId");
CREATE INDEX IF NOT EXISTS "TicketScan_showDateId_idx" ON "TicketScan"("showDateId");
CREATE INDEX IF NOT EXISTS "TicketScan_scanTime_idx" ON "TicketScan"("scanTime");
CREATE INDEX IF NOT EXISTS "TicketScan_usherId_idx" ON "TicketScan"("usherId");

-- Foreign key: TicketScan.transactionId → Transaction.id (CASCADE on delete)
ALTER TABLE "TicketScan"
  ADD CONSTRAINT "TicketScan_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- VERIFICATION (run these to confirm migration applied)
-- ============================================================
-- SELECT "eventMode", "multiDayPassEnabled", "scanCooldownMinutes", "cooldownEnabled"
-- FROM "Event" LIMIT 1;
--
-- SELECT "packageType", "applicableDayIds"
-- FROM "PriceCategory" LIMIT 1;
--
-- SELECT "lastScanAt", "manualValidityOverride"
-- FROM "Transaction" LIMIT 1;
--
-- SELECT COUNT(*) FROM "TicketScan";
-- ============================================================
