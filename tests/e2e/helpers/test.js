import { test as base, expect } from '@playwright/test';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';

// Playwright can use a local copy of the same pinned public browser client when
// this host blocks CDN traffic. Normal runs still load the CDN module directly.
const cachedClient = '.test-data/supabase-js-2.117.1.umd.js';
base.beforeEach(async ({ context }) => {
  if (!existsSync(cachedClient)) return;
  const module = `${readFileSync(cachedClient, 'utf8')}\nexport const createClient = supabase.createClient;`;
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm', route => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: module }));
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://cdnjs.cloudflare.com/**', route => route.abort());
});

// Record exact test account IDs for verified Supabase connector cleanup. Never
// retain passwords or tokens. Identity image uploads require explicit permission.
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
