import { test, expect, anotherPage } from './helpers/test.js';
import { createAccount, sessionCredentials, login } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';

const card = (view, code) => view.locator(`[data-achievement="${code}"]`);
test('authoritative achievements, progress, team inheritance, private sharing and published awards', async ({ page, browser, request }, info) => {
  test.setTimeout(540000);
  const ownerAccount = await createAccount(page, 'organiser', 'm19');
  const owner = await sessionCredentials(page);
  async function participant() {
    const view = await anotherPage(browser);
    const account = await createAccount(view, 'participant', 'm19');
    const access = await sessionCredentials(view);
    mkdirSync('.test-data', { recursive: true });
    appendFileSync('.test-data/accounts.ndjson', JSON.stringify({ id: access.userId, email: account.email }) + '\n');
    return { view, ...account, ...access };
  }
  const person = await participant(), captain = await participant(), member = await participant(), outsider = await participant();
  const observer = await anotherPage(browser);
  await login(observer, person, `/profile/@${person.username}`);
  await expect(observer.locator('.achievement-card')).toHaveCount(13);
  await expect(observer.locator('.achievement-start')).toContainText('Your first milestone awaits');
  await expect(card(observer, 'five_competitions').getByRole('progressbar')).toHaveAttribute('value', '0');
  const endpoint = `${owner.SUPABASE_PROJECT_URL}/rest/v1`;
  const headers = token => ({ apikey: owner.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const rpc = async (token, name, data = {}) => { const r = await request.post(`${endpoint}/rpc/${name}`, { headers: headers(token), data }); expect(r.ok(), await r.text()).toBe(true); return r.json(); };
  const now = Date.now(), when = seconds => new Date(now + seconds * 1000).toISOString();
  // Match the minute precision of the application's datetime-local controls.
  const opens = Math.ceil((now + 182000) / 60000) * 60000, deadline = opens + 120000;
  const at = value => new Date(value).toISOString();
  const marker = `m19-${ownerAccount.username.replaceAll('_','-')}`;
  const fixtures = {};
  async function competition(key, field, main = false) {
    const id = randomUUID(), slug = `${marker}-${key}`, first = randomUUID(), final = randomUUID();
    const details = { id,slug,name:`Vertex M19 ${key} ${marker}`,status:'published',field_tags:[field],
      prize_details:'Recognition for thoughtful work.',description:'A competition for verified participant milestones.',
      minimum_age:12,maximum_age:25,team_mode:main?'both':'individual',minimum_team_size:main?2:null,maximum_team_size:main?3:null,
      categories:main?['Junior','Senior']:[],structure:main?'custom':'direct3',banner_kind:'colour',banner_colour:'#2563eb',
      banner_colour_end:'#0b1120',banner_path:null,certificate_status:'not_planned',
      registration_opens_at:when(-600),registration_closes_at:when(main?180:86400),starts_at:when(main?181:86401) };
    const rounds = main ? [
      {id:first,name:'Qualifier',slug:'qualifier',sequence:1,advancement_count:3,opens_at:at(opens),submission_deadline:at(deadline),leaderboard_releases_at:at(deadline+1000)},
      {id:final,name:'Final',slug:'final',sequence:2,advancement_count:1,opens_at:at(deadline+2000),submission_deadline:at(deadline+3000),leaderboard_releases_at:at(deadline+60000)}
    ] : [{id:first,name:'Final',slug:'final',sequence:1,advancement_count:3,opens_at:when(86402),submission_deadline:when(86403),leaderboard_releases_at:when(86404)}];
    await rpc(owner.token,'save_competition',{details,rounds});
    return fixtures[key] = {id,slug,first,final};
  }
  const main = await competition('main','programming',true);
  await competition('biology','biology'); await competition('design','design');
  await person.view.goto(`/competition/${main.slug}/register`);
  await person.view.getByLabel('Competition category').selectOption('Junior');
  await person.view.getByRole('button',{name:'Confirm registration'}).click();
  await expect(person.view.getByRole('heading',{name:"You're registered."})).toBeVisible();
  await expect(card(observer,'first_competition')).toHaveClass(/is-earned/);
  await expect(observer.locator('[data-achievement-feedback]')).toContainText('First competition');
  await expect(card(observer,'first_individual')).toHaveClass(/is-earned/);
  await expect(card(observer,'five_competitions').getByRole('progressbar')).toHaveAttribute('value','1');
  await observer.getByRole('checkbox',{name:'Show earned achievements on my public profile'}).focus();
  for (const key of ['biology','design']) {
    await person.view.goto(`/competition/${fixtures[key].slug}/register`);
    await person.view.getByRole('button',{name:'Confirm registration'}).click();
    await expect(person.view.getByRole('heading',{name:"You're registered."})).toBeVisible();
  }
  await expect(card(observer,'three_competitions')).toHaveClass(/is-earned/);
  await expect(card(observer,'field_explorer')).toHaveClass(/is-earned/);
  await expect(observer.getByRole('checkbox',{name:'Show earned achievements on my public profile'})).toBeFocused();
  await expect(card(observer,'five_competitions').getByRole('progressbar')).toHaveAttribute('value','3');
  await expect(card(observer,'ten_competitions').getByRole('progressbar')).toHaveAttribute('max','10');
  await person.view.goto('/dashboard');
  await expect(person.view.locator('.achievement-compact .achievement-card')).toHaveCount(3);
  await person.view.locator('.achievement-compact').screenshot({path:info.outputPath('achievements-dashboard.png')});
  await person.view.getByRole('link',{name:'View all achievements'}).click();
  await expect(person.view).toHaveURL(new RegExp(`/profile/@${person.username}$`));
  await expect(person.view.locator('.achievement-card')).toHaveCount(13);
  await person.view.reload();
  await expect(card(person.view,'first_competition')).toHaveClass(/is-earned/);

  const teamPath = `/competition/${main.slug}/team`;
  await captain.view.goto(teamPath);
  await captain.view.getByLabel('Team name').fill(`M19 Team ${captain.username}`);
  await captain.view.getByRole('button',{name:'Create team'}).click();
  await captain.view.getByLabel('Participant username').fill(`@${member.username}`);
  await captain.view.locator('[data-team-suggestion]').filter({hasText:member.username}).click();
  await captain.view.getByRole('button',{name:'Send invitation'}).click();
  await expect(captain.view.locator('[data-team-status]')).toContainText('Invitation sent.');
  await member.view.goto(teamPath);
  await member.view.getByRole('button',{name:'Accept invitation'}).click();
  await expect(member.view.locator('[data-team-status]')).toContainText('Invitation accepted.');
  await member.view.goto(`/profile/@${member.username}`);
  await expect(card(member.view,'first_team')).not.toHaveClass(/is-earned/);
  // The filled invitation input deliberately defers live roster refreshes.
  await captain.view.getByRole('button',{name:'Refresh team'}).click();
  await expect(captain.view.locator('.team-capacity')).toContainText('2 / 3');
  await captain.view.getByLabel('Competition category').selectOption('Senior');
  await captain.view.getByRole('button',{name:'Register team'}).click();
  await expect(captain.view.getByRole('heading',{name:"You're registered together."})).toBeVisible();
  await expect(card(member.view,'first_team')).toHaveClass(/is-earned/);
  await expect(card(member.view,'first_competition')).toHaveClass(/is-earned/);

  const guest = await anotherPage(browser,390);
  await guest.goto(`/profile/@${person.username}`);
  await expect(guest.locator('[data-achievements]')).toBeHidden();
  const anonymousAwards = await request.get(`${endpoint}/participant_achievements?participant_id=eq.${person.userId}`,{headers:headers(owner.SUPABASE_ANON_KEY)});
  expect(await anonymousAwards.json()).toEqual([]);
  await person.view.getByRole('checkbox',{name:'Show earned achievements on my public profile'}).check();
  await expect(person.view.locator('[data-achievement-feedback]')).toContainText('now visible');
  await guest.reload();
  await expect(guest.locator('.achievement-card')).toHaveCount(4);
  await expect(guest.getByRole('progressbar')).toHaveCount(0);
  await expect(guest.getByRole('checkbox',{name:'Show earned achievements on my public profile'})).toHaveCount(0);

  // No participant writes to award definitions, awards, counts or receipts.
  for (const [table,data] of [
    ['participant_achievements',{participant_id:person.userId,achievement_code:'winner',earned_at:when(-100)}],
    ['participant_achievement_progress',{participant_id:person.userId,counts:{winner:100}}],
    ['achievement_definitions',{code:'fake',title:'Fake',description:'Fake',metric:'winner',target:1,icon:'trophy',position:99}]
  ]) {
    const denied = await request.post(`${endpoint}/${table}`,{headers:headers(person.token),data});
    expect(denied.ok()).toBe(false);
    const mutation = await request.patch(`${endpoint}/${table}`,{headers:headers(person.token),data});
    expect(mutation.ok()).toBe(false);
    const deletion = await request.delete(`${endpoint}/${table}`,{headers:headers(person.token)});
    expect(deletion.ok()).toBe(false);
  }
  const foreignProgress = await request.get(`${endpoint}/participant_achievement_progress?participant_id=eq.${person.userId}`,{headers:headers(outsider.token)});
  expect(await foreignProgress.json()).toEqual([]);
  const spoof = await request.post(`${endpoint}/rpc/my_achievements`,{headers:headers(outsider.token),data:{participant_id:person.userId}});
  expect(spoof.ok()).toBe(false);
  const privateWrite = await request.post(`${endpoint}/rpc/record_achievement_event`,{headers:headers(person.token),data:{target_actor:person.userId}});
  expect(privateWrite.ok()).toBe(false);
  const organiserDenied = await request.post(`${endpoint}/rpc/my_achievements`,{headers:headers(owner.token),data:{}});
  expect(organiserDenied.ok()).toBe(false);

  await page.goto(`/organiser/competition/${main.slug}/submissions`);
  await page.getByLabel('Accept submissions for this round').check();
  await page.locator('input[name="mode"][value="link"]').check();
  await page.getByRole('button',{name:'Save round rules'}).click();
  await expect(page.locator('[data-config-status]')).toContainText('Round rules saved.');
  await expect.poll(()=>Date.now(),{timeout:300000,intervals:[1000]}).toBeGreaterThan(opens);
  for (const actor of [person,captain]) {
    await actor.view.goto(`/competition/${main.slug}/submissions/qualifier`);
    await actor.view.locator('[data-submission-links]').fill(`https://example.org/m19-${actor.username}`);
    await actor.view.getByRole('button',{name:'Confirm submission'}).click();
    await expect(actor.view.getByText(/Submission confirmed\. Your entry/)).toBeVisible();
  }
  await expect(card(observer,'first_submission')).toHaveClass(/is-earned/);
  await expect(card(member.view,'first_submission')).toHaveClass(/is-earned/);
  await expect(card(observer,'five_submissions').getByRole('progressbar')).toHaveAttribute('value','1');
  await person.view.locator('[data-submission-links]').fill('https://example.org/m19-revised');
  await person.view.getByRole('button',{name:'Save updated submission'}).click();
  await expect(person.view.locator('.submission-saved')).toContainText('m19-revised');
  const afterEdit = await rpc(person.token,'my_achievements');
  expect(afterEdit.items.find(item=>item.code==='five_submissions').progress).toBe(1);

  async function judge(round, mainMarks, teamMarks) {
    await page.goto(`/organiser/competition/${main.slug}/scoring?round=${round}`);
    await page.locator('[data-criterion-form] [name="name"]').fill('Total');
    await page.getByLabel('Maximum marks').fill('100');
    await page.getByRole('button',{name:'Save criterion'}).click();
    await expect(page.locator('.scoring-criteria-list')).toContainText('Total');
    for (const [name,marks] of [[person.name,mainMarks],[`M19 Team ${captain.username}`,teamMarks]]) {
      const row = page.locator('.scoring-entry').filter({hasText:name});
      await row.getByRole('button',{name:'Enter marks'}).click();
      await row.locator('[data-criterion-id]').fill(String(marks));
      await row.getByRole('button',{name:'Save marks'}).click();
      await expect(row).toHaveClass(/\bcomplete\b/);
    }
    await page.goto(`/organiser/competition/${main.slug}/advancement?round=${round}`);
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Finalise round'}).click();
    await expect(page.getByRole('heading',{name:'Round locked.'})).toBeVisible();
  }
  async function release(round) {
    await page.goto(`/organiser/competition/${main.slug}/leaderboards?round=${round}`);
    for (const category of ['Junior','Senior']) {
      const form=page.locator(`[data-category-form="${category}"]`);
      await form.locator('select').selectOption(await form.locator('option').nth(1).getAttribute('value'));
      await form.getByRole('button',{name:'Save winner'}).click();
      await expect(form.getByRole('button',{name:'Save winner'})).toBeEnabled();
    }
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Publish now'}).click();
    await expect(page.locator('.leaderboard-state')).toHaveText('Published');
  }
  await judge('qualifier',100,90);
  await expect(card(observer,'first_advancement')).not.toHaveClass(/is-earned/);
  await expect(card(observer,'finalist')).not.toHaveClass(/is-earned/);
  await expect(card(observer,'category_winner')).not.toHaveClass(/is-earned/);
  await expect.poll(()=>Date.now(),{timeout:180000,intervals:[1000]}).toBeGreaterThan(deadline);
  await release('qualifier');
  await expect(card(observer,'first_advancement')).toHaveClass(/is-earned/);
  await expect(card(observer,'finalist')).toHaveClass(/is-earned/);
  await expect(card(observer,'category_winner')).toHaveClass(/is-earned/);
  await expect(card(member.view,'first_advancement')).toHaveClass(/is-earned/);
  await judge('final',90,100);
  await expect(card(member.view,'winner')).not.toHaveClass(/is-earned/);
  await release('final');
  await expect(card(member.view,'winner')).toHaveClass(/is-earned/);
  await expect(card(member.view,'category_winner')).toHaveClass(/is-earned/);
  await captain.view.goto(`/profile/@${captain.username}`);
  await expect(card(captain.view,'winner')).toHaveClass(/is-earned/);
  await expect(card(observer,'winner')).not.toHaveClass(/is-earned/);
  await person.view.goto('/notifications');
  await expect(person.view.getByText('Achievement earned: First competition',{exact:true})).toBeVisible();
  const notices=await request.get(`${endpoint}/notifications?kind=eq.achievement_earned&recipient_id=eq.${person.userId}`,{headers:headers(person.token)});
  expect((await notices.json()).filter(row=>row.title==='Achievement earned: First competition')).toHaveLength(1);
  await observer.reload();
  await expect(card(observer,'first_advancement')).toHaveClass(/is-earned/);
  await observer.getByRole('checkbox',{name:'Show earned achievements on my public profile'}).uncheck();
  await expect(observer.locator('[data-achievement-feedback]')).toContainText('now private');
  await guest.reload();
  await expect(guest.locator('[data-achievements]')).toBeHidden();

  // A failed private fetch can be retried without losing the public profile.
  await observer.route('**/rest/v1/rpc/my_achievements',route=>route.abort());
  await observer.reload();
  await expect(observer.getByRole('heading',{name:'Could not load achievements.'})).toBeVisible();
  await expect(observer.getByRole('heading',{name:person.name,exact:true})).toBeVisible();
  await observer.unroute('**/rest/v1/rpc/my_achievements');
  await observer.locator('[data-retry-achievements]').click();
  await expect(observer.locator('.achievement-card')).toHaveCount(13);
  await expect(observer.locator('#vertex-splash')).toHaveCount(0);
  await observer.locator('[data-achievements]').screenshot({path:info.outputPath('achievements-desktop.png')});
  await observer.setViewportSize({width:320,height:844});
  await observer.emulateMedia({reducedMotion:'reduce'});
  await observer.reload();
  await expect(observer.locator('.achievement-card')).toHaveCount(13);
  expect(await observer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await observer.locator('[data-achievements]').screenshot({path:info.outputPath('achievements-mobile.png')});
  await card(observer,'first_competition').screenshot({path:info.outputPath('achievement-mobile-card.png')});
  await observer.getByRole('switch',{name:/Switch to dark mode/}).click();
  await observer.locator('[data-achievements]').screenshot({path:info.outputPath('achievements-mobile-dark.png')});
  await card(observer,'five_competitions').screenshot({path:info.outputPath('achievement-mobile-dark-progress.png')});
  await page.goto(`/profile/@${ownerAccount.username}`);
  await expect(page.locator('[data-achievements]')).toHaveCount(0);
  for (const view of [person.view,captain.view,member.view,outsider.view,observer,guest]) await view.context().close();
});
