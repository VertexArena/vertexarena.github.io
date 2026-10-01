// Deliberately uses real CDN traffic, without the development cache helper.
import { test, expect } from '@playwright/test';

test('published release boots with real libraries and recovers nested routes', async ({ page }, info) => {
  test.skip(!process.env.VERTEX_RELEASE_URL, 'Run after the release is deployed.');
  test.setTimeout(180000);
  const origin = process.env.VERTEX_RELEASE_URL;
  await page.goto(origin);
  await expect(page.locator('#vertex-splash')).toHaveCount(0, { timeout: 45000 });
  await expect(page.getByRole('heading', { name: 'Find your next challenge.' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.gsap))).toBe(true);
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px Geist'))).toBe(true);
  await expect(page.locator('.hero-buttons .fa-arrow-right').first()).toHaveCSS('font-family', '"Font Awesome 6 Free"');
  await page.goto(`${origin}/discover`);
  await expect(page.locator('.discovery-catalogue .discovery-card').first()).toBeVisible({ timeout: 45000 });
  const competition = await page.locator('.discovery-catalogue .discovery-card h3 a').first().getAttribute('href');
  await page.goto(`${origin}${competition}`);
  await expect(page.locator('#vertex-splash')).toHaveCount(0);
  await expect(page.locator('.competition-detail')).toBeVisible();
  await page.reload();
  await expect(page.locator('.competition-detail')).toBeVisible();
  await page.goto(`${origin}/login?returnTo=${encodeURIComponent(competition)}`);
  await expect(page.getByLabel('Email address')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${origin}/randomgarbage`);
  await expect(page.getByRole('heading', { name: 'This path left the field.' })).toBeVisible();
  await page.getByRole('link', { name: 'Return home' }).click();
  await expect(page.getByRole('heading', { name: 'Find your next challenge.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('production-mobile.png'), fullPage: true });
});
