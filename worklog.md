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

---
## Task ID: 3 - main-agent
### Work Task
Fix 3 bugs: (1) Draggable/resizable stage in admin editor, (2) Guest view empty space + mobile stage scroll, (3) Multi-day seats sharing data.

### Work Summary

#### Bug 1: Draggable & Resizable Stage (PowerPoint-style)
**Files created**: `src/lib/draggable-object.tsx`
**Files modified**: `src/components/seat-map-builder/canvas-editor.tsx`, `src/components/seat-map.tsx`, `src/lib/stage-renderer.tsx`

**Changes**:
1. **Created `DraggableObject` component** (`src/lib/draggable-object.tsx`):
   - Generic wrapper that makes any child element draggable (free-form pixel positioning) and resizable (8 handles: corners + edges)
   - Supports selection state (blue border), overlap warning (orange pulsing border)
   - Label badge showing element name when selected
   - Constrains movement within parent bounds
   - Exports `Bounds` type and `boundsOverlap()` utility for AABB collision detection

2. **Canvas Editor** (`canvas-editor.tsx`):
   - Added `stagePosition` state (`{ x, y, width, height }`) initialized from layoutData or defaults to `{ x: 0, y: 0, width: 320, height: 60 }`
   - Added `selectedElementType` state to track whether stage or object is selected
   - Added `renderDraggableStage()` — renders stage in a `DraggableObject` wrapper in edit mode, static positioned div in preview mode
   - Added `renderDraggableObjects()` — renders each object (FOH, ENTRANCE, CUSTOM_SHAPE) in individual `DraggableObject` wrappers
   - Added overlap detection: `stageIsOverlapping` checks stage against all objects, `objectOverlapIds` checks selected object against stage + other objects
   - Removed old inline stage rendering (PROSCENIUM/AMPHITHEATER at top, THRUST/BLACK_BOX/ARENA injected between rows)
   - Removed ObjectsOverlay from both `renderNumberedGrid()` and `renderGAGrid()` — replaced with draggable objects
   - `LayoutObject` interface extended with optional `x, y, pixelW, pixelH` fields for free-form positioning
   - `getExportLayoutData()` now saves `stagePosition` in the exported layoutData
   - Added `handleSelectStage`, `handleSelectObject`, `handleDeselectAll` callbacks
   - Click on canvas background deselects all elements

3. **Guest Seat Map** (`seat-map.tsx`):
   - Reads `stagePosition` from layoutData; if available, renders stage at absolute position within the scrollable container
   - Falls back to default inline rendering when no custom position is set
   - Inset stage (BLACK_BOX/ARENA in middle of rows) is skipped when custom position exists

4. **ObjectsOverlay** (`stage-renderer.tsx`):
   - Added `offsetX` prop to align objects with grid cells (accounting for row label width)
   - Objects now correctly position at `left: offsetX + obj.c * cellSize`

#### Bug 2: Guest View Empty Space + Mobile Stage Sticking
**Files modified**: `src/components/seat-map.tsx`

**Changes**:
1. **Removed `max-w-3xl mx-auto`** from both LayoutData mode and Legacy mode outer wrappers — changed to `w-full` to fill available width
2. **Moved StageRenderer INSIDE the `overflow-x-auto` scroll container** in both rendering modes, so the stage scrolls horizontally with the seat grid on mobile
3. **ObjectsOverlay** already inside scroll container, now also uses proper `offsetX` for correct alignment

#### Bug 3: Multi-day Seats Sharing Data
**Files modified**: `src/app/events/[id]/page.tsx`

**Changes**:
1. **Seat fetch on date switch**: Changed the `useEffect` to run on both `activeShowDate?.id` AND `eventId` (previously only ran when `activeShowDate?.id` was truthy). Now also clears `allSeats` immediately on date switch (`setAllSeats([])`) to prevent stale data from showing.
2. **Removed fallback filtering**: Changed `filteredSeats` from a complex `useMemo` with fallback logic (`dateSeats.length > 0 ? dateSeats : allSeats.filter(s => !s.eventShowDateId)`) to simply `const filteredSeats = allSeats` — since the server already filters by showDateId, no client-side filtering is needed. The old fallback was returning wrong data when seats didn't have showDateId set.

**Lint**: All changes pass lint (0 new errors). TypeScript compiles without errors in modified files. Pre-existing errors remain in unrelated files.

---
## Task ID: 4 - main-agent
### Work Task
Fix 4 bugs: (1) Multi-day tabs in admin seat editor, (2) Empty space on right in guest view, (3) Event creation button stays disabled, (4) Stage shape doesn't resize with drag.

### Work Summary

#### BUG 1: Multi-day tabs in admin seat editor
**File modified**: `src/app/admin/events/[id]/seats/page.tsx`

**Changes**:
1. Added `ShowDateData` interface and `showDates` field to `EventInfo`
2. Added state: `showDates`, `selectedShowDateIdx` (default -1 = all days), `allSeats` (replaces old `seats` state)
3. `seats` is now a `useMemo` derived from `allSeats` filtered by active show date
4. After fetching event info, if event has >1 show date, populate `showDates` and default to first day
5. Added a `useEffect` that re-fetches seats from API when `activeShowDate?.id` changes
6. Added pill buttons (tabs) in the header area with "Semua Hari" and per-day options
7. Clear selection and unsaved changes when switching days
8. Updated all `setSeats()` calls to `setAllSeats()` since seats is now derived
9. Empty state check uses `allSeats.length` instead of `seats.length`

#### BUG 2: Empty space on right in guest view
**Files modified**: `src/components/seat-map.tsx`, `src/app/events/[id]/page.tsx`

**Changes**:
1. Removed `mx-auto` from the grid container in LayoutData mode (line 553) — replaced with just `relative` so grid is left-aligned
2. Added `relative` to the legacy mode container for consistency
3. Changed `max-w-5xl` to `max-w-7xl` on the guest event page seat selection section for wider layout

#### BUG 3: Event creation button stays disabled
**File modified**: `src/app/admin/events/page.tsx`

**Changes**:
1. Removed `formData.showDates.every((sd) => !sd.date)` from the disabled condition on the create/edit event button
2. The `showDates` array always has at least one entry with empty date by default, causing `.every()` to return `true`
3. The main `showDate` field already handles date validation, so the showDates check was redundant and blocking form submission

#### BUG 4: Stage shape doesn't resize with drag
**Files modified**: `src/lib/stage-renderer.tsx`, `src/components/seat-map-builder/canvas-editor.tsx`, `src/components/seat-map.tsx`

**Changes**:
1. Added `fillParent?: boolean` prop to `StageRendererProps`
2. Each of the 5 stage types (PROSCENIUM, AMPHITHEATER, THRUST, BLACK_BOX, ARENA) now has a `fillParent` variant that uses `w-full h-full` instead of fixed `max-w-*` classes
3. When `fillParent` is true, text sizing falls back to `sm` scale for consistent appearance
4. Passed `fillParent` prop to StageRenderer in:
   - Canvas editor's `renderDraggableStage()` (both preview and edit mode)
   - Guest seat map when `hasCustomStagePosition` is true

**Lint**: All changes pass lint (0 new errors). Pre-existing errors remain in non-project JS files.
