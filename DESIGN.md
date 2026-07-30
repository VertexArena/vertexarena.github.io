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

The hero grid is the primary identity device. It represents a broad landscape of opportunities beneath the visible interface.

The grid must:

- remain visibly geometric and easy to recognise;
- pulse gently through opacity;
- contain broad, soft regions of blue light;
- allow selected intersections to brighten and travel slowly;
- loop without a visible reset;
- stay behind content and preserve readability;
- use transform and opacity animation wherever practical;
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
- Page titles: `clamp(2.6rem, 7vw, 5.8rem)`.
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
- Page sections: 76–132px responsive vertical space.
- Use larger gaps between ideas and smaller gaps within one idea.
- Do not fill empty space with labels, rules, badges, or geometry merely to make the page appear designed.

## Layout rules

- Heroes are left-led, asymmetrical, and spacious rather than generically centred.
- One large statement owns the first viewport. Supporting copy and actions remain compact.
- Secondary thoughts may sit at the edge of a composition, but never compete with the primary message.
- Related items may use a functional grid, but should have room between them instead of sharing dense construction lines.
- Cards are used only where grouping or destination is real, such as a field link or empty-state container.
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

The header stays calm and translucent enough to preserve context while scrolling. Active navigation uses a soft accent surface and accent text, not an extending rail. Header actions remain right-aligned at every responsive width.

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

### Cards and destination tiles

Use calm surfaces, one border, moderate radius, and enough internal whitespace. Hover may tint the surface, strengthen the border, and move an arrow toward the destination. Avoid indexed labels and decorative corner nodes.

### Tags and filters

Use small rounded rectangles with readable labels. Pills are acceptable only when the compact shape matches the content. Active state uses accent text plus a soft accent surface. Do not make static coverage labels resemble clickable controls.

### Forms

Labels remain visible above controls. Inputs use the surface colour, a quiet border, control radius, and strong focus ring. Helper and error text sit directly below the relevant field. Placeholder text never replaces a label.

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
- Ambient grid: 8–18 second cycles with seamless repetition.
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
- Field tiles become two columns, then one.
- Large headings reflow; they are not reduced to ordinary body scale merely to preserve a desktop composition.

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
- Correct: three homepage ideas have distinct icons, generous gaps, and concise copy.
- Incorrect: three stages are numbered like a process when no action is actually occurring.
- Correct: a field destination gently tints and moves its arrow on hover.
- Incorrect: the tile gains an industrial inset rail or decorative node.
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
