# Milestone 6 verification — 23 September 2026

## Shipped

Published competitions with individual entry allow eligible participant accounts
to register during the configured window. Registration uses the persisted birthday
and requires a category when configured. A confirmed entry survives refresh,
appears on the participant dashboard, and creates an in-app confirmation notice.
The registration page explains role, profile, age, deadline, and team-only blocks.

## Database

`005_individual_registration.sql` was applied to the existing Vertex project
through the connected Supabase app (remote migration `20260923062508`).
`SCHEMA.sql` contains the same DDL for a clean installation. Registration and
notification tables have RLS. Direct writes are denied; the authenticated RPC
checks persisted role, profile, age, competition status and dates, mode, category,
and duplicates before inserting registration and notification atomically.

## Browser evidence

- Milestone 6 acceptance passed in desktop and mobile Chromium (two tests), then
  passed once more on desktop after strengthening the cross-account row check.
- Tests used the local HTTP server and hosted Supabase. They covered logged-out
  registration and login return, category required state, network failure and
  retry, successful entry, refresh, dashboard and notice, duplicate prevention,
  underage and overage guidance, unopened and closed windows, team-only entry,
  organiser role rejection, direct-write denial, and cross-account read/write
  isolation. The cross-account write check targeted a real entry and verified
  its category remained unchanged.
- Milestone 1 and Milestone 5 regression: 23 passed, one planned mobile skip.
- Desktop and mobile entry, mobile blocked state, and mobile dashboard screenshots
  were inspected for layout and readable feedback.
- No test profile pictures, organisation logos, or banners were uploaded.

## Cleanup

After the final tests, removed 24 exact-pattern Milestone 5/6 test accounts and
their 60 competitions. Guarded deletion required the expected counts, test
slugs, and zero referenced banners. Registrations, notifications, and bookmarks
cascaded. Verified zero matching test users, competitions, registrations,
notifications, and bookmarks in the hosted project.

## Manual review

`CHECKS.md` contains human steps for visual and functional confirmation.
