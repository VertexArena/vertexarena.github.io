# Milestone 15 acceptance

Migration `013_round_advancement.sql` was applied to the connected Vertex Supabase project on 28 September 2026 and consolidated into `SCHEMA.sql`.

`tests/e2e/milestone-15.spec.js` passed in desktop Chromium through the local HTTP server. It covered:

- provisional top 3 without a boundary tie;
- equal scores away from the cutoff left unhighlighted;
- exact third/fourth place boundary highlighting;
- include-all, exclude-all, unresolved, and manual selection through organiser controls;
- finalisation and publication blocked while unresolved;
- locked final outcome and advanced-only second-round roster;
- team member eligibility and eliminated participant denial;
- direct route load, refresh, role isolation, participant history, and 320 px visual capture.

Screenshots `m15-no-tie-desktop.png`, `m15-tie-decision-desktop.png`, and `m15-tie-decision-mobile.png` were inspected. Mobile had no horizontal overflow. Milestone 1 core regression passed: 19 tests passed across laptop and narrow-mobile projects; one desktop-only test skipped on mobile.

Supabase security and performance advisors were checked. New security-definer warnings refer to intentionally exposed, role-checked RPCs. Existing `public_profiles` view warning and unrelated older performance notices remain outside this milestone. All M15 test accounts, competitions, and result records were deleted and verified absent.
