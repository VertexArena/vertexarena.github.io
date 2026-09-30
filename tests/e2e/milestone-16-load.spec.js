import { test, expect } from './helpers/test.js';

test('Milestone 16 paginates and searches a 500-entry published leaderboard', async ({ page }, info) => {
  test.skip(!process.env.M16_LOAD_SLUG, 'Requires the temporary 500-entry Supabase load fixture.');
  const path = `/competition/${process.env.M16_LOAD_SLUG}/leaderboard/large-result`;
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Large result leaderboard.' })).toBeVisible();
  await expect(page.locator('.leaderboard-entry')).toHaveCount(25);
  await expect(page.locator('.leaderboard-section-heading').filter({ hasText: 'Ranked entries.' })).toContainText('500 entries');
  await expect(page.locator('.leaderboard-pagination')).toContainText('Page 1 of 20');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.leaderboard-pagination')).toContainText('Page 2 of 20');
  await expect(page.locator('.leaderboard-entry').first()).toContainText('M16 Load 0026');
  await page.locator('[data-leaderboard-search] input').fill('M16 Load 0500');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('.leaderboard-entry')).toHaveCount(1);
  await expect(page.locator('.leaderboard-entry')).toContainText('M16 Load 0500');
  await expect(page.locator('.leaderboard-entry-rank')).toHaveText('500');
  await page.reload();
  await expect(page.locator('.leaderboard-entry')).toContainText('M16 Load 0500');
  await page.screenshot({ path: info.outputPath('m16-load-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.screenshot({ path: info.outputPath('m16-load-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
});
