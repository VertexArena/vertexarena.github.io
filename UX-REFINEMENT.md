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

## Database change required for competition deletion

Current competition writes are atomic RPCs; application users have no direct
DELETE grant. The connected Supabase app returned `Unknown tool` for project
access. The user asked to continue frontend work and report required RLS changes.
No migration was applied, no schema was changed, and no dead Delete button ships.

A safe follow-up should add an authenticated, owner-only draft-deletion RPC. It
must lock the competition, re-check draft status and exact confirmation name,
reject registrations/team membership/invitations/submissions/scoring/results/
certificates or other retained history, and reject remaining Storage objects.
Remove referenced draft banner artwork through the Storage API with retry before
the final atomic deletion. Keep the owner/version checks in SQL, revoke PUBLIC
and anon execution, and verify owner/manager/participant/organisation denials.
Published competitions must retain their records and stable results/certificates.
Cancellation/archive/duplication are not indiscriminately added: each requires a
separate state/access model and historical-integrity decision.

## Verification record

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
  configuration text, and destructive deletion has no nonfunctional control.
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
- C-2 PASS: new controls perform actual local/navigation actions; SQL-dependent
  deletion is explicitly pending instead of represented by a dead button.
- C-3/R-05 PASS: section order follows the competition lifecycle, not a new
  dashboard or landing-page template.
- C-4 PASS for tested states: both themes, narrow/tablet/landscape, empty data,
  validation, draft retention and keyboard interactions pass.
- C-5 PASS: evidence and limits are separated; no compliance certification claimed.
- R-11 PASS: existing control/card radii remain distinct; no pill makeover.
- R-15/R-16 PASS: new copy names concrete actions; no marketing buzzwords.
- R-20/R-21/R-29/R-30 PASS: Vertex's identity, theme choice and restrained palette
  stay intact; no other product's aesthetic was cloned.
