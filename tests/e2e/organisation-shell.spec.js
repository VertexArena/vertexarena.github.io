import { test, expect } from '@playwright/test';

test('public organisation directory, navigation, direct refresh and protected management', async ({ page }, info) => {
  await page.goto('/organisations');
  await expect(page.getByRole('heading', { name: 'Organisations.', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Explore organisations' })).toBeVisible();
  expect(await page.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: `test-results/m3-directory-${info.project.name}.png`, fullPage: true });
  if (page.viewportSize().width <= 820) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Organisations', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close navigation' }).click();
  }
  await page.goto('/organisation/edit');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Forganisation%2Fedit/);
  await page.goto('/organisation/vertex-no-such-organisation-zzzz');
  await expect(page.getByRole('heading', { name: 'This path left the field.' })).toBeVisible();
});

test('organisation signup choice hides birthday and preserves visible branding', async ({ page }, info) => {
  await page.goto('/signup');
  await page.locator('.account-type label:has(input[value="organisation"])').click();
  await expect(page.locator('input[name="birthday"]')).toBeHidden();
  await expect(page.locator('input[name="birthday"]')).toBeDisabled();
  await expect(page.locator('.auth-brand .word')).toBeVisible();
  expect(await page.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: `test-results/m3-signup-${info.project.name}.png`, fullPage: true });
});
