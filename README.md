# Vertex

Vertex is a vanilla HTML, CSS and JavaScript platform for student competitions.
Participants enter individually or with competition-specific teams. Organisers
manage rounds, communication, meetings, submissions, judging, published results
and dynamic certificates. Organisation accounts maintain public containers and
organiser associations.

## Run locally

1. Install Node.js 20.20 or newer.
2. Run `npm ci`.
3. Run `npm run serve` and open `http://127.0.0.1:4173`.

`config.js` contains the existing project's public Supabase URL and legacy anon
key. Database permissions protect data; this browser key is intentionally public.
There is no frontend framework or build step. The local server is a development
utility, not a production backend.

## Architecture

- `index.html`, `404.html`: static application boot and History API recovery.
- `js/app.js`: shared shell, authentication, routing and lifecycle management.
- Other `js/` modules: domain controllers and reusable render helpers.
- `css/`: shared tokens and feature styles; release accessibility refinements.
- `manifest.webmanifest`, `service-worker.js`, `offline.html`: installed app,
  updates, private device notifications and offline recovery.
- `SCHEMA.sql`: complete bootstrap for a clean Supabase installation.
- `supabase/migrations/`: immutable, chronological schema history.
- `supabase/functions/push-dispatch/`: encrypted Web Push delivery worker.
- `SUPABASE.md`: hosted Auth, Storage, Realtime and worker configuration.
- `DEPLOYMENT.md`: GitHub Pages release and recovery.
- `tests/e2e/`: reusable browser acceptance tests; `tests/MILESTONE-*.md`: evidence.

Certificate editor, renderer and PDF library load when needed. Three.js loads
only for the custom 404. Realtime channels follow the active page and account.
Lists use indexed queries and pagination, including 500-entry leaderboards and
organiser rosters. Generated certificates are downloaded rather than stored as
duplicate permanent files.

## Validate

```sh
node scripts/validate-release.mjs
node node_modules/@playwright/test/cli.js test --project=laptop --workers=1
```

Install Playwright's Chromium engine first using `npx playwright install chromium`.
Native PWA acceptance also uses installed Google Chrome. Tests create identifiable
development accounts in the configured Supabase project. Do not run tests against
an unrelated project. Recommendation tests require an isolated test catalogue:
run them after other suites' fixtures have been cleaned up.

Record cleanup IDs in the ignored `.test-data/` manifests. Delete uploads through
Storage's API before deleting their exact matching test accounts and competitions
through the connected Supabase app. Never delete Storage object rows with SQL.
No routine test uploads profile pictures or organisation logos. See each milestone
evidence document for its fixture and cleanup requirements.

## Product scope

`AGENTS.md` and `ROADMAP.md` define the product. Prize distribution deliberately
shows **Coming Soon**, as specified; prize information is implemented. Native
camera, microphone, operating-system notification presentation and physical iOS
installation need the manual checks in `CHECKS.md`.

The user waived Milestone 21's fresh Supabase project validation. Consolidated
migrations are checked against `SCHEMA.sql`, and regression tests use the existing
Vertex project. A new-project bootstrap has not been certified by that review.
