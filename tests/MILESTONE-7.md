# Milestone 7 verification — 23 September 2026

## Shipped

Participants can create competition-specific teams, invite by `@username`,
accept or decline invitations, manage an unregistered roster, and register once
every member is eligible and the size is valid. Captains can cancel invitations,
remove members, and disband an empty unregistered team. Members can leave before
registration. Registered rosters lock. The participant dashboard shows teams,
pending invitations, and updates; the organiser roster nests members below each
registered team and lists individual entries separately.

## Database

`006_competition_teams.sql` was applied to the existing Vertex project through
the connected Supabase app as remote migration `20260923072032`. Follow-up
`006a_team_foreign_key_indexes.sql` was applied as `20260923073302`. `SCHEMA.sql`
includes both. Team, member, and invitation tables have RLS; direct writes are
denied. Authenticated RPCs check role, ownership, age, dates, capacity, category,
membership, and identity conflicts in transactions. Team state, invitations,
and notifications are in Realtime.

## Browser evidence

- The full Milestone 7 flow passed in desktop, standard mobile, and 320 px narrow
  mobile Chromium using the local HTTP server and hosted Supabase.
- It covered logged-out login return; create and refresh; username suggestions;
  invite notifications; accept and decline; live roster updates; below-minimum,
  maximum, age, category, duplicate, and individual/team conflict rules; team
  entry and dashboard refresh; organiser nesting and direct route refresh;
  cancel, leave, remove, and disband; and unrelated-user read/write denial.
- Milestone 1, 5, and 6 regression: 25 passed, one planned mobile skip.
- Desktop, standard mobile, and narrow mobile roster, confirmation, and organiser
  screenshots were inspected. The narrow mobile test asserted no sideways scroll.
- No test images, banners, or logos were uploaded.

## Cleanup

After testing, the connector reported 60 exact-pattern Milestone 5–7 test
accounts and 54 test competitions, all owned by those accounts, with zero
referenced banners and zero matching Storage objects. Guarded deletion removed
those accounts and competitions. Cascade cleanup removed team and registration
records. A follow-up query verified zero matching users, competitions, teams,
members, invitations, individual entries, notifications, and bookmarks.

## Manual review

`CHECKS.md` gives human steps for appearance and usability confirmation.
