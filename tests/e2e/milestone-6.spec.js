import { test, expect } from './helpers/test.js';
import { createAccount, sessionCredentials } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';

const stamp = days => new Date(Date.now() + days * 86400000).toISOString();

test('individual registration, dashboard, age limits, deadline rules and RLS', async ({ page, browser, request }, info) => {
  test.setTimeout(300000);
  const organiser = await createAccount(page, 'organiser', 'm6');
  const owner = await sessionCredentials(page);
  const headers = token => ({ apikey: owner.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const slugRoot = `m6-${organiser.username.replaceAll('_', '-')}`;
  const competitions = {};
  for (const [kind, settings] of Object.entries({
    main: { min: 12, max: 20, categories: ['Junior', 'Senior'], opens: -3, closes: 4, starts: 5 },
    younger: { min: 18, max: 20, categories: [], opens: -3, closes: 4, starts: 5 },
    older: { min: 12, max: 16, categories: [], opens: -3, closes: 4, starts: 5 },
    closed: { min: 12, max: 20, categories: [], opens: -4, closes: -1, starts: 5 },
    future: { min: 12, max: 20, categories: [], opens: 2, closes: 3, starts: 5 },
    team: { min: 12, max: 20, categories: [], opens: -3, closes: 4, starts: 5, team: true }
  })) {
    const id = randomUUID(), slug = `${slugRoot}-${kind}`;
    competitions[kind] = { id, slug };
    const details = {
      id, slug, name: `Vertex M6 ${kind} ${organiser.username}`, status: 'published',
      field_tags: ['design'], prize_details: 'Recognition for top entries.',
      description: 'An individual design challenge with clear entry rules and dates.',
      minimum_age: settings.min, maximum_age: settings.max,
      team_mode: settings.team ? 'team' : 'individual',
      minimum_team_size: settings.team ? 2 : null, maximum_team_size: settings.team ? 4 : null,
      categories: settings.categories, structure: 'direct3', banner_kind: 'colour',
      banner_colour: '#2563eb', banner_colour_end: '#0b1120', banner_path: null,
      certificate_status: 'not_planned', registration_opens_at: stamp(settings.opens),
      registration_closes_at: stamp(settings.closes), starts_at: stamp(settings.starts)
    };
    const rounds = [{ id: randomUUID(), name: 'Final round', slug: 'final-round', sequence: 1,
      advancement_count: 3, opens_at: stamp(6), submission_deadline: stamp(7),
      leaderboard_releases_at: stamp(8) }];
    const response = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/save_competition`, { headers: headers(owner.token), data: { details, rounds } });
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  async function participant(birthday) {
    const accountPage = await browser.newPage();
    const account = await createAccount(accountPage, 'participant', 'm6', birthday);
    const access = await sessionCredentials(accountPage);
    mkdirSync('.test-data', { recursive: true });
    appendFileSync('.test-data/accounts.ndjson', JSON.stringify({ id: access.userId, email: account.email }) + '\n');
    await accountPage.close();
    return { ...account, ...access };
  }
  const eligible = await participant('2009-03-14');
  const under = await participant('2014-03-14');
  const over = await participant('2000-03-14');

  const entryPage = await browser.newPage({ viewport: info.project.name.includes('mobile') ? { width: 390, height: 844 } : { width: 1366, height: 768 } });
  await entryPage.goto(`/competition/${competitions.main.slug}`);
  await entryPage.getByRole('link', { name: 'Register individually' }).click();
  await expect(entryPage).toHaveURL(/\/login\?returnTo=/);
  await entryPage.getByLabel('Email address').fill(eligible.email);
  await entryPage.getByLabel('Password', { exact: true }).fill(eligible.password);
  await entryPage.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(entryPage).toHaveURL(new RegExp(`/competition/${competitions.main.slug}/register$`));
  await expect(entryPage.getByRole('heading', { name: 'Make your entry.' })).toBeVisible();
  await entryPage.reload();
  await expect(entryPage.getByLabel('Competition category')).toBeVisible();
  await expect(entryPage.locator('#vertex-splash')).toHaveCount(0);
  await entryPage.screenshot({ path: `test-results/m6-entry-${info.project.name}.png`, fullPage: true });
  await entryPage.getByRole('button', { name: 'Confirm registration' }).click();
  expect(await entryPage.getByLabel('Competition category').evaluate(select => select.validity.valueMissing)).toBe(true);
  await entryPage.getByLabel('Competition category').selectOption('Junior');
  await entryPage.route('**/rest/v1/rpc/register_individual', route => route.abort('failed'));
  await entryPage.getByRole('button', { name: 'Confirm registration' }).click();
  await expect(entryPage.locator('[data-registration-status]')).toContainText('Could not reach Vertex');
  await expect(entryPage.getByRole('button', { name: 'Confirm registration' })).toBeEnabled();
  await entryPage.unroute('**/rest/v1/rpc/register_individual');
  await entryPage.getByRole('button', { name: 'Confirm registration' }).click();
  await expect(entryPage.getByRole('heading', { name: "You're registered." })).toBeVisible();
  await expect(entryPage.getByText('Category: Junior.')).toBeVisible();
  await entryPage.reload();
  await expect(entryPage.getByRole('heading', { name: "You're registered." })).toBeVisible();
  await expect(entryPage.locator('[data-registration-form]')).toHaveCount(0);
  const duplicate = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/register_individual`, { headers: headers(eligible.token), data: { target_competition_id: competitions.main.id, chosen_category: 'Junior' } });
  expect(duplicate.ok()).toBeFalsy();
  expect((await duplicate.json()).message).toContain('already registered');
  await entryPage.getByRole('link', { name: 'Open your dashboard' }).click();
  await expect(entryPage.getByRole('heading', { name: 'Your competitions.' })).toBeVisible();
  await expect(entryPage.locator('.registration-dashboard-card')).toContainText('Registered');
  await expect(entryPage.locator('.registration-dashboard-card')).toContainText('Junior');
  await expect(entryPage.locator('.registration-notice')).toContainText('Registration confirmed');
  await entryPage.reload();
  await expect(entryPage.locator('.registration-dashboard-card')).toHaveCount(1);
  await expect(entryPage.locator('#vertex-splash')).toHaveCount(0);
  await entryPage.screenshot({ path: `test-results/m6-dashboard-${info.project.name}.png`, fullPage: true });

  const foreignRead = await request.get(`${owner.SUPABASE_PROJECT_URL}/rest/v1/individual_registrations?select=id&competition_id=eq.${competitions.main.id}`, { headers: headers(under.token) });
  expect(foreignRead.ok()).toBeTruthy();
  expect(await foreignRead.json()).toEqual([]);
  const ownRead = await request.get(`${owner.SUPABASE_PROJECT_URL}/rest/v1/individual_registrations?select=id&competition_id=eq.${competitions.main.id}`, { headers: headers(eligible.token) });
  expect(ownRead.ok()).toBeTruthy();
  const [ownEntry] = await ownRead.json();
  expect(ownEntry?.id).toBeTruthy();
  const foreignNotification = await request.get(`${owner.SUPABASE_PROJECT_URL}/rest/v1/notifications?select=id&competition_id=eq.${competitions.main.id}`, { headers: headers(under.token) });
  expect(foreignNotification.ok()).toBeTruthy();
  expect(await foreignNotification.json()).toEqual([]);
  const directInsert = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/individual_registrations`, { headers: headers(under.token), data: { competition_id: competitions.main.id, participant_id: under.userId, category: 'Senior' } });
  expect(directInsert.ok()).toBeFalsy();
  const foreignWrite = await request.patch(`${owner.SUPABASE_PROJECT_URL}/rest/v1/individual_registrations?id=eq.${ownEntry.id}`, { headers: headers(under.token), data: { category: 'Senior' } });
  expect(foreignWrite.ok()).toBeFalsy();
  const ownReadAfter = await request.get(`${owner.SUPABASE_PROJECT_URL}/rest/v1/individual_registrations?select=category&id=eq.${ownEntry.id}`, { headers: headers(eligible.token) });
  expect((await ownReadAfter.json())[0].category).toBe('Junior');
  const wrongAccount = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/register_individual`, { headers: headers(owner.token), data: { target_competition_id: competitions.main.id } });
  expect(wrongAccount.ok()).toBeFalsy();

  async function loginView(account, competition, expected, screenshot = false) {
    const view = await browser.newPage({ viewport: info.project.name.includes('mobile') ? { width: 390, height: 844 } : { width: 1366, height: 768 } });
    await view.goto(`/login?returnTo=/competition/${competition.slug}/register`);
    await view.getByLabel('Email address').fill(account.email);
    await view.getByLabel('Password', { exact: true }).fill(account.password);
    await view.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(view.getByText(expected)).toBeVisible();
    await expect(view.locator('[data-registration-form]')).toHaveCount(0);
    await view.reload();
    await expect(view.getByText(expected)).toBeVisible();
    if (screenshot) {
      await expect(view.locator('#vertex-splash')).toHaveCount(0);
      await view.screenshot({ path: `test-results/m6-blocked-${info.project.name}.png`, fullPage: true });
    }
    await view.close();
  }
  await loginView(under, competitions.younger, /requires age 18 or older|at least 18/, true);
  await loginView(over, competitions.older, /for age 16 or younger|16 years old or younger/);
  await loginView(eligible, competitions.closed, /Registration closed/);
  await loginView(eligible, competitions.future, /Registration opens/);
  await loginView(eligible, competitions.team, /accepts teams only/);

  for (const [account, competition, message] of [
    [under, competitions.younger, 'at least 18'], [over, competitions.older, '16 years old or younger'],
    [eligible, competitions.closed, 'deadline has passed'], [eligible, competitions.future, 'not opened yet'],
    [eligible, competitions.team, 'accepts teams only']
  ]) {
    const response = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/register_individual`, { headers: headers(account.token), data: { target_competition_id: competition.id } });
    expect(response.ok()).toBeFalsy();
    expect((await response.json()).message).toContain(message);
  }
  await entryPage.close();
});
