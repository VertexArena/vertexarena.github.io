# Milestone 2 Manual Checks

Automated Playwright tests already cover signup, immediate sessions, profile persistence, public search, privacy, duplicate usernames, RLS, Storage ownership, direct routes, desktop/mobile layouts, and Milestone 1 regressions. These checks focus on human visual judgement and hosted settings.

## Hosted Supabase setting

- [ ] Open Supabase Dashboard, then **Authentication > Providers > Email**. Confirm email/password is enabled and **Confirm email** is disabled.

## Signup experience

- [ ] Open `/signup` at desktop width. Confirm participant and organiser choices read clearly, selected state is obvious without relying only on colour, and form feels calm rather than crowded.
- [ ] Choose **Organiser**. Confirm birthday field disappears cleanly without a jump or broken gap. Choose **Participant** again and confirm birthday returns.
- [ ] Repeat at about 390 px wide. Confirm every control fits, password controls remain easy to tap, and no horizontal scrolling appears.

## Profile editor

- [ ] Sign in and open `/profile/edit`. Confirm full name and `@username` form one clear identity, while account type, public-profile link, and privacy copy remain secondary.
- [ ] Upload a real portrait or logo. Confirm circular crop looks intentional in header, preview card, editor, search result, and public profile.
- [ ] Add several social links. Confirm rows remain readable, remove buttons clearly belong to their row, and **Add link** never feels ambiguous.
- [ ] Switch light and dark modes. Confirm inputs, borders, success/error messages, avatar fallback, and **Save profile / Log out** controls remain readable with visible focus states.

## Public identity and privacy

- [ ] Open your public profile in a signed-out/private browser window. Confirm full name appears above `@username`, long names wrap naturally, bio remains readable, and external-link icons make destination behaviour clear.
- [ ] Confirm birthday appears only inside your private editor with a **Private** label and never on public profile or people search result.
- [ ] Open `/people`, search a partial name and an exact `@username`, then judge whether results are easy to scan and account types are immediately understandable.

## Error language

- [ ] Try an incorrect login and a username already in use. Confirm messages explain what to correct, remain visible near form, and do not expose database or Supabase internals.