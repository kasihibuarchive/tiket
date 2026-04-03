---
Task ID: 1
Agent: Main
Task: Fix UI not loading and ObjectsOverlay scrolling on mobile

Work Log:
- Diagnosed UI loading issue: static files (JS, CSS) returning 404
- Root cause: Next.js standalone build does NOT include `.next/static/` or `public/` — they must be manually copied to `.next/standalone/.next/static/` and `.next/standalone/public/`
- Fixed by copying static files to standalone directory
- Updated daemon-server.js Step 3.5 to auto-copy static files on every daemon restart (with mtime check)
- Fixed ObjectsOverlay scrolling: removed `inset-0` and `offsetX/offsetY` props; instead wrapped overlay in a positioned div inside the scroll container with explicit width/minWidth and marginLeft to align with grid cells
- Rebuilt project (BUILD_ID: _zUSy_4oqy4CN4jQG1rGE)
- Restarted daemon — all static assets return 200, new BUILD_ID confirmed

Stage Summary:
- UI loading issue fixed: static files now auto-copied to standalone dir
- daemon-server.js updated with auto-copy logic (Step 3.5)
- ObjectsOverlay no longer uses inset-0; positioned inline with scrollable grid content
- Objects should now scroll horizontally with columns on mobile
- Server running: daemon PID 18947, next-server PID 18954
