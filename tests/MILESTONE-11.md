# Milestone 11 verification — 25 September 2026

## Shipped

Registered participants can ask questions on a competition page. The organiser
team sees questions in realtime and receives private notifications with deep
links. Organisers can post and edit their own replies, then resolve or reopen
questions. Participants receive reply notifications and see changes in realtime.
The organiser dashboard shows recent unanswered questions. The competition
workspace links directly to its Q&A page.

## Database

`009_competition_qa.sql` applied through the connected Supabase app as remote
version `20260925115754` and included in `SCHEMA.sql`. RLS is enabled on both
new tables. Direct writes are denied; checked authenticated RPCs enforce
registration and organiser roles. Both tables are in the Realtime publication.
Security advisor findings for the new authenticated security-definer RPCs are
expected because these functions validate caller identity and scope. No new
unindexed foreign keys were reported.

## Browser evidence

- Milestone 11 acceptance passed in Chromium on a local HTTP server against
  the existing hosted project. Tested organiser, two registered participants,
  and an unrelated participant.
- Verified live question and reply display, private notifications, deep-link
  refresh, reply editing, resolved/reopened state, and denial of participant
  editing, replying, and resolving. Unregistered reads and posting were denied.
- Desktop and 320 px phone layouts, light/dark mode, and horizontal overflow
  were checked. Screenshots were inspected. Milestone 10 announcement and
  notification regression passed in the same browser run.
- JavaScript syntax, SQL migration application, RLS enabled state, Realtime
  publication, and Git diff checks passed.

## Cleanup

All Milestone 10 regression and Milestone 11 test competitions and accounts
created on 25 September were removed through the connected Supabase app.
Follow-up counts were zero. No profile images, logos, or banners were uploaded.
