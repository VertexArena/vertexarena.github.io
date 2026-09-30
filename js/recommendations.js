// Recommendations return only this participant's public competition IDs.
// Shared discovery cards keep previews, bookmarks and detail navigation identical.
export function createRecommendations({ client, state, h, card, imageUrl, columns, filtered }) {
  const participant = () => state.profile?.account_type === 'participant';
  function shell() {
    if (!participant()) return '';
    return `<div data-recommendations ${filtered() ? 'hidden' : ''} aria-busy="true"><div class="recommendation-loading" role="status">Finding opportunities for you…</div></div>`;
  }
  async function load(root, focusedBookmark = null) {
    const target = root.querySelector('[data-recommendations]');
    if (!target || !participant()) return;
    target.hidden = filtered();
    const requestId = root._recommendationRequest = (root._recommendationRequest || 0) + 1;
    if (target.hidden) return;
    target.setAttribute('aria-busy', 'true');
    try {
      const response = await client.rpc('competition_recommendations');
      if (response.error) throw response.error;
      const picks = response.data;
      const ids = [...picks.for_you, ...picks.new_to_you].map(p => p.id);
      let rows = [], saved = new Set();
      if (ids.length) {
        const [competitions, bookmarks] = await Promise.all([
          client.from('competitions').select(columns).eq('status', 'published').gt('registration_closes_at', new Date().toISOString()).in('id', ids),
          client.from('competition_bookmarks').select('competition_id').eq('participant_id', state.session.user.id).in('competition_id', ids)
        ]);
        if (competitions.error) throw competitions.error;
        if (bookmarks.error) throw bookmarks.error;
        saved = new Set(bookmarks.data.map(b => b.competition_id));
        rows = await Promise.all(competitions.data.map(async c => ({ ...c, imageUrl: await imageUrl(c) })));
      }
      if (!root.isConnected || requestId !== root._recommendationRequest) return;
      root._recommendationRows = new Map(rows.map(c => [c.id, c]));
      const section = (kind, title, intro, empty) => `<section class="recommendation-section" data-recommendation-section="${kind}" aria-labelledby="${kind}-title"><div class="recommendation-heading"><div><span class="eyebrow">${kind === 'for_you' ? 'Your next challenge' : 'Expand your field'}</span><h2 id="${kind}-title">${title}</h2><p>${intro}</p></div>${kind === 'for_you' ? '<button type="button" class="button secondary" data-browse-catalogue>Browse full catalogue <i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>' : ''}</div><div class="discovery-grid recommendation-grid" role="group" aria-label="${title} competitions" tabindex="0">${picks[kind].map(p => { const c = root._recommendationRows.get(p.id); return c ? card(c, saved.has(c.id), c.imageUrl, p.reasons) : ''; }).join('') || `<div class="recommendation-empty">${empty}</div>`}</div></section>`;
      const restoreFocus = focusedBookmark && (document.activeElement === document.body || document.activeElement.dataset.bookmark === focusedBookmark);
      target.innerHTML = section('for_you', 'For you', picks.has_history ? 'Opportunities shaped by your entries and saved competitions.' : 'Eligible opportunities to get started. Your entries and saves will shape future picks.', picks.needs_birthday ? 'Add your birthday to <a data-link href="/profile/edit">your profile</a> to find age-eligible opportunities.' : 'No eligible opportunities with upcoming registration deadlines right now. You can still browse the full catalogue below.')
        + section('new_to_you', 'New to You', picks.has_history ? 'Explore disciplines beyond your usual entries and saves.' : 'A different set of fields to discover.', picks.needs_birthday ? 'Complete your birthday to see eligible options in new fields.' : 'No different fields available right now. New opportunities will appear here as competitions are published.')
        + '<details class="recommendation-explanation"><summary>How your picks work</summary><p>Your own registrations and bookmarks shape these suggestions. Recent activity carries more weight. We consider your birthday for age eligibility, entry format and upcoming deadlines. New to You explores fields outside that history. We use only your own history. Your birthday and bookmarks stay private; browsing is not tracked. Search and filters below always cover the full catalogue.</p></details>';
      target.hidden = filtered();
      if (restoreFocus && !target.hidden) {
        const focusTarget = target.querySelector(`[data-bookmark="${CSS.escape(focusedBookmark)}"]`) || target.querySelector('h2');
        if (focusTarget?.tagName === 'H2') focusTarget.tabIndex = -1;
        focusTarget?.focus({ preventScroll: true });
      }
    } catch (error) {
      if (!root.isConnected || requestId !== root._recommendationRequest) return;
      target.innerHTML = `<div class="recommendation-empty" role="alert"><h2>Could not load your recommendations.</h2><p>${h(error.message)}</p><button type="button" class="button secondary" data-retry-recommendations>Try again</button><p>The full catalogue is available below.</p></div>`;
    } finally {
      if (requestId === root._recommendationRequest) target.removeAttribute('aria-busy');
    }
  }
  return { shell, load };
}
