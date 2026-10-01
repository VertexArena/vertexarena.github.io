import { test, expect } from './helpers/test.js';
import { createAccount, sessionCredentials, login } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const fixturePath = '.test-data/m8-fixture.json';
const stamp = days => new Date(Date.now() + days * 86400000).toISOString();

test('prepare Milestone 8 dashboard fixture', async ({ page, browser, request }) => {
  test.setTimeout(420000);
  const organiser = await createAccount(page, 'organiser', 'm8');
  const owner = await sessionCredentials(page);
  await page.goto('/organiser');
  await expect(page.getByRole('heading', { name: 'Your competitions.' })).toBeVisible();
  await expect(page.getByText('No competitions yet.')).toBeVisible();
  await page.screenshot({ path: 'test-results/m8-empty-organiser.png', fullPage: true });
  const participantPage = await browser.newPage();
  const participant = await createAccount(participantPage, 'participant', 'm8');
  const participantSession = await sessionCredentials(participantPage);
  await participantPage.goto('/dashboard');
  await expect(participantPage.getByText('No upcoming competitions.')).toBeVisible();
  await participantPage.screenshot({ path: 'test-results/m8-empty-participant.png', fullPage: true });
  const teammatePage = await browser.newPage();
  const teammate = await createAccount(teammatePage, 'participant', 'm8');
  const teammateSession = await sessionCredentials(teammatePage);
  const headers = token => ({ apikey: owner.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const root = `m8-${organiser.username.replaceAll('_', '-')}`;
  const competitions = {};
  const base = Date.now();
  const soon = seconds => new Date(base + seconds * 1000).toISOString();
  for (const key of ['upcoming', 'active', 'completed', 'team', 'invitation']) {
    const id = randomUUID(), slug = `${root}-${key}`;
    competitions[key] = { id, slug };
    const teamMode = ['team', 'invitation'].includes(key);
    const details = {
      id, slug, name: `Vertex M8 ${key} ${organiser.username}`, status: 'published',
      field_tags: ['design'], prize_details: 'Recognition for thoughtful work.',
      description: 'A test competition for dashboard classification and counts.',
      minimum_age: 12, maximum_age: 25, team_mode: teamMode ? 'team' : 'individual',
      minimum_team_size: teamMode ? 2 : null, maximum_team_size: teamMode ? 3 : null,
      categories: [], structure: 'direct3', banner_kind: 'colour',
      banner_colour: '#2563eb', banner_colour_end: '#0b1120', banner_path: null,
      certificate_status: key === 'team' ? 'planned' : 'not_planned',
      registration_opens_at: stamp(-2),
      registration_closes_at: ['active', 'completed'].includes(key) ? soon(180) : stamp(2),
      starts_at: ['active', 'completed'].includes(key) ? soon(181) : stamp(3)
    };
    const rounds = [{ id: randomUUID(), name: 'Final round', slug: 'final-round',
      sequence: 1, advancement_count: 3,
      opens_at: ['active', 'completed'].includes(key) ? soon(182) : stamp(4),
      submission_deadline: key === 'completed' ? soon(183) : stamp(5),
      leaderboard_releases_at: key === 'completed' ? soon(185) : stamp(6) }];
    const response = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/save_competition`, { headers: headers(owner.token), data: { details, rounds } });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  for (const key of ['upcoming', 'active', 'completed']) {
    await participantPage.goto(`/competition/${competitions[key].slug}/register`);
    await participantPage.getByRole('button', { name: 'Confirm registration' }).click();
    await expect(participantPage.getByRole('heading', { name: "You're registered." })).toBeVisible();
  }
  await participantPage.goto(`/competition/${competitions.team.slug}/team`);
  await participantPage.getByLabel('Team name').fill(`M8 Team ${participant.username}`);
  await participantPage.getByRole('button', { name: 'Create team' }).click();
  await participantPage.getByLabel('Participant username').fill(`@${teammate.username}`);
  await participantPage.locator('[data-team-suggestion]').filter({ hasText: teammate.username }).click();
  await participantPage.getByRole('button', { name: 'Send invitation' }).click();
  await teammatePage.goto(`/competition/${competitions.team.slug}/team`);
  await teammatePage.getByRole('button', { name: 'Accept invitation' }).click();
  await participantPage.goto(`/competition/${competitions.team.slug}/team`);
  await participantPage.getByRole('button', { name: 'Register team' }).click();
  await expect(participantPage.getByText('Team entry confirmed')).toBeVisible();
  await teammatePage.goto(`/competition/${competitions.invitation.slug}/team`);
  await teammatePage.getByLabel('Team name').fill(`M8 Invite ${teammate.username}`);
  await teammatePage.getByRole('button', { name: 'Create team' }).click();
  await teammatePage.getByLabel('Participant username').fill(`@${participant.username}`);
  await teammatePage.locator('[data-team-suggestion]').filter({ hasText: participant.username }).click();
  await teammatePage.getByRole('button', { name: 'Send invitation' }).click();
  mkdirSync('.test-data', { recursive: true });
  writeFileSync(fixturePath, JSON.stringify({ organiser, participant, teammate, ids: [owner.userId, participantSession.userId, teammateSession.userId], competitions }, null, 2));
  await participantPage.close();
  await teammatePage.close();
  // Exercise actual datetime transitions; no out-of-band fixture editing.
  await page.waitForTimeout(Math.max(0, base + 190000 - Date.now()));
});

test('Milestone 8 dashboards show actual state and stay usable across routes', async ({ page, browser, request }, info) => {
  test.setTimeout(300000);
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const { organiser, participant, competitions } = fixture;
  const mobile = info.project.name.includes('mobile');
  await login(page, participant, '/dashboard');
  await expect(page.getByRole('heading', { name: 'Your competitions.' })).toBeVisible();
  await expect(page.locator('section:has(#dashboard-upcoming) .dashboard-competition')).toHaveCount(2);
  await expect(page.locator('section:has(#dashboard-in-progress) .dashboard-competition')).toHaveCount(1);
  await expect(page.locator('section:has(#dashboard-completed) .dashboard-competition')).toHaveCount(1);
  await expect(page.locator('section:has(#dashboard-invitations)')).toContainText('M8 Invite');
  await expect(page.locator('section:has(#dashboard-deadlines)')).toContainText('Final round');
  const participantSession = await sessionCredentials(page);
  const deniedSummary = await request.post(`${participantSession.SUPABASE_PROJECT_URL}/rest/v1/rpc/organiser_dashboard_summary`, {
    headers: { apikey: participantSession.SUPABASE_ANON_KEY, Authorization: `Bearer ${participantSession.token}`, 'content-type': 'application/json' },
    data: {}
  });
  expect(deniedSummary.ok()).toBeFalsy();
  expect((await deniedSummary.json()).message).toContain('Only organiser accounts');
  await page.goto(`/organiser/competition/${competitions.team.slug}/workspace`);
  await expect(page.getByRole('heading', { name: 'Organiser account required.' })).toBeVisible();
  await page.goto('/dashboard');
  await page.reload();
  await expect(page.locator('section:has(#dashboard-completed) .dashboard-competition')).toHaveCount(1);
  await expect(page.locator('#vertex-splash')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: `test-results/m8-participant-${info.project.name}.png`, fullPage: true });
  if (mobile) await page.screenshot({ path: 'test-results/m8-participant-mobile-top.png' });

  const organiserPage = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 } });
  await login(organiserPage, organiser, '/organiser');
  await expect(organiserPage.locator('section:has(#organiser-competitions) .dashboard-competition')).toHaveCount(5);
  await expect(organiserPage.locator('.dashboard-metric').nth(0)).toContainText('4');
  await expect(organiserPage.locator('.dashboard-metric').nth(1)).toContainText('5');
  await expect(organiserPage.locator('.dashboard-metric').nth(2)).toContainText('1');
  await expect(organiserPage.locator('section:has(#organiser-activity)')).toContainText('registered');
  await organiserPage.locator('.dashboard-competition').filter({ hasText: 'Vertex M8 team' }).getByRole('link', { name: 'Open workspace' }).click();
  await expect(organiserPage).toHaveURL(new RegExp(`/organiser/competition/${competitions.team.slug}/workspace$`));
  await expect(organiserPage.getByRole('heading', { name: new RegExp('Vertex M8 team') })).toBeVisible();
  await expect(organiserPage.locator('.dashboard-metric').nth(2)).toContainText('1');
  await organiserPage.reload();
  await expect(organiserPage.getByRole('link', { name: 'View participants' })).toBeVisible();
  await organiserPage.getByRole('link', { name: 'View participants' }).click();
  await expect(organiserPage.locator('.organiser-team-row')).toHaveCount(1);
  await organiserPage.getByRole('link', { name: 'Competition workspace' }).click();
  await expect(organiserPage).toHaveURL(new RegExp('/workspace$'));
  await organiserPage.goto('/organiser');
  await expect(organiserPage.locator('section:has(#organiser-certificates)')).toContainText('Planned');
  await organiserPage.waitForTimeout(800);
  await organiserPage.screenshot({ path: `test-results/m8-organiser-${info.project.name}.png`, fullPage: true });
  if (mobile) await organiserPage.screenshot({ path: 'test-results/m8-organiser-mobile-top.png' });
  expect(await organiserPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();

  const guest = await browser.newPage();
  await guest.goto('/dashboard');
  await expect(guest).toHaveURL(/\/login\?returnTo=/);
  await guest.goto(`/organiser/competition/${competitions.team.slug}/workspace`);
  await expect(guest).toHaveURL(/\/login\?returnTo=/);
  await guest.close();
  await organiserPage.close();
});
