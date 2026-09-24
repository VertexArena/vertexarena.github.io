import { test, expect } from './helpers/test.js';
import { createAccount, sessionCredentials } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const fixturePath = '.test-data/m10-fixture.json';
const stamp = days => new Date(Date.now() + days * 86400000).toISOString();
const cachedClient = '.test-data/supabase-js-2.117.1.umd.js';

async function secondaryPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const module = `${readFileSync(cachedClient, 'utf8')}\nexport const createClient = supabase.createClient;`;
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm', route => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: module }));
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  return context.newPage();
}

test('Milestone 10 announcements, realtime notifications, and access', async ({ page, browser, request }, testInfo) => {
  test.setTimeout(420000);
  const owner = await createAccount(page, 'organiser', 'm10');
  const ownerSession = await sessionCredentials(page);
  const participantPage = await secondaryPage(browser);
  const participant = await createAccount(participantPage, 'participant', 'm10');
  const participantSession = await sessionCredentials(participantPage);
  const outsiderPage = await secondaryPage(browser);
  const outsider = await createAccount(outsiderPage, 'participant', 'm10');
  const outsiderSession = await sessionCredentials(outsiderPage);
  const managerPage = await secondaryPage(browser);
  const manager = await createAccount(managerPage, 'organiser', 'm10');
  const managerSession = await sessionCredentials(managerPage);
  const id = randomUUID(), teamId = randomUUID();
  const slug = `m10-${owner.username.replaceAll('_', '-')}`;
  const teamSlug = `${slug}-team`;
  mkdirSync('.test-data', { recursive: true });
  writeFileSync(fixturePath, JSON.stringify({ ids: [ownerSession.userId, participantSession.userId, outsiderSession.userId, managerSession.userId], competitions: [id, teamId], slug, teamSlug }, null, 2));
  const headers = token => ({ apikey: ownerSession.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const root = `${ownerSession.SUPABASE_PROJECT_URL}/rest/v1`;
  const createCompetition = async (competitionId, competitionSlug, mode) => {
    const details = {
      id: competitionId, slug: competitionSlug, name: `Vertex M10 ${mode} ${owner.username}`, status: 'published',
      field_tags: ['design'], prize_details: 'Recognition for thoughtful work.',
      description: 'Announcement and notification acceptance fixture.',
      minimum_age: 12, maximum_age: 25, team_mode: mode,
      minimum_team_size: mode === 'team' ? 2 : null, maximum_team_size: mode === 'team' ? 4 : null,
      categories: [], structure: 'direct3', banner_kind: 'colour',
      banner_colour: '#2563eb', banner_colour_end: '#0b1120', banner_path: null,
      certificate_status: 'not_planned', registration_opens_at: stamp(-1),
      registration_closes_at: stamp(2), starts_at: stamp(3)
    };
    const rounds = [{ id: randomUUID(), name: 'Final round', slug: 'final-round', sequence: 1,
      advancement_count: 3, opens_at: stamp(4), submission_deadline: stamp(5), leaderboard_releases_at: stamp(6) }];
    const response = await request.post(`${root}/rpc/save_competition`, { headers: headers(ownerSession.token), data: { details, rounds } });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  await createCompetition(id, slug, 'individual');
  const registration = await request.post(`${root}/rpc/register_individual`, { headers: headers(participantSession.token), data: { target_competition_id: id } });
  expect(registration.ok(), await registration.text()).toBeTruthy();

  await participantPage.goto('/notifications');
  await expect(participantPage.getByText('Registration confirmed', { exact: true })).toBeVisible();
  await participantPage.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(participantPage.locator('[data-notification-count]')).toBeHidden();
  await participantPage.goto(`/competition/${slug}/announcements`);
  await expect(participantPage.getByRole('heading', { name: 'No announcements yet.' })).toBeVisible();
  await page.goto(`/organiser/competition/${slug}/workspace`);
  await page.getByRole('link', { name: 'Manage announcements' }).click();
  await expect(page.getByRole('heading', { name: 'Write an update.' })).toBeVisible();
  await page.getByLabel('Heading').fill('Round briefing');
  await page.getByLabel('Message').fill('Read the brief before the final round opens.');
  await page.getByRole('button', { name: 'Publish announcement' }).click();
  await expect(page.locator('[data-announcement-status]')).toContainText('Announcement published.');
  await expect(participantPage.getByRole('heading', { name: 'Round briefing' })).toBeVisible({ timeout: 20000 });
  await expect(participantPage.locator('[data-notification-count]')).toHaveText('1', { timeout: 20000 });
  await expect(participantPage.locator('[data-announcement-form]')).toHaveCount(0);
  await outsiderPage.goto(`/competition/${slug}/announcements`);
  await expect(outsiderPage.getByRole('heading', { name: 'Announcements unavailable.' })).toBeVisible();
  const deniedRows = await request.get(`${root}/competition_announcements?select=id&competition_id=eq.${id}`, { headers: headers(outsiderSession.token) });
  expect(deniedRows.ok()).toBeTruthy();
  expect(await deniedRows.json()).toEqual([]);
  const deniedPublish = await request.post(`${root}/rpc/publish_competition_announcement`, { headers: headers(participantSession.token), data: { target_competition_id: id, heading: 'Wrong role', message: 'Must fail' } });
  expect(deniedPublish.ok()).toBeFalsy();
  const deniedInsert = await request.post(`${root}/competition_announcements`, { headers: headers(participantSession.token), data: { competition_id: id, author_id: participantSession.userId, title: 'Direct write', body: 'Must fail' } });
  expect(deniedInsert.ok()).toBeFalsy();
  const participantNotices = await request.get(`${root}/notifications?select=id&recipient_id=eq.${participantSession.userId}&kind=eq.announcement`, { headers: headers(participantSession.token) });
  expect(participantNotices.ok()).toBeTruthy();
  const foreignNoticeId = (await participantNotices.json())[0].id;
  const deniedRead = await request.post(`${root}/rpc/mark_notification_read`, { headers: headers(outsiderSession.token), data: { target_notification_id: foreignNoticeId } });
  expect(deniedRead.ok()).toBeFalsy();

  await participantPage.goto('/notifications');
  await expect(participantPage.getByText('Round briefing', { exact: true })).toBeVisible();
  await participantPage.locator('.notice-row').filter({ hasText: 'Round briefing' }).getByRole('link', { name: 'Open update' }).click();
  await expect(participantPage).toHaveURL(new RegExp(`/competition/${slug}/announcements/[0-9a-f-]{36}$`));
  await expect(participantPage.locator('.announcement-focused h2')).toHaveText('Round briefing');
  await participantPage.reload();
  await expect(participantPage.locator('.announcement-focused h2')).toHaveText('Round briefing');
  await participantPage.goto('/notifications');
  await expect(participantPage.locator('.notice-row').filter({ hasText: 'Round briefing' }).getByRole('button', { name: 'Mark as read' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Heading').fill('Updated briefing');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(participantPage.getByText('Updated briefing', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByLabel('Heading').fill('Results date');
  await page.getByLabel('Message').fill('Results will appear after judging closes.');
  await page.getByRole('button', { name: 'Publish announcement' }).click();
  await expect(participantPage.locator('[data-notification-count]')).toHaveText('1', { timeout: 20000 });
  await participantPage.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(participantPage.locator('[data-notification-count]')).toBeHidden();
  await page.goto(`/competition/${slug}/announcements`);
  await expect(page.getByRole('heading', { name: 'Results date' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Updated briefing' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('m10-announcements-desktop.png'), fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.announcement-item').filter({ hasText: 'Updated briefing' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { name: 'Updated briefing' })).toHaveCount(0);
  await participantPage.reload();
  await expect(participantPage.getByText('Updated briefing', { exact: true })).toHaveCount(0);

  await page.goto(`/organiser/competition/${slug}/organisers`);
  await page.getByLabel('Organiser username').fill(`@${manager.username}`);
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await managerPage.goto('/notifications');
  await expect(managerPage.getByText('Competition organiser invitation', { exact: true })).toBeVisible();

  await createCompetition(teamId, teamSlug, 'team');
  const team = await request.post(`${root}/rpc/create_competition_team`, { headers: headers(participantSession.token), data: { target_competition_id: teamId, team_name: 'M10 test team' } });
  expect(team.ok(), await team.text()).toBeTruthy();
  const teamRow = await team.json();
  const invite = await request.post(`${root}/rpc/invite_competition_team_member`, { headers: headers(participantSession.token), data: { target_team_id: teamRow.id, target_username: outsider.username } });
  expect(invite.ok(), await invite.text()).toBeTruthy();
  await outsiderPage.goto('/notifications');
  await expect(outsiderPage.getByText('Team invitation', { exact: true })).toBeVisible();
  await outsiderPage.locator('.notice-row').filter({ hasText: 'Team invitation' }).getByRole('button', { name: 'Mark as read' }).click();
  await expect(outsiderPage.locator('.notice-row').filter({ hasText: 'Team invitation' }).getByRole('button', { name: 'Mark as read' })).toHaveCount(0);
  await outsiderPage.locator('.notice-row').filter({ hasText: 'Team invitation' }).getByRole('link', { name: 'Open update' }).click();
  await expect(outsiderPage).toHaveURL(new RegExp(`/competition/${teamSlug}/team$`));

  await participantPage.setViewportSize({ width: 390, height: 844 });
  await participantPage.goto('/notifications');
  await expect(participantPage.getByRole('heading', { name: 'Notifications.' })).toBeVisible();
  await expect(participantPage.locator('#vertex-splash')).toHaveCount(0);
  await participantPage.screenshot({ path: testInfo.outputPath('m10-notifications-mobile.png'), fullPage: true });
  expect(await participantPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await participantPage.close(); await outsiderPage.close(); await managerPage.close();
});
