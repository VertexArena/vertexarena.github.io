# Milestone 1 Manual Verification

Use the deployed GitHub Pages site unless a check explicitly calls for the local server. Start each viewport check in a fresh tab. The implemented Milestone 1 routes are `/`, `/discover`, `/discover/fields`, `/login`, `/signup`, and the custom 404 for invalid paths.

## Global shell and identity

- [ ] Route: every implemented route
  - Viewport: 1600 × 1000, 1366 × 768, 768 × 1024, 390 × 844, and 320 × 568
  - Action: Open each route and compare the header, page heading, section boundaries, and footer.
  - Expected: The same Geist typography, mono utility labels, thin convergence rails, square checkpoints, restrained blue accent, moderate radii, and shared borders appear consistently; no route resembles an unrelated card template.

- [ ] Route: every implemented route
  - Viewport: all five target sizes
  - Action: Scroll from top to bottom, then pan horizontally if the browser permits.
  - Expected: No horizontal page scrolling, clipping, overlapping text, cut-off focus ring, or content outside the viewport occurs.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Temporarily hide the `.brand` elements in browser developer tools.
  - Expected: The rail-led navigation, indexed competition journey, connected feature stages, tight display typography, and accented endpoints still form a recognisable single visual system.

- [ ] Route: `/`, `/discover`, and `/discover/fields`
  - Viewport: 1366 × 768
  - Action: Compare the hero journey, catalogue state, and field index.
  - Expected: The motif changes to match each structure—journey rail, status endpoint, and indexed destination grid—rather than repeating decorative triangles.

- [ ] Route: every implemented route
  - Viewport: 1366 × 768
  - Action: Inspect all blue elements.
  - Expected: Blue is used for primary actions, active navigation, focus, status/endpoints, and meaningful icons; large unrelated decorative regions do not compete for attention except the purposeful auth-route panel.

## Header, desktop navigation, and footer

- [ ] Route: `/`
  - Viewport: 1366 × 768 and 1600 × 1000
  - Action: Inspect the header at the top of the page and while scrolling.
  - Expected: The logo and `VERTEX` wordmark align left; Home, Discover, and Fields sit in the navigation; Log in and the theme switch align right; the sticky header remains stable and legible.

- [ ] Route: `/`, then `/discover`, then `/discover/fields`
  - Viewport: 1366 × 768
  - Action: Navigate using the desktop header links.
  - Expected: The current route is indicated by text contrast and an accent rail extending beneath the correct link; only one item is current.

- [ ] Route: `/discover/fields`
  - Viewport: 1366 × 768
  - Action: Hover Home, Discover, and Fields one at a time.
  - Expected: Each hover rail grows toward the destination without moving surrounding content; Fields remains visibly current after the pointer leaves.

- [ ] Route: every route with a footer
  - Viewport: 390 × 844 and 1366 × 768
  - Action: Scroll to the footer.
  - Expected: Desktop footer content shares one row; mobile footer content stacks with clear spacing; logo, tagline, and Discover link remain readable and tappable.

- [ ] Route: `/login`, `/signup`, and `/randomgarbage`
  - Viewport: 1366 × 768
  - Action: Scroll to the end of each page.
  - Expected: No footer is rendered on auth routes or the 404, preserving the full-height task/error layout.

## Mobile navigation and header controls

- [ ] Route: `/`
  - Viewport: 390 × 844 and 320 × 568
  - Action: Inspect the closed mobile header.
  - Expected: Logo/wordmark is on the left; the theme switch and hamburger form a tight group flush to the right page edge; neither control sits in the middle of the header.

- [ ] Route: `/`
  - Viewport: 320 × 568
  - Action: Confirm the header at the narrowest supported width.
  - Expected: The wordmark may hide, but the logo remains visible and the theme and menu controls remain fully inside the viewport with no overlap.

- [ ] Route: `/`
  - Viewport: 390 × 844
  - Action: Tap the hamburger once.
  - Expected: The button label changes from “Open navigation” to “Close navigation,” the icon becomes an X, body scrolling stops, and a full-height drawer enters from the right.

- [ ] Route: `/`
  - Viewport: 390 × 844
  - Action: With the drawer open, inspect all links and tap Discover.
  - Expected: Home, Discover, Fields, and Log in are at least 44px tall; the active route has an inset accent edge; tapping Discover closes the old view and renders `/discover` without a page reload.

- [ ] Route: `/discover`
  - Viewport: 768 × 1024
  - Action: Open the drawer, close it, and reopen it.
  - Expected: Each transition completes without flicker; `aria-expanded` and the accessible name match the visible state; Discover is marked current.

- [ ] Route: `/`
  - Viewport: 390 × 844
  - Action: Open the drawer, then press the browser Back button after navigating to Fields.
  - Expected: History returns to `/`; the page and current-route marker update correctly; the drawer does not remain stuck open.

## Theme switch and colour modes

- [ ] Route: `/`
  - Viewport: 390 × 844 and 1366 × 768
  - Action: Inspect the theme control in light mode.
  - Expected: It appears as a compact rectangular day/night track with a square thumb on the light endpoint, visible sun and moon cues, and a thin rail/checkpoint; it fits the Vertex geometry rather than looking like a generic icon button.

- [ ] Route: `/`
  - Viewport: 390 × 844 and 1366 × 768
  - Action: Activate the theme switch once.
  - Expected: Background, surfaces, borders, text, grid, and accent roles change together; the thumb moves to the dark endpoint; `aria-checked` becomes `true`; the accessible name becomes “Switch to light mode.”

- [ ] Route: `/`
  - Viewport: any
  - Action: Choose dark mode, refresh, navigate to `/discover`, close the tab, and reopen the site.
  - Expected: Dark mode persists across refresh, route changes, and browser restart according to local-storage behaviour; no light-theme flash appears before paint.

- [ ] Route: `/`
  - Setup: Clear the `vertex-theme` local-storage item and set the operating system to dark mode.
  - Viewport: any
  - Action: Open the site, then explicitly choose light mode and reload.
  - Expected: Initial mode follows the system only before an explicit choice; the explicit light choice overrides the system on reload.

- [ ] Route: every implemented route
  - Viewport: 1366 × 768
  - Action: Inspect both themes for text, borders, switch icons, buttons, status labels, and focus rings.
  - Expected: Essential content remains readable; inactive text remains distinguishable; accent-on-surface and white-on-accent controls have accessible contrast.

## Home page

- [ ] Route: `/`
  - Viewport: 1600 × 1000 and 1366 × 768
  - Action: Inspect the first viewport without scrolling.
  - Expected: The heading is left-led rather than generically centred; the line geometry converges toward a single blue vertex; the numbered Discover–Participate–Achieve rail reinforces the reading order without covering text.

- [ ] Route: `/`
  - Viewport: 390 × 844 and 320 × 568
  - Action: Inspect the hero and scroll through its stage rail.
  - Expected: Heading, copy, and actions reflow within the viewport; the three stages become a horizontal connected rail; no route geometry makes text unreadable.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Hover and activate “Explore competitions.”
  - Expected: Hover raises the button by approximately 2px, deepens the accent, and moves the arrow right; active press compresses it; activation opens `/discover`.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Hover and activate “Create account.”
  - Expected: Hover adds an accent border/subtle accent surface without a heavy shadow; activation opens `/signup`.

- [ ] Route: `/`
  - Viewport: 1366 × 768 and 768 × 1024
  - Action: Scroll to “Every action moves toward an outcome.”
  - Expected: Desktop shows three related stages sharing boundaries; tablet/mobile stacks them as one sequence; indexes read `01 / ENTRY`, `02 / PROGRESS`, `03 / OUTCOME`; checkpoints align to the shared rail.

- [ ] Route: `/`
  - Viewport: 320 × 568
  - Action: Scroll the complete page.
  - Expected: Both hero buttons remain fully tappable, body copy remains readable, feature content stays in order, and no 48px desktop gap creates an empty screen-sized hole.

## Discovery catalogue

- [ ] Route: `/discover`
  - Viewport: 1366 × 768 and 390 × 844
  - Action: Open the route directly.
  - Expected: The page title has a left rail and endpoint; field coverage labels form one shared strip rather than unrelated pills; the catalogue status appears as a connected empty-state region.

- [ ] Route: `/discover`
  - Viewport: 390 × 844 and 320 × 568
  - Action: Scroll through the field labels and empty state.
  - Expected: Labels wrap or remain within the viewport without horizontal scrolling; the diamond binocular marker sits above the copy on mobile and its connector remains visible.

- [ ] Route: `/discover`
  - Viewport: 1366 × 768
  - Action: Inspect the empty state.
  - Expected: It explicitly reads `Catalogue status / Awaiting first entry`, explains what will populate the catalogue, exposes no dead Create/Publish control, and does not look like a floating rounded card.

- [ ] Route: `/discover`
  - Setup: Throttle the network to Slow 3G and reload.
  - Viewport: 390 × 844
  - Action: Observe from initial HTML through rendered route.
  - Expected: The branded “Opening Vertex” boot state is visible without layout overflow, then the discovery layout replaces it without a 404 flash.

## Field index

- [ ] Route: `/discover/fields`
  - Viewport: 1600 × 1000, 768 × 1024, and 390 × 844
  - Action: Inspect the complete field list.
  - Expected: It renders as three columns on wide desktop, two on tablet, and one on mobile; each item shares borders with neighbours and has a unique two-digit index, field icon, name, and destination arrow.

- [ ] Route: `/discover/fields`
  - Viewport: 1366 × 768 with a mouse
  - Action: Hover Mathematics, Programming, and Innovation.
  - Expected: The hovered item gains an inset accent edge and subtle accent surface; its checkpoint fills and arrow moves right; the item does not float or resize the grid.

- [ ] Route: `/discover/fields`
  - Viewport: 390 × 844 touch device
  - Action: Tap Mathematics.
  - Expected: The URL becomes `/discover?field=mathematics`; the discovery page renders without reload or 404; no nonfunctional filter UI is added.

- [ ] Route: `/discover/fields`
  - Viewport: 320 × 568
  - Action: Tab to a field item and inspect the focus ring at the left and right viewport edges.
  - Expected: The full 3px focus outline is visible and not clipped; Enter follows the field link.

## Login and signup route previews

- [ ] Route: `/login`
  - Viewport: 1366 × 768 and 1600 × 1000
  - Action: Open directly and inspect both panels.
  - Expected: The blue panel contains the logo, a real route rail with three checkpoints, `Welcome back.`, and supporting copy; the light/dark surface panel contains `Access your workspace`, an information boundary, and the working Browse competitions action.

- [ ] Route: `/signup`
  - Viewport: 1366 × 768
  - Action: Open directly and compare with `/login`.
  - Expected: The same system is retained with signup-specific copy; no authentication form, fake input, or future Milestone 2 functionality is exposed.

- [ ] Route: `/login` and `/signup`
  - Viewport: 390 × 844 and 320 × 568
  - Action: Scroll from top to bottom.
  - Expected: The visual panel stacks above the content panel; headings wrap without clipping; the route rail remains restrained; actions are fully visible and at least 44px tall.

- [ ] Route: `/login`
  - Viewport: any
  - Action: Activate “Browse competitions,” then use the signup-route text link on `/signup` to return to `/login`.
  - Expected: Browse competitions opens `/discover`; “View login route” opens `/login`; link names match their destinations and no dead control appears.

- [ ] Route: `/login`
  - Viewport: 1366 × 768
  - Action: Toggle dark mode in the header, then inspect the right panel and information boundary.
  - Expected: The right panel uses dark surface/text/border tokens; the fixed blue visual panel remains legible; the theme control remains visible against both regions.

## Custom 404 and route recovery

- [ ] Route: `/randomgarbage`
  - Viewport: all five target sizes
  - Action: Paste the URL into a new tab.
  - Expected: The title is `Page not found - Vertex`; a branded `404`, “This path left the field.”, Return home, and Open discovery are visible; GitHub’s default 404 never appears.

- [ ] Route: `/randomgarbage`
  - Setup: WebGL available and reduced motion disabled.
  - Viewport: 1366 × 768
  - Action: Move the pointer slowly across the page.
  - Expected: The particle field responds subtly without obscuring text or moving controls; it does not resemble an unrelated 3D scene.

- [ ] Route: `/randomgarbage`
  - Setup: Disable WebGL or block the Three.js CDN request.
  - Viewport: 390 × 844 and 1366 × 768
  - Action: Reload.
  - Expected: The static dot fallback remains visible, the 404 content stays centred and legible, and both recovery actions work.

- [ ] Route: `/randomgarbage`
  - Setup: Enable operating-system reduced motion.
  - Viewport: any
  - Action: Reload and use Return home.
  - Expected: No animated WebGL scene starts; the static fallback appears; Return home renders `/` normally.

- [ ] Route: `/discover`, `/discover/fields`, `/login`, and `/signup`
  - Viewport: any
  - Action: Paste each nested URL in a new tab, reload it, then use browser Back/Forward.
  - Expected: GitHub Pages recovery preserves the exact path; no visible custom-404 flash or redirect flicker occurs; Back/Forward renders the correct route.

## Keyboard and visible accessibility

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Reload, press Tab once, then press Enter.
  - Expected: “Skip to content” becomes visibly focused on the first Tab; Enter moves focus to the main region without navigating away.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Continue tabbing through the header, hero actions, content links, and footer.
  - Expected: Focus follows DOM order, every interactive item has a visible 3px accent outline, and no hidden mobile control receives focus.

- [ ] Route: `/`
  - Viewport: 390 × 844
  - Action: Use only keyboard controls to focus and open the menu, move through drawer links, close it, and activate the theme switch.
  - Expected: All controls are reachable; accessible names match visible state; focus is visible; theme and navigation states update without pointer input.

- [ ] Route: every implemented route
  - Setup: Browser zoom at 200%.
  - Viewport: 1366 × 768
  - Action: Navigate and scroll each route.
  - Expected: Content reflows without two-dimensional scrolling, controls remain operable, and no text overlaps rail geometry or status markers.

- [ ] Route: `/`
  - Setup: Enable reduced motion.
  - Viewport: 1366 × 768
  - Action: Navigate, hover buttons, toggle theme, and open the mobile drawer at a narrow width.
  - Expected: Nonessential reveals and smooth scrolling are removed; state changes complete almost immediately; all functionality remains available.

## Loading, error, active, and unavailable states

- [ ] Route: `/`
  - Setup: Throttle the network and disable cache.
  - Viewport: 390 × 844
  - Action: Reload.
  - Expected: The loading state contains the Vertex logo and “Opening Vertex,” remains centred, and does not flash the wrong theme.

- [ ] Route: any implemented route
  - Setup: Block Google Fonts, Font Awesome, GSAP, and Three.js CDN requests one at a time.
  - Viewport: 390 × 844 and 1366 × 768
  - Action: Reload after each blocked request.
  - Expected: System fallbacks keep text readable; core links, routing, theme, and menu remain functional; missing optional motion or icons does not block use.

- [ ] Route: any implemented route
  - Viewport: any
  - Action: Review all controls in the current Milestone 1 shell.
  - Expected: Every visible control works. No disabled control, fake form, placeholder action, or future-feature navigation is present; therefore no disabled-state styling is exposed at this milestone.

- [ ] Route: `/`, `/discover`, and `/discover/fields`
  - Viewport: any
  - Action: Navigate among routes and observe current markers and status labels.
  - Expected: Active navigation and selected catalogue coverage use both colour and structural edges; empty catalogue status uses text plus a checkpoint; no state relies on colour alone.

## PWA metadata foundation

- [ ] Route: `/`
  - Setup: Use browser application/manifest tools or add the site to a supported mobile home screen.
  - Viewport: mobile
  - Action: Inspect the manifest identity and icon.
  - Expected: Name and short name are Vertex; standalone display metadata is present; `assets/logo.png` is used; start URL and scope are `/`.

- [ ] Route: `/`
  - Setup: Open browser developer tools and inspect the document head.
  - Viewport: any
  - Action: Check favicon, Apple touch icon, theme colour, manifest link, font imports, and initial theme script.
  - Expected: All Milestone 1 metadata exists, uses the Vertex logo/palette, and the theme script runs before the stylesheet to prevent a wrong-theme flash.

## Milestone boundary

- [ ] Route: every implemented route
  - Viewport: any
  - Action: Review navigation, page copy, and interactive elements.
  - Expected: Only Milestone 1 shell routes and behaviours are present. There are no profiles, authentication forms, organiser tools, competition creation, registration, teams, submissions, judging, meetings, scoring, leaderboards, certificates, prize distribution, recommendations, achievements, push controls, or other future-milestone scaffolds.
