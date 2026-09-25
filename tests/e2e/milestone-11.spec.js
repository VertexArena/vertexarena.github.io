import { test, expect } from './helpers/test.js';
import { createAccount, sessionCredentials } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const fixturePath = '.test-data/m11-fixture.json';
const stamp = days => new Date(Date.now() + days * 86400000).toISOString();
const cachedClient = '.test-data/supabase-js-2.117.1.umd.js';

async function secondaryPage(browser, width = 1366) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 768 } });
  const module = `${readFileSync(cachedClient, 'utf8')}\nexport const createClient = supabase.createClient;`;
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm', route => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: module }));
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  return context.newPage();
}

test('Milestone 11 question, organiser reply, notifications, realtime, RLS, and mobile', async ({ page, browser, request }, testInfo) => {
  test.setTimeout(420000);
  const owner = await createAccount(page, 'organiser', 'm11');
  const ownerSession = await sessionCredentials(page);
  const participantPage = await secondaryPage(browser);
  const participant = await createAccount(participantPage, 'participant', 'm11');
  const participantSession = await sessionCredentials(participantPage);
  const secondPage = await secondaryPage(browser);
  const second = await createAccount(secondPage, 'participant', 'm11');
  const secondSession = await sessionCredentials(secondPage);
  const outsiderPage = await secondaryPage(browser);
  const outsider = await createAccount(outsiderPage, 'participant', 'm11');
  const outsiderSession = await sessionCredentials(outsiderPage);
  const id = randomUUID();
  const slug = `m11-${owner.username.replaceAll('_', '-')}`;
  mkdirSync('.test-data', { recursive: true });
  writeFileSync(fixturePath, JSON.stringify({ ids: [ownerSession.userId, participantSession.userId, secondSession.userId, outsiderSession.userId], competitions: [id], slug }, null, 2));
  const headers = token => ({ apikey: ownerSession.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const root = `${ownerSession.SUPABASE_PROJECT_URL}/rest/v1`;
  const details = {
    id, slug, name: `Vertex M11 Q&A ${owner.username}`, status: 'published',
    field_tags: ['design'], prize_details: 'Recognition for thoughtful work.',
    description: 'Milestone 11 question acceptance fixture.',
    minimum_age: 12, maximum_age: 25, team_mode: 'individual',
    categories: [], structure: 'direct3', banner_kind: 'colour',
    banner_colour: '#2563eb', banner_colour_end: '#0b1120', banner_path: null,
    certificate_status: 'not_planned', registration_opens_at: stamp(-1),
    registration_closes_at: stamp(2), starts_at: stamp(3)
  };
  const rounds = [{ id: randomUUID(), name: 'Final round', slug: 'final-round', sequence: 1,
    advancement_count: 3, opens_at: stamp(4), submission_deadline: stamp(5), leaderboard_releases_at: stamp(6) }];
  const create = await request.post(`${root}/rpc/save_competition`, { headers: headers(ownerSession.token), data: { details, rounds } });
  expect(create.ok(), await create.text()).toBeTruthy();
  for (const token of [participantSession.token, secondSession.token]) {
    const register = await request.post(`${root}/rpc/register_individual`, { headers: headers(token), data: { target_competition_id: id } });
    expect(register.ok(), await register.text()).toBeTruthy();
  }

  await page.goto(`/competition/${slug}/questions`);
  await expect(page.getByRole('heading', { name: 'No questions yet.' })).toBeVisible();
  await participantPage.goto(`/competition/${slug}`);
  await participantPage.getByRole('link', { name: /Questions & answers/ }).click();
  await expect(participantPage.getByLabel('Your question')).toBeVisible();
  await secondPage.goto(`/competition/${slug}/questions`);
  await outsiderPage.goto(`/competition/${slug}/questions`);
  await expect(outsiderPage.getByRole('heading', { name: 'Questions unavailable.' })).toBeVisible();
  await participantPage.getByLabel('Your question').fill('Can we use open source assets in our submission?');
  await participantPage.getByRole('button', { name: 'Post question' }).click();
  await expect(participantPage.getByText('Question posted. Organisers have been notified.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Can we use open source assets in our submission?' })).toBeVisible({ timeout: 20000 });
  await expect(secondPage.getByRole('heading', { name: 'Can we use open source assets in our submission?' })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-notification-count]')).toHaveText('1', { timeout: 20000 });
  await page.goto('/notifications');
  await expect(page.getByText('New competition question', { exact: true })).toBeVisible();
  await page.locator('.notice-row').filter({ hasText: 'New competition question' }).getByRole('link', { name: 'Open update' }).click();
  await expect(page).toHaveURL(new RegExp(`/competition/${slug}/questions/[0-9a-f-]{36}$`));
  await expect(page.locator('.qa-focused')).toContainText('Can we use open source assets');
  await page.reload();
  await expect(page.locator('.qa-focused')).toContainText('Can we use open source assets');

  await page.getByLabel('Reply as organiser').fill('Yes. Credit each asset and follow its licence.');
  await page.getByRole('button', { name: 'Post reply' }).click();
  await expect(page.getByText('Reply posted. Participant notified.')).toBeVisible();
  await expect(participantPage.getByText('Yes. Credit each asset and follow its licence.')).toBeVisible({ timeout: 20000 });
  await expect(secondPage.getByText('Yes. Credit each asset and follow its licence.')).toBeVisible({ timeout: 20000 });
  await expect(participantPage.locator('[data-notification-count]')).toHaveText('2', { timeout: 20000 });
  await participantPage.goto('/notifications');
  await expect(participantPage.getByText('Your question has a reply', { exact: true })).toBeVisible();
  await participantPage.locator('.notice-row').filter({ hasText: 'Your question has a reply' }).getByRole('link', { name: 'Open update' }).click();
  await expect(participantPage.locator('.qa-focused')).toContainText('Yes. Credit each asset');

  await page.getByRole('button', { name: 'Edit reply' }).click();
  await page.getByLabel('Reply as organiser').fill('Yes. Credit each asset and follow its licence terms.');
  await page.getByRole('button', { name: 'Save reply' }).click();
  await expect(participantPage.getByText('Yes. Credit each asset and follow its licence terms.')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(page.locator('.qa-status')).toContainText('Resolved');
  await expect(participantPage.locator('.qa-status')).toContainText('Resolved', { timeout: 20000 });
  await page.getByRole('button', { name: 'Reopen question' }).click();
  await expect(page.locator('.qa-status')).toContainText('Answered');

  await secondPage.reload();
  await expect(secondPage.locator('[data-qa-reply-form]')).toHaveCount(0);
  const questions = await request.get(`${root}/competition_questions?select=id&competition_id=eq.${id}`, { headers: headers(secondSession.token) });
  const questionId = (await questions.json())[0].id;
  const deniedEdit = await request.patch(`${root}/competition_questions?id=eq.${questionId}`, { headers: headers(secondSession.token), data: { body: 'Changed without permission' } });
  expect(deniedEdit.ok()).toBeFalsy();
  const deniedReply = await request.post(`${root}/rpc/reply_to_competition_question`, { headers: headers(secondSession.token), data: { target_question_id: questionId, message: 'Impersonated organiser' } });
  expect(deniedReply.ok()).toBeFalsy();
  const deniedResolve = await request.post(`${root}/rpc/set_competition_question_resolved`, { headers: headers(secondSession.token), data: { target_question_id: questionId, resolved: true } });
  expect(deniedResolve.ok()).toBeFalsy();
  const hiddenRows = await request.get(`${root}/competition_questions?select=id&competition_id=eq.${id}`, { headers: headers(outsiderSession.token) });
  expect(hiddenRows.ok()).toBeTruthy();
  expect(await hiddenRows.json()).toEqual([]);
  const deniedAsk = await request.post(`${root}/rpc/ask_competition_question`, { headers: headers(outsiderSession.token), data: { target_competition_id: id, message: 'Should fail' } });
  expect(deniedAsk.ok()).toBeFalsy();

  await page.goto('/organiser');
  await expect(page.locator('#organiser-questions')).toBeVisible();
  await page.goto(`/organiser/competition/${slug}/workspace`);
  await expect(page.getByRole('link', { name: 'Manage questions' })).toBeVisible();
  await page.goto(`/competition/${slug}/questions`);
  await expect(page.getByRole('heading', { name: 'Questions, answered.' })).toBeVisible();
  await expect(page.locator('#vertex-splash')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('m11-questions-desktop.png'), fullPage: true });
  await participantPage.setViewportSize({ width: 320, height: 700 });
  await participantPage.goto(`/competition/${slug}/questions/${questionId}`);
  await expect(participantPage.locator('.qa-focused')).toBeVisible();
  await expect(participantPage.locator('#vertex-splash')).toHaveCount(0);
  await participantPage.evaluate(() => scrollTo(0, 0));
  await participantPage.screenshot({ path: testInfo.outputPath('m11-questions-mobile.png'), fullPage: true });
  expect(await participantPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await participantPage.emulateMedia({ reducedMotion: 'reduce' });
  await participantPage.reload();
  await expect(participantPage.locator('.qa-focused')).toContainText('Can we use open source assets');
  await expect(participantPage.locator('#vertex-splash')).toHaveCount(0);
  await participantPage.evaluate(() => scrollTo(0, 0));
  await participantPage.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.style.colorScheme = 'dark'; });
  await participantPage.screenshot({ path: testInfo.outputPath('m11-questions-mobile-dark.png'), fullPage: true });
  await participantPage.close(); await secondPage.close(); await outsiderPage.close();
});
