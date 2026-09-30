import { test, expect, anotherPage } from './helpers/test.js';
import { createAccount, sessionCredentials } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';

const stamp = days => new Date(Date.now() + days * 86400000).toISOString();
const section = (page, kind) => page.locator(`[data-recommendation-section="${kind}"]`);

test('private recommendations, team and field history, exploration and new-account fallback', async ({ page, browser, request }, info) => {
  test.setTimeout(420000);
  const organiser = await createAccount(page, 'organiser', 'm18');
  const owner = await sessionCredentials(page);
  const headers = token => ({ apikey: owner.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const fixtures = {};
  const marker = `m18-${organiser.username.replaceAll('_', '-')}`;
  async function competition(key, field, mode = 'individual', deadline = 8, options = {}) {
    const id = randomUUID(), slug = `${marker}-${key}`;
    const details = {
      id, slug, name: `Vertex M18 ${key} ${marker}`, status: options.status || 'published',
      field_tags: [field], prize_details: 'Recognition and a learning grant.',
      description: 'Develop your skills, share your work and explore a student competition.',
      minimum_age: options.minimum ?? 12, maximum_age: options.maximum ?? 20, team_mode: mode,
      minimum_team_size: mode === 'individual' ? null : 2, maximum_team_size: mode === 'individual' ? null : 4,
      categories: [], structure: 'direct3', banner_kind: 'colour',
      banner_colour: field === 'programming' ? '#2563eb' : '#0f766e', banner_colour_end: '#0b1120',
      banner_path: null, certificate_status: 'not_planned',
      registration_opens_at: stamp(options.opens ?? -5), registration_closes_at: stamp(deadline), starts_at: stamp(Math.max(deadline + 1, 1))
    };
    const rounds = [{ id: randomUUID(), name: 'Final round', slug: 'final-round', sequence: 1,
      advancement_count: 3, opens_at: stamp(Math.max(deadline + 2, 2)),
      submission_deadline: stamp(Math.max(deadline + 3, 3)), leaderboard_releases_at: stamp(Math.max(deadline + 4, 4)) }];
    const response = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/save_competition`, { headers: headers(owner.token), data: { details, rounds } });
    expect(response.ok(), await response.text()).toBeTruthy();
    fixtures[key] = { id, slug, name: details.name };
  }
  for (const key of ['history-one', 'history-two']) await competition(key, 'programming', 'team', 20);
  for (let i = 0; i < 4; i++) await competition(`team-pick-${i}`, 'programming', i === 2 ? 'both' : 'team', 4 + i);
  await competition('individual-programming', 'programming', 'individual', 1);
  await competition('too-old', 'programming', 'team', 1, { minimum: 25, maximum: 30 });
  await competition('too-young', 'programming', 'team', 1, { maximum: 10, minimum: 5 });
  await competition('closed', 'programming', 'team', -1);
  await competition('draft', 'programming', 'team', 2, { status: 'draft' });
  await competition('biology', 'biology', 'individual', 2);
  await competition('writing', 'writing', 'individual', 3);
  await competition('writing-second', 'writing', 'individual', 4);
  await competition('design', 'design', 'individual', 4, { opens: 2 });
  await competition('robotics-saved', 'robotics', 'individual', 8);
  await competition('robotics-more', 'robotics', 'individual', 8);
  await competition('business-saved', 'business', 'individual', 8);
  await competition('business-more', 'business', 'individual', 8);

  async function participant() {
    const view = await anotherPage(browser);
    const account = await createAccount(view, 'participant', 'm18');
    const access = await sessionCredentials(view);
    mkdirSync('.test-data', { recursive: true });
    appendFileSync('.test-data/accounts.ndjson', JSON.stringify({ id: access.userId, email: account.email }) + '\n');
    return { view, ...account, ...access };
  }
  const captain = await participant(), member = await participant(), newcomer = await participant();
  for (const key of ['history-one', 'history-two']) {
    const url = `/competition/${fixtures[key].slug}/team`;
    await captain.view.goto(url);
    await captain.view.getByLabel('Team name').fill(`Vertex M18 ${key}`);
    await captain.view.getByRole('button', { name: 'Create team' }).click();
    await expect(captain.view.getByRole('heading', { name: 'Team roster' })).toBeVisible();
    await captain.view.getByLabel('Participant username').fill(`@${member.username}`);
    await captain.view.locator('[data-team-suggestion]').filter({ hasText: member.username }).click();
    await captain.view.getByRole('button', { name: 'Send invitation' }).click();
    await expect(captain.view.locator('[data-team-status]')).toContainText('Invitation sent.');
    await member.view.goto(url);
    await member.view.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(captain.view.locator('.team-capacity')).toContainText('2 / 4');
    await captain.view.getByRole('button', { name: 'Register team' }).click();
    await expect(captain.view.getByRole('heading', { name: "You're registered together." })).toBeVisible();
  }
  async function ready(view) {
    await expect(section(view, 'for_you').getByRole('heading', { name: 'For you', exact: true })).toBeVisible();
    await expect(view.locator('[data-recommendations]')).not.toHaveAttribute('aria-busy', 'true');
    await expect(view.locator('[data-discovery-results]')).not.toHaveAttribute('aria-busy', 'true');
    await expect(view.locator('#vertex-splash')).toHaveCount(0);
  }
  for (const person of [captain, member]) {
    await person.view.goto('/discover');
    await ready(person.view);
    await expect(section(person.view, 'for_you').locator('.discovery-card')).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(section(person.view, 'for_you')).toContainText(fixtures[`team-pick-${i}`].name);
    await expect(section(person.view, 'for_you')).toContainText('More programming');
    await expect(section(person.view, 'for_you')).toContainText('Team options');
    for (const key of ['too-old', 'too-young', 'closed', 'draft', 'history-one', 'history-two', 'individual-programming']) await expect(section(person.view, 'for_you')).not.toContainText(fixtures[key].name);
    await expect(section(person.view, 'new_to_you')).toContainText(fixtures.biology.name);
    await expect(section(person.view, 'new_to_you')).toContainText(fixtures.writing.name);
    await expect(section(person.view, 'new_to_you')).not.toContainText('programming');
    await person.view.reload();
    await ready(person.view);
  }

  // The ordinary catalogue still contains excluded primary recommendations.
  await captain.view.getByRole('searchbox').fill(fixtures['too-old'].name);
  await expect(captain.view.locator('[data-discovery-count]')).toHaveText('1 competition');
  await expect(captain.view.locator('.discovery-catalogue')).toContainText('requires age 25 or older');
  await expect(captain.view.locator('[data-recommendations]')).toBeHidden();
  await captain.view.getByRole('searchbox').fill('');
  await ready(captain.view);
  await captain.view.getByRole('button', { name: 'Browse full catalogue' }).click();
  await expect(captain.view.getByRole('searchbox')).toBeFocused();
  expect(new URL(captain.view.url()).hash).toBe('');

  // A bookmark updates ranking, synchronises duplicate card controls and survives refresh.
  const savedPick = fixtures['team-pick-3'];
  await captain.view.goto(`/competition/${savedPick.slug}`);
  await captain.view.getByRole('button', { name: `Save ${savedPick.name} to bookmarks` }).click();
  await expect(captain.view.getByRole('button', { name: `Remove ${savedPick.name} from bookmarks` })).toHaveAttribute('aria-pressed', 'true');
  await captain.view.goto('/discover');
  await ready(captain.view);
  await expect(section(captain.view, 'for_you').locator('.discovery-card').first()).toContainText(savedPick.name);
  await expect(section(captain.view, 'for_you').locator('.discovery-card').first()).toContainText('Saved by you');
  await captain.view.reload();
  await ready(captain.view);
  await section(captain.view, 'for_you').getByRole('button', { name: `Remove ${savedPick.name} from bookmarks` }).click();
  await expect(section(captain.view, 'for_you')).not.toContainText(savedPick.name);
  await expect(section(captain.view, 'for_you').getByRole('heading', { name: 'For you', exact: true })).toBeFocused();
  const previewCard = section(captain.view, 'for_you').locator('.discovery-card').first();
  await previewCard.getByRole('button', { name: 'Quick preview' }).click();
  await expect(captain.view.getByRole('dialog')).toContainText(fixtures['team-pick-0'].name);
  await captain.view.getByRole('button', { name: 'Close preview' }).press('Escape');
  await expect(captain.view.getByRole('dialog')).not.toBeVisible();
  await section(captain.view, 'for_you').getByRole('link', { name: fixtures['team-pick-0'].name, exact: true }).click();
  await expect(captain.view).toHaveURL(new RegExp(`/competition/${fixtures['team-pick-0'].slug}$`));
  await captain.view.reload();
  await expect(captain.view.locator('h1')).toContainText(fixtures['team-pick-0'].name);

  await newcomer.view.goto('/discover');
  await ready(newcomer.view);
  await expect(section(newcomer.view, 'for_you')).toContainText('Eligible opportunities to get started');
  await expect(section(newcomer.view, 'for_you')).toContainText(fixtures['individual-programming'].name);
  await expect(section(newcomer.view, 'for_you')).toContainText(fixtures.biology.name);
  await expect(section(newcomer.view, 'for_you')).toContainText(fixtures.writing.name);
  await expect(section(newcomer.view, 'new_to_you')).toContainText(fixtures.design.name);
  await expect(section(newcomer.view, 'new_to_you')).not.toContainText('programming');
  await newcomer.view.getByText('How your picks work', { exact: true }).click();
  await expect(newcomer.view.getByText(/browsing is not tracked/)).toBeVisible();

  const endpoint = `${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/competition_recommendations`;
  const cold = await request.post(endpoint, { headers: headers(newcomer.token), data: {} });
  expect((await cold.json()).has_history).toBe(false);
  for (const token of [owner.token, owner.SUPABASE_ANON_KEY]) {
    const denied = await request.post(endpoint, { headers: headers(token), data: {} });
    expect(denied.ok()).toBe(false);
  }
  const spoof = await request.post(endpoint, { headers: headers(newcomer.token), data: { participant_id: captain.userId } });
  expect(spoof.ok()).toBe(false);
  const history = await request.get(`${owner.SUPABASE_PROJECT_URL}/rest/v1/competition_team_members?participant_id=eq.${captain.userId}`, { headers: headers(newcomer.token) });
  expect(await history.json()).toEqual([]);

  // Controlled own bookmark timestamp exercises recency without creating a tracking table.
  const oldSave = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/competition_bookmarks`, { headers: headers(newcomer.token), data: { participant_id: newcomer.userId, competition_id: fixtures['business-saved'].id, created_at: stamp(-730) } });
  expect(oldSave.ok(), await oldSave.text()).toBe(true);
  await newcomer.view.goto(`/competition/${fixtures['robotics-saved'].slug}`);
  await newcomer.view.getByRole('button', { name: `Save ${fixtures['robotics-saved'].name} to bookmarks` }).click();
  await expect(newcomer.view.getByRole('button', { name: `Remove ${fixtures['robotics-saved'].name} from bookmarks` })).toHaveAttribute('aria-pressed', 'true');
  await newcomer.view.goto('/discover');
  await ready(newcomer.view);
  await expect(section(newcomer.view, 'for_you')).toContainText(fixtures['robotics-more'].name);
  await expect(section(newcomer.view, 'for_you')).not.toContainText(fixtures['business-more'].name);
  await expect(section(newcomer.view, 'new_to_you')).not.toContainText('robotics');
  await expect(section(newcomer.view, 'new_to_you')).not.toContainText('business');

  await newcomer.view.goto(`/competition/${fixtures.writing.slug}/register`);
  await newcomer.view.getByRole('button', { name: 'Confirm registration' }).click();
  await expect(newcomer.view.getByRole('heading', { name: "You're registered." })).toBeVisible();
  await newcomer.view.goto('/discover');
  await ready(newcomer.view);
  await expect(section(newcomer.view, 'for_you')).toContainText(fixtures['writing-second'].name);
  await expect(section(newcomer.view, 'for_you')).toContainText('Individual options');
  await expect(section(newcomer.view, 'for_you')).not.toContainText(fixtures.writing.name);

  // Real loading and failure paths leave the independent catalogue usable.
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await captain.view.route('**/rest/v1/rpc/competition_recommendations', async route => { await gate; await route.continue(); });
  await captain.view.goto('/discover');
  await expect(captain.view.getByText('Finding opportunities for you…')).toBeVisible();
  await expect(captain.view.locator('.discovery-catalogue .discovery-card')).toHaveCount(12);
  release();
  await ready(captain.view);
  await captain.view.unroute('**/rest/v1/rpc/competition_recommendations');
  await captain.view.route('**/rest/v1/rpc/competition_recommendations', route => route.abort());
  await captain.view.goto('/discover');
  await expect(captain.view.getByRole('heading', { name: 'Could not load your recommendations.' })).toBeVisible();
  await expect(captain.view.locator('.discovery-catalogue .discovery-card')).toHaveCount(12);
  await captain.view.unroute('**/rest/v1/rpc/competition_recommendations');
  await captain.view.locator('[data-retry-recommendations]').click();
  await ready(captain.view);

  async function screenshot(view, label) {
    await view.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => view.evaluate(() => scrollY)).toBe(0);
    await view.screenshot({ path: info.outputPath(`${label}.png`), fullPage: true });
    await view.screenshot({ path: info.outputPath(`${label}-viewport.png`) });
  }
  await screenshot(captain.view, 'recommendations-desktop');
  await section(captain.view, 'for_you').screenshot({ path: info.outputPath('recommendations-desktop-cards.png') });
  await captain.view.setViewportSize({ width: 320, height: 844 });
  await captain.view.emulateMedia({ reducedMotion: 'reduce' });
  await captain.view.reload();
  await ready(captain.view);
  expect(await captain.view.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const strip = section(captain.view, 'for_you').getByRole('group');
  await strip.focus();
  await strip.press('ArrowRight');
  await expect.poll(() => strip.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await strip.evaluate(el => { el.scrollLeft = 0; });
  await screenshot(captain.view, 'recommendations-mobile');
  await strip.screenshot({ path: info.outputPath('recommendations-mobile-cards.png') });
  await captain.view.getByRole('switch', { name: /Switch to dark mode/ }).click();
  await screenshot(captain.view, 'recommendations-mobile-dark');
  await strip.screenshot({ path: info.outputPath('recommendations-mobile-dark-cards.png') });
  await captain.view.setViewportSize({ width: 768, height: 1024 });
  await screenshot(captain.view, 'recommendations-tablet-dark');

  // If all available disciplines are already familiar, exploration stays honest.
  for (const key of ['team-pick-0', 'biology', 'writing-second', 'design']) {
    const response = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/competition_bookmarks`, { headers: headers(newcomer.token), data: { participant_id: newcomer.userId, competition_id: fixtures[key].id } });
    expect(response.ok()).toBe(true);
  }
  await newcomer.view.reload();
  await ready(newcomer.view);
  await expect(section(newcomer.view, 'new_to_you')).toContainText('No different fields available right now.');

  await page.goto('/discover');
  await expect(page.locator('[data-recommendations]')).toHaveCount(0);
  const guest = await anotherPage(browser, 390);
  await guest.goto('/discover');
  await expect(guest.locator('.discovery-catalogue .discovery-card')).toHaveCount(12);
  await expect(guest.locator('[data-recommendations]')).toHaveCount(0);
  await guest.getByRole('searchbox').fill(marker);
  await expect(guest.locator('[data-discovery-count]')).toHaveText('18 competitions');
  await guest.getByRole('link', { name: 'Next', exact: true }).click();
  await guest.reload();
  await expect(guest.locator('.discovery-catalogue .discovery-card')).toHaveCount(6);
  for (const view of [captain.view, member.view, newcomer.view, guest]) await view.context().close();
});

test('participant with no eligible opportunities sees useful empty guidance', async ({ page }) => {
  await createAccount(page, 'participant', 'm18', '1940-01-01');
  await page.goto('/discover');
  await expect(section(page, 'for_you')).toContainText('No eligible opportunities with upcoming registration deadlines right now.');
  await expect(section(page, 'new_to_you')).toContainText('No different fields available right now.');
  await expect(page.locator('.discovery-catalogue .discovery-card').first()).toBeVisible();
});
