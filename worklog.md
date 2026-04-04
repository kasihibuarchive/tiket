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

---
## Task ID: 2 - main-agent
### Work Task
Fix BUG 1 (Canvas Editor Stage Variant Positioning) and BUG 2 (Usher Seat Map View improvements).

### Work Summary

#### BUG 1: Stage Variant Positioning in Canvas Editor
**Files modified**: `src/components/seat-map-builder/canvas-editor.tsx`

**Changes**:
1. **Line 2296**: Changed `{renderStageBar()}` to only render for PROSCENIUM and AMPHITHEATER stage types. For THRUST, BLACK_BOX, and ARENA, the top-level stage bar is suppressed.
   ```tsx
   {(stageType === 'PROSCENIUM' || stageType === 'AMPHITHEATER') && renderStageBar()}
   ```

2. **In `renderNumberedGrid()`** (lines 1230-1343): Added stage injection logic:
   - For **THRUST**: StageRenderer is rendered INSIDE the grid container (before rows), so the thrust extension visually flows into the seating area.
   - For **BLACK_BOX** and **ARENA**: StageRenderer is injected at the MIDDLE of the row indices (`Math.floor(rowIndices.length / 2)`), creating the correct audience-surrounds-stage layout.
   - Wrapped row rendering in `React.Fragment` to allow stage injection between rows.
   - PROSCENIUM and AMPHITHEATER remain unchanged (stage at top, outside scroll).

3. **`stage-renderer.tsx`**: No changes needed — the component already correctly renders all stage variants.

#### BUG 2: Usher Seat Map View Improvements
**File modified**: `src/app/admin/usher/events/[id]/seats/page.tsx`

**Changes**:
1. **Full-width layout**: Removed the `grid grid-cols-1 lg:grid-cols-3` layout with `lg:col-span-2`. Seat map now takes full width. The info panel was moved from a static right column to a **Sheet (side drawer)** component that slides in from the right when a seat is clicked.

2. **Stage scrolls with content**: Moved the hardcoded stage HTML (replaced with `StageRenderer`) INSIDE the `overflow-x-auto` scrollable container, so it scrolls horizontally with the grid.

3. **Stage size selector**: Added a 3-button toggle (small/medium/large) in the page header area using `Minimize2` and `Maximize2` icons. The `stageSize` state controls the `size` prop passed to `StageRenderer`.

4. **Uses event's stageType**: The page now reads `parsedLayout?.stageType` from the seat map layout data (which is stored in the SeatMap model's `layoutData` JSON field as `stageType`). Falls back to `'PROSCENIUM'` if not found.

5. **Inset stage for BLACK_BOX/ARENA**: When the event uses BLACK_BOX or ARENA stage type, the stage is injected in the middle of the display rows (same approach as the public seat map component).

6. **Imports added**: `Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription` from shadcn/ui, `StageRenderer` from `@/lib/stage-renderer`, `Maximize2, Minimize2` from lucide-react.

**Lint**: All changes pass lint (0 new errors). Pre-existing errors are in non-project JS files (check-db.js, daemon-server.js).
