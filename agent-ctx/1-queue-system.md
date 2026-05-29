# Task: Virtual Waiting Room / Queue System for Teateran

## Summary
Implemented a complete Virtual Waiting Room / Queue System for the Teateran theater ticketing platform. The system prevents database connection exhaustion, race conditions on seat locking, and poor UX during high-traffic ticket sales events.

## Files Created

### 1. `/src/app/api/events/[id]/queue/route.ts` — Queue Status API (GET)
- Checks queue status for a given event and sessionId
- Admin bypass: validates `admin_session` cookie, returns ACTIVE immediately for admins
- Cleanup logic: marks expired ACTIVE tokens, deletes old EXPIRED/LEFT tokens
- Promotion logic: promotes next WAITING tokens to ACTIVE when slots available
- Heartbeat: extends ACTIVE token expiresAt by 5 minutes on each check
- Auto-enrollment: creates WAITING or ACTIVE token for new sessions
- Returns: `{ enabled, status, position, totalWaiting, estimatedWait }`

### 2. `/src/app/api/events/[id]/queue/configure/route.ts` — Queue Configuration API (GET/PUT)
- **PUT**: Admin-only endpoint to enable/disable queue and set maxConcurrent
- **GET**: Admin-only endpoint to fetch current config and live stats (active, waiting, expired users)
- Uses `admin_session` cookie for authentication via `validateSessionToken`
- Disabling queue deletes all tokens and config; enabling uses `upsert`
- Updates shared cache via `setCachedQueueConfig` and `invalidateQueueCache`

### 3. `/src/app/api/events/[id]/queue/leave/route.ts` — Leave Queue API (POST)
- Marks the session's WAITING or ACTIVE token as LEFT
- Automatically promotes the next waiting user if a slot opens
- Requires `sessionId` in request body

### 4. `/src/components/queue-gate.tsx` — QueueGate Client Component
- Wraps seat selection section on event detail page
- On mount: calls queue status API with sessionStorage sessionId
- If `{ enabled: false }` → renders children (no queue)
- If `{ status: 'ACTIVE' }` → renders children + starts 15s heartbeat polling
- If `{ status: 'WAITING' }` → renders full-screen waiting room UI with:
  - Queue position display with animated transitions
  - Progress bar showing relative position
  - Estimated wait time calculation
  - Auto-refresh indicator with pulsing dot
  - "Anda akan dialihkan otomatis" notice
  - Auto-polls every 3 seconds for promotion
  - Smooth fade-in when promoted to ACTIVE
- On unmount: fire-and-forget leave API call to release slot

### 5. `/src/lib/queue-cache.ts` — Shared Queue Config Cache
- Module-level Map cache with 30s TTL
- Shared between queue status and configure routes
- Prevents cache inconsistencies in serverless environments
- Functions: `getCachedQueueConfig`, `setCachedQueueConfig`, `invalidateQueueCache`

## Files Modified

### 6. `/prisma/schema.prisma`
- Added `EventQueue` model: one per event, stores `maxConcurrent` setting
- Added `EventQueueToken` model: per-session tokens with status (WAITING/ACTIVE/EXPIRED/LEFT), position, timing
- Proper indexes on `eventId`, `[eventId, sessionId]`, `[eventId, status]`, and `expiresAt`

### 7. `/src/app/events/[id]/page.tsx`
- Added `QueueGate` import
- Wrapped the seat selection `<section>` with `<QueueGate eventId={eventId}>`
- Queue gate only activates when admin has configured queue for the event

### 8. `/src/app/admin/events/page.tsx`
- Added `Users` icon and `Switch` component imports
- Added queue config dialog state variables
- Added `openQueueDialog` function: fetches current queue config and stats
- Added `handleSaveQueue` function: saves queue config via PUT API
- Added Queue Config Dialog with:
  - Toggle switch to enable/disable queue
  - Max concurrent users input (1-500)
  - Live stats display (active users, waiting users)
  - Info notes about admin bypass and session timeout
- Added Users icon button in events table action column (highlighted gold when queue is active)

## Architecture Decisions

1. **DB-backed queue**: Since Vercel is serverless with no persistent memory, the database IS the source of truth. Module-level caching provides fast reads between cold starts.

2. **Client-side polling**: No WebSocket available. Queue status polled every 3s (waiting) / 15s (active heartbeat). Leave is fire-and-forget on unmount.

3. **Session-based**: Uses existing `getSessionId()` from `sessionStorage` — persists within tab, resets on close. Prevents stale locks from abandoned tabs.

4. **Admin bypass**: Admin sessions (validated via `admin_session` cookie and `validateSessionToken`) always get ACTIVE status without joining the queue.

5. **Atomic promotion**: On every queue check, expired tokens are cleaned up first, then waiting tokens are promoted sequentially. This prevents race conditions.

6. **Shared cache module**: `queue-cache.ts` is imported by both the status and configure routes, ensuring cache invalidation propagates correctly even across serverless function instances.
