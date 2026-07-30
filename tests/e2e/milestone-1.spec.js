import { test, expect } from '@playwright/test';

test.describe('Milestone 1', () => {
  test('home shell, narrative, living grid, and persistent theme', async ({ page }, info) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Vertex home' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Find your next challenge/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Opportunity should be easier to see.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Clarity at every meaningful moment.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The challenge stays at the centre.' })).toBeVisible();
    await expect(page.locator('.word').first()).toHaveText('VERTEX');
    const canvas = page.locator('.opportunity-grid');
    await expect(canvas).toBeVisible();
    expect(await canvas.evaluate(element => element.width > 0 && element.height > 0)).toBe(true);
    await expect(page.locator('.theme-scene')).toBeVisible();
    const toggle = page.getByRole('switch', { name: /Switch to (dark|light) mode/ });
    const before = await toggle.getAttribute('aria-checked');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
    const theme = await page.locator('html').getAttribute('data-theme');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const mobile = page.viewportSize().width <= 820;
    expect(await page.locator('body').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/home-${info.project.name}.png`, fullPage: true });
    if (mobile) {
      const actions = await page.locator('.actions').boundingBox();
      const header = await page.locator('.header-in').boundingBox();
      expect(Math.abs(actions.x + actions.width - (header.x + header.width))).toBeLessThan(2);
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.getByRole('navigation', { name: 'Mobile' })).toHaveAttribute('data-open', 'true');
      await expect(page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Fields' })).toHaveCount(0);
    } else {
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Fields' })).toHaveCount(0);
    }
  });

  for (const [path, heading] of [['/discover', 'Open field.'], ['/login', 'Access your workspace'], ['/signup', 'Join Vertex']]) {
    test(`direct route ${path}`, async ({ page }, info) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.getByText('404', { exact: true })).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      expect(await page.locator('body').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: `test-results/${path.slice(1)}-${info.project.name}.png`, fullPage: true });
    });
  }

  test('removed Fields route is no longer registered', async ({ page }) => {
    await page.goto('/discover/fields');
    await expect(page).toHaveTitle('Page not found - Vertex');
    await expect(page.getByText('404', { exact: true })).toBeVisible();
  });

  test('desktop header remains stable on authentication pages', async ({ page }) => {
    test.skip(page.viewportSize().width <= 820, 'Desktop header stability');
    await page.goto('/');
    const homeActions = await page.locator('.actions').boundingBox();
    const homeHeader = await page.locator('.header-in').boundingBox();
    await page.goto('/login');
    await expect(page.locator('.header .brand')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Back to Vertex' })).toBeVisible();
    const loginActions = await page.locator('.actions').boundingBox();
    const loginHeader = await page.locator('.header-in').boundingBox();
    expect(Math.abs(homeActions.x + homeActions.width - (loginActions.x + loginActions.width))).toBeLessThan(1);
    expect(Math.abs(homeHeader.x - loginHeader.x)).toBeLessThan(1);
    expect(Math.abs(homeHeader.width - loginHeader.width)).toBeLessThan(1);
  });

  test('Discover supports keyboard-accessible multi-field selection without filtering', async ({ page }) => {
    await page.goto('/discover');
    const mathematics = page.getByRole('button', { name: /Mathematics/ });
    const physics = page.getByRole('button', { name: /Physics/ });
    await mathematics.focus();
    await expect(mathematics).toBeFocused();
    await mathematics.press('Enter');
    await expect(mathematics).toHaveAttribute('aria-pressed', 'true');
    await physics.press('Space');
    await expect(physics).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-selection-status]')).toHaveText('2 fields selected.');
    await expect(page).toHaveURL(/\/discover$/);
    await mathematics.press('Enter');
    await expect(page.locator('[data-selection-status]')).toHaveText('1 field selected.');
  });

  test('custom 404 direct recovery', async ({ page }, info) => {
    await page.goto('/randomgarbage');
    await expect(page).toHaveTitle('Page not found - Vertex');
    await expect(page.getByText('404', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This path left the field.' })).toBeVisible();
    await page.screenshot({ path: `test-results/404-${info.project.name}.png`, fullPage: true });
  });

  test('reduced motion keeps the opportunity grid static and routes functional', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const canvas = page.locator('.opportunity-grid');
    const first = await canvas.evaluate(element => element.toDataURL());
    await page.waitForTimeout(180);
    const second = await canvas.evaluate(element => element.toDataURL());
    expect(second).toBe(first);
    await page.goto('/randomgarbage');
    await expect(page.locator('.fallback')).toBeVisible();
    await page.getByRole('link', { name: /Return home/ }).click();
    await page.getByRole('link', { name: /Explore competitions/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Open field.' })).toBeVisible();
  });

  test('skip link and authentication language remain usable', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    await page.goto('/login');
    await expect(page.getByText('Don’t have an account?')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/signup');
    await page.goto('/signup');
    await expect(page.getByText('Already have an account?')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Log in', exact: true }).last()).toHaveAttribute('href', '/login');
  });
});
