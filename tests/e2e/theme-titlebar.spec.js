import { test, expect } from './helpers/test.js';

test('app title-bar colour follows selected theme and survives refresh', async ({ page, request }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const colour = page.locator('meta[name="theme-color"]');
  const scheme = page.locator('meta[name="color-scheme"]');
  await expect(colour).toHaveAttribute('content', '#0B1120');
  await expect(scheme).toHaveAttribute('content', 'dark');
  await page.getByRole('switch', { name: 'Switch to light mode' }).click();
  await expect(colour).toHaveAttribute('content', '#F8FAFC');
  await expect(scheme).toHaveAttribute('content', 'light');
  await page.reload();
  await expect(colour).toHaveAttribute('content', '#F8FAFC');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('switch', { name: 'Switch to dark mode' }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login');
  await expect(colour).toHaveAttribute('content', '#0B1120');
  await expect(scheme).toHaveAttribute('content', 'dark');
  await page.reload();
  await expect(colour).toHaveAttribute('content', '#0B1120');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.theme_color).toBe('#F8FAFC');
});
