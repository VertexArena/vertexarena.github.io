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
