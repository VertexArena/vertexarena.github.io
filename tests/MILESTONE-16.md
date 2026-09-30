# Milestone 16 acceptance

Completed 30 September 2026. Migrations `014_leaderboards.sql`,
`014a_leaderboard_category_candidates.sql`, and
`014b_published_competition_edits.sql` were applied to the existing Vertex
Supabase project through the connected app and consolidated into `SCHEMA.sql`.

`tests/e2e/milestone-16.spec.js` passed in Chromium through the local HTTP
server. It covered organiser preview, participant and team search, podium,
category winner choices, hidden and visible scores, scheduled countdowns,
automatic publication, live updates without reloading, participant and team
outcomes, notification deep links, second-round publication, previous-round
routes, direct loads, refreshes, and organiser access denial. A published
competition remained editable for descriptive changes after results release.
The participant result was also captured at 320 px with no horizontal overflow.

`tests/e2e/milestone-16-load.spec.js` passed against a temporary 500-entry
fixture created through the Supabase connector. It verified 25-row pagination,
20 pages, page-two ranks, search for rank 500, refresh, and desktop/mobile
screenshots. This on-demand test uses `M16_LOAD_SLUG` for an existing temporary
fixture; it skips when that environment variable is absent. The fixture and its
500 accounts were deleted after testing.

The organiser preview, public countdown, and 320 px load-result screenshots
were inspected for hierarchy, readable names, usable controls, and overflow.
`tests/e2e/milestone-15.spec.js` passed after its expectations were updated for
release-gated participant outcomes. Finalisation still preserves the advanced
organiser roster, while participants wait for publication before seeing their
outcome or accessing the next round.

Core route, keyboard, reduced-motion, and theme regressions passed on laptop
and narrow mobile: 21 passed and one desktop-only test skipped. This includes
`tests/e2e/theme-titlebar.spec.js`, which verifies the CHANGES.md fix: title-bar
metadata follows the selected theme, persists across refresh and direct routes,
and overrides a conflicting system preference. The manifest launch colour
matches the light background. Native installed-window chrome cannot be
visually asserted in these browser tests; its light/dark toggle and reopen
check is listed in `CHECKS.md`. The mechanism follows the browser's
[theme-colour metadata guidance](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/icon-theme-color).

The minute-based publication cron is active and has no failed runs. Due public
page reads also publish immediately, so an open countdown becomes a result at
release time. Supabase security and performance advisors were checked. New
RPC warnings describe intentional, permission-checked security-definer APIs;
the pre-existing `public_profiles` view warning and older performance notices
remain. Advisor references:
[public RPCs](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[authenticated RPCs](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[existing view](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

All accounts and competition records created for the Milestone 16 acceptance
runs, the load fixture, and the Milestone 15 regression were deleted through
the connector and verified absent. No profile pictures or organisation logos
were uploaded.
