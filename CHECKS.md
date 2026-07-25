# Milestone 1 Manual Checks

Use this checklist against the deployed GitHub Pages site. These checks cover user-facing behaviour and environment details best judged manually.

- [ ] Vertex logo and `VERTEX` wordmark look sharp and correctly aligned on phone, tablet, and desktop.
- [ ] Home page feels calm, legible, and polished in both light and dark modes.
- [ ] Theme changes before page paint without a visible wrong-theme flash.
- [ ] Mobile navigation opens, closes, fits the viewport, and remains easy to use by touch.
- [ ] Keyboard focus is clearly visible while tabbing through header, page actions, and 404 actions.
- [ ] Browser zoom at 200% keeps content usable without horizontal page scrolling.
- [ ] `/discover`, `/login`, `/signup`, and `/discover/fields` show complete branded layouts on the deployed domain.
- [ ] Paste each nested URL into a new browser tab; GitHub Pages recovers it without visible redirect or 404 flicker.
- [ ] Paste an invalid path such as `/randomgarbage`; custom Vertex 404 appears instead of GitHub's default page.
- [ ] Move pointer across custom 404 and confirm particle field responds subtly when WebGL and motion are enabled.
- [ ] Enable operating-system reduced motion; 404 remains usable with a static particle treatment.
- [ ] Disable WebGL or test on a browser without WebGL; fallback 404 remains clear and functional.
- [ ] Test slow or blocked CDN access; core navigation and fallback content remain usable even if fonts, icons, GSAP, or Three.js cannot load.
- [ ] Add Vertex to a mobile home screen and confirm supplied logo is used by current PWA metadata foundation.
