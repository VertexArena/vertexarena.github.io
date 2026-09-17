import { test as base, expect } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';

// This run uses user-requested manual cleanup. Record exact IDs, never passwords
// or tokens, so the user can delete only these accounts and their owned uploads.
export const test = base.extend({
  page: async ({ page }, use) => {
    const pending = [];
    const record = response => {
      if (!response.url().includes('/auth/v1/signup') || !response.ok()) return;
      pending.push((async () => {
        const body = await response.json();
        const user = body.user;
        if (!body.access_token || !user?.id || !/^vertex-e2e-[a-z0-9-]+@example\.com$/i.test(user.email || '')) return;
        mkdirSync('.test-data', { recursive: true });
        appendFileSync('.test-data/accounts.ndjson', JSON.stringify({ id: user.id, email: user.email, created_at: user.created_at }) + '\n');
      })());
    };
    page.on('response', record);
    await use(page);
    page.off('response', record);
    await Promise.all(pending);
  }
});
export { expect };
