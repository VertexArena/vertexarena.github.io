export function createLeaderboards({ client, state, escapeHtml: h, refresh }) {
  const result = async query => { const { data, error } = await query; if (error) throw error; return data; };
  const managerPath = slug => `/organiser/competition/${encodeURIComponent(slug)}/leaderboards`;
  const publicPath = (slug, round) => `/competition/${encodeURIComponent(slug)}/leaderboard/${encodeURIComponent(round)}`;
  const score = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const date = value => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const localInput = value => { if (!value) return ''; const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); };
  let active = null;
  const modeText = { unpublished: 'Draft', scheduled: 'Scheduled', published: 'Published' };

  function countdown(value) {
    const remaining = Math.max(0, Date.parse(value) - Date.now());
    const days = Math.floor(remaining / 86400000), hours = Math.floor(remaining / 3600000) % 24;
    const minutes = Math.floor(remaining / 60000) % 60, seconds = Math.floor(remaining / 1000) % 60;
    return days ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m ${seconds}s`;
  }

  function tabs(c, rounds, current, manager) {
    return `<nav class="leaderboard-rounds" aria-label="Competition round results">${rounds.map(round => `<a class="leaderboard-round ${round.id === current.id ? 'active' : ''}" data-link href="${manager ? `${managerPath(c.slug)}?round=${encodeURIComponent(round.slug)}` : publicPath(c.slug,round.slug)}" ${round.id === current.id ? 'aria-current="page"' : ''}><span>${String(round.sequence).padStart(2,'0')}</span><strong>${h(round.name)}</strong><small>${h(modeText[round.leaderboard_state] || 'Draft')}</small></a>`).join('')}</nav>`;
  }

  function podium(rows, showScores) {
    if (!rows.length || rows.length > 3) return '';
    return `<section class="leaderboard-podium" aria-label="Top three places"><div class="leaderboard-section-heading"><span class="eyebrow">Podium</span><h2>Top three.</h2></div><div class="leaderboard-podium-grid">${rows.map(row => `<article class="leaderboard-podium-card place-${row.rank}"><span class="leaderboard-place">${String(row.rank).padStart(2,'0')}</span><div><strong>${h(row.name)}</strong><small>${row.entry_type === 'team' ? 'Team' : `@${h(row.username)}`}${row.category ? ` · ${h(row.category)}` : ''}</small></div>${showScores && row.total !== null ? `<b>${score(row.total)}</b>` : '<span class="leaderboard-private-score">Score hidden</span>'}</article>`).join('')}</div></section>`;
  }

  function list(data) {
    const rows = data.entries || [];
    return `<section class="leaderboard-list-panel"><div class="leaderboard-section-heading"><span class="eyebrow">Complete order</span><h2>Ranked entries.</h2><p>${data.total.toLocaleString()} ${data.total === 1 ? 'entry' : 'entries'}${active?.query ? ' match search' : ''}</p></div><form data-leaderboard-search class="leaderboard-search"><label class="field"><span>Find participant or team</span><input type="search" name="query" maxlength="100" value="${h(active?.query || '')}" placeholder="Name or @username"></label><button class="button secondary" type="submit">Search</button></form><ol class="leaderboard-rows">${rows.map(row => `<li class="leaderboard-entry"><span class="leaderboard-entry-rank">${row.rank}</span><div class="leaderboard-entry-name"><strong>${h(row.name)}</strong><small>${row.entry_type === 'team' ? 'Team' : `@${h(row.username)}`}${row.category ? ` · ${h(row.category)}` : ''}</small></div>${row.category_winner ? '<span class="leaderboard-category-mark"><i class="fa-solid fa-medal" aria-hidden="true"></i> Category winner</span>' : ''}<span class="leaderboard-entry-status ${h(row.status)}">${row.status === 'advanced' ? 'Advanced' : row.status === 'winner' ? 'Winner' : 'Eliminated'}</span>${row.total !== null ? `<b class="leaderboard-entry-score">${score(row.total)}</b>` : '<span class="leaderboard-private-score">Score hidden</span>'}</li>`).join('')}</ol>${rows.length ? '' : `<div class="leaderboard-empty"><strong>${active?.query ? 'No entries match.' : 'No results yet.'}</strong><p>${active?.query ? 'Try another name or username.' : 'Finalised entries will appear here.'}</p></div>`}${data.total > data.page_size ? `<nav class="leaderboard-pagination" aria-label="Leaderboard pages"><button class="button secondary" type="button" data-leaderboard-page="${data.page - 1}" ${data.page ? '' : 'disabled'}>Previous</button><span>Page ${data.page + 1} of ${Math.ceil(data.total/data.page_size)}</span><button class="button secondary" type="button" data-leaderboard-page="${data.page + 1}" ${(data.page + 1)*data.page_size < data.total ? '' : 'disabled'}>Next</button></nav>` : ''}</section>`;
  }

  function categories(rows) {
    if (!rows.length) return '';
    return `<section class="leaderboard-awards"><div class="leaderboard-section-heading"><span class="eyebrow">Category awards</span><h2>Standouts by field.</h2></div><div class="leaderboard-award-grid">${rows.map(row => `<article><span>${h(row.category)}</span><strong>${h(row.name)}</strong><small>${row.entry_type === 'team' ? 'Team' : `@${h(row.username)}`}</small></article>`).join('')}</div></section>`;
  }

  function ownResult(item) {
    if (!item) return '';
    const label = item.status === 'winner' ? 'You won this round.' : item.status === 'advanced' ? 'You advanced.' : 'Your run ended here.';
    const detail = item.status === 'eliminated' ? 'Your previous results remain in your round history.' : item.status === 'advanced' ? 'Your entry is eligible for the next round.' : 'This final result is part of your competition history.';
    return `<aside class="leaderboard-own-result ${h(item.status)}"><i class="fa-solid fa-${item.status === 'eliminated' ? 'circle-info' : 'circle-check'}" aria-hidden="true"></i><div><strong>${label}</strong><p>${detail}</p></div></aside>`;
  }

  function categoryControls(groups, published) {
    if (!groups.length) return `<section class="leaderboard-manager-card"><span class="eyebrow">Category awards</span><h2>No categories in this round.</h2><p>Category winners appear when entries register in named competition categories.</p></section>`;
    return `<section class="leaderboard-manager-card"><span class="eyebrow">Category awards</span><h2>Choose each winner.</h2><p>Choose one finalised entry per represented category. All categories need a winner before release.</p><div class="leaderboard-category-controls">${groups.map(group => `<form data-category-form="${h(group.category)}"><div><strong>${h(group.category)}</strong><small>${group.entries.length} ${group.entries.length === 1 ? 'entry' : 'entries'}</small></div><label class="field"><span>Winner</span><select name="winner" ${published ? 'disabled' : ''}><option value="">Choose winner</option>${group.entries.map(entry => `<option value="${h(entry.id)}" ${group.winner_id === entry.id ? 'selected' : ''}>${h(entry.name)} · ${score(entry.total)} marks</option>`).join('')}</select></label>${published ? '' : '<button class="button secondary" type="submit">Save winner</button>'}</form>`).join('')}</div></section>`;
  }

  function controls(c, round, data, groups) {
    const published = data.state === 'published';
    const releaseReady = round.judging_state === 'finalised' && data.missing_categories === 0;
    return `<aside class="leaderboard-manager-aside">${categoryControls(groups,published)}<section class="leaderboard-manager-card publication-card"><span class="eyebrow">Release control</span><h2>${published ? 'Results are live.' : data.state === 'scheduled' ? 'Release is scheduled.' : 'Ready when you are.'}</h2><p>${published ? `Published ${h(date(data.published_at))}. Round results stay at this address.` : 'Finalise advancement, choose category winners, then set when participants can see the result.'}</p>${published ? `<a class="button secondary" data-link href="${publicPath(c.slug,round.slug)}">Open public result</a>` : `<form data-publication-form><label class="leaderboard-switch"><input type="checkbox" name="show_scores" ${data.show_scores ? 'checked' : ''}><span><strong>Show scores publicly</strong><small>Ranks and outcomes remain visible either way.</small></span></label><label class="field"><span>Release date and time</span><input name="release_at" type="datetime-local" required value="${h(localInput(data.release_at))}"><small>After submission closes ${h(date(round.submission_deadline))}.</small></label>${releaseReady ? '' : `<p class="leaderboard-release-block">Finalise advancement and choose all category winners to release results.</p>`}<div class="form-status" role="status" data-publication-status></div><div class="leaderboard-release-actions"><button class="button secondary" type="button" data-publish-mode="draft">Save draft</button><button class="button primary" type="button" data-publish-mode="scheduled" ${releaseReady ? '' : 'disabled'}>Schedule release</button><button class="button secondary" type="button" data-publish-mode="published" ${releaseReady ? '' : 'disabled'}>Publish now</button></div></form>`}</section></aside>`;
  }

  function managerView(c, rounds, round, data, groups) {
    const complete = round.judging_state === 'finalised';
    return { title: `${c.name} leaderboard management - Vertex`, content: `<div class="page leaderboard-page leaderboard-manager" data-leaderboard-page><a class="back-link" data-link href="/organiser/competition/${h(c.slug)}/workspace"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Competition workspace</a><header class="page-head compact-head"><span class="eyebrow">Organiser workspace / results</span><h1>Release the result.</h1><p>Preview exact ranks, name category winners, and choose when participants can see them.</p></header>${tabs(c,rounds,round,true)}<div class="leaderboard-status-line"><span class="leaderboard-state ${h(data.state)}">${h(modeText[data.state])}</span><span>${h(round.name)} · ${data.total} finalised ${data.total === 1 ? 'entry' : 'entries'}</span>${data.state === 'scheduled' ? `<time>Release ${h(date(data.release_at))}</time>` : ''}</div>${complete ? `<div class="leaderboard-manager-layout"><div class="leaderboard-results">${podium(data.podium,true)}${list(data)}${categories(data.categories)}</div>${controls(c,round,data,groups)}</div>` : `<div class="leaderboard-manager-layout"><section class="leaderboard-empty"><strong>Finalise advancement to preview this leaderboard.</strong><p>Scores and cutoff decisions remain editable until finalisation.</p><a class="button primary" data-link href="/organiser/competition/${h(c.slug)}/advancement?round=${h(round.slug)}">Resolve advancement</a></section>${controls(c,round,data,groups)}</div>`}</div>` };
  }

  function publicView(c, rounds, round, data) {
    const published = data.state === 'published';
    return { title: `${round.name} leaderboard - Vertex`, content: `<div class="page leaderboard-page" data-leaderboard-page><a class="back-link" data-link href="/competition/${h(c.slug)}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${h(c.name)}</a><header class="page-head compact-head"><span class="eyebrow">${h(c.name)} / results</span><h1>${h(round.name)} leaderboard.</h1><p>${published ? 'A lasting record of this round’s work and outcome.' : data.state === 'scheduled' ? 'Results are set for release. Return when the clock reaches zero.' : 'Results have not been scheduled for release.'}</p></header>${tabs(c,rounds,round,false)}${published ? `${ownResult(data.own_result)}${podium(data.podium,data.show_scores)}${categories(data.categories)}${list(data)}` : data.state === 'scheduled' ? `<section class="leaderboard-countdown" data-release-at="${h(data.release_at)}"><span class="eyebrow">Scheduled release</span><strong data-countdown>${h(countdown(data.release_at))}</strong><p>Leaderboard opens ${h(date(data.release_at))}. Results stay private until release.</p></section>` : `<section class="leaderboard-countdown quiet"><span class="eyebrow">Results pending</span><strong>Not released yet.</strong><p>The organiser will schedule or publish this round after judging.</p></section>`}</div>` };
  }

  async function resolve(route) {
    const manager = route.match(/^\/organiser\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/leaderboards$/);
    const publicMatch = route.match(/^\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/leaderboard\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (!manager && !publicMatch) return undefined;
    if (manager && !state.session) return { protected: true };
    const slug = (manager || publicMatch)[1];
    const c = await result(client.from('competitions').select('id,name,slug,status').eq('slug',slug).maybeSingle());
    if (!c) return null;
    const rounds = await result(client.from('competition_rounds').select('id,name,slug,sequence,submission_deadline,judging_state,leaderboard_state').eq('competition_id',c.id).order('sequence'));
    if (manager && !await result(client.rpc('can_manage_competition',{target_competition_id:c.id}))) return { title: 'Leaderboards unavailable - Vertex', content: '<div class="page notice-page"><h1>Leaderboards unavailable.</h1><p>Only competition organisers can manage result publication.</p></div>' };
    const round = manager ? rounds.find(row => row.slug === new URLSearchParams(location.search).get('round')) || rounds[0] : rounds.find(row => row.slug === publicMatch[2]);
    if (!round) return null;
    const params = new URLSearchParams(location.search), query = (params.get('q') || '').slice(0,100);
    const page = Math.max(0, Number.parseInt(params.get('page') || '0',10) || 0);
    const data = await result(client.rpc('round_leaderboard_data',{target_round_id:round.id,search_term:query,result_page:page,result_limit:25}));
    round.leaderboard_state = data.state;
    const groups = manager ? await result(client.rpc('round_category_candidates',{target_round_id:round.id})) : [];
    active = { c,round,rounds,data,groups,query,page,manager:!!manager };
    return manager ? managerView(c,rounds,round,data,groups) : publicView(c,rounds,round,data);
  }

  function bind() {
    const root = document.querySelector('[data-leaderboard-page]');
    if (!root || !active) return;
    root.querySelector('[data-leaderboard-search]')?.addEventListener('submit', event => {
      event.preventDefault(); const q = event.currentTarget.elements.namedItem('query').value.trim();
      const params = new URLSearchParams(location.search); params.delete('page'); q ? params.set('q',q) : params.delete('q');
      history.pushState({},'',`${location.pathname}${params.size ? `?${params}` : ''}`); refresh();
    });
    root.querySelectorAll('[data-leaderboard-page]').forEach(button => button.addEventListener('click', () => {
      const params = new URLSearchParams(location.search); params.set('page',button.dataset.leaderboardPage);
      history.pushState({},'',`${location.pathname}?${params}`); refresh();
    }));
    root.querySelectorAll('[data-category-form]').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault(); const id = form.elements.namedItem('winner').value;
      const group = active.groups.find(item => item.category === form.dataset.categoryForm);
      const entry = group?.entries.find(item => item.id === id);
      const button = form.querySelector('button[type=submit]'); button.disabled = true;
      const status = root.querySelector('[data-publication-status]'); status.textContent = 'Saving category winner…';
      try { await result(client.rpc('set_round_category_winner',{target_round_id:active.round.id,target_category:group.category,target_participant_id:entry?.participant_id || null,target_team_id:entry?.team_id || null})); await refresh(); }
      catch (error) { status.textContent = error.message; button.disabled = false; }
    }));
    root.querySelectorAll('[data-publish-mode]').forEach(button => button.addEventListener('click', async () => {
      const form = button.closest('form'), mode = button.dataset.publishMode;
      const status = form.querySelector('[data-publication-status]');
      const releaseValue = form.elements.namedItem('release_at').value;
      if (mode === 'scheduled' && (!releaseValue || Date.parse(releaseValue) <= Date.now())) { status.textContent = 'Choose a future release date and time.'; return; }
      if (mode === 'published' && !confirm(`Publish ${active.round.name} results now? This cannot be undone.`)) return;
      button.disabled = true; status.textContent = mode === 'draft' ? 'Saving draft…' : mode === 'scheduled' ? 'Scheduling release…' : 'Publishing results…';
      try {
        await result(client.rpc('configure_round_leaderboard',{target_round_id:active.round.id,publish_mode:mode,release_at:releaseValue ? new Date(releaseValue).toISOString() : null,score_visible:form.elements.namedItem('show_scores').checked}));
        await refresh();
      } catch (error) { status.textContent = error.message; button.disabled = false; }
    }));
  }

  function subscribe() {
    if (!active) return () => {};
    const id = active.round.id;
    const channel = client.channel(`leaderboard-${id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'competition_rounds',filter:`id=eq.${id}`}, payload => {
        if (payload.new?.leaderboard_state !== active?.data?.state) refresh();
      }).subscribe();
    const node = document.querySelector('[data-release-at]');
    let timer;
    if (node) timer = setInterval(() => {
      const value = countdown(node.dataset.releaseAt);
      const target = node.querySelector('[data-countdown]'); if (target) target.textContent = value;
      if (Date.parse(node.dataset.releaseAt) <= Date.now()) { clearInterval(timer); refresh(); }
    },1000);
    return () => { clearInterval(timer); client.removeChannel(channel); };
  }
  return { resolve, bind, subscribe };
}
