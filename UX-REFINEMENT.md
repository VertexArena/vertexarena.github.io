# Human-centred refinement, 10 October 2026

## Direction and scope

Reading this as a competition workspace for students, organisers and school
organisations, in Vertex's existing Swiss visual language. ENERGY 1, RHYTHM 2,
MOTION 1. Apply antislop during implementation, as selected by the user.

Preserve the mandated blue/light/dark palette, Geist and Geist Mono, 12–18 px
surfaces, vanilla JavaScript, clean routes and Supabase permission boundaries.
Premium frontend guidance supplies careful hierarchy and compositor-friendly
interaction, not additional ornament or scroll hijacking. No new visual assets,
framework, dependency or fabricated product data were introduced.

## Audit and decisions

| Area | Finding and implemented response |
| --- | --- |
| Public pages and authentication | Keep readable text throughout entrances, add linked validation summaries and visible focus, preserve keyboard/password-manager support. |
| Discovery and recommendations | Shared cards show real lifecycle state. Their main link covers the card; bookmarks and previews remain separate controls. Results/countdown actions replace stale registration emphasis. |
| Competition details | A status panel explains the current phase and next action. Closed registration does not advertise a new entry; participants can still review existing registration/team pages. |
| Participant dashboard | Use real final publication to identify completed competitions. Preserve upcoming/active/history groups; show specific lifecycle labels and explanatory next state. |
| Organiser dashboard | Competition names open the workspace, where operational actions live. Draft, active and waiting-result states remain distinguishable. |
| Competition management | Consistent section navigation makes entries, submissions, judging, results and certificates discoverable without repeated dashboard visits. Existing safe edit/publish rules and owner/manager permissions remain. |
| Profiles and organisations | Label text and help text are separated for assistive technology. Profile and organisation edits warn before navigation/refresh/logout loses unsaved work. Organisations remain profile/association containers. |
| Teams, announcements and Q&A | Shared target sizes, link feedback and validation apply. Unsent announcement/question/reply text is protected from accidental navigation or automatic refresh. Existing invitation and membership rules remain. |
| Meetings | Distinguish upcoming meetings from a passed scheduled start, without falsely claiming a meeting has ended or blocking re-entry. Assignment checks still happen before Jitsi. |
| Notifications and preferences | Unread state has an explicit word instead of a colour-only dot. Controls retain real read actions and installed-app-only push rules. |
| Submissions | Common file types have named checkboxes. Advanced custom MIME types remain available and synchronized with the existing authoritative configuration. No upload limits or Storage rules change. |
| Scoring, advancement and results | Shared navigation, stronger selected/neutral/warning contrast, larger criterion actions, and protection for unfinished marks/publication forms. Finalisation still locks authoritative results. |
| Certificates | Shared controls/navigation reach the studio and participant awards. Existing artwork, eligibility, editor and release safeguards remain. No template was uploaded for this audit. |
| Mobile/PWA/offline/404 | Drawer manages focus, Escape and resizing. Mobile input text avoids automatic zoom; touch targets and safe-area clearance improve. Reduced motion and forced colours remain supported. Worker shell version advances for the changed assets. |

Major visual reasons:

- Blue remains the identity and action accent; stronger ink is for legibility.
- Lifecycle labels communicate authoritative state and never rely only on colour.
- The fixed section order follows competition work: overview, entries, work,
  judging, results, recognition.
- Cards remain for browsable competitions; their hover now matches a real link.
- Control borders and focus rings meet the 3:1 non-text threshold in both themes.
- Named file types reduce organiser terminology burden; advanced control preserves
  functionality instead of replacing it with a restricted list.
- Motion uses small translations, with readable text and reduced-motion support.

## Safe draft deletion implemented

Supabase access was restored by selecting the named Vertex account link. The
earlier `Unknown tool` report came from the wrong connector link identifier.
Both `safe_draft_deletion` and `serialize_banner_cleanup` were applied through
the connected app to the existing Vertex project. Their immutable CLI-generated
files are consolidated in SCHEMA.sql; no earlier migration was edited.

The owner finds Delete draft below the saved competition editor. The native
dialog explains permanent loss, requires the exact saved name and warns about
unsaved edits. Keep draft and Escape restore focus without losing those edits.
Loading blocks duplicate actions; a connection failure preserves the dialog,
explains that the draft remains, and offers retry or cancellation.
If the final request loses its response, the outcome is explicitly unconfirmed;
Check deletion verifies the signed-in owner and retained row before retrying.

SQL locks and rechecks the owner, organiser role, draft/publication state, version,
confirmation name and all retained collaboration/entry/activity/result/certificate
records. Published competitions display a retention explanation instead of Delete.
Shared drafts and drafts with history are rejected. Direct table DELETE remains
ungranted. Public endpoints are SECURITY INVOKER; elevation stays in guarded
private functions with explicit execute grants and fixed search paths.

Preparation detaches referenced banner artwork and updates the saved version.
The browser removes unused banners through Storage API, in bounded batches. Final
deletion refuses remaining artwork. A failed cleanup leaves the draft recoverable,
possibly with a solid-colour banner, and retries scan remaining paths again.
Save, upload, cleanup and deletion use the same competition lock. Private retired
IDs prevent late uploads or stale first-save requests from recreating deleted
drafts. Manager banner read/delete policies also repair legacy outer-column
qualification errors without granting access to another competition's artwork.

Published competitions retain stable records, results and certificates.
Cancellation/archive/duplication require separate lifecycle rules and are not
indiscriminately introduced by this refinement.

### Follow-up verification

- Chrome confirmation audit: desktop, 390 px dark and 320 px light screenshots,
  exact-name gating, keyboard focus, Escape, cancellation, refresh and unchanged
  unsaved title; zero Axe findings and no requests that mutate existing records.
- Transport failure was deliberately injected before the RPC reached Supabase.
  Error focus, retained confirmation, retry and cancellation passed. No live
  competition was deleted to test failure handling.
- Final browser regression: four tests passed in 44.9 seconds, covering draft
  management, public controls/lifecycle, organiser navigation and file-type settings.
  Final draft-only rerun passed in 22.1 seconds, including error-state Axe checks
  and the phone input-size correction.
  Dialog and connection-error screenshots were inspected for layout and readability.
- `tests/sql/draft-deletion.sql` passed on Vertex using actual authenticated/anon
  roles and existing authorised profiles. Owner deletion, participant/organisation/
  manager/anonymous denials, direct DELETE denial, history/publication/version
  protection, banner detachment, reference cleanup guards, configuration cascades
  and deleted-ID upload/recreation denial all passed. Fixtures were rolled back.
  The manager fixture tests permission boundaries, not the creation wizard.
- Baseline retained: Sustainability Hackathon version 1, Socratic Marathon version
  4, two competitions, five Storage objects, zero fixture rows or retired fixture
  IDs. No accounts, images, logos or permanent test records were created.
- Syntax, diff and release checks passed; all 41 migrations are consolidated.

Live Storage upload/removal and a successful destructive browser flow were not
repeated, following the user's visual-audit/existing-account instruction. SQL
transaction checks verify successful deletion separately. No simultaneous-tab
race test or fresh Supabase project was run. Remaining physical-device and optional
disposable-draft review steps are in CHECKS.md.

Security/performance advisors were reviewed after migration. New private retired
IDs intentionally have RLS with no client policy or table grant, giving default
denial. Existing public-profile view and role-checked public RPC notices remain;
leaked-password protection remains a hosted Auth setting. No new public definer
endpoint or performance warning was introduced. See [view guidance](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view),
[RPC guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Original frontend verification record

Use real Chrome and the local HTTP server. `VERTEX_BROWSER_CHANNEL=chrome` selects
the installed engine when downloaded Playwright browsers are unavailable.
`VERTEX_AUDIT_PASSWORD` is supplied only at run time. Existing user-authorized
accounts are used, with application mutation requests blocked. No test accounts,
competition records, profile photos or organisation logos are created.

Verification passed:

- Public route suite: real CDN boot, both themes, keyboard, tablet and 320 px
  reflow, reduced motion, direct routes and 404 recovery. Final run: 36.5 seconds.
- Existing organiser: 75 route/theme/phone captures and Axe audits; passed.
- Existing participant: 42 route/theme/phone captures and Axe audits; passed.
- Existing organisation: 39 captures/audits; the initial suggestion-group ARIA
  finding was repaired and the final standalone organisation pass succeeded.
- Native invalid-form summary, linked field focus, preview Escape, drawer focus/
  Shift+Tab/Escape, both-theme screenshots and lifecycle publication logic passed.
- Real pointer click anywhere on a discovery card, permission-checked organiser
  workspace link, section navigation, named/custom file-type synchronization,
  cancelled unsaved-navigation prompt, 320/768/740 px layouts and logout passed.
  Final focused run: 13.2 seconds, no application mutation requests.
- All JavaScript syntax checks, `git diff --check`, and release validation passed;
  all 39 existing migrations remain represented in SCHEMA.sql.

Inspected actual screenshots of public discovery, organiser dashboard, judging/
submission configuration, certificate studio, participant mobile discovery,
organisation mobile management, and the final 320 px submission controls. Screens
were read for layout, hierarchy, wrapping, spacing and selected-state visibility,
in addition to automated assertions. Recorded colour checks: control border
against light background 3.31:1, dark control border against surface 3.73:1, and
state text against the light tinted surface 6.79:1.

Earlier failed runs are retained as diagnostics: an audit-helper field selector,
an overly broad brand selector, temporary shared-server shutdown, and a pointer
target outside the viewport were corrected. They are not reported as product
passes. The actual contrast, focus and ARIA failures were repaired and rechecked.

Limitations: these accounts contain no registered entries, scored results or
certificate artwork for a fresh populated-flow audit. No new records, artwork,
uploads, judging decisions or result publication were created. Consequently this
is a visual/navigation/local-interaction verification, not a new transactional
end-to-end regression. Native OS installation, real push delivery, physical screen
reader and mobile-keyboard checks were not repeated. See CHECKS.md.

## Antislop delivery gate for this refinement

### Hard gate

- R-02 PASS: new copy contains no em dash; existing owner-approved identity stays.
- R-03 PASS: 320/390/768 px views and 740 px landscape have no document overflow.
- R-17/R-18/R-36/R-38 PASS: counts and identities come from existing authorized
  accounts; no invented statistics, testimonials or product claims were added.
- R-23 PASS: no new assets; existing brand and logo are reused as directed.
- R-24 PASS: new section links resolve to existing competition routes; the
  workspace and submission links were clicked in the real browser.
- R-25 PASS: final sampled account/public views report zero Axe contrast
  violations; control-boundary and text ratios were calculated separately.
- R-26 PASS: card click navigates, preview opens/closes, file choices update the
  configuration text, and draft deletion uses applied, permission-checked RPCs.
- R-27 PASS: existing empty/loading/error states remain; loading navigation
  disables stale content and banner loading/failure has a branded fallback.
- R-28 PASS: no generic FAQ was introduced.
- R-32 PASS: focus, linked invalid-field summaries, drawer cycling and Escape
  were exercised; focus indicators remain visible in both themes.
- R-33 PASS: UI changes were written directly in source with apply_patch.
- R-34 PASS: light and dark account/public views were audited separately.
- R-35 PASS: local real Chrome route, interaction, screenshot and accessibility
  evidence is recorded above; untested populated/hardware states are disclosed.

### Purpose gate

- R-01/R-06/R-07 PASS: blue, Geist and the existing competition motif preserve
  explicit Vertex branding; no new decorative background was introduced.
- R-04/R-08 PASS: existing Font Awesome icons keep contextual meaning; arrows
  signal navigation rather than decorate every new control.
- R-09 PASS: lifecycle and unread labels represent actual state.
- R-10/R-12/R-13 PASS: no new glass, floating-card shadows or glows.
- R-14 PASS: card structure follows competition data; operational forms remain
  distinct from browsable cards and informational surfaces.
- R-19 PASS: readable translation entrances and control feedback serve orientation;
  reduced motion is respected.
- R-22 PASS: no generic illustrations or generated people were added.

### Liveliness and craftsmanship

- PASS: ENERGY 1 / RHYTHM 2 / MOTION 1 declared before UI refinement; hierarchy,
  blue action accent and structural whitespace preserve the product's character.
- C-1/R-31 PASS: each major decision has its one-line reason above.
- C-2 PASS: new controls perform actual local/navigation actions; safe draft
  deletion now has applied SQL, permission tests and a recoverable confirmation flow.
- C-3/R-05 PASS: section order follows the competition lifecycle, not a new
  dashboard or landing-page template.
- C-4 PASS for tested states: both themes, narrow/tablet/landscape, empty data,
  validation, draft retention and keyboard interactions pass.
- C-5 PASS: evidence and limits are separated; no compliance certification claimed.
- R-11 PASS: existing control/card radii remain distinct; no pill makeover.
- R-15/R-16 PASS: new copy names concrete actions; no marketing buzzwords.
- R-20/R-21/R-29/R-30 PASS: Vertex's identity, theme choice and restrained palette
  stay intact; no other product's aesthetic was cloned.
