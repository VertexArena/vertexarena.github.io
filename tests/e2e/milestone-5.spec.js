import { test, expect } from './helpers/test.js';
import { createAccount, sessionCredentials } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';

test('public discovery, filters, preview, participant bookmarks and eligibility', async ({ page, browser, request }, info) => {
  test.setTimeout(300000);
  const organiser = await createAccount(page, 'organiser', 'm5');
  const access = await sessionCredentials(page);
  const headers = { apikey: access.SUPABASE_ANON_KEY, Authorization: `Bearer ${access.token}`, 'content-type': 'application/json' };
  const marker = organiser.username.replaceAll('_', '-');
  const slugs = [], competitionIds = [];
  for (let i = 0; i < 15; i++) {
    const id = randomUUID(), roundId = randomUUID();
    const isTarget = i === 0;
    const slug = `m5-${marker}-${i}`;
    slugs.push(slug);
    competitionIds.push(id);
    const details = {
      id, name: `${isTarget ? 'Astral Design Quest' : `Student Challenge ${String(i).padStart(2, '0')}`} ${marker}`,
      slug, status: 'published', field_tags: [isTarget ? 'design' : i % 2 ? 'mathematics' : 'programming'],
      prize_details: 'Certificate and book for outstanding entries.', description: 'Explore a student challenge, develop your idea, and present a thoughtful result.',
      minimum_age: isTarget ? 18 : 12, maximum_age: 25, team_mode: isTarget ? 'team' : i % 2 ? 'individual' : 'both',
      minimum_team_size: isTarget ? 2 : i % 2 ? null : 2, maximum_team_size: isTarget ? 4 : i % 2 ? null : 4,
      categories: [], structure: 'direct3', banner_kind: 'colour', banner_colour: '#2563eb', banner_colour_end: '#0b1120', banner_path: null,
      certificate_status: 'not_planned', registration_opens_at: '2027-01-01T09:00:00Z', registration_closes_at: `2027-02-${String(i + 1).padStart(2, '0')}T09:00:00Z`, starts_at: '2027-02-20T09:00:00Z'
    };
    const rounds = [{ id: roundId, name: 'Final round', slug: 'final-round', sequence: 1, advancement_count: 3, opens_at: '2027-02-21T09:00:00Z', submission_deadline: '2027-02-22T09:00:00Z', leaderboard_releases_at: '2027-02-23T09:00:00Z' }];
    const response = await request.post(`${access.SUPABASE_PROJECT_URL}/rest/v1/rpc/save_competition`, { headers, data: { details, rounds } });
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  const publicPage = await browser.newPage({ viewport: info.project.name.includes('mobile') ? { width: 390, height: 844 } : { width: 1366, height: 768 } });
  await publicPage.goto('/discover');
  await expect(publicPage.getByRole('heading', { name: 'Find your next challenge.' })).toBeVisible();
  await publicPage.getByRole('searchbox', { name: 'Search competitions by name' }).fill(marker);
  await expect(publicPage.locator('[data-discovery-count]')).toHaveText('15 competitions');
  await expect(publicPage.locator('.discovery-card')).toHaveCount(12);
  await publicPage.getByLabel('Sort by').selectOption('latest');
  await expect(publicPage.locator('.discovery-card').first()).toContainText('Student Challenge 14');
  await publicPage.getByLabel('Sort by').selectOption('soonest');
  await expect(publicPage.locator('.discovery-card').first()).toContainText('Astral Design Quest');
  await expect(publicPage.getByRole('link', { name: 'Next' })).toBeVisible();
  await publicPage.getByRole('link', { name: 'Next' }).click();
  await expect(publicPage.locator('.discovery-card')).toHaveCount(3);
  await publicPage.reload();
  await expect(publicPage.locator('.discovery-card')).toHaveCount(3);
  await publicPage.getByRole('searchbox', { name: 'Search competitions by name' }).fill(`Astral Design Quest ${marker}`);
  await expect(publicPage.locator('[data-discovery-count]')).toHaveText('1 competition');
  await expect(publicPage.locator('.discovery-card')).toHaveCount(1);
  await publicPage.getByRole('checkbox', { name: 'design' }).check();
  await publicPage.getByLabel('Entry format').selectOption('team');
  await expect(publicPage.locator('.discovery-card')).toHaveCount(1);
  await publicPage.getByRole('button', { name: 'Quick preview' }).click();
  await expect(publicPage.getByRole('dialog')).toContainText('Certificate and book');
  await publicPage.getByRole('dialog').getByRole('link', { name: 'Read full details' }).click();
  await expect(publicPage).toHaveURL(new RegExp(`/competition/${slugs[0]}$`));
  await expect(publicPage.locator('.competition-public h1')).toContainText('Astral Design Quest');
  await publicPage.reload();
  await expect(publicPage.locator('.competition-public h1')).toContainText('Astral Design Quest');
  await expect(publicPage.locator('#vertex-splash')).toHaveCount(0);
  await publicPage.screenshot({ path: `test-results/m5-public-${info.project.name}.png`, fullPage: true });
  await publicPage.close();

  const participantPage = await browser.newPage({ viewport: info.project.name.includes('mobile') ? { width: 390, height: 844 } : { width: 1366, height: 768 } });
  const participant = await createAccount(participantPage, 'participant', 'm5');
  const participantAccess = await sessionCredentials(participantPage);
  mkdirSync('.test-data', { recursive: true });
  appendFileSync('.test-data/accounts.ndjson', JSON.stringify({ id: participantAccess.userId, email: participant.email }) + '\n');
  const bookmarkEndpoint = `${access.SUPABASE_PROJECT_URL}/rest/v1/competition_bookmarks`;
  const organiserDenied = await request.post(bookmarkEndpoint, { headers, data: { participant_id: access.userId, competition_id: competitionIds[0] } });
  expect(organiserDenied.ok()).toBeFalsy();
  const participantHeaders = { apikey: access.SUPABASE_ANON_KEY, Authorization: `Bearer ${participantAccess.token}`, 'content-type': 'application/json' };
  const foreignDenied = await request.post(bookmarkEndpoint, { headers: participantHeaders, data: { participant_id: access.userId, competition_id: competitionIds[0] } });
  expect(foreignDenied.ok()).toBeFalsy();
  await participantPage.goto(`/competition/${slugs[0]}`);
  await expect(participantPage.getByText(/requires age 18 or older/)).toBeVisible();
  await participantPage.getByRole('button', { name: /Save Astral Design Quest.*to bookmarks/ }).click();
  await expect(participantPage.getByRole('button', { name: /Remove Astral Design Quest.*from bookmarks/ })).toBeVisible();
  await participantPage.reload();
  await expect(participantPage.getByRole('button', { name: /Remove Astral Design Quest.*from bookmarks/ })).toBeVisible();
  await participantPage.goto('/discover?saved=1');
  await expect(participantPage.locator('.discovery-card')).toHaveCount(1);
  await expect(participantPage.getByText(/requires age 18 or older/)).toBeVisible();
  const privateRead = await request.get(`${bookmarkEndpoint}?select=competition_id`, { headers });
  expect(privateRead.ok()).toBeTruthy();
  expect(await privateRead.json()).toEqual([]);
  await expect(participantPage.locator('#vertex-splash')).toHaveCount(0);
  await participantPage.screenshot({ path: `test-results/m5-participant-${info.project.name}.png`, fullPage: true });
  await participantPage.getByRole('button', { name: /Remove Astral Design Quest.*from bookmarks/ }).click();
  await expect(participantPage.getByText('No saved competitions yet.')).toBeVisible();
  await participantPage.close();
});

test('discovery empty state remains clear in dark and reduced-motion modes', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/discover?q=vertex-no-matching-competition-2099');
  await expect(page.getByRole('heading', { name: 'No competitions match.' })).toBeVisible();
  await page.getByRole('switch', { name: /Switch to dark mode/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#vertex-splash')).toHaveCount(0);
  expect(await page.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await page.screenshot({ path: `test-results/m5-empty-dark-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('heading', { name: 'Find your next challenge.' })).toBeVisible();
});
