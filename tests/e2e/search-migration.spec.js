import { test, expect } from '@playwright/test';
import { createAccount } from './helpers/accounts.js';

test('typo suggestions use public profiles and never expose birthdays', async ({ page, request }) => {
  const account = await createAccount(page, 'participant', 'search');
  await page.getByRole('button', { name: 'Log out' }).last().click();
  await page.goto('/people');
  const typo = `${account.username.slice(0, 9)}z${account.username.slice(10)}`;
  await page.getByLabel('Search people').fill(typo);
  await expect(page.getByRole('link', { name: new RegExp(account.name) })).toBeVisible();
  const config = await page.evaluate(() => window.VERTEX_CONFIG);
  const response = await request.post(`${config.SUPABASE_PROJECT_URL}/rest/v1/rpc/search_profiles`, {
    headers: { apikey: config.SUPABASE_ANON_KEY, Authorization: `Bearer ${config.SUPABASE_ANON_KEY}` },
    data: { search_term: typo, result_limit: 100 }
  });
  expect(response.ok()).toBe(true);
  const profiles = await response.json();
  expect(profiles.length).toBeLessThanOrEqual(25);
  expect(profiles.some(profile => profile.username === account.username)).toBe(true);
  for (const profile of profiles) {
    expect(profile).not.toHaveProperty('birthday');
    expect(profile).not.toHaveProperty('email');
  }
});
