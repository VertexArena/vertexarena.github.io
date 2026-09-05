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

### Pending Milestone 3 migration

Apply `supabase/migrations/002_organisations_and_membership.sql` once to the
existing project. `SCHEMA.sql` includes the same changes for a clean installation;
do not run that bootstrap on this existing project.

This migration enables organisation accounts at signup, ownership-checked profile
editing, an organisation-logo bucket, and consent-based organiser associations.
Only the organisation management account can send invitations. Invited organisers
can accept or decline within 14 days. Pending invitations are visible only to the
management account and the invitee. Accepted associations are public. Membership
does not grant organisation management or competition permissions.

Run `tests/e2e/milestone-3.spec.js` after applying it. Completion, checklist,
commit, and push remain pending until hosted acceptance and regressions pass.

RLS and Storage policies remain the security boundary; hiding the anon key is not a security control.
