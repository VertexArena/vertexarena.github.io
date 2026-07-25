# ROADMAP.md

## 1. Roadmap Contract

This roadmap defines the implementation order for Vertex.

`AGENTS.md` and this file together are the complete specification.

Rules:

- Implement milestones in order.
- Complete exactly one milestone before beginning the next.
- Every milestone must be testable end-to-end through the UI.
- A milestone is not complete if only database tables, utilities, components, or placeholder screens exist.
- Do not replace required features with simpler alternatives.
- Do not mark a feature complete if it is mocked, simulated, partially implemented, or intentionally deferred.
- Every acceptance test must pass before the milestone commit.
- Re-test previously completed core flows after each milestone.
- Do not push until every milestone is complete.

---

## 2. Database Validation Rules

For the first database milestone:

1. Create `SCHEMA.sql`.
2. Create the initial numbered migration.
3. Apply the SQL to the existing Supabase project referenced by the provided credentials.
4. Verify the complete milestone against that project.

For later database milestones:

1. Create a new immutable numbered migration.
2. Apply it to the existing Supabase project.
3. Update `SCHEMA.sql`.
4. Verify the milestone against the existing project.
5. Do not rewrite prior applied migrations.

A fresh-project `SCHEMA.sql` verification is required at final release, not after every milestone.

---

# Milestone 1 â€” Repository Foundation, Design System, and Routing

**Status: Complete — 25 July 2026**

## User-visible result

Vertex opens as a polished responsive application with:

- branded shell;
- logo;
- `VERTEX` Geist Mono wordmark;
- light mode;
- dark mode;
- clean navigation;
- public home page;
- discovery route;
- login route;
- signup route;
- functioning nested SPA routing;
- custom 404.

## Build

Create the project structure and reusable frontend architecture.

Implement:

- `index.html`;
- `404.html`;
- application bootstrap;
- route registry;
- route rendering;
- component helpers;
- design tokens;
- theme system;
- local-storage theme persistence;
- favicon;
- Geist, Geist Mono, Inter fallbacks;
- Font Awesome;
- GSAP setup;
- lazy Three.js setup;
- PWA metadata foundation;
- loading and error boundaries;
- mobile navigation;
- desktop navigation;
- base page layouts;
- custom animated 404.

The 404 must include:

- mouse interaction;
- tasteful particles;
- Three.js effect;
- reduced-motion fallback;
- WebGL fallback.

## Acceptance test

1. Open `/`.
2. Confirm branding, navigation, theme, and responsive layout.
3. Toggle dark mode, refresh, and confirm persistence.
4. Open `/discover`, `/login`, and `/signup`.
5. Refresh each route directly.
6. Open `/randomgarbage`.
7. Confirm the true custom 404 appears.
8. Confirm valid nested routes do not flash the 404 during recovery.
9. Test desktop and mobile widths.
10. Enable reduced motion and confirm functionality remains intact.

## Commit

```text
feat: establish Vertex foundation and routing
```

---

# Milestone 2 â€” Supabase Bootstrap, Authentication, and Profiles

## User-visible result

A user can:

- create a participant account;
- create an organiser account;
- log in;
- log out;
- remain logged in after refresh;
- create and edit a complete profile;
- search users by username;
- view public profiles.

## Build

Read `.env`.

Create `config.js` containing:

- project URL;
- legacy anon key.

Verify it works, then delete `.env`.

Create:

- `SCHEMA.sql`;
- `supabase/migrations/001_auth_profiles_and_organisations.sql`.

Implement database structures for:

- profiles;
- account types;
- unique case-insensitive usernames;
- birthdays;
- bios;
- profile pictures;
- social links;
- organisation profiles;
- organisation-organiser membership;
- timestamps;
- profile search;
- relevant indexes;
- RLS;
- Storage bucket and policies for profile pictures.

Implement Auth:

- email/password signup;
- no email verification flow;
- immediate usable session;
- persistent login;
- protected-route return path;
- logout;
- auth-aware navigation.

Profile fields:

- full name;
- username;
- account type;
- profile picture;
- bio;
- birthday for participants;
- optional school or affiliation;
- optional location;
- multiple social links.

Implement public profile routes.

## Acceptance test

### Participant

1. Create a participant account.
2. Confirm immediate login without verification.
3. Set full name, username, birthday, bio, profile picture, and multiple social links.
4. Refresh and confirm persistence.
5. Log out and log back in.
6. Search by `@username`.
7. Open the public profile.
8. Confirm full name appears above `@username`.
9. Confirm birthday is not publicly exposed.

### Organiser

1. Create an organiser account.
2. Complete the organiser profile.
3. Search and view it publicly.

### Security

1. Attempt duplicate username registration.
2. Confirm rejection.
3. Confirm one user cannot edit another profile.
4. Confirm protected routes redirect to login and return correctly afterward.
5. Verify profile picture Storage access rules.

## Commit

```text
feat: add Supabase auth and account profiles
```

---

# Milestone 3 â€” Organisation Accounts and Organiser Membership

## User-visible result

Organisation profiles function as read-only public containers, and organiser accounts can be associated with organisations.

## Build

Create:

- `supabase/migrations/002_organisations_and_membership.sql`.

Implement:

- organisation creation flow where appropriate;
- organisation profile editing by authorised organisation management account;
- organisation logo;
- organisation description;
- website;
- social links;
- unique slug;
- organiser association;
- organiser invite/accept flow;
- public organisation profile;
- associated organiser list;
- associated competition placeholder area ready for later milestones;
- RLS.

Organisation accounts must remain primarily read-only for competition operations.

## Acceptance test

1. Create or configure an organisation account.
2. Add organisation name, slug, logo, description, website, and social links.
3. Invite an organiser.
4. Accept from the organiser account.
5. Confirm association appears on both profiles.
6. Confirm an unrelated account cannot modify the organisation.
7. Confirm the public organisation page is accessible without login.

## Commit

```text
feat: add organisation profiles and organiser membership
```

---

# Milestone 4 â€” Competition Creation and Editing

## User-visible result

An organiser can create, review, publish, and edit a complete competition.

## Build

Create:

- `supabase/migrations/003_competitions_rounds_and_timelines.sql`.

Implement a guided organiser flow collecting:

- name;
- unique slug;
- field tags;
- prize details;
- age minimum;
- age maximum;
- individual/team/both mode;
- team minimum and maximum size;
- categories;
- conventional or custom structure;
- rounds;
- top X values;
- description;
- banner image, colour, or gradient;
- registration opening;
- registration deadline;
- competition start;
- round opening times;
- round submission deadlines;
- judging windows where applicable;
- leaderboard release timing;
- optional certificate template status;
- organisation association;
- draft or published state.

Use Supabase Storage for uploaded banners.

Implement:

- step-based creation;
- validation;
- review;
- draft saving;
- publication;
- edit flow;
- stable slug handling;
- timeline validation;
- impossible-date prevention;
- age-range validation;
- safe edits after publication.

The prize distribution panel must exist and say `Coming Soon`.

## Acceptance test

1. Log in as organiser.
2. Create an individual competition with direct top 3.
3. Create a team competition with top 100 â†’ top 30 â†’ top 3.
4. Configure team-size limits.
5. Configure categories.
6. Configure valid timelines.
7. Upload a banner.
8. Create another competition using a colour or gradient banner.
9. Save as draft.
10. Reopen and publish.
11. Confirm published competition is publicly viewable.
12. Edit non-destructive details.
13. Confirm impossible timeline, invalid age range, and duplicate slug are rejected.
14. Confirm unauthorised users cannot edit.

## Commit

```text
feat: add complete competition creation workflow
```

---

# Milestone 5 â€” Competition Discovery, Search, Filters, and Bookmarks

## User-visible result

Visitors and participants can discover competitions quickly and clearly.

## Build

Create:

- `supabase/migrations/004_discovery_and_bookmarks.sql`.

Implement:

- public discovery route;
- competition cards;
- search by name;
- field filters;
- team-mode filter;
- age eligibility indication;
- deadline awareness;
- organisation display;
- prize summary;
- timeline preview;
- registration state;
- rich card preview;
- bookmark support for authenticated participants;
- responsive discovery layout;
- pagination or efficient progressive loading;
- empty states;
- loading skeletons;
- public competition details page.

Use Phantom-inspired interaction quality.

## Acceptance test

1. Browse discovery while logged out.
2. Search by competition name.
3. Filter by field.
4. Filter by individual/team/both.
5. Open a competition preview.
6. Open full competition details.
7. Confirm required information is immediately visible.
8. Log in as participant.
9. Bookmark a competition.
10. Refresh and confirm bookmark persistence.
11. Confirm ineligible competitions explain the age mismatch.
12. Test with enough records to verify search and filtering remain responsive.

## Commit

```text
feat: add competition discovery and bookmarks
```

---

# Milestone 6 â€” Participant Registration and Age Enforcement

## User-visible result

Eligible participants can register for individual competitions, while invalid registrations are correctly blocked.

## Build

Create:

- `supabase/migrations/005_individual_registration.sql`.

Implement:

- authentication requirement;
- birthday-based age calculation;
- minimum and maximum age enforcement;
- registration opening and closing enforcement;
- individual registration;
- category selection where required;
- duplicate registration prevention;
- confirmation state;
- participant dashboard registration state;
- submission-confirmation-style in-app notification;
- RLS.

## Acceptance test

1. Open a competition while logged out.
2. Attempt registration and confirm login requirement.
3. Log in and return to the same competition.
4. Register with an eligible birthday.
5. Confirm success and participant dashboard appearance.
6. Attempt duplicate registration.
7. Attempt registration with a birthday below minimum age.
8. Attempt registration with a birthday above maximum age.
9. Attempt after registration deadline.
10. Confirm all failures explain the exact reason.
11. Confirm one participant cannot alter another participantâ€™s registration.

## Commit

```text
feat: add individual competition registration
```

---

# Milestone 7 â€” Competition Teams and Team Registration

## User-visible result

Participants can create competition-specific teams, invite members by username, and register valid teams.

## Build

Create:

- `supabase/migrations/006_competition_teams.sql`.

Implement:

- team creation;
- team naming;
- team owner/captain;
- username search;
- invitations;
- invite notifications;
- accept;
- decline;
- cancel;
- member list;
- leave rules;
- remove-member rules;
- minimum team size;
- maximum team size;
- team registration;
- prevention of conflicting individual/team registration;
- nested team displays for organisers;
- RLS.

## Acceptance test

1. Create a team for a team competition.
2. Invite two participants by `@username`.
3. Confirm both receive notifications.
4. Accept one invitation.
5. Decline the other.
6. Confirm team membership updates in realtime or promptly.
7. Attempt registration below minimum size.
8. Add enough members and register.
9. Attempt to exceed maximum size.
10. Attempt duplicate/conflicting registration.
11. Confirm organiser view shows the team as parent and members nested beneath.
12. Confirm unrelated users cannot modify the team.

## Commit

```text
feat: add team formation and registration
```

---

# Milestone 8 â€” Participant and Organiser Dashboards

## User-visible result

Participants and organisers each have a useful operational dashboard.

## Build

Implement participant dashboard sections:

- upcoming;
- in progress;
- completed;
- approaching deadlines;
- pending team invitations;
- unread announcements;
- assigned meetings;
- pending submissions;
- available leaderboards;
- available certificates;
- achievements preview.

Implement organiser dashboard sections:

- managed competitions;
- registration counts;
- participant counts;
- team counts;
- deadlines;
- unanswered Q&A;
- pending submissions;
- meetings;
- leaderboard state;
- certificate readiness;
- recent activity.

Add animated counters and polished states.

## Acceptance test

1. Log in as participant with multiple competition states.
2. Confirm correct classification into upcoming, in progress, and completed.
3. Confirm invitations and deadlines appear.
4. Log in as organiser.
5. Confirm counts match competition data.
6. Open a competition workspace from the dashboard.
7. Test empty dashboard states.
8. Test mobile layouts.

## Commit

```text
feat: add participant and organiser dashboards
```

---

# Milestone 9 â€” Competition Organiser Collaboration

## User-visible result

Competition owners can invite other organiser accounts to help manage a competition.

## Build

Create:

- `supabase/migrations/007_competition_organisers.sql`.

Implement:

- organiser search by username;
- organiser invitation;
- notification;
- accept;
- decline;
- competition organiser list;
- role/access level;
- safe removal;
- owner protection;
- no participant accounts;
- RLS.

## Acceptance test

1. Invite another organiser to a competition.
2. Confirm notification delivery.
3. Accept invitation.
4. Confirm the competition appears in the invited organiserâ€™s dashboard.
5. Confirm authorised management access.
6. Attempt to invite a participant account.
7. Attempt unauthorised organiser removal.
8. Confirm at least one owner remains.

## Commit

```text
feat: add competition organiser collaboration
```

---

# Milestone 10 â€” Announcements and Notification Centre

## User-visible result

Organisers can publish announcements, and participants receive them in realtime through the in-app notification system.

## Build

Create:

- `supabase/migrations/008_announcements_and_notifications.sql`.

Implement:

- announcement creation;
- announcement history;
- author and timestamp;
- editing rules;
- deletion rules;
- realtime updates;
- participant announcement feed;
- notification centre;
- unread count;
- mark as read;
- mark all as read;
- deep links;
- submission confirmation notifications;
- organiser invitation notifications;
- team invitation notifications;
- RLS.

## Acceptance test

1. Publish an announcement as organiser.
2. Keep a participant session open.
3. Confirm realtime appearance.
4. Confirm unread notification count.
5. Open notification and follow deep link.
6. Mark notification as read.
7. Publish another announcement and mark all as read.
8. Confirm unrelated users do not receive private competition announcements.
9. Confirm participants cannot publish announcements.

## Commit

```text
feat: add announcements and realtime notifications
```

---

# Milestone 11 â€” Competition Q&A

## User-visible result

Participants can ask competition questions and organisers can answer them in realtime.

## Build

Create:

- `supabase/migrations/009_competition_qa.sql`.

Implement:

- question creation;
- question list;
- organiser reply;
- reply editing;
- answered/resolved state;
- organiser notification for new question;
- participant notification for reply;
- realtime updates;
- authorship;
- timestamps;
- RLS;
- empty/loading/error states.

## Acceptance test

1. Ask a question as a registered participant.
2. Confirm organiser notification.
3. Reply as organiser.
4. Confirm participant receives reply notification.
5. Confirm realtime display.
6. Mark answered.
7. Confirm another participant cannot edit the question.
8. Confirm non-organisers cannot post organiser replies.

## Commit

```text
feat: add realtime competition Q&A
```

---

# Milestone 12 â€” Jitsi Meetings and Assigned Access

## User-visible result

Organisers can create Jitsi meetings and assign them to specific participants or teams.

## Build

Create:

- `supabase/migrations/010_competition_meetings.sql`.

Implement:

- meeting name;
- unique meeting slug within competition;
- Jitsi room configuration;
- participant assignments;
- team assignments;
- organiser access;
- participant visibility rules;
- meeting notifications;
- full-screen iframe route;
- route access enforcement;
- loading and error handling;
- responsive layout.

Route:

```text
/competition/{competition-slug}/meeting/{meeting-slug}
```

## Acceptance test

1. Create a meeting.
2. Attempt duplicate name within the same competition.
3. Assign one team and one participant.
4. Confirm assigned users receive notifications.
5. Confirm assigned users see the meeting.
6. Confirm an unassigned participant does not see or access it.
7. Open the meeting route directly.
8. Refresh the route.
9. Confirm full-screen Jitsi loads.
10. Leave and return to competition.

## Commit

```text
feat: add assigned Jitsi competition meetings
```

---

# Milestone 13 â€” Round Submissions

## User-visible result

Organisers can configure round submissions, and participants or teams can submit permitted files and links before deadlines.

## Build

Create:

- `supabase/migrations/011_round_submissions.sql`.

Implement organiser controls for:

- files;
- links;
- mixed submissions;
- allowed MIME types;
- configured size limit;
- hard 25 MB maximum;
- instructions;
- open time;
- close time.

Implement participant/team flow:

- upload;
- link entry;
- mixed entry;
- preview;
- edit/replace before deadline where allowed;
- confirmation;
- notification;
- secure Storage;
- RLS.

Implement organiser review:

- filter by round;
- filter by participant/team;
- file access;
- link access;
- timestamps;
- missing status;
- late status;
- valid status.

## Acceptance test

1. Configure a file-only round.
2. Upload an allowed file.
3. Attempt wrong file type.
4. Attempt a file above configured limit.
5. Attempt a file above 25 MB.
6. Configure a link-only round.
7. Submit a valid link.
8. Configure mixed submission.
9. Submit both.
10. Replace before deadline.
11. Attempt after deadline.
12. Confirm organiser can review securely.
13. Confirm unrelated users cannot access submissions.

## Commit

```text
feat: add secure round submissions
```

---

# Milestone 14 â€” Scoring Criteria and Score Entry

## User-visible result

Organisers can define scoring criteria and enter complete, validated scores for each round.

## Build

Create:

- `supabase/migrations/012_scoring.sql`.

Implement:

- criteria name;
- maximum marks;
- description;
- ordering;
- score entry for participant or team;
- totals;
- incomplete scoring indicator;
- edit flow;
- sorting;
- score visibility setting;
- validation;
- organiser permissions;
- RLS.

## Acceptance test

1. Add multiple criteria.
2. Enter scores for several entries.
3. Confirm totals.
4. Attempt marks above criterion maximum.
5. Leave one criterion incomplete.
6. Confirm incomplete warning.
7. Edit scores.
8. Toggle public score visibility.
9. Confirm participants cannot alter scores.

## Commit

```text
feat: add competition scoring
```

---

# Milestone 15 â€” Advancement and Cutoff Tie Resolution

## User-visible result

Vertex calculates provisional advancement and requires explicit organiser resolution of cutoff ties.

## Build

Create:

- `supabase/migrations/013_round_advancement.sql`.

Implement:

- ranking by total score;
- provisional top X;
- exact cutoff tie detection;
- boundary-only tie highlighting;
- include all;
- exclude all where valid;
- manual selection;
- unresolved state;
- advancement records;
- elimination state;
- round history;
- competition-specific internal tags;
- team-to-member eligibility propagation;
- RLS.

## Acceptance test

1. Configure top 3 advancement.
2. Enter scores with no cutoff tie.
3. Confirm top 3 provisional advancement.
4. Enter equal scores at ranks 3 and 4.
5. Confirm only the cutoff tie group is highlighted.
6. Confirm unrelated equal scores are not highlighted.
7. Test include-all.
8. Test manual selection.
9. Leave unresolved and confirm publication is blocked.
10. Finalise advancement.
11. Confirm advanced entries appear in the next round.
12. Confirm eliminated entries do not.

## Commit

```text
feat: add advancement and cutoff tie resolution
```

---

# Milestone 16 â€” Scheduled Leaderboards and Historical Results

## User-visible result

Organisers can preview, schedule, and release round leaderboards. Participants see countdowns and historical results.

## Build

Create:

- `supabase/migrations/014_leaderboards.sql`.

Implement:

- podium;
- ranked list;
- participant/team support;
- category winners;
- optional score display;
- search;
- preview;
- draft;
- scheduled publication;
- automatic visibility after release time;
- countdown;
- previous-round routes;
- advancement status;
- elimination message;
- leaderboard notifications;
- Realtime publication state;
- large-list performance;
- RLS.

Route:

```text
/competition/{competition-slug}/leaderboard/{round-slug}
```

## Acceptance test

1. Preview leaderboard as organiser.
2. Search by team or participant.
3. Confirm top-three podium.
4. Confirm category winners.
5. Hide scores and verify participant view.
6. Show scores and verify participant view.
7. Schedule future release.
8. Confirm participant sees countdown.
9. Reach release time and confirm automatic publication.
10. Confirm notification.
11. Publish another round.
12. Confirm previous round remains accessible.
13. Test with a large leaderboard dataset.

## Commit

```text
feat: add scheduled round leaderboards
```

---

# Milestone 17 â€” Certificate Template Editor and Dynamic Generation

## User-visible result

Organisers can create certificate templates visually, and eligible participants can dynamically generate and download their certificates.

## Build

Create:

- `supabase/migrations/015_certificates.sql`.

Implement:

- image template upload;
- template types;
- multiple templates;
- drag-and-drop dynamic fields;
- field positioning;
- font;
- font size;
- colour;
- alignment;
- value binding;
- preview;
- saved layout metadata;
- release state;
- eligibility mapping;
- participant request;
- dynamic image generation;
- dynamic PDF generation;
- download;
- no permanent duplicate generated certificate files;
- RLS.

Dynamic fields:

- participant full name;
- team name;
- competition name;
- organisation name;
- category;
- placement;
- round;
- award title;
- issue date.

Use authoritative advancement tags and results.

## Acceptance test

1. Upload a participation template.
2. Add participant name field.
3. Add competition name field.
4. Drag, style, align, and resize fields.
5. Preview with sample data.
6. Add winner and category-winner templates.
7. Save and reopen the editor.
8. Finalise results.
9. Enable certificate release.
10. Log in as participant.
11. Confirm only eligible certificates appear.
12. Generate an image.
13. Generate a PDF.
14. Confirm full name is used.
15. Confirm generated output is not stored as hundreds of permanent duplicates.
16. Attempt to access an ineligible certificate and confirm denial.

## Commit

```text
feat: add dynamic certificate generation
```

---

# Milestone 18 â€” Smart Recommendations and New-to-You Discovery

## User-visible result

Participants receive useful personalised suggestions while still being exposed to unfamiliar opportunities.

## Build

Create:

- `supabase/migrations/016_recommendations.sql` if persistent recommendation state is required.

Implement recommendation signals:

- previous registration fields;
- team versus individual history;
- bookmarks;
- age eligibility;
- upcoming deadlines;
- recent activity.

Implement:

- personalised section;
- `New to You` exploratory section;
- explanation labels where useful;
- fallback for new users;
- no restriction of the full catalogue;
- privacy-conscious logic.

## Acceptance test

1. Use a participant with team competition history.
2. Confirm relevant team competitions are suggested.
3. Use a participant with repeated field history.
4. Confirm matching fields are suggested.
5. Confirm ineligible competitions are not promoted as primary recommendations.
6. Confirm `New to You` contains deliberately different options.
7. Test a new account with no history.
8. Confirm sensible fallback recommendations.

## Commit

```text
feat: add personalised competition recommendations
```

---

# Milestone 19 â€” Achievements

## User-visible result

Participants earn and view meaningful achievements based on authoritative activity.

## Build

Create:

- `supabase/migrations/017_achievements.sql`.

Implement achievements for:

- first competition;
- multiple competitions;
- first team competition;
- first individual competition;
- first submission;
- first advancement;
- finalist;
- winner;
- category winner;
- other meaningful milestones.

Implement:

- award logic;
- progress;
- profile display;
- dashboard display;
- restrained reward animation;
- anti-manipulation controls;
- RLS.

## Acceptance test

1. Complete first registration.
2. Confirm first competition achievement.
3. Complete a first submission.
4. Confirm submission achievement.
5. Advance a participant.
6. Confirm advancement achievement.
7. Mark a winner.
8. Confirm winner achievement.
9. Confirm participants cannot grant themselves achievements.
10. Confirm achievement progress displays correctly.

## Commit

```text
feat: add participant achievements
```

---

# Milestone 20 â€” PWA Installation and Push Notifications

## User-visible result

Vertex is installable, provides a clean install experience, and supports push notifications only when installed.

## Build

Create:

- `supabase/migrations/018_push_subscriptions.sql` if needed.

Implement:

- manifest;
- icons;
- service worker;
- install prompt;
- session dismissal;
- installed-state detection;
- useful offline shell;
- update handling;
- push subscription storage;
- notification controls;
- installed-only enablement;
- install-first prompt;
- announcement pushes;
- leaderboard-result pushes;
- major deadline pushes where appropriate;
- unsupported-browser handling.

## Acceptance test

1. Open Vertex in a supported browser.
2. Confirm install prompt.
3. Dismiss it.
4. Confirm it remains hidden for the session.
5. Start a new session and confirm eligibility can return.
6. Install Vertex.
7. Open installed app.
8. Enable push notifications.
9. Confirm announcement push.
10. Confirm leaderboard-result push.
11. Test enable-push before installation.
12. Confirm Vertex asks for installation first.
13. Test unsupported environment.
14. Confirm graceful explanation.

## Commit

```text
feat: add PWA installation and push notifications
```

---

# Milestone 21 â€” Final Integration, Accessibility, Performance, and Release Validation

## User-visible result

Vertex behaves as a coherent, production-quality application across all supported flows and devices.

## Build

Complete:

- cross-feature integration;
- global error handling;
- consistent loading states;
- consistent empty states;
- responsive polishing;
- keyboard navigation;
- focus management;
- screen-reader labels;
- contrast review;
- reduced-motion review;
- large-data review;
- Realtime cleanup;
- query optimisation;
- lazy loading;
- code cleanup;
- removal of dead code;
- removal of all placeholders;
- documentation;
- final GitHub Pages deployment setup.

## Complete end-to-end regression

Test:

- public discovery;
- signup;
- login;
- persistent session;
- profile;
- organisation;
- competition creation;
- registration;
- teams;
- organiser collaboration;
- announcements;
- Q&A;
- meetings;
- submissions;
- scoring;
- tie resolution;
- advancement;
- leaderboards;
- certificates;
- recommendations;
- achievements;
- PWA installation;
- push notifications;
- dark mode;
- mobile;
- direct nested routes;
- custom 404.

## Fresh-project database validation

Before release:

1. Create a fresh Supabase project.
2. Apply `SCHEMA.sql`.
3. Confirm tables, constraints, indexes, functions, triggers, RLS, Storage buckets, Storage policies, and Realtime configuration are created.
4. Manually configure hosted Auth to use email/password with email confirmation disabled.
5. Create a temporary `config.js` using the fresh projectâ€™s public URL and anon/publishable-equivalent client key.
6. Run all critical end-to-end flows.
7. Confirm the clean project behaves equivalently to the development project.
8. Return the repository to the intended production configuration.

## Acceptance test

1. Every prior milestone acceptance test passes.
2. No required feature is mocked or incomplete.
3. No placeholder button remains.
4. No TODO represents unfinished required scope.
5. No privileged credential is exposed.
6. GitHub Pages deployment works.
7. Valid nested routes survive refresh.
8. Invalid routes show the custom 404.
9. Mobile, tablet, and desktop layouts work.
10. Light and dark modes work.
11. Reduced-motion mode works.
12. Accessibility review passes.
13. Large leaderboards and participant lists remain responsive.
14. Fresh-project `SCHEMA.sql` validation passes.
15. Production database configuration is restored.
16. Final logical commits exist.
17. Push to remote only after all checks pass.

## Commit

```text
chore: complete Vertex production release
```

---

# Final Completion Statement

Do not declare Vertex complete until all 21 milestones pass.

The final repository must be understandable and implementable using only:

- `AGENTS.md`;
- `ROADMAP.md`;
- `assets/logo.png`;
- the initial `.env` before its verified migration into `config.js`.

No external PRD should be required.
