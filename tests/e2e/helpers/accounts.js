import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export async function createAccount(page, accountType = 'organiser', prefix = 'changes', birthday = '2009-03-14') {
  const identifier = randomUUID().replaceAll('-', '').slice(0, 14);
  const account = {
    username: `e2e_${identifier}`,
    name: `Vertex E2E ${prefix} ${identifier}`,
    email: `vertex-e2e-${prefix}-${identifier}@example.com`,
    password: `Vertex!${identifier}Aa`,
    accountType
  };
  await page.goto('/signup');
  await page.locator(`.account-type label:has(input[value="${accountType}"])`).click();
  if (accountType !== 'organisation') {
    await page.getByLabel('Full name').fill(account.name);
    await page.locator('input[name="username"]').fill(account.username);
  }
  if (accountType === 'participant') await page.getByLabel('Date of birth', { exact: true }).fill(birthday);
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByLabel('Confirm password').fill(account.password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(accountType === 'organisation' ? /\/organisation\/edit$/ : /\/profile\/edit$/, { timeout: 20000 });
  return account;
}

export async function login(page, account, destination = '/profile/edit') {
  await page.goto(`/login?returnTo=${encodeURIComponent(destination)}`);
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), { timeout: 20000 });
}

export async function sessionCredentials(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(name => name.endsWith('-auth-token'));
    const session = JSON.parse(localStorage.getItem(key));
    return { userId: session.user.id, token: session.access_token, ...window.VERTEX_CONFIG };
  });
}
