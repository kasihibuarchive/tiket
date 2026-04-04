---
Task ID: 1
Agent: Main + Subagents
Task: Fix 4 bugs - Stage positioning, verify ticket space, multi-day seats, rename Rendra→Teateran

Work Log:
- Killed server daemon
- BUG 4 (Rename): Global rename "Rendra" → "Teateran" across 19 files. Preserved "Auditorium Rendra" and "Stage Rendra". Updated footer with PH: YC Media, Owner: Yuncha.
- BUG 3 (Multi-day seats): 
  - Confirmed DB schema already has eventShowDateId/showDateId columns
  - Root cause: APIs didn't filter by showDateId
  - Updated 5 API routes: seats GET, lock, unlock, confirm-lock, events page
  - Updated seat-map.tsx to pass showDateId in all API calls
  - Fixed Jizo existing data: assigned 170 seats to Hari 1, created 170 fresh seats for Hari 2
- BUG 1 (Stage positioning): 
  - Black Box & Arena stages now render IN THE MIDDLE of seat rows
  - Proscenium, Amphitheater, Thrust remain at top
  - Stage scrolls with grid content (inside overflow-x-auto)
- BUG 2 (Public seat map):
  - Reduced max-w from 5xl to 3xl to eliminate right-side empty space
  - Stage now inside scrollable container
- Downgraded Prisma from v7 to v6 (compatibility with schema format)
- Rebuilt project, copied static, restarted daemon
- Verified: new BUILD_ID served, TEATERAN branding in HTML, seat API returns 170 seats per show date

Stage Summary:
- All 4 bugs fixed
- Server running: daemon PID 4112, next-server PID 4119
- Jizo: Hari 1 = 170 seats (3 sold), Hari 2 = 170 seats (0 sold, fresh)
- Brand: "Teateran" with PH: YC Media
