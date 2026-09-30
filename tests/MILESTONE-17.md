# Milestone 17 acceptance

Completed 30 September 2026. The connected Supabase app applied
`015_certificates.sql`, `015a_certificate_round_eligibility.sql`,
`015b_certificate_storage_policies.sql`, and
`015c_certificate_storage_guards.sql` to the existing Vertex project.
All four migrations are consolidated in `SCHEMA.sql`.

## Browser verification

The reusable acceptance test `tests/e2e/milestone-17.spec.js` passed in Chromium
against the local HTTP server and hosted Supabase project. It creates its own
organiser, individual participants, team captain/member, and outsider accounts.
It checks:

- Participation, winner, and category-winner image uploads.
- All nine dynamic field sources, sample name/category/placement previews,
  pointer dragging, corner resizing, arrow-key positioning, fonts, weight,
  colour, alignment, and numerical field dimensions.
- Ready-state validation, saved metadata, direct editor loads, refreshes,
  unsaved-change cancellation, saved artwork replacement, and discarded artwork
  cleanup.
- Final result publication before release, eligible participant and team-member
  awards, release/pause states, live pause updates, notification deep links,
  dashboard award links, and protected-route login return.
- Invalid layout rejection, participant mutation denial, outsider template and
  file denial, ineligible award denial, outsider upload denial, immutable
  template images, and protection of referenced artwork from direct deletion.
- Authoritative full names, category, rank, round, team identity, and issue dates.
- Preview, PNG, and PDF downloads. The PNG is checked at 1200 × 850 pixels;
  the PDF is parsed with the pinned development dependency and checked for one
  900 × 637.5 point page. Both use the same canvas renderer, with the PDF
  embedding its PNG output to preserve placement, fonts, and Unicode text.
- Recursive Storage listings remain identical across generated downloads;
  generated certificates are never uploaded.
- Desktop and 320 px mobile layouts without horizontal overflow. Screenshot
  capture waits for the startup splash to disappear. Artwork, editor controls,
  participant cards, and generated certificate images were visually inspected.

The Milestone 16 acceptance test also passed: category awards, scheduled and
immediate publication, historical leaderboards, participant/team outcomes,
notifications, direct loads, refreshes, and mobile results remain functional.
The installed-title-bar metadata regression passed after the certificate
integration.

Commands used:

```text
npx playwright test tests/e2e/milestone-17.spec.js tests/e2e/milestone-16.spec.js tests/e2e/theme-titlebar.spec.js --project=laptop --workers=1
npx playwright test tests/e2e/milestone-17.spec.js --project=laptop --workers=1 --output=test-results/m17-final
```

## Permissions and implementation

Templates and release settings have RLS. Direct writes are revoked; guarded
RPCs validate management rights, optimistic versions, fields, dimensions,
template readiness, result publication, and authoritative eligibility.
Participant requests accept a template ID, never a participant identity or
client-provided entitlement. Round-specific awards require saved published
results for that round. Team awards use saved member eligibility.

The private `certificate-templates` bucket accepts PNG/JPEG/WebP up to 10 MB.
Paths identify competition, template, and immutable upload. Restrictive
certificate policies were required because the hosted project contains legacy
owner policies. They enforce the certificate rules even when another
permissive policy grants owner access. Template replacement/deletion and test
cleanup remove artwork through the Storage API.

Supabase security and performance advisors were reviewed. New authenticated
security-definer notices describe intentional, permission-checked RPCs; no
certificate table is exposed without RLS. The previously documented public
profile view warning and older performance notices remain. References:
[authenticated RPC notices](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[existing view notice](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

The editor and canvas renderer load only on certificate routes or actions.
The browser [PDF library](https://pdf-lib.js.org/) is pinned to 1.17.1 and loads
only when PDF generation is requested. Its development dependency supports
reproducible browser interception and output verification without adding a
production build step.

## Cleanup and manual review

All certificate test artwork was removed through authenticated Storage API
calls. Acceptance/regression competition records and accounts were deleted
through the connector. Follow-up queries confirmed zero matching accounts,
competitions, and certificate artwork. No profile pictures or organisation
logos were uploaded.

`CHECKS.md` contains manual artwork, typography, device download, and print
review steps. Those checks use the user's own artwork and real award data.
