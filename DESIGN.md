# Vertex Design System

## Design thesis

Vertex is the point where participants, organisers, submissions, decisions, and achievements converge toward a meaningful outcome. The interface expresses that idea as directed momentum: information begins at a clear entry point, moves through checkpoints, and resolves at an action, status, or result.

The system is Swiss-inspired in its typography and grids, but it is not neutral. Thin rails, square checkpoints, bracketed groups, indexed stages, and asymmetric focal points make the product identifiable even without its logo. These devices encode real structure; they are not ornamental triangles.

## Brand character

- Energetic, not noisy: use decisive scale changes and directional movement, not saturated decoration.
- Competitive, not aggressive: show progress and consequence without scoreboards, metallic effects, or sports-broadcast styling.
- Credible: schools and organisers should see precise alignment, useful labels, restrained colour, and predictable controls.
- Motivating: participants should always understand the next available action and what it leads toward.
- Systemic: components belong to a connected competition journey rather than a collection of floating cards.

## Signature motif: the convergence rail

The convergence rail is a one-pixel structural line with square or diamond checkpoints. It can run horizontally, vertically, or at a restrained angle. An accent-coloured endpoint marks the active destination, current stage, confirmed result, or primary action.

Use it for real relationships:

- navigation item to active destination;
- round or stage progression;
- section heading to content group;
- indexed list entry to its consequence;
- empty state to the next source of data;
- theme-switch thumb moving between two defined states.

Never place more than one dominant rail system in a viewport. Do not use isolated triangles, repeated chevrons, or decorative line tangles. A checkpoint without a meaningful state or boundary must be removed.

## Design laws

1. Every important screen communicates direction, progress, or consequence through its hierarchy, copy, state, or rail.
2. Decorative elements reinforce competition structure, convergence, or advancement. Unrelated decoration is forbidden.
3. Cards feel like parts of a system. Prefer shared borders, aligned baselines, indexed rows, and connected groups over isolated floating boxes.
4. Accent colour is reserved for actions, active state, progress, status, focus, and achievement.
5. Organiser-facing interfaces are precise and structured: denser metadata, stronger alignment, fewer expressive scale shifts.
6. Participant-facing interfaces may use larger type and more visible progress, but remain controlled and credible.
7. Motion communicates change, progression, confirmation, or hierarchy. If removing motion loses no meaning, the motion is optional and should usually be removed.
8. Empty space creates focus, anticipation, or separation. Every large gap must support a reading order or important transition.
9. Every component remains readable, accessible, and usable without animation.
10. The rail, checkpoint, indexed hierarchy, restrained palette, and typography must keep the interface recognisably Vertex without the logo or name.

## Typography

- Primary: Geist. Use for interface copy, headings, controls, and long-form text.
- Utility: Geist Mono. Use for `VERTEX`, route labels, stage numbers, statuses, deadlines, compact metadata, and system annotations.
- Fallback: Inter, then the system sans serif. Mono fallback is `ui-monospace`.
- Display headings: weight 600–700, tightly tracked from `-0.045em` to `-0.07em`, balanced wrapping, line-height `0.84–1.0`.
- Page titles: `clamp(2.6rem, 7vw, 5.8rem)`.
- Section titles: `clamp(2.2rem, 5vw, 4.7rem)`.
- Body: 16px base, line-height 1.55–1.7. Supporting text uses the secondary text role.
- Utility labels: 11–12px, mono, semibold, uppercase, 0.08–0.12em tracking.
- Do not use mono for paragraphs. Do not use all caps for actions or long labels. Avoid more than three type sizes inside one component.

## Colour roles

The required core palette remains authoritative.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Background | `#F8FAFC` | `#0B1120` | Page canvas |
| Surface | `#FFFFFF` | `#111827` | Controls and content surfaces |
| Primary text | `#0F172A` | `#F8FAFC` | Headings and essential content |
| Secondary text | `#64748B` | `#94A3B8` | Supporting content and inactive metadata |
| Border | `#DBE3EE` | `#1F2937` | Dividers and grouped surfaces |
| Accent | `#2563EB` | `#3B82F6` | Action, active, progress, focus |

Derived tokens may lighten or darken these colours but may not introduce a competing brand hue. Success, warning, and error are semantic only. Never use status colour without a text label or icon. Gradients may separate a structural region, but gradient text and purple-blue decorative gradients are prohibited.

## Spacing and sizing

- Base spacing unit: 4px.
- Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96px.
- Page width: maximum 1180px; 24px desktop gutters; 16px mobile gutters.
- Header: 76px desktop, 68px mobile.
- Touch targets: minimum 44×44px; 40px is allowed only for paired mobile header controls with adequate separation and a 68px header.
- Content measure: body copy should normally remain under 65 characters per line.
- Section rhythm: 64–120px responsive vertical padding. Internal spacing must use the token scale.
- Do not compensate for weak hierarchy with arbitrary large gaps.

## Layout rules

- Start pages with an asymmetric focal block rather than a centred generic hero.
- Align primary copy to the page grid. Secondary progress or metadata may occupy a narrow adjacent rail.
- Use a shared boundary when three or more related items form one system.
- Use one clear axis of progression per section.
- Dense administrative content should use rows, columns, and aligned metadata; participant content may use larger stage markers.
- Avoid bento layouts unless the data has genuinely different functional spans.

## Geometry, borders, radii, and shadows

- Controls: 10px radius.
- Cards and major contained regions: 12–14px radius, with 18px as the absolute exception for large media surfaces.
- Checkpoints: 4–10px square, often rotated 45 degrees. They indicate a real boundary or state.
- Borders: 1px default; 2–3px only for focus, active endpoints, or strong status.
- Shadows: absent by default. Use a low shadow only for elevation or a raised interaction; use the accent shadow only for a primary hover/active moment.
- Do not combine a large radius, strong shadow, and tinted background on the same static card.

## Component rules

### Cards and grouped content

Related cards share borders and align to one rail. Use an index or status label when order or state is meaningful. Hover may add an inset accent edge and move a directional icon up to 4px. Do not lift every card.

### Buttons

- Primary: solid accent, white text, one clear verb, optional directional icon.
- Secondary: surface, border, primary text.
- Quiet: text-led and used for low-priority navigation.
- Destructive: error colour and explicit consequence; always require confirmation when data loss is possible.
- Hover shows destination through colour, a 2px lift, or icon movement. Active compresses to 97%.
- Disabled uses reduced contrast, `not-allowed`, and no motion. Loading preserves width and replaces—not appends to—the action label.

### Navigation

Desktop active items extend an accent rail toward their destination. Mobile navigation enters from the right and marks the active route with an inset accent edge. Header actions remain right-aligned at all widths. Navigation labels describe destinations, not implementation.

### Theme control

The day/night switch is an adapted state control: the square thumb travels along a thin rail and lands at either endpoint. It is a native button with `role="switch"`, a current `aria-checked` value, and an action-based label. Sun and moon cues are redundant visual reinforcement, never the sole accessible name.

### Forms

Labels stay visible above controls. Inputs use the control radius, surface background, 1px border, and a strong accent focus ring. Helper and error text live directly below the relevant field. Required, invalid, disabled, and loading states must be visually and programmatically exposed. Do not use placeholder text as a label.

### Tags and filters

Use compact rectangular labels with small radii. Pills are reserved for binary status or very short removable tokens. Active filters use accent text, accent edge, and a subtle accent surface; colour alone is insufficient.

### Competition status

Always pair semantic text with a structural marker:

- Upcoming: neutral checkpoint and timestamp.
- Open or active: accent checkpoint and active rail.
- Advancing or complete: success checkpoint and explicit label.
- Attention or deadline: warning marker and exact deadline.
- Eliminated or error: error marker and explanatory next step.

### Empty, loading, and error states

Empty states identify the current system status and what event will populate it. They are connected regions, not cheerful floating cards. Loading uses skeleton blocks aligned to the final layout and never changes page geometry on completion. Error states name what failed and provide one safe recovery action. Avoid apology copy and vague “Something went wrong” messages.

## Interaction states

- Hover: reveal direction or affordance; never hide required information until hover.
- Focus: 3px accent ring with 3px offset; visible in both themes.
- Active: tactile 97% compression or a strong endpoint, lasting under 160ms.
- Disabled: reduced contrast, no shadow or transform, and explanatory text when the reason is not obvious.
- Success: concise confirmation, success colour, and a resolved endpoint/checkmark.
- Warning: exact consequence and time or action needed.
- Error: exact failed action, reason when known, and recovery.

## Motion

- Standard easing: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Control feedback: 160–250ms.
- Panels and route changes: 280–450ms.
- Page hierarchy reveal: up to 700ms with restrained stagger.
- Movement follows the reading direction or rail direction. Do not rotate or float elements without state meaning.
- `prefers-reduced-motion: reduce` removes nonessential transforms, stagger, smooth scrolling, and the WebGL particle animation while preserving all controls and state changes.

## Responsive behaviour

- Design for 320px without horizontal page scrolling.
- Breakpoints follow content pressure, currently 820px and 600px.
- Desktop navigation becomes a right-side drawer below 820px.
- The theme switch and hamburger remain grouped at the right edge; the wordmark may hide only below 370px.
- Three-column systems become a connected vertical sequence on tablet. Field grids become two columns, then one.
- Never shrink text below readable size to preserve a desktop composition. Reflow rails and metadata instead.

## Accessibility

- Target WCAG 2.2 AA contrast.
- All interactive elements are keyboard reachable and have visible focus.
- Icon-only controls require action-based accessible names.
- Current route, expanded navigation, switch state, loading, errors, and status changes must have programmatic state.
- Do not rely on colour, motion, position, or icon alone.
- Respect reduced motion and WebGL absence.
- Maintain logical heading order, landmarks, and the skip link.

## Anti-patterns

Do not use glassmorphism, gradient text, purple-blue AI gradients, large blobs, fake statistics, decorative 3D objects, excessive pills, soft floating card grids, generic centred heroes, bento layouts without data meaning, heavy shadows, excessive radii, sports-broadcast styling, or motion without state meaning. Do not reproduce components from unrelated fintech, AI, or project-management products unchanged.

## Correct and incorrect examples

- Correct: three competition stages share one border and three checkpoints, with the current stage accented.
- Incorrect: three detached rounded cards with identical shadows and unrelated icons.
- Correct: “Registration closes 14 Aug, 18:00” with a warning marker and a clear “Register” action.
- Incorrect: an orange pill reading “Soon” with no date or consequence.
- Correct: a field row gains an inset accent edge and its arrow moves toward the destination on hover.
- Incorrect: the whole card floats upward only to look interactive.
- Correct: an empty catalogue states “Awaiting first entry” and explains what will populate it.
- Incorrect: a mascot, generic encouragement, or dead “Create competition” button on a public empty state.

## Future component checklist

- [ ] Does the component communicate an action, stage, status, or consequence?
- [ ] Is any rail or checkpoint tied to real structure?
- [ ] Does it align with surrounding components instead of floating independently?
- [ ] Is accent colour limited to action, active state, progress, status, or achievement?
- [ ] Are typography and spacing drawn from the defined tokens?
- [ ] Are radii and shadows within the stated limits?
- [ ] Are hover, focus, active, disabled, loading, success, warning, and error states defined where relevant?
- [ ] Is every state understandable without colour or animation?
- [ ] Does it remain usable at 320px, 200% zoom, and reduced motion?
- [ ] Would it still feel like Vertex without the logo and name?
- [ ] Would transferring it unchanged to a fintech or AI product feel obviously wrong?
