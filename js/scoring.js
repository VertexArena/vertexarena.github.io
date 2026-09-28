export function createScoring({ client, state, escapeHtml: h, refresh }) {
  let active = null;
  let filter = '', order = 'score', page = 0, expanded = null;
  const result = async query => { const { data, error } = await query; if (error) throw error; return data; };
  const message = error => error?.message || 'Scoring could not save. Try again.';
  const score = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const path = slug => `/organiser/competition/${slug}/scoring`;
  const privateView = (c, rounds, selected, data) => {
    active = { type: 'manager', c, rounds, selected, data };
    const criteria = data.criteria || [], entries = data.entries || [];
    const complete = entries.filter(row => criteria.length && row.scored_count === criteria.length).length;
    return { title: `${c.name} scoring - Vertex`, content: `<div class="page scoring-page" data-scoring-manager>
      <a class="back-link" data-link href="/organiser/competition/${h(c.slug)}/workspace"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Competition workspace</a>
      <header class="page-head compact-head"><span class="eyebrow">Organiser workspace / judging</span><h1>Score each entry.</h1><p>Define marks per criterion. Incomplete entries stay out of public scores.</p></header>
      <nav class="scoring-rounds" aria-label="Scoring rounds">${rounds.map(r => `<a class="scoring-round ${r.id === selected.id ? 'active' : ''}" data-link href="${path(c.slug)}?round=${encodeURIComponent(r.slug)}" ${r.id === selected.id ? 'aria-current="page"' : ''}><span>${String(r.sequence).padStart(2, '0')}</span>${h(r.name)}</a>`).join('')}</nav>
      <section class="scoring-overview" aria-label="Scoring progress"><div><span>Round maximum</span><strong>${score(data.max_total)}</strong><small>marks across ${criteria.length} criteria</small></div><div><span>Complete entries</span><strong>${complete}<em> / ${entries.length}</em></strong><small>${entries.length - complete} need marks</small></div><div><span>Public scores</span><strong>${data.show_scores_public ? 'Visible' : 'Hidden'}</strong><small>Complete entries only</small></div></section>
      <div class="scoring-layout"><section class="scoring-criteria-panel"><div class="scoring-section-head"><div><span class="eyebrow">Scoring rules</span><h2>Criteria</h2></div></div>
        <ol class="scoring-criteria-list">${criteria.map((criterion, index) => `<li><div class="criterion-order">${String(index + 1).padStart(2, '0')}</div><div class="criterion-copy"><strong>${h(criterion.name)}</strong><span>${h(criterion.description || 'No description')}</span><small>Maximum ${score(criterion.max_marks)} marks</small></div><div class="criterion-actions"><button type="button" data-move="${h(criterion.id)}" data-direction="-1" aria-label="Move ${h(criterion.name)} up" ${index === 0 || data.locked ? 'disabled' : ''}><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button><button type="button" data-move="${h(criterion.id)}" data-direction="1" aria-label="Move ${h(criterion.name)} down" ${index === criteria.length - 1 || data.locked ? 'disabled' : ''}><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button><button type="button" data-edit-criterion="${h(criterion.id)}" aria-label="Edit ${h(criterion.name)}" ${data.locked ? 'disabled' : ''}><i class="fa-solid fa-pen" aria-hidden="true"></i></button><button type="button" data-delete-criterion="${h(criterion.id)}" aria-label="Delete ${h(criterion.name)}" ${data.locked ? 'disabled' : ''}><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div></li>`).join('')}</ol>
        ${data.locked ? '<p class="scoring-warning">Results are finalised. Scoring is locked.</p>' : `<form data-criterion-form><h3 data-criterion-title>Add criterion</h3><input type="hidden" name="id"><label class="field"><span>Name</span><input name="name" required minlength="2" maxlength="100" placeholder="Reasoning and method"></label><div class="scoring-criterion-fields"><label class="field"><span>Maximum marks</span><input name="maximum" type="number" required min="0.01" max="100000" step="0.01" placeholder="20"></label><label class="field"><span>Description <small>Optional</small></span><textarea name="description" maxlength="1000" rows="2" placeholder="What strong work demonstrates"></textarea></label></div><div class="form-status" role="status" data-criterion-status></div><div class="scoring-form-actions"><button class="button primary" type="submit">Save criterion</button><button class="button quiet" type="button" data-cancel-criterion hidden>Cancel edit</button></div></form>`}
        <div class="scoring-visibility"><div><strong>Show scores publicly</strong><p>Only fully scored entries appear. This setting does not publish advancement or leaderboards.</p></div><label class="scoring-switch"><input type="checkbox" data-score-visibility aria-label="Show scores publicly" ${data.show_scores_public ? 'checked' : ''}></label></div><div class="form-status" role="status" data-visibility-status></div><a class="scoring-public-link" data-link href="/competition/${h(c.slug)}/scores/${h(selected.slug)}">View public score page <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
      </section><section class="scoring-roster-panel"><div class="scoring-section-head"><div><span class="eyebrow">Entry roster</span><h2>Enter marks</h2><p>${criteria.length ? `${entries.length - complete} incomplete ${entries.length - complete === 1 ? 'entry' : 'entries'}.` : 'Add a criterion before entering marks.'}</p></div></div><div class="scoring-roster-controls"><label class="field"><span>Search entries</span><input type="search" data-score-search value="${h(filter)}" placeholder="Name or @username"></label><label class="field"><span>Sort</span><select data-score-sort><option value="score" ${order === 'score' ? 'selected' : ''}>Highest score</option><option value="name" ${order === 'name' ? 'selected' : ''}>Name</option><option value="incomplete" ${order === 'incomplete' ? 'selected' : ''}>Incomplete first</option></select></label></div><div class="form-status" role="status" data-score-error></div><div data-score-list></div><div class="scoring-pagination" data-score-pagination></div></section></div></div>` };
  };
  const publicView = (c, round, data) => ({ title: `${round.name} scores - Vertex`, content: `<div class="page scoring-page scoring-public"><a class="back-link" data-link href="/competition/${h(c.slug)}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${h(c.name)}</a><header class="page-head compact-head"><span class="eyebrow">Round ${round.sequence} / scores</span><h1>${h(round.name)} scores.</h1><p>Completed scoring only. Advancement and final results are published separately.</p></header><div class="scoring-public-list">${data.entries.length ? data.entries.map((row, index) => `<article><span>${String(index + 1).padStart(2, '0')}</span><div><strong>${h(row.name)}</strong><small>${row.entry_type === 'team' ? 'Team' : `@${h(row.username)}`}</small></div><b>${score(row.total)} <small>/ ${score(data.max_total)}</small></b></article>`).join('') : '<div class="scoring-empty">No complete scores yet. Check again after judging.</div>'}</div></div>` });
  async function resolve(route) {
    const manager = route.match(/^\/organiser\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/scoring$/);
    const publicMatch = route.match(/^\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/scores\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (!manager && !publicMatch) return undefined;
    if (manager && !state.session) return { protected: true };
    const slug = (manager || publicMatch)[1];
    const c = await result(client.from('competitions').select('id,name,slug,status').eq('slug', slug).maybeSingle());
    if (!c) return null;
    const rounds = await result(client.from('competition_rounds').select('id,name,slug,sequence').eq('competition_id', c.id).order('sequence'));
    if (manager) {
      if (!await result(client.rpc('can_manage_competition', { target_competition_id: c.id })))
        return { title: 'Scoring unavailable - Vertex', content: '<div class="page scoring-page"><h1>Scoring unavailable.</h1><p>Only organisers of this competition can enter marks.</p></div>' };
      const selected = rounds.find(row => row.slug === new URLSearchParams(location.search).get('round')) || rounds[0];
      if (!selected) return null;
      const data = await result(client.rpc('round_scoring_roster', { target_round_id: selected.id }));
      return privateView(c, rounds, selected, data);
    }
    const round = rounds.find(row => row.slug === publicMatch[2]);
    if (!round) return null;
    try { return publicView(c, round, await result(client.rpc('public_round_scores', { target_round_id: round.id }))); }
    catch (error) {
      if (error.code !== '42501') throw error;
      return { title: `${round.name} scores - Vertex`, content: `<div class="page scoring-page"><a class="back-link" data-link href="/competition/${h(c.slug)}">Back to competition</a><div class="scoring-empty"><h1>Scores are private.</h1><p>The organiser has not made scores visible for this round.</p></div></div>` };
    }
  }
  function roster() {
    const list = document.querySelector('[data-score-list]');
    if (!list || active?.type !== 'manager') return;
    const { criteria, entries, max_total, locked } = active.data;
    const needle = filter.toLowerCase().trim();
    const rows = entries.filter(row => !needle || row.name.toLowerCase().includes(needle) || (row.username || '').toLowerCase().includes(needle.replace(/^@/, '')));
    rows.sort((a,b) => order === 'name' ? a.name.localeCompare(b.name) : order === 'incomplete' ? (a.scored_count - b.scored_count) || b.total - a.total : (a.scored_count === criteria.length ? 0 : 1) - (b.scored_count === criteria.length ? 0 : 1) || b.total - a.total || a.name.localeCompare(b.name));
    const start = page * 20;
    list.innerHTML = rows.length ? rows.slice(start,start + 20).map(row => {
      const id = row.participant_id || row.team_id, complete = criteria.length && row.scored_count === criteria.length;
      return `<article class="scoring-entry ${complete ? 'complete' : 'incomplete'}" data-score-entry="${h(id)}"><div class="scoring-entry-summary"><div class="scoring-entry-identity"><span class="submission-state ${complete ? 'valid' : 'missing'}">${complete ? 'Complete' : `${row.scored_count} / ${criteria.length} scored`}</span><h3>${h(row.name)}</h3><p>${row.entry_type === 'team' ? 'Team' : `Individual · @${h(row.username)}`}</p></div><div class="scoring-entry-total"><strong>${score(row.total)} <small>/ ${score(max_total)}</small></strong><button class="button secondary" type="button" data-open-score="${h(id)}" aria-expanded="${expanded === id}" ${!criteria.length ? 'disabled' : ''}>${expanded === id ? 'Close' : 'Enter marks'}</button></div></div>${expanded === id && criteria.length ? `<form data-score-form="${h(id)}" novalidate><input type="hidden" name="participant_id" value="${h(row.participant_id || '')}"><input type="hidden" name="team_id" value="${h(row.team_id || '')}"><div class="scoring-fields">${criteria.map(criterion => `<label class="field"><span>${h(criterion.name)} <small>/ ${score(criterion.max_marks)}</small></span><input type="number" data-criterion-id="${h(criterion.id)}" min="0" max="${h(criterion.max_marks)}" step="0.01" value="${row.marks?.[criterion.id] ?? ''}" ${locked ? 'disabled' : ''}></label>`).join('')}</div><p class="scoring-hint">Leave a field blank to keep it unscored. Zero is a valid mark.</p><div class="form-status" role="status" data-entry-status></div><button class="button primary" type="submit" ${locked ? 'disabled' : ''}>Save marks</button></form>` : ''}</article>`;
    }).join('') : '<div class="scoring-empty">No entries match. Try another name or username.</div>';
    const pages = Math.ceil(rows.length / 20), pagination = document.querySelector('[data-score-pagination]');
    pagination.innerHTML = pages > 1 ? `<button class="button secondary" type="button" data-score-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>Previous</button><span>Page ${page + 1} of ${pages}</span><button class="button secondary" type="button" data-score-page="${page + 1}" ${page + 1 >= pages ? 'disabled' : ''}>Next</button>` : '';
  }
  function bind() {
    if (!document.querySelector('[data-scoring-manager]')) return;
    roster();
    document.querySelector('[data-score-search]')?.addEventListener('input', event => { filter = event.target.value; page = 0; roster(); });
    document.querySelector('[data-score-sort]')?.addEventListener('change', event => { order = event.target.value; page = 0; roster(); });
    document.querySelector('[data-score-pagination]')?.addEventListener('click', event => { const button = event.target.closest('[data-score-page]'); if (button && !button.disabled) { page = Number(button.dataset.scorePage); roster(); } });
    document.querySelector('[data-score-list]')?.addEventListener('click', event => { const button = event.target.closest('[data-open-score]'); if (button) { expanded = expanded === button.dataset.openScore ? null : button.dataset.openScore; roster(); } });
    document.querySelector('[data-score-list]')?.addEventListener('submit', async event => {
      const form = event.target.closest('[data-score-form]'); if (!form) return; event.preventDefault();
      const status = form.querySelector('[data-entry-status]'), button = form.querySelector('button[type=submit]');
      const items = [...form.querySelectorAll('[data-criterion-id]')].map(input => ({ criterion_id: input.dataset.criterionId, marks: input.value === '' ? null : Number(input.value) }));
      if (items.some((item,index) => item.marks !== null && (!Number.isFinite(item.marks) || item.marks < 0 || item.marks > Number(active.data.criteria[index].max_marks) || Math.round(item.marks * 100) !== item.marks * 100))) { status.textContent = 'Marks must stay within each criterion maximum and use at most two decimals.'; return; }
      button.disabled = true; status.textContent = 'Saving marks…';
      try { await result(client.rpc('save_round_scores', { target_round_id: active.selected.id, target_participant_id: form.elements.namedItem('participant_id').value || null, target_team_id: form.elements.namedItem('team_id').value || null, score_items: items })); await refresh(); }
      catch (error) { status.textContent = message(error); button.disabled = false; }
    });
    document.querySelector('[data-criterion-form]')?.addEventListener('submit', async event => {
      event.preventDefault(); const form = event.target, status = form.querySelector('[data-criterion-status]'), button = form.querySelector('button[type=submit]');
      if (!form.reportValidity()) return;
      button.disabled = true; status.textContent = 'Saving criterion…';
      try { await result(client.rpc('save_scoring_criterion', { target_round_id: active.selected.id, target_criterion_id: form.elements.namedItem('id').value || null, criterion_name: form.elements.namedItem('name').value, criterion_max: Number(form.elements.namedItem('maximum').value), criterion_description: form.elements.namedItem('description').value })); await refresh(); }
      catch (error) { status.textContent = message(error); button.disabled = false; }
    });
    document.querySelector('[data-cancel-criterion]')?.addEventListener('click', () => resetCriterion());
    document.querySelector('.scoring-criteria-list')?.addEventListener('click', async event => {
      const edit = event.target.closest('[data-edit-criterion]'), move = event.target.closest('[data-move]'), remove = event.target.closest('[data-delete-criterion]');
      const id = edit?.dataset.editCriterion || move?.dataset.move || remove?.dataset.deleteCriterion;
      if (!id) return;
      const criterion = active.data.criteria.find(item => item.id === id);
      if (edit) {
        const form = document.querySelector('[data-criterion-form]'); form.elements.namedItem('id').value = criterion.id; form.elements.namedItem('name').value = criterion.name; form.elements.namedItem('maximum').value = criterion.max_marks; form.elements.namedItem('description').value = criterion.description; form.querySelector('[data-criterion-title]').textContent = `Edit ${criterion.name}`; form.querySelector('[data-cancel-criterion]').hidden = false; form.elements.namedItem('name').focus(); return;
      }
      if (remove && !confirm(`Delete ${criterion.name}? This is allowed only when no marks use it.`)) return;
      const status = document.querySelector('[data-criterion-status]'); status.textContent = move ? 'Reordering…' : 'Deleting…';
      try { await result(client.rpc(move ? 'move_scoring_criterion' : 'delete_scoring_criterion', move ? { target_criterion_id: id, direction: Number(move.dataset.direction) } : { target_criterion_id: id })); await refresh(); }
      catch (error) { status.textContent = message(error); }
    });
    document.querySelector('[data-score-visibility]')?.addEventListener('change', async event => {
      const toggle = event.target, status = document.querySelector('[data-visibility-status]'); toggle.disabled = true; status.textContent = 'Saving visibility…';
      try { await result(client.rpc('set_round_score_visibility', { target_round_id: active.selected.id, visible: toggle.checked })); await refresh(); }
      catch (error) { toggle.checked = !toggle.checked; toggle.disabled = false; status.textContent = message(error); }
    });
  }
  function resetCriterion() { const form = document.querySelector('[data-criterion-form]'); form.reset(); form.elements.namedItem('id').value = ''; form.querySelector('[data-criterion-title]').textContent = 'Add criterion'; form.querySelector('[data-cancel-criterion]').hidden = true; }
  return { resolve, bind };
}
