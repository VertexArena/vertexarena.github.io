import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';

const emails = { organiser: 'john@example.com', participant: 'rishit@example.com', organisation: 'socra@example.com' };
async function settled(page) {
  await expect(page.locator('#vertex-splash')).toHaveCount(0, { timeout: 45000 });
  await expect(page.locator('#app')).toHaveAttribute('aria-busy','false');
}
async function readOnly(page) {
  const writes = [];
  await page.route('**/rest/v1/**', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['GET','HEAD','OPTIONS'].includes(request.method()) && (!url.pathname.includes('/rpc/') || /\/(save|set|create|delete|prepare|register|accept|decline|remove|mark|publish|finalise|resolve|leave|cancel|update|invite|revoke)_/.test(url.pathname))) {
      writes.push(url.pathname); return route.abort();
    }
    return route.continue();
  });
  return writes;
}
async function review(page, name, info) {
  await settled(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations;
  expect(violations.map(v => ({ id:v.id, targets:v.nodes.map(n => n.target) }))).toEqual([]);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

for (const role of Object.keys(emails)) test(`${role}: dashboard landing, navigation and human-readable controls`, async ({ page }, info) => {
  test.skip(!process.env.VERTEX_AUDIT_PASSWORD, 'Uses authorized existing accounts.');
  test.setTimeout(180000);
  const writes = await readOnly(page), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login'); await settled(page);
  await page.getByLabel('Email address').fill(emails[role]);
  await page.getByLabel('Password',{exact:true}).fill(process.env.VERTEX_AUDIT_PASSWORD);
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  const dashboard = role === 'organiser' ? '/organiser' : '/dashboard';
  await expect(page).toHaveURL(dashboard); await settled(page);
  await expect(page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link').first()).toHaveText('Dashboard');
  await expect(page.getByRole('link',{name:'Home',exact:true})).toHaveCount(0);
  expect(await page.locator('a[href="/"]').evaluateAll(links => links.every(link => link.matches('.brand')))).toBe(true);
  await review(page,`${role}-dashboard`,info);
  const accountMenu = page.locator('.account-menu');
  await accountMenu.locator('summary').click(); await expect(accountMenu).toHaveAttribute('open','');
  await expect(accountMenu.getByRole('button',{name:'Log out',exact:true})).toBeVisible();
  await review(page,`${role}-account-menu-light`,info);
  await page.locator('button[data-theme]').click(); await accountMenu.locator('summary').click();
  await review(page,`${role}-account-menu-dark`,info);
  await page.keyboard.press('Escape'); await expect(accountMenu).not.toHaveAttribute('open','');
  await expect(accountMenu.locator('summary')).toBeFocused();
  await page.locator('button[data-theme]').click();
  await page.reload(); await settled(page); await expect(page).toHaveURL(dashboard);
  await page.goto('/dashboard'); await settled(page); await expect(page).toHaveURL(dashboard);

  if (role === 'organiser') {
    const card = page.locator('a.dashboard-competition').filter({has:page.locator('.dashboard-state:not(.draft)')}).first();
    const href = await card.getAttribute('href'); await card.scrollIntoViewIfNeeded();
    const rect = await card.boundingBox(); await page.mouse.click(rect.x+rect.width*.55,rect.y+rect.height*.65);
    await expect(page).toHaveURL(href); await settled(page);
    await expect(page.locator('.workspace-dashboard')).toBeVisible();
    await page.getByRole('navigation',{name:'Competition sections',exact:true}).getByRole('link',{name:'Judging',exact:true}).click();
    await expect(page.locator('[data-score-search]')).toBeVisible();
    const controls = await page.locator('input:not([type="checkbox"],[type="radio"],[type="hidden"]),select').evaluateAll(fields => fields.filter(field => field.getClientRects().length).map(field => { const s=getComputedStyle(field);return {name:field.getAttribute('aria-label')||field.name,borderWidth:s.borderTopWidth,borderStyle:s.borderTopStyle,borderColour:s.borderTopColor,radius:s.borderTopLeftRadius,height:s.minHeight}; }));
    writeFileSync(info.outputPath('control-contract.json'),JSON.stringify(controls,null,2));
    expect(new Set(controls.map(field=>`${field.borderWidth}/${field.borderStyle}/${field.borderColour}/${field.radius}/${field.height}`)).size).toBe(1);
    expect(controls[0].borderWidth).toBe('1px');
    await review(page,'organiser-judging-controls',info);
    await page.locator('.competition-context-nav a').first().click(); await settled(page);
    const edit = page.getByRole('link',{name:'Edit details and timeline',exact:true}); await edit.click(); await settled(page);
    await page.getByRole('button',{name:'3 Timeline',exact:true}).click();
    await review(page,'organiser-editor-timeline',info);
    await page.goto('/organiser/competition/socratic-marathon/meetings'); await settled(page);
    await expect(page.locator('[data-meeting-results]')).toContainText('Confirm competition entries before assigning a meeting.');
    await review(page,'organiser-empty-meeting-selection',info);
  }

  await page.goto('/competition/socratic-marathon'); await settled(page);
  const nav = page.getByRole('navigation',{name:'Competition sections',exact:true});
  const labels = await nav.getByRole('link').allTextContents();
  await expect(nav.getByRole('link',{name:'Overview',exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.locator('.banner-caption')).toHaveText('Programming · General STEM');
  if (role === 'participant') {
    await page.goto('/competition/socratic-marathon/register'); await settled(page);
    await expect(page.locator('.registration-person')).toContainText(/· Age \d+/);
    await review(page,'participant-registration',info);
    await page.goto('/competition/socratic-marathon'); await settled(page);
  }
  await nav.getByRole('link',{name:'Leaderboards',exact:true}).click();
  await expect(page).toHaveURL(/\/leaderboard\/final-round$/); await settled(page);
  expect(await page.getByRole('navigation',{name:'Competition sections',exact:true}).getByRole('link').allTextContents()).toEqual(labels);
  await expect(page.getByRole('navigation',{name:'Competition sections',exact:true}).getByRole('link',{name:'Leaderboards',exact:true})).toHaveAttribute('aria-current','page');
  await review(page,`${role}-leaderboard`,info);
  await page.setViewportSize({width:390,height:844}); await page.reload(); await settled(page);
  await page.locator('[data-menu]').click();
  await expect(page.getByRole('navigation',{name:'Mobile',exact:true}).getByRole('link').first()).toHaveText('Dashboard');
  await page.keyboard.press('Escape');
  await review(page,`${role}-mobile-navigation`,info);
  await expect(page.getByLabel('Competition section',{exact:true})).toHaveValue('/competition/socratic-marathon/leaderboard');
  await page.getByLabel('Competition section',{exact:true}).selectOption('/competition/socratic-marathon');
  await expect(page).toHaveURL('/competition/socratic-marathon'); await settled(page);
  await expect(page.getByLabel('Competition section',{exact:true})).toHaveValue('/competition/socratic-marathon');
  for (const width of [320,768,900]) {
    await page.setViewportSize({width,height:768});
    await expect(page.locator('.header a.brand')).toBeVisible();
    if (width <= 820) await expect(page.locator('[data-menu]')).toBeVisible();
    else await expect(page.locator('.account-menu summary')).toBeVisible();
    await review(page,`${role}-reflow-${width}`,info);
  }
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});

test('offline shell keeps theme, logo access and clear recovery', async ({ page }, info) => {
  for (const theme of ['light','dark']) {
    await page.addInitScript(theme=>localStorage.setItem('vertex-theme',theme),theme);
    await page.goto('/offline.html');
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    await expect(page.getByRole('link',{name:'Vertex home',exact:true})).toHaveAttribute('href','/');
    await page.setViewportSize({width:320,height:700});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({path:info.outputPath(`offline-${theme}.png`),fullPage:true});
    await page.getByRole('button',{name:'Try again',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Your connection will catch up.'})).toBeVisible();
  }
});

test('failed application import shows actionable startup recovery', async ({ page }, info) => {
  await page.route('**/js/app.js',route=>route.abort('internetdisconnected'));
  await page.goto('/login');
  await expect(page.locator('#vertex-splash')).toHaveAttribute('role','alert');
  await expect(page.getByRole('heading',{name:'Vertex could not open.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeFocused();
  await page.screenshot({path:info.outputPath('startup-connection-error.png')});
  await page.unroute('**/js/app.js');
  await page.getByRole('button',{name:'Try again',exact:true}).click(); await settled(page);
  await expect(page.getByLabel('Email address')).toBeVisible();
});

test('splash reflects genuine boot and respects reduced motion', async ({ page },info) => {
  let release;
  const boot = new Promise(resolve => { release=resolve; });
  await page.route('**/js/app.js', async route => { await boot; return route.continue(); });
  await page.goto('/',{waitUntil:'commit'});
  await expect(page.locator('.splash-brand')).toBeVisible();
  await expect(page.locator('.splash-path')).toBeVisible();
  await page.screenshot({path:info.outputPath('splash-light.png')});
  await page.evaluate(() => document.documentElement.dataset.theme='dark');
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.locator('.summit-line').evaluate(node=>getComputedStyle(node).animationName)).toBe('none');
  await page.screenshot({path:info.outputPath('splash-dark-reduced.png')});
  release(); await settled(page);
  await expect(page.getByRole('heading',{name:'Find your next challenge.'})).toBeVisible();
});
