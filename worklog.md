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
