# Milestone 5 verification — 23 September 2026

## Shipped

Public competition directory with name search, multi-field and entry-format
filters, three sort orders, registration state, deadlines, organisation name,
prizes, age guidance, rich cards, modal preview, full details, loading skeletons,
empty/error recovery, and 12-item server-paged results. Signed-in participants
can save and remove competitions, browse saved results, and retain bookmarks
across refresh. URL parameters retain search and filter state. The prior
Milestone 4 public detail route remains direct-loadable.

## Database

`004_discovery_and_bookmarks.sql` applied to the existing Vertex project through
the connected Supabase app. `SCHEMA.sql` includes identical current DDL. Added
trigram name, field-array, and deadline indexes plus RLS-protected bookmarks.
RLS permits only a participant to insert their own bookmark for a published
competition; only that account can read or remove it. Organiser insertion,
foreign participant insertion, and cross-account reads were denied in tests.
The migration appears in remote migration history. Advisor findings are
pre-existing and documented in `SUPABASE.md`; this milestone added no new
security-definer code or view.

## Browser evidence

- `tests/e2e/milestone-5.spec.js`: 4 passed across desktop and mobile Chromium.
- Seeded 15 published competitions per test through an authenticated organiser
  RPC; exercised public search, filters, sorting, 12-item pages and refresh,
  preview, full detail route and refresh, participant age mismatch, bookmark
  persistence, saved-only view, and removal. Separate browser contexts covered
  logged-out public and signed-in participant views.
- Milestone 1 regression after selector update: 19 passed, 1 planned mobile skip.
- Full-page public detail, participant discovery, and dark empty-state screenshots
  inspected at desktop and mobile sizes. Splash animation finished before capture.
- No test profile pictures, organisation logos, or banners were uploaded.
- All Milestone 5 test accounts, their 150 published competitions from iterative
  browser runs, and bookmarks were deleted with exact test-account email and
  ownership guards. Verified zero matching accounts, competitions and bookmarks.

## Manual review

`CHECKS.md` now contains the Milestone 5 human visual and interaction checklist.
