# Milestone 21 release verification

Local validation completed 1 October 2026 against the existing Vertex Supabase
project. The user explicitly requested **Skip the fresh Supabase test**. No fresh
project was created, and a fresh-project bootstrap is not claimed as tested.

## Browser regression

The full laptop run covered 54 acceptance tests across 28 files: 45 initially
passed, seven needed fixture corrections, and two were conditional skips. Every
failed flow subsequently passed:

- Q&A unread counts now include authoritative achievement notifications.
- Meeting loading waits allow real network latency; the real Jitsi embed passed.
- Authoring discovery checks search rather than assume the new competition is
  visible on page one. Publication and banner replacement passed.
- Dashboard fixtures use real datetime transitions instead of requiring hidden
  out-of-band date changes. Upcoming, active, completed and team states passed.
- Achievement fixtures allow sufficient time for actual UI registration and
  submissions. Team inheritance, progression and published awards passed.
- Recommendations run after unrelated fixtures are removed. Both personalized
  exploration and no-eligible-opportunity checks passed against the real catalogue.

The remaining regression includes account roles, persistent sessions, profiles,
organisation association, public discovery, individual and team registration,
organiser collaboration, announcements, Q&A, meetings, private files and links,
scoring, exact cutoff ties, advancement, scheduled and historical leaderboards,
category winners, visual certificate editing and dynamic PNG/PDF downloads,
recommendations, achievements, native PWA installation and encrypted Web Push.

The native Chrome test verified actual Google push transport and decrypted
announcement, result and deadline notifications. The final service-worker update
test passed after the release cache version was incremented. Signup/login and
all three account perspectives passed again after the session integration fix.

Mobile/tablet regression: **23 passed, three viewport-specific skips**. Mobile
organiser collaboration passed. The 500-entry load test passed separately, so its
conditional skip in the initial full suite does not represent missing coverage.

## Accessibility, integration and performance

Release acceptance tests passed for public routes, both themes, desktop/tablet/
320 px layouts, keyboard focus, labels, unexpected-error recovery, all account
perspectives, large judging/results views and Realtime channel cleanup. Axe
checks use WCAG 2 A/AA and WCAG 2.1 AA rules. Tested pages have zero reported
violations; this is not a claim of formal certification or a physical screen
reader audit.

Contrast repairs preserve the specified primary palette. They strengthen text
on tinted backgrounds, dark buttons/tabs/badges and arbitrary banner surfaces.
The mobile authentication home link has an explicit accessible name. Unexpected
script failures show a safe recovery notice without deleting input or exposing
raw error text. Reload requires confirmation before losing unsaved work.

Cross-tab signup, identity replacement and logout were tested in a shared real
browser context. Old profile data is removed immediately, pending old renders
are invalidated, and new profile queries run outside Supabase's Auth callback
lock. Protected pages return to login when another tab signs out.

A real 500-account Supabase fixture verified leaderboard search, page-two ranks,
20 pages, refresh and mobile layout. Organiser rosters rendered 25 rows per page,
changed entries on pagination and preserved page selection on refresh. Judging
and advancement views remained usable with all 500 entries. Three SPA round
page visits each joined one Realtime channel and left it when navigating away.

Certificate editor/renderer/PDF and Three.js requests were absent on unrelated
routes. Three.js and the visual certificate tools remain lazy loaded. Screenshots
of public discovery, result lists, private submissions, certificate editor and
account screens were inspected. Real CDN boot was additionally tested without
the development cached-library helper: Supabase, Geist, Font Awesome and GSAP
loaded successfully in Chrome, including direct-route recovery.

## Database and security

`20261001123311_release_query_performance.sql` was applied through the connected
Supabase app and consolidated into `SCHEMA.sql`. Four missing foreign-key indexes
were added. Identity checks are evaluated once per statement; duplicate
authenticated organisation membership SELECT policies were combined without
changing their allowed rows. Advisor verification now reports no unindexed
foreign keys, per-row Auth initialization warnings or duplicate permissive
policies. Unused-index notices remain appropriate for a small development dataset.

All **36 public application tables** have RLS. Role/ownership, private Storage,
submission access, score/finalisation/publication, eligibility and certificate
denials were exercised in the acceptance suites. Public profiles expose only an
explicit projection; birthday and email are not part of that view. The public
profile view and permission-checked security-definer RPC advisor notices are
reviewed architectural choices, not unrestricted access. Private event, push and
reminder tables intentionally have no client policies. Hosted Auth's existing
leaked-password protection notice is documented separately in `SUPABASE.md`.

Advisor references:
[private tables](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[view review](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view),
[RPC review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Release validation confirms all **39 immutable migrations** are represented in
the consolidated schema and the browser key is the existing project's anon key.
No privileged credential is included in the browser application or Pages package.
The leaderboard publication and private push delivery cron jobs remain active.

## Cleanup and release

Removed **658 temporary accounts**, including the 500 load accounts, and their
competition/organisation data with exact ID-and-email checks. Four remaining
submission/banner uploads were removed through their owners' Storage API sessions
before account deletion. No profile pictures or organisation logos were uploaded.
Final verification: zero test users, competitions, subscriptions, deliveries or
deadline reminders. The original competition and five existing Storage objects
were preserved. Temporary native app registration was uninstalled.

Pages workflow packages only public application files, pins official actions to
immutable commits and limits deployment permissions. `README.md`, `DEPLOYMENT.md`
and the replaced `CHECKS.md` cover maintenance and remaining device review.
Production deployment succeeded for commit `647d789001446d3dd2e7079cc70d43d1def37eb4`:
[Publish Vertex workflow](https://github.com/VertexArena/vertexarena.github.io/actions/runs/36870272200).
The real-CDN Chrome production check passed on `https://vertexarena.github.io`
in 17.5 seconds. Public discovery, direct competition details and refresh,
login return-path refresh, invalid mobile routes, reduced motion, actual font/
icon/GSAP loading and return-home behavior all passed. The production mobile
screenshot was inspected. Manifest and release CSS returned HTTP 200; the worker
served `vertex-static-m21-v1`. SQL and test files returned HTTP 404, confirming
that they were excluded from the deployed artifact. No production test account
or record was created by this final check.
