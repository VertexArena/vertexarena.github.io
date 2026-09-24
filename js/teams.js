import { ageMismatch } from './eligibility.js';

export function createTeams({ client, state, escapeHtml: h, setStatus, refresh }) {
  const result = async query => { const { data, error } = await query; if (error) throw error; return data; };
  const date = value => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  let activeCompetitionId = null;
  const teamPath = slug => `/competition/${h(slug)}/team`;
  const flash = () => { const message = sessionStorage.getItem('vertex-team-flash') || ''; sessionStorage.removeItem('vertex-team-flash'); return message; };
  const statusBox = message => `<div class="form-status" data-team-status role="status" aria-live="polite" ${message ? 'data-type="success"' : ''}>${h(message)}</div>`;
  const person = (name, username) => `<span class="team-person"><strong>${h(name)}</strong><small>@${h(username)}</small></span>`;
  const teamStatus = team => team.registered_at ? 'Entry confirmed' : 'Building team';

  function blockReason(c) {
    if (c.team_mode === 'individual') return 'This competition accepts individual entries only.';
    if (!state.profile?.profile_completed_at || !state.profile?.birthday) return 'Complete your profile and birthday before joining a team.';
    if (Date.now() >= Date.parse(c.registration_closes_at)) return `Registration closed ${date(c.registration_closes_at)}.`;
    return ageMismatch(c, state.profile.birthday);
  }
  function invitationCard(invitation) {
    return `<article class="team-invitation"><div><span class="eyebrow">Invitation</span><h3>${h(invitation.team_name)}</h3><p>Captain ${person(invitation.captain_name, invitation.captain_username)} invited you. Respond before ${h(date(invitation.expires_at))}.</p></div><div class="team-inline-actions"><button class="button primary" type="button" data-team-action="accept" data-id="${h(invitation.id)}">Accept invitation</button><button class="button secondary" type="button" data-team-action="decline" data-id="${h(invitation.id)}">Decline</button></div></article>`;
  }
  function seatList(c, workspace) {
    const members = workspace.members || [];
    const open = Math.min(Math.max(0, c.maximum_team_size - members.length), 2);
    return `<div class="team-seat-list">${members.map((member, index) => `<div class="team-seat"><span class="team-seat-number">${String(index + 1).padStart(2, '0')}</span>${person(member.full_name, member.username)}${member.captain ? '<span class="account-badge">Captain</span>' : workspace.team.captain_id === state.session.user.id && !workspace.team.registered_at ? `<button class="button quiet team-remove" type="button" data-team-action="remove" data-id="${h(member.id)}" aria-label="Remove ${h(member.full_name)} from team">Remove</button>` : ''}</div>`).join('')}${Array.from({ length: open }, (_, index) => `<div class="team-seat team-seat-open"><span class="team-seat-number">${String(members.length + index + 1).padStart(2, '0')}</span><span>Open seat</span></div>`).join('')}</div>`;
  }
  function teamPage(c, workspace) {
    const team = workspace.team, reason = blockReason(c), mine = team?.captain_id === state.session.user.id;
    const flashMessage = flash();
    const introduction = `<div class="page-head compact-head"><span class="eyebrow">Team entry · ${h(c.name)}</span><h1>${team ? h(team.name) : 'Build your team.'}</h1><p>${team ? 'A competition team has one captain and one confirmed roster.' : `Find classmates, accept an invitation, or create a team for ${h(c.name)}.`}</p></div>`;
    let body;
    if (team) {
      const members = workspace.members || [], pending = (workspace.sent_invitations || []).filter(invite => invite.status === 'pending');
      const capacity = `<div class="team-capacity"><strong>${members.length}<span> / ${c.maximum_team_size}</span></strong><div><span>Team members</span><small>Minimum ${c.minimum_team_size} to register · ${Math.max(0, c.maximum_team_size - members.length)} seats open</small></div></div>`;
      const sent = mine && !team.registered_at ? `<section class="team-panel" aria-labelledby="team-invites-heading"><h2 id="team-invites-heading">Invitations</h2><p>Search participant @usernames. Each pending invitation holds a seat for up to 14 days or until registration closes.</p><form data-team-invite class="team-invite-form"><label class="field"><span>Participant username</span><input name="username" type="search" required pattern="@?[A-Za-z0-9_]{3,24}" maxlength="25" placeholder="@username" autocomplete="off"></label><div class="team-suggestions" data-team-suggestions aria-label="Participant suggestions"></div><div role="status" aria-live="polite" data-team-search-status></div><button class="button secondary" type="submit">Send invitation</button></form><div class="team-sent-list">${workspace.sent_invitations.length ? workspace.sent_invitations.map(invite => `<div class="team-sent-row">${person(invite.full_name, invite.username)}<span class="team-invite-state">${h(invite.status)}</span>${invite.status === 'pending' || invite.status === 'expired' ? `<button class="button quiet" type="button" data-team-action="cancel" data-id="${h(invite.id)}">Cancel</button>` : ''}</div>`).join('') : '<p>No invitations sent yet.</p>'}</div></section>` : '';
      const category = c.categories.length ? `<label class="field"><span>Competition category</span><select name="category" required><option value="">Choose category</option>${c.categories.map(value => `<option value="${h(value)}">${h(value)}</option>`).join('')}</select></label>` : '';
      const registration = team.registered_at
        ? `<section class="team-panel team-confirmation" role="status"><span class="registration-check"><i class="fa-solid fa-check" aria-hidden="true"></i></span><span class="eyebrow">Team entry confirmed</span><h2>You're registered together.</h2><p>${h(team.name)} is registered for ${h(c.name)}${team.category ? ` in ${h(team.category)}` : ''}. The roster is locked for this competition.</p><small>Registered ${h(date(team.registered_at))}</small><a class="button secondary" data-link href="/dashboard">Open dashboard</a></section>`
        : mine ? `<section class="team-panel" aria-labelledby="team-register-heading"><h2 id="team-register-heading">Register team</h2><p>${members.length < c.minimum_team_size ? `Add ${c.minimum_team_size - members.length} more member${c.minimum_team_size - members.length === 1 ? '' : 's'} before registering.` : 'Team meets minimum size. Confirm its entry before the deadline.'} Registration opens ${h(date(c.registration_opens_at))} and closes ${h(date(c.registration_closes_at))}.</p><form data-team-register>${category}<button class="button primary" type="submit">Register team</button></form></section>`
          : `<section class="team-panel"><h2>Captain registers team</h2><p>You are on this roster. Captain can register once team reaches ${c.minimum_team_size} members.</p><button class="button quiet" type="button" data-team-action="leave" data-id="${h(team.id)}">Leave team</button></section>`;
      body = `<div class="team-workspace"><section class="team-roster" aria-labelledby="team-roster-heading"><div class="team-roster-heading"><div><span class="eyebrow">${teamStatus(team)}</span><h2 id="team-roster-heading">Team roster</h2></div><button class="button quiet" type="button" data-team-refresh>Refresh team</button></div><div class="team-live-status" role="status" aria-live="polite" data-team-live></div>${capacity}${seatList(c, workspace)}${mine && !team.registered_at && members.length === 1 && !pending.length ? `<button class="button quiet team-disband" type="button" data-team-action="disband" data-id="${h(team.id)}">Disband team</button>` : ''}</section><div class="team-side">${registration}${sent}</div></div>`;
    } else {
      const incoming = workspace.incoming_invitations || [];
      const invitations = incoming.length ? `<section class="team-inbox" aria-labelledby="team-inbox-heading"><h2 id="team-inbox-heading">Your invitations</h2>${incoming.map(invitationCard).join('')}</section>` : '';
      const create = workspace.individual_registered
        ? `<div class="team-block"><strong>Individual entry confirmed</strong><p>You already have an individual entry for this competition. One participant can hold one entry identity per competition.</p><a data-link href="/competition/${h(c.slug)}/register">View individual entry</a></div>`
        : reason ? `<div class="team-block" role="note"><strong>Team entry unavailable</strong><p>${h(reason)}</p>${!state.profile?.profile_completed_at ? '<a data-link href="/profile/edit">Complete your profile</a>' : ''}</div>`
          : `<section class="team-panel team-create" aria-labelledby="team-create-heading"><span class="eyebrow">Start here</span><h2 id="team-create-heading">Create a team</h2><p>Choose a name, then invite participants by @username. You become captain. Team names are unique within this competition.</p><form data-team-create><label class="field"><span>Team name</span><input name="name" required minlength="3" maxlength="80" placeholder="Name your team"></label><button class="button primary" type="submit">Create team</button></form></section>`;
      body = `<div class="team-start"><div>${invitations}${create}</div><aside class="team-guide"><span class="eyebrow">How team entry works</span><ol><li>Create a team or accept an invitation.</li><li>Fill ${c.minimum_team_size} to ${c.maximum_team_size} seats.</li><li>Captain registers the complete team before ${h(date(c.registration_closes_at))}.</li></ol>${c.categories.length ? '<p>Captain selects a competition category when registering.</p>' : ''}</aside></div>`;
    }
    return { title: `${team ? team.name : 'Team entry'} - ${c.name} - Vertex`, content: `<div class="page team-page" data-team-id="${h(team?.id || '')}" data-competition-id="${h(c.id)}"><a class="back-link" data-link href="/competition/${h(c.slug)}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${h(c.name)}</a>${introduction}${statusBox(flashMessage)}${body}</div>` };
  }

  function rosterPage(c, data) {
    const teams = data.teams || [], individuals = data.individuals || [];
    const pages = (kind, page, total) => `<nav class="pagination" aria-label="${kind} pages">${page ? `<a class="button secondary" data-link href="/organiser/competition/${h(c.slug)}/participants?teams=${kind === 'Team' ? page - 1 : data.team_page}&individuals=${kind === 'Individual' ? page - 1 : data.individual_page}">Previous</a>` : ''}${(page + 1) * 25 < total ? `<a class="button secondary" data-link href="/organiser/competition/${h(c.slug)}/participants?teams=${kind === 'Team' ? page + 1 : data.team_page}&individuals=${kind === 'Individual' ? page + 1 : data.individual_page}">Next</a>` : ''}</nav>`;
    return { title: `Participants - ${c.name} - Vertex`, content: `<div class="page organiser-roster"><a class="back-link" data-link href="/organiser/competition/${h(c.slug)}/workspace"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Competition workspace</a><div class="page-head compact-head"><span class="eyebrow">Organiser · ${h(c.name)}</span><h1>Participants.</h1><p>Registered teams stay together. Individual entries appear separately.</p></div><section aria-labelledby="registered-teams"><div class="team-section-heading"><h2 id="registered-teams">Teams <span>${data.team_total}</span></h2></div>${teams.length ? teams.map(team => `<article class="organiser-team-row"><div class="organiser-team-parent"><div><strong>${h(team.name)}</strong><span>${team.category ? `${h(team.category)} · ` : ''}${h(date(team.registered_at))}</span></div><span>${team.members.length} members</span></div><ul>${team.members.map(member => `<li>${person(member.full_name, member.username)}${member.captain ? '<span class="account-badge">Captain</span>' : ''}</li>`).join('')}</ul></article>`).join('') : '<p class="team-empty">No teams registered yet.</p>'}${pages('Team', data.team_page, data.team_total)}</section><section aria-labelledby="registered-individuals"><div class="team-section-heading"><h2 id="registered-individuals">Individuals <span>${data.individual_total}</span></h2></div>${individuals.length ? individuals.map(entry => `<div class="organiser-individual-row">${person(entry.full_name, entry.username)}<span>${entry.category ? h(entry.category) : 'Individual'} · ${h(date(entry.created_at))}</span></div>`).join('') : '<p class="team-empty">No individual entries yet.</p>'}${pages('Individual', data.individual_page, data.individual_total)}</section></div>` };
  }

  async function resolve(path) {
    const organiser = path.match(/^\/organiser\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/participants$/);
    if (organiser) {
      activeCompetitionId = null;
      if (!state.session) return { protected: true };
      if (state.profile?.account_type !== 'organiser') return { title: 'Organiser account required - Vertex', content: '<div class="page"><h1>Organiser account required.</h1></div>' };
      const c = await result(client.from('competitions').select('id,name,slug,owner_id').eq('slug', organiser[1]).maybeSingle());
      if (!c) return null;
      if (!(await result(client.rpc('can_manage_competition', { target_competition_id: c.id })))) return { title: 'Participants unavailable - Vertex', content: '<div class="page"><h1>Participants unavailable.</h1><p>Only this competition’s organisers can view its entries.</p></div>' };
      const params = new URLSearchParams(location.search);
      const page = key => Math.max(0, Math.min(100000, Number.parseInt(params.get(key), 10) || 0));
      const data = await result(client.rpc('organiser_competition_entries', { target_competition_id: c.id, team_page: page('teams'), individual_page: page('individuals') }));
      return rosterPage(c, data);
    }
    const match = path.match(/^\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/team$/);
    if (!match) { activeCompetitionId = null; return undefined; }
    const c = await result(client.from('competitions').select('id,name,slug,status,team_mode,minimum_team_size,maximum_team_size,categories,minimum_age,maximum_age,registration_opens_at,registration_closes_at').eq('slug', match[1]).eq('status', 'published').maybeSingle());
    if (!c) return null;
    if (!state.session) return { protected: true };
    if (state.profile?.account_type !== 'participant') return { title: 'Participant account required - Vertex', content: '<div class="page"><h1>Participant account required.</h1><p>Team entry belongs to participant accounts.</p></div>' };
    if (c.team_mode === 'individual') return { title: 'Individual entry only - Vertex', content: `<div class="page"><h1>Individual entry only.</h1><p>This competition does not accept teams.</p><a class="button primary" data-link href="/competition/${h(c.slug)}/register">Register individually</a></div>` };
    activeCompetitionId = c.id;
    const workspace = await result(client.rpc('get_competition_team_workspace', { target_competition_id: c.id }));
    return teamPage(c, workspace);
  }

  function bind() {
    const page = document.querySelector('.team-page');
    if (!page) return;
    const status = page.querySelector('[data-team-status]');
    page.querySelector('[data-team-refresh]')?.addEventListener('click', () => refresh());
    const run = async (button, rpc, args, success) => {
      button.disabled = true;
      const form = button.closest('form');
      if (form) form.inert = true;
      setStatus(status, 'Saving team changes…');
      try {
        await result(client.rpc(rpc, args));
        sessionStorage.setItem('vertex-team-flash', success);
        await refresh();
      } catch (error) {
        setStatus(status, /fetch|network/i.test(error.message || '') ? 'Could not reach Vertex. Check your connection and try again.' : error.message || 'Team change failed. Try again.', 'error');
        button.disabled = false;
        if (form) form.inert = false;
      }
    };
    page.querySelector('[data-team-create]')?.addEventListener('submit', event => {
      event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
      run(form.querySelector('button'), 'create_competition_team', { target_competition_id: page.dataset.competitionId, team_name: form.elements.name.value }, 'Team created. Invite participants to fill its roster.');
    });
    page.querySelector('[data-team-invite]')?.addEventListener('submit', event => {
      event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
      run(form.querySelector('button[type="submit"]'), 'invite_competition_team_member', { target_team_id: page.dataset.teamId, target_username: form.elements.username.value }, 'Invitation sent.');
    });
    page.querySelector('[data-team-register]')?.addEventListener('submit', event => {
      event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
      run(form.querySelector('button'), 'register_competition_team', { target_team_id: page.dataset.teamId, chosen_category: new FormData(form).get('category') || null }, 'Team registered.');
    });
    page.querySelectorAll('[data-team-action]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.teamAction, id = button.dataset.id;
      const messages = { accept: 'Invitation accepted. You joined the team.', decline: 'Invitation declined.', cancel: 'Invitation cancelled.', leave: 'You left the team.', remove: 'Member removed.', disband: 'Team disbanded.' };
      if (['leave', 'remove', 'disband'].includes(action) && !confirm(action === 'remove' ? 'Remove this member from your unregistered team?' : action === 'leave' ? 'Leave this unregistered team?' : 'Disband this team? This cannot be undone.')) return;
      const operations = {
        accept: ['respond_competition_team_invitation', { target_invitation_id: id, accept_invitation: true }],
        decline: ['respond_competition_team_invitation', { target_invitation_id: id, accept_invitation: false }],
        cancel: ['cancel_competition_team_invitation', { target_invitation_id: id }],
        leave: ['leave_competition_team', { target_team_id: id }],
        remove: ['remove_competition_team_member', { target_team_id: page.dataset.teamId, target_participant_id: id }],
        disband: ['disband_competition_team', { target_team_id: id }]
      };
      run(button, ...operations[action], messages[action]);
    }));
    const search = page.querySelector('[data-team-invite] input[name="username"]');
    if (search) {
      const suggestions = page.querySelector('[data-team-suggestions]'), feedback = page.querySelector('[data-team-search-status]');
      let revision = 0, timer;
      search.addEventListener('input', () => {
        const current = ++revision; clearTimeout(timer); suggestions.innerHTML = '';
        const query = search.value.trim().replace(/^@/, '');
        if (query.length < 2) { setStatus(feedback, 'Enter at least two characters to find participants.'); return; }
        timer = setTimeout(async () => {
          setStatus(feedback, 'Searching participants…');
          try {
            const rows = (await result(client.rpc('search_people', { search_term: query, organiser_only: false }))).filter(profile => profile.account_type === 'participant');
            if (current !== revision || !search.isConnected) return;
            suggestions.innerHTML = rows.map(profile => `<button type="button" class="person-row suggestion" data-team-suggestion="${h(profile.username)}">${person(profile.full_name, profile.username)}</button>`).join('');
            setStatus(feedback, rows.length ? `${rows.length} participants found.` : 'No participant matches. Try another username.');
          } catch (error) { if (current === revision) setStatus(feedback, error.message || 'Search failed. Try again.', 'error'); }
        }, 220);
      });
      suggestions.addEventListener('click', event => {
        const choice = event.target.closest('[data-team-suggestion]');
        if (!choice) return; ++revision; clearTimeout(timer);
        search.value = '@' + choice.dataset.teamSuggestion;
        suggestions.innerHTML = ''; setStatus(feedback, 'Participant selected. Send invitation when ready.');
        page.querySelector('[data-team-invite] button[type="submit"]').focus();
      });
    }
  }

  function subscribe(path) {
    if (!/^\/competition\/[a-z0-9-]+\/team$/.test(path) || !activeCompetitionId || !state.session) return () => {};
    const competitionId = activeCompetitionId, userId = state.session.user.id, teamId = document.querySelector('.team-page')?.dataset.teamId;
    let timer;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (location.pathname !== path) return;
        const focused = document.activeElement;
        if (focused?.matches('.team-page form input') && focused.value.trim()) {
          const live = document.querySelector('[data-team-live]');
          if (live) live.textContent = 'Team changed. Select Refresh team when ready.';
          return;
        }
        refresh();
      }, 400);
    };
    let channel = client.channel(`team-workspace:${competitionId}:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_team_members', filter: `competition_id=eq.${competitionId}` }, update)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_teams', filter: `competition_id=eq.${competitionId}` }, update)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_team_invitations', filter: `invitee_id=eq.${userId}` }, update);
    if (teamId) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'competition_team_invitations', filter: `team_id=eq.${teamId}` }, update);
    channel.subscribe();
    return () => { clearTimeout(timer); client.removeChannel(channel); };
  }

  return { resolve, bind, subscribe };
}
