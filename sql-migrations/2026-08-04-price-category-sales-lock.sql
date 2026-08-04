-- 2026-08-04
-- Add per-PriceCategory sales lock ("Kunci Penjualan") for festival packages.
--
-- When salesLocked = true, public checkout rejects purchases with a clear
-- message. Ushers/admins can still issue complimentary tickets bypassing
-- this lock (manual override). Distinct from Seat.status = 'UNAVAILABLE'
-- (which is per-seat and used by GA zone-lock).
--
-- Fields added:
--   salesLocked      BOOLEAN NOT NULL DEFAULT FALSE  -- true = sales blocked
--   salesLockReason  TEXT                              -- optional public message
--   salesLockedAt    TIMESTAMP(3)                      -- when lock was applied
--   salesLockedBy    TEXT                              -- admin username (audit)

ALTER TABLE "PriceCategory"
  ADD COLUMN IF NOT EXISTS "salesLocked"     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "salesLockReason" TEXT,
  ADD COLUMN IF NOT EXISTS "salesLockedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "salesLockedBy"   TEXT;

-- Index for fast lookup (most queries filter WHERE salesLocked = false)
CREATE INDEX IF NOT EXISTS "PriceCategory_salesLocked_idx"
  ON "PriceCategory" ("salesLocked");
