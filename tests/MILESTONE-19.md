# Milestone 19 — participant achievements

Completed 30 September 2026. Achievement acceptance: **1 passed**. Core routing,
theme, keyboard and reduced-motion regression: **19 passed, 1 expected mobile skip**.
Recommendation and registration-history regression: **2 passed**.

## Implementation

Thirteen achievement definitions cover first registration, three/five/ten
competitions, first individual entry, first team entry, first submission, five
round submissions, first advancement, finalist, overall winner, category winner,
and registration across three fields. Every card explains its requirement.
Unfinished milestones show counts and accessible progress bars; earned cards
show an earned date and a restrained blue accent.

Participant profiles contain the full collection. Dashboards show the two most
recent awards and the closest unfinished milestone, with a link to the complete
collection. Empty, loading, local error and retry states remain useful without
blocking the surrounding profile or dashboard. A filtered Realtime subscription
refreshes private progress, announces newly earned awards and adds a short reveal.
Route cleanup removes subscriptions, timers and focus listeners. Reduced motion
disables the reveal. Live refreshes preserve keyboard focus on the sharing control;
refreshes arriving during its save are deferred until the save finishes.

Awards are private by default. Participants can share earned awards on their
public profile. Progress counts remain private regardless of that setting.
Organisation and organiser profiles do not show participant achievements.

## Authoritative data and migration

The connected Supabase app applied `017_achievements` to the existing Vertex
project. `SCHEMA.sql` ends with the identical immutable migration. Hosted migration
history, RLS, table grants, function grants and fixed search paths were verified.

Private activity receipts are created by database triggers after individual
registration, complete team registration, first round submission and first
leaderboard publication. All registered team members inherit their own receipts.
Creating a team or accepting an invitation does not award a registered-team
milestone. Submission edits do not count as new submissions. Results use protected
round eligibility and category awards; unpublished finalised results reveal no
achievement. An overall winner does not automatically receive an advancement award.

Receipts are unique per participant, activity kind and source. Transaction locks
serialize concurrent awards for the same participant. Award uniqueness prevents
duplicate notifications. A quiet backfill reads existing authoritative activity
without retrospective notifications. Lifetime receipts deliberately retain earned
milestones if an organiser deletes a competition; account deletion removes receipts,
awards and progress through foreign-key cascades. Receipts contain no competition
names, scores or submitted content.

Clients cannot write definitions, receipts, awards or progress. Own progress uses
RLS and an authenticated, participant-only invoker RPC without an actor parameter.
Public reads expose only opted-in earned awards through a guarded function; private
receipt functions are not executable by anonymous or authenticated clients.

## Automated verification

`tests/e2e/milestone-19.spec.js` uses Chromium, the local HTTP server and the actual
hosted project. Five clearly marked accounts exercise participant, team captain,
team member, outsider and organiser perspectives, plus an anonymous browser.
Signup, registration, invitations, submissions, judging, finalisation, category
awards, publication and sharing changes use the actual UI. Fixtures use the
organiser authoring RPC, solid banners and link submissions; no image uploads.

The test covers all ten roadmap acceptance criteria, three-field and multi-entry
progress, team inheritance, publication timing, notification uniqueness,
non-winner isolation, direct profile/dashboard loads and refreshes, private/public
sharing, rejected table mutations and spoofed RPC calls, foreign progress denial,
organiser rejection, live updates, keyboard focus, network failure and retry,
320 px mobile layout, dark mode and reduced motion.

Commands:

```text
node node_modules/@playwright/test/cli.js test tests/e2e/milestone-19.spec.js --project=laptop --workers=1 --output=test-results/m19-final
node node_modules/@playwright/test/cli.js test tests/e2e/milestone-1.spec.js --project=laptop --project=narrow-mobile --workers=1 --output=test-results/m19-core
node node_modules/@playwright/test/cli.js test tests/e2e/milestone-18.spec.js --project=laptop --workers=1 --output=test-results/m19-recommendation-regression-final
```

After acceptance, deleting the three fixture competitions retained all 14 activity
receipts, 22 awards and three progress rows. Deleting the five fixture accounts
then removed their achievement data.

The recommendation regression still covers private team history, eligibility,
exploration, bookmarks, previews, public views, mobile/tablet layouts and retries.
Two existing test steps now await confirmed bookmark saves before navigating;
immediate navigation had cancelled their pending browser requests. No recommendation
implementation changed. All acceptance and regression fixture accounts and
competitions were deleted through the connector. Final counts confirmed zero
matching test accounts, zero fixture competitions, zero remaining achievement
receipts/awards/progress, and the existing normal competition preserved.

## Visual and security review

Desktop collection, compact dashboard, narrow mobile cards and dark-mode progress
screenshots were inspected for hierarchy, spacing, wrapping and contrast. The
reusable browser helper disables blocked font/icon CDNs and uses the same pinned
cached Supabase client; these screenshots exercise fallback typography. Production
Geist and Font Awesome references remain intact. Some scrolled section captures
include the fixed navigation overlay; isolated card captures verify text and bars.

Supabase advisors were reviewed. The private receipt table intentionally has
[RLS with no client policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
The guarded public sharing endpoints intentionally permit
[anonymous](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
and [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
security-definer execution. The new foreign-key index is initially reported as
[unused](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index);
it is retained to cover award-definition references. No new unindexed foreign key
was reported. Earlier advisor findings remain outside this milestone.

`CHECKS.md` contains human review steps for meaning, usefulness, sharing, visual
consistency and accessibility feel.
