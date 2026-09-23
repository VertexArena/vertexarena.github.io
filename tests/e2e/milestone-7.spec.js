import { test, expect } from './helpers/test.js';
import { createAccount, sessionCredentials } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';

const stamp = days => new Date(Date.now() + days * 86400000).toISOString();

test('team invitations, roster rules, entry, organiser nesting and permissions', async ({ page, browser, request }, info) => {
  test.setTimeout(420000);
  const organiser = await createAccount(page, 'organiser', 'm7');
  const owner = await sessionCredentials(page);
  const headers = token => ({ apikey: owner.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const root = `m7-${organiser.username.replaceAll('_', '-')}`;
  const competitions = {};
  for (const [kind, mode] of [['main', 'both'], ['team-only', 'team']]) {
    const id = randomUUID(), slug = `${root}-${kind}`;
    competitions[kind] = { id, slug };
    const details = {
      id, slug, name: `Vertex M7 ${kind} ${organiser.username}`, status: 'published',
      field_tags: ['design'], prize_details: 'Recognition for outstanding teams.',
      description: 'A team design challenge with clear participation rules.',
      minimum_age: 12, maximum_age: 20, team_mode: mode,
      minimum_team_size: kind === 'main' ? 3 : 2, maximum_team_size: 3,
      categories: kind === 'main' ? ['Junior', 'Senior'] : [],
      structure: 'direct3', banner_kind: 'colour', banner_colour: '#2563eb',
      banner_colour_end: '#0b1120', banner_path: null, certificate_status: 'not_planned',
      registration_opens_at: stamp(-3), registration_closes_at: stamp(4), starts_at: stamp(5)
    };
    const rounds = [{ id: randomUUID(), name: 'Final round', slug: 'final-round',
      sequence: 1, advancement_count: 3, opens_at: stamp(6),
      submission_deadline: stamp(7), leaderboard_releases_at: stamp(8) }];
    const response = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/save_competition`, {
      headers: headers(owner.token), data: { details, rounds }
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  const viewport = info.project.name.includes('mobile') ? { width: 390, height: 844 } : { width: 1366, height: 768 };
  async function participant(label, birthday = '2009-03-14') {
    const view = await browser.newPage({ viewport });
    const account = await createAccount(view, 'participant', 'm7', birthday);
    const access = await sessionCredentials(view);
    mkdirSync('.test-data', { recursive: true });
    appendFileSync('.test-data/accounts.ndjson', JSON.stringify({ id: access.userId, email: account.email }) + '\n');
    return { view, ...account, ...access, label };
  }
  const captain = await participant('captain');
  const accepted = await participant('accepted');
  const declined = await participant('declined');
  const third = await participant('third');
  const outsider = await participant('outsider');
  const extra = await participant('extra');
  const underage = await participant('underage', '2016-03-14');
  const main = competitions.main, teamOnly = competitions['team-only'];
  const teamUrl = `/competition/${main.slug}/team`;
  const teamName = `Orbit Crew ${captain.username}`;

  const guest = await browser.newPage({ viewport });
  await guest.goto(`/competition/${main.slug}`);
  await guest.getByRole('link', { name: 'Build or join team' }).click();
  await expect(guest).toHaveURL(/\/login\?returnTo=/);
  await guest.getByLabel('Email address').fill(captain.email);
  await guest.getByLabel('Password', { exact: true }).fill(captain.password);
  await guest.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(guest).toHaveURL(new RegExp(`${teamUrl}$`));
  await guest.close();

  await captain.view.goto(`/competition/${main.slug}`);
  await captain.view.getByRole('link', { name: 'Build or join team' }).click();
  await expect(captain.view).toHaveURL(new RegExp(`${teamUrl}$`));
  await captain.view.getByLabel('Team name').fill(teamName);
  await captain.view.getByRole('button', { name: 'Create team' }).click();
  await expect(captain.view.getByRole('heading', { name: teamName })).toBeVisible();
  await captain.view.reload();
  await expect(captain.view.getByRole('heading', { name: 'Team roster' })).toBeVisible();
  await expect(captain.view.locator('#vertex-splash')).toHaveCount(0);
  expect(await captain.view.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await captain.view.screenshot({ path: `test-results/m7-roster-${info.project.name}.png`, fullPage: true });
  const teamId = await captain.view.locator('.team-page').getAttribute('data-team-id');

  await captain.view.goto(`/competition/${main.slug}/register`);
  await expect(captain.view.getByText(/already belong to a team/)).toBeVisible();
  await expect(captain.view.locator('[data-registration-form]')).toHaveCount(0);
  const individualConflict = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/register_individual`, {
    headers: headers(captain.token), data: { target_competition_id: main.id, chosen_category: 'Junior' }
  });
  expect(individualConflict.ok()).toBeFalsy();
  expect((await individualConflict.json()).message).toContain('team');
  await captain.view.goto(teamUrl);

  await outsider.view.goto(`/competition/${main.slug}/register`);
  await outsider.view.getByLabel('Competition category').selectOption('Senior');
  await outsider.view.getByRole('button', { name: 'Confirm registration' }).click();
  await expect(outsider.view.getByRole('heading', { name: "You're registered." })).toBeVisible();
  async function invite(person) {
    await captain.view.getByLabel('Participant username').fill(`@${person.username}`);
    const suggestion = captain.view.locator('[data-team-suggestion]').filter({ hasText: person.username });
    await expect(suggestion).toContainText(person.name);
    await suggestion.click();
    await captain.view.getByRole('button', { name: 'Send invitation' }).click();
    await expect(captain.view.locator('[data-team-status]')).toContainText('Invitation sent.');
  }
  await captain.view.getByLabel('Participant username').fill(`@${outsider.username}`);
  await captain.view.getByRole('button', { name: 'Send invitation' }).click();
  await expect(captain.view.locator('[data-team-status]')).toContainText('individual entry');
  await captain.view.getByLabel('Participant username').fill(`@${underage.username}`);
  await captain.view.getByRole('button', { name: 'Send invitation' }).click();
  await expect(captain.view.locator('[data-team-status]')).toContainText('at least 12');
  await invite(accepted);
  await invite(declined);

  for (const person of [accepted, declined]) {
    await person.view.goto('/dashboard');
    await expect(person.view.locator('.dashboard-team-invitations')).toContainText(teamName);
    await expect(person.view.locator('.registration-notices .registration-notice')).toContainText('Team invitation');
    await person.view.locator('.dashboard-team-invitations a').click();
    await expect(person.view).toHaveURL(new RegExp(`${teamUrl}$`));
    await expect(person.view.getByRole('heading', { name: teamName })).toBeVisible();
  }
  await accepted.view.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(accepted.view.getByRole('heading', { name: 'Team roster' })).toBeVisible();
  await declined.view.getByRole('button', { name: 'Decline' }).click();
  await expect(declined.view.getByRole('heading', { name: 'Create a team' })).toBeVisible();
  await expect(captain.view.locator('.team-seat').filter({ hasText: accepted.name })).toBeVisible();
  await expect(captain.view.locator('.team-sent-row').filter({ hasText: declined.username })).toContainText('declined');

  await captain.view.getByLabel('Competition category').selectOption('Junior');
  await captain.view.getByRole('button', { name: 'Register team' }).click();
  await expect(captain.view.locator('[data-team-status]')).toContainText('Team size must be between 3 and 3 members; currently 2');
  await invite(third);
  await third.view.goto(teamUrl);
  await third.view.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(captain.view.locator('.team-capacity')).toContainText('3 / 3');
  await captain.view.getByLabel('Participant username').fill(`@${extra.username}`);
  await captain.view.getByRole('button', { name: 'Send invitation' }).click();
  await expect(captain.view.locator('[data-team-status]')).toContainText('no open invitation slots');
  await captain.view.getByLabel('Competition category').selectOption('Junior');
  await captain.view.getByRole('button', { name: 'Register team' }).click();
  await expect(captain.view.getByRole('heading', { name: "You're registered together." })).toBeVisible();
  await captain.view.reload();
  await expect(captain.view.getByRole('heading', { name: "You're registered together." })).toBeVisible();
  await expect(captain.view.getByText('The roster is locked')).toBeVisible();
  await expect(captain.view.locator('#vertex-splash')).toHaveCount(0);
  await captain.view.screenshot({ path: `test-results/m7-confirmed-${info.project.name}.png`, fullPage: true });
  await captain.view.getByRole('link', { name: 'Open dashboard' }).click();
  await expect(captain.view.locator('.registration-dashboard-card')).toContainText(teamName);
  await expect(captain.view.locator('.registration-notices')).toContainText('Team entry confirmed');
  await captain.view.reload();
  await expect(captain.view.locator('.registration-dashboard-card')).toContainText(teamName);
  const duplicate = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/register_competition_team`, {
    headers: headers(captain.token), data: { target_team_id: teamId, chosen_category: 'Junior' }
  });
  expect(duplicate.ok()).toBeFalsy();
  expect((await duplicate.json()).message).toContain('already registered');
  const duplicateIdentity = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/create_competition_team`, {
    headers: headers(accepted.token), data: { target_competition_id: main.id, team_name: 'Another Team' }
  });
  expect((await duplicateIdentity.json()).message).toContain('already belongs to a team');
  const duplicateName = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/create_competition_team`, {
    headers: headers(declined.token), data: { target_competition_id: main.id, team_name: teamName }
  });
  expect(duplicateName.ok()).toBeFalsy();
  const lockedLeave = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/leave_competition_team`, {
    headers: headers(accepted.token), data: { target_team_id: teamId }
  });
  expect((await lockedLeave.json()).message).toContain('roster is locked');
  const inviteAfterRegistration = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/invite_competition_team_member`, {
    headers: headers(captain.token), data: { target_team_id: teamId, target_username: extra.username }
  });
  expect((await inviteAfterRegistration.json()).message).toContain('roster is locked');

  await page.goto(`/organiser/competition/${main.slug}`);
  await page.getByRole('link', { name: 'View participants' }).click();
  await expect(page).toHaveURL(new RegExp(`/organiser/competition/${main.slug}/participants$`));
  await expect(page.locator('.organiser-team-parent')).toContainText(teamName);
  await expect(page.locator('.organiser-team-row li')).toContainText([captain.name, accepted.name, third.name]);
  await expect(page.locator('.organiser-individual-row')).toContainText(outsider.name);
  await page.reload();
  await expect(page.locator('.organiser-team-row li')).toHaveCount(3);
  await expect(page.locator('#vertex-splash')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: `test-results/m7-organiser-${info.project.name}.png`, fullPage: true });

  const foreignTeamRead = await request.get(`${owner.SUPABASE_PROJECT_URL}/rest/v1/competition_teams?select=id&id=eq.${teamId}`, { headers: headers(extra.token) });
  expect(await foreignTeamRead.json()).toEqual([]);
  const foreignMemberRead = await request.get(`${owner.SUPABASE_PROJECT_URL}/rest/v1/competition_team_members?select=participant_id&team_id=eq.${teamId}`, { headers: headers(extra.token) });
  expect(await foreignMemberRead.json()).toEqual([]);
  const foreignInsert = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/competition_team_members`, {
    headers: headers(extra.token), data: { team_id: teamId, competition_id: main.id, participant_id: extra.userId }
  });
  expect(foreignInsert.ok()).toBeFalsy();
  const foreignRemove = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/remove_competition_team_member`, {
    headers: headers(extra.token), data: { target_team_id: teamId, target_participant_id: accepted.userId }
  });
  expect(foreignRemove.ok()).toBeFalsy();
  const foreignRoster = await request.post(`${owner.SUPABASE_PROJECT_URL}/rest/v1/rpc/organiser_competition_entries`, {
    headers: headers(extra.token), data: { target_competition_id: main.id }
  });
  expect(foreignRoster.ok()).toBeFalsy();

  // Separate team-only competition checks leave, captain removal, cancellation, and disbanding.
  await captain.view.goto(`/competition/${teamOnly.slug}`);
  await captain.view.getByRole('link', { name: 'Build or join team' }).click();
  await captain.view.getByLabel('Team name').fill(`Side Crew ${captain.username}`);
  await captain.view.getByRole('button', { name: 'Create team' }).click();
  await invite(declined);
  await declined.view.goto(`/competition/${teamOnly.slug}/team`);
  await declined.view.getByRole('button', { name: 'Accept invitation' }).click();
  declined.view.once('dialog', dialog => dialog.accept());
  await declined.view.getByRole('button', { name: 'Leave team' }).click();
  await expect(declined.view.getByRole('heading', { name: 'Create a team' })).toBeVisible();
  await invite(third);
  await third.view.goto(`/competition/${teamOnly.slug}/team`);
  await third.view.getByRole('button', { name: 'Accept invitation' }).click();
  captain.view.once('dialog', dialog => dialog.accept());
  await captain.view.getByRole('button', { name: `Remove ${third.name} from team` }).click();
  await expect(captain.view.locator('.team-capacity')).toContainText('1 / 3');
  await invite(extra);
  await captain.view.getByRole('button', { name: 'Cancel' }).click();
  captain.view.once('dialog', dialog => dialog.accept());
  await captain.view.getByRole('button', { name: 'Disband team' }).click();
  await expect(captain.view.getByRole('heading', { name: 'Create a team' })).toBeVisible();

  for (const person of [captain, accepted, declined, third, outsider, extra, underage]) await person.view.close();
});
