# Milestone 18 — recommendations

Completed 30 September 2026. Final acceptance run: **2 passed**.

## Implementation

Participant discovery includes **For you** and **New to You**, explanation labels,
an expandable privacy explanation, and a direct action to reach full-catalogue
search. Existing cards provide bookmarks, quick previews, prizes, deadlines,
organisation information, and detail links. Mobile recommendation rows scroll
horizontally with a visible next-card preview and keyboard scrolling. Search,
field, format, saved-only and pagination views focus on the ordinary catalogue.
Recommendations never restrict its published competition results.
The participant discovery header uses tighter spacing so the first suggestions
appear sooner. Public and organiser discovery retain their existing layout.

`016_recommendations.sql` adds an authenticated, participant-only RPC. It uses
only the caller's registered individual entries, registered team memberships,
and bookmarks. Both captains and ordinary team members receive their own team
history. Repeated fields and preferred entry format affect ranking. Registration
signals weigh twice as much as bookmark signals before recency adjustment.
Recent activity receives an exponential boost with a 90-day time constant;
deadline urgency and currently open registration break close matches.

Candidates must be published, have a future registration deadline, match the
participant's current birthday-derived age, and not already be registered by
that participant. Upcoming registration openings remain discoverable. First-time
participants receive eligible, deadline-aware picks across different fields.
New to You uses fields absent from the participant's entries and bookmarks;
without history it uses fields outside the starter picks. Sections do not repeat
the same competition. If no unfamiliar fields are available, the section says so
instead of describing familiar competitions as new.

There is no browsing tracker, new preference table, or shared participant model.
The endpoint accepts no participant ID or client-provided history. Its role and
identity checks use the authenticated account and persisted profile. A fixed empty
search path and schema-qualified references protect its security-definer execution.
That execution is necessary to read a registered team's state for ordinary members
without widening existing roster RLS. It returns at most six public competition
IDs and explanation labels, never birthdays or another participant's history.
Existing profile, registration, membership and bookmark RLS remains unchanged.

The connected Supabase app applied migration 016 to the existing project.
`SCHEMA.sql` includes the identical SQL. Hosted function grants were verified:
anonymous execution is revoked and authenticated execution is granted, with
organiser accounts rejected inside the function. The migration is present in
hosted migration history.

## Automated verification

`tests/e2e/milestone-18.spec.js` uses Chromium, the local HTTP server and actual
hosted Supabase accounts. Fixtures use public organiser authoring RPCs and UI
signup, team creation/invitations/acceptance/registration, individual registration,
bookmarks, discovery and previews. A controlled old timestamp on the caller's own
bookmark verifies recency against a new bookmark. Network interception exercises
loading and failure, then retries the real endpoint; recommendation data is never
mocked.

The suite covers the eight roadmap acceptance criteria plus privacy denials,
ordinary team-member history, bookmark updates, complete-catalogue access,
direct routes and refreshes, new-account diversity, no eligible candidates,
no unfamiliar fields, previews and detail links, independent catalogue loading,
retry recovery, keyboard focus after a recommendation leaves the list, mobile
keyboard scrolling, reduced motion, dark mode, public/organiser views, and public
pagination. Desktop, 320 px mobile and 768 px tablet captures support visual review.

Commands:

```text
npx playwright test tests/e2e/milestone-18.spec.js --project=laptop --workers=1 --output=test-results/m18-final
npx playwright test tests/e2e/milestone-1.spec.js --project=laptop --project=narrow-mobile --workers=1 --output=test-results/m18-core
npx playwright test tests/e2e/milestone-5.spec.js tests/e2e/milestone-6.spec.js --project=laptop --workers=1 --output=test-results/m18-discovery-regression
```

Core routing/theme/keyboard/reduced-motion regression passed: 19 tests, with the
existing desktop-only header check skipped at the narrow mobile viewport.
Discovery and registration regressions passed: three tests covering public
search, filters, previews, pagination, saved-only persistence, account-role
isolation, login return, confirmation/dashboard state, age and deadline blocks,
duplicate prevention and registration RLS.

Supabase security/performance advisors were reviewed. The new
[authenticated security-definer notice](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
is intentional for this guarded endpoint. The existing
[public profile view notice](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view)
and earlier performance findings remain; no new table or foreign key was added.

## Manual review

Final desktop, mobile light/dark, and tablet screenshots were inspected for
card hierarchy, wrapping, field/format/deadline/prize readability, reason labels,
horizontal mobile browsing and contrast. The reusable browser helper uses the
same pinned cached Supabase client when CDN traffic is blocked. Fonts and
cdnjs are disabled in those tests, so these captures exercise system-font
fallback; production Geist and Font Awesome references remain unchanged.

All Milestone 18, discovery-regression and registration-regression accounts and
competitions were removed through the connector. Follow-up counts confirmed
zero matching test accounts and competitions; the existing normal competition
remains. No profile pictures, organisation logos or test artwork were uploaded.

`CHECKS.md` contains human judgment checks for relevance with real account
history, unfamiliar-field usefulness, explanation clarity and device readability.
