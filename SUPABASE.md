# Supabase project settings

Vertex uses the existing hosted Supabase project configured in `config.js`.

## Authentication

Configure these hosted dashboard settings manually because SQL migrations cannot enforce them:

- Provider: Email enabled.
- Password authentication: enabled.
- Confirm email: disabled.
- OAuth providers: disabled unless a later specification explicitly adds one.
- Magic links are not used by the Vertex client.

Signup must return an active session immediately. If it does not, verify **Confirm email** remains disabled before changing application code.

## Browser credentials

`config.js` contains only:

- public Supabase project URL;
- legacy public anon key.

Never add service-role keys, database passwords, JWT signing secrets, or management tokens to browser files.

## Database installation

- Existing project history: apply immutable files in `supabase/migrations/` in numeric order.
- Clean project bootstrap: apply `SCHEMA.sql` once, then configure Authentication settings above.

### Applied CHANGES.md prerequisite

`supabase/migrations/001a_profile_search_suggestions.sql` was applied to the existing
project after migration 001 and verified through desktop/mobile UI tests. It adds typo-tolerant People suggestions and an
indexed full-name search field. It preserves public-profile visibility and
excludes birthdays. Do not rerun `SCHEMA.sql` on the existing project.

Reusable acceptance: `tests/e2e/search-migration.spec.js` against the hosted project.

### Applied Milestone 3 migration

`supabase/migrations/002_organisations_and_membership.sql` has been applied to the
existing project and verified using the relevant account roles. `SCHEMA.sql` includes the same changes for a clean installation;
do not run that bootstrap on this existing project.

This migration enables organisation accounts at signup, ownership-checked profile
editing, an organisation-logo bucket, and consent-based organiser associations.
Only the organisation management account can send invitations. Invited organisers
can accept or decline within 14 days. Pending invitations are visible only to the
management account and the invitee. Accepted associations are public. Membership
does not grant organisation management or competition permissions.

The organisation identity correction uses this existing schema and requires no
additional migration. Organisation signup creates the authentication account;
the organisation editor collects its public name, slug, and logo once. The header,
organisation-directory results, and public organisation page use that same organisation record.
Older personal-profile URLs for organisation accounts redirect to the organisation.

Run `tests/e2e/milestone-3.spec.js` and `tests/e2e/organisation-identity.spec.js`
for membership acceptance and unified-identity regression coverage.

### Test data cleanup

Test signup responses record only account IDs, test emails, and creation times in
the ignored `.test-data/accounts.ndjson` file. No passwords or access tokens are
written to that manifest. Use the connected Supabase connector for verified cleanup after each run.
Delete uploaded objects in `profile-pictures` and `organisation-logos` through
Storage before removing related memberships, organisations, and Auth users.
Never delete Storage metadata directly in SQL; that does not remove stored files.
Routine tests use default profile and organisation images. Identity upload tests run only after explicit permission, with VERTEX_TEST_IDENTITY_UPLOADS=1. Competition banner tests are part of Milestone 4 acceptance.

Run node tests/cleanup-test-banners.mjs to remove remaining Milestone 4 test banners through their owners’ Storage sessions, including interrupted runs. Then delete only manifest-verified test competitions, memberships, organisations and Auth users through the Supabase connector. Preserve normal application accounts.

RLS and Storage policies remain the security boundary; hiding the anon key is not a security control.

## Applied Milestone 4 migrations

Applied through the connected Supabase app to Vertex (hbadiyiopvypeffaigmc):

- 002a_directory_suggestions.sql: separate People/organisation search and organiser-only suggestions.
- 003_competitions_rounds_and_timelines.sql: competition and round tables, atomic authoring RPC, RLS, private banner bucket.
- 003a_competition_conflict_and_date_guards.sql: immediate HTTP 409 edit conflicts, finite timestamps, trigger execute restriction.
- 003b_competition_banner_reference_policies.sql: explicit Storage object references for publication and safe deletion.

No manual migration is needed on the existing project. SCHEMA.sql is the complete clean-install bootstrap, restored from immutable history; never rerun it on this project.

Published participation rules, organisation, stable addresses and timeline are fixed. Descriptive fields and banners remain editable. Competition and round writes use an owner-checked atomic RPC; direct table writes are denied. Draft banner URLs require owner access; published references permit signed public reads. File replacement uploads a new path and removes the old object only after saving succeeds.

### Existing security-advisor findings

The public_profiles view intentionally exposes only completed public profile fields, never birthdays; its definer access supports public profiles while the underlying table remains owner-only. See [view guidance](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view). Organisation mutation RPCs and save_competition deliberately use privileged atomic transactions with explicit persisted-role/ownership checks and restricted execute grants. See [RPC guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Hosted leaked-password protection remains disabled; this is an existing Auth configuration, separate from migration state. See [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Applied Milestone 5 and 6 migrations

`004_discovery_and_bookmarks.sql` and `005_individual_registration.sql` were applied
through the connected Supabase app to the existing Vertex project. `SCHEMA.sql`
includes both for clean installation. Do not rerun that bootstrap on this project.

Milestone 6 creates private registration and notification tables. Direct table
writes are denied. The authenticated `register_individual` RPC checks the stored
participant role, completed profile and birthday, published competition, team
mode, opening and closing timestamps, age limits, category, and duplicate entry.
It creates the registration and confirmation notification atomically. The RPC
is a deliberate security-definer function with a fixed search path and restricted
execute grant, so the existing security-advisor definer-function warning also
applies to it.

## Applied Milestone 7 migrations

`006_competition_teams.sql` (remote version `20260923072032`) and the immutable
foreign-key index follow-up `006a_team_foreign_key_indexes.sql` (remote version
`20260923073302`) were applied through the connected Supabase app to the
existing Vertex project. Both are included in `SCHEMA.sql` for clean installs.

Team, membership, and invitation rows have RLS. Direct client writes are denied.
Authenticated RPCs enforce participant identity, captain control, age and
registration windows, team capacity, category, one active entry per participant,
and locked registered rosters. The organiser roster RPC checks competition
ownership and pages teams and individuals. Notifications and team state are in
Realtime. The new security-definer RPCs have fixed search paths, restricted
execute grants, and explicit role and ownership checks; the security advisor
flags this intentional RPC pattern. The advisor's remaining public-profile view,
profile search, and hosted password-protection findings predate Milestone 7.

## Applied Milestone 8 migration

`006b_dashboard_summary.sql` (remote version `20260923124703`) was applied through
the connected Supabase app to the existing Vertex project. It is included in
`SCHEMA.sql` for clean installations; do not rerun the bootstrap on this project.

The authenticated `organiser_dashboard_summary` RPC returns counts and recent
activity for competitions owned by the calling organiser. It checks the stored
organiser role and scopes every query by `auth.uid()`. The fixed search path and
restricted execute grant protect this security-definer RPC; the security advisor
flags the intentional pattern. Anonymous and participant callers cannot execute it.

## Applied Milestone 9 migrations

`007_competition_organisers.sql` (remote version `20260924131451`) and
`007a_competition_organiser_inviter_index.sql` (remote version
`20260924132605`) were applied through the connected Supabase app to the
existing Vertex project. Both are included in `SCHEMA.sql` for clean installs;
do not rerun that bootstrap on this project.

The original `competitions.owner_id` remains permanent. Owners invite
completed organiser accounts; invitees accept or decline within 14 days.
Accepted managers can edit competition details and view workspace and roster.
The organiser dashboard summary now includes accepted manager competitions.
Only owners can invite or remove other managers. Managers may leave. Direct
membership and invitation writes remain denied; RLS scopes reads. The checked
security-definer RPCs are executable only by authenticated users, never anon.
The advisor flags this intentional pattern; the inviter foreign-key index
addresses the new performance finding. Existing advisor findings are unchanged.

## Applied Milestone 10 migration

`008_announcements_and_notifications.sql` (remote version `20260924133839`)
was applied through the connected Supabase app to the existing Vertex project
and included in `SCHEMA.sql` for clean installs.

Announcements are private to confirmed participants and the organiser team.
Direct client writes are denied. Checked authenticated RPCs publish, edit,
delete, and mark notifications read. Publication fans out one notification per
registered participant, including registered team members. Announcement edits
update notification text; deletion removes related notifications. The
announcements table is in the Realtime publication; notifications were already
published. The security advisor flags the intended authenticated
security-definer RPC access; each endpoint validates caller identity and scope.

## Applied Milestone 11 migration

`009_competition_qa.sql` (remote version `20260925115754`) was applied through
the connected Supabase app to the existing Vertex project and included in
`SCHEMA.sql` for clean installs.

Registered participants can post competition questions. Organisers can reply,
edit their own replies, and resolve or reopen questions. Question and reply
tables use RLS, deny direct client writes, and participate in Realtime.
Checked authenticated RPCs create organiser and participant notifications
with question deep links. The security advisor flags the intended authenticated
security-definer RPC access; each endpoint checks persisted role and scope.

## Applied Milestone 12 migration

`010_competition_meetings.sql` (remote version `20260925122345`) was applied
through the connected Supabase app to the existing Vertex project and included
in `SCHEMA.sql` for clean installs. Meetings have case-insensitively unique
names within a competition, stable slugs, random Jitsi room names, registered
participant and team assignments, and assignment notifications. RLS exposes a
meeting and its room name only to its organisers or assigned registered people.
Direct client writes to meeting and assignment tables are denied; the checked
organiser RPC creates them together. The new table is in Realtime. The security
advisor reports the intended authenticated security-definer RPCs, alongside
the pre-existing public-profile view and public search function advisories.

## Applied Milestone 13 migrations

`011_round_submissions.sql` (remote version `20260925125201`) and the immutable
Storage upload metadata correction `011a_submission_upload_metadata_phase.sql`
(remote version `20260925131258`) were applied through the connected Supabase
app and included in `SCHEMA.sql` for clean installs. The follow-up
`011b_submission_config_editor_index.sql` (remote version `20260925132033`)
adds the index requested by the performance advisor for the submission config
editor foreign key. The follow-up advisor check shows no new unindexed foreign
keys in the Milestone 13 tables.

Round submission rules, entries, files, and links use RLS. Direct client writes
are denied. Checked authenticated RPCs configure each round, save or replace
work atomically, and page the organiser's review roster. Private Storage paths
belong to a registered individual or team captain. The bucket has a 25 MB hard
limit; the final submission RPC checks the stored file size and MIME type
against the round settings. Storage initially inserts an object row before its
size and MIME metadata are final, so the upload policy permits absent metadata
during that phase and the RPC performs final validation. File reads require
ownership or a recorded submission accessible to an organiser or team member.
Submission confirmations use the existing notification system.

## Applied Milestone 20 migrations and worker

`018_push_subscriptions` and immutable corrections `018a`–`018d` were applied
through the connected Supabase app. `SCHEMA.sql` includes all of them. Corrections
cover PostgREST's explicit update predicate, PostgreSQL regex bounds, Google push
token paths and finalised-round reminders. The existing Vertex project has an
active `push-dispatch` Edge Function and `vertex-push-delivery` minute cron job.

Subscriptions use own-row read RLS and guarded mutation RPCs. Settings, delivery
jobs and deadline receipts are private. The worker token and VAPID private key
are stored in Vault; neither belongs in `config.js`, Git, browser storage or an
automation prompt. The Edge Function reads its server-role key from Supabase's
runtime. Its `verify_jwt = false` configuration is intentional: it checks the
custom Vault worker credential before calling any delivery operation. Public
anon keys and ordinary Auth JWTs cannot invoke the worker.

For a clean installation, deploy `supabase/functions/push-dispatch/index.ts`
through the connected Supabase app after applying `SCHEMA.sql`. Configure the
private singleton's `worker_url` with that project's
`https://PROJECT_REF.supabase.co/functions/v1/push-dispatch` URL using an
administrative connector query. The next cron run initialises the signing keys
inside the Edge runtime. Verify an HTTP 200 worker response, a non-null public
signing key and the active cron job. Do not retrieve or print Vault secrets.

The subscription origin allowlist includes `https://vertexarena.github.io` and
the repository's localhost HTTP test origins on port 4173. A different production
origin requires a reviewed migration. The worker permits only supported browser
push service hosts. Delivery status, bounded retries and expired subscriptions
are maintained in the private queue. No generated private certificate or
submission files are added to the offline cache.

Actual Chrome installation, browser subscription and announcement/result/deadline
delivery passed against this project. Google returned HTTP 201 and the browser
displayed decrypted notifications. Evidence: `tests/MILESTONE-20.md`.
