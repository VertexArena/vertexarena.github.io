import { test, expect } from './helpers/test.js';
import { createAccount, sessionCredentials } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const stamp = days => new Date(Date.now() + days * 86400000).toISOString();

async function secondaryPage(browser, width = 1366) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 768 } });
  const module = `${readFileSync('.test-data/supabase-js-2.117.1.umd.js', 'utf8')}\nexport const createClient = supabase.createClient;`;
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm', route => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: module }));
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  return context.newPage();
}

test('Milestone 12 meeting assignment, restricted access, Jitsi route, and responsive layout', async ({ page, browser, request }, testInfo) => {
  test.setTimeout(420000);
  const owner = await createAccount(page, 'organiser', 'm12');
  const ownerSession = await sessionCredentials(page);
  const individualPage = await secondaryPage(browser);
  const individual = await createAccount(individualPage, 'participant', 'm12');
  const individualSession = await sessionCredentials(individualPage);
  const captainPage = await secondaryPage(browser);
  const captain = await createAccount(captainPage, 'participant', 'm12');
  const captainSession = await sessionCredentials(captainPage);
  const memberPage = await secondaryPage(browser);
  const member = await createAccount(memberPage, 'participant', 'm12');
  const memberSession = await sessionCredentials(memberPage);
  const unassignedPage = await secondaryPage(browser);
  const unassigned = await createAccount(unassignedPage, 'participant', 'm12');
  const unassignedSession = await sessionCredentials(unassignedPage);
  const competitionId = randomUUID();
  const slug = `m12-${owner.username.replaceAll('_', '-')}`;
  mkdirSync('.test-data', { recursive: true });
  writeFileSync('.test-data/m12-fixture.json', JSON.stringify({ ids: [ownerSession.userId, individualSession.userId, captainSession.userId, memberSession.userId, unassignedSession.userId], competitions: [competitionId], slug }, null, 2));
  const root = `${ownerSession.SUPABASE_PROJECT_URL}/rest/v1`;
  const headers = token => ({ apikey: ownerSession.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const rpc = async (token, name, data) => {
    const response = await request.post(`${root}/rpc/${name}`, { headers: headers(token), data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const details = {
    id: competitionId, slug, name: `Vertex M12 Meetings ${owner.username}`, status: 'published', field_tags: ['design'],
    prize_details: 'Recognition for thoughtful work.', description: 'Milestone 12 meeting acceptance fixture.',
    minimum_age: 12, maximum_age: 25, team_mode: 'both', minimum_team_size: 2, maximum_team_size: 3,
    categories: [], structure: 'direct3', banner_kind: 'colour', banner_colour: '#2563eb', banner_colour_end: '#0b1120',
    banner_path: null, certificate_status: 'not_planned', registration_opens_at: stamp(-1), registration_closes_at: stamp(2), starts_at: stamp(3)
  };
  const rounds = [{ id: randomUUID(), name: 'Final round', slug: 'final-round', sequence: 1, advancement_count: 3,
    opens_at: stamp(4), submission_deadline: stamp(5), leaderboard_releases_at: stamp(6) }];
  await rpc(ownerSession.token, 'save_competition', { details, rounds });
  await rpc(individualSession.token, 'register_individual', { target_competition_id: competitionId });
  await rpc(unassignedSession.token, 'register_individual', { target_competition_id: competitionId });
  const team = await rpc(captainSession.token, 'create_competition_team', { target_competition_id: competitionId, team_name: `M12 Crew ${captain.username}` });
  const invitation = await rpc(captainSession.token, 'invite_competition_team_member', { target_team_id: team.id, target_username: member.username });
  await rpc(memberSession.token, 'respond_competition_team_invitation', { target_invitation_id: invitation.id, accept_invitation: true });
  await rpc(captainSession.token, 'register_competition_team', { target_team_id: team.id });

  await page.goto(`/organiser/competition/${slug}/workspace`);
  await expect(page.getByRole('link', { name: 'Manage meetings' })).toBeVisible();
  await page.getByRole('link', { name: 'Manage meetings' }).click();
  await expect(page.getByRole('heading', { name: 'Bring the right people together.' })).toBeVisible();
  await page.getByLabel('Meeting name').fill('Round one briefing');
  await page.locator('[data-meeting-search]').fill(individual.username);
  await page.locator(`[data-meeting-pick="participant:${individualSession.userId}"]`).click();
  await page.locator('[data-meeting-search]').fill(team.name);
  await page.locator(`[data-meeting-pick="team:${team.id}"]`).click();
  await expect(page.locator('[data-meeting-selected]')).toContainText(individual.name);
  await expect(page.locator('[data-meeting-selected]')).toContainText(team.name);
  await page.getByRole('button', { name: 'Create and notify attendees' }).click();
  await expect(page.getByText('Meeting created. Assigned people have been notified.')).toBeVisible();
  await expect(page.locator('.meeting-card')).toContainText('Round one briefing');
  await page.getByRole('button', { name: 'View assigned people' }).click();
  await expect(page.locator('.meeting-roster')).toContainText(individual.username);
  await expect(page.locator('.meeting-roster')).toContainText(team.name);
  await page.getByLabel('Meeting name').fill('round ONE briefing');
  await page.locator(`[data-meeting-pick="participant:${individualSession.userId}"]`).click();
  await page.getByRole('button', { name: 'Create and notify attendees' }).click();
  await expect(page.locator('[data-meeting-error]')).toContainText('already exists');

  const rows = await request.get(`${root}/competition_meetings?select=id,slug,jitsi_room_name&competition_id=eq.${competitionId}`, { headers: headers(ownerSession.token) });
  expect(rows.ok(), await rows.text()).toBeTruthy();
  const meeting = (await rows.json())[0];
  const roomPath = `/competition/${slug}/meeting/${meeting.slug}`;
  for (const [view, session] of [[individualPage, individualSession], [captainPage, captainSession], [memberPage, memberSession]]) {
    await view.goto('/notifications');
    await expect(view.getByText('Meeting assigned: Round one briefing')).toBeVisible();
    const visible = await request.get(`${root}/competition_meetings?select=id&competition_id=eq.${competitionId}`, { headers: headers(session.token) });
    expect((await visible.json()).map(row => row.id)).toContain(meeting.id);
    await view.goto(`/competition/${slug}/meetings`);
    await expect(view.locator('.meeting-card')).toContainText('Round one briefing');
  }
  await unassignedPage.goto(`/competition/${slug}/meetings`);
  await expect(unassignedPage.getByText('No meetings assigned to you yet.')).toBeVisible();
  await unassignedPage.goto(roomPath);
  await expect(unassignedPage.getByRole('heading', { name: 'Meeting unavailable.' })).toBeVisible();
  await expect(unassignedPage.locator('[data-meeting-embed]')).toHaveCount(0);
  const hidden = await request.get(`${root}/competition_meetings?select=id,jitsi_room_name&competition_id=eq.${competitionId}`, { headers: headers(unassignedSession.token) });
  expect(await hidden.json()).toEqual([]);
  const deniedCreate = await request.post(`${root}/rpc/create_competition_meeting`, { headers: headers(unassignedSession.token), data: { target_competition_id: competitionId, meeting_name: 'No access', meeting_starts_at: stamp(1), participant_ids: [unassignedSession.userId] } });
  expect(deniedCreate.ok()).toBeFalsy();

  await individualPage.goto(roomPath);
  await expect(individualPage.getByRole('heading', { name: 'Round one briefing' })).toBeVisible();
  await individualPage.reload();
  await expect(individualPage.getByRole('heading', { name: 'Round one briefing' })).toBeVisible();
  await expect(individualPage.locator('#vertex-splash')).toHaveCount(0);
  await expect(individualPage.locator('.meeting-embed iframe')).toBeAttached({ timeout: 45000 });
  await expect(individualPage.locator('[data-meeting-status]')).toBeHidden({ timeout: 45000 });
  expect(await individualPage.locator('.meeting-embed iframe').getAttribute('src')).toContain('meet.jit.si');
  await individualPage.screenshot({ path: testInfo.outputPath('m12-room-desktop.png') });
  await individualPage.getByRole('button', { name: 'Leave meeting' }).click();
  await expect(individualPage).toHaveURL(new RegExp(`/competition/${slug}$`));
  await expect(individualPage.locator('[data-meeting-room]')).toHaveCount(0);
  await page.goto(`/organiser/competition/${slug}/meetings`);
  await expect(page.locator('#vertex-splash')).toHaveCount(0);
  await expect(page.locator('.meeting-card')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('m12-organiser-desktop.png'), fullPage: true });
  await memberPage.setViewportSize({ width: 320, height: 700 });
  await memberPage.goto(`/competition/${slug}/meetings`);
  await expect(memberPage.locator('#vertex-splash')).toHaveCount(0);
  await expect(memberPage.locator('.meeting-card')).toBeVisible();
  await memberPage.screenshot({ path: testInfo.outputPath('m12-meetings-mobile.png'), fullPage: true });
  expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await memberPage.goto(roomPath);
  await expect(memberPage.locator('.meeting-embed iframe')).toBeAttached({ timeout: 45000 });
  await expect(memberPage.locator('[data-meeting-status]')).toBeHidden({ timeout: 45000 });
  await memberPage.screenshot({ path: testInfo.outputPath('m12-room-mobile.png') });
  await memberPage.getByRole('button', { name: 'Leave meeting' }).click();
  await expect(memberPage).toHaveURL(new RegExp(`/competition/${slug}$`));
  await individualPage.close(); await captainPage.close(); await memberPage.close(); await unassignedPage.close();
});
