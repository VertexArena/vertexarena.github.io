# Milestone 8 verification — 23 September 2026

## Shipped

Participant dashboard classifies confirmed individual and team entries by actual competition start and final round release timestamps. It shows approaching dates, pending team invitations, recent registration and team updates, unread announcement and meeting assignment notices when present, and an authoritative first competition preview derived from confirmed entries. Teams still being built appear separately. Sections without released later-milestone content show honest empty states.

Organiser dashboard shows every competition owned by the signed-in organiser, confirmed registration, person, and team totals, upcoming dates, result and certificate configuration state, and recent registration and competition activity. Each competition has a dedicated workspace with its round path, counts, dates, participant roster, editor, and public-page links. Q&A, submission, and meeting areas show empty states until those workflows create records in later milestones.

## Database

`006b_dashboard_summary.sql` applied to existing Vertex project through connected Supabase app as remote migration `20260923124703`. `SCHEMA.sql` includes it. `organiser_dashboard_summary()` checks the authenticated account's persisted organiser role and scopes all counts and activity to competitions owned by that account. Anonymous callers have no execute grant. Participant API call was denied during browser testing. Supabase advisor reports the authenticated security-definer function; its explicit role and owner checks are intentional.

## Browser evidence

- Milestone 8 desktop and 390 px mobile Chromium acceptance passed with a local HTTP server and hosted Supabase. Test fixture had two upcoming entries, one active entry, one completed entry, one pending invitation, and a two-person registered team. Organiser totals matched four confirmed registrations, five people, and one team.
- Direct route loads, refresh, workspace and roster navigation, logged-out redirects, wrong-role denial, empty dashboards, and mobile horizontal overflow were checked.
- Prior milestone regression: Milestone 1 (10 tests), 5 (2), 6 (1), 7 (1), and 4 (1) passed. Milestone 4 discovery selector was scoped to its intended link; team realtime refresh now defers only while a text field has unsaved input.
- Desktop and mobile dashboard screenshots were inspected. The browser host could not fetch public CDN files under its normal sandbox; Playwright used the same pinned public Supabase client module from a local test cache and sandbox escalation for hosted Supabase. Nonessential font and icon CDN requests were aborted during this run, so manual visual checks remain in `CHECKS.md`.

## Cleanup

Storage API removed three banners from interrupted Milestone 4 regression runs. Exact-pattern test accounts and owned competitions created during this milestone's verification were deleted through the connected Supabase app. Final query verified zero new test accounts, competitions, and banner objects. No test profile pictures or organisation logos were uploaded.
