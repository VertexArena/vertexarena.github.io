# Milestone 9 verification — 24 September 2026

## Shipped

Competition owners invite completed organiser accounts by @username, receive suggestions, see pending invitations, cancel them, and remove accepted managers. Invitees get an in-app notification and organiser dashboard inbox to accept or decline. Accepted managers see the competition on their dashboard and can use its workspace, participant roster, and editor. Managers can leave; only owners can invite or remove others. Original owner cannot be removed or replaced.

## Database

Migration `007_competition_organisers.sql` applied to existing Vertex project as remote version `20260924131451`. Immutable follow-up `007a_competition_organiser_inviter_index.sql` (remote version `20260924132605`) adds the missing inviter foreign-key index. Both are included in `SCHEMA.sql`.

Membership and invitation tables have RLS and no direct client-write grants. Privileged RPCs check persisted organiser roles, invitation recipient, competition owner, and accepted membership. Existing published competition reads remain available to guests. Anonymous callers cannot execute invitation RPCs. Security advisor flags the signed-in security-definer RPC pattern, which is intentional for checked atomic writes and scoped reads. The public-profile view and other prior findings remain unchanged. After 007a, the only unindexed foreign-key finding is the pre-existing organisation-membership inviter key.

## Browser evidence

- Milestone 9 desktop Chromium acceptance passed against hosted Supabase through a local HTTP server. Tested username suggestions, invite notification, accept, decline, manager dashboard, workspace, roster, editor save, participant exclusion, unauthorised removal, owner protection, and manager removal.
- Direct organiser-team route and refresh passed. Standard 390 px and narrow 320 px mobile checks passed. Screenshots were inspected; the owner row was refined for narrow screens. Public CDN fonts and icons were unavailable in this browser host's test environment, so manual visual review remains in `CHECKS.md`.
- Milestone 4 authoring/publication and Milestone 7 team registration/roster regressions passed after migration.
- Local JavaScript syntax and Git diff checks passed.

## Cleanup

Connector audit found 18 exact-pattern test users and six test competitions from these runs, with zero banners, organisations, or memberships in other competitions. These were removed through the connected Supabase app. Final read-only query found zero remaining test accounts, competitions, or banners; the existing normal competition remained.