# Milestone 1 Visual Verification

Use the deployed site unless a check specifies the local server. The implemented Milestone 1 routes are `/`, `/discover`, `/discover/fields`, `/login`, `/signup`, and the custom 404 shown for invalid paths.

## Global identity and breathing room

- [ ] Route: every implemented route
  - Viewport: 1600 × 1000, 1366 × 768, 768 × 1024, 390 × 844, and 320 × 568
  - Action: Open each route and scroll from top to bottom.
  - Expected: No horizontal scrolling, clipping, overlapping text, or content outside the viewport occurs.

- [ ] Route: `/`, `/discover`, `/discover/fields`, `/login`, and `/signup`
  - Viewport: 1366 × 768
  - Action: Compare headings, supporting copy, section spacing, borders, and icon treatments.
  - Expected: Pages share large confident typography, smaller supporting copy, generous whitespace, soft blue accents, quiet borders, and moderate radii without blueprint lines, diamonds, technical diagrams, or dense mono labels.

- [ ] Route: `/`
  - Viewport: 1600 × 1000
  - Action: Temporarily hide the logo and `VERTEX` wordmark with browser developer tools.
  - Expected: The living grid, open hero composition, spacious typography, restrained actions, and soft opportunity-focused surfaces still feel like one recognisable product.

- [ ] Route: every implemented route
  - Viewport: 1366 × 768
  - Action: Inspect all uses of blue.
  - Expected: Strong blue identifies actions, active navigation, focus, opportunity cues, and meaningful icons; decorative colour remains soft and does not resemble neon, AI gradients, or a control-room display.

- [ ] Route: every implemented route
  - Viewport: 1366 × 768
  - Action: Look for rails, construction lines, numbered process markers, diamonds, coordinates, status codes, and slash-separated technical labels.
  - Expected: None appear in the redesigned Milestone 1 surfaces.

## Header and navigation

- [ ] Route: `/`
  - Viewport: 1366 × 768 and 1600 × 1000
  - Action: Inspect the header before and after scrolling.
  - Expected: Logo and wordmark remain left-aligned; navigation, Log in, and theme toggle remain right-aligned; the header stays calm, stable, and readable over page content.

- [ ] Route: `/`, then `/discover`, then `/discover/fields`
  - Viewport: 1366 × 768
  - Action: Navigate using Home, Discover, and Fields.
  - Expected: The current destination uses accent text on a soft accent surface; no extending rail or industrial active marker appears; only one destination is current.

- [ ] Route: `/discover/fields`
  - Viewport: 1366 × 768
  - Action: Hover each desktop navigation link.
  - Expected: Hover adds a quiet soft surface without shifting the header or competing with the current-route treatment.

- [ ] Route: `/`
  - Viewport: 390 × 844 and 320 × 568
  - Action: Inspect the closed header.
  - Expected: Logo/wordmark stays left; the theme toggle and hamburger form a balanced group flush right; neither control sits in the centre or overlaps the brand.

- [ ] Route: `/`
  - Viewport: 320 × 568
  - Action: Inspect the narrowest header.
  - Expected: The wordmark may hide, but the logo, complete theme scene, and hamburger remain fully visible and touch friendly.

- [ ] Route: `/`
  - Viewport: 390 × 844
  - Action: Open and close the hamburger menu.
  - Expected: The drawer enters from the right without flicker; the icon and accessible label switch between open and close states; body scrolling is disabled while open.

- [ ] Route: `/discover`
  - Viewport: 390 × 844
  - Action: Open the drawer and inspect the active link.
  - Expected: Discover uses the same soft accent selection as desktop; links have comfortable spacing and at least 44px touch height; no inset rail appears.

## Theme toggle

- [ ] Route: `/`
  - Viewport: 1366 × 768 and 390 × 844
  - Action: Inspect the toggle in light mode without interacting.
  - Expected: A warm sun orb sits within a soft daylight-blue scene; subtle atmospheric rings surround it; small cloud forms sit low in the scene; the control is visually balanced inside a 44px touch target.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Hover the light-mode toggle.
  - Expected: The orb nudges slightly toward the right and rotates subtly; the control does not glow, enlarge, or shift nearby navigation.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Activate the toggle and watch the complete transition.
  - Expected: The orb crosses with a restrained spring; the moon surface slides into the orb; cloud forms leave downward; stars arrive from above; the scene changes to deep night; no individual layer visibly snaps.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Hover the dark-mode toggle, then return to light mode.
  - Expected: The moon nudges toward the left, and the reverse transition restores the complete daylight scene smoothly.

- [ ] Route: `/`
  - Viewport: 390 × 844
  - Action: Toggle theme repeatedly using touch with a short pause between activations.
  - Expected: Every tap changes theme exactly once; the complete scene remains clipped inside its rounded container; no moon spots, rings, clouds, or stars escape the control.

- [ ] Route: `/`
  - Viewport: any
  - Action: Use keyboard Tab to focus the toggle, then press Space and Enter on separate attempts.
  - Expected: A visible accent focus outline surrounds the control; each key changes the theme; `aria-checked` and the accessible name update to the new state.

- [ ] Route: `/`
  - Viewport: any
  - Action: Select dark mode, reload, navigate to `/discover`, and reopen the site in a new tab.
  - Expected: The chosen mode persists and appears before paint without a wrong-theme flash.

- [ ] Route: every implemented route
  - Viewport: 1366 × 768
  - Action: Compare light and dark themes.
  - Expected: Background, surface, text, border, icon, active navigation, button, grid, and toggle colours remain balanced and readable in both modes.

## Living opportunity grid

- [ ] Route: `/`
  - Viewport: 1600 × 1000 and 1366 × 768
  - Action: Watch the hero background for at least 20 seconds without moving the pointer.
  - Expected: The grid remains recognisable while its overall visibility breathes slowly; broad blue regions drift gently; selected intersections travel through a soft region; the animation loops without a noticeable jump.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Move the pointer rapidly across the hero.
  - Expected: The grid does not follow the pointer and no parallax or particle response occurs.

- [ ] Route: `/`
  - Viewport: 390 × 844 and 320 × 568
  - Action: Watch the hero grid for 15 seconds.
  - Expected: Motion remains subtle on mobile, does not cause scrolling or visible jank, and never reduces heading or button readability.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Compare the grid in light and dark themes.
  - Expected: Light regions are gentle in both modes; the dark grid gains slightly more depth without becoming sci-fi, glowing, or visually dominant.

- [ ] Route: `/`
  - Setup: Enable operating-system reduced motion.
  - Viewport: 1366 × 768 and 390 × 844
  - Action: Reload and observe the grid for 15 seconds.
  - Expected: Breathing, drifting, and travelling motion stops; a simplified static grid and soft light remain; all content and controls still work.

- [ ] Route: `/`
  - Setup: Open browser performance tools on a mid-range device profile.
  - Viewport: 390 × 844
  - Action: Record 15 seconds while the grid animates and scroll the hero once.
  - Expected: Animation is driven by opacity/transform with no repeated layout shifts; interaction remains responsive and no continuous long task is visible.

## Homepage composition

- [ ] Route: `/`
  - Viewport: 1600 × 1000 and 1366 × 768
  - Action: Inspect the first viewport without scrolling.
  - Expected: “Find your next challenge.” is the clear focal point; supporting copy and actions are compact; the secondary thought sits quietly at the far edge; the page feels exploratory rather than like an enterprise dashboard.

- [ ] Route: `/`
  - Viewport: 390 × 844 and 320 × 568
  - Action: Inspect the entire hero.
  - Expected: The large heading wraps confidently, supporting copy remains smaller, both actions fit without clipping, and the secondary thought follows with enough separation.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Hover and press “Explore competitions.”
  - Expected: The button rises by about 1px, deepens in blue, and moves the arrow slightly right; it has no heavy shadow, glow, or glass effect; activation opens `/discover`.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Hover and press “Create account.”
  - Expected: The border and soft surface strengthen gently, the button rises by about 1px, and activation opens `/signup`.

- [ ] Route: `/`
  - Viewport: 1366 × 768 and 768 × 1024
  - Action: Scroll to “From curiosity to something worth celebrating.”
  - Expected: The statement has generous surrounding space; three ideas use meaningful icon surfaces and concise copy without numbering, rails, shared construction borders, or process-diagram styling.

- [ ] Route: `/`
  - Viewport: 390 × 844
  - Action: Scroll through all three homepage ideas.
  - Expected: They become one spacious vertical sequence; each icon remains close to its heading; gaps distinguish ideas without creating accidental empty screens.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Read all homepage labels and copy.
  - Expected: No copy refers to competition infrastructure, systems, routes, entries, catalogue status codes, or platform architecture.

## Discovery page

- [ ] Route: `/discover`
  - Viewport: 1366 × 768 and 390 × 844
  - Action: Open directly and inspect the page heading.
  - Expected: “Discover” appears as a simple sentence-case eyebrow with no prefix line, slash label, rail, or endpoint; the title and copy have generous breathing room.

- [ ] Route: `/discover`
  - Viewport: 1366 × 768
  - Action: Inspect the field coverage labels.
  - Expected: Labels are calm rounded rectangles with readable text; All fields uses a soft accent treatment; the static labels do not appear to be enabled buttons.

- [ ] Route: `/discover`
  - Viewport: 390 × 844 and 320 × 568
  - Action: Scroll through coverage labels and the empty state.
  - Expected: Labels wrap within the viewport; the empty state stacks naturally; no horizontal scrolling or clipped radius occurs.

- [ ] Route: `/discover`
  - Viewport: 1366 × 768
  - Action: Inspect the empty state.
  - Expected: It uses one soft spacious container, a rounded binocular icon surface, an optimistic statement, and concise explanatory copy; there is no diamond, connector, status code, organiser-tool reference, or dead action.

## Field exploration page

- [ ] Route: `/discover/fields`
  - Viewport: 1600 × 1000, 768 × 1024, and 390 × 844
  - Action: Inspect all field destinations.
  - Expected: Destinations render in three, two, and one columns respectively; each uses a soft icon surface, field name, and arrow; no field number or decorative node appears.

- [ ] Route: `/discover/fields`
  - Viewport: 1366 × 768
  - Action: Hover Mathematics, Programming, and Innovation.
  - Expected: Each tile gains a subtle accent-tinted surface, slightly stronger border, 2px lift, and right-moving arrow without an inset rail or heavy shadow.

- [ ] Route: `/discover/fields`
  - Viewport: 390 × 844
  - Action: Tap Mathematics.
  - Expected: The URL becomes `/discover?field=mathematics` and the discovery page renders without reload or any new functionality.

- [ ] Route: `/discover/fields`
  - Viewport: 320 × 568
  - Action: Tab through the first and last visible field links.
  - Expected: Focus outlines remain fully visible and unclipped; Enter follows each destination.

## Login and signup route previews

- [ ] Route: `/login`
  - Viewport: 1366 × 768
  - Action: Inspect both panels.
  - Expected: The blue panel uses soft regions of depth rather than a rotated grid or route diagram; “Welcome back.” remains dominant; the right panel is quiet and spacious.

- [ ] Route: `/signup`
  - Viewport: 1366 × 768
  - Action: Compare with `/login`.
  - Expected: Signup-specific copy preserves the same calm optimistic identity; no form, fake input, authentication functionality, or future Milestone 2 interface appears.

- [ ] Route: `/login` and `/signup`
  - Viewport: 390 × 844 and 320 × 568
  - Action: Scroll each route from top to bottom.
  - Expected: The visual panel stacks above the content panel; headings wrap without clipping; the compass note and action remain readable and touch friendly.

- [ ] Route: `/login`
  - Viewport: 1366 × 768
  - Action: Inspect the “Explore before you join” note.
  - Expected: It uses one rounded soft surface and a compass icon; no diamond, connector, technical label, or system-status language appears.

- [ ] Route: `/login`
  - Viewport: any
  - Action: Activate Browse competitions and the login/signup route links.
  - Expected: Existing destinations work exactly as before; no authentication behavior has been introduced or changed.

## Footer, 404, loading, and accessibility

- [ ] Route: every route with a footer
  - Viewport: 1366 × 768 and 390 × 844
  - Action: Scroll to the footer.
  - Expected: The footer remains minimal and quiet; desktop content uses one row and mobile content stacks without crowding.

- [ ] Route: `/randomgarbage`
  - Viewport: 1366 × 768 and 390 × 844
  - Action: Open directly and inspect the header, eyebrow, buttons, and typography.
  - Expected: Global visual refinements apply consistently while the required Milestone 1 404 particle/WebGL treatment and recovery actions remain intact.

- [ ] Route: `/randomgarbage`
  - Setup: Enable reduced motion, then separately disable WebGL.
  - Viewport: any
  - Action: Reload after each setup change.
  - Expected: The static fallback remains readable and both recovery actions work.

- [ ] Route: `/`
  - Setup: Throttle the network and disable cache.
  - Viewport: 390 × 844
  - Action: Reload.
  - Expected: The logo and “Opening Vertex” remain centred, the chosen theme is applied before paint, and the hero appears without layout overflow.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Reload and press Tab once, then Enter.
  - Expected: Skip to content receives the first visible focus, and Enter moves focus to the main region.

- [ ] Route: every implemented route
  - Setup: Browser zoom at 200%.
  - Viewport: 1366 × 768
  - Action: Navigate and scroll each route.
  - Expected: Content reflows without two-dimensional scrolling; large headings, theme details, icons, buttons, and focus outlines remain usable.

## Milestone boundary

- [ ] Route: every implemented route
  - Viewport: any
  - Action: Review all navigation, copy, and controls.
  - Expected: Only Milestone 1 shell routes and existing behavior are present. No authentication forms, profiles, organiser tools, competition data, registration, teams, submissions, judging, meetings, scoring, leaderboards, certificates, prize distribution, recommendations, achievements, push controls, database changes, or future-milestone scaffolding appears.
