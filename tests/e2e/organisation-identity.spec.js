import { test, expect } from './helpers/test.js';
import { createAccount, sessionCredentials } from './helpers/accounts.js';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

test('one organisation editor, slug and logo across account navigation, People and public profile', async ({ page }, info) => {
  const account = await createAccount(page, 'organisation', 'identity');
  const credentials = await sessionCredentials(page);
  const slug = `identity-${account.username.replaceAll('_', '-')}`;
  const name = `Vertex E2E Academy ${account.username.slice(-6)}`;
  await expect(page.getByLabel('Full name')).toHaveCount(0);
  await expect(page.locator('input[name="username"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit account identity' })).toHaveCount(0);
  await page.getByLabel('Organisation name').fill(name);
  await page.getByLabel('Organisation slug').fill(slug);
  await page.getByLabel('Description').fill('A clearly identifiable development test organisation.');
  await page.locator('input[name="logo"]').setInputFiles(path.resolve('assets/logo.png'));
  await page.getByRole('button', { name: 'Create organisation', exact: true }).click();
  await expect(page.getByText('Organisation saved.')).toBeVisible();
  const logo = await page.locator('[data-org-logo-preview] img').getAttribute('src');
  await expect(page.locator('.account-link')).toHaveAttribute('href', '/organisation/edit');
  await expect(page.locator('.account-link')).toContainText(name);
  await expect(page.locator('.account-link img')).toHaveAttribute('src', logo);
  await page.goto('/profile/edit');
  await expect(page).toHaveURL(/\/organisation\/edit$/);
  await expect(page.getByLabel('Organisation slug')).toHaveValue(slug);
  await expect(page.locator('input[name="avatar"]')).toHaveCount(0);
  await page.getByLabel('Organisation name').fill(`${name} Updated`);
  await page.getByRole('button', { name: 'Save organisation' }).click();
  await expect(page.getByText('Organisation saved.')).toBeVisible();
  await expect(page.locator('.account-link')).toContainText(`${name} Updated`);
  await page.route('**/rest/v1/organisations?*', route => route.abort('failed'));
  await page.goto(`/organisation/${slug}`);
  await expect(page.getByRole('heading', { name: 'Vertex could not open this page.' })).toBeVisible({ timeout: 30000 });
  await page.unroute('**/rest/v1/organisations?*');
  await page.getByRole('link', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: `${name} Updated`, exact: true })).toBeVisible();
  await expect(page.locator('.account-link img')).toHaveAttribute('src', logo);
  await expect(page.locator('.account-link')).toContainText(`${name} Updated`);
  await page.screenshot({ path: `test-results/organisation-recovered-${info.project.name}.png`, fullPage: true });
  await page.reload();
  await expect(page.locator('.account-link img')).toHaveAttribute('src', logo);
  await page.goto('/people');
  await page.getByLabel('Search people').fill(slug);
  const result = page.locator('.person-row').filter({ hasText: `${name} Updated` });
  await expect(result).toHaveCount(1);
  await expect(result).toHaveAttribute('href', `/organisation/${slug}`);
  await expect(result.locator('img')).toHaveAttribute('src', logo);
  await result.click();
  await expect(page.getByRole('heading', { name: `${name} Updated`, exact: true })).toBeVisible();
  await expect(page.locator('.logo-hero')).toHaveAttribute('src', logo);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: `test-results/organisation-identity-${info.project.name}.png`, fullPage: true });
  // Reproduce an older organisation account with a separate personal identity.
  const headers = { apikey: credentials.SUPABASE_ANON_KEY, Authorization: `Bearer ${credentials.token}` };
  const legacyPath = `${credentials.userId}/legacy-profile.png`;
  const legacyUpload = await page.request.post(`${credentials.SUPABASE_PROJECT_URL}/storage/v1/object/profile-pictures/${legacyPath}`, {
    headers: { ...headers, 'Content-Type': 'image/png' }, data: await readFile(path.resolve('assets/logo.png'))
  });
  expect(legacyUpload.ok()).toBe(true);
  const legacyProfile = await page.request.patch(`${credentials.SUPABASE_PROJECT_URL}/rest/v1/profiles?id=eq.${credentials.userId}`, {
    headers, data: { full_name: 'Vertex E2E Old Account Identity', username: account.username, avatar_path: legacyPath }
  });
  expect(legacyProfile.ok()).toBe(true);
  await page.goto(`/profile/@${account.username}`);
  await expect(page).toHaveURL(new RegExp(`/organisation/${slug}$`));
  await expect(page.locator('.account-link img')).toHaveAttribute('src', logo);
  await expect(page.locator('.account-link')).toContainText(`${name} Updated`);
  await page.goto('/organisation/edit');
  await page.getByRole('button', { name: 'Log out', exact: true }).last().click();
  await page.goto(`/organisation/${slug}`);
  await expect(page.getByRole('heading', { name: `${name} Updated`, exact: true })).toBeVisible();
  await page.goto(`/profile/@${account.username}`);
  await expect(page).toHaveURL(new RegExp(`/organisation/${slug}$`));
});

test('organisation signup collects credentials once, then one public identity', async ({ page }) => {
  await page.goto('/signup');
  await page.locator('.account-type label:has(input[value="organisation"])').click();
  await expect(page.getByLabel('Full name')).toBeHidden();
  await expect(page.locator('input[name="username"]')).toBeDisabled();
  await expect(page.locator('input[name="birthday"]')).toBeDisabled();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await page.locator('.account-type label:has(input[value="organiser"])').click();
  await expect(page.getByLabel('Full name')).toBeVisible();
  await expect(page.locator('input[name="username"]')).toBeEnabled();
});
