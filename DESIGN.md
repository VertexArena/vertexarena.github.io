# Vertex Design System

## Design thesis

Vertex is a living landscape of student opportunities. Opening it should create the quiet anticipation of wondering what challenge might appear next.

The interface suggests a wide field of possibility through depth, breathing space, gentle movement, and confident typography. It does not depict a sea literally. There are no waves, water graphics, ships, maps, or illustrative scenery. The feeling comes from a softly alive grid beneath the hero, content that seems to emerge from depth, and compositions that leave room for curiosity.

The product remains trustworthy and organised, but organisation serves discovery. Vertex should never feel like infrastructure, a control room, an engineering diagram, or enterprise documentation.

## Brand character

- Calm: surfaces are quiet and motion is slow enough to disappear from conscious attention.
- Ambitious: large statements and generous space give opportunities significance.
- Optimistic: accent light and open composition suggest something worthwhile ahead.
- Intelligent: hierarchy is clear, copy is specific, and detail is restrained.
- Exploratory: actions and transitions invite movement into another field or possibility.
- Trustworthy: typography, contrast, interaction states, and spacing are consistent.
- Lightweight: structure is present without heavy borders, dense metadata, or visual machinery.

## Signature motif: the opportunity landscape

The hero grid is the primary identity device. It represents a broad landscape of opportunities beneath the visible interface. The grid itself moves: its lines rise and fall together, its intersections participate, and soft illumination travels through the topology. A moving gradient behind static lines does not satisfy the motif.

The grid must:

- remain visibly geometric and easy to recognise;
- deform by only a few pixels so its topology gently ebbs without losing its structure;
- contain broad, soft regions of blue light expressed through the line work;
- allow intersections to brighten as illumination passes;
- loop without a visible reset;
- stay behind content and preserve readability;
- use one low-power canvas capped for pixel density and animation rate;
- become static and simpler under reduced motion.

The grid is not a blueprint. Do not add measurements, nodes, routes, arrows, diamonds, labels, coordinates, or technical diagrams to it. Do not repeat the full motif throughout every page. Its strength comes from being the memorable opening moment.

## Design laws

1. Important screens create a sense of possibility, direction, or meaningful consequence.
2. Whitespace carries confidence. It separates ideas, creates anticipation, and protects readability.
3. The hero grid is the dominant atmospheric device; supporting pages remain quiet.
4. Accent colour is reserved for actions, active state, focus, opportunity, progress, and achievement.
5. Decorative geometry must never resemble CAD, engineering, infrastructure, or a government system.
6. Participant-facing pages feel open and motivating without becoming playful or childish.
7. Organiser-facing pages may become denser in later milestones, but must keep the same calm hierarchy and breathing room.
8. Motion communicates discovery, transition, feedback, or a change in atmosphere.
9. Copy speaks from the student’s perspective, not the platform’s architecture.
10. Every component remains readable, accessible, and usable without animation.

## Typography

- Primary family: Geist for headings, body copy, navigation, controls, and interface text.
- Identity family: Geist Mono for the `VERTEX` wordmark only, plus genuinely useful compact data in later milestones.
- Fallback: Inter and system sans serif; `ui-monospace` for mono fallback.
- Display headings: weight 600–700, tight tracking between `-0.045em` and `-0.07em`, line-height `0.85–1.0`.
- Utility page titles: `clamp(2rem, 3.7vw, 3.25rem)` with 1.12 line-height.
- Public landing/display typography retains the larger expressive scale.
- Section titles: `clamp(2.2rem, 5vw, 4.7rem)`.
- Body copy: 16px base with line-height 1.6–1.75.
- Eyebrows: 12–13px, sentence case, modest tracking, no decorative prefix.
- Keep supporting copy visibly smaller than large statements.
- Avoid tiny technical labels, slash-separated labels, ornamental numbering, and uppercase metadata unless the information genuinely requires it.

## Colour roles

The required Vertex palette remains unchanged.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Background | `#F8FAFC` | `#0B1120` | Page canvas |
| Surface | `#FFFFFF` | `#111827` | Content and controls |
| Primary text | `#0F172A` | `#F8FAFC` | Statements and essential information |
| Secondary text | `#64748B` | `#94A3B8` | Supporting copy and inactive information |
| Border | `#DBE3EE` | `#1F2937` | Quiet containment and separation |
| Accent | `#2563EB` | `#3B82F6` | Action, focus, active state, possibility |

Derived accent tints may create soft atmospheric light or active surfaces. They must not become glowing neon, gradient text, or a purple-blue AI gradient. Semantic success, warning, and error colours are used only for real states.

## Spacing and sizing

- Base spacing unit: 4px.
- Preferred scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128px.
- Page width: maximum 1180px; 24px desktop gutters and 16px mobile gutters.
- Header: 76px desktop and 68px mobile.
- Touch targets: at least 44×44px.
- Body text measure: generally no more than 65 characters per line.
- Marketing sections: 76–132px responsive vertical space.
- Utility pages: 32px top / 64px bottom; phones: 24px top / 48px bottom.
- Shared utility headings and their content have a 32px gap.
- Use larger gaps between ideas and smaller gaps within one idea.
- Do not fill empty space with labels, rules, badges, or geometry merely to make the page appear designed.

## Layout rules

- Heroes are left-led, asymmetrical, and spacious rather than generically centred.
- One large statement owns the first viewport. Supporting copy and actions remain compact.
- Secondary thoughts may sit at the edge of a composition, but never compete with the primary message.
- Related items may use a functional grid, but should have room between them instead of sharing dense construction lines.
- Cards are used only where grouping or destination is real: a selectable field group, an audience comparison, a closing decision, or an empty-state container.
- The homepage moves from curiosity to context, journey, audience value, difference, and a final invitation. It must read as a story, not a feature inventory.
- Avoid bento layouts, dashboard tiles, dense editorial dividers, and repeated status strips without functional need.

## Depth, borders, radii, and shadows

- Controls: 9–11px radius.
- Cards: 14–20px radius depending on scale.
- Icon containers: 12–14px radius.
- Theme toggle scene: fully rounded because it represents a binary continuous transition.
- Borders: one quiet 1px border where containment helps; avoid stacking multiple border systems.
- Shadows: low and diffuse, reserved for small raised surfaces such as a logo or empty-state icon.
- Primary buttons have no heavy shadow.
- Never combine heavy shadow, glass blur, glow, and large radius.

## Component rules

### Header and navigation

The header stays calm and translucent enough to preserve context while scrolling. Active navigation uses a soft accent surface and accent text, not an extending rail. Header actions remain right-aligned at every responsive width. Discover is the single catalogue destination; field exploration is never a separate navigation route. Header and footer logos are the only navigation to the homepage. Dashboard comes first for every signed-in role; ordinary login opens it. Explicit protected destinations remain preserved. Account editing, public profile and logout are grouped in a native account disclosure, with equivalent mobile drawer actions.

### Theme toggle

The theme toggle follows the interaction philosophy of a miniature changing atmosphere:

- a sun/moon orb crosses the scene;
- the orb has restrained atmospheric rings that imply depth;
- cloud forms leave as stars arrive;
- the background changes from daylight blue to deep night;
- a spring-like easing makes the transition satisfying;
- hover nudges the orb toward the available destination;
- the control is a native button with `role="switch"`, `aria-checked`, and an action-based accessible name;
- its touch target is at least 44px and its focus ring remains visible.

The component must not become cartoonish. Details are small, motion is controlled, and the palette stays connected to Vertex.

### Buttons

- Primary: solid accent, white text, one direct verb, optional directional icon.
- Secondary: surface background, quiet border, primary text.
- Quiet: text-led navigation or tertiary action.
- Hover may move a button upward by 1px and move a directional icon by 3px.
- Active compresses to 97%.
- No glow, heavy shadow, glass, or decorative sweep.
- Loading preserves width. Disabled state removes motion and explains the reason when unclear.

### Cards and grouped surfaces

Use calm surfaces, one border, moderate radius, and enough internal whitespace. A surface must explain a real relationship: selection, comparison, destination, or shared state. Narrative copy that reads naturally without containment remains on the page canvas. Avoid indexed labels and decorative corner nodes.

### Field selection, tags, and filters

Field exploration lives inside Discover as a labelled multi-select group. Catalogue filters use labelled native checkboxes with a visible checked state; selecting fields filters the actual catalogue. The public landing field explorer retains native buttons where independently toggling a field is its action. Use small rounded rectangles for later tags only when the compact shape matches the content. Active state uses accent text plus a soft accent surface. Do not make static coverage labels resemble clickable controls.

### Forms

Labels remain visible above controls. Inputs use the theme background colour, a semantic control border, 10px control radius and strong focus ring. Text/date/search/select controls share 48px minimum height, 1rem font and 12px/14px padding. Compound controls have one outer focus boundary. Helper and error text sit directly below the relevant field. Placeholder text never replaces a label.

### Empty states

Empty states feel open and forward-looking. Use one soft container, one clear icon surface, a concise statement, and copy explaining what will appear or what the user can do. Avoid status codes, system language, connector lines, diamonds, or dead actions.

### Loading and errors

Loading states preserve the final layout and remain visually quiet. Error states state what failed and offer one safe recovery action. Neither state uses decorative motion.

## Interaction states

- Hover: a restrained cue toward movement or selection; required information is never hover-only.
- Focus: 3px accent outline with 3px offset in both themes.
- Active: brief 97% compression or immediate colour confirmation.
- Disabled: reduced contrast, no transform, no shadow, and `not-allowed` where appropriate.
- Success: concise confirmation with semantic colour and a clear next state.
- Warning: exact consequence and timing.
- Error: exact failed action and recovery.

## Motion

- Standard easing: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Theme atmosphere: up to 500ms with a restrained spring curve.
- Controls: 160–250ms.
- Page hierarchy reveal: up to 700ms with a light stagger.
- Ambient grid: a 20-second seamless topology cycle, throttled to approximately 30 frames per second and capped at 1.5 device pixel ratio.
- Ambient motion must never demand attention or respond to the pointer.
- No hero particles, parallax, Three.js, water simulation, or literal waves.
- The Milestone 1 custom 404 retains its separately required Three.js treatment.
- Reduced motion stops the ambient grid, removes nonessential transforms, and preserves every function.

## Responsive behaviour

- Support 320px without horizontal scrolling.
- Current content breakpoints remain 820px and 600px.
- Desktop navigation becomes a right-side drawer below 820px.
- Theme toggle and hamburger remain grouped at the right edge.
- The wordmark may hide only below 370px when space is constrained.
- Three-column content becomes a spacious vertical sequence on tablet.
- Field options move from four columns to two, then one.
- Large marketing headings reflow. Utility headings use their shared smaller scale for readable workspaces.
- Competition navigation uses desktop section links and a labelled native section picker below 600px.

## Accessibility

- Target WCAG 2.2 AA contrast.
- All controls are keyboard reachable and show visible focus.
- Icon-only controls have action-based accessible names.
- Current route, drawer state, theme state, loading, errors, and status changes expose programmatic state.
- No meaning relies on colour, motion, icon, or position alone.
- Respect reduced motion and WebGL absence.
- Maintain logical landmarks, heading order, and the skip link.

## Anti-patterns

Do not use blueprint diagrams, construction lines, decorative rails, diamonds, CAD geometry, coordinate labels, infrastructure language, excessive mono labels, dense Swiss editorial rules, generic centred SaaS heroes, excessive card grids, bento layouts without purpose, glassmorphism, gradient text, purple-blue AI gradients, heavy shadows, large blobs, fake statistics, decorative 3D objects, hero particles, parallax, water graphics, literal waves, or animation that exists only to impress.

## Correct and incorrect examples

- Correct: a clear hero statement sits above a softly breathing grid with occasional illuminated intersections.
- Incorrect: routes, checkpoints, arrows, coordinates, and diamonds are drawn across the grid.
- Correct: the homepage tells why Vertex exists, explains the real competition journey, then distinguishes student and organiser value.
- Incorrect: the homepage repeats a row of interchangeable feature cards or invented proof.
- Correct: field buttons within Discover support independent multi-selection and announce the count.
- Incorrect: a separate Fields page sends users back to Discover or a decorative tile pretends to filter unavailable data.
- Correct: an empty catalogue says what opportunities will appear there.
- Incorrect: it reports an internal catalogue status or advertises organiser tooling.
- Correct: the theme switch transforms a complete day scene into a complete night scene.
- Incorrect: a square thumb slides along a mechanical line with unrelated sun and moon icons.

## Future component checklist

- [ ] Does the component create clarity, possibility, direction, or meaningful consequence?
- [ ] Is the copy written for participants or organisers rather than system architecture?
- [ ] Is whitespace doing useful work?
- [ ] Are typography, colour, spacing, and radius drawn from the system?
- [ ] Is accent colour reserved for action, focus, opportunity, status, progress, or achievement?
- [ ] Have decorative rails, diamonds, technical labels, and unnecessary borders been removed?
- [ ] Are hover, focus, active, disabled, loading, success, warning, and error states defined where relevant?
- [ ] Is the component understandable without colour or animation?
- [ ] Does it work at 320px, 200% zoom, and reduced motion?
- [ ] Does it feel calm, ambitious, optimistic, and exploratory rather than enterprise-oriented?
- [ ] Would it still feel like Vertex without the logo and product name?

## Milestone 4 — competition authoring

The organiser flow uses five real steps with an explicit saved state. The timeline
is its signature: a compact top-X path in the editor, and a numbered round history
in the public preview. Dates stay beside their meaning, with local time zone shown.
Existing Geist typography, blue accent, quiet surfaces and 12–18px corners continue.
On mobile, steps wrap and timeline fields become one column. Banner captions use
an opaque dark treatment so user-selected colours and images cannot erase labels.

## Human-centred refinement contract, 11 October 2026

ENERGY 1, RHYTHM 2, MOTION 1 for operational refinements. Existing landing
identity and user-approved theme motion remain. This contract owns shared
controls and navigation across all completed features.

### Ownership

- `css/styles.css` supplies brand foundations, buttons, the shell and landing
  composition. `css/experience.css` supplies accessibility and interaction
  feedback. `css/components.css`, loaded last, owns shared controls, utility
  headings, contextual navigation, compact callouts and startup states.
- Milestone styles own feature layouts and genuinely specialised controls.
  Do not repeat border, font, focus or generic heading rules in each feature sheet.
- `js/presentation.js` owns display labels, role dashboard destinations and
  competition section order. Stored enum values, routes, usernames and authored
  text remain unchanged. Do not use CSS capitalization to hide raw database text.

### Forms and feedback

Text, search, date/time, number, URL, email, password, select and textarea controls
share a 48 px minimum height, 1 px semantic border, 1rem font and 12/14 px padding.
Compound username/password/search controls have one outer boundary and focus ring.
File selectors, colour pickers, checkboxes, radio buttons and certificate canvas
tools retain the affordances their functions need.

Every control needs a visible label, keyboard focus, disabled treatment and a
useful error. Help text is described separately from the label. Invalid submissions
offer a linked summary that focuses the affected field. Success/error feedback
includes words and a live status; colour alone is insufficient. Unsaved work must
survive cancelled navigation, section changes and refresh prompts.

### Navigation and interactions

- Ordinary login opens Dashboard. It is the first primary and mobile navigation
  item for every role. An explicit protected-page destination still takes the
  user back to that page. Refresh keeps the current route and session.
- Organisers use `/organiser`; participants and organisations use `/dashboard`.
  The organisation dashboard shows its profile, associations and competitions
  without granting organiser powers. Signup still completes profile setup.
- Header and footer logos open `/`. There is no separate Home link or button.
  Signed-in landing actions offer Open dashboard instead of Create account.
- Competition pages share one section order and selected state. Desktop uses
  links; phones use a labelled native section picker to avoid several rows of tabs.
  The picker uses the same route and unsaved-work guards as other navigation.
- Saved editors join section navigation. New unsaved competitions have no
  workspace links until their first successful save. Meeting rooms retain their
  full-screen experience. Permission failures offer Back to competition.
- Single-destination cards are full native anchors with visible hover/focus.
  Dashboard arrows reinforce the destination; they are not the only click target.
  Discovery cards keep bookmarks and previews as separate controls. Never wrap
  buttons in anchors or attach a hidden click-only action to an article.
- The desktop account disclosure offers editing, public profile and logout.
  Escape restores summary focus; clicking or focusing outside closes it.
  At the mobile-navigation breakpoint, account actions live in the drawer.

### Meaningful states

Lifecycle comes from actual publication and round state, not an old planned date.
Discovery, dashboard and organisation cards use the same vocabulary. Empty
submissions/judging explain eligibility; no search matches suggests clearing the
query. Human labels include Programming, General STEM, Age, Pending, Owner and
Not published. User-authored names retain their spelling.

### Startup and motion

The splash extends the mountain identity with a summit contour, wordmark and
live boot status. One short entrance establishes the mark; a small busy indicator
appears only while real initialization is pending. It expresses activity, not a
fabricated percentage. There is no minimum display time, extra fetch or ornamental
waiting period. Failed module loading provides a focused Try again action that
reloads the original route.

The offline fallback keeps this logo navigation and accessible theme contrast.
It remains self-contained so unavailable shared assets cannot hide recovery.

Other motion remains restrained control feedback. Reduced motion removes the
summit entrance, busy-indicator animation and splash transition without blocking
functionality. Native scrolling, readable text and existing GSAP interactions stay.

### Review standard

Review screenshots as well as DOM assertions: both themes, 320/390 px phones,
tablet and desktop, empty/populated states, keyboard and failed network recovery.
Use authorised data for visual audits; never invent activity to fill space.
See `UX-REFINEMENT.md` for evidence/limits and `CHECKS.md` for device review.
