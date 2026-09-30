import { test, expect } from './helpers/test.js';
import { createAccount, sessionCredentials } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

async function anotherPage(browser, width = 1366) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 768 } });
  const module = `${readFileSync('.test-data/supabase-js-2.117.1.umd.js', 'utf8')}\nexport const createClient = supabase.createClient;`;
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm', route => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: module }));
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  return context.newPage();
}

test('Milestone 16 scheduled results, category awards, history, and notifications', async ({ page, browser, request }, info) => {
  test.setTimeout(600000);
  const owner = await createAccount(page, 'organiser', 'm16');
  const ownerSession = await sessionCredentials(page);
  const participantPages = [];
  const participants = [];
  for (let i = 0; i < 4; i++) {
    const p = await anotherPage(browser);
    const account = await createAccount(p, 'participant', 'm16');
    participantPages.push(p); participants.push({ ...account, ...await sessionCredentials(p) });
  }
  const captainPage = await anotherPage(browser);
  const captain = { ...await createAccount(captainPage, 'participant', 'm16'), ...await sessionCredentials(captainPage) };
  const memberPage = await anotherPage(browser);
  const member = { ...await createAccount(memberPage, 'participant', 'm16'), ...await sessionCredentials(memberPage) };
  const id = randomUUID(), first = randomUUID(), second = randomUUID(), slug = `m16-${owner.username.replaceAll('_','-')}`;
  writeFileSync('.test-data/m16-fixture.json', JSON.stringify({ ids: [ownerSession.userId,...participants.map(p=>p.userId),captain.userId,member.userId], competition:id, slug },null,2));
  const root = `${ownerSession.SUPABASE_PROJECT_URL}/rest/v1`;
  const headers = token => ({ apikey: ownerSession.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const rpc = async (token,name,data) => { const response = await request.post(`${root}/rpc/${name}`,{headers:headers(token),data}); expect(response.ok(),await response.text()).toBeTruthy(); return response.json().catch(()=>null); };
  const now = Date.now(), when = seconds => new Date(now + seconds*1000).toISOString();
  const local = value => { const d=new Date(value); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); };
  const choose = async (form, name) => form.locator('select').selectOption(await form.locator('option').filter({hasText:name}).getAttribute('value'));
  await rpc(ownerSession.token,'save_competition',{details:{
    id,slug,name:`Vertex M16 ${owner.username}`,status:'published',field_tags:['design'],prize_details:'Recognition.',
    description:'Milestone 16 acceptance fixture.',minimum_age:12,maximum_age:25,
    team_mode:'both',minimum_team_size:2,maximum_team_size:3,categories:['Junior','Senior'],structure:'custom',
    banner_kind:'colour',banner_colour:'#2563eb',banner_colour_end:'#0b1120',banner_path:null,
    certificate_status:'not_planned',registration_opens_at:when(-600),registration_closes_at:when(28),starts_at:when(29)
  },rounds:[
    {id:first,name:'Qualifier',slug:'qualifier',sequence:1,advancement_count:3,opens_at:when(30),submission_deadline:when(48),leaderboard_releases_at:when(120)},
    {id:second,name:'Final',slug:'final',sequence:2,advancement_count:2,opens_at:when(121),submission_deadline:when(122),leaderboard_releases_at:when(180)}
  ]});
  for (let i=0;i<participants.length;i++) await rpc(participants[i].token,'register_individual',{target_competition_id:id,chosen_category:i===1 || i===3?'Senior':'Junior'});
  const team=await rpc(captain.token,'create_competition_team',{target_competition_id:id,team_name:`M16 Team ${captain.username}`});
  const invite=await rpc(captain.token,'invite_competition_team_member',{target_team_id:team.id,target_username:member.username});
  await rpc(member.token,'respond_competition_team_invitation',{target_invitation_id:invite.id,accept_invitation:true});
  await rpc(captain.token,'register_competition_team',{target_team_id:team.id,chosen_category:'Junior'});
  const criterion=await rpc(ownerSession.token,'save_scoring_criterion',{target_round_id:first,target_criterion_id:null,criterion_name:'Total',criterion_max:100,criterion_description:'Judged work'});
  const marks=async (roundId,criterionId,participantId,teamId,value) => rpc(ownerSession.token,'save_round_scores',{target_round_id:roundId,target_participant_id:participantId,target_team_id:teamId,score_items:[{criterion_id:criterionId,marks:value}]});
  for(let i=0;i<participants.length;i++) await marks(first,criterion.id,participants[i].userId,null,[100,95,90,80][i]);
  await marks(first,criterion.id,null,team.id,85);
  await rpc(ownerSession.token,'finalise_round_advancement',{target_round_id:first});
  const managerPath=`/organiser/competition/${slug}/leaderboards`;
  const publicFirst=`/competition/${slug}/leaderboard/qualifier`;
  await page.goto(`/organiser/competition/${slug}/workspace`);
  await page.getByRole('link',{name:'Manage leaderboards'}).click();
  await expect(page.getByRole('heading',{name:'Release the result.'})).toBeVisible();
  await expect(page.locator('.leaderboard-entry')).toHaveCount(5);
  await expect(page.locator('.leaderboard-podium-card')).toHaveCount(3);
  await expect(page.locator('[data-category-form]')).toHaveCount(2);
  await page.locator('[data-leaderboard-search] input').fill(team.name);
  await page.getByRole('button',{name:'Search'}).click();
  await expect(page.locator('.leaderboard-entry')).toHaveCount(1);
  await expect(page.locator('.leaderboard-entry')).toContainText(team.name);
  await page.locator('[data-leaderboard-search] input').fill('');
  await page.getByRole('button',{name:'Search'}).click();
  await expect(page.locator('.leaderboard-entry')).toHaveCount(5);
  const junior=page.locator('[data-category-form="Junior"]');
  await choose(junior,participants[0].name);
  await junior.getByRole('button',{name:'Save winner'}).click();
  const senior=page.locator('[data-category-form="Senior"]');
  await choose(senior,participants[1].name);
  await senior.getByRole('button',{name:'Save winner'}).click();
  await expect(page.getByRole('button',{name:'Schedule release'})).toBeEnabled();
  await page.screenshot({path:info.outputPath('m16-organiser-preview-desktop.png'),fullPage:true});
  await page.locator('[name=release_at]').fill(local(when(120)));
  await page.getByRole('button',{name:'Schedule release'}).click();
  await expect(page.locator('.leaderboard-state')).toHaveText('Scheduled');
  const participantPage=participantPages[0];
  await participantPage.goto(publicFirst);
  await expect(participantPage.locator('[data-countdown]')).toBeVisible();
  await expect(participantPage.locator('.leaderboard-entry')).toHaveCount(0);
  await participantPages[1].goto(publicFirst);
  await expect(participantPages[1].locator('[data-countdown]')).toBeVisible();
  await participantPage.screenshot({path:info.outputPath('m16-countdown-desktop.png'),fullPage:true});
  await participantPage.goto(`/competition/${slug}/progress`);
  await expect(participantPage.locator('.progress-step').first()).toContainText('Awaiting result');
  await participantPage.goto('/dashboard');
  await expect.poll(async () => {
    const response=await request.get(`${root}/competition_rounds?select=leaderboard_state&id=eq.${first}`,{headers:headers(participants[0].token)});
    return (await response.json())[0]?.leaderboard_state;
  },{timeout:150000,intervals:[3000,5000,5000]}).toBe('published');
  await expect(participantPages[1].locator('.leaderboard-entry')).toHaveCount(5);
  await participantPage.goto(publicFirst);
  await expect(participantPage.locator('.leaderboard-entry')).toHaveCount(5);
  await expect(participantPage.locator('.leaderboard-podium-card')).toHaveCount(3);
  await expect(participantPage.locator('.leaderboard-entry-score')).toHaveCount(0);
  await expect(participantPage.locator('.leaderboard-award-grid article')).toHaveCount(2);
  await expect(participantPage.locator('.leaderboard-own-result')).toContainText('You advanced');
  await participantPage.reload();
  await expect(participantPage.locator('.leaderboard-entry')).toHaveCount(5);
  await participantPage.goto(`/competition/${slug}/progress`);
  await expect(participantPage.locator('.progress-step').first()).toContainText('Advanced');
  const notifications=await request.get(`${root}/notifications?select=kind,link_path&recipient_id=eq.${participants[0].userId}&kind=eq.leaderboard_published`,{headers:headers(participants[0].token)});
  expect((await notifications.json()).some(item=>item.link_path===publicFirst)).toBe(true);
  await participantPages[3].goto(publicFirst);
  await expect(participantPages[3].locator('.leaderboard-own-result')).toContainText('Your run ended here');
  await memberPage.goto(publicFirst);
  await expect(memberPage.locator('.leaderboard-own-result')).toContainText('Your run ended here');
  const finalCriterion=await rpc(ownerSession.token,'save_scoring_criterion',{target_round_id:second,target_criterion_id:null,criterion_name:'Final total',criterion_max:100,criterion_description:''});
  for(let i=0;i<3;i++) await marks(second,finalCriterion.id,participants[i].userId,null,[99,98,97][i]);
  await rpc(ownerSession.token,'finalise_round_advancement',{target_round_id:second});
  await page.goto(`${managerPath}?round=final`);
  await expect(page.locator('.leaderboard-entry')).toHaveCount(3);
  await choose(page.locator('[data-category-form="Junior"]'),participants[0].name);
  await page.locator('[data-category-form="Junior"] button').click();
  await choose(page.locator('[data-category-form="Senior"]'),participants[1].name);
  await page.locator('[data-category-form="Senior"] button').click();
  await expect(page.getByRole('button',{name:'Publish now'})).toBeEnabled();
  await expect.poll(() => Date.now() > Date.parse(when(122)), { timeout: 150000 }).toBe(true);
  await page.locator('[name=show_scores]').check();
  await expect(page.locator('[name=show_scores]')).toBeChecked();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Publish now'}).click();
  await expect(page.locator('.leaderboard-state')).toHaveText('Published');
  await participantPage.goto(`/competition/${slug}/leaderboard/final`);
  await expect(participantPage.locator('.leaderboard-entry-score')).toHaveCount(3);
  await expect(participantPage.locator('.leaderboard-own-result')).toContainText('You won');
  await participantPage.setViewportSize({width:320,height:700});
  await participantPage.screenshot({path:info.outputPath('m16-final-mobile.png'),fullPage:true});
  expect(await participantPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await participantPage.goto(publicFirst);
  await expect(participantPage.locator('.leaderboard-entry')).toHaveCount(5);
  await expect(participantPage.locator('.leaderboard-entry-score')).toHaveCount(0);
  await participantPages[2].goto(`${managerPath}?round=final`);
  await expect(participantPages[2].getByRole('heading',{name:'Leaderboards unavailable.'})).toBeVisible();
  const anonymous=await anotherPage(browser,390);
  await anonymous.goto(publicFirst);
  await expect(anonymous.locator('.leaderboard-entry')).toHaveCount(5);
  await anonymous.reload();
  await expect(anonymous.locator('.leaderboard-entry')).toHaveCount(5);
  const savedCompetition = (await (await request.get(`${root}/competitions?select=*&id=eq.${id}`, { headers: headers(ownerSession.token) })).json())[0];
  const savedRounds = await (await request.get(`${root}/competition_rounds?select=*&competition_id=eq.${id}&order=sequence`, { headers: headers(ownerSession.token) })).json();
  const roundKeys = ['id','name','slug','sequence','advancement_count','opens_at','submission_deadline','judging_opens_at','judging_closes_at','leaderboard_releases_at'];
  await rpc(ownerSession.token, 'save_competition', {
    details: { ...savedCompetition, name: `${savedCompetition.name} updated` },
    rounds: savedRounds.map(round => Object.fromEntries(roundKeys.map(key => [key, round[key]]))),
    expected_version: savedCompetition.version
  });
  await page.goto(`/competition/${slug}`);
  await expect(page.getByRole('heading', { name: `${savedCompetition.name} updated` })).toBeVisible();
  await anonymous.close();
  for(const p of participantPages) await p.close();
  await captainPage.close(); await memberPage.close();
});
