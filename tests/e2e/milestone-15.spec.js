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

test('Milestone 15 advancement, exact tie decisions, next round roster, and access', async ({ page, browser, request }, info) => {
  test.setTimeout(480000);
  const owner = await createAccount(page, 'organiser', 'm15');
  const ownerSession = await sessionCredentials(page);
  const entrantPages = [];
  const entrants = [];
  for (let i = 0; i < 4; i++) {
    const p = await anotherPage(browser);
    const account = await createAccount(p, 'participant', 'm15');
    entrantPages.push(p); entrants.push({ ...account, ...await sessionCredentials(p) });
  }
  const captainPage = await anotherPage(browser);
  const captain = { ...await createAccount(captainPage, 'participant', 'm15'), ...await sessionCredentials(captainPage) };
  const memberPage = await anotherPage(browser);
  const member = { ...await createAccount(memberPage, 'participant', 'm15'), ...await sessionCredentials(memberPage) };
  const id = randomUUID(), first = randomUUID(), second = randomUUID(), slug = `m15-${owner.username.replaceAll('_','-')}`;
  writeFileSync('.test-data/m15-fixture.json', JSON.stringify({ ids: [ownerSession.userId, ...entrants.map(x => x.userId), captain.userId, member.userId], competition: id, slug }, null, 2));
  const root = `${ownerSession.SUPABASE_PROJECT_URL}/rest/v1`;
  const headers = token => ({ apikey: ownerSession.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const rpc = async (token, name, data) => { const response = await request.post(`${root}/rpc/${name}`, { headers: headers(token), data }); expect(response.ok(), await response.text()).toBeTruthy(); return response.json().catch(() => null); };
  const when = minutes => new Date(Date.now() + minutes * 60000).toISOString();
  await rpc(ownerSession.token, 'save_competition', { details: {
    id, slug, name: `Vertex M15 ${owner.username}`, status: 'published', field_tags: ['design'], prize_details: 'Recognition.',
    description: 'Milestone 15 acceptance fixture.', minimum_age: 12, maximum_age: 25,
    team_mode: 'both', minimum_team_size: 2, maximum_team_size: 3, categories: [], structure: 'custom',
    banner_kind: 'colour', banner_colour: '#2563eb', banner_colour_end: '#0b1120', banner_path: null,
    certificate_status: 'not_planned', registration_opens_at: when(-10), registration_closes_at: when(20), starts_at: when(21)
  }, rounds: [
    { id: first, name: 'Qualifier', slug: 'qualifier', sequence: 1, advancement_count: 3, opens_at: when(22), submission_deadline: when(45), leaderboard_releases_at: when(60) },
    { id: second, name: 'Final', slug: 'final', sequence: 2, advancement_count: 2, opens_at: when(61), submission_deadline: when(90), leaderboard_releases_at: when(110) }
  ] });
  for (const entrant of entrants) await rpc(entrant.token, 'register_individual', { target_competition_id: id });
  const team = await rpc(captain.token, 'create_competition_team', { target_competition_id: id, team_name: `M15 Team ${captain.username}` });
  const invite = await rpc(captain.token, 'invite_competition_team_member', { target_team_id: team.id, target_username: member.username });
  await rpc(member.token, 'respond_competition_team_invitation', { target_invitation_id: invite.id, accept_invitation: true });
  await rpc(captain.token, 'register_competition_team', { target_team_id: team.id });
  const criterion = await rpc(ownerSession.token, 'save_scoring_criterion', { target_round_id: first, target_criterion_id: null, criterion_name: 'Total', criterion_max: 100, criterion_description: 'Judged work' });
  const marks = async (participantId, teamId, value) => rpc(ownerSession.token, 'save_round_scores', { target_round_id: first, target_participant_id: participantId, target_team_id: teamId, score_items: [{ criterion_id: criterion.id, marks: value }] });
  await marks(entrants[0].userId, null, 100);
  await marks(entrants[1].userId, null, 100);
  await marks(entrants[2].userId, null, 90);
  await marks(entrants[3].userId, null, 80);
  await marks(null, team.id, 80);
  const managerPath = `/organiser/competition/${slug}/advancement`;
  await page.goto(`/organiser/competition/${slug}/workspace`);
  await page.getByRole('link', { name: 'Resolve advancement' }).click();
  await expect(page.getByRole('heading', { name: 'Draw the line.' })).toBeVisible();
  await expect(page.locator('.advancement-row')).toHaveCount(5);
  await expect(page.locator('.advancement-row.boundary')).toHaveCount(0);
  await expect(page.locator('.advancement-row').filter({ hasText: entrants[2].name })).toContainText('Advance');
  await expect(page.locator('.advancement-row').filter({ hasText: team.name })).toContainText('Eliminated');
  await page.screenshot({ path: info.outputPath('m15-no-tie-desktop.png'), fullPage: true });
  await marks(null, team.id, 90);
  await page.reload();
  await expect(page.locator('.advancement-row.boundary')).toHaveCount(2);
  await expect(page.locator('.advancement-row').filter({ hasText: entrants[0].name })).not.toHaveClass(/boundary/);
  await expect(page.locator('.advancement-row').filter({ hasText: entrants[1].name })).not.toHaveClass(/boundary/);
  await expect(page.getByText('Unresolved', { exact: true }).first()).toBeVisible();
  const unresolvedFinalise = await request.post(`${root}/rpc/finalise_round_advancement`, { headers: headers(ownerSession.token), data: { target_round_id: first } });
  expect(unresolvedFinalise.ok()).toBeFalsy();
  expect(await unresolvedFinalise.text()).toContain('Resolve the cutoff tie');
  const unpublished = await request.patch(`${root}/competition_rounds?id=eq.${first}`, { headers: { ...headers(ownerSession.token), Prefer: 'return=representation' }, data: { leaderboard_state: 'published' } });
  expect(unpublished.ok()).toBeFalsy();
  await page.getByRole('button', { name: 'Include all tied entries' }).click();
  await expect(page.locator('.advancement-row').filter({ hasText: team.name })).toContainText('Advance');
  await page.getByRole('button', { name: 'Exclude all tied entries' }).click();
  await expect(page.locator('.advancement-row').filter({ hasText: team.name })).toContainText('Eliminated');
  await page.getByRole('button', { name: 'Leave unresolved' }).click();
  await expect(page.locator('[data-finalise]')).toBeDisabled();
  await page.locator('[data-manual-form] input[value="' + team.id + '"]').check();
  await page.getByRole('button', { name: 'Save manual selection' }).click();
  await expect(page.locator('.advancement-row').filter({ hasText: team.name })).toContainText('Advance');
  await expect(page.locator('.advancement-row').filter({ hasText: entrants[2].name })).toContainText('Eliminated');
  await page.screenshot({ path: info.outputPath('m15-tie-decision-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.reload();
  await expect(page.locator('.advancement-row.boundary')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('m15-tie-decision-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Finalise round' }).click();
  await expect(page.getByRole('heading', { name: 'Round locked.' })).toBeVisible();
  await page.getByRole('link', { name: /02 Final/ }).click();
  await expect(page.locator('.advancement-row')).toHaveCount(3);
  await expect(page.locator('.advancement-ranking')).toContainText(team.name);
  await expect(page.locator('.advancement-ranking')).not.toContainText(entrants[2].name);
  await expect(page.locator('.advancement-ranking')).not.toContainText(entrants[3].name);
  const nextScore = await request.post(`${root}/rpc/save_round_scores`, { headers: headers(ownerSession.token), data: { target_round_id: second, target_participant_id: entrants[2].userId, target_team_id: null, score_items: [] } });
  expect(nextScore.ok()).toBeFalsy();
  const roster = await rpc(ownerSession.token, 'round_scoring_roster', { target_round_id: second });
  expect(roster.entries).toHaveLength(3);
  const memberEligibility = await rpc(member.token, 'my_round_entry_eligible', { target_round_id: second });
  expect(memberEligibility).toBe(false);
  const eliminatedEligibility = await rpc(entrants[2].token, 'my_round_entry_eligible', { target_round_id: second });
  expect(eliminatedEligibility).toBe(false);
  await memberPage.goto(`/competition/${slug}/progress`);
  await expect(memberPage.getByRole('heading', { name: 'Every round counts.' })).toBeVisible();
  await expect(memberPage.locator('.progress-step').first()).toContainText('Awaiting result');
  await memberPage.reload();
  await expect(memberPage.locator('.progress-step').first()).toContainText('Awaiting result');
  await entrantPages[2].goto(`/competition/${slug}/submissions/final`);
  await expect(entrantPages[2].getByRole('heading', { name: 'Submissions unavailable.' })).toBeVisible();
  await entrantPages[2].goto(`/competition/${slug}/progress`);
  await expect(entrantPages[2].locator('.progress-step').first()).toContainText('Awaiting result');
  await entrantPages[2].goto(managerPath);
  await expect(entrantPages[2].getByRole('heading', { name: 'Advancement unavailable.' })).toBeVisible();
  const anonymous = await anotherPage(browser, 390);
  await anonymous.goto(managerPath);
  await expect(anonymous).toHaveURL(/\/login\?returnTo=/);
  await anonymous.close();
  for (const p of entrantPages) await p.close();
  await captainPage.close(); await memberPage.close();
});
