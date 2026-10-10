import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('saved-draft deletion confirmation is accessible and never mutates existing data', async ({ page }, info) => {
  test.skip(!process.env.VERTEX_AUDIT_PASSWORD, 'Requires the user-authorized organiser account.');
  test.setTimeout(180000);
  const writes = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/rest/v1/**', route => {
    const request = route.request();
    if (!['GET','HEAD','OPTIONS'].includes(request.method()) && !/\/rpc\/(?:can_|my_|organiser_|public_|search_|round_)/.test(request.url())) {
      writes.push(request.url()); return route.abort();
    }
    return route.continue();
  });
  const settled = async () => {
    await expect(page.locator('#vertex-splash')).toHaveCount(0, { timeout: 45000 });
    await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
  };
  await page.goto('/login?returnTo=%2Forganiser'); await settled();
  await page.getByLabel('Email address').fill('john@example.com');
  await page.getByLabel('Password', { exact: true }).fill(process.env.VERTEX_AUDIT_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL('/organiser'); await settled();
  const draft = page.locator('.dashboard-competition').filter({ has: page.locator('.dashboard-state', { hasText: /^Draft$/ }) }).first();
  const draftHref = (await draft.locator('h3 a').getAttribute('href')).replace(/\/workspace$/, '');
  await page.goto(draftHref); await settled();
  const deleteButton = page.getByRole('button', { name: 'Delete draft', exact: true });
  await expect(deleteButton).toBeVisible();
  const savedName = await page.getByLabel('Competition name', { exact: true }).inputValue();
  for (const [width, height, theme] of [[1366,768,'light'],[390,844,'dark'],[320,700,'light']]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(theme => { localStorage.setItem('vertex-theme', theme); document.documentElement.dataset.theme = theme; }, theme);
    await deleteButton.click();
    const dialog = page.getByRole('dialog', { name: 'Delete saved draft?' });
    await expect(dialog.getByRole('button', { name: 'Keep draft' })).toBeFocused();
    const confirm = dialog.getByRole('button', { name: 'Delete permanently' });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Saved competition name').fill(`${savedName} incorrect`); await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Saved competition name').fill(savedName); await expect(confirm).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`draft-delete-${width}-${theme}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(axe.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(deleteButton).toBeFocused();
  }
  // Deliberately fail transport before any RPC reaches Supabase. Verify recoverable
  // failure and retry without deleting the user's real draft or inventing accounts.
  let blockedAttempts = 0;
  await page.route('**/rpc/prepare_draft_competition_deletion', route => { blockedAttempts++; return route.abort('internetdisconnected'); });
  await deleteButton.click();
  const failedDialog = page.getByRole('dialog');
  await failedDialog.getByLabel('Saved competition name').fill(savedName);
  await failedDialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(failedDialog.locator('[data-delete-status]')).toContainText('The draft has not been deleted');
  await expect(failedDialog.locator('[data-delete-status]')).toBeFocused();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v => v.id)).toEqual([]);
  await failedDialog.getByRole('button', { name: 'Retry deletion' }).click();
  await expect.poll(() => blockedAttempts).toBe(2);
  await expect(failedDialog.getByRole('button', { name: 'Keep draft' })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('draft-delete-connection-error.png'), fullPage: false });
  await failedDialog.getByRole('button', { name: 'Keep draft' }).click();
  await page.getByLabel('Competition name', { exact: true }).fill('Unsaved local title');
  await page.getByRole('button', { name: '2 Participation' }).click();
  await deleteButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(savedName); await expect(dialog).toContainText('Your unsaved edits will also be discarded.');
  await dialog.getByRole('button', { name: 'Keep draft' }).click();
  await page.getByRole('button', { name: '1 Essentials' }).click();
  await expect(page.getByLabel('Competition name', { exact: true })).toHaveValue('Unsaved local title');
  page.once('dialog', dialog => dialog.accept()); await page.reload(); await settled();
  await expect(page.getByLabel('Competition name', { exact: true })).toHaveValue(savedName);
  await expect(deleteButton).toBeVisible();
  // Published retention messaging and absence of deletion are checked on the real competition.
  await page.goto('/organiser'); await settled();
  const published = page.locator('a').filter({ has: page.locator('.account-badge', { hasText: /^Published$/ }) }).first();
  if (await published.count()) { await page.goto(await published.getAttribute('href')); await settled(); }
  else { await page.goto('/organiser/competition/socratic-marathon'); await settled(); }
  await expect(page.getByRole('button', { name: 'Delete draft', exact: true })).toHaveCount(0);
  await expect(page.locator('.draft-management')).toContainText('entries, results and certificates');
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});
