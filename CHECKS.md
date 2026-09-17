# Vertex — Milestone 3 manual review

Automated checks cover database permissions, registration, persistence, invitation
transitions, uploads, and routing. Use this pass to judge the experience with your
own names, logo, and devices. Records named “Vertex E2E” are development test data.

## Branding and People

- [ ] Open Vertex in a fresh tab, then refresh. Judge whether the logo, VERTEX
  wordmark, and short splash feel polished without making entry feel slow.
- [ ] Open Log in. Confirm the logo is clearly visible on the form side, and the
  font, spacing, and link styling match the rest of Vertex.
- [ ] Open People and type a familiar name or username, including a small typo.
  Judge whether suggestions are useful and easy to distinguish. Open a result;
  the whole row should feel clearly clickable without underlines.

## Organisation profile

- [ ] From Sign up, choose Organisation. Confirm the choice explains its purpose
  clearly. Enter email and password; the next screen should be the only place
  asking for organisation name, slug, and logo. There is no personal username or birthday.
- [ ] Enter your organisation’s real display name, a suitable slug, description,
  website, and social links. Upload your logo. Check the preview for cropping,
  padding, transparency, and readability before saving.
- [ ] Compare your logo and organisation name in the header, People search results,
  and public organisation page. Judge whether they feel like one consistent identity.
  Use the account menu to return to the same organisation editor; there should be
  no separate personal-profile or profile-picture setup.
- [ ] Choose View organisation. Judge the page hierarchy using your actual content:
  name first, description and links easy to read, associated organisers easy to find.
- [ ] Open the public organisation address in a signed-out tab. Confirm the page
  feels appropriate to share. The Competitions area should explain that nothing
  is published yet, without offering unavailable competition controls.

## Invitations and associations

- [ ] Invite an organiser you control using their exact @username. Check that the
  pending state and invitation feedback are easy to notice from the form.
- [ ] In that organiser account, open Organisations. Review the invitation’s sender,
  expiry, and Accept/Decline actions. After accepting, follow the organisation link
  and the organiser’s profile link; judge whether their relationship is clear.
- [ ] Review Cancel invitation, Remove organiser, and Leave organisation. Read the
  confirmation before proceeding; cancel if you want to keep your association.
  Confirm the wording makes each action’s consequence understandable.

## Layout, accessibility, and comfort

- [ ] Repeat the organisation page and invitation inbox on your phone. Check long
  names, link labels, buttons, and navigation without sideways scrolling.
- [ ] Switch between light and dark themes. Inspect your own logo especially;
  text and controls should stay readable in both.
- [ ] On desktop, use Tab and Shift+Tab through the organisation form. Check that
  focus is easy to see and follows a comfortable order. Try browser zoom at 200%.
- [ ] With reduced motion enabled in your device settings, revisit the splash and
  organisation pages. Confirm the experience remains clear and comfortable.

If something feels wrong, note the page address, device width, theme, and exact
action. No manual SQL or security probing is needed for this review.
