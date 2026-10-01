# Milestone 20 — installation and push notifications

Completed 1 October 2026. PWA acceptance: **2 passed**. Core desktop/mobile
regression: **19 passed, 1 expected skip**. Previous achievement acceptance:
**1 passed**. A further mobile/offline/update run passed after improving capture
timing. All database fixtures were removed and the existing normal competition
was preserved.

## App and device controls

The manifest has a stable root ID, standalone display, shortcuts and correctly
sized 192/512 px icons. A separate maskable icon preserves the brand logo inside
the safe area. The conversion script retains the original image as its source.

The native installation event drives a dismissible banner. Dismissal lasts for
the browser session. A public `/app` page explains installation and shows device
controls; the notification centre contains the same controls. Installed detection
uses actual standalone display, Safari's installed state or the native
`appinstalled` event. Ordinary browsing never requests notification permission.
Trying to enable before installation gives installation guidance and invokes the
native install proposal when available. Unsupported environments and blocked
permissions have useful explanations.

Participants can enable or turn off the current device and choose announcements,
results, deadlines and assigned meetings. Preferences survive reloads. Unsaved
choices survive notification-triggered renders. Enabling uses the real browser
Push API from a user click. Saving failures unsubscribe the new browser endpoint.
Account changes clear foreign device ownership; logout removes the server row,
unsubscribes the browser and closes displayed notifications.

## Offline and updates

The worker caches only static assets and a self-contained offline welcome page.
It never caches Auth responses, API rows or private files. Navigation is network
first, with the offline page used only after a network failure. Real HTTP 404
responses still reach the existing GitHub Pages recovery mechanism.

An updated worker waits while the app remains open. The update banner asks the
user to save edits before reloading; activation and reload happen only after
**Reload to update**. No Auth token is stored in the service worker. Its private
IndexedDB record contains only the device's current account ID. Incoming payloads
for another account show a generic alert without private text. Alert clicks use
validated same-origin paths and focus or open Vertex.

## Hosted delivery and schema

The connected Supabase app applied immutable migration `018_push_subscriptions`
and corrections `018a`–`018d`. The complete SQL is included in `SCHEMA.sql`.
Corrections add an explicit singleton predicate for PostgREST's update guard,
validate endpoint length outside PostgreSQL's bounded repetition syntax, accept
colons used by real Google push tokens, and skip finalised submission rounds.

Browser subscriptions have own-row SELECT RLS and no direct write grants. Checked
RPCs validate caller identity, origin, endpoint service, key formats and choices.
Endpoint ownership cannot be reassigned. Private settings, delivery jobs and
deadline receipts have deny-all client access. Privileged delivery RPCs are
executable only by `service_role`.

`push-dispatch` is deployed and active. Its custom worker credential and VAPID
private key are encrypted in Vault. The signing pair is generated inside the Edge
Function. Its server role comes from Supabase's runtime; no privileged key or
worker token was copied into the repository or client. The public signing key
has 87 characters and is returned only through the authenticated public-key RPC.

The minute cron job generates authoritative deadline reminders and wakes the
worker with its Vault credential. Announcements, leaderboard publications and
meeting assignments enqueue deliveries from existing authoritative notifications.
One registration reminder is generated per eligible saved deadline; unfinished
round work gets a submission reminder during its final 24 hours. Registered team
members inherit the relevant reminders. Previous unpublished round results never
leak through next-round reminder eligibility. Deadline receipts prevent repeats.

Delivery uses standard encrypted Web Push and VAPID, bounded batches, leases,
retry backoff and terminal failure handling. Expired endpoints are removed after
HTTP 404/410. Read or disabled pending notifications are discarded, and old jobs
are pruned. The endpoint allowlist prevents arbitrary outgoing URLs. Worker
responses never expose credentials, endpoints or private notification text.

## Automated acceptance and evidence

The real local HTTP server and installed Chrome 154 were used. Native Chrome
DevTools PWA commands installed the actual application and launched a real app
window, with Chrome's native display preference set to standalone. CSS display
mode was not spoofed. Browser permission was granted through Playwright's browser
permission control. `PushManager.subscribe()` returned a real Google endpoint.

An organiser published an announcement and judged/finalised/published a round
through the UI. A participant registered, bookmarked a second competition,
changed preferences, disabled and re-enabled the device, then logged out through
the UI. The deployed worker sent announcement, saved-deadline and result pushes;
Google returned HTTP **201**. Chrome's real service-worker notification list
contained the decrypted titles, messages and result route. No push transport or
notification payload was mocked.

Tests also verify install dismissal and fresh-session eligibility, permission
remaining untouched before installation, public direct loads and refreshes,
foreign subscription reads, denied direct writes and server RPCs, rejected
arbitrary endpoints, persistent choices, unsubscribe and logout cleanup, offline
nested navigation and recovery, cache privacy, narrow mobile/dark/reduced motion,
and a missing-Push-API environment. The unsupported feature branch is deliberately
tested by removing that browser API.

A separate local HTTP helper serves the real application and deploys a byte-
different worker to test actual waiting-worker activation and user-controlled
reload. This avoids browser request interception, which does not intercept worker
update downloads. The application's source worker stays unchanged.

Commands:

```text
node node_modules/@playwright/test/cli.js test tests/e2e/milestone-20.spec.js --project=laptop --workers=1 --output=test-results/m20-passed
node node_modules/@playwright/test/cli.js test tests/e2e/milestone-20.spec.js --grep "public mobile" --project=laptop --workers=1 --output=test-results/m20-visual-final
node node_modules/@playwright/test/cli.js test tests/e2e/milestone-1.spec.js --project=laptop --project=narrow-mobile --workers=1 --output=test-results/m20-core
node node_modules/@playwright/test/cli.js test tests/e2e/milestone-19.spec.js --project=laptop --workers=1 --output=test-results/m20-achievements-regression
```

Desktop installed controls, the offline page and light/dark narrow mobile
screenshots were inspected. Font/icon CDNs blocked on this host use the existing
test helper's fallback typography. Some full-page captures place sticky navigation
at the former scroll position; clean top-of-page captures resolve that artifact.
Mobile captures wait for the launch splash to disappear.

Supabase advisors report intentional no-policy RLS on private tables and guarded
authenticated security-definer subscription RPCs. No new unindexed foreign keys
were found. The reminder competition index is retained for cascades despite an
initial unused-index advisory. Earlier unrelated findings remain for release
review.

After cleanup, queries confirmed zero milestone test users/competitions, zero
subscriptions, zero queued deliveries and zero deadline receipts. No profile or
organisation images were uploaded. Exact fixture identities were checked before
deletion; Storage guards prevent orphaned uploads. Reusable account creation now
records secondary browser accounts as well as the primary page.

Native operating-system permission dialogs, alert clicks and physical iPhone
installation could not be automated here. `CHECKS.md` lists those device-specific
reviews; real Chrome installation and push receipt are already verified.
