import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { competitionLifecycle } from '../../js/lifecycle.js';
import { writeFileSync } from 'node:fs';

test.describe.configure({ mode: 'parallel' });

async function settled(page) {
  await expect(page.locator('#vertex-splash')).toHaveCount(0, { timeout: 45000 });
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
}
async function snapshot(page, label, info) {
  await settled(page);
  await page.screenshot({ path: info.outputPath(`${label}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label).toBe(true);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  writeFileSync(info.outputPath(`${label}-accessibility.json`), JSON.stringify(audit.violations, null, 2));
  await info.attach(`${label}-accessibility`, { body: JSON.stringify(audit.violations), contentType: 'application/json' });
  expect.soft(audit.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), label).toEqual([]);
}

test('lifecycle distinguishes expired planned dates from actual final publication', () => {
  const now = Date.now(); const c = { status: 'published', slug: 'sample', starts_at: new Date(now - 1000).toISOString(), registration_closes_at: new Date(now - 2000).toISOString() };
  const final = { sequence: 1, name: 'Final', slug: 'final', submission_deadline: new Date(now - 500).toISOString(), leaderboard_releases_at: new Date(now - 100).toISOString(), leaderboard_state: 'unpublished' };
  expect(competitionLifecycle(c, [final], now).key).toBe('awaiting-results');
  expect(competitionLifecycle(c, [{ ...final, leaderboard_state: 'published' }], now).key).toBe('completed');
  expect(competitionLifecycle({ ...c, status: 'draft' }, [final], now).key).toBe('draft');
});

test('public refinement interactions, validation and keyboard navigation', async ({ page }, info) => {
  test.setTimeout(180000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/discover'); await settled(page);
  await expect(page.locator('.discovery-card').first()).toBeVisible({ timeout: 20000 });
  await page.locator('[data-preview]').first().click();
  await expect(page.locator('[data-discovery-dialog]')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('[data-discovery-dialog]')).not.toBeVisible();
  await page.goto('/login'); await settled(page);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('.validation-summary')).toBeFocused();
  await expect(page.locator('.field-error')).toHaveCount(2);
  await page.locator('.validation-summary a').first().click();
  await expect(page.locator('input[name="email"]')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await settled(page);
  await page.locator('[data-menu]').click(); await expect(page.locator('.drawer a').first()).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('.drawer a').last()).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('[data-menu]')).toBeFocused();
  await expect(page.locator('#main-content')).not.toHaveAttribute('inert', '');
  await snapshot(page, 'public-mobile-light', info);
  await page.locator('button[data-theme]').click(); await snapshot(page, 'public-mobile-dark', info);
  expect(errors).toEqual([]);
});

test('organiser card navigation and file-type selection preserve unsaved local work', async ({ page }, info) => {
  test.skip(!process.env.VERTEX_AUDIT_PASSWORD, 'Uses an authorized existing organiser.');
  test.setTimeout(180000);
  const writes = [];
  await page.route('**/rest/v1/**', route => {
    if (!['GET','HEAD','OPTIONS'].includes(route.request().method()) && !/\/rpc\/(?:can_|my_|round_|public_|organiser_|search_)/.test(route.request().url())) { writes.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto('/login?returnTo=%2Fdiscover'); await settled(page);
  await page.getByLabel('Email address').fill('john@example.com'); await page.getByLabel('Password', { exact: true }).fill(process.env.VERTEX_AUDIT_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(page).toHaveURL('/discover'); await settled(page);
  await expect(page.locator('.discovery-card').first()).toBeVisible();
  await page.locator('.discovery-card .discovery-art').first().scrollIntoViewIfNeeded();
  const artwork = await page.locator('.discovery-card .discovery-art').first().boundingBox();
  await page.mouse.click(artwork.x + artwork.width / 2, artwork.y + artwork.height / 2);
  await expect(page.locator('.competition-detail')).toBeVisible();
  await page.getByRole('link', { name: 'Open organiser workspace' }).click();
  await expect(page.locator('.workspace-dashboard')).toBeVisible();
  await page.getByRole('navigation', { name: 'Competition sections', exact: true }).getByRole('link', { name: 'Submissions', exact: true }).click();
  const picker = page.locator('.file-type-picker'); await expect(picker).toBeVisible();
  await picker.getByRole('checkbox', { name: 'ZIP archive' }).check();
  await expect(page.locator('[name="mime_types"]')).toHaveValue(/application\/zip/);
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('navigation', { name: 'Competition sections', exact: true }).getByRole('link', { name: 'Leaderboards', exact: true }).click();
  await expect(picker).toBeVisible(); await picker.getByRole('checkbox', { name: 'ZIP archive' }).uncheck();
  await page.getByText('Advanced file types', { exact: true }).click(); await expect(page.getByLabel('Allowed MIME types')).toBeVisible();
  for (const [width, height] of [[320,700],[768,1024],[740,390]]) { await page.setViewportSize({width,height}); await snapshot(page, `submission-reflow-${width}`, info); }
  await page.goto('/profile/edit'); await settled(page); await page.getByRole('button', { name: 'Log out', exact: true }).last().click(); await expect(page).toHaveURL(/\/login$/);
  expect(writes).toEqual([]);
});

for (const role of ['organiser','participant','organisation']) test(`existing ${role} visual audit without application writes`, async ({ page }, info) => {
  test.skip(!process.env.VERTEX_AUDIT_PASSWORD, 'Uses user-authorized existing accounts, never creates fixtures.');
  test.setTimeout(600000);
  const mutations = [];
  await page.route('**/rest/v1/**', route => {
    const request = route.request(), url = new URL(request.url());
    const write = !['GET','HEAD','OPTIONS'].includes(request.method()) && (!url.pathname.includes('/rpc/') || /\/(save|set|create|delete|register|accept|decline|remove|mark|publish|finalise|resolve|leave|cancel|update|invite|revoke)_/.test(url.pathname));
    if (write) { mutations.push(url.pathname); return route.abort(); }
    return route.continue();
  });
  const emails = { organiser: 'john@example.com', participant: 'rishit@example.com', organisation: 'socra@example.com' };
  const own = role === 'organisation' ? '/organisation/edit' : '/profile/edit';
  await page.goto(`/login?returnTo=${encodeURIComponent(own)}`); await settled(page);
  await page.getByLabel('Email address').fill(emails[role]); await page.getByLabel('Password', { exact: true }).fill(process.env.VERTEX_AUDIT_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`${own}$`), { timeout: 30000 });
  await settled(page);
  const nameField = role === 'organisation' ? 'name' : 'full_name';
  const name = await page.locator(`[name="${nameField}"]`).inputValue().catch(() => null);
  const publicProfile = role === 'organisation' ? await page.locator('.organisation-manage .profile-preview a[href^="/organisation/"]').getAttribute('href') : await page.locator('[data-public-profile-link]').getAttribute('href');
  const routes = role === 'organisation' ? ['/dashboard','/organisation/edit','/organisations','/notifications','/app'] : role === 'organiser' ? ['/profile/edit','/organiser','/organiser/competition/new','/organisations','/notifications','/app'] : ['/profile/edit','/dashboard','/discover','/notifications','/app'];
  await page.goto('/discover'); await settled(page); await expect(page.locator('.discovery-card').first()).toBeVisible({ timeout: 20000 });
  const competitionPath = await page.locator('.discovery-card h3 a').first().getAttribute('href'); const slug = competitionPath.split('/').at(-1);
  routes.push('/people',publicProfile,competitionPath, `${competitionPath}/register`, `${competitionPath}/team`, `${competitionPath}/announcements`, `${competitionPath}/questions`, `${competitionPath}/meetings`, `${competitionPath}/submissions`, `${competitionPath}/progress`, `${competitionPath}/certificates`,`${competitionPath}/leaderboard`);
  if (role === 'organiser') routes.push(...['workspace','participants','organisers','meetings','submissions','scoring','advancement','leaderboards','certificates'].map(section => `/organiser/competition/${slug}/${section}`), `/organiser/competition/${slug}`);
  await info.attach('visited-routes', { body: JSON.stringify(routes), contentType: 'application/json' });
  for (const theme of ['light','dark']) {
    await page.evaluate(theme => localStorage.setItem('vertex-theme', theme), theme);
    for (const [index, route] of routes.entries()) {
      await page.goto(route); await snapshot(page, `${role}-${theme}-${index}`, info);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [index, route] of routes.entries()) { await page.goto(route); await snapshot(page, `${role}-mobile-${index}`, info); }
  await page.goto(own); await settled(page);
  if (name) {
    const input = page.locator(`[name="${nameField}"]`); await input.fill(`${name} draft`);
    await expect(page.locator('.form-recovery-note:visible')).toContainText('Unsaved changes');
    page.once('dialog', dialog => dialog.dismiss()); await page.locator('.header a.brand').click(); await expect(page).toHaveURL(new RegExp(`${own}$`));
    await input.fill(name); await page.locator('.header a.brand').click(); await expect(page).toHaveURL('/');
  }
  await page.goto(own); await settled(page);
  await page.getByRole('button', { name: 'Log out', exact: true }).last().click();
  await expect(page).toHaveURL(/\/login$/);
  expect(mutations).toEqual([]);
});
