# Milestone 12 verification — 25 September 2026

## Shipped

Competition organisers can schedule a uniquely named Jitsi meeting and assign
registered individual participants or registered teams. Search covers names,
@usernames, and teams. Assignees receive in-app notifications. Organisers see
their meeting roster; participants see only meetings assigned to them. The
meeting route checks Supabase access before loading Jitsi, offers a full-screen
responsive iframe, shows connection errors, and returns to the competition on
leave.

## Database

`010_competition_meetings.sql` applied through the connected Supabase app as
remote version `20260925122345` and included in `SCHEMA.sql`. The three meeting
tables have RLS and deny direct client writes. A checked organiser RPC validates
published competition, registration, assignment, name, and start time before
creating meeting and notifications in one transaction. The meeting table is in
Realtime. Remote verification found three tables, three RLS policies, one
Realtime publication entry, and the notification foreign key. Security advisor
findings for the new authenticated security-definer functions are expected;
those functions check caller identity and organiser or assignment scope.

## Browser evidence

- Milestone 12 acceptance passed twice in Chromium on a local HTTP server
  against the existing Supabase project and live Jitsi. Tested an organiser, an
  assigned individual, two registered team members, and an unassigned
  registered participant.
- Verified duplicate meeting name rejection without regard to case, roster
  display, notifications, restricted list and direct route, denial of
  unauthorised RPC creation and row reads, route refresh, Jitsi iframe prejoin,
  and leaving the route.
- Desktop and 320 px phone screenshots were inspected after loading. The phone
  page had no horizontal overflow. The Leave button contrast was corrected
  after the first visual review.
- Milestone 1 home, routing, theme, 404, mobile, and reduced-motion regression:
  19 passed, one desktop-only case skipped on mobile.

## Cleanup

All 10 Milestone 12 test accounts and both test competitions were removed
through the Supabase app. Follow-up counts for accounts, competitions, and
meetings were zero. No files were uploaded.
