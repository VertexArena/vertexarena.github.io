import { fields, newCompetition, newRound, slugify, localDate, timestamp, validate, cleanRound, roundDateKeys, competitionDateKeys } from './competition-model.js';

export function createCompetitions({ client, state, escapeHtml: h, navigate, setStatus }) {
  const steps = ['Essentials', 'Participation', 'Timeline', 'Appearance', 'Review'];
  const dateLabels = { registration_opens_at:'Registration opens', registration_closes_at:'Registration deadline', starts_at:'Competition starts', certificates_available_at:'Certificate availability', opens_at:'Round opens', submission_deadline:'Submission deadline', judging_opens_at:'Judging starts (optional)', judging_closes_at:'Judging ends (optional)', leaderboard_releases_at:'Results release' };
  const imageTypes = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif' };
  let editor = null, timer = null, objectUrl = null;
  const result = async query => { const { data,error } = await query; if(error) throw error; return data; };
  const date = value => value ? new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : 'Not set';
  const empty = (title,copy) => `<div class="organisation-empty"><h2>${h(title)}</h2><p>${h(copy)}</p></div>`;
  const errorMessage = error => /duplicate key/.test(error.message) ? 'That competition or round address is already in use. Choose a unique address.' : /fetch|network/i.test(error.message) ? 'Could not reach Vertex. Your entries are still here. Check your connection and retry.' : /check constraint/.test(error.message) ? 'Some values are invalid. Check ages, team sizes and dates, then retry.' : error.message;
  const selected = (a,b) => a===b ? ' selected' : '';
  const input = (key,label,value='',type='text',extra='') => `<label class="field"><span>${h(label)}</span><input name="${key}" type="${type}" value="${h(value ?? '')}" ${extra}></label>`;
  const dateInput = (key,value) => input(key,dateLabels[key],localDate(value),'datetime-local','step="60"');
  const select = (key,label,value,options) => `<label class="field"><span>${h(label)}</span><select name="${key}">${options.map(([v,text])=>`<option value="${h(v)}"${selected(value,v)}>${h(text)}</option>`).join('')}</select></label>`;
  const textarea = (key,label,value,max,rows=5) => `<label class="field"><span>${h(label)}</span><textarea name="${key}" maxlength="${max}" rows="${rows}">${h(value)}</textarea></label>`;
  const bannerStyle = c => c.banner_kind==='gradient' ? `background:linear-gradient(125deg,${c.banner_colour},${c.banner_colour_end})` : `background:${c.banner_colour}`;
  async function bannerUrl(c) { return c.banner_kind==='image' && c.banner_path ? (await result(client.storage.from('competition-banners').createSignedUrl(c.banner_path,3600))).signedUrl : null; }
  const banner = (c,url) => `<div class="competition-banner" style="${h(bannerStyle(c))}">${url && c.banner_kind==='image' ? `<img src="${h(url)}" alt="${h(c.name)} competition banner">` : '<i class="fa-solid fa-mountain-sun" aria-hidden="true"></i>'}<span class="banner-caption">${h(c.field_tags.join(' · ') || 'Competition')}</span></div>`;
  const card = (c,manage=false) => `<a class="competition-card" data-link href="${manage?'/organiser':''}/competition/${h(c.slug)}"><span class="competition-card-accent" style="${h(bannerStyle(c))}"></span><span class="account-badge">${h(c.status === 'draft'?'Draft':c.team_mode==='individual'?'Individual':c.team_mode==='team'?'Team':'Individual or team')}</span><h2>${h(c.name)}</h2><p>${h(c.field_tags.join(' · ') || 'Choose fields in the editor')}</p><span class="competition-card-date">${manage && c.status==='draft'?'Last saved '+h(date(c.updated_at)):'Registration closes '+h(date(c.registration_closes_at))}</span><span class="competition-card-action">${manage?'Open competition':'View competition'} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span></a>`;
  async function list(manage=false,organisationId=null) {
    const page = Math.max(0,Math.min(100000,Number.parseInt(new URLSearchParams(location.search).get(organisationId?'competitionsPage':'page'),10)||0));
    let query=client.from('competitions').select('*').order('created_at',{ascending:false}).order('id').range(page*12,page*12+12);
    query = manage ? query.eq('owner_id',state.session.user.id) : query.eq('status','published');
    if(organisationId) query=query.eq('organisation_id',organisationId);
    const rows=await result(query);
    const key=organisationId?'competitionsPage':'page';
    return `${rows.length?`<div class="competition-grid">${rows.slice(0,12).map(c=>card(c,manage)).join('')}</div>`:empty(manage?'Create your first competition.':'No competitions published yet.',manage?'Set the rules, shape the rounds, and review before publishing.':'Published competitions will appear here.')}<nav class="pagination" aria-label="Competition pages">${page?`<a class="button secondary" data-link href="${h(location.pathname)}?${key}=${page-1}">Previous page</a>`:''}${rows.length>12?`<a class="button secondary" data-link href="${h(location.pathname)}?${key}=${page+1}">Next page</a>`:''}</nav>`;
  }
  async function detailsView(c,rounds,url,org,preview=false) {
    return `<article class="competition-detail">${banner(c,url)}<div class="competition-intro"><div><span class="eyebrow">${preview?'Publication preview':'Student competition'}</span><h1>${h(c.name || 'Your competition')}</h1>${org?`<a data-link href="/organisation/${h(org.slug)}">${h(org.name)}</a>`:''}</div><div class="competition-facts"><span class="account-badge">${h(c.team_mode==='individual'?'Individual':c.team_mode==='team'?'Teams':'Individual or team')}</span><p>${c.team_mode!=='individual'?`${c.minimum_team_size}–${c.maximum_team_size} members per team<br>`:''}${c.minimum_age!==null||c.maximum_age!==null?`Ages ${c.minimum_age??'any'}–${c.maximum_age??'any'}`:'All ages welcome'}</p><p data-competition-countdown="${h(c.registration_closes_at || '')}" data-registration-opens="${h(c.registration_opens_at || '')}">${h(registrationState(c))}</p></div></div><div class="competition-body"><div><section><h2>About the competition</h2><p class="preserve-lines">${h(c.description || 'Add a description before publishing.')}</p><div class="competition-tags">${c.field_tags.map(f=>`<span class="account-badge">${h(f)}</span>`).join('')}</div></section>${c.categories.length?`<section><h2>Categories</h2><ul>${c.categories.map(v=>`<li>${h(v)}</li>`).join('')}</ul></section>`:''}<section><h2>Prizes</h2><p class="preserve-lines">${h(c.prize_details || 'Add prize details before publishing.')}</p><div class="prize-distribution"><span>Prize distribution</span><strong>Coming Soon</strong></div></section><section><h2>Certificates</h2><p>${c.certificate_status==='not_planned'?'Certificates are not currently planned.':c.certificate_status==='template_ready'?'The organiser has a certificate template ready.':'The organiser plans to offer certificates.'}${c.certificates_available_at?` Planned availability: ${h(date(c.certificates_available_at))}.`:''}</p></section></div><section class="competition-timeline"><h2>The competition path</h2><ol><li><span class="timeline-node"><i class="fa-solid fa-door-open" aria-hidden="true"></i></span><h3>Registration</h3><p>Opens ${h(date(c.registration_opens_at))}<br>Closes ${h(date(c.registration_closes_at))}</p></li><li><span class="timeline-node"><i class="fa-solid fa-flag" aria-hidden="true"></i></span><h3>Competition starts</h3><p>${h(date(c.starts_at))}</p></li>${rounds.map((r,i)=>`<li><span class="timeline-node">${i+1}</span><h3>${h(r.name)}</h3><span class="account-badge">${i===rounds.length-1?'Top '+r.advancement_count+' winners':'Top '+r.advancement_count+' advance'}</span><dl><div><dt>Opens</dt><dd>${h(date(r.opens_at))}</dd></div><div><dt>Submissions close</dt><dd>${h(date(r.submission_deadline))}</dd></div>${r.judging_opens_at?`<div><dt>Judging</dt><dd>${h(date(r.judging_opens_at))} – ${h(date(r.judging_closes_at))}</dd></div>`:''}<div><dt>Results</dt><dd>${h(date(r.leaderboard_releases_at))}</dd></div></dl></li>`).join('')}</ol></section></div></article>`;
  }
  function registrationState(c) {
    const now=Date.now(), opening=+new Date(c.registration_opens_at), closing=+new Date(c.registration_closes_at);
    if(!c.registration_opens_at||!c.registration_closes_at) return 'Registration dates not set';
    if(now < opening) return `Registration opens in ${duration(opening-now)}`;
    if(now >= closing) return 'Registration deadline passed';
    return `Registration closes in ${duration(closing-now)}`;
  }
  function duration(ms) { const minutes=Math.max(1,Math.ceil(ms/60000)); return minutes>=1440?`${Math.floor(minutes/1440)}d ${Math.floor(minutes%1440/60)}h`:minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${minutes}m`; }
  async function editorRoute(slug) {
    const c=slug?await result(client.from('competitions').select('*').eq('slug',slug).maybeSingle()):newCompetition();
    if(!c || c.owner_id && c.owner_id!==state.session.user.id) return { title:'Competition unavailable - Vertex',content:`<div class="page">${empty('Competition unavailable.','Only the competition owner can open this editor.')}<a class="button secondary" data-link href="/organiser">Your competitions</a></div>` };
    const rounds=c.version?(await result(client.from('competition_rounds').select('*').eq('competition_id',c.id).order('sequence'))).map(cleanRound):[newRound()];
    const memberships=await result(client.from('organisation_memberships').select('organisations(id,name,slug)').eq('organiser_id',state.session.user.id).eq('status','accepted'));
    const orgs=memberships.map(m=>m.organisations).filter(Boolean);
    if(c.organisation_id&&!orgs.some(o=>o.id===c.organisation_id)) { const org=await result(client.from('organisations').select('id,name,slug').eq('id',c.organisation_id).single());orgs.push(org); }
    editor={c,rounds,orgs,step:0,busy:false,file:null,url:await bannerUrl(c),savedPath:c.banner_path,dirty:false};
    return {title:`${c.version?'Edit':'Create'} competition - Vertex`,content:`<div class="page competition-editor"><a class="back-link" data-link href="/organiser"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Your competitions</a><div class="page-head compact-head"><span class="eyebrow">Organiser studio</span><h1>${c.version?'Shape what comes next.':'Build a worthy challenge.'}</h1><p>Define the opportunity. Set a clear path from registration to results.</p></div><div class="editor-shell"><nav class="editor-steps" aria-label="Competition setup steps">${steps.map((s,i)=>`<button type="button" data-step="${i}"><span>${i+1}</span>${s}</button>`).join('')}<div class="editor-save-state" data-save-state>${c.version?'Saved '+h(date(c.updated_at)):'Not saved yet'}</div></nav><div class="editor-main"><div class="form-status" role="status" aria-live="polite" data-competition-status></div><form data-competition-form novalidate><div data-editor-panel></div><div class="editor-actions"><button class="button secondary" type="button" data-editor-back>Back</button><button class="button secondary" type="button" data-save-draft>${c.status==='published'?'Save changes':'Save draft'}</button><button class="button primary" type="submit" data-editor-next>Continue</button></div></form></div></div></div>`};
  }
  async function resolve(path) {
    if(path==='/organiser'||path.startsWith('/organiser/competition/')) {
      if(!state.session) return {protected:true};
      if(state.profile?.account_type!=='organiser') return {title:'Organiser account required - Vertex',content:`<div class="page">${empty('Organiser account required.','Competition creation is available to individual organiser accounts.')}<a class="button secondary" data-link href="/discover">Browse competitions</a></div>`};
      if(path==='/organiser') return {title:'Your competitions - Vertex',content:`<div class="page"><div class="page-head compact-head"><span class="eyebrow">Organiser studio</span><h1>Your competitions.</h1><p>Create a clear path from the first idea to the final round.</p><a class="button primary" data-link href="/organiser/competition/new">Create competition <i class="fa-solid fa-plus" aria-hidden="true"></i></a></div>${await list(true)}</div>`};
      const match=path.match(/^\/organiser\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
      return match?editorRoute(match[1]==='new'?null:match[1]):undefined;
    }
    const match=path.match(/^\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if(!match) return undefined;
    const c=await result(client.from('competitions').select('*,organisations(id,name,slug)').eq('slug',match[1]).eq('status','published').maybeSingle());
    if(!c) return null;
    const rounds=await result(client.from('competition_rounds').select('*').eq('competition_id',c.id).order('sequence'));
    const details=await detailsView(c,rounds,await bannerUrl(c),c.organisations);
    const entry=(c.team_mode!=='team' && (!state.session || state.profile?.account_type==='participant'))
      ? `<div class="competition-entry-callout"><div><span class="eyebrow">Take part</span><p>Register an individual entry${c.categories.length?' and choose your category':''}.</p></div><a class="button primary" data-link href="/competition/${h(c.slug)}/register">Register individually <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div>` : '';
    const publicDetails=entry?details.replace('<div class="competition-body">',`${entry}<div class="competition-body">`):details;
    return {title:`${c.name} - Vertex`,content:`<div class="page competition-public" data-competition-id="${h(c.id)}" data-minimum-age="${h(c.minimum_age ?? '')}" data-maximum-age="${h(c.maximum_age ?? '')}"><a class="back-link" data-link href="/discover"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Discover competitions</a>${c.owner_id===state.session?.user.id?`<a class="button secondary competition-edit-link" data-link href="/organiser/competition/${h(c.slug)}">Edit competition</a>`:''}${publicDetails}</div>`,competition:c};
  }
  function readPanel() {
    if(!editor) return;
    const form=document.querySelector('[data-competition-form]');if(!form)return;
    const c=editor.c, values=new FormData(form);
    const locked=c.status==='published';
    for(const key of ['name','slug','description','prize_details','team_mode','structure','banner_kind','banner_colour','banner_colour_end','certificate_status']) if(values.has(key) && !(editor.step===2 && ['name','slug'].includes(key))) c[key]=String(values.get(key)).trim();
    if(values.has('organisation_id')) c.organisation_id=values.get('organisation_id')||null;
    for(const key of ['minimum_age','maximum_age','minimum_team_size','maximum_team_size']) if(values.has(key)) c[key]=values.get(key)===''?null:Number(values.get(key));
    if(form.querySelector('[name="field_tags"]:not(:disabled)')) c.field_tags=values.getAll('field_tags');
    if(values.has('categories')) c.categories=values.get('categories').split('\n').map(s=>s.trim()).filter(Boolean);
    for(const key of competitionDateKeys) if(values.has(key)) c[key]=timestamp(values.get(key));
    if(!locked && c.team_mode==='individual') c.minimum_team_size=c.maximum_team_size=null;
    form.querySelectorAll('[data-round]').forEach((section,index)=> {
      if(locked)return;
      const r=editor.rounds[index];
      for(const key of ['name','slug']) r[key]=section.querySelector(`[name="${key}"]`).value.trim();
      r.advancement_count=Number(section.querySelector('[name="advancement_count"]').value);
      for(const key of roundDateKeys) r[key]=timestamp(section.querySelector(`[name="${key}"]`).value);
    });
  }
  function markDirty() {
    editor.dirty = true;
    const label = document.querySelector('[data-save-state]');
    if (label) label.textContent = 'Unsaved changes';
  }
  async function showStep(focus=false) {
    const {c,rounds,orgs,step}=editor, locked=c.status==='published';
    const panel=document.querySelector('[data-editor-panel]');if(!panel)return;
    const disable=locked?'disabled':'';
    let body='';
    if(step===0) body=`${input('name','Competition name',c.name,'text','maxlength="160" required')}${input('slug','Competition address',c.slug,'text',`maxlength="100" required ${c.version?'readonly':''}`)}<p class="field-intro">/competition/<span data-competition-slug>${h(c.slug||'your-competition')}</span>. The address stays fixed after the first save.</p>${textarea('description','Description',c.description,20000)}${textarea('prize_details','Prize details',c.prize_details,5000,3)}<fieldset ${disable}><legend>Fields</legend><div class="field-tag-grid">${fields.map(f=>`<label class="check-field"><input type="checkbox" name="field_tags" value="${h(f)}" ${c.field_tags.includes(f)?'checked':''}><span>${h(f)}</span></label>`).join('')}</div>${select('organisation_id','Associated organisation',c.organisation_id||'',[['','Independent organiser'],...orgs.map(o=>[o.id,o.name])])}<p class="field-intro">Only organisations whose invitation you have accepted appear here.</p></fieldset>`;
    if(step===1) body=`<fieldset ${disable}>${select('team_mode','Participation mode',c.team_mode,[['individual','Individual only'],['team','Team only'],['both','Individual or team']])}<div class="form-grid" data-team-size ${c.team_mode==='individual'?'hidden':''}>${input('minimum_team_size','Minimum team size',c.minimum_team_size,'number','min="2" max="100"')}${input('maximum_team_size','Maximum team size',c.maximum_team_size,'number','min="2" max="100"')}</div><h3>Age eligibility</h3><p class="field-intro">Leave either limit empty for no limit. Age will be calculated from each participant’s birthday.</p><div class="form-grid">${input('minimum_age','Minimum age',c.minimum_age,'number','min="0" max="120"')}${input('maximum_age','Maximum age',c.maximum_age,'number','min="0" max="120"')}</div>${textarea('categories','Categories (one per line)',c.categories.join('\n'),2430,4)}<p class="field-intro">Optional. Up to 30 categories; each name must be unique.</p></fieldset>`;
    if(step===2) body=`<p class="field-intro">Dates use your local time zone: ${h(Intl.DateTimeFormat().resolvedOptions().timeZone)}. Registration closes before the competition starts. Each new round follows the previous results.</p><fieldset ${disable}><div class="form-grid">${competitionDateKeys.slice(0,3).map(k=>dateInput(k,c[k])).join('')}</div>${select('structure','Competition structure',c.structure,[['direct3','Direct top 3'],['directx','Direct top X'],['100-30-3','Top 100, top 30, top 3'],['custom','Custom rounds']])}<div class="round-path" aria-label="Advancement path">${rounds.map((r,i)=>`<span><small>Round ${i+1}</small><strong>Top ${r.advancement_count}</strong></span>`).join('')}</div><div class="round-editor-list">${rounds.map((r,i)=>`<section class="round-editor" data-round="${i}"><div class="section-title-row"><h3>Round ${i+1}</h3>${c.structure==='custom'?`<div class="round-actions"><button type="button" class="button quiet" data-round-up="${i}" ${i===0?'disabled':''} aria-label="Move round ${i+1} up"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button><button type="button" class="button quiet" data-round-down="${i}" ${i===rounds.length-1?'disabled':''} aria-label="Move round ${i+1} down"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button><button type="button" class="button quiet" data-round-remove="${i}" ${rounds.length===1?'disabled':''}>Remove round ${i+1}</button></div>`:''}</div><div class="form-grid">${input('name','Round name',r.name,'text','maxlength="100"')}${input('slug','Round address',r.slug,'text','maxlength="100"')}${input('advancement_count',i===rounds.length-1?'Top X winners':'Top X advancing',r.advancement_count,'number',`min="1" max="1000000" ${['direct3','100-30-3'].includes(c.structure)?'readonly':''}`)}${roundDateKeys.map(k=>dateInput(k,r[k])).join('')}</div></section>`).join('')}</div>${c.structure==='custom'?`<button type="button" class="button secondary" data-add-round ${rounds.length>=20?'disabled':''}>Add round</button>`:''}</fieldset>`;
    if(step===3) body=`${select('banner_kind','Banner style',c.banner_kind,[['colour','Solid colour'],['gradient','Gradient'],['image','Uploaded image']])}<div class="form-grid" data-banner-colours ${c.banner_kind==='image'?'hidden':''}>${input('banner_colour','Banner colour',c.banner_colour,'color')}${input('banner_colour_end','Gradient end colour',c.banner_colour_end,'color')}</div><label class="field" data-banner-upload ${c.banner_kind!=='image'?'hidden':''}><span>Banner image</span><input type="file" name="banner_file" accept="image/jpeg,image/png,image/webp,image/gif"><small>JPG, PNG, WebP or GIF. Maximum 5 MB. Wide images work best. ${editor.file?h(editor.file.name):c.banner_path?'Current banner saved.':''}</small></label><div data-banner-preview>${banner(c,editor.url)}</div><fieldset ${disable}>${select('certificate_status','Certificate template status',c.certificate_status,[['not_planned','Not planned'],['planned','Planned; template not ready'],['template_ready','Template ready for later configuration']])}<p class="field-intro">Record your preparation here. Certificate template upload and release controls become available in the certificate workspace.</p>${dateInput('certificates_available_at',c.certificates_available_at)}</fieldset>`;
    if(step===4) body=`<p class="field-intro">Review the public page below. Publishing fixes participation rules and dates so future participants can rely on them. You can still edit the name, description, prizes and banner.</p>${await detailsView(c,rounds,editor.url,orgs.find(o=>o.id===c.organisation_id),true)}`;
    panel.innerHTML=`<h2 tabindex="-1" data-step-heading>${steps[step]}</h2>${locked?'<p class="editor-lock"><i class="fa-solid fa-lock" aria-hidden="true"></i> Published rules and dates are fixed. Name, description, prizes and banner remain editable.</p>':''}${body}`;
    document.querySelectorAll('[data-step]').forEach(b=>{b.setAttribute('aria-current',+b.dataset.step===step?'step':'false');b.disabled=editor.busy;});
    document.querySelector('[data-editor-back]').hidden=step===0;
    document.querySelector('[data-editor-next]').textContent=step===4?(locked?'Save changes':'Publish competition'):'Continue';
    document.querySelector('[data-save-draft]').hidden=locked&&step===4;
    panel.querySelector('[name="team_mode"]')?.addEventListener('change',e=>{panel.querySelector('[data-team-size]').hidden=e.target.value==='individual';});
    panel.querySelector('[name="name"]')?.addEventListener('input',e=>{if(step===0&&!c.version&&!editor.slugTouched){panel.querySelector('[name="slug"]').value=slugify(e.target.value);panel.querySelector('[data-competition-slug]').textContent=slugify(e.target.value);}});
    if(step===0) panel.querySelector('[name="slug"]')?.addEventListener('input',e=>{editor.slugTouched=true;panel.querySelector('[data-competition-slug]').textContent=e.target.value;});
    panel.querySelector('[name="structure"]')?.addEventListener('change',e=>{
      const old=c.structure, next=e.target.value;
      if(next!=='custom'&&!confirm('Replace the current round setup with this structure? Existing round names and dates will be cleared.')){e.target.value=old;return;}
      readPanel();
      if(next!=='custom')editor.rounds=(next==='100-30-3'?[100,30,3]:[3]).map((n,i)=>({...newRound(n,i+1),name:next==='100-30-3'?`Round ${i+1}`:'Final round',slug:next==='100-30-3'?`round-${i+1}`:'final-round'}));
      showStep();
    });
    panel.querySelector('[data-add-round]')?.addEventListener('click',()=>{markDirty();readPanel();editor.rounds.push(newRound(Math.max(1,editor.rounds.at(-1).advancement_count-1),editor.rounds.length+1));showStep();});
    for(const action of ['up','down','remove'])panel.querySelectorAll(`[data-round-${action}]`).forEach(b=>b.addEventListener('click',()=>{if(action==='remove'&&!confirm('Remove this draft round?'))return;markDirty();readPanel();const i=+b.dataset[`round${action[0].toUpperCase()+action.slice(1)}`];if(action==='remove')editor.rounds.splice(i,1);else{const j=i+(action==='up'?-1:1);[editor.rounds[i],editor.rounds[j]]=[editor.rounds[j],editor.rounds[i]];}editor.rounds.forEach((r,i)=>r.sequence=i+1);showStep();}));
    panel.querySelector('[name="banner_kind"]')?.addEventListener('change',()=>{readPanel();showStep();});
    for(const key of ['banner_colour','banner_colour_end'])panel.querySelector(`[name="${key}"]`)?.addEventListener('input',()=>{readPanel();panel.querySelector('[data-banner-preview]').innerHTML=banner(c,editor.url);});
    panel.querySelector('[name="banner_file"]')?.addEventListener('change',async e=>{
      const file=e.target.files[0];if(!file)return;
      try {
        if(!imageTypes[file.type]||file.size>5*1024*1024)throw new Error('Choose a JPG, PNG, WebP or GIF banner, 5 MB or smaller.');
        const bitmap=await createImageBitmap(file);bitmap.close();
        if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(file);editor.file=file;editor.url=objectUrl;
        panel.querySelector('[data-banner-preview]').innerHTML=banner(c,editor.url);setStatus(document.querySelector('[data-competition-status]'),'Banner ready to save.');
      }catch(error){e.target.value='';setStatus(document.querySelector('[data-competition-status]'),errorMessage(error),'error');}
    });
    panel.querySelectorAll('[name="advancement_count"]').forEach((field,index) => field.addEventListener('input', () => {
      panel.querySelectorAll('.round-path strong')[index].textContent = 'Top ' + (field.value || '…');
    }));
    if(focus)panel.querySelector('[data-step-heading]').focus();
  }
  async function save(publish=false) {
    if(editor.busy)return;
    const status=document.querySelector('[data-competition-status]');
    let uploaded=null,persisted=false;
    try {
      readPanel();const c={...editor.c,status:publish?'published':editor.c.status};validate(c,editor.rounds,c.status==='published');
      if(c.banner_kind==='image'&&!editor.file&&!c.banner_path)throw new Error('Choose a banner image, or select a colour or gradient.');
      if(publish&&editor.c.status!=='published'&&!confirm('Publish this competition? Participation rules, round identities and dates will be fixed.'))return;
      editor.busy=true;document.querySelector('[data-competition-form]').inert=true;document.querySelectorAll('[data-step]').forEach(b=>b.disabled=true);setStatus(status,'Saving competition…');
      if(c.banner_kind==='image'&&editor.file){uploaded=`${state.session.user.id}/${c.id}/${crypto.randomUUID()}.${imageTypes[editor.file.type]}`;await result(client.storage.from('competition-banners').upload(uploaded,editor.file,{contentType:editor.file.type,upsert:false}));c.banner_path=uploaded;}
      if(c.banner_kind!=='image')c.banner_path=null;
      const saved=await result(client.rpc('save_competition',{details:c,rounds:editor.rounds,expected_version:editor.c.version??null}));persisted=true;
      const oldPath=editor.savedPath;editor.c=saved;editor.savedPath=saved.banner_path;editor.file=null;editor.dirty=false;
      // Read the server's timestamp representation, so published round comparisons stay exact.
      editor.rounds=(await result(client.from('competition_rounds').select('*').eq('competition_id',saved.id).order('sequence'))).map(cleanRound);
      let cleanupFailed=false;
      if(oldPath&&oldPath!==saved.banner_path){const {error}=await client.storage.from('competition-banners').remove([oldPath]);cleanupFailed=Boolean(error);if(error)editor.cleanupPath=oldPath;}
      history.replaceState({},'',`/organiser/competition/${saved.slug}`);
      document.querySelector('[data-save-state]').textContent='Saved '+date(saved.updated_at);
      document.querySelector('[data-save-draft]').textContent=saved.status==='published'?'Save changes':'Save draft';
      await showStep();
      status.innerHTML='';setStatus(status,saved.status==='published'?'Competition published. Your changes are saved.':'Draft saved. Reopen it from Your competitions.', 'success');
      if(saved.status==='published'){const a=document.createElement('a');a.href=`/competition/${saved.slug}`;a.dataset.link='';a.textContent=' View public competition';status.append(a);}
      if(cleanupFailed){const b=document.createElement('button');b.type='button';b.className='button secondary';b.textContent='Retry removing unused banner';b.onclick=async()=>{try{await result(client.storage.from('competition-banners').remove([editor.cleanupPath]));b.remove();}catch(error){setStatus(status,errorMessage(error),'error');}};status.append(b);}
    } catch(error) {
      if(uploaded&&!persisted){const cleanup=await client.storage.from('competition-banners').remove([uploaded]);if(cleanup.error)console.error('Unused banner cleanup failed',cleanup.error.message);}
      setStatus(status,errorMessage(error),'error');status.scrollIntoView({block:'center',behavior:'instant'});
    } finally {editor.busy=false;const form=document.querySelector('[data-competition-form]');if(form)form.inert=false;document.querySelectorAll('[data-step]').forEach(b=>b.disabled=false);}
  }
  function bind() {
    clearInterval(timer);
    const tick = () => document.querySelectorAll('[data-competition-countdown]').forEach(el => { el.textContent = registrationState({registration_opens_at:el.dataset.registrationOpens,registration_closes_at:el.dataset.competitionCountdown}); });
    tick(); timer = setInterval(tick, 60000);
    const form=document.querySelector('[data-competition-form]');
    if(!form){editor=null;if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}return;}
    showStep();
    const go=async step=>{try{readPanel();editor.step=step;await showStep(true);setStatus(document.querySelector('[data-competition-status]'),'');}catch(error){setStatus(document.querySelector('[data-competition-status]'),errorMessage(error),'error');}};
    form.addEventListener('input',markDirty);
    document.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>go(+b.dataset.step)));
    document.querySelector('[data-editor-back]').addEventListener('click',()=>go(editor.step-1));
    document.querySelector('[data-save-draft]').addEventListener('click',()=>save());
    form.addEventListener('submit',e=>{e.preventDefault();if(editor.step===4)save(true);else go(editor.step+1);});
  }
  // Browser refresh/close guards unsaved work; saved drafts are recoverable on any device.
  addEventListener('beforeunload',e=>{if(editor?.dirty){e.preventDefault();e.returnValue='';}});
  return { resolve,bind,publicList:()=>list(),organisationList:id=>list(false,id),canLeave:()=>!editor?.dirty||confirm('Leave without saving these competition changes?') };
}
