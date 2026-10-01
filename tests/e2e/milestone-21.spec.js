import { test, expect } from './helpers/test.js';
import AxeBuilder from '@axe-core/playwright';
import { createAccount, login } from './helpers/accounts.js';
import { readFileSync } from 'node:fs';

async function review(page, label, info) {
  await expect(page.locator('#vertex-splash')).toHaveCount(0);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  await info.attach(`${label}-accessibility`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' });
  expect.soft(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), label).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('release public routes, contrast, responsive zoom, keyboard and deferred libraries', async ({ page }, info) => {
  test.setTimeout(300000);
  const requested = [];
  page.on('request', request => requested.push(request.url()));
  for (const theme of ['light', 'dark']) {
    await page.goto('/');
    await page.evaluate(theme => { localStorage.setItem('vertex-theme', theme); }, theme);
    for (const route of ['/', '/discover', '/people', '/organisations', '/login', '/signup', '/app']) {
      await page.goto(route);
      await review(page, `${theme}-${route}`, info);
    }
  }
  expect(requested.some(url => /three.*module|certificate-editor|certificate-renderer|pdf-lib/.test(url))).toBe(false);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/discover');
  await review(page, 'tablet-discovery', info);
  await page.screenshot({ path: info.outputPath('tablet-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/signup');
  await review(page, 'mobile-signup', info);
  await page.screenshot({ path: info.outputPath('mobile-dark.png'), fullPage: true });
  await page.goto('/randomgarbage');
  await review(page, 'invalid-route', info);
  await page.getByRole('link', { name: 'Return home' }).click();
  await expect(page).toHaveURL('/');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('release 500-entry organiser roster and published results stay paginated', async ({ page }, info) => {
  test.skip(!process.env.M16_LOAD_SLUG, 'Requires the identifiable release load fixture.');
  test.setTimeout(180000);
  const fixture = JSON.parse(readFileSync('.test-data/m21-load.json', 'utf8'));
  const accounts = readFileSync('.test-data/accounts.ndjson', 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const owner = accounts.find(account => account.id === fixture.owner_id);
  const identifier = owner.email.match(/-([a-f0-9]{14})@example\.com$/)[1];
  await login(page, { ...owner, password: `Vertex!${identifier}Aa` }, `/organiser/competition/${fixture.slug}/participants`);
  await expect(page.locator('.organiser-individual-row')).toHaveCount(25);
  await expect(page.locator('#registered-individuals')).toContainText('500');
  const first = await page.locator('.organiser-individual-row').first().textContent();
  await page.getByRole('navigation', { name: 'Individual pages' }).getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(/individuals=1$/);
  await expect(page.locator('.organiser-individual-row')).toHaveCount(25);
  await expect(page.locator('.organiser-individual-row').first()).not.toHaveText(first);
  await page.reload();
  await expect(page).toHaveURL(/individuals=1$/);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { localStorage.setItem('vertex-theme', theme); }, theme);
    for (const suffix of ['participants', 'leaderboards', 'scoring', 'advancement']) {
      await page.goto(`/organiser/competition/${fixture.slug}/${suffix}`);
      await review(page, `${theme}-large-${suffix}`, info);
    }
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`/organiser/competition/${fixture.slug}/participants`);
  await review(page, 'large-roster-mobile', info);
  await page.screenshot({ path: info.outputPath('roster-mobile-dark.png'), fullPage: true });
  await page.goto(`/competition/${fixture.slug}/leaderboard/large-result`);
  await review(page, 'published-results-mobile', info);
  await page.screenshot({ path: info.outputPath('results-mobile-dark.png'), fullPage: true });
});

test('unexpected runtime failures preserve input and offer keyboard recovery', async ({ page }, info) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('unfinished@example.com');
  await page.evaluate(() => { setTimeout(() => { throw new Error('Internal fixture failure'); }, 0); });
  await expect(page.getByRole('alert')).toContainText('Check your latest change');
  await expect(page.getByLabel('Email address')).toHaveValue('unfinished@example.com');
  await expect(page.locator('[data-global-error]')).not.toContainText('Internal fixture failure');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(page.getByLabel('Email address')).toHaveValue('unfinished@example.com');
  await review(page, 'unexpected-error-recovery', info);
  await page.getByRole('button', { name: 'Dismiss', exact: true }).press('Enter');
  await expect(page.locator('[data-global-error]')).toHaveCount(0);
});

test('account changes in another tab remove the previous identity and protected views', async ({ page, context }) => {
  test.setTimeout(180000);
  const participant = await createAccount(page, 'participant', 'm21');
  await expect(page.locator('input[name="birthday"]')).toBeVisible();
  const other = await context.newPage();
  const organiser = await createAccount(other, 'organiser', 'm21');
  await expect(page.locator('.account-link')).toContainText(organiser.name, { timeout: 20000 });
  await expect(page.getByLabel('Full name')).toHaveValue(organiser.name);
  await expect(page.locator('input[name="birthday"]')).toHaveCount(0);
  await expect(page.locator('#main-content')).not.toContainText(participant.name);
  await other.getByRole('button', { name: 'Log out', exact: true }).last().click();
  await expect(page).toHaveURL(/\/login\?returnTo=/, { timeout: 20000 });
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByLabel('Full name')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await other.close();
});

test('Realtime channels leave when SPA navigation leaves the result page', async ({ page }) => {
  test.skip(!process.env.M16_LOAD_SLUG, 'Requires the identifiable release load fixture.');
  const topics = new Set();
  page.on('websocket', socket => socket.on('framesent', frame => {
    try {
      const message = JSON.parse(frame.payload);
      const topic = Array.isArray(message) ? message[2] : message.topic;
      const event = Array.isArray(message) ? message[3] : message.event;
      if (!topic?.startsWith('realtime:leaderboard-')) return;
      if (event === 'phx_join') topics.add(topic);
      if (event === 'phx_leave') topics.delete(topic);
    } catch { /* Non-JSON transport frames do not represent channel state. */ }
  }));
  const resultPath = `/competition/${process.env.M16_LOAD_SLUG}/leaderboard/large-result`;
  await page.goto(resultPath);
  for (let visit = 0; visit < 3; visit++) {
    await expect(page.locator('.leaderboard-entry')).toHaveCount(25);
    await expect.poll(() => topics.size, { timeout: 20000 }).toBe(1);
    await page.locator('.back-link').click();
    await expect(page.locator('.competition-detail')).toBeVisible();
    await expect.poll(() => topics.size, { timeout: 20000 }).toBe(0);
    if (visit < 2) await page.locator(`a[data-link][href="${resultPath}"]`).first().click();
  }
});

test('release account perspectives, errors, logout and keyboard status', async ({ page }, info) => {
  test.setTimeout(360000);
  for (const type of ['participant', 'organiser', 'organisation']) {
    await createAccount(page, type, 'm21');
    const routes = type === 'organisation' ? ['/organisation/edit', '/organisations', '/notifications']
      : type === 'organiser' ? ['/profile/edit', '/organiser', '/organiser/competition/new', '/notifications']
      : ['/profile/edit', '/dashboard', '/discover', '/notifications'];
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => localStorage.setItem('vertex-theme', theme), theme);
      for (const route of routes) { await page.goto(route); await review(page, `${theme}-${type}-${route}`, info); }
    }
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(routes[0]);
    await review(page, `${type}-mobile`, info);
    await page.screenshot({ path: info.outputPath(`${type}-mobile.png`), fullPage: true });
    await page.getByRole('button', { name: 'Log out', exact: true }).last().click();
    await expect(page).toHaveURL(/\/login$/);
    await page.setViewportSize({ width: 1366, height: 768 });
  }
});
