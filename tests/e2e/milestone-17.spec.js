import { PDFDocument } from 'pdf-lib';
import { test, expect, anotherPage } from './helpers/test.js';
import { createAccount, sessionCredentials, login } from './helpers/accounts.js';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

test('Milestone 17 private templates, visual editor, eligible dynamic certificates', async ({ page, browser, request }, info) => {
  test.setTimeout(600000); page.setDefaultTimeout(30000);
  const capture=async(p,name)=>{await expect(p.locator('#vertex-splash')).toHaveCount(0);if(await p.locator('.page-head').count())await expect(p.locator('.page-head').first()).toHaveCSS('opacity','1');await p.evaluate(()=>{document.activeElement?.blur();scrollTo({top:0,behavior:'instant'})});await p.screenshot({path:info.outputPath(name),fullPage:true});};
  const owner = await createAccount(page, 'organiser', 'm17'), ownerSession = await sessionCredentials(page);
  const people = [], pages = [];
  for (let i = 0; i < 5; i++) { const p = await anotherPage(browser); pages.push(p); people.push({ ...await createAccount(p, 'participant', 'm17'), ...await sessionCredentials(p) }); }
  const [winner, loser, captain, member, outsider] = people;
  const id = randomUUID(), round = randomUUID(), slug = `m17-${owner.username.replaceAll('_','-')}`;
  writeFileSync('.test-data/m17-fixture.json', JSON.stringify({ ids: [ownerSession.userId,...people.map(p=>p.userId)], competition: id, slug }, null, 2));
  const root = `${ownerSession.SUPABASE_PROJECT_URL}/rest/v1`, headers = token => ({ apikey: ownerSession.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type':'application/json' });
  const rpc = async (token, name, data) => { const r = await request.post(`${root}/rpc/${name}`, { headers: headers(token), data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json().catch(()=>null); };
  const denied = async (token,name,data) => { const r = await request.post(`${root}/rpc/${name}`, { headers: headers(token), data }); expect(r.ok()).toBeFalsy(); return r.json(); };
  const now = Date.now(), when = seconds => new Date(now+seconds*1000).toISOString();
  await rpc(ownerSession.token,'save_competition',{ details: { id,slug,name:`Vertex M17 ${owner.username}`,status:'published',field_tags:['design'],prize_details:'Recognition',description:'Certificate milestone acceptance fixture.',minimum_age:12,maximum_age:25,team_mode:'both',minimum_team_size:2,maximum_team_size:3,categories:['Junior','Senior'],structure:'directx',banner_kind:'colour',banner_colour:'#2563eb',banner_colour_end:'#0b1120',banner_path:null,certificate_status:'planned',registration_opens_at:when(-600),registration_closes_at:when(60),starts_at:when(61) }, rounds: [{ id:round,name:'Final',slug:'final',sequence:1,advancement_count:1,opens_at:when(62),submission_deadline:when(63),leaderboard_releases_at:when(70) }] });
  await rpc(winner.token,'register_individual',{target_competition_id:id,chosen_category:'Junior'});
  await rpc(loser.token,'register_individual',{target_competition_id:id,chosen_category:'Junior'});
  const team = await rpc(captain.token,'create_competition_team',{target_competition_id:id,team_name:`M17 Team ${captain.username}`});
  const invite = await rpc(captain.token,'invite_competition_team_member',{target_team_id:team.id,target_username:member.username});
  await rpc(member.token,'respond_competition_team_invitation',{target_invitation_id:invite.id,accept_invitation:true});
  await rpc(captain.token,'register_competition_team',{target_team_id:team.id,chosen_category:'Senior'});
  await denied(ownerSession.token,'set_certificate_release',{target_competition_id:id,enable_release:true});
  const participantPath = `/competition/${slug}/certificates`, studio = `/organiser/competition/${slug}/certificates`;
  await pages[0].goto(participantPath); await expect(pages[0].getByRole('heading',{name:'Certificates are not released yet.'})).toBeVisible();
  await pages[4].goto(participantPath); await expect(pages[4].getByRole('heading',{name:'Certificates unavailable.'})).toBeVisible();
  const anonymous = await anotherPage(browser,390); await anonymous.goto(participantPath); await expect(anonymous).toHaveURL(/\/login\?returnTo=/);
  await page.goto(`/organiser/competition/${slug}/workspace`); await page.getByRole('link',{name:'Manage certificates'}).click();
  await expect(page.getByRole('button',{name:'Release certificates',exact:true})).toBeDisabled();
  const artwork = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width=1200;canvas.height=850;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1200,850);ctx.strokeStyle='#2563eb';ctx.lineWidth=4;ctx.strokeRect(36,36,1128,778);ctx.fillStyle='#2563eb';ctx.font='bold 18px Arial';ctx.textAlign='center';ctx.fillText('VERTEX  /  STUDENT COMPETITIONS',600,105);ctx.fillStyle='#0f172a';ctx.font='52px Georgia';ctx.fillText('CERTIFICATE',600,165);return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  const upload = async (name,type) => {
    await page.goto(studio); const form=page.locator('[data-certificate-upload]');
    await form.getByLabel('Template name',{exact:true}).fill(name);await form.getByLabel('Award title',{exact:true}).fill(`Certificate of ${name.toLowerCase()}`);await form.locator('[name=template_type]').selectOption(type);await form.getByLabel('Template image',{exact:true}).setInputFiles({name:'certificate.png',mimeType:'image/png',buffer:artwork});await form.getByRole('button',{name:'Upload and edit'}).click();await expect(page).toHaveURL(/\/certificates\/[0-9a-f-]{36}$/);await expect(page.locator('[data-editor-status]')).toHaveText('Artwork ready.');return page.url().split('/').at(-1);
  };
  const add = async (source,y,size=28) => { await page.locator('[data-add-source]').selectOption(source);await page.getByRole('button',{name:'Add field',exact:true}).click();for(const [key,value] of Object.entries({x:150,y,width:900,height:45,size})) {const input=page.locator(`[data-prop=${key}]`);await input.fill(String(value));await input.press('Tab');} };
  const saveReady = async () => {await page.getByLabel('Ready for release').check();await page.getByRole('button',{name:'Save layout',exact:true}).click();await expect(page.locator('[data-editor-status]')).toHaveText('Layout saved.');};
  const participation = await upload('Participation','participation');
  await add('participant_name',270,42);
  const initialX = Number(await page.locator('[data-prop=x]').inputValue());
  const box = await page.locator('.certificate-field-box').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2+12,{steps:5});await page.mouse.up();expect(Number(await page.locator('[data-prop=x]').inputValue())).toBeGreaterThan(initialX);
  const handle=await page.getByRole('button',{name:'Resize selected field',exact:true}).boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2-20,handle.y+handle.height/2+8,{steps:5});await page.mouse.up();expect(Number(await page.locator('[data-prop=width]').inputValue())).toBeLessThan(900);
  await page.locator('.certificate-field-box').focus();const beforeKey=Number(await page.locator('[data-prop=x]').inputValue());await page.keyboard.press('Shift+ArrowRight');expect(Number(await page.locator('[data-prop=x]').inputValue())).toBe(beforeKey+10);
  await page.locator('[data-prop=font]').selectOption('Georgia');await page.locator('[data-prop=colour]').fill('#1d4ed8');await page.locator('[data-prop=colour]').dispatchEvent('change');await page.locator('[data-prop=weight]').selectOption('700');await page.locator('[data-prop=align]').selectOption('left');await page.locator('[data-prop=align]').selectOption('center');
  await add('competition_name',365,27);await add('award_title',205,28);await add('team_name',445);await add('category',500);await add('placement',555);await add('round',610);await add('organisation_name',665);await add('issue_date',730,23);
  await page.locator('[data-sample-name]').selectOption('organiser');await page.getByRole('button',{name:'New sample',exact:true}).click();await saveReady();
  const saved = (await (await request.get(`${root}/certificate_templates?select=*&id=eq.${participation}`,{headers:headers(ownerSession.token)})).json())[0];expect(saved.layout).toHaveLength(9);expect(saved.layout[0].font).toBe('Georgia');expect(saved.layout[0].align).toBe('center');expect(saved.ready).toBe(true);
  await denied(ownerSession.token,'save_certificate_template',{target_competition_id:id,target_template_id:participation,details:{...saved,layout:[{...saved.layout[0],source:'unsafe_source'}]},expected_version:saved.version});
  await page.getByRole('button',{name:'Hide field outlines'}).click();await capture(page,'m17-editor-desktop.png');
  await page.reload();await expect(page.locator('.certificate-field-box')).toHaveCount(9);await expect(page.locator('[data-editor-status]')).toHaveText('Artwork ready.');
  await add('team_name',780,20);page.once('dialog',d=>d.dismiss());await page.getByRole('link',{name:'All templates',exact:true}).click();await expect(page.locator('.certificate-field-box')).toHaveCount(10);const blockedBack=new Promise(resolve=>page.once('dialog',async d=>{await d.dismiss();resolve();}));await page.evaluate(()=>history.back());await blockedBack;await expect.poll(()=>page.url().endsWith('/certificates/'+participation)).toBe(true);await expect(page.locator('.certificate-field-box')).toHaveCount(10);await page.getByRole('button',{name:'Remove field',exact:true}).click();await page.getByRole('button',{name:'Save layout',exact:true}).click();await expect(page.locator('[data-editor-status]')).toHaveText('Layout saved.');
  await page.setViewportSize({width:320,height:700});await capture(page,'m17-editor-mobile.png');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.setViewportSize({width:1366,height:768});
  // A discarded replacement is removed; a saved replacement removes the old artwork.
  await page.locator('[data-replace-artwork]').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:artwork});await expect(page.locator('[data-editor-status]')).toHaveText('Artwork replaced. Save layout to keep it.');await page.getByRole('button',{name:'Save layout',exact:true}).click();await expect(page.locator('[data-editor-status]')).toHaveText('Layout saved.');
  await page.locator('[data-replace-artwork]').setInputFiles({name:'discarded.png',mimeType:'image/png',buffer:artwork});await expect(page.locator('[data-editor-status]')).toHaveText('Artwork replaced. Save layout to keep it.');page.once('dialog',d=>d.accept());await page.getByRole('link',{name:'All templates',exact:true}).click();await expect(page.locator('.certificate-template-card')).toHaveCount(1);
  const winnerTemplate = await upload('Winner','winner');await add('participant_name',270,40);await add('competition_name',365);await add('award_title',205);await saveReady();
  const categoryTemplate = await upload('Category winner','category_winner');await add('participant_name',270,40);await add('team_name',365);await add('category',445);await add('award_title',205);await saveReady();
  const criterion = await rpc(ownerSession.token,'save_scoring_criterion',{target_round_id:round,target_criterion_id:null,criterion_name:'Judged work',criterion_max:100,criterion_description:''});
  for (const [participantId,teamId,marks] of [[winner.userId,null,100],[loser.userId,null,70],[null,team.id,90]]) await rpc(ownerSession.token,'save_round_scores',{target_round_id:round,target_participant_id:participantId,target_team_id:teamId,score_items:[{criterion_id:criterion.id,marks}]});
  await rpc(ownerSession.token,'finalise_round_advancement',{target_round_id:round});
  await page.goto(`/organiser/competition/${slug}/leaderboards`);
  const selectWinner = async (category,name) => {const form=page.locator(`[data-category-form="${category}"]`);await form.locator('select').selectOption(await form.locator('option').filter({hasText:name}).getAttribute('value'));await form.getByRole('button',{name:'Save winner'}).click();};
  await selectWinner('Junior',winner.name);await selectWinner('Senior',team.name);
  await expect.poll(()=>Date.now()>Date.parse(when(63)),{timeout:80000}).toBe(true);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Publish now',exact:true}).click();await expect(page.locator('.leaderboard-state')).toHaveText('Published');
  await page.goto(studio);await expect(page.locator('.certificate-template-card')).toHaveCount(3);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Release certificates',exact:true}).click();await expect(page.getByRole('heading',{name:'Certificates released.'})).toBeVisible();
  await capture(page,'m17-studio-desktop.png');
  await page.getByRole('link',{name:'View layout'}).first().click();await expect(page.getByRole('button',{name:'Save layout',exact:true})).toBeDisabled();
  await pages[0].goto(participantPath);await expect(pages[0].locator('.certificate-award')).toHaveCount(3);await pages[0].reload();await expect(pages[0].locator('.certificate-award')).toHaveCount(3);
  await pages[1].goto(participantPath);await expect(pages[1].locator('.certificate-award')).toHaveCount(1);
  await pages[2].goto(participantPath);await expect(pages[2].locator('.certificate-award')).toHaveCount(2);await pages[3].goto(participantPath);await expect(pages[3].locator('.certificate-award')).toHaveCount(2);
  const context = await rpc(winner.token,'certificate_download_data',{target_template_id:participation});expect(context.values.participant_name).toBe(winner.name);expect(context.values.participant_name).not.toBe(winner.username);expect(context.values.placement).toBe('1');expect(context.values.category).toBe('Junior');
  const teamContext=await rpc(member.token,'certificate_download_data',{target_template_id:categoryTemplate});expect(teamContext.values.team_name).toBe(team.name);expect(teamContext.values.participant_name).toBe(member.name);expect(teamContext.values.category).toBe('Senior');
  expect((await denied(loser.token,'certificate_download_data',{target_template_id:winnerTemplate})).code).toBe('42501');await denied(outsider.token,'certificate_download_data',{target_template_id:participation});await denied(loser.token,'set_certificate_release',{target_competition_id:id,enable_release:false});await denied(winner.token,'save_certificate_template',{target_competition_id:id,target_template_id:participation,details:saved,expected_version:saved.version});
  const privateRows=await request.get(`${root}/certificate_templates?select=id&competition_id=eq.${id}`,{headers:headers(outsider.token)});expect(await privateRows.json()).toEqual([]);
  const bucket = `${ownerSession.SUPABASE_PROJECT_URL}/storage/v1`;
  await request.delete(bucket+'/object/certificate-templates',{headers:headers(ownerSession.token),data:{prefixes:[context.storage_path]}});const preservedImage=await request.get(bucket+'/object/authenticated/certificate-templates/'+context.storage_path,{headers:headers(ownerSession.token)});expect(preservedImage.ok()).toBeTruthy();
  const forbiddenUpload=await request.post(bucket+'/object/certificate-templates/'+id+'/'+randomUUID()+'/'+randomUUID()+'.png',{headers:{...headers(outsider.token),'content-type':'image/png'},data:artwork});expect(forbiddenUpload.ok()).toBeFalsy();const forbiddenOverwrite=await request.put(bucket+'/object/certificate-templates/'+context.storage_path,{headers:{...headers(ownerSession.token),'content-type':'image/png'},data:artwork});expect(forbiddenOverwrite.ok()).toBeFalsy();
  const privateImage=await request.get(`${bucket}/object/authenticated/certificate-templates/${context.storage_path}`,{headers:headers(outsider.token)});expect(privateImage.ok()).toBeFalsy();
  const storageList=async () => {const r=await request.post(`${bucket}/object/list/certificate-templates`,{headers:headers(ownerSession.token),data:{prefix:id,limit:100}});expect(r.ok(),await r.text()).toBeTruthy();return r.json();};
  const storageFiles=async()=>{const files=[];for(const folder of await storageList()){const r=await request.post(bucket+'/object/list/certificate-templates',{headers:headers(ownerSession.token),data:{prefix:id+'/'+folder.name,limit:100}});for(const file of await r.json())files.push(id+'/'+folder.name+'/'+file.name);}return files.sort();};
  const beforeStorage=await storageFiles();
  const award=pages[0].locator(`[data-award="${participation}"]`);await award.getByRole('button',{name:'Preview',exact:true}).click();await expect(pages[0].locator('.certificate-preview-panel')).toBeVisible();await expect(pages[0].locator('.certificate-preview-panel canvas')).toHaveAttribute('aria-label',new RegExp(winner.name));
  await capture(pages[0],'m17-participant-preview-desktop.png');
  for(const format of ['image','PDF']) {const pending=pages[0].waitForEvent('download');await award.getByRole('button',{name:`Download ${format}`,exact:true}).click();const download=await pending;const path=info.outputPath(format==='image'?'m17-generated.png':'m17-generated.pdf');await download.saveAs(path);const bytes=readFileSync(path);if(format==='image'){expect(bytes.subarray(1,4).toString()).toBe('PNG');expect(bytes.readUInt32BE(16)).toBe(1200);expect(bytes.readUInt32BE(20)).toBe(850);}else {expect(bytes.subarray(0,5).toString()).toBe('%PDF-');expect(bytes.length).toBeGreaterThan(1000);const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(1);expect(pdf.getPage(0).getSize()).toEqual({width:900,height:637.5});}}
  expect(await storageFiles()).toEqual(beforeStorage);
  await pages[3].setViewportSize({width:320,height:700});await pages[3].reload();await expect(pages[3].locator('.certificate-award')).toHaveCount(2);await capture(pages[3],'m17-participant-mobile.png');expect(await pages[3].evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await pages[0].goto('/dashboard');await expect(pages[0].locator('#dashboard-certificates').locator('xpath=ancestor::section')).toContainText('3 eligible awards');
  const notifications=await request.get(`${root}/notifications?select=id,link_path&kind=eq.certificate_available`,{headers:headers(winner.token)});expect((await notifications.json()).filter(n=>n.link_path===participantPath)).toHaveLength(1);
  await login(anonymous,winner,participantPath);await expect(anonymous.locator('.certificate-award')).toHaveCount(3);
  await page.goto(studio);await page.getByRole('button',{name:'Pause release',exact:true}).click();await expect(page.getByRole('heading',{name:'Release is paused.'})).toBeVisible();await expect(pages[1].getByRole('heading',{name:'Certificates are not released yet.'})).toBeVisible();await denied(winner.token,'certificate_download_data',{target_template_id:participation});
  // Cleanup artwork through the Storage API while its organiser still exists.
  const templates=await (await request.get(`${root}/certificate_templates?select=id,storage_path&competition_id=eq.${id}`,{headers:headers(ownerSession.token)})).json();
  for(const t of templates) {await rpc(ownerSession.token,'delete_certificate_template',{target_template_id:t.id});const r=await request.delete(`${bucket}/object/certificate-templates`,{headers:headers(ownerSession.token),data:{prefixes:[t.storage_path]}});expect(r.ok(),await r.text()).toBeTruthy();}
  const folders=await storageList();for(const folder of folders){const r=await request.post(`${bucket}/object/list/certificate-templates`,{headers:headers(ownerSession.token),data:{prefix:`${id}/${folder.name}`,limit:100}});expect(await r.json()).toEqual([]);}
  await anonymous.close();for(const p of pages) await p.close();
});
