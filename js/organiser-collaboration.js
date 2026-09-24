export function createOrganiserCollaboration({ client, state, escapeHtml: h, setStatus, refresh }) {
  const result = async query => { const { data, error } = await query; if (error) throw error; return data; };
  const date = value => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const person = profile => `<span class="team-person"><strong>${h(profile?.full_name || 'Organiser')}</strong><small>@${h(profile?.username || 'unknown')}</small></span>`;
  const flash = () => { const message = sessionStorage.getItem('vertex-organiser-flash'); sessionStorage.removeItem('vertex-organiser-flash'); return message; };
  const message = text => `<div class="form-status" data-collab-status role="status" aria-live="polite"${text ? ' data-type="success"' : ''}>${h(text || '')}</div>`;

  async function inbox() {
    const invitations = await result(client.rpc('my_competition_organiser_invitations'));
    return `<section class="dashboard-section collaboration-inbox" aria-labelledby="organiser-invitations"><div class="dashboard-section-head"><div><span class="eyebrow">Respond</span><h2 id="organiser-invitations">Competition invitations</h2></div><span class="dashboard-section-note">${invitations.length} waiting</span></div>${message(flash())}${invitations.length ? invitations.map(item => `<article class="collaboration-invitation"><div><strong>${h(item.competition_name)}</strong><p>${h(item.owner_name)} (@${h(item.owner_username)}) invited you as a manager. Respond before ${h(date(item.expires_at))}.</p></div><div class="team-inline-actions"><button class="button primary" type="button" data-collab-action="accept" data-id="${h(item.id)}">Accept invitation</button><button class="button secondary" type="button" data-collab-action="decline" data-id="${h(item.id)}">Decline</button></div></article>`).join('') : '<div class="dashboard-empty"><strong>No invitations waiting.</strong><p>Competition invitations appear here when an owner asks you to help manage.</p></div>'}</section>`;
  }

  async function teamPage(slug) {
    const c = await result(client.from('competitions').select('id,name,slug,owner_id,organisation_id').eq('slug', slug).maybeSingle());
    if (!c) return null;
    const allowed = await result(client.rpc('can_manage_competition', { target_competition_id: c.id }));
    if (!allowed) return { title: 'Organiser team unavailable - Vertex', content: '<div class="page"><h1>Organiser team unavailable.</h1><p>Only this competition’s organisers can open its team.</p></div>' };
    const owner = c.owner_id === state.session.user.id;
    const [members, invitations] = await Promise.all([
      result(client.from('competition_organisers').select('organiser_id,role,joined_at').eq('competition_id', c.id).order('joined_at')),
      owner ? result(client.from('competition_organiser_invitations').select('id,organiser_id,status,created_at,expires_at').eq('competition_id', c.id).order('created_at', { ascending: false })) : Promise.resolve([])
    ]);
    const ids = [...new Set([c.owner_id, ...members.map(m => m.organiser_id), ...invitations.map(i => i.organiser_id)])];
    const profiles = ids.length ? await result(client.from('public_profiles').select('id,full_name,username').in('id', ids)) : [];
    const byId = new Map(profiles.map(profile => [profile.id, profile]));
    const memberRow = (id, role, joinedAt) => `<div class="collaboration-row">${person(byId.get(id))}<div class="collaboration-role"><span class="account-badge">${h(role)}</span>${joinedAt ? `<small>Joined ${h(date(joinedAt))}</small>` : '<small>Permanent owner</small>'}</div>${role === 'manager' && (owner || id === state.session.user.id) ? `<button type="button" class="button quiet" data-collab-action="remove" data-id="${h(id)}" data-competition-id="${h(c.id)}">${owner ? 'Remove manager' : 'Leave team'}</button>` : ''}</div>`;
    const active = memberRow(c.owner_id, 'Owner', null) + members.map(m => memberRow(m.organiser_id, 'manager', m.joined_at)).join('');
    const pending = invitations.filter(i => i.status === 'pending' && Date.parse(i.expires_at) > Date.now());
    const pendingRows = pending.length ? pending.map(i => `<div class="collaboration-row">${person(byId.get(i.organiser_id))}<div class="collaboration-role"><span class="account-badge">Pending</span><small>Expires ${h(date(i.expires_at))}</small></div><button type="button" class="button quiet" data-collab-action="cancel" data-id="${h(i.id)}">Cancel invitation</button></div>`).join('') : '<p class="team-empty">No pending invitations.</p>';
    const invite = owner ? `<section class="collaboration-panel" aria-labelledby="collab-invite-heading"><span class="eyebrow">Owner control</span><h2 id="collab-invite-heading">Invite a manager</h2><p>Managers can edit competition details and view participants. Only you can invite or remove other managers.</p><form data-collab-invite data-competition-id="${h(c.id)}"><label class="field"><span>Organiser username</span><input type="search" name="username" required pattern="@?[A-Za-z0-9_]{3,24}" maxlength="25" placeholder="@username" autocomplete="off"></label><div class="collaboration-suggestions" data-collab-suggestions></div><div role="status" aria-live="polite" data-collab-search-status></div><button class="button primary" type="submit">Send invitation</button></form></section>` : '<div class="collaboration-panel"><h2>Manager access</h2><p>You can edit competition details and review participants. Ask the owner to change organiser access.</p></div>';
    return { title: `Organiser team - ${c.name} - Vertex`, content: `<div class="page collaboration-page"><a class="back-link" data-link href="/organiser/competition/${h(c.slug)}/workspace"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Competition workspace</a><div class="page-head compact-head"><span class="eyebrow">Competition collaboration</span><h1>Organiser team.</h1><p>${h(c.name)} · One permanent owner, with invited managers.</p></div>${message(flash())}<div class="collaboration-layout"><div><section class="collaboration-panel collaboration-roster" aria-labelledby="collab-team-heading"><h2 id="collab-team-heading">Current organisers <span class="account-badge">${members.length + 1}</span></h2><div class="collaboration-list">${active}</div></section>${owner ? `<section class="collaboration-panel" aria-labelledby="collab-pending-heading"><h2 id="collab-pending-heading">Pending invitations</h2><div class="collaboration-list">${pendingRows}</div></section>` : ''}</div><aside>${invite}</aside></div></div>` };
  }

  async function resolve(path) {
    const match = path.match(/^\/organiser\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/organisers$/);
    if (!match) return undefined;
    if (!state.session) return { protected: true };
    if (state.profile?.account_type !== 'organiser') return { title: 'Organiser account required - Vertex', content: '<div class="page"><h1>Organiser account required.</h1></div>' };
    return teamPage(match[1]);
  }

  function bind() {
    document.querySelectorAll('[data-collab-action]').forEach(button => button.addEventListener('click', async () => {
      const action = button.dataset.collabAction;
      if (action === 'remove' && !confirm(button.textContent.trim() === 'Leave team' ? 'Leave this competition organiser team?' : 'Remove this manager from the competition?')) return;
      button.disabled = true;
      const status = document.querySelector('[data-collab-status]');
      setStatus(status, 'Saving organiser access…');
      try {
        const call = action === 'accept' || action === 'decline'
          ? client.rpc('respond_competition_organiser_invitation', { invitation_id: button.dataset.id, accept_invitation: action === 'accept' })
          : action === 'remove'
            ? client.rpc('remove_competition_organiser', { target_competition_id: button.dataset.competitionId, target_organiser_id: button.dataset.id })
            : client.rpc('cancel_competition_organiser_invitation', { invitation_id: button.dataset.id });
        await result(call);
        sessionStorage.setItem('vertex-organiser-flash', action === 'accept' ? 'Invitation accepted. Competition now appears in your dashboard.' : action === 'decline' ? 'Invitation declined.' : action === 'remove' ? 'Organiser access removed.' : 'Invitation cancelled.');
        if (action === 'remove' && button.textContent.trim() === 'Leave team') history.replaceState({}, '', '/organiser');
        await refresh();
      } catch (error) { setStatus(status, error.message, 'error'); button.disabled = false; }
    }));
    const form = document.querySelector('[data-collab-invite]');
    if (!form) return;
    const input = form.querySelector('[name="username"]');
    const suggestions = form.querySelector('[data-collab-suggestions]');
    const searchStatus = form.querySelector('[data-collab-search-status]');
    let revision = 0;
    input.addEventListener('input', async () => {
      const current = ++revision;
      const query = input.value.replace(/^@/, '').trim();
      suggestions.innerHTML = '';
      if (query.length < 2) { searchStatus.textContent = ''; return; }
      searchStatus.textContent = 'Searching organisers…';
      try {
        const rows = await result(client.rpc('search_people', { search_term: query, organiser_only: true }));
        if (current !== revision || !form.isConnected) return;
        suggestions.innerHTML = rows.length ? rows.map(profile => `<button type="button" data-collab-suggestion="${h(profile.username)}">${person(profile)}</button>`).join('') : '<p>No organiser found.</p>';
        searchStatus.textContent = `${rows.length} organiser${rows.length === 1 ? '' : 's'} found.`;
        suggestions.querySelectorAll('[data-collab-suggestion]').forEach(choice => choice.addEventListener('click', () => {
          ++revision; input.value = '@' + choice.dataset.collabSuggestion; suggestions.innerHTML = ''; searchStatus.textContent = 'Organiser selected.';
        }));
      } catch (error) { if (current === revision) searchStatus.textContent = error.message; }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      const status = document.querySelector('[data-collab-status]');
      setStatus(status, 'Sending invitation…');
      try {
        await result(client.rpc('invite_competition_organiser', { target_competition_id: form.dataset.competitionId, target_username: input.value }));
        sessionStorage.setItem('vertex-organiser-flash', 'Invitation sent. Manager access begins after acceptance.');
        await refresh();
      } catch (error) { setStatus(status, error.message, 'error'); button.disabled = false; }
    });
  }
  return { resolve, bind, inbox };
}
