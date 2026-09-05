import { test, expect } from '@playwright/test';
import path from 'node:path';
import { createAccount, login, sessionCredentials } from './helpers/accounts.js';

test.describe.serial('Milestone 3', () => {
  let manager, organiser, participant, organisation, managerAuth, organiserAuth, outsiderAuth;
  const headers = auth => ({ apikey: auth.SUPABASE_ANON_KEY, Authorization: `Bearer ${auth.token}`, Prefer: 'return=representation' });
  const rest = (auth, resource) => `${auth.SUPABASE_PROJECT_URL}/rest/v1/${resource}`;

  test('create organisation account, logo, details, social links, edit and public route', async ({ page, request }, info) => {
    manager = await createAccount(page, 'organisation', 'm3owner');
    managerAuth = await sessionCredentials(page);
    await expect(page.getByLabel('Date of birth', { exact: true })).toHaveCount(0);
    const slug = `vertex-${manager.username.replaceAll('_', '-')}`;
    organisation = { slug, name: `Vertex E2E School ${manager.username}` };
    await page.getByLabel('Organisation name').fill(organisation.name);
    await page.getByLabel('Organisation slug').fill(slug);
    await page.getByLabel('Description').fill('Student-led research, design, and innovation. A dedicated development test organisation.');
    await page.getByLabel('Website').fill('https://example.com/school');
    await page.getByLabel('Label', { exact: true }).fill('Research');
    await page.getByLabel('URL', { exact: true }).fill('https://example.com/research');
    await page.getByRole('button', { name: 'Add link' }).click();
    await page.getByLabel('Label', { exact: true }).nth(1).fill('Community');
    await page.getByLabel('URL', { exact: true }).nth(1).fill('https://example.com/community');
    await page.locator('input[name="logo"]').setInputFiles(path.resolve('assets/logo.png'));
    await expect(page.getByAltText('Selected organisation logo preview')).toBeVisible();
    await page.getByRole('button', { name: 'Create organisation', exact: true }).click();
    await expect(page.getByText('Organisation saved.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Associated organisers' })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Organisation name')).toHaveValue(organisation.name);
    await expect(page.getByLabel('URL', { exact: true }).nth(1)).toHaveValue('https://example.com/community');
    await page.getByLabel('Description').fill('A school supporting student research and thoughtful design. Vertex E2E test organisation.');
    await page.getByRole('button', { name: 'Save organisation' }).click();
    await expect(page.getByText('Organisation saved.')).toBeVisible();
    const lookup = await request.get(rest(managerAuth, `organisations?slug=eq.${slug}`), { headers: headers(managerAuth) });
    expect(lookup.ok()).toBe(true);
    [organisation] = await lookup.json();
    await page.getByRole('link', { name: 'View organisation', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/organisation/${slug}$`));
    await page.reload();
    await expect(page.getByRole('heading', { name: organisation.name, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Research', exact: true })).toHaveAttribute('rel', /noopener/);
    await expect(page.getByText('No competitions published yet.')).toBeVisible();
    expect(await page.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/m3-organisation-${info.project.name}.png`, fullPage: true });
  });

  test('invite organiser; reject participant and duplicate invitation; private pending state', async ({ page, request }, info) => {
    organiser = await createAccount(page, 'organiser', 'm3organiser');
    organiserAuth = await sessionCredentials(page);
    await page.getByRole('button', { name: 'Log out' }).last().click();
    participant = await createAccount(page, 'participant', 'm3outsider');
    outsiderAuth = await sessionCredentials(page);
    await page.getByRole('button', { name: 'Log out' }).last().click();
    await login(page, manager, '/organisation/edit');
    await page.getByLabel('Organiser username').fill(`@${participant.username}`);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText('Choose an existing organiser by their exact @username.')).toBeVisible();
    await page.getByLabel('Organiser username').fill(`@${organiser.username}`);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText('Invitation sent.')).toBeVisible();
    await expect(page.getByText('Invitation pending', { exact: true })).toBeVisible();
    await page.getByLabel('Organiser username').fill(organiser.username);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText('This organiser is already a member or has a pending invitation.')).toBeVisible();
    const pending = await request.get(rest(managerAuth, `organisation_memberships?organisation_id=eq.${organisation.id}`), { headers: headers(managerAuth) });
    const [invitation] = await pending.json();
    organisation.invitation = invitation.id;
    for (const auth of [outsiderAuth, { ...managerAuth, token: managerAuth.SUPABASE_ANON_KEY }]) {
      const visible = await request.get(rest(auth, `organisation_memberships?id=eq.${invitation.id}`), { headers: headers(auth) });
      expect(await visible.json()).toEqual([]);
    }
    await page.screenshot({ path: `test-results/m3-management-${info.project.name}.png`, fullPage: true });
  });

  test('organiser accepts; associations on both profiles; logged-out public access', async ({ page, browser }, info) => {
    await login(page, organiser, '/organisations');
    const card = page.locator('.invitation-card').filter({ hasText: organisation.name });
    await expect(card).toBeVisible();
    await page.screenshot({ path: `test-results/m3-invitation-${info.project.name}.png`, fullPage: true });
    await card.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(page.getByText('Invitation accepted.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Leave organisation' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Leave organisation' })).toBeVisible();
    await page.goto(`/profile/@${organiser.username}`);
    await expect(page.locator('.organisation-associations').getByRole('link', { name: new RegExp(organisation.name) })).toBeVisible();
    await page.goto('/organisation/edit');
    await expect(page.getByRole('heading', { name: 'Organisation account required.' })).toBeVisible();
    await expect(page.getByLabel('Organisation name')).toHaveCount(0);
    const context = await browser.newContext({ viewport: page.viewportSize() });
    const publicPage = await context.newPage();
    await publicPage.goto(`http://127.0.0.1:4173/organisation/${organisation.slug}`);
    await expect(publicPage.getByRole('heading', { name: organisation.name, exact: true })).toBeVisible();
    await expect(publicPage.getByRole('link', { name: new RegExp(organiser.name) })).toBeVisible();
    await expect(publicPage.getByRole('link', { name: 'Edit organisation' })).toHaveCount(0);
    await publicPage.reload();
    await expect(publicPage.getByRole('heading', { name: organisation.name, exact: true })).toBeVisible();
    expect(await publicPage.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await publicPage.screenshot({ path: `test-results/m3-public-${info.project.name}.png`, fullPage: true });
    await context.close();
  });

  test('RLS and Storage prevent unrelated edits, self-join, forged acceptance, ownership and role changes', async ({ request }) => {
    for (const auth of [outsiderAuth, organiserAuth, { ...managerAuth, token: managerAuth.SUPABASE_ANON_KEY }]) {
      const update = await request.patch(rest(auth, `organisations?id=eq.${organisation.id}`), { headers: headers(auth), data: { name: 'UNAUTHORISED CHANGE' } });
      if (update.ok()) expect(await update.json()).toEqual([]); else expect(update.status()).toBeGreaterThanOrEqual(400);
      const membership = await request.post(rest(auth, 'organisation_memberships'), { headers: headers(auth), data: { organisation_id: organisation.id, organiser_id: auth.userId, invited_by: auth.userId, status: 'accepted', role: 'owner' } });
      expect(membership.ok()).toBe(false);
      const invitation = await request.post(rest(auth, 'rpc/invite_organisation_organiser'), { headers: headers(auth), data: { organisation_id: organisation.id, username: organiser.username } });
      expect(invitation.ok()).toBe(false);
      const upload = await request.post(`${auth.SUPABASE_PROJECT_URL}/storage/v1/object/organisation-logos/${managerAuth.userId}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png`, { headers: { ...headers(auth), 'Content-Type': 'image/png' }, data: Buffer.from('not-an-image') });
      expect(upload.ok()).toBe(false);
      const overwrite = await request.put(`${auth.SUPABASE_PROJECT_URL}/storage/v1/object/organisation-logos/${organisation.logo_path}`, { headers: { ...headers(auth), 'Content-Type': 'image/png' }, data: Buffer.from('not-an-image') });
      expect(overwrite.ok()).toBe(false);
    }
    const respond = await request.post(rest(outsiderAuth, 'rpc/respond_organisation_invitation'), { headers: headers(outsiderAuth), data: { invitation_id: organisation.invitation, accept_invitation: true } });
    expect(respond.ok()).toBe(false);
    const remove = await request.post(rest(outsiderAuth, 'rpc/remove_organisation_membership'), { headers: headers(outsiderAuth), data: { membership_id: organisation.invitation } });
    expect(remove.ok()).toBe(false);
    const transfer = await request.patch(rest(managerAuth, `organisations?id=eq.${organisation.id}`), { headers: headers(managerAuth), data: { management_profile_id: outsiderAuth.userId } });
    expect(transfer.ok()).toBe(false);
    const unsafeLinks = await request.patch(rest(managerAuth, `organisations?id=eq.${organisation.id}`), { headers: headers(managerAuth), data: { social_links: [{ label: 'Bad', url: 'javascript:alert(1)' }] } });
    expect(unsafeLinks.ok()).toBe(false);
    const invalidSlug = await request.patch(rest(managerAuth, `organisations?id=eq.${organisation.id}`), { headers: headers(managerAuth), data: { slug: 'edit' } });
    expect(invalidSlug.ok()).toBe(false);
    const role = await request.patch(rest(organiserAuth, `organisation_memberships?id=eq.${organisation.invitation}`), { headers: headers(organiserAuth), data: { role: 'owner' } });
    expect(role.ok()).toBe(false);
    const verify = await request.get(rest(managerAuth, `organisations?id=eq.${organisation.id}`), { headers: headers(managerAuth) });
    expect((await verify.json())[0].name).toBe(organisation.name);
    const publicLogo = await request.get(`${managerAuth.SUPABASE_PROJECT_URL}/storage/v1/object/public/organisation-logos/${organisation.logo_path}`);
    expect(publicLogo.ok()).toBe(true);
  });

  test('leave, decline, reinvite, cancel, duplicate slug, upload validation, theme and reduced motion', async ({ page }, info) => {
    await login(page, organiser, '/organisations');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Leave organisation' }).click();
    await expect(page.getByText('Association or invitation removed.')).toBeVisible();
    await page.goto('/profile/edit');
    await page.getByRole('button', { name: 'Log out' }).last().click();
    await login(page, manager, '/organisation/edit');
    await page.getByLabel('Organiser username').fill(organiser.username);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText('Invitation sent.')).toBeVisible();
    await page.goto('/profile/edit');
    await page.getByRole('button', { name: 'Log out' }).last().click();
    await login(page, organiser, '/organisations');
    await page.getByRole('button', { name: 'Decline invitation' }).click();
    await expect(page.getByText('Invitation declined.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Leave organisation' })).toHaveCount(0);
    await page.goto('/profile/edit');
    await page.getByRole('button', { name: 'Log out' }).last().click();
    await login(page, manager, '/organisation/edit');
    await expect(page.getByText('Declined', { exact: true })).toBeVisible();
    await page.getByLabel('Organiser username').fill(organiser.username);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText('Invitation sent.')).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Cancel invitation' }).click();
    await expect(page.getByText('Association or invitation removed.')).toBeVisible();
    await page.locator('input[name="logo"]').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
    await expect(page.getByText('Choose a JPG, PNG, WebP, or GIF logo, 5 MB or smaller.')).toBeVisible();
    await page.locator('input[name="logo"]').setInputFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
    await expect(page.getByText('Choose a JPG, PNG, WebP, or GIF logo, 5 MB or smaller.')).toBeVisible();
    await page.locator('input[name="logo"]').setInputFiles([]);
    await page.getByRole('switch').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByLabel('Organisation name')).toHaveValue(organisation.name);
    await expect(page.locator('#vertex-splash')).toBeHidden();
    expect(await page.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/m3-management-dark-${info.project.name}.png`, fullPage: true });
    await page.goto('/profile/edit');
    await page.getByRole('button', { name: 'Log out' }).last().click();
    await createAccount(page, 'organisation', 'm3duplicate');
    await page.getByLabel('Organisation slug').fill(organisation.slug);
    await page.getByRole('button', { name: 'Create organisation', exact: true }).click();
    await expect(page.getByText('That organisation slug is already in use. Choose another.')).toBeVisible();
  });

  test('logo replacement/removal, server upload validation, navigation race and network recovery', async ({ page, request }, info) => {
    await login(page, manager, '/organisation/edit');
    await page.locator('input[name="logo"]').setInputFiles(path.resolve('assets/logo.png'));
    await page.getByRole('button', { name: 'Save organisation' }).click();
    await expect(page.getByText('Organisation saved.')).toBeVisible();
    const lookup = await request.get(rest(managerAuth, `organisations?id=eq.${organisation.id}`), { headers: headers(managerAuth) });
    const [updated] = await lookup.json();
    expect(updated.logo_path).not.toBe(organisation.logo_path);
    const oldObjects = await request.post(`${managerAuth.SUPABASE_PROJECT_URL}/storage/v1/object/list/organisation-logos`, {
      headers: headers(managerAuth), data: { prefix: managerAuth.userId, search: organisation.logo_path.split('/')[1], limit: 100 }
    });
    expect(oldObjects.ok()).toBe(true);
    expect(await oldObjects.json()).toEqual([]);
    await page.getByLabel('Remove current logo').check();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Save organisation' }).click();
    await expect(page.getByText('Organisation saved.')).toBeVisible();
    await expect(page.locator('[data-org-logo-preview] .logo-fallback')).toBeVisible();
    await page.locator('input[name="logo"]').setInputFiles(path.resolve('assets/logo.png'));
    await page.getByRole('button', { name: 'Save organisation' }).click();
    await expect(page.getByText('Organisation saved.')).toBeVisible();
    for (const auth of [outsiderAuth, organiserAuth]) {
      const create = await request.post(rest(auth, 'organisations'), { headers: headers(auth), data: { management_profile_id: auth.userId, name: 'Unauthorised organisation', slug: `denied-${auth.userId}` } });
      expect(create.ok()).toBe(false);
      const ownUpload = await request.post(`${auth.SUPABASE_PROJECT_URL}/storage/v1/object/organisation-logos/${auth.userId}/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png`, { headers: { ...headers(auth), 'Content-Type': 'image/png' }, data: Buffer.from('invalid') });
      expect(ownUpload.ok()).toBe(false);
    }
    const badType = await request.post(`${managerAuth.SUPABASE_PROJECT_URL}/storage/v1/object/organisation-logos/${managerAuth.userId}/cccccccc-cccc-cccc-cccc-cccccccccccc.png`, { headers: { ...headers(managerAuth), 'Content-Type': 'text/plain' }, data: Buffer.from('invalid') });
    expect(badType.ok()).toBe(false);
    const oversized = await request.post(`${managerAuth.SUPABASE_PROJECT_URL}/storage/v1/object/organisation-logos/${managerAuth.userId}/dddddddd-dddd-dddd-dddd-dddddddddddd.png`, { headers: { ...headers(managerAuth), 'Content-Type': 'image/png' }, data: Buffer.alloc(5 * 1024 * 1024 + 1) });
    expect(oversized.ok()).toBe(false);

    // Delay a real request without replacing its response. New navigation must win.
    let releaseRequest;
    const gate = new Promise(resolve => { releaseRequest = resolve; });
    await page.route('**/rest/v1/organisations?*', async route => { await gate; await route.continue(); });
    await page.getByRole('link', { name: 'View organisation', exact: true }).click();
    await expect(page.getByText('Opening page…')).toBeVisible();
    await page.getByRole('link', { name: 'Vertex home', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Find your next challenge/ })).toBeVisible();
    const response = page.waitForResponse(response => response.url().includes('/rest/v1/organisations?'));
    releaseRequest();
    await response;
    await page.unroute('**/rest/v1/organisations?*');
    await expect(page).toHaveURL('http://127.0.0.1:4173/');
    await expect(page.getByRole('heading', { name: /Find your next challenge/ })).toBeVisible();

    // Fail a network request, then retry against the real hosted project.
    await page.route('**/rest/v1/organisations?*', route => route.abort('failed'));
    await page.goto(`/organisation/${organisation.slug}`);
    await expect(page.getByRole('heading', { name: 'Vertex could not open this page.' })).toBeVisible();
    await page.unroute('**/rest/v1/organisations?*');
    await page.getByRole('link', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: organisation.name, exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/m3-public-final-${info.project.name}.png`, fullPage: true });
  });
});
