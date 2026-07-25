# AGENTS.md

## About Browser Testing

Codex may use Playwright as a development and testing dependency.

All milestone acceptance tests that describe user interactions must be
automated through Playwright wherever practical.

Codex must:

- start the application through a local HTTP server;
- use a real browser engine;
- create the test accounts and application state required by the milestone;
- test relevant participant, organiser, and public perspectives;
- test direct route loads and refreshes;
- test desktop and mobile viewport sizes;
- capture screenshots when visual verification is relevant;
- retain reusable end-to-end test helpers between milestones.

Browser tests may use development test accounts and records in the existing
Supabase project. Test data must be clearly identifiable and must not interfere
with normal application data.

Visual appearance still requires reasonable screenshot inspection; passing DOM
assertions alone is not sufficient for visual acceptance criteria.

---

## 1. Purpose

Vertex is a production-quality platform for discovering, organising, managing, and participating in student competitions.

The repository begins essentially empty except for:

- `assets/logo.png`
- `.env`

This file and `ROADMAP.md` are the complete implementation specification. Do not rely on an external PRD.

Vertex must unify:

- competition discovery;
- registration;
- participant and team management;
- organiser collaboration;
- announcements;
- Q&A;
- meetings;
- submissions;
- judging;
- scoring;
- round advancement;
- leaderboards;
- certificates;
- notifications;
- achievements;
- organisation association.

The product must be complete, coherent, secure, responsive, accessible, and production quality.

---

## 2. Product Perspectives

### Participants

Participants are individual students who use Vertex to:

- discover competitions;
- search and filter opportunities;
- receive recommendations;
- register;
- form competition-specific teams;
- manage active and upcoming competitions;
- view announcements;
- ask questions;
- join assigned meetings;
- submit files and links;
- view current and previous leaderboards;
- receive advancement or elimination status;
- request and download eligible certificates;
- earn achievements;
- receive notifications.

### Organisers

Organisers are individual accounts that use Vertex to:

- create competitions;
- associate competitions with an organisation;
- invite other organisers to manage a competition;
- configure competition structures and rounds;
- manage registration;
- view participants and teams;
- publish announcements;
- answer questions;
- create meetings and assign attendees;
- configure and review submissions;
- define scoring criteria;
- enter scores;
- resolve cutoff ties;
- select advancing participants or winners;
- schedule leaderboard publication;
- manage certificates;
- view operational dashboards.

### Organisations

Organisation accounts represent entities such as schools or small organisations.

Organisation accounts are primarily read-only containers that:

- have a public profile;
- contain organisers;
- allow organiser-created competitions to be associated with the organisation;
- display competitions associated with the organisation.

Organisation accounts do not directly manage competitions unless acting through linked organiser accounts.

---

## 3. Non-Negotiable Quality Rules

1. Do not substitute requested features with different features.
2. Do not reduce scope without explicit approval.
3. Do not implement intentionally incomplete, simplified, “good enough,” mock, placeholder, simulated, or prototype versions of required features.
4. If a required feature cannot be implemented correctly, stop and clearly report the blocker.
5. Do not add placeholder buttons, dead links, fake data, fake APIs, TODO completion claims, or non-functional controls.
6. Every milestone must be fully testable end-to-end through the actual user interface.
7. Do not begin the next milestone until the current milestone’s acceptance test passes.
8. Preserve all previously completed behaviour.
9. Treat all user input as untrusted.
10. Enforce permissions in Supabase using RLS and policies, not only in frontend code.
11. Prefer maintainable, reusable architecture over shortcuts.
12. Assume the project may later become open source and maintained by multiple developers.
13. Do not silently make product decisions not covered by this specification.
14. When ambiguity remains, choose the interpretation that preserves more functionality, security, and user control.

---

## 4. Technology Stack

Use:

- vanilla HTML;
- vanilla CSS;
- vanilla JavaScript;
- Supabase Auth;
- Supabase Postgres;
- Supabase Storage;
- Supabase Realtime;
- GitHub Pages;
- CDN-hosted JavaScript libraries;
- History API routing;
- service worker;
- web app manifest;
- push notifications where supported;
- GSAP for advanced motion;
- Three.js for the 404 experience and only where justified;
- Font Awesome for icons;
- Geist as the primary font;
- Geist Mono for the `VERTEX` wordmark;
- Inter and system fonts as fallbacks.

Do not:

- use React, Vue, Angular, Svelte, Next.js, or another frontend framework;
- use hash routing;
- replace GSAP, Three.js, Supabase, or Font Awesome without explicit approval;
- introduce a build system unless genuinely required;
- introduce a backend server unless a requirement cannot be securely fulfilled through Supabase and static hosting.

---

## 5. Existing Repository and Environment

The repository starts with:

```text
assets/
  logo.png
.env
```

The existing `.env` contains:

```text
SUPABASE_PROJECT_URL
SUPABASE_ANON_KEY
```

`SUPABASE_ANON_KEY` is the legacy Supabase anon key.

It is:

- a public browser client key;
- not a service-role key;
- not a JWT signing secret;
- not a database password;
- not a Supabase management token.

Required behaviour:

1. Read the two values from `.env`.
2. Create a browser-readable `config.js`.
3. Copy only the public Supabase project URL and legacy anon key into `config.js`.
4. Verify the application works using `config.js`.
5. Delete `.env` only after successful verification.
6. Never expose privileged credentials.
7. Never invent, replace, rotate, or convert the provided key format.

Security must not depend on hiding the anon key.

---

## 6. Supabase Project Assumptions

Use the existing hosted Supabase project referenced by `.env`.

Do not:

- create another Supabase project;
- change project ownership;
- assume a fresh project exists;
- assume email verification is enabled.

Authentication configuration:

- email and password only;
- email verification is already disabled in the hosted project;
- signup should create an immediately usable session;
- no OAuth;
- no magic links;
- no verification screen;
- login must persist across refreshes and browser restarts according to Supabase session behaviour.

If signup does not return an active session, report the Auth configuration mismatch instead of redesigning the flow.

`SCHEMA.sql` cannot reliably configure every hosted Auth dashboard setting. Document manual project settings separately where necessary.

---

## 7. Database, Migrations, Storage, and Realtime

### 7.1 Canonical SQL files

Maintain:

```text
SCHEMA.sql
supabase/
  migrations/
    001_*.sql
    002_*.sql
    ...
```

Rules:

- migrations are chronological and immutable once applied;
- create one migration per logical database milestone;
- never modify an already-applied migration;
- corrections require a new migration;
- `SCHEMA.sql` must always represent the complete current schema for a clean installation;
- migrations are the historical source of truth;
- `SCHEMA.sql` is the consolidated bootstrap representation.

### 7.2 `SCHEMA.sql` must create

Where technically possible through SQL:

- extensions;
- enums;
- tables;
- foreign keys;
- unique constraints;
- check constraints;
- indexes;
- views;
- functions;
- triggers;
- grants;
- RLS enablement;
- RLS policies;
- Storage buckets;
- Storage object policies;
- Realtime publication configuration;
- helper functions;
- data integrity rules.

### 7.3 Required Storage categories

Store in Supabase Storage:

- competition banners;
- profile pictures;
- submissions;
- certificate templates.

Do not store generated certificates as permanent duplicate files. Generate them dynamically from templates and data.

### 7.4 Storage rules

Use private buckets unless public access is genuinely appropriate.

Enforce:

- ownership;
- competition membership;
- organiser permissions;
- allowed MIME types;
- configured size limits;
- a hard maximum of 25 MB for submission files;
- safe paths;
- no arbitrary overwrite of other users’ files;
- no public exposure of private submissions.

### 7.5 Realtime usage

Use Supabase Realtime for:

- announcements;
- Q&A;
- leaderboards and publication state;
- notifications;
- relevant competition state changes.

Subscribe only where needed and clean up subscriptions when views are destroyed.

---

## 8. Routing and GitHub Pages

Base domain:

```text
https://vertexarena.github.io
```

Use clean History API routes.

Examples:

```text
/
 /login
 /signup
 /discover
 /dashboard
 /profile/@username
 /organisation/organisation-slug
 /competition/competition-slug
 /competition/competition-slug/register
 /competition/competition-slug/announcements
 /competition/competition-slug/questions
 /competition/competition-slug/submissions
 /competition/competition-slug/leaderboard/round-slug
 /competition/competition-slug/certificates
 /competition/competition-slug/meeting/meeting-slug
 /organiser
 /organiser/competition/competition-slug
```

Requirements:

- no hash routing;
- direct navigation to nested routes must work on GitHub Pages;
- refreshes on nested routes must recover cleanly;
- do not briefly show the custom 404 during SPA recovery;
- do not create visible redirect flicker;
- invalid routes must render a real custom 404;
- `/randomgarbage` must show the custom 404;
- valid competition slugs must resolve correctly.

Use a GitHub Pages-compatible SPA fallback, such as a carefully implemented `404.html` redirect mechanism that preserves the intended path before application boot.

---

## 9. 404 Experience

Create a high-quality custom 404 page with:

- mouse-reactive animation;
- Three.js effects;
- tasteful particles;
- clear navigation back to Vertex;
- strong performance;
- responsive behaviour;
- reduced-motion support;
- graceful fallback if WebGL is unavailable.

The 404 must be aesthetic, but must not compromise usability or loading time.

---

## 10. Branding

Use `assets/logo.png`:

- in the website header;
- in authentication screens;
- as the favicon;
- as PWA icons where suitable;
- in appropriate empty states or branding moments.

The product name displayed beside the logo must be:

```text
VERTEX
```

Use Geist Mono specifically for the wordmark.

The platform name remains “Vertex” in prose.

---

## 11. Colour System

### Light mode

```text
Background:     #F8FAFC
Surface:        #FFFFFF
Primary Text:   #0F172A
Secondary Text: #64748B
Borders:        #DBE3EE
Accent:         #2563EB
```

### Dark mode

```text
Background:     #0B1120
Surface:        #111827
Primary Text:   #F8FAFC
Secondary Text: #94A3B8
Borders:        #1F2937
Accent:         #3B82F6
```

Requirements:

- default to light mode;
- provide a clean theme toggle;
- persist theme in local storage;
- respect system preference only before the user explicitly chooses;
- avoid flashes of the wrong theme on load;
- ensure accessible contrast.

---

## 12. Visual Design

The visual system must be:

- Swiss-inspired;
- minimal;
- calm;
- premium;
- trustworthy;
- information-first;
- productivity-oriented;
- responsive;
- consistent.

Use:

- large typography;
- strong visual hierarchy;
- generous whitespace;
- clear grids;
- 12–18 px corner radii;
- restrained shadows;
- clean cards;
- compact but readable metadata;
- meaningful empty states;
- consistent spacing tokens;
- reusable components.

Avoid:

- glassmorphism-heavy interfaces;
- neumorphism;
- excessive gradients;
- visual clutter;
- decorative animation that impairs comprehension;
- childish visuals;
- dense walls of controls;
- text arrows such as `-->`.

Use Font Awesome icons.

---

## 13. Motion and Microinteractions

### Revolut-inspired motion

Use:

- spring-like easing such as `cubic-bezier(0.16, 1, 0.3, 1)`;
- masked text reveals;
- staggered entrances;
- animated counters;
- shared-element-style transitions where feasible;
- pointer-responsive cards;
- fluid layout changes;
- lift, scale, and highlight sweeps on buttons;
- natural panel expansion;
- purposeful motion.

### Phantom-inspired discovery

Competition discovery should provide:

- clean card-based browsing;
- powerful search;
- fast filtering;
- immediate visibility of key information;
- minimal clicks to primary actions;
- rich previews;
- fast navigation;
- bookmarking;
- personalised recommendations;
- deadline awareness.

### Duolingo-inspired feedback

Use:

- tactile button compression;
- subtle icon movement;
- bookmark animations;
- animated checkmarks;
- naturally animated progress bars;
- smooth toggles;
- rewarding success states;
- pleasant loading states;
- satisfying but non-childish feedback.

### Accessibility

Respect:

```css
@media (prefers-reduced-motion: reduce)
```

All required functionality must remain available without advanced animation.

---

## 14. Reusable Component Expectations

Create reusable components or render helpers for:

- header;
- mobile navigation;
- sidebar;
- footer;
- buttons;
- inputs;
- selects;
- date/time fields;
- tag selectors;
- cards;
- competition cards;
- user rows;
- team rows;
- nested participant lists;
- modals;
- drawers;
- toasts;
- notification centre;
- tabs;
- badges;
- progress indicators;
- empty states;
- loading skeletons;
- error states;
- pagination;
- search;
- filters;
- breadcrumbs;
- data tables;
- leaderboard rows;
- podium;
- confirmation dialogs;
- upload controls;
- file previews;
- certificate canvas/editor controls.

Do not duplicate visually equivalent components across pages.

---

## 15. Account Types and Profiles

### 15.1 Account types

Support:

- participant;
- organiser;
- organisation.

### 15.2 Participant and organiser profile fields

Include:

- full name;
- unique username;
- account type;
- profile picture;
- bio/about;
- birthday;
- optional school or affiliation;
- optional location;
- multiple social links;
- created date;
- profile visibility fields where appropriate.

### 15.3 Birthday and age enforcement

Participants must provide their date of birth.

Use birthday to:

- calculate current age;
- enforce competition minimum and maximum age limits;
- prevent registration when outside the allowed range;
- explain why registration is unavailable;
- avoid relying on a manually entered “age” number;
- handle age changes over time correctly.

Organisers may define:

- minimum age;
- maximum age;
- both;
- neither.

Never expose a participant’s full date of birth publicly.

### 15.4 Username rules

Usernames must:

- be unique;
- be searchable;
- be case-insensitively unique;
- use a controlled character set;
- appear as `@username`;
- show beneath the full name throughout the interface.

Certificates use the participant’s full name, not username.

### 15.5 Organisation profiles

Include:

- organisation name;
- unique slug;
- logo;
- description;
- website;
- social links;
- associated organisers;
- associated competitions.

Organisation accounts are primarily read-only.

---

## 16. Authentication and Public Access

Unauthenticated users may:

- browse competitions;
- search;
- filter;
- view public competition details;
- view public organisation profiles;
- view published public leaderboards where appropriate.

Authentication is required to:

- register;
- bookmark;
- create teams;
- submit;
- ask questions;
- join restricted meetings;
- access notifications;
- request certificates;
- create or manage competitions.

Protected routes must redirect cleanly to login and return users to the intended destination after authentication.

---

## 17. Competition Model

Each competition must support:

- name;
- unique slug;
- organiser ownership;
- optional organisation association;
- field tags;
- prize details;
- prize distribution placeholder;
- minimum age;
- maximum age;
- team mode;
- banner;
- description;
- categories;
- structure;
- rounds;
- timeline;
- registration status;
- visibility/status;
- certificate configuration;
- announcement state;
- submission configuration;
- leaderboard configuration;
- creation and update timestamps.

### 17.1 Field tags

Use preset fields such as:

- mathematics;
- physics;
- chemistry;
- biology;
- programming;
- robotics;
- research;
- writing;
- design;
- business;
- debate;
- innovation;
- general STEM.

Allow multiple field tags.

### 17.2 Banner

Support:

- uploaded image;
- solid colour option;
- gradient option.

Provide preview and accessible text treatment.

### 17.3 Team mode

Support:

- individual only;
- team only;
- both.

For team competitions, organisers must be able to configure:

- minimum team size;
- maximum team size.

### 17.4 Categories

Support optional categories for:

- category-specific participation;
- category winners;
- certificate fields;
- leaderboard labels.

### 17.5 Prize information

Collect prize details during competition creation.

Create a prize distribution section labelled:

```text
Coming Soon
```

Do not implement actual prize distribution in this version.

---

## 18. Competition Structure and Rounds

Support conventional and custom structures.

Examples:

- direct top 3;
- direct top X;
- top 100 → top 30 → top 3;
- multi-round custom advancement;
- multiple rounds ending in winners.

Each round must support:

- name;
- slug;
- sequence;
- advancement count where applicable;
- start time;
- submission deadline;
- judging state;
- leaderboard state;
- publication time;
- status.

Organisers must be able to customise values such as `top X`.

Previous round leaderboards must remain accessible at stable URLs.

---

## 19. Timeline

Competition timelines must include datetime values for:

- registration opening;
- registration deadline;
- competition start where relevant;
- each round’s opening;
- each round’s submission deadline;
- judging period where applicable;
- leaderboard release;
- certificate availability.

Requirements:

- validate chronological consistency;
- prevent impossible timelines;
- display localised dates and times;
- display countdowns;
- clearly show overdue and upcoming deadlines;
- use actual timestamps for access enforcement.

---

## 20. Competition Discovery

The public and participant discovery experience must support:

- all upcoming competitions;
- in-progress competitions relevant to the participant;
- registered competitions not yet started;
- search by name;
- field filters;
- team-mode filters;
- age eligibility awareness;
- deadline sorting;
- bookmarks;
- rich card previews;
- organisation information;
- prize information;
- participant/team mode;
- dates;
- field tags;
- registration state.

### 20.1 Smart recommendations

Recommendations must consider:

- prior registrations;
- field interests inferred from behaviour;
- team versus individual history;
- bookmarks;
- age eligibility;
- active and upcoming deadlines.

Include a deliberately exploratory section such as:

```text
New to You
```

This section should intentionally include competitions outside the participant’s usual behaviour.

Recommendations must not prevent access to the complete discovery catalogue.

---

## 21. Registration

Registration must enforce:

- authenticated participant account;
- age eligibility;
- registration deadline;
- competition status;
- team mode;
- team-size rules;
- category selection where required;
- duplicate registration prevention;
- required participant data.

Support:

- individual registration;
- team registration;
- both, depending on competition configuration.

After successful registration:

- show confirmation;
- create an in-app notification;
- provide clear next steps;
- make the competition appear in the participant dashboard.

---

## 22. Teams

Teams are competition-specific.

Participants must be able to:

- create a team;
- name the team;
- invite participant accounts by `@username`;
- view pending invitations;
- accept or decline invitations;
- leave where rules permit;
- see member list;
- identify the team owner/captain;
- complete registration once team constraints are satisfied.

Enforce:

- no duplicate team names within a competition where practical;
- one active registration identity per participant per competition;
- minimum and maximum team size;
- team membership permissions;
- invitation expiry or cancellation where appropriate;
- no unauthorised member removal.

Organiser participant views must show:

- team as the parent row;
- members nested beneath it;
- individual participants separately where applicable.

---

## 23. Organiser Competition Creation

Competition creation must be a complete guided flow.

Collect:

- name;
- field tags;
- prize details;
- age limits;
- team mode;
- team-size rules;
- categories;
- structure;
- rounds;
- description;
- banner;
- certificate template status;
- timeline;
- organisation association;
- visibility/draft state.

Use:

- validation;
- progress indication;
- review step;
- save state;
- clear error recovery;
- final preview.

Do not publish incomplete competitions accidentally.

Once published, the competition becomes discoverable according to its status.

Organisers must be able to edit competition details without corrupting registrations or historical results.

---

## 24. Organiser Dashboard

The organiser dashboard must show:

- all competitions they manage;
- status;
- registration counts;
- participant counts;
- team counts;
- upcoming deadlines;
- unanswered questions;
- pending submissions;
- upcoming meetings;
- unpublished or scheduled leaderboards;
- certificate readiness;
- recent activity.

Within a competition, provide a dedicated organiser workspace.

---

## 25. Competition Organiser Team

Primary organisers can invite other organiser accounts by `@username`.

Requirements:

- invite notification;
- accept/decline flow;
- role-based access;
- prevent participant accounts from being added as organisers;
- display current organiser team;
- allow safe removal where permitted;
- preserve at least one valid owner;
- organisation association where relevant.

---

## 26. Announcements

Organisers can publish announcements to competition participants.

Requirements:

- title or concise heading;
- body;
- author;
- timestamp;
- realtime appearance;
- in-app notification;
- push notification when enabled and supported;
- history;
- participant read state where practical;
- organiser editing rules;
- organiser deletion rules;
- loading, success, and error states.

Announcements are not a general free-form group chat. They are organiser-to-participant broadcast communication.

---

## 27. Q&A

Participants can:

- post questions;
- view questions;
- view organiser replies;
- receive updates.

Organisers can:

- view new questions;
- reply;
- edit replies where appropriate;
- resolve or mark answered.

Requirements:

- realtime updates;
- organiser notifications for new questions;
- participant notifications for replies;
- clear authorship;
- timestamps;
- permission enforcement;
- empty and error states.

---

## 28. Meetings

Use Jitsi iframe API.

Organisers can:

- create a meeting;
- define a unique meeting name within a competition;
- generate a slug;
- assign specific participants or teams;
- start or open the meeting;
- view assigned attendees.

Participant access:

- only assigned participants or teams see the meeting link;
- unauthorised users cannot access the embedded meeting route;
- organiser team members with permission may access.

Route format:

```text
/competition/{competition-slug}/meeting/{meeting-slug}
```

The meeting page must:

- use a full-screen Jitsi iframe;
- preserve Vertex access control before loading Jitsi;
- display clear loading and error states;
- support leaving or returning to the competition;
- work responsively.

Meeting names must be unique within a competition.

---

## 29. Submissions

Each round may have a submission configuration.

Organisers configure:

- whether submissions are enabled;
- file uploads;
- links;
- both;
- allowed file types;
- configured file size limit;
- instructions;
- opening time;
- closing time.

Hard rule:

```text
No individual uploaded submission file may exceed 25 MB.
```

Participants can:

- submit before deadline;
- upload allowed files;
- add allowed links;
- combine files and links when configured;
- review submission;
- replace or edit before deadline where allowed;
- receive confirmation.

Organisers can:

- view submissions by round;
- filter by participant/team;
- open files securely;
- open submitted links;
- see timestamps;
- distinguish late, missing, and valid submissions;
- export metadata where practical.

Do not expose submissions publicly.

---

## 30. Scoring

Organisers can define scoring criteria per round.

Each criterion must support:

- name;
- maximum marks;
- optional description;
- order.

Organisers can:

- enter scores for participants or teams;
- edit scores before results are finalised;
- view totals;
- detect incomplete scoring;
- sort by score;
- optionally show or hide scores publicly.

Scoring must automatically determine provisional advancement according to the round’s `top X` setting.

Do not silently break ties at the cutoff.

---

## 31. Cutoff Tie Resolution

When a tie crosses the advancement cutoff, highlight only the tied boundary group.

Example:

- top 100 advances;
- ranks 100 and 101 have equal scores;
- highlight that cutoff tie.

Do not highlight irrelevant equal scores elsewhere.

Organisers must be able to:

- include all tied entries;
- exclude all tied entries where logically valid;
- manually choose which tied entries advance;
- leave the decision unresolved temporarily.

Do not publish final advancement while a required cutoff decision remains unresolved.

---

## 32. Leaderboards

Leaderboards must support:

- current round;
- prior rounds;
- top-three podium where appropriate;
- ranked list;
- participants or teams;
- category winners;
- search by participant or team name;
- optional score visibility;
- advancement status;
- published, scheduled, and countdown states;
- large result sets such as 500 participants.

Organisers can:

- preview;
- finalise;
- schedule release;
- publish;
- resolve ties;
- select winners or advancing entries.

Participants:

- see countdown before scheduled release;
- receive result notifications;
- see whether they advanced;
- see elimination messaging where relevant;
- retain access to previous published leaderboards.

Stable route example:

```text
/competition/{competition-slug}/leaderboard/{round-slug}
```

Participants or teams that do not advance must not appear as active entries in the next round.

---

## 33. Advancement Tags and Eligibility State

When an organiser advances a participant or team:

- store competition-specific advancement state;
- preserve round history;
- assign internal eligibility tags such as top 100, top 30, finalist, winner, category winner;
- apply team-derived eligibility to eligible team members;
- use these states for certificate access;
- never rely only on current leaderboard position.

These tags must be derived from authoritative result state and protected from participant modification.

---

## 34. Certificates

### 34.1 Template upload

Organisers upload certificate templates as images.

Store templates in Supabase Storage.

Support multiple templates, such as:

- participation;
- top 100;
- finalist;
- overall winner;
- category winner;
- custom placement.

### 34.2 Drag-and-drop editor

Provide a proper visual editor that allows organisers to:

- add dynamic text fields;
- drag fields;
- resize or reposition fields;
- configure font;
- configure font size;
- configure colour;
- configure alignment;
- configure value source;
- preview output;
- save layout metadata.

Dynamic fields may include:

- participant full name;
- team name;
- competition name;
- organisation name;
- category;
- placement;
- round;
- award title;
- issue date.

### 34.3 Preview

Support preview data using:

- organiser name or fixed sample name;
- random category;
- random placement;
- configured competition data.

Preview must accurately reflect generated placement and typography.

### 34.4 Dynamic generation

When a participant requests a certificate:

- determine eligibility;
- select matching template;
- render fields dynamically;
- generate image or PDF;
- provide download;
- do not permanently create hundreds of duplicate certificate files;
- do not trust participant-supplied eligibility.

Certificates become accessible only after organisers enable certificate release following final results.

---

## 35. Prize Distribution

Create a visible prize distribution section.

It must display:

```text
Coming Soon
```

Prize details must still be stored and shown where appropriate.

Do not implement monetary or physical prize distribution in this version.

---

## 36. Participant Dashboard

The participant dashboard must distinguish:

- upcoming registered competitions;
- in-progress competitions;
- completed competitions;
- pending team invitations;
- approaching deadlines;
- unread announcements;
- assigned meetings;
- pending submissions;
- available leaderboards;
- available certificates;
- achievements.

“In progress” means registered and currently active.

“Upcoming” means registered but not yet started, including competitions whose registration has not yet closed when appropriate.

---

## 37. Notifications

### 37.1 In-app notifications

Support notifications for:

- team invitations;
- organiser invitations;
- submission confirmation;
- announcements;
- Q&A activity;
- meeting assignments;
- leaderboard publication;
- advancement or elimination;
- certificate availability;
- relevant deadline reminders.

Provide:

- unread count;
- notification centre;
- mark-as-read;
- mark-all-as-read;
- deep links;
- realtime updates.

### 37.2 Push notifications

Push notifications are especially important for:

- announcements;
- leaderboard results;
- major deadline reminders;
- meeting assignments where appropriate.

Push notification controls must be easy to find.

Push notification enablement is available only when Vertex is installed as a PWA.

If a user attempts to enable push before installation:

- explain the requirement;
- prompt them to install Vertex;
- do not request notification permission prematurely.

Handle unsupported browsers gracefully.

---

## 38. PWA

Vertex must be installable.

Implement:

- manifest;
- icons;
- display mode;
- theme colours;
- service worker;
- install prompt;
- offline shell or useful offline fallback;
- update handling;
- session-aware install banner.

Install prompt behaviour:

- show a clear install action when eligible;
- clicking installs Vertex;
- if dismissed, hide it for the current session;
- do not repeatedly nag during the same session.

Push notifications must follow the installed-app rule above.

---

## 39. Achievements

Participants should receive achievements such as:

- first competition;
- multiple competitions;
- first team competition;
- first individual competition;
- first submission;
- first advancement;
- finalist;
- winner;
- category winner;
- participation streak or similar meaningful milestones.

Achievements must:

- be based on authoritative activity;
- avoid easy client-side manipulation;
- display progress where appropriate;
- appear in the participant profile or dashboard;
- provide satisfying but restrained feedback.

---

## 40. Validation and Error Handling

Every form and action must include:

- required-field validation;
- format validation;
- logical validation;
- database constraint handling;
- duplicate handling;
- permission errors;
- loading state;
- success state;
- retryable error state;
- destructive-action confirmation.

Examples:

- invalid username;
- duplicate username;
- impossible timeline;
- age ineligibility;
- expired registration;
- duplicate registration;
- invalid team size;
- repeated meeting name;
- submission after deadline;
- oversized upload;
- unsupported file type;
- unresolved cutoff tie;
- unauthorised route access.

Never rely only on client-side validation.

---

## 41. Accessibility

Meet WCAG-oriented expectations.

Require:

- semantic HTML;
- keyboard navigation;
- visible focus states;
- labelled form fields;
- accessible modals;
- accessible colour contrast;
- ARIA only where necessary;
- reduced-motion support;
- screen-reader-friendly status messages;
- accessible tables;
- non-colour-only indicators;
- responsive zoom behaviour;
- alt text for meaningful images.

---

## 42. Performance

Optimise for:

- fast initial load;
- static hosting;
- deferred non-critical libraries;
- lazy-loaded Three.js;
- compressed assets;
- efficient Supabase queries;
- pagination;
- indexed search fields;
- controlled Realtime subscriptions;
- cleanup of listeners and observers;
- large participant lists;
- leaderboards with hundreds of entries;
- mobile devices.

Do not load the 404 Three.js scene or certificate editor code on unrelated pages.

---

## 43. Security

Require:

- RLS on all exposed application tables;
- least-privilege policies;
- secure Storage policies;
- role checks;
- organiser ownership checks;
- team membership checks;
- registration checks;
- competition visibility checks;
- no service-role key in frontend;
- no insecure direct object access;
- sanitised rich or user-authored content;
- safe external links;
- controlled file types;
- server-authoritative timestamps where needed;
- no trust in client-provided roles, scores, eligibility, advancement, or certificate entitlement.

Organisation and organiser relationships must not allow privilege escalation.

---

## 44. Testing and Milestone Completion

A milestone is complete only when:

1. its full user-visible flow works;
2. all routes work directly and after refresh;
3. database changes are applied;
4. RLS is verified using appropriate user roles;
5. loading, success, empty, and error states work;
6. responsive layouts work;
7. previous milestone flows still work;
8. acceptance tests in `ROADMAP.md` pass;
9. SQL files are updated where required;
10. a logical Git commit is made.

Do not claim completion from code inspection alone.

---

## 45. Git Workflow

The repository is already connected to GitHub.

Rules:

- make small, logical commits;
- commit only completed functional milestones;
- use clear commit messages;
- do not combine unrelated milestones;
- do not rewrite remote history unless explicitly instructed;
- do not push until every roadmap milestone is complete and tested.

---

## 46. Final Definition of Done

Vertex is complete only when:

- every milestone in `ROADMAP.md` passes;
- the application works on GitHub Pages;
- valid nested routes survive refresh;
- invalid routes show the custom 404;
- Auth works with email and password without verification;
- sessions persist;
- `SCHEMA.sql` represents the complete current database;
- all migrations are present;
- Storage buckets and policies work;
- Realtime features work;
- PWA installation works;
- push notification eligibility rules work;
- responsive behaviour works;
- light and dark modes work;
- no placeholders or incomplete required features remain;
- no external PRD is needed to understand or maintain the implementation.

---

## 47. Additional Milestone Execution Requirements

These requirements supplement the roadmap for future sessions:

- Use Playwright for browser-verifiable milestone acceptance criteria and install required Playwright dependencies when needed.
- If automated verification is impossible, report the exact gap and list the manual verification required.
- At each milestone completion, mark that milestone complete in `ROADMAP.md`.
- Replace `CHECKS.md` at each milestone with a user-facing checklist of core milestone behaviour and checks the user should perform. Do not duplicate automated tests already performed.
- Complete, verify, commit, and push each requested milestone when the active user request explicitly requires a milestone push. This explicit request overrides the general delayed-push rule for that milestone.
