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

RLS and Storage policies remain the security boundary; hiding the anon key is not a security control.
