export function createAdvancement({ client, state, escapeHtml: h, refresh }) {
  const result = async query => { const { data, error } = await query; if (error) throw error; return data; };
  const managerPath = slug => `/organiser/competition/${encodeURIComponent(slug)}/advancement`;
  const progressPath = slug => `/competition/${encodeURIComponent(slug)}/progress`;
  const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  let active = null;

  function outcome(row, data) {
    if (row.provisional !== 'unresolved') return row.provisional;
    if (data.decision_mode === 'include_all') return 'advance';
    if (data.decision_mode === 'exclude_all') return 'eliminate';
    if (data.decision_mode === 'manual') return data.selected_ids.includes(row.participant_id || row.team_id) ? 'advance' : 'eliminate';
    return 'unresolved';
  }

  function decisionPanel(data) {
    if (!data.boundary_ids.length) return `<section class="advancement-decision clean"><span class="eyebrow">Cutoff check</span><h2>No cutoff tie.</h2><p>Top ${data.advancement_count} can advance automatically once every active entry is scored.</p></section>`;
    const needed = data.advancement_count - data.above_count;
    const boundary = data.entries.filter(row => row.boundary);
    return `<section class="advancement-decision" aria-labelledby="cutoff-title"><div class="advancement-decision-top"><span class="eyebrow">Cutoff decision</span><strong>${boundary.length} tied / ${needed} ${needed === 1 ? 'place' : 'places'}</strong></div><h2 id="cutoff-title">Decide boundary group.</h2><p>Only entries tied across place ${data.advancement_count} need a decision. Equal scores elsewhere keep their rank without special handling.</p>${data.decision_stale ? '<div class="advancement-alert">Scores changed. Save a fresh cutoff decision.</div>' : ''}<div class="advancement-choice-list" role="group" aria-label="Cutoff tie options">
      <button class="advancement-choice ${data.decision_mode === 'include_all' ? 'chosen' : ''}" type="button" data-decision="include_all" ${data.finalised ? 'disabled' : ''}><strong>Include all tied entries</strong><span>${boundary.length} advance; the round exceeds top ${data.advancement_count}.</span></button>
      ${data.above_count ? `<button class="advancement-choice ${data.decision_mode === 'exclude_all' ? 'chosen' : ''}" type="button" data-decision="exclude_all" ${data.finalised ? 'disabled' : ''}><strong>Exclude all tied entries</strong><span>${data.above_count} entries above the tie advance.</span></button>` : ''}
      <button class="advancement-choice ${data.decision_mode === 'manual' ? 'chosen' : ''}" type="button" data-decision="manual" ${data.finalised ? 'disabled' : ''}><strong>Choose ${needed} ${needed === 1 ? 'entry' : 'entries'}</strong><span>Select exact entries from this tie.</span></button>
      <button class="advancement-choice ${data.decision_mode === 'unresolved' ? 'chosen' : ''}" type="button" data-decision="unresolved" ${data.finalised ? 'disabled' : ''}><strong>Leave unresolved</strong><span>Keep judging open. Finalisation stays blocked.</span></button>
    </div><form data-manual-form ${data.finalised ? 'hidden' : ''}><fieldset><legend>Manual selection · choose exactly ${needed}</legend>${boundary.map(row => `<label class="advancement-manual-row"><input type="checkbox" value="${h(row.participant_id || row.team_id)}" ${data.selected_ids.includes(row.participant_id || row.team_id) ? 'checked' : ''}><span>${h(row.name)} <small>${row.entry_type === 'team' ? 'Team' : `@${h(row.username)}`}</small></span><b>${number(row.total)}</b></label>`).join('')}</fieldset><button class="button secondary" type="submit">Save manual selection</button></form></section>`;
  }

  function managerView(c, rounds, round, data) {
    const complete = data.entries.filter(row => row.provisional !== 'incomplete').length;
    const ready = data.criteria_count > 0 && data.entry_count > 0 && !data.incomplete_count && (!data.boundary_ids.length || data.decision_mode !== 'unresolved');
    active = { c, rounds, round, data };
    const sorted = [...data.entries].sort((a, b) => (a.rank == null) - (b.rank == null) || (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
    return { title: `${c.name} advancement - Vertex`, content: `<div class="page advancement-page" data-advancement-manager><a class="back-link" data-link href="/organiser/competition/${h(c.slug)}/workspace"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Competition workspace</a><header class="page-head compact-head"><span class="eyebrow">Organiser workspace / round outcomes</span><h1>Draw the line.</h1><p>Provisional rank follows completed scores. Resolve only ties that cross the advancement cutoff.</p></header><nav class="scoring-rounds" aria-label="Advancement rounds">${rounds.map(item => `<a class="scoring-round ${item.id === round.id ? 'active' : ''}" data-link href="${managerPath(c.slug)}?round=${encodeURIComponent(item.slug)}" ${item.id === round.id ? 'aria-current="page"' : ''}><span>${String(item.sequence).padStart(2, '0')}</span>${h(item.name)}</a>`).join('')}</nav><section class="advancement-summary" aria-label="Round advancement summary"><div><span>Cutoff</span><strong>Top ${data.advancement_count}</strong><small>${h(round.name)}</small></div><div><span>Scored</span><strong>${complete} / ${data.entry_count}</strong><small>${data.incomplete_count} incomplete</small></div><div><span>Decision</span><strong>${data.finalised ? 'Finalised' : data.boundary_ids.length ? data.decision_mode === 'unresolved' ? 'Unresolved' : 'Saved' : 'Automatic'}</strong><small>${data.boundary_ids.length ? `${data.boundary_ids.length} on boundary` : 'No boundary tie'}</small></div></section><div class="advancement-layout"><section class="advancement-ranking"><div class="advancement-section-head"><div><span class="eyebrow">Ranked entries</span><h2>${data.finalised ? 'Final result' : 'Provisional order'}</h2></div><a class="button quiet" data-link href="/organiser/competition/${h(c.slug)}/scoring?round=${h(round.slug)}">Edit scores <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a></div><div class="advancement-legend"><span>Boundary only</span><i aria-hidden="true"></i><small>Same score across cutoff</small></div><ol class="advancement-rows">${sorted.map(row => { const state = outcome(row, data); return `<li class="advancement-row ${row.boundary ? 'boundary' : ''}" data-advancement-entry="${h(row.participant_id || row.team_id)}"><span class="advancement-rank">${row.rank ?? '—'}</span><div class="advancement-person"><strong>${h(row.name)}</strong><small>${row.entry_type === 'team' ? 'Team' : `@${h(row.username)}`}</small></div><b>${number(row.total)}</b><span class="advancement-outcome ${state}">${state === 'advance' ? data.finalised && data.is_final_round ? 'Winner' : 'Advance' : state === 'eliminate' ? 'Eliminated' : state === 'incomplete' ? 'Incomplete' : 'Decision needed'}</span></li>`; }).join('')}</ol>${!sorted.length ? '<p class="advancement-empty">No registered entries in this round.</p>' : ''}</section><aside>${decisionPanel(data)}<section class="advancement-finalise"><span class="eyebrow">Result state</span><h2>${data.finalised ? 'Round locked.' : 'Finalise advancement.'}</h2><p>${data.finalised ? 'Scores and decisions are locked. Advanced entries now form the next round roster.' : data.incomplete_count ? `Score ${data.incomplete_count} remaining ${data.incomplete_count === 1 ? 'entry' : 'entries'} before finalising.` : data.boundary_ids.length && data.decision_mode === 'unresolved' ? 'Save a cutoff decision first. Results cannot be published while this tie remains unresolved.' : 'Finalisation writes permanent round outcomes and activates advancing entries in the next round.'}</p><div class="form-status" data-advancement-status role="status" aria-live="polite"></div>${data.finalised ? `<time>Finalised ${h(new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.finalised_at)))}</time>` : `<button class="button primary" type="button" data-finalise ${ready ? '' : 'disabled'}>Finalise round <i class="fa-solid fa-check" aria-hidden="true"></i></button>`}</section></aside></div></div>` };
  }

  function participantView(c, rounds, progress) {
    const byId = new Map(progress.map(item => [item.round_id, item]));
    return { title: `${c.name} progress - Vertex`, content: `<div class="page advancement-page progress-page"><a class="back-link" data-link href="/competition/${h(c.slug)}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${h(c.name)}</a><header class="page-head compact-head"><span class="eyebrow">Your competition / round history</span><h1>Every round counts.</h1><p>Published results stay here. Team outcomes apply to eligible members.</p></header><ol class="progress-timeline">${rounds.map(round => { const item = byId.get(round.id); const label = item?.status === 'winner' ? 'Winner' : item?.status === 'advanced' ? 'Advanced' : item?.status === 'eliminated' ? 'Eliminated' : 'Awaiting result'; return `<li class="progress-step ${item?.status || 'pending'}"><span class="progress-sequence">${String(round.sequence).padStart(2, '0')}</span><div><span class="eyebrow">Round ${round.sequence}</span><h2>${h(round.name)}</h2><p>${item ? item.status === 'eliminated' ? 'Your competition run ended after this round.' : item.status === 'winner' ? 'Final round completed.' : 'You are eligible for the next round.' : 'No published outcome yet.'}</p>${item?.tags?.length ? `<div class="progress-tags">${item.tags.map(tag => `<span>${h(tag.replaceAll('_', ' '))}</span>`).join('')}</div>` : ''}${item ? `<a class="progress-result-link" data-link href="/competition/${h(c.slug)}/leaderboard/${h(round.slug)}">View leaderboard</a>` : ''}</div><strong>${label}</strong></li>`; }).join('')}</ol></div>` };
  }

  async function resolve(route) {
    const manager = route.match(/^\/organiser\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/advancement$/);
    const participant = route.match(/^\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/progress$/);
    if (!manager && !participant) return undefined;
    if (!state.session) return { protected: true };
    const slug = (manager || participant)[1];
    const c = await result(client.from('competitions').select('id,name,slug,status').eq('slug', slug).maybeSingle());
    if (!c) return null;
    const rounds = await result(client.from('competition_rounds').select('id,name,slug,sequence,advancement_count').eq('competition_id', c.id).order('sequence'));
    if (manager) {
      if (!await result(client.rpc('can_manage_competition', { target_competition_id: c.id }))) return { title: 'Advancement unavailable - Vertex', content: '<div class="page notice-page"><h1>Advancement unavailable.</h1><p>Only this competition’s organisers can review and finalise outcomes.</p></div>' };
      const round = rounds.find(item => item.slug === new URLSearchParams(location.search).get('round')) || rounds[0];
      if (!round) return null;
      return managerView(c, rounds, round, await result(client.rpc('round_advancement_preview', { target_round_id: round.id })));
    }
    if (state.profile?.account_type !== 'participant') return { title: 'Progress unavailable - Vertex', content: '<div class="page notice-page"><h1>Participant account required.</h1></div>' };
    const progress = await result(client.rpc('my_round_progress', { target_competition_id: c.id }));
    return participantView(c, rounds, progress);
  }

  function bind() {
    const root = document.querySelector('[data-advancement-manager]');
    if (!root || !active) return;
    const status = root.querySelector('[data-advancement-status]');
    root.querySelectorAll('[data-decision]').forEach(button => button.addEventListener('click', async () => {
      if (button.dataset.decision === 'manual') { root.querySelector('[data-manual-form] input')?.focus(); return; }
      button.disabled = true; status.textContent = 'Saving decision…';
      try { await result(client.rpc('set_round_cutoff_decision', { target_round_id: active.round.id, decision_mode: button.dataset.decision, chosen_ids: [] })); await refresh(); }
      catch (error) { status.textContent = error.message; button.disabled = false; }
    }));
    root.querySelector('[data-manual-form]')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, selected = [...form.querySelectorAll('input:checked')].map(input => input.value);
      const needed = active.data.advancement_count - active.data.above_count;
      if (selected.length !== needed) { status.textContent = `Choose exactly ${needed} tied ${needed === 1 ? 'entry' : 'entries'}.`; return; }
      const button = form.querySelector('button[type=submit]'); button.disabled = true; status.textContent = 'Saving selection…';
      try { await result(client.rpc('set_round_cutoff_decision', { target_round_id: active.round.id, decision_mode: 'manual', chosen_ids: selected })); await refresh(); }
      catch (error) { status.textContent = error.message; button.disabled = false; }
    });
    root.querySelector('[data-finalise]')?.addEventListener('click', async event => {
      if (!confirm(`Finalise ${active.round.name} advancement? Scores and cutoff decisions will lock.`)) return;
      const button = event.currentTarget; button.disabled = true; status.textContent = 'Finalising round…';
      try { await result(client.rpc('finalise_round_advancement', { target_round_id: active.round.id })); await refresh(); }
      catch (error) { status.textContent = error.message; button.disabled = false; }
    });
  }
  return { resolve, bind };
}
