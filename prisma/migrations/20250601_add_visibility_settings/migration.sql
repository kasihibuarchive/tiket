-- AlterTable: Add visibility settings to Event
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "hideSeatAvailability" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "hideSoldCount" BOOLEAN NOT NULL DEFAULT false;
