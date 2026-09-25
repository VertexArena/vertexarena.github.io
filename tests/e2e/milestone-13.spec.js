import { test, expect } from './helpers/test.js';
import { createAccount, sessionCredentials } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const fixturePath = '.test-data/m13-fixture.json';
const stamp = value => new Date(value).toISOString();
const local = value => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

async function secondaryPage(browser, width = 1366) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 768 } });
  const module = `${readFileSync('.test-data/supabase-js-2.117.1.umd.js', 'utf8')}\nexport const createClient = supabase.createClient;`;
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm', route => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: module }));
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  return context.newPage();
}

test('Milestone 13 file, link, and team submissions with private review', async ({ page, browser, request }, info) => {
  test.setTimeout(720000);
  const owner = await createAccount(page, 'organiser', 'm13');
  const ownerSession = await sessionCredentials(page);
  const participantPage = await secondaryPage(browser);
  const participant = await createAccount(participantPage, 'participant', 'm13');
  const participantSession = await sessionCredentials(participantPage);
  const captainPage = await secondaryPage(browser);
  const captain = await createAccount(captainPage, 'participant', 'm13');
  const captainSession = await sessionCredentials(captainPage);
  const memberPage = await secondaryPage(browser);
  const member = await createAccount(memberPage, 'participant', 'm13');
  const memberSession = await sessionCredentials(memberPage);
  const missingPage = await secondaryPage(browser);
  const missing = await createAccount(missingPage, 'participant', 'm13');
  const missingSession = await sessionCredentials(missingPage);
  const outsiderPage = await secondaryPage(browser);
  const outsider = await createAccount(outsiderPage, 'participant', 'm13');
  const outsiderSession = await sessionCredentials(outsiderPage);
  const baseTime = Math.ceil(Date.now() / 60000) * 60000;
  const when = minutes => baseTime + minutes * 60000;
  const fixture = {
    ids: [ownerSession.userId, participantSession.userId, captainSession.userId, memberSession.userId, missingSession.userId, outsiderSession.userId],
    competitions: [], files: [], projectUrl: ownerSession.SUPABASE_PROJECT_URL, anonKey: ownerSession.SUPABASE_ANON_KEY,
    tokens: { [participantSession.userId]: participantSession.token, [captainSession.userId]: captainSession.token }
  };
  mkdirSync('.test-data', { recursive: true });
  const writeFixture = () => writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
  writeFixture();
  const root = `${ownerSession.SUPABASE_PROJECT_URL}/rest/v1`;
  const headers = token => ({ apikey: ownerSession.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const rpc = async (token, name, data) => {
    const response = await request.post(`${root}/rpc/${name}`, { headers: headers(token), data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const competitions = {};
  for (const kind of ['file', 'link', 'mixed']) {
    const id = randomUUID(), roundId = randomUUID();
    const slug = `m13-${kind}-${owner.username.replaceAll('_', '-')}`;
    const details = {
      id, slug, name: `Vertex M13 ${kind} ${owner.username}`, status: 'published', field_tags: ['design'],
      prize_details: 'Recognition for careful work.', description: `Milestone 13 ${kind} acceptance fixture.`,
      minimum_age: 12, maximum_age: 25, team_mode: kind === 'mixed' ? 'team' : 'individual',
      minimum_team_size: kind === 'mixed' ? 2 : null, maximum_team_size: kind === 'mixed' ? 3 : null,
      categories: [], structure: 'direct3', banner_kind: 'colour', banner_colour: '#2563eb', banner_colour_end: '#0b1120',
      banner_path: null, certificate_status: 'not_planned', registration_opens_at: stamp(when(-2)),
      registration_closes_at: stamp(when(2)), starts_at: stamp(when(3))
    };
    const rounds = [{ id: roundId, name: 'Final round', slug: 'final-round', sequence: 1, advancement_count: 3,
      opens_at: stamp(when(4)), submission_deadline: stamp(when(11)), leaderboard_releases_at: stamp(when(12)) }];
    await rpc(ownerSession.token, 'save_competition', { details, rounds });
    competitions[kind] = { id, slug, roundId, roundSlug: 'final-round' };
    fixture.competitions.push(id); writeFixture();
  }
  for (const kind of ['file', 'link']) await rpc(participantSession.token, 'register_individual', { target_competition_id: competitions[kind].id });
  await rpc(missingSession.token, 'register_individual', { target_competition_id: competitions.file.id });
  const team = await rpc(captainSession.token, 'create_competition_team', { target_competition_id: competitions.mixed.id, team_name: `M13 Crew ${captain.username}` });
  const invite = await rpc(captainSession.token, 'invite_competition_team_member', { target_team_id: team.id, target_username: member.username });
  await rpc(memberSession.token, 'respond_competition_team_invitation', { target_invitation_id: invite.id, accept_invitation: true });
  await rpc(captainSession.token, 'register_competition_team', { target_team_id: team.id });

  async function configure(kind, mode, closeAt, limit = 1) {
    const c = competitions[kind];
    await page.goto(`/organiser/competition/${c.slug}/submissions`);
    await expect(page.getByRole('heading', { name: 'Review every entry.' })).toBeVisible();
    await page.getByLabel('Accept submissions for this round').check();
    await page.locator(`input[name="mode"][value="${mode}"]`).check();
    if (mode !== 'link') {
      await page.getByLabel('Allowed MIME types').fill('text/plain');
      await page.getByLabel('Maximum size per file (MB)').fill(String(limit));
    }
    await page.getByLabel('Instructions').fill(`Send ${mode === 'link' ? 'a complete work link' : 'your final work'} before the deadline.`);
    await page.getByLabel('Closes', { exact: true }).fill(local(closeAt));
    await page.getByRole('button', { name: 'Save round rules' }).click();
    await expect(page.locator('[data-config-status]')).toContainText('Round rules saved.');
  }
  await configure('file', 'file', when(6), 1);
  await configure('link', 'link', when(10));
  await configure('mixed', 'mixed', when(10), 10);
  await page.goto(`/organiser/competition/${competitions.file.slug}/workspace`);
  await expect(page.getByRole('link', { name: 'Manage submissions' })).toBeVisible();
  await participantPage.goto(`/competition/${competitions.file.slug}`);
  await expect(participantPage.getByRole('link', { name: /Submissions/ })).toBeVisible();
  await outsiderPage.goto(`/competition/${competitions.file.slug}/submissions/final-round`);
  await expect(outsiderPage.getByRole('heading', { name: 'Submissions unavailable.' })).toBeVisible();

  await new Promise(resolve => setTimeout(resolve, Math.max(0, when(4) - Date.now() + 1200)));
  const fileRoute = `/competition/${competitions.file.slug}/submissions/final-round`;
  await participantPage.goto(fileRoute);
  await expect(participantPage.getByRole('button', { name: 'Confirm submission' })).toBeVisible();
  await participantPage.locator('[data-submission-file]').setInputFiles({ name: 'wrong.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('test') });
  await participantPage.getByRole('button', { name: 'Confirm submission' }).click();
  await expect(participantPage.locator('[data-submission-status]')).toContainText('file type this round does not allow');
  await participantPage.locator('[data-submission-file]').setInputFiles({ name: 'too-large.txt', mimeType: 'text/plain', buffer: Buffer.alloc(2 * 1024 * 1024, 'a') });
  await participantPage.getByRole('button', { name: 'Confirm submission' }).click();
  await expect(participantPage.locator('[data-submission-status]')).toContainText('round’s 1.0 MB limit');
  await participantPage.locator('[data-submission-file]').setInputFiles({ name: 'hard-limit.txt', mimeType: 'text/plain', buffer: Buffer.alloc(26 * 1024 * 1024, 'a') });
  await participantPage.getByRole('button', { name: 'Confirm submission' }).click();
  await expect(participantPage.locator('[data-submission-status]')).toContainText('25 MB hard limit');
  await participantPage.locator('[data-submission-file]').setInputFiles({ name: 'answer.txt', mimeType: 'text/plain', buffer: Buffer.from('M13 first version') });
  await expect(participantPage.locator('[data-submission-preview]')).toContainText('answer.txt');
  await participantPage.getByRole('button', { name: 'Confirm submission' }).click();
  await expect(participantPage.getByText(/Submission confirmed\. Your entry/)).toBeVisible({ timeout: 30000 });
  await expect(participantPage.locator('.submission-saved')).toContainText('answer.txt');
  await participantPage.reload();
  await expect(participantPage.locator('.submission-saved')).toContainText('answer.txt');
  await participantPage.getByRole('button', { name: 'Remove answer.txt' }).click();
  await participantPage.locator('[data-submission-file]').setInputFiles({ name: 'answer-v2.txt', mimeType: 'text/plain', buffer: Buffer.from('M13 final version') });
  await participantPage.getByRole('button', { name: 'Save updated submission' }).click();
  await expect(participantPage.getByText(/Submission updated\. Your entry/)).toBeVisible({ timeout: 30000 });
  await expect(participantPage.locator('.submission-saved')).toContainText('answer-v2.txt');

  const linkRoute = `/competition/${competitions.link.slug}/submissions/final-round`;
  await participantPage.goto(linkRoute);
  await expect(participantPage.locator('[data-submission-file]')).toHaveCount(0);
  await participantPage.locator('[data-submission-links]').fill('https://example.org/final-work');
  await participantPage.getByRole('button', { name: 'Confirm submission' }).click();
  await expect(participantPage.getByText(/Submission confirmed\. Your entry/)).toBeVisible({ timeout: 30000 });
  await expect(participantPage.locator('.submission-saved')).toContainText('https://example.org/final-work');

  const mixedRoute = `/competition/${competitions.mixed.slug}/submissions/final-round`;
  await captainPage.goto(mixedRoute);
  await expect(captainPage.getByRole('button', { name: 'Confirm submission' })).toBeVisible();
  await captainPage.locator('[data-submission-file]').setInputFiles({ name: 'team-plan.txt', mimeType: 'text/plain', buffer: Buffer.from('M13 team plan') });
  await captainPage.locator('[data-submission-links]').fill('https://example.org/team-demo');
  await captainPage.getByRole('button', { name: 'Confirm submission' }).click();
  await expect(captainPage.getByText(/Submission confirmed\. Your entry/)).toBeVisible({ timeout: 30000 });
  await memberPage.goto('/notifications');
  await expect(memberPage.getByText('Submission confirmed', { exact: true })).toBeVisible();
  await memberPage.goto(mixedRoute);
  await expect(memberPage.locator('.submission-saved')).toContainText('team-plan.txt');
  await expect(memberPage.locator('[data-submission-form]')).toHaveCount(0);

  await page.goto(`/organiser/competition/${competitions.file.slug}/submissions`);
  await expect(page.locator('.submission-review-card')).toHaveCount(2);
  await expect(page.locator('.submission-review-list')).toContainText('Valid');
  await expect(page.locator('.submission-review-list')).toContainText('Missing');
  await page.locator('[data-review-status]').selectOption('missing');
  await expect(page.locator('.submission-review-card')).toHaveCount(1);
  await expect(page.locator('.submission-review-card')).toContainText(missing.name);
  await page.locator('[data-review-status]').selectOption('valid');
  await expect(page.locator('.submission-review-card')).toContainText('answer-v2.txt');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('answer-v2.txt');
  const fileRows = await request.get(`${root}/round_submission_files?select=storage_path,uploaded_by`, { headers: headers(ownerSession.token) });
  expect(fileRows.ok(), await fileRows.text()).toBeTruthy();
  fixture.files = (await fileRows.json()).filter(row => fixture.ids.includes(row.uploaded_by)).map(row => ({ path: row.storage_path, owner: row.uploaded_by }));
  writeFixture();
  expect(fixture.files.length).toBe(2);
  const restricted = await request.get(`${root}/round_submissions?select=id&round_id=eq.${competitions.file.roundId}`, { headers: headers(outsiderSession.token) });
  expect(await restricted.json()).toEqual([]);
  const objectUrl = `${ownerSession.SUPABASE_PROJECT_URL}/storage/v1/object/authenticated/submissions/${fixture.files[0].path}`;
  const deniedObject = await request.get(objectUrl, { headers: headers(outsiderSession.token) });
  expect(deniedObject.ok()).toBeFalsy();
  const organiserObject = await request.get(objectUrl, { headers: headers(ownerSession.token) });
  expect(organiserObject.ok(), await organiserObject.text()).toBeTruthy();

  await participantPage.setViewportSize({ width: 320, height: 700 });
  await participantPage.goto(fileRoute);
  await expect(participantPage.locator('#vertex-splash')).toHaveCount(0);
  await expect(participantPage.locator('.submission-saved')).toBeVisible();
  await participantPage.screenshot({ path: info.outputPath('m13-participant-mobile.png'), fullPage: true });
  expect(await participantPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.goto(`/organiser/competition/${competitions.file.slug}/submissions`);
  await expect(page.locator('#vertex-splash')).toHaveCount(0);
  await expect(page.locator('.submission-review-card')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('m13-organiser-desktop.png'), fullPage: true });

  await new Promise(resolve => setTimeout(resolve, Math.max(0, when(6) - Date.now() + 1200)));
  await participantPage.goto(fileRoute);
  await expect(participantPage.getByText(/Submission deadline passed/)).toBeVisible();
  await expect(participantPage.locator('[data-submission-form]')).toHaveCount(0);
  const afterClose = await request.post(`${root}/rpc/save_round_submission`, { headers: headers(participantSession.token), data: { target_round_id: competitions.file.roundId, file_items: [], link_urls: [], expected_version: 2 } });
  expect(afterClose.ok()).toBeFalsy();
  expect((await afterClose.json()).message).toContain('window is closed');
  await participantPage.close(); await captainPage.close(); await memberPage.close(); await missingPage.close(); await outsiderPage.close();
});
