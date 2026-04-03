---
Task ID: 1
Agent: Main
Task: Read all critical files and plan feature implementation

Work Log:
- Read prisma/schema.prisma - understood all 10 models
- Read canvas-editor.tsx (~1700 lines) - seat map builder with NUMBERED and GA modes
- Read seat-map.tsx - public seat map with WebSocket real-time
- Read events/[id]/page.tsx - public event detail page
- Read admin/events/page.tsx - admin event management
- Read API routes for events
- Read seat-layout.ts - shared layout parser

Stage Summary:
- Database: SQLite at db/custom.db (not PostgreSQL as previously assumed)
- Stage rendering is hardcoded in both editor and public views
- No multi-day support (single showDate field)
- No teaser video field
- No stage type configuration
- No non-clickable objects in seatmap
- Schema updated: added StageType enum, EventShowDate model, teaserVideoUrl field
- Migration pushed successfully

---
## Task ID: 2 - main-implementer
### Work Task
Implement 4 major features for Teateran theater ticketing platform:
1. Stage Variants (5 types) in Seatmap Builder
2. Customizable Non-Clickable Objects
3. Multi-Day Events
4. Teaser Video Embed

### Work Summary

#### Feature 1: Stage Variants (5 Types)
**Created** `src/lib/stage-renderer.tsx` — shared React component with:
- `StageRenderer` component supporting 5 stage types: PROSCENIUM (rectangular, default), AMPHITHEATER (semicircular with border-radius), THRUST (T-shape with narrow extension), BLACK_BOX (dashed border with corner markers), ARENA (oval/circle using border-radius: 50%)
- `ObjectsOverlay` component for rendering non-clickable decorative objects
- 3 size variants (sm, md, lg) for different contexts

**Updated** `src/components/seat-map-builder/canvas-editor.tsx`:
- Added `initialStageType` prop and `stageType` state
- Added `StageType` selector dropdown in sidebar (between Grid Size and Aisle sections)
- Added mini preview of selected stage type in sidebar
- Replaced hardcoded `renderStageBar()` with `StageRenderer` component
- Export layout now includes `stageType` and `objects` fields
- Updated `onSaveAndExit` signature to pass `(layoutData, stageType)`

**Updated** `src/app/admin/seat-maps/[id]/edit/page.tsx`:
- Added `currentStageType` state, loaded from API
- Passes `initialStageType` to CanvasEditor
- Updated `handleSaveAndExit` to accept and save `stageType`

**Updated** `src/components/seat-map.tsx`:
- Replaced both hardcoded stage divs (layoutData mode ~line 532, legacy mode ~line 738) with `StageRenderer` component
- LayoutData mode uses `parsedLayout?.stageType`, legacy defaults to PROSCENIUM

**Updated** `src/app/admin/events/[id]/seats/page.tsx`:
- Replaced hardcoded stage div with `StageRenderer` component
- Uses `parsedLayout?.stageType` or `layoutData?.stageType`

**Updated** `src/app/api/admin/seat-maps/[id]/route.ts`:
- Added `stageType` to PUT handler destructuring
- Added `stageType` to the update data payload

#### Feature 2: Customizable Non-Clickable Objects
**Updated** `src/components/seat-map-builder/canvas-editor.tsx`:
- Added `LayoutObject` interface with type, label, r, c, w, h, color fields
- Added `objects` field to both `NumberedLayout` and `GALayout` interfaces
- Added objects state initialized from `initialLayoutData.objects`
- Added "Objek" panel in sidebar with buttons to add FOH, Pintu (Entrance), and Custom Shape
- Full CRUD: list objects, select for editing, edit properties (name, position, size, color), delete
- Object Edit Dialog for detailed editing
- Objects are exported in layout data via `getExportLayoutData()`

**Updated** `src/components/seat-map.tsx`:
- Added `ObjectsOverlay` rendering in layoutData mode
- Objects rendered from `parsedLayout.objects` with `cellSize={SEAT_W + SEAT_GAP}`

**Updated** `src/app/admin/events/[id]/seats/page.tsx`:
- Added `ObjectsOverlay` rendering for admin seat view
- Reads objects from `parsedLayout.objects` or `layoutData.objects`

#### Feature 3: Multi-Day Events
**Updated** `src/app/admin/events/page.tsx`:
- Extended `EventData` interface with `showDates`, `posterUrl`, `synopsis`, `teaserVideoUrl`, `adminFee` fields
- Added `showDates` array to `EventFormData`
- Replaced single date inputs with multi-day events section
- Each show date has: label input, date/time input, open gate input
- "Tambah Hari" button, remove button (except first)
- Auto-labels new dates as "Hari N"
- Fixed `openEditDialog` to preserve `posterUrl` and `synopsis` (was previously reset to empty)
- Sends `showDates` array in save payload
- Events table shows "Multi-hari" badge when multiple show dates

**Updated** `src/app/events/[id]/page.tsx`:
- Added `showDates` to `EventData` interface
- Added `selectedShowDateIdx` state (moved before early returns for hooks rules)
- Display all show dates, with active date highlighted
- Multi-day events shown as clickable pill buttons
- Active show date info displayed (date, time, gate open time)
- Falls back to single date when no showDates exist

#### Feature 4: Teaser Video Embed
**Verified** existing `getEmbedUrl()` function in `src/app/events/[id]/page.tsx`:
- YouTube watch URLs → embed ✓
- YouTube Shorts → embed ✓
- youtu.be short links → embed ✓
- YouTube embed passthrough ✓
- Vimeo → player embed ✓
- Video section already has nice container with responsive 16:9 aspect ratio
- Already positioned below synopsis, above seat selection
- Already has "▶ Video Teaser" header with Play icon

**Fixed** admin edit dialog in `src/app/admin/events/page.tsx`:
- `openEditDialog` now properly preserves `posterUrl`, `synopsis`, `teaserVideoUrl`, `adminFee` from API response
- Loads existing `showDates` when editing an event
- Uses first showDate's openGate if available

#### Lint Results
- All 5 remaining lint errors are in pre-existing `.js` files (check-db.js, daemon-server.js, mini-services), NOT in modified source files
- Zero lint errors in any modified TypeScript/TSX files
