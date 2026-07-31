import { test, expect } from '@playwright/test';
import path from 'node:path';

test.describe.serial('Milestone 2', () => {
  let participant;
  let organiser;

  test.beforeEach(async ({}, testInfo) => {
    test.skip(!['laptop', 'standard-mobile'].includes(testInfo.project.name), 'Milestone 2 runs at representative desktop and mobile viewports.');
  });

  test('participant signup, profile, avatar, persistence, search, public privacy, logout, and login', async ({ page }, testInfo) => {
    const stamp = `${Date.now()}-${testInfo.project.name.replace(/\W/g, '')}`;
    participant = {
      email: `vertex-e2e-m2-participant-${stamp}@example.com`,
      password: `Vertex!${stamp}Aa`,
      username: `m2p_${stamp.replace(/\D/g, '').slice(-10)}`,
      name: `Vertex M2 Participant ${stamp}`
    };

    await page.goto('/signup');
    await page.getByLabel('Full name').fill(participant.name);
    await page.locator('input[name="username"]').fill(participant.username);
    await page.locator('input[name="birthday"]').fill('2009-03-14');
    await page.getByLabel('Email address').fill(participant.email);
    await page.getByLabel('Password', { exact: true }).fill(participant.password);
    await page.getByLabel('Confirm password').fill(participant.password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/profile\/edit$/);
    await expect(page.getByRole('heading', { name: 'Edit profile.' })).toBeVisible();

    await page.getByLabel('Bio').fill('Student researcher building accessible robotics projects.');
    await page.getByLabel('School or affiliation').fill('Vertex E2E Academy');
    await page.getByLabel('Location').fill('Test City');
    const labels = page.getByLabel('Label');
    const urls = page.getByLabel('URL');
    await labels.nth(0).fill('Portfolio');
    await urls.nth(0).fill('https://example.com/portfolio');
    await labels.nth(1).fill('GitHub');
    await urls.nth(1).fill('https://github.com/example');
    await page.locator('input[name="avatar"]').setInputFiles(path.resolve('assets/logo.png'));
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Full name')).toHaveValue(participant.name);
    await expect(page.getByLabel('Bio')).toHaveValue(/accessible robotics/);
    await expect(page.locator('.profile-preview .avatar')).toBeVisible();
    if (page.viewportSize().width <= 820) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Edit profile' })).toBeVisible();
      await page.getByRole('button', { name: 'Close navigation' }).click();
    } else {
      await expect(page.getByRole('link', { name: 'Edit your profile' })).toBeVisible();
    }

    await page.getByRole('link', { name: 'View public profile' }).click();
    await expect(page).toHaveURL(new RegExp(`/profile/@${participant.username}$`, 'i'));
    await expect(page.getByRole('heading', { name: participant.name })).toBeVisible();
    await expect(page.getByText(`@${participant.username}`)).toBeVisible();
    await expect(page.getByText('2009-03-14')).toHaveCount(0);
    await expect(page.getByText(/Date of birth/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Portfolio' })).toHaveAttribute('rel', /noopener/);
    await page.reload();
    await expect(page.getByRole('heading', { name: participant.name })).toBeVisible();

    await page.goto('/people');
    await page.getByLabel('Search people').fill(`@${participant.username}`);
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('1 profile found.')).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(participant.name) })).toBeVisible();

    await page.goto('/profile/edit');
    await page.getByRole('button', { name: 'Log out' }).last().click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/profile/edit');
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    await page.getByLabel('Email address').fill(participant.email);
    await page.locator('input[name="password"]').fill(participant.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/profile\/edit$/);
    await page.reload();
    await expect(page.getByLabel('Full name')).toHaveValue(participant.name);
    expect(await page.locator('body').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/m2-participant-${testInfo.project.name}.png`, fullPage: true });
  });

  test('organiser signup, complete profile, search, and public view', async ({ page }, testInfo) => {
    const stamp = `${Date.now()}-${testInfo.project.name.replace(/\W/g, '')}`;
    organiser = {
      email: `vertex-e2e-m2-organiser-${stamp}@example.com`,
      password: `Vertex!${stamp}Bb`,
      username: `m2o_${stamp.replace(/\D/g, '').slice(-10)}`,
      name: `Vertex M2 Organiser ${stamp}`
    };
    await page.goto('/signup');
    await page.locator('.account-type label:has(input[value="organiser"])').click();
    await expect(page.locator('input[value="organiser"]')).toBeChecked();
    await page.getByLabel('Full name').fill(organiser.name);
    await page.locator('input[name="username"]').fill(organiser.username);
    await page.getByLabel('Email address').fill(organiser.email);
    await page.getByLabel('Password', { exact: true }).fill(organiser.password);
    await page.getByLabel('Confirm password').fill(organiser.password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/profile\/edit$/);
    await expect(page.getByLabel(/Date of birth/)).toHaveCount(0);
    await page.getByLabel('Bio').fill('Competition organiser focused on fair, clear student opportunities.');
    await page.getByLabel('School or affiliation').fill('Vertex E2E Foundation');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();
    await page.goto('/people');
    await page.getByLabel('Search people').fill(organiser.username);
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('link', { name: new RegExp(organiser.name) }).click();
    await expect(page.getByRole('heading', { name: organiser.name })).toBeVisible();
    await expect(page.getByText('organiser', { exact: true })).toBeVisible();
    expect(await page.locator('body').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/m2-organiser-${testInfo.project.name}.png`, fullPage: true });
  });

  test('duplicate username, cross-profile update, and cross-owner Storage writes are rejected', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'Security probes run once on desktop.');

    const secondStamp = Date.now();
    const second = {
      email: `vertex-e2e-m2-security-${secondStamp}@example.com`,
      password: `Vertex!${secondStamp}Cc`,
      username: `m2s_${String(secondStamp).slice(-10)}`,
      name: `Vertex M2 Security ${secondStamp}`
    };

    await page.goto('/signup');
    await page.getByLabel('Full name').fill('Vertex Duplicate Username Probe');
    await page.locator('input[name="username"]').fill(participant.username);
    await page.locator('input[name="birthday"]').fill('2009-06-11');
    await page.getByLabel('Email address').fill(`vertex-e2e-m2-duplicate-${secondStamp}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill(second.password);
    await page.getByLabel('Confirm password').fill(second.password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(/email or username is already in use/i)).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);

    await page.getByLabel('Full name').fill(second.name);
    await page.locator('input[name="username"]').fill(second.username);
    await page.getByLabel('Email address').fill(second.email);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/profile\/edit$/);

    const auth = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(name => name.endsWith('-auth-token'));
      const session = JSON.parse(localStorage.getItem(key));
      return { accessToken: session.access_token, userId: session.user.id, url: window.VERTEX_CONFIG.SUPABASE_PROJECT_URL, anon: window.VERTEX_CONFIG.SUPABASE_ANON_KEY };
    });
    const lookup = await request.get(`${auth.url}/rest/v1/public_profiles?username=eq.${participant.username}&select=id,full_name,avatar_path`, { headers: { apikey: auth.anon, Authorization: `Bearer ${auth.accessToken}` } });
    expect(lookup.ok()).toBe(true);
    const [target] = await lookup.json();
    expect(target).toBeTruthy();

    const update = await request.patch(`${auth.url}/rest/v1/profiles?id=eq.${target.id}`, {
      headers: { apikey: auth.anon, Authorization: `Bearer ${auth.accessToken}`, Prefer: 'return=representation' },
      data: { full_name: 'RLS SHOULD BLOCK THIS' }
    });
    expect(update.ok()).toBe(true);
    expect(await update.json()).toEqual([]);

    const crossStorage = await request.post(`${auth.url}/storage/v1/object/profile-pictures/${target.id}/attack.png`, {
      headers: { apikey: auth.anon, Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'image/png', 'x-upsert': 'false' },
      data: Buffer.from('not-an-image')
    });
    expect(crossStorage.status()).toBeGreaterThanOrEqual(400);

    const verify = await request.get(`${auth.url}/rest/v1/public_profiles?username=eq.${participant.username}&select=full_name`, { headers: { apikey: auth.anon, Authorization: `Bearer ${auth.accessToken}` } });
    expect((await verify.json())[0].full_name).toBe(participant.name);
  });
});
