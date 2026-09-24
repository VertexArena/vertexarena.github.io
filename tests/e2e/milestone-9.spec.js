import { test, expect } from './helpers/test.js';
import { createAccount, login, sessionCredentials } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const fixturePath = '.test-data/m9-fixture.json';
const stamp = days => new Date(Date.now() + days * 86400000).toISOString();

test('Milestone 9 owner invitation, manager access, and safeguards', async ({ page, browser, request }) => {
  test.setTimeout(420000);
  const owner = await createAccount(page, 'organiser', 'm9');
  const ownerSession = await sessionCredentials(page);
  const managerPage = await browser.newPage();
  const manager = await createAccount(managerPage, 'organiser', 'm9');
  const managerSession = await sessionCredentials(managerPage);
  const outsiderPage = await browser.newPage();
  const outsider = await createAccount(outsiderPage, 'organiser', 'm9');
  const outsiderSession = await sessionCredentials(outsiderPage);
  const participantPage = await browser.newPage();
  const participant = await createAccount(participantPage, 'participant', 'm9');
  const participantSession = await sessionCredentials(participantPage);
  const id = randomUUID(), slug = `m9-${owner.username.replaceAll('_', '-')}`;
  mkdirSync('.test-data', { recursive: true });
  writeFileSync(fixturePath, JSON.stringify({ owner: { email: owner.email, username: owner.username }, ids: [ownerSession.userId, managerSession.userId, outsiderSession.userId, participantSession.userId], competition: { id, slug } }, null, 2));
  const headers = token => ({ apikey: ownerSession.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const root = `${ownerSession.SUPABASE_PROJECT_URL}/rest/v1`;
  const details = {
    id, slug, name: `Vertex M9 collaboration ${owner.username}`, status: 'published',
    field_tags: ['design'], prize_details: 'Recognition for thoughtful work.',
    description: 'Competition organiser collaboration acceptance fixture.',
    minimum_age: 12, maximum_age: 25, team_mode: 'individual',
    categories: [], structure: 'direct3', banner_kind: 'colour',
    banner_colour: '#2563eb', banner_colour_end: '#0b1120', banner_path: null,
    certificate_status: 'not_planned', registration_opens_at: stamp(-1),
    registration_closes_at: stamp(2), starts_at: stamp(3)
  };
  const rounds = [{ id: randomUUID(), name: 'Final round', slug: 'final-round',
    sequence: 1, advancement_count: 3, opens_at: stamp(4),
    submission_deadline: stamp(5), leaderboard_releases_at: stamp(6) }];
  const created = await request.post(`${root}/rpc/save_competition`, { headers: headers(ownerSession.token), data: { details, rounds } });
  expect(created.ok(), await created.text()).toBeTruthy();

  await page.goto(`/organiser/competition/${slug}/organisers`);
  await expect(page.getByRole('heading', { name: 'Organiser team.' })).toBeVisible();
  await expect(page.getByText('Permanent owner', { exact: true })).toBeVisible();
  await page.getByLabel('Organiser username').fill(`@${manager.username.slice(0, 9)}`);
  await expect(page.locator('[data-collab-suggestion]').filter({ hasText: manager.username })).toBeVisible();
  await page.locator('[data-collab-suggestion]').filter({ hasText: manager.username }).click();
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText('Invitation sent.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pending invitations' })).toBeVisible();
  const notice = await request.get(`${root}/notifications?select=kind,title,recipient_id&recipient_id=eq.${managerSession.userId}&kind=eq.competition_organiser_invitation`, { headers: headers(managerSession.token) });
  expect(notice.ok()).toBeTruthy();
  expect((await notice.json())).toHaveLength(1);

  await managerPage.goto('/organiser');
  await expect(managerPage.getByRole('heading', { name: 'Competition invitations' })).toBeVisible();
  await expect(managerPage.getByText(details.name)).toBeVisible();
  await managerPage.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(managerPage.getByText('Invitation accepted.')).toBeVisible();
  await expect(managerPage.locator('section:has(#organiser-competitions)')).toContainText(details.name);
  await managerPage.goto(`/organiser/competition/${slug}/workspace`);
  await expect(managerPage.getByRole('heading', { name: details.name })).toBeVisible();
  await managerPage.getByRole('link', { name: 'View participants' }).click();
  await expect(managerPage.getByRole('heading', { name: 'Participants.' })).toBeVisible();
  await managerPage.goto(`/organiser/competition/${slug}`);
  await expect(managerPage.getByRole('heading', { name: 'Shape what comes next.' })).toBeVisible();
  await managerPage.getByLabel('Description').fill('Updated by invited manager through Vertex.');
  await managerPage.getByRole('button', { name: 'Save changes' }).click();
  await expect(managerPage.locator('[data-competition-status]')).toContainText('Your changes are saved.');
  await managerPage.goto(`/competition/${slug}`);
  await expect(managerPage.getByText('Updated by invited manager through Vertex.')).toBeVisible();
  await managerPage.goto(`/organiser/competition/${slug}/organisers`);
  await expect(managerPage.getByText('Manager access')).toBeVisible();
  await expect(managerPage.getByRole('button', { name: 'Leave team' })).toBeVisible();
  await managerPage.reload();
  await expect(managerPage.getByRole('heading', { name: 'Organiser team.' })).toBeVisible();

  await page.getByLabel('Organiser username').fill(`@${outsider.username}`);
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText('Invitation sent.')).toBeVisible();
  await outsiderPage.goto('/organiser');
  await expect(outsiderPage.getByText(details.name)).toBeVisible();
  await outsiderPage.getByRole('button', { name: 'Decline' }).click();
  await expect(outsiderPage.getByText('Invitation declined.')).toBeVisible();
  await expect(outsiderPage.locator('section:has(#organiser-competitions)')).not.toContainText(details.name);

  await page.getByLabel('Organiser username').fill(`@${participant.username}`);
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.locator('[data-collab-status]')).toContainText('not a participant account');
  const badInvite = await request.post(`${root}/rpc/invite_competition_organiser`, { headers: headers(participantSession.token), data: { target_competition_id: id, target_username: outsider.username } });
  expect(badInvite.ok()).toBeFalsy();
  const managerRemoveOwner = await request.post(`${root}/rpc/remove_competition_organiser`, { headers: headers(managerSession.token), data: { target_competition_id: id, target_organiser_id: ownerSession.userId } });
  expect(managerRemoveOwner.ok()).toBeFalsy();
  const outsiderRemove = await request.post(`${root}/rpc/remove_competition_organiser`, { headers: headers(outsiderSession.token), data: { target_competition_id: id, target_organiser_id: managerSession.userId } });
  expect(outsiderRemove.ok()).toBeFalsy();
  await outsiderPage.goto(`/organiser/competition/${slug}/organisers`);
  await expect(outsiderPage.getByRole('heading', { name: 'Organiser team unavailable.' })).toBeVisible();
  await participantPage.goto(`/organiser/competition/${slug}/organisers`);
  await expect(participantPage.getByRole('heading', { name: 'Organiser account required.' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove manager' }).click();
  await expect(page.getByText('Organiser access removed.')).toBeVisible();
  await managerPage.goto('/organiser');
  await expect(managerPage.locator('section:has(#organiser-competitions)')).not.toContainText(details.name);
  await managerPage.goto(`/organiser/competition/${slug}/workspace`);
  await expect(managerPage.getByRole('heading', { name: 'This path left the field.' })).toBeVisible();
  await expect(page.getByText('Permanent owner', { exact: true })).toBeVisible();
  await managerPage.close(); await outsiderPage.close(); await participantPage.close();
});

test('Milestone 9 collaboration page works on mobile', async ({ page }, info) => {
  test.skip(!info.project.name.includes('mobile'), 'mobile viewport only');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const owner = { ...fixture.owner, password: `Vertex!${fixture.owner.username.slice(4)}Aa` };
  await login(page, owner, `/organiser/competition/${fixture.competition.slug}/organisers`);
  await expect(page.getByRole('heading', { name: 'Organiser team.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: `test-results/m9-organisers-${info.project.name}.png`, fullPage: true });
});
