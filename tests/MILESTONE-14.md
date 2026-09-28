# Milestone 14 verification

Scoring criteria, ordering, score entry, totals, incomplete state, editing, search, sorting, and public visibility are implemented through the organiser and public UI. Direct writes to scoring tables are closed; checked Supabase functions validate organiser access, registration identity, marks, and score visibility.

Applied to the existing Vertex Supabase project through the connected app:

- `012_scoring.sql`
- `012a_scoring_identifier.sql` (fixes a PL/pgSQL variable collision found in browser testing)
- `012b_scoring_foreign_key_indexes.sql` (covers two foreign keys identified by the performance advisor)

`SCHEMA.sql` includes all three in order. A schema query verified three scoring tables, three RLS policies, and the scoring functions. Security advisor findings include the intentional checked public score function and older existing findings.

Playwright served Vertex through the local HTTP server and used Chromium with the hosted project. Final command:

`node node_modules/@playwright/test/cli.js test tests/e2e/milestone-14.spec.js --project=laptop --workers=1`

Passed on 28 September 2026. Test covered individual and team registration, organiser criteria creation/edit/reordering, complete and incomplete scores, totals, limits, score edits, sorting/search, public visibility from the competition page, participant write denial, private table reads, direct route refresh, and desktop/320 px views. Organiser desktop/mobile and public mobile screenshots were inspected. Foundation route/theme regression also passed: 10 tests in `milestone-1.spec.js`.

All test fixtures were removed through the connected Supabase app after testing. Final verification returned zero `vertex-e2e-m14-%@example.com` Auth users, zero `Vertex M14 %` competitions, and zero matching scores. No profile pictures, logos, or submission files were uploaded.
