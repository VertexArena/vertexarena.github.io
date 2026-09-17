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
People results, and public organisation page use that same organisation record.
Older personal-profile URLs for organisation accounts redirect to the organisation.

Run `tests/e2e/milestone-3.spec.js` and `tests/e2e/organisation-identity.spec.js`
for membership acceptance and unified-identity regression coverage.

### Test data cleanup

Test signup responses record only account IDs, test emails, and creation times in
the ignored `.test-data/accounts.ndjson` file. No passwords or access tokens are
written to that manifest. This run uses the user's explicit manual-cleanup choice.
Delete uploaded objects in `profile-pictures` and `organisation-logos` through
Storage before removing related memberships, organisations, and Auth users.
Never delete Storage metadata directly in SQL; that does not remove stored files.
Future runs must arrange authorised admin/connector cleanup before creating data.

RLS and Storage policies remain the security boundary; hiding the anon key is not a security control.
