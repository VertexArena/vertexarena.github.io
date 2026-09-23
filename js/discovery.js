import { fields } from './competition-model.js';
import { ageMismatch } from './eligibility.js';

export function createDiscovery({ client, state, escapeHtml: h, navigate }) {
  const pageSize = 12;
  const date = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Date not set';
  const safeColour = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#2563eb';
  const bannerStyle = c => c.banner_kind === 'gradient'
    ? `linear-gradient(125deg,${safeColour(c.banner_colour)},${safeColour(c.banner_colour_end)})`
    : safeColour(c.banner_colour);
  const params = () => new URLSearchParams(location.search);
  const selectedFields = () => params().getAll('field').filter(field => fields.includes(field));
  const mode = () => ['all', 'individual', 'team', 'both'].includes(params().get('mode')) ? params().get('mode') || 'all' : 'all';
  const sort = () => ['soonest', 'latest', 'newest'].includes(params().get('sort')) ? params().get('sort') || 'soonest' : 'soonest';
  const queryText = () => (params().get('q') || '').trim().slice(0, 100);
  const pageNumber = () => Math.max(0, Math.min(100000, Number.parseInt(params().get('page'), 10) || 0));
  const onlySaved = () => params().get('saved') === '1';
  function eligibility(c) {
    if (state.profile?.account_type !== 'participant') return null;
    return ageMismatch(c, state.profile.birthday);
  }
  function registration(c) {
    const now = Date.now();
    if (now < Date.parse(c.registration_opens_at)) return { label: 'Opens soon', detail: `Registration opens ${date(c.registration_opens_at)}` };
    if (now >= Date.parse(c.registration_closes_at)) return { label: 'Closed', detail: `Registration closed ${date(c.registration_closes_at)}` };
    return { label: 'Registration open', detail: `Closes ${date(c.registration_closes_at)}` };
  }
  const bookmark = (c, saved = false) => `<button type="button" class="discovery-bookmark" data-bookmark="${h(c.id)}" aria-label="${saved ? 'Remove' : 'Save'} ${h(c.name)} ${saved ? 'from' : 'to'} bookmarks" aria-pressed="${saved}" title="${saved ? 'Remove bookmark' : 'Save bookmark'}"><i class="fa-${saved ? 'solid' : 'regular'} fa-bookmark" aria-hidden="true"></i></button>`;
  async function imageUrl(c) {
    if (c.banner_kind !== 'image' || !c.banner_path) return null;
    const { data, error } = await client.storage.from('competition-banners').createSignedUrl(c.banner_path, 3600);
    if (error) return null;
    return data.signedUrl;
  }
  function artwork(c, url) {
    return `<div class="discovery-art" style="background:${h(bannerStyle(c))}">${url ? `<img src="${h(url)}" alt="" loading="lazy">` : `<span class="discovery-art-mark" aria-hidden="true">V<span>/${h(c.field_tags[0] || 'open')}</span></span>`}</div>`;
  }
  function card(c, saved, url) {
    const status = registration(c), mismatch = eligibility(c), org = c.organisations;
    return `<article class="discovery-card">${artwork(c, url)}<div class="discovery-card-content"><div class="discovery-card-top"><span class="discovery-state ${status.label === 'Registration open' ? 'is-open' : ''}">${h(status.label)}</span>${state.profile?.account_type === 'participant' ? bookmark(c, saved) : ''}</div><h3><a data-link href="/competition/${h(c.slug)}">${h(c.name)}</a></h3><p class="discovery-org">${org ? h(org.name) : 'Independent organiser'}</p><p class="discovery-description">${h(c.description)}</p><div class="discovery-tags">${c.field_tags.slice(0, 3).map(f => `<span>${h(f)}</span>`).join('')}</div><dl class="discovery-meta"><div><dt>Entry</dt><dd>${h(c.team_mode === 'both' ? 'Individual or team' : c.team_mode === 'team' ? 'Team' : 'Individual')}</dd></div><div><dt>Deadline</dt><dd>${h(date(c.registration_closes_at))}</dd></div><div><dt>Prize</dt><dd>${h(c.prize_details)}</dd></div></dl>${mismatch ? `<p class="discovery-age" role="note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i>${h(mismatch)}</p>` : ''}<div class="discovery-card-actions"><button type="button" class="discovery-preview-button" data-preview="${h(c.id)}">Quick preview</button><a data-link href="/competition/${h(c.slug)}">Full details <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div></div></article>`;
  }
  function controls() {
    const chosen = selectedFields();
    return `<div class="page discover-page discovery-v2"><header class="discovery-heading"><span class="eyebrow">Competition directory</span><h1>Find your next challenge.</h1><p>Search the whole field. Narrow by discipline and entry format, then check the dates that matter.</p></header><section class="discovery-controls" aria-label="Find competitions"><label class="discovery-search"><span class="visually-hidden">Search competitions by name</span><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" name="q" placeholder="Search competition names" value="${h(queryText())}" maxlength="100" autocomplete="off"></label><label class="discovery-mode">Entry format<select name="mode"><option value="all">All formats</option><option value="individual" ${mode() === 'individual' ? 'selected' : ''}>Individual</option><option value="team" ${mode() === 'team' ? 'selected' : ''}>Team</option><option value="both" ${mode() === 'both' ? 'selected' : ''}>Individual or team</option></select></label><label class="discovery-sort">Sort by<select name="sort"><option value="soonest" ${sort() === 'soonest' ? 'selected' : ''}>Soonest deadline</option><option value="latest" ${sort() === 'latest' ? 'selected' : ''}>Latest deadline</option><option value="newest" ${sort() === 'newest' ? 'selected' : ''}>Recently published</option></select></label>${state.profile?.account_type === 'participant' ? `<label class="discovery-saved"><input type="checkbox" name="saved" ${onlySaved() ? 'checked' : ''}> Saved only</label>` : ''}<fieldset class="discovery-fields"><legend>Fields</legend><div>${fields.map(f => `<label><input type="checkbox" name="field" value="${h(f)}" ${chosen.includes(f) ? 'checked' : ''}><span>${h(f)}</span></label>`).join('')}</div></fieldset></section><section class="discovery-catalogue" aria-labelledby="catalogue-title"><div class="discovery-catalogue-head"><div><span class="eyebrow">Explore</span><h2 id="catalogue-title">Competitions</h2></div><p data-discovery-count role="status" aria-live="polite">Loading competitions…</p></div><div data-discovery-results aria-busy="true" class="discovery-grid">${Array.from({length: 6}, () => '<div class="discovery-skeleton" aria-hidden="true"></div>').join('')}</div><nav class="discovery-pages" aria-label="Competition pages" data-discovery-pages></nav></section><dialog class="discovery-dialog" data-discovery-dialog aria-labelledby="preview-title"><div data-discovery-dialog-content></div><button type="button" class="discovery-dialog-close" data-close-preview aria-label="Close preview"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></dialog></div>`;
  }
  function updateUrl(update) {
    const next = params();
    Object.entries(update).forEach(([key, value]) => { next.delete(key); if (Array.isArray(value)) value.forEach(item => next.append(key, item)); else if (value) next.set(key, String(value)); });
    next.delete('page');
    history.replaceState({}, '', `/discover${next.size ? `?${next}` : ''}`);
  }
  async function load(root) {
    const requestId = root._discoveryRequest = (root._discoveryRequest || 0) + 1;
    const results = root.querySelector('[data-discovery-results]');
    const count = root.querySelector('[data-discovery-count]');
    const pages = root.querySelector('[data-discovery-pages]');
    const current = pageNumber();
    results.setAttribute('aria-busy', 'true');
    count.textContent = 'Loading competitions…';
    try {
      let ids = null;
      let saved = new Set();
      if (state.profile?.account_type === 'participant') {
        const response = await client.from('competition_bookmarks').select('competition_id').eq('participant_id', state.session.user.id);
        if (response.error) throw response.error;
        saved = new Set(response.data.map(row => row.competition_id));
        if (onlySaved()) ids = [...saved];
      }
      if (ids?.length === 0) {
        results.innerHTML = '<div class="discovery-empty"><h3>No saved competitions yet.</h3><p>Save a competition to return to it here.</p><button class="button secondary" type="button" data-show-all>Show all competitions</button></div>';
        count.textContent = '0 competitions'; pages.innerHTML = ''; return;
      }
      let query = client.from('competitions').select('id,name,slug,description,field_tags,team_mode,minimum_age,maximum_age,prize_details,registration_opens_at,registration_closes_at,starts_at,banner_kind,banner_colour,banner_colour_end,banner_path,organisations(name,slug)', { count: 'exact' }).eq('status', 'published');
      if (queryText()) query = query.ilike('name', `%${queryText().replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
      if (selectedFields().length) query = query.overlaps('field_tags', selectedFields());
      if (mode() !== 'all') query = query.eq('team_mode', mode());
      if (ids) query = query.in('id', ids);
      const response = await query.order(sort() === 'newest' ? 'published_at' : 'registration_closes_at', { ascending: sort() === 'soonest' }).order('id').range(current * pageSize, current * pageSize + pageSize - 1);
      if (response.error) throw response.error;
      if (!root.isConnected || requestId !== root._discoveryRequest) return;
      const rows = response.data || [];
      const urls = await Promise.all(rows.map(imageUrl));
      if (!root.isConnected || requestId !== root._discoveryRequest) return;
      results.innerHTML = rows.length ? rows.map((c, i) => card(c, saved.has(c.id), urls[i])).join('') : '<div class="discovery-empty"><h3>No competitions match.</h3><p>Try another name, field, or entry format.</p><button class="button secondary" type="button" data-clear-filters>Clear filters</button></div>';
      count.textContent = `${response.count || 0} competition${response.count === 1 ? '' : 's'}`;
      const pageUrl = number => { const p = params(); p.set('page', String(number)); return `/discover?${p}`; };
      pages.innerHTML = `${current ? `<a data-link class="button secondary" href="${h(pageUrl(current - 1))}">Previous</a>` : ''}${current * pageSize + rows.length < response.count ? `<a data-link class="button secondary" href="${h(pageUrl(current + 1))}">Next</a>` : ''}`;
      root._competitionRows = new Map(rows.map((c, i) => [c.id, { ...c, imageUrl: urls[i] }]));
    } catch (error) {
      if (!root.isConnected || requestId !== root._discoveryRequest) return;
      results.innerHTML = `<div class="discovery-empty" role="alert"><h3>Could not load competitions.</h3><p>${h(error.message)}</p><button class="button secondary" type="button" data-retry-discovery>Try again</button></div>`;
      count.textContent = 'Load failed'; pages.innerHTML = '';
    } finally { if (requestId === root._discoveryRequest) results.removeAttribute('aria-busy'); }
  }
  function preview(c) {
    const status = registration(c), mismatch = eligibility(c);
    return `${artwork(c, c.imageUrl)}<div class="discovery-dialog-body"><span class="eyebrow">Competition preview</span><h2 id="preview-title">${h(c.name)}</h2><p class="discovery-org">${h(c.organisations?.name || 'Independent organiser')}</p><p>${h(c.description)}</p><div class="discovery-tags">${c.field_tags.map(f => `<span>${h(f)}</span>`).join('')}</div><dl class="discovery-preview-facts"><div><dt>Entry format</dt><dd>${h(c.team_mode)}</dd></div><div><dt>Age range</dt><dd>${c.minimum_age ?? 'Any'} to ${c.maximum_age ?? 'any'}</dd></div><div><dt>Registration</dt><dd>${h(status.detail)}</dd></div><div><dt>Starts</dt><dd>${h(date(c.starts_at))}</dd></div><div><dt>Prizes</dt><dd>${h(c.prize_details)}</dd></div></dl>${mismatch ? `<p class="discovery-age">${h(mismatch)}</p>` : ''}<a class="button primary" data-link href="/competition/${h(c.slug)}">Read full details <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div>`;
  }
  async function toggle(button) {
    if (state.profile?.account_type !== 'participant') return;
    button.disabled = true;
    const saved = button.getAttribute('aria-pressed') === 'true';
    const operation = saved ? client.from('competition_bookmarks').delete().eq('competition_id', button.dataset.bookmark).eq('participant_id', state.session.user.id) : client.from('competition_bookmarks').insert({ competition_id: button.dataset.bookmark, participant_id: state.session.user.id });
    const { error } = await operation;
    button.disabled = false;
    if (error) { button.title = error.message; button.insertAdjacentHTML('afterend', `<span class="discovery-bookmark-error" role="alert">${h(error.message)}</span>`); return; }
    button.setAttribute('aria-pressed', String(!saved));
    button.setAttribute('aria-label', button.getAttribute('aria-label').replace(saved ? 'Remove' : 'Save', saved ? 'Save' : 'Remove').replace(saved ? 'from' : 'to', saved ? 'to' : 'from'));
    button.innerHTML = `<i class="fa-${saved ? 'regular' : 'solid'} fa-bookmark" aria-hidden="true"></i>`;
    if (onlySaved()) load(document.querySelector('.discovery-v2'));
  }
  function bind() {
    const root = document.querySelector('.discovery-v2');
    if (root) {
      let debounce, generation = 0;
      const refresh = () => { const token = ++generation; clearTimeout(debounce); debounce = setTimeout(() => { if (token === generation) load(root); }, 180); };
      root.querySelector('[name="q"]').addEventListener('input', e => { updateUrl({ q: e.target.value }); refresh(); });
      root.querySelector('[name="mode"]').addEventListener('change', e => { updateUrl({ mode: e.target.value === 'all' ? '' : e.target.value }); refresh(); });
      root.querySelector('[name="sort"]').addEventListener('change', e => { updateUrl({ sort: e.target.value === 'soonest' ? '' : e.target.value }); refresh(); });
      root.querySelectorAll('[name="field"]').forEach(box => box.addEventListener('change', () => { updateUrl({ field: [...root.querySelectorAll('[name="field"]:checked')].map(x => x.value) }); refresh(); }));
      root.querySelector('[name="saved"]')?.addEventListener('change', e => { updateUrl({ saved: e.target.checked ? '1' : '' }); refresh(); });
      root.addEventListener('click', e => {
        const save = e.target.closest('[data-bookmark]'); if (save) { toggle(save); return; }
        const open = e.target.closest('[data-preview]'); if (open) { const c = root._competitionRows?.get(open.dataset.preview); if (c) { root.querySelector('[data-discovery-dialog-content]').innerHTML = preview(c); root.querySelector('[data-discovery-dialog]').showModal(); } return; }
        if (e.target.closest('[data-close-preview]')) root.querySelector('[data-discovery-dialog]').close();
        if (e.target.closest('[data-show-all]')) { updateUrl({ saved: '' }); root.querySelector('[name="saved"]').checked = false; load(root); }
        if (e.target.closest('[data-clear-filters]')) { history.replaceState({}, '', '/discover'); navigate('/discover'); }
        if (e.target.closest('[data-retry-discovery]')) load(root);
      });
      load(root);
    }
    const detail = document.querySelector('.competition-public');
    if (detail && state.profile?.account_type === 'participant') {
      const mismatch = eligibility({ minimum_age: detail.dataset.minimumAge === '' ? null : Number(detail.dataset.minimumAge), maximum_age: detail.dataset.maximumAge === '' ? null : Number(detail.dataset.maximumAge) });
      if (mismatch) detail.querySelector('.competition-facts')?.insertAdjacentHTML('beforeend', `<p class="discovery-age" role="note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i>${h(mismatch)}</p>`);
      const id = detail.dataset.competitionId;
      const target = detail.querySelector('.competition-intro > div');
      if (id && target) {
        const name = detail.querySelector('h1')?.textContent || 'competition';
        target.insertAdjacentHTML('beforeend', bookmark({ id, name }));
        client.from('competition_bookmarks').select('competition_id').eq('participant_id', state.session.user.id).eq('competition_id', id).maybeSingle().then(({ data, error }) => {
          if (!error && data && target.isConnected) { const button = target.querySelector('[data-bookmark]'); button?.setAttribute('aria-pressed', 'true'); if (button) { button.setAttribute('aria-label', `Remove ${name} from bookmarks`); button.innerHTML = '<i class="fa-solid fa-bookmark" aria-hidden="true"></i>'; } }
        });
        target.querySelector('[data-bookmark]')?.addEventListener('click', e => toggle(e.currentTarget));
      }
    }
  }
  return { controls, bind };
}
