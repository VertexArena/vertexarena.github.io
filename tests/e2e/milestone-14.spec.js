import { test, expect } from './helpers/test.js';
import { createAccount, sessionCredentials } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

async function anotherPage(browser, width = 1366) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 768 } });
  const module = `${readFileSync('.test-data/supabase-js-2.117.1.umd.js', 'utf8')}\nexport const createClient = supabase.createClient;`;
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm', route => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: module }));
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  return context.newPage();
}

test('Milestone 14 scoring, visibility, and role isolation', async ({ page, browser, request }, info) => {
  test.setTimeout(420000);
  const owner = await createAccount(page, 'organiser', 'm14');
  const ownerSession = await sessionCredentials(page);
  const participantPage = await anotherPage(browser);
  const participant = await createAccount(participantPage, 'participant', 'm14');
  const participantSession = await sessionCredentials(participantPage);
  const incompletePage = await anotherPage(browser);
  const incomplete = await createAccount(incompletePage, 'participant', 'm14');
  const incompleteSession = await sessionCredentials(incompletePage);
  const captainPage = await anotherPage(browser);
  const captain = await createAccount(captainPage, 'participant', 'm14');
  const captainSession = await sessionCredentials(captainPage);
  const memberPage = await anotherPage(browser);
  const member = await createAccount(memberPage, 'participant', 'm14');
  const memberSession = await sessionCredentials(memberPage);
  const outsiderPage = await anotherPage(browser);
  const outsider = await createAccount(outsiderPage, 'participant', 'm14');
  const outsiderSession = await sessionCredentials(outsiderPage);
  const id = randomUUID(), roundId = randomUUID(), slug = `m14-${owner.username.replaceAll('_','-')}`;
  const fixture = { ids: [ownerSession.userId, participantSession.userId, incompleteSession.userId, captainSession.userId, memberSession.userId, outsiderSession.userId], competition: id, slug };
  writeFileSync('.test-data/m14-fixture.json', JSON.stringify(fixture, null, 2));
  const root = `${ownerSession.SUPABASE_PROJECT_URL}/rest/v1`;
  const headers = token => ({ apikey: ownerSession.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const rpc = async (token, name, data) => { const response = await request.post(`${root}/rpc/${name}`, { headers: headers(token), data }); expect(response.ok(), await response.text()).toBeTruthy(); return response.json().catch(() => null); };
  const when = minutes => new Date(Date.now() + minutes * 60000).toISOString();
  await rpc(ownerSession.token, 'save_competition', { details: {
    id, slug, name: `Vertex M14 ${owner.username}`, status: 'published', field_tags: ['design'],
    prize_details: 'Recognition.', description: 'Milestone 14 acceptance fixture.', minimum_age: 12, maximum_age: 25,
    team_mode: 'both', minimum_team_size: 2, maximum_team_size: 3, categories: [], structure: 'direct3',
    banner_kind: 'colour', banner_colour: '#2563eb', banner_colour_end: '#0b1120', banner_path: null,
    certificate_status: 'not_planned', registration_opens_at: when(-10), registration_closes_at: when(20), starts_at: when(21)
  }, rounds: [{ id: roundId, name: 'Final round', slug: 'final-round', sequence: 1, advancement_count: 3,
    opens_at: when(22), submission_deadline: when(45), leaderboard_releases_at: when(60) }] });
  await rpc(participantSession.token, 'register_individual', { target_competition_id: id });
  await rpc(incompleteSession.token, 'register_individual', { target_competition_id: id });
  const team = await rpc(captainSession.token, 'create_competition_team', { target_competition_id: id, team_name: `M14 Crew ${captain.username}` });
  const invite = await rpc(captainSession.token, 'invite_competition_team_member', { target_team_id: team.id, target_username: member.username });
  await rpc(memberSession.token, 'respond_competition_team_invitation', { target_invitation_id: invite.id, accept_invitation: true });
  await rpc(captainSession.token, 'register_competition_team', { target_team_id: team.id });

  const managerPath = `/organiser/competition/${slug}/scoring`;
  const publicPath = `/competition/${slug}/scores/final-round`;
  await page.goto(`/organiser/competition/${slug}/workspace`);
  await expect(page.getByRole('link', { name: 'Manage scoring' })).toBeVisible();
  await page.getByRole('link', { name: 'Manage scoring' }).click();
  await expect(page.getByRole('heading', { name: 'Score each entry.' })).toBeVisible();
  await expect(page.locator('.scoring-entry')).toHaveCount(3);
  await page.locator('[data-criterion-form] input[name=name]').fill('Reasoning');
  await page.locator('[data-criterion-form] input[name=maximum]').fill('20');
  await page.locator('[data-criterion-form] textarea[name=description]').fill('Explain each step.');
  await page.getByRole('button', { name: 'Save criterion' }).click();
  await expect(page.locator('.scoring-criteria-list li')).toHaveCount(1);
  await page.locator('[data-criterion-form] input[name=name]').fill('Presentation');
  await page.locator('[data-criterion-form] input[name=maximum]').fill('10');
  await page.getByRole('button', { name: 'Save criterion' }).click();
  await expect(page.locator('.scoring-criteria-list li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Move Presentation up' }).click();
  await expect(page.locator('.scoring-criteria-list li').first()).toContainText('Presentation');
  await page.getByRole('button', { name: 'Edit Presentation' }).click();
  await expect(page.locator('[data-criterion-form] input[name=name]')).toHaveValue('Presentation');
  await page.locator('[data-criterion-form] textarea[name=description]').fill('Communicate findings clearly.');
  await page.getByRole('button', { name: 'Save criterion' }).click();
  await expect(page.locator('.scoring-criteria-list li').first()).toContainText('Communicate findings clearly.');

  const entrant = page.locator('.scoring-entry').filter({ hasText: participant.name });
  await entrant.getByRole('button', { name: 'Enter marks' }).click();
  await entrant.locator('[data-criterion-id]').first().fill('8');
  await entrant.locator('[data-criterion-id]').last().fill('18');
  await entrant.getByRole('button', { name: 'Save marks' }).click();
  await expect(page.locator('.scoring-entry').filter({ hasText: participant.name })).toContainText('26 / 30');
  const partial = page.locator('.scoring-entry').filter({ hasText: incomplete.name });
  await partial.getByRole('button', { name: 'Enter marks' }).click();
  await partial.locator('[data-criterion-id]').first().fill('5');
  await partial.getByRole('button', { name: 'Save marks' }).click();
  await expect(page.locator('.scoring-entry').filter({ hasText: incomplete.name })).toContainText('1 / 2 scored');
  await expect(page.locator('.scoring-section-head').last()).toContainText('incomplete');
  const teamEntry = page.locator('.scoring-entry').filter({ hasText: team.name });
  await teamEntry.getByRole('button', { name: 'Enter marks' }).click();
  await teamEntry.locator('[data-criterion-id]').first().fill('9');
  await teamEntry.locator('[data-criterion-id]').last().fill('19');
  await teamEntry.getByRole('button', { name: 'Save marks' }).click();
  await expect(page.locator('.scoring-entry').filter({ hasText: team.name })).toContainText('28 / 30');
  await page.locator('[data-score-sort]').selectOption('score');
  await expect(page.locator('.scoring-entry').first()).toContainText(team.name);
  await page.locator('[data-score-search]').fill(`@${participant.username}`);
  await expect(page.locator('.scoring-entry')).toHaveCount(1);
  await page.locator('[data-score-search]').fill('');
  await page.locator('.scoring-entry').filter({ hasText: participant.name }).getByRole('button', { name: 'Enter marks' }).click();
  await page.locator('.scoring-entry').filter({ hasText: participant.name }).locator('[data-criterion-id]').last().fill('21');
  await page.locator('.scoring-entry').filter({ hasText: participant.name }).getByRole('button', { name: 'Save marks' }).click();
  await expect(page.locator('[data-entry-status]')).toContainText('within each criterion maximum');
  await page.locator('.scoring-entry').filter({ hasText: participant.name }).locator('[data-criterion-id]').last().fill('17');
  await page.locator('.scoring-entry').filter({ hasText: participant.name }).getByRole('button', { name: 'Save marks' }).click();
  await expect(page.locator('.scoring-entry').filter({ hasText: participant.name })).toContainText('25 / 30');
  await page.reload();
  await expect(page.locator('.scoring-criteria-list li')).toHaveCount(2);
  await expect(page.locator('.scoring-entry').filter({ hasText: participant.name })).toContainText('25 / 30');
  await outsiderPage.goto(publicPath);
  await expect(outsiderPage.getByRole('heading', { name: 'Scores are private.' })).toBeVisible();
  await page.locator('[data-score-visibility]').check();
  await expect(page.locator('.scoring-overview')).toContainText('Visible');
  await outsiderPage.goto(`/competition/${slug}`);
  await outsiderPage.getByRole('link', { name: 'View round scores' }).click();
  await expect(outsiderPage).toHaveURL(new RegExp(`${publicPath}$`));
  await outsiderPage.reload();
  await expect(outsiderPage.locator('.scoring-public-list article')).toHaveCount(2);
  await expect(outsiderPage.locator('.scoring-public-list')).not.toContainText(incomplete.name);
  await expect(outsiderPage.locator('.scoring-public-list article').first()).toContainText(team.name);
  await outsiderPage.setViewportSize({ width: 320, height: 700 });
  await outsiderPage.screenshot({ path: info.outputPath('m14-public-mobile.png'), fullPage: true });
  expect(await outsiderPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  const denied = await request.post(`${root}/rpc/save_round_scores`, { headers: headers(participantSession.token), data: { target_round_id: roundId, target_participant_id: participantSession.userId, score_items: [] } });
  expect(denied.ok()).toBeFalsy();
  const tableDenied = await request.post(`${root}/round_scores`, { headers: headers(participantSession.token), data: { round_id: roundId, criterion_id: randomUUID(), participant_id: participantSession.userId, marks: 1 } });
  expect(tableDenied.ok()).toBeFalsy();
  const privateRows = await request.get(`${root}/round_scores?select=id&round_id=eq.${roundId}`, { headers: headers(participantSession.token) });
  expect(await privateRows.json()).toEqual([]);
  await page.locator('[data-score-visibility]').uncheck();
  await outsiderPage.reload();
  await expect(outsiderPage.getByRole('heading', { name: 'Scores are private.' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('m14-organiser-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(managerPath);
  await expect(page.locator('.scoring-entry')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('m14-organiser-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await participantPage.goto(managerPath);
  await expect(participantPage.getByRole('heading', { name: 'Scoring unavailable.' })).toBeVisible();
  await participantPage.close(); await incompletePage.close(); await captainPage.close(); await memberPage.close(); await outsiderPage.close();
});
