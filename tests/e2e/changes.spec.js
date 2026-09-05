import { test, expect } from '@playwright/test';
import { createAccount } from './helpers/accounts.js';

test('brand splash on initial load and refresh; Geist and visible auth logo', async ({ page }, info) => {
  await page.goto('/login', { waitUntil: 'commit' });
  await expect(page.locator('#vertex-splash .word')).toHaveText('VERTEX');
  await expect(page.locator('#vertex-splash')).toBeHidden();
  await expect(page.locator('.auth-panel .auth-logo')).toBeVisible();
  await expect(page.locator('.auth-visual .auth-logo')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/^Geist|^"Geist"/);
  expect(await page.evaluate(() => document.fonts.check('16px Geist'))).toBe(true);
  await page.reload({ waitUntil: 'commit' });
  await expect(page.locator('#vertex-splash .word')).toHaveText('VERTEX');
  await expect(page.locator('#vertex-splash')).toBeHidden();
  expect(await page.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: `test-results/changes-login-${info.project.name}.png`, fullPage: true });
});

test('organiser birthday hidden and disabled; participant birthday restored', async ({ page }) => {
  await page.goto('/signup');
  await page.locator('.account-type label:has(input[value="organiser"])').click();
  const birthday = page.locator('input[name="birthday"]');
  await expect(birthday).toBeHidden();
  await expect(birthday).toBeDisabled();
  await expect(birthday).not.toHaveAttribute('required');
  await page.locator('.account-type label:has(input[value="participant"])').click();
  await expect(birthday).toBeVisible();
  await expect(birthday).toBeEnabled();
  await expect(birthday).toHaveAttribute('required');
});

test('live People results, no link underlines, clear stale results', async ({ page }, info) => {
  const account = await createAccount(page);
  await page.getByRole('button', { name: 'Log out' }).last().click();
  await page.goto('/people');
  const input = page.getByLabel('Search people');
  await input.fill(account.username.slice(0, -2));
  await expect(page.locator('.person-row').first()).toBeVisible();
  expect(await page.locator('a').evaluateAll(links => links.every(link => getComputedStyle(link).textDecorationLine === 'none'))).toBe(true);
  await input.fill('no_such_vertex_user_zzzz');
  await input.fill('x');
  await expect(page.locator('.person-row')).toHaveCount(0);
  await expect(page.locator('[data-search-status]')).toContainText('Enter at least two');
  await input.fill(account.username);
  await expect(page.locator('.person-row').first()).toBeVisible();
  await page.screenshot({ path: `test-results/changes-people-${info.project.name}.png`, fullPage: true });
  await page.locator('.person-row').first().click();
  await expect(page.locator('.public-profile')).toBeVisible();
});

test('reduced-motion splash preserves access', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  await expect(page.locator('#vertex-splash')).toBeHidden();
  await page.getByLabel('Email address').fill('accessibility@example.com');
  await expect(page.getByLabel('Email address')).toHaveValue('accessibility@example.com');
});
