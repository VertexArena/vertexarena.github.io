export function createAchievements({ client, state, escapeHtml: h }) {
  const date = value => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
  function slot(profile = null, compact = false) {
    if (profile && profile.account_type !== 'participant') return '';
    const own = !profile || profile.id === state.session?.user.id;
    return `<section class="achievement-section ${compact ? 'achievement-compact' : ''}" data-achievements data-owner="${own}" data-username="${h(profile?.username || state.profile?.username || '')}" aria-label="Achievements"><div role="status" class="achievement-loading">Loading achievements…</div></section>`;
  }
  function card(item, privateView, newlyEarned) {
    const earned = Boolean(item.earned_at);
    return `<article class="achievement-card ${earned ? 'is-earned' : ''} ${newlyEarned ? 'achievement-new' : ''}" data-achievement="${h(item.code)}"><div class="achievement-card-head"><span class="achievement-emblem" aria-hidden="true"><i class="fa-solid fa-${h(item.icon)}"></i></span><span class="achievement-state">${earned ? '<i class="fa-solid fa-check" aria-hidden="true"></i> Earned' : 'In progress'}</span></div><h3>${h(item.title)}</h3><p>${h(item.description)}</p>${earned ? `<time datetime="${h(item.earned_at)}">Earned ${h(date(item.earned_at))}</time>` : privateView ? `<div class="achievement-progress"><label>${h(item.progress)} / ${h(item.target)}<progress value="${h(item.progress)}" max="${h(item.target)}" aria-label="${h(item.title)} progress"></progress></label></div>` : ''}</article>`;
  }
  async function load(root, live = false) {
    if (root._savingSharing) { root._refreshAfterSharing = true; return; }
    const request = root._achievementRequest = (root._achievementRequest || 0) + 1;
    const own = root.dataset.owner === 'true';
    root.setAttribute('aria-busy', 'true');
    try {
      const { data, error } = await client.rpc(own ? 'my_achievements' : 'profile_achievements', own ? {} : { target_username: root.dataset.username });
      if (error) throw error;
      if (!root.isConnected || request !== root._achievementRequest) return;
      const items = own ? data.items : data;
      const earned = items.filter(item => item.earned_at);
      const previous = root._earnedCodes || new Set(earned.map(item => item.code));
      const newAwards = live ? earned.filter(item => !previous.has(item.code)) : [];
      root._earnedCodes = new Set(earned.map(item => item.code));
      if (!own && !items.length) { root.innerHTML = ''; root.hidden = true; return; }
      root.hidden = false;
      const compact = root.classList.contains('achievement-compact');
      const sharingFocused = root.querySelector('[data-achievement-sharing]') === document.activeElement;
      const shown = compact ? [...earned.slice().sort((a,b) => Date.parse(b.earned_at)-Date.parse(a.earned_at)).slice(0,2), ...items.filter(item => !item.earned_at).sort((a,b) => b.progress/b.target-a.progress/a.target).slice(0,1)] : items;
      root.innerHTML = `<header class="achievement-heading"><div><span class="eyebrow">Your effort, recognised</span><h2>Achievements</h2><p>${own ? `${earned.length} of ${items.length} earned. Progress comes from confirmed competition activity.` : `${earned.length} earned ${earned.length === 1 ? 'achievement' : 'achievements'}.`}</p></div>${compact ? `<a class="text-link" data-link href="/profile/@${h(root.dataset.username)}">View all achievements</a>` : ''}</header>${own && !earned.length ? '<p class="achievement-start">Your first milestone awaits. Register for a competition to start your achievement record.</p>' : ''}${own && !compact ? `<label class="achievement-sharing"><input type="checkbox" data-achievement-sharing ${data.publicly_visible ? 'checked' : ''}><span><strong>Show earned achievements on my public profile</strong><small>Your progress stays private. Achievements are hidden from other people until you enable sharing.</small></span></label>` : ''}<p class="achievement-feedback" data-achievement-feedback role="status" aria-live="polite">${newAwards.length ? h(`Achievement earned: ${newAwards.map(item => item.title).join(', ')}.`) : ''}</p><div class="achievement-grid">${shown.map(item => card(item, own, newAwards.some(award => award.code === item.code))).join('')}</div>`;
      root.querySelector('[data-achievement-sharing]')?.addEventListener('change', async event => {
        const box = event.currentTarget, value = box.checked;
        const wasFocused = box === document.activeElement;
        root._savingSharing = true;
        box.disabled = true;
        const feedback = root.querySelector('[data-achievement-feedback]');
        feedback.textContent = 'Saving sharing preference…';
        const response = await client.from('profiles').update({ achievements_public: value }).eq('id', state.session.user.id);
        root._savingSharing = false;
        if (!root.isConnected) return;
        box.disabled = false;
        if (wasFocused && document.activeElement === document.body) box.focus({ preventScroll: true });
        if (response.error) { box.checked = !value; feedback.textContent = `Could not save sharing preference. ${response.error.message} Try again.`; }
        else {
          state.profile.achievements_public = value;
          feedback.textContent = value ? 'Earned achievements are now visible on your public profile.' : 'Earned achievements are now private.';
        }
        if (root._refreshAfterSharing) {
          root._refreshAfterSharing = false;
          const message = feedback.textContent;
          await load(root, true);
          const nextFeedback = root.querySelector('[data-achievement-feedback]');
          if (nextFeedback && !nextFeedback.textContent) nextFeedback.textContent = message;
        }
      });
      if (sharingFocused) root.querySelector('[data-achievement-sharing]')?.focus({ preventScroll: true });
    } catch (error) {
      if (!root.isConnected || request !== root._achievementRequest) return;
      root.innerHTML = `<div class="achievement-error" role="alert"><h2>Could not load achievements.</h2><p>${h(error.message)}</p><button class="button secondary" type="button" data-retry-achievements>Try again</button></div>`;
      root.querySelector('[data-retry-achievements]').addEventListener('click', () => load(root));
    } finally { if (request === root._achievementRequest) root.removeAttribute('aria-busy'); }
  }
  function bind() {
    const roots = [...document.querySelectorAll('[data-achievements]')];
    roots.forEach(root => load(root));
    const own = roots.filter(root => root.dataset.owner === 'true');
    if (!own.length || state.profile?.account_type !== 'participant') return () => {};
    let disposed = false, timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { if (!disposed) own.forEach(root => load(root, true)); }, 100); };
    const channel = client.channel(`achievement-progress:${state.session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participant_achievement_progress', filter: `participant_id=eq.${state.session.user.id}` }, refresh).subscribe();
    // Focus recovery also refreshes progress if Realtime was temporarily offline.
    addEventListener('focus', refresh);
    return () => { disposed = true; clearTimeout(timer); removeEventListener('focus', refresh); client.removeChannel(channel); roots.forEach(root => root._achievementRequest++); };
  }
  return { slot, bind };
}
