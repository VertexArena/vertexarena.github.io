# Milestone 10 verification — 24 September 2026

## Shipped

Competition organisers publish announcements for confirmed individual and team participants. The feed shows history, author name and @username, local timestamps, edits, and deletion. Only the author or permanent owner may edit or delete an announcement. A published message creates one notification per registered participant. The notification centre shows all current notification kinds, unread count, mark one/all, and deep links. Announcement edits update their notification text; deletion removes related notifications. The header bell and participant feed respond to Supabase Realtime.

Submission confirmation notices are supported by the general notification centre; submission creation belongs to its later roadmap milestone.

## Database

`008_announcements_and_notifications.sql` applied through the connected Supabase app as remote version `20260924133839`, and included in `SCHEMA.sql`. RLS restricts announcement reads to managers and confirmed participants. Direct announcement and notification writes are denied. Checked RPCs enforce organiser role, author/owner edit rules, and recipient-scoped read actions. The announcement table is in the Realtime publication; notifications were already included. Security advisor findings for these authenticated security-definer RPCs reflect their intentional checked API access. Existing view/search/password advisor findings remain. Performance advisor found no new missing foreign-key index.

## Browser evidence

- Milestone 10 acceptance passed in Chromium at desktop and 320 px narrow mobile using a local HTTP server and the existing hosted Supabase project. A participant page received a new announcement and bell count without refresh. Deep-link and direct refresh, edit, deletion, read one/all, outsider RLS denial, and participant publish rejection passed.
- Existing registration, team invitation, and organiser invitation flows populated the notification centre; their links opened the correct routes. The notification page had no horizontal overflow at 390 px.
- Milestone 9 organiser collaboration regression passed in desktop Chromium. Screenshots of the announcement page and mobile notification centre were inspected. The browser host blocks external icon/font CDNs, so final font/icon appearance remains in `CHECKS.md`.
- JavaScript syntax, SQL migration application, Realtime publication, RLS enabled state, and Git diff checks passed.

## Cleanup

The connected Supabase app removed nine exact-pattern M9/M10 test competitions and twenty exact-pattern test accounts from these runs. A final query found zero remaining matches. No profile or organisation images were uploaded.
