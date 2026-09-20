# Milestone 4 verification — 20 September 2026

## Implemented

CHANGES.md prerequisites: organiser invitation suggestions, separate People search,
and searchable organisation directory. Milestone 4: five-step competition editor,
all competition metadata, draft save/reopen, review/publish, safe descriptive edits,
stable addresses, direct top 3/top X, three-round preset and custom rounds,
chronological validation, age/team/category rules, organisation association,
private image banners plus colour/gradient banners, public details and organiser
competition list. Prize distribution displays Coming Soon as specified.
Milestone 5 functionality has not been started.

## Acceptance evidence

| Roadmap criterion | Verified behavior |
| --- | --- |
| 1 | Organiser signup/session and editor entry through the actual UI |
| 2 | Individual competition with direct top 3, published |
| 3 | Team competition with top 100, top 30, top 3, published |
| 4–5 | Team size bounds and categories persist |
| 6 | Registration, competition, round, judging and results timestamps persist |
| 7–8 | Real image upload, private draft access, public published access, colour and gradient banners |
| 9–10 | Save draft, leave editor, reopen, refresh and publish |
| 11 | Signed-out public route, refresh and catalogue link |
| 12 | Published name edit succeeds; rule/round changes are rejected |
| 13 | Bad chronology, invalid ages, duplicate address and infinite dates rejected |
| 14 | Participant, organisation and unrelated organiser writes rejected; anonymous editor redirects |

Additional checks: custom add/remove/reorder, direct top X, Both participation,
accepted organisation association, organisation competition cards, HTTP error and
retry, optimistic edit conflicts, direct table write rejection, cross-owner Storage
upload rejection, banner replacement cleanup, light/dark/reduced-motion layouts.

## Tests and regressions

- Combined milestone 1–4 plus directory and extended suite: **42 passed, 2 intentional skips**.
- Remaining identity, typo-search and branding suite: **14 passed**.
- Final unsaved-state/live-path/stale-search follow-up: **4 passed**.
- Skips are the desktop header check and duplicate desktop security probe on mobile.
- Actual Chromium, local HTTP server and existing hosted Supabase; desktop 1366×768
  and mobile 390×844. Screenshots inspected for editor, timeline, public page,
  directory and dark theme. Identity upload tests use default images unless separately authorised.
- JavaScript syntax checks and git diff whitespace checks passed.
- Regressions include profile privacy, signup/login/logout, persistence, membership
  accept/decline/leave/reinvite, organisation identity, direct routes, refresh,
  404, navigation races, network retry, keyboard access, themes and search.

## Database and cleanup

Applied through the connected Supabase app to Vertex:
002a_directory_suggestions.sql, 003_competitions_rounds_and_timelines.sql,
003a_competition_conflict_and_date_guards.sql and
003b_competition_banner_reference_policies.sql. No manual migration remains.
SCHEMA.sql contains the complete clean-install bootstrap; earlier applied files
remain unchanged. The bootstrap was reconstructed from immutable history to repair
pre-existing malformed SQL. It was not run against the existing project.

New tables have RLS; write RPC verifies persisted organiser role, ownership and
accepted association. Public reads exclude drafts. Storage checks use actual owner
sessions and anonymous requests. Existing advisor findings and their security
rationale are recorded in SUPABASE.md. No milestone blocker remains.

Test accounts are recorded without passwords/tokens in the ignored manifest.
Storage files are removed through the Storage API before connector account cleanup.
Normal accounts and their files are preserved. Cleanup counts are recorded in the
local .test-data/CLEANUP.md audit and ROADMAP.md.

## Files created

- css/milestone-4.css
- js/competition-model.js
- js/competitions.js
- supabase/migrations/002a_directory_suggestions.sql
- supabase/migrations/003_competitions_rounds_and_timelines.sql
- supabase/migrations/003a_competition_conflict_and_date_guards.sql
- supabase/migrations/003b_competition_banner_reference_policies.sql
- tests/cleanup-test-banners.mjs
- tests/e2e/directory-search.spec.js
- tests/e2e/milestone-4.spec.js
- tests/e2e/competition-extended.spec.js
- tests/MILESTONE-4.md

## Files updated

AGENTS.md, CHANGES.md, CHECKS.md, DESIGN.md, ROADMAP.md, SCHEMA.sql, SUPABASE.md,
css/milestone-3.css, index.html, js/app.js, js/organisations.js,
tests/e2e/helpers/test.js, tests/e2e/milestone-2.spec.js,
tests/e2e/milestone-3.spec.js and tests/e2e/organisation-identity.spec.js.

CHECKS.md is the replacement human visual-review checklist.
