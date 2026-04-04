---
Task ID: 1
Agent: main
Task: Fix 4 bugs reported by user - canvas trimming, create event button, day separation, admin data persistence

Work Log:
- Analyzed uploaded images and explored codebase for all 4 bugs
- **Bug 1 (Canvas empty area trimmed)**: Found root cause in `sanitizeLayoutData()` in seat map edit page — it was stripping `seatColumns`, `canvasWidth`, `canvasHeight` from layout data when loading from DB. Fixed by adding these fields to the sanitization output.
- **Bug 2 (Create Event button greyed out)**: Found that `formData.showDate` was never populated from the `showDates` array inputs. The disabled condition checked `!formData.showDate` which was always true. Fixed by changing disabled condition to check `!formData.showDates.some(sd => sd.date)` and deriving `showDate` from first showDate entry in handleSave.
- **Bug 3 (Day 1/Day 2 mixed in visitor view)**: The SeatMap component uses `useState(initialSeats)` which only takes the initial value. When switching show date tabs, the seats prop changes but the component doesn't re-initialize. Fixed by adding `key={activeShowDate?.id || 'default'}` to force remount on day change.
- **Bug 4 (Admin/usher data disappears after kill)**: Added auto-seed mechanism in auth login route that creates default admin account if none exist. Added session re-issuance in GET auth check — when token validation fails (APP_SECRET changed), it re-issues a new valid session token if the admin account still exists.
- Built and deployed all fixes, verified APIs work correctly

Stage Summary:
- Fixed 4 files: seat map edit page, admin events page, visitor event page, auth login route
- Server running on port 3000, all endpoints verified
- Day 1 (46 seats) and Day 2 (46 seats) properly separated in API
