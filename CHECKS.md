# Milestone 1 visual refinement — manual checks

## Global header and navigation

- [ ] Route: `/`, `/discover`, `/login`, and `/signup`
  - Viewport: 1366 × 768
  - Action: Open each route in sequence without resizing the browser.
  - Expected: The header container and right edge of its actions remain at exactly the same horizontal position; no content jumps when Login or Signup opens.

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Inspect the primary navigation, then hover “Log in”.
  - Expected: Navigation contains Home and Discover only; no Fields item appears; Log in gains a soft blue surface and accent text without shifting.

- [ ] Route: `/`
  - Viewport: 390 × 844 and 320 × 568
  - Action: Open the mobile menu.
  - Expected: The theme toggle and hamburger remain grouped against the right edge; the drawer contains Home, Discover, and Log in only; no horizontal scrolling occurs.

- [ ] Route: any implemented route
  - Viewport: desktop and mobile
  - Action: Use Tab to move through header controls.
  - Expected: Every link, the theme switch, and the menu button receive a clearly visible blue focus outline in logical order.

## Homepage narrative and opportunity grid

- [ ] Route: `/`
  - Viewport: 1366 × 768
  - Action: Watch the hero grid for at least 20 seconds without moving the pointer.
  - Expected: The grid remains unmistakable while its lines gently rise and fall; intersections subtly brighten; illumination travels through the line work; the loop has no visible jump. There are no particles, pointer reactions, parallax, or moving background gradient behind static lines.

- [ ] Route: `/`
  - Viewport: 390 × 844
  - Action: Watch the hero and read its heading while the grid moves.
  - Expected: “Find your next challenge.” remains continuously legible; the grid stays behind the copy and never creates distracting flashes or overlap.

- [ ] Route: `/`
  - Setup: Enable “Reduce motion” in the operating system or browser.
  - Action: Reload and observe the hero for 10 seconds.
  - Expected: A recognisable static grid is shown; no ambient grid movement occurs; all links and theme controls remain usable.

- [ ] Route: `/`
  - Viewport: 1366 × 768, 768 × 1024, and 390 × 844
  - Action: Scroll from the hero to the footer.
  - Expected: The story appears in order: why Vertex exists, the three-part competition journey, student and organiser value, what makes Vertex different, and the final invitation. The page contains no fake statistics, testimonials, or unavailable feature controls.

- [ ] Route: `/`
  - Viewport: 320 × 568 and 1600 × 1000
  - Action: Scroll from top to bottom.
  - Expected: Headings wrap without clipping, sections retain clear breathing room, justified surfaces remain aligned, and the page has no horizontal overflow.

- [ ] Route: `/`
  - Action: Hover and activate the primary and secondary calls to action.
  - Expected: Primary actions lift by about one pixel and directional arrows move slightly; secondary actions gain an accent-tinted surface; active controls compress briefly without glow or heavy shadow.

## Discover and field exploration

- [ ] Route: `/discover`
  - Viewport: 1366 × 768
  - Action: Inspect the field selector.
  - Expected: Twelve field buttons appear as one clearly grouped selection surface above the catalogue empty state; options use four columns and no separate Fields navigation is present.

- [ ] Route: `/discover`
  - Viewport: 390 × 844 and 320 × 568
  - Action: Scroll through the page.
  - Expected: Field options form one column, labels and icons do not collide, every control is at least 44px tall, and no horizontal scrolling occurs.

- [ ] Route: `/discover`
  - Action: Select Mathematics, Physics, and Design; then deselect Physics.
  - Expected: Each selected button independently gains an accent border, soft accent background, and visible check; the live text reports “3 fields selected.” then “2 fields selected.”; the URL and catalogue content do not change.

- [ ] Route: `/discover`
  - Action: Tab to Mathematics, press Enter, tab to Physics, and press Space.
  - Expected: Focus remains visible; both buttons expose a selected state and the status text reports “2 fields selected.”

- [ ] Route: `/discover`
  - Setup: Test light and dark themes.
  - Action: Hover an unselected option and compare it with a selected option.
  - Expected: Hover strengthens the border without obscuring text; selected state is distinguishable by border, background, and check—not colour alone.

- [ ] Route: `/discover`
  - Action: Reload the route directly.
  - Expected: Discover loads without a 404 flash and field selections return to their initial presentation-only state.

## Login and Signup previews

- [ ] Route: `/login`
  - Viewport: 1366 × 768
  - Action: Inspect the header and left visual panel.
  - Expected: The panel contains the Vertex logo; the header does not repeat it and instead shows “Back to Vertex”; Home, Discover, Log in, and the theme switch remain available.

- [ ] Route: `/signup`
  - Viewport: 1366 × 768
  - Action: Inspect the header, then activate “Back to Vertex”.
  - Expected: The header does not duplicate the logo; the back action is obvious, gains a hover treatment, and returns to `/`.

- [ ] Route: `/login`
  - Action: Read and activate the account switch below the preview action.
  - Expected: It says “Don’t have an account? Create one”; “Create one” opens `/signup`; no wording mentions routes.

- [ ] Route: `/signup`
  - Action: Read and activate the account switch below the preview action.
  - Expected: It says “Already have an account? Log in”; “Log in” opens `/login`; no wording mentions routes.

- [ ] Route: `/login` and `/signup`
  - Viewport: 390 × 844 and 320 × 568
  - Action: Scroll through each page and use the header controls.
  - Expected: The visual panel and preview panel stack cleanly, header actions remain right-aligned, text does not clip, and there is no horizontal overflow.

## Theme, states, and route preservation

- [ ] Route: `/`, `/discover`, `/login`, and `/signup`
  - Action: Toggle dark mode on each route.
  - Expected: The day/night switch animates to the new state, maintains its checked state and accessible name, and every changed surface remains readable in both themes.

- [ ] Route: `/`
  - Action: Choose dark mode, refresh, then navigate to Discover, Login, and Signup.
  - Expected: Dark mode persists without a light-theme flash.

- [ ] Route: `/randomgarbage`
  - Action: Load the URL directly and refresh it.
  - Expected: The existing custom 404 appears both times; its return actions work and no changed Milestone 1 route is broken.

- [ ] Route: every implemented route
  - Viewport: 320 × 568, 390 × 844, 768 × 1024, 1366 × 768, and 1600 × 1000
  - Action: Load directly, refresh, scroll fully, and navigate using only the keyboard.
  - Expected: No clipping, overlap, unexpected layout shift, or horizontal overflow occurs; active, hover, focus, and touch states remain observable and usable.
