-- ============================================================
-- MIGRATION: Add Google Maps URL field to Event
-- Date: 2026-07-29
-- Description: Stores an editable Google Maps URL/share link per event.
--              The URL is parsed on the frontend to produce a no-API-key
--              embed URL (https://maps.google.com/maps?q=...&output=embed)
--              shown on the guest event page below the location text.
-- ============================================================

ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "mapUrl" TEXT;

COMMENT ON COLUMN "Event"."mapUrl" IS 'Google Maps URL (share link, embed URL, place URL, or coordinates). Parsed client-side into an embeddable iframe URL.';

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT "title", "location", "mapUrl" FROM "Event" LIMIT 5;
-- ============================================================
