export function createMeetings({ client, state, escapeHtml: h, refresh, navigate }) {
  const result = async query => { const { data, error } = await query; if (error) throw error; return data; };
  const formatDate = value => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const formDate = value => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const route = slug => `/competition/${slug}/meetings`;
  let active = null;
  let picks = { participants: new Map(), teams: new Map() };
  let queryVersion = 0;
  let jitsi = null;
  let flash = '';

  const failure = error => error?.message || 'Could not complete this action. Try again.';
  const empty = text => `<div class="meeting-empty"><i class="fa-regular fa-calendar" aria-hidden="true"></i><p>${h(text)}</p></div>`;
  const unavailable = message => ({ title: 'Meeting unavailable - Vertex', content: `<div class="page notice-page"><h1>Meeting unavailable.</h1><p>${h(message)}</p><a class="button secondary" data-link href="/dashboard">Return to dashboard</a></div>` });
  function meetingCard(row, competition, manager) {
    const href = `/competition/${competition.slug}/meeting/${row.slug}`;
    return `<article class="meeting-card"><div><span class="meeting-card-date">${h(formatDate(row.starts_at))}</span><h3>${h(row.name)}</h3><p>${h(competition.name)}</p></div><div class="meeting-card-actions"><a class="button primary" data-link href="${href}">Open meeting <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>${manager ? `<button class="button quiet" type="button" data-meeting-roster="${h(row.id)}" aria-expanded="false">View assigned people</button>` : ''}</div>${manager ? `<div class="meeting-roster" data-roster-for="${h(row.id)}" hidden></div>` : ''}</article>`;
  }

  async function resolve(path) {
    const manageMatch = path.match(/^\/organiser\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/meetings$/);
    const listMatch = path.match(/^\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/meetings$/);
    const roomMatch = path.match(/^\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/meeting\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (!manageMatch && !listMatch && !roomMatch) return undefined;
    if (!state.session) return { protected: true };
    const slug = (manageMatch || listMatch || roomMatch)[1];
    const competition = await result(client.from('competitions').select('id,name,slug,status').eq('slug', slug).maybeSingle());
    if (!competition) return null;
    const manager = await result(client.rpc('can_manage_competition', { target_competition_id: competition.id }));
    if (manageMatch && !manager) return unavailable('Only this competition’s organisers can manage meetings.');
    if (roomMatch) {
      const meeting = await result(client.from('competition_meetings').select('id,name,slug,jitsi_room_name,starts_at').eq('competition_id', competition.id).eq('slug', roomMatch[2]).maybeSingle());
      if (!meeting) return unavailable('This meeting is available only to assigned participants and the organiser team.');
      active = { type: 'room', competition, meeting, manager };
      return { title: `${meeting.name} - Vertex`, noFooter: true, content: `<div class="meeting-room" data-meeting-room><div class="meeting-room-bar"><div><span class="eyebrow">${h(competition.name)}</span><h1>${h(meeting.name)}</h1></div><button class="button secondary" type="button" data-meeting-leave><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Leave meeting</button></div><div class="meeting-room-stage"><div class="meeting-room-status" data-meeting-status role="status" aria-live="polite"><span class="meeting-loader" aria-hidden="true"></span><strong>Connecting to meeting…</strong><p>Jitsi will ask for microphone and camera access if you choose to use them.</p></div><div class="meeting-embed" data-meeting-embed aria-label="Jitsi meeting"></div></div></div>` };
    }
    const meetings = await result(client.from('competition_meetings').select('id,name,slug,starts_at,created_at').eq('competition_id', competition.id).order('starts_at', { ascending: true }));
    active = { type: manageMatch ? 'manage' : 'list', competition, manager, meetings };
    if (manageMatch) {
      picks = { participants: new Map(), teams: new Map() };
      return { title: `${competition.name} meetings - Vertex`, content: `<div class="page meeting-page"><a class="back-link" data-link href="/organiser/competition/${h(slug)}/workspace"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Competition workspace</a><div class="page-head compact-head"><span class="eyebrow">Organiser workspace / meetings</span><h1>Bring the right people together.</h1><p>Assign registered participants or whole teams. Only invited people and organisers can open each meeting from Vertex.</p></div><div class="form-status" data-meeting-flash role="status" aria-live="polite">${h(flash)}</div><div class="meeting-layout"><section class="meeting-create" aria-labelledby="meeting-create-title"><div class="meeting-section-head"><span class="meeting-step">01</span><div><h2 id="meeting-create-title">Create a meeting</h2><p>Choose a name, start time, and attendees.</p></div></div><form data-meeting-form><label class="field"><span>Meeting name</span><input name="name" required minlength="3" maxlength="100" placeholder="Round one briefing"></label><label class="field"><span>Starts at</span><input name="starts_at" type="datetime-local" value="${formDate(Date.now() + 3600000)}" required></label><div class="meeting-picker"><label class="field"><span>Find registered people or teams</span><input data-meeting-search type="search" autocomplete="off" placeholder="Search names, @usernames, or teams"></label><div class="meeting-search-results" data-meeting-results role="group" aria-label="Available attendees"></div><div class="meeting-selected" data-meeting-selected aria-live="polite"></div></div><div class="form-status" data-meeting-error role="status" aria-live="polite"></div><button class="button primary" type="submit" data-meeting-submit>Create and notify attendees <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></form></section><section class="meeting-existing" aria-labelledby="meeting-list-title"><div class="meeting-section-head"><span class="meeting-step">02</span><div><h2 id="meeting-list-title">Scheduled meetings</h2><p>${meetings.length} meeting${meetings.length === 1 ? '' : 's'} in this competition.</p></div></div><div class="meeting-list">${meetings.length ? meetings.map(row => meetingCard(row, competition, true)).join('') : empty('No meetings yet. Create one to send invitations.')}</div></section></div></div>` };
    }
    return { title: `${competition.name} meetings - Vertex`, content: `<div class="page meeting-page"><a class="back-link" data-link href="/competition/${h(slug)}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${h(competition.name)}</a><div class="page-head compact-head"><span class="eyebrow">Competition meetings</span><h1>Your place at the table.</h1><p>Meetings assigned to you appear here. Dates and times use your local timezone.</p></div>${manager ? `<a class="button secondary meeting-manage-link" data-link href="/organiser/competition/${h(slug)}/meetings">Manage meetings</a>` : ''}<div class="meeting-list">${meetings.length ? meetings.map(row => meetingCard(row, competition, false)).join('') : empty('No meetings assigned to you yet.')}</div></div>` };
  }

  function showSelected() {
    const node = document.querySelector('[data-meeting-selected]');
    if (!node) return;
    const items = [...picks.participants.values(), ...picks.teams.values()];
    node.innerHTML = items.length ? `<strong>Selected · ${items.length}</strong><div>${items.map(item => `<button class="meeting-chip" type="button" data-meeting-remove="${h(item.type)}:${h(item.id)}" aria-label="Remove ${h(item.name)}">${h(item.name)} <i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`).join('')}</div>` : '<p>Select at least one registered participant or team.</p>';
  }
  async function search(term = '') {
    const version = ++queryVersion;
    const node = document.querySelector('[data-meeting-results]');
    if (!node || !active || active.type !== 'manage') return;
    node.innerHTML = '<p class="meeting-search-note">Finding registered attendees…</p>';
    try {
      const data = await result(client.rpc('search_meeting_assignables', { target_competition_id: active.competition.id, search_term: term, result_limit: 20 }));
      if (version !== queryVersion || !node.isConnected) return;
      const people = data.participants || [], teams = data.teams || [];
      node.innerHTML = `${teams.length ? `<span class="meeting-result-label">Registered teams</span>${teams.map(team => `<button type="button" class="meeting-result" data-meeting-pick="team:${h(team.id)}" data-name="${h(team.name)}"><i class="fa-solid fa-people-group" aria-hidden="true"></i><span><strong>${h(team.name)}</strong><small>${h(team.member_count)} members</small></span><i class="fa-solid fa-plus" aria-hidden="true"></i></button>`).join('')}` : ''}${people.length ? `<span class="meeting-result-label">Participants</span>${people.map(person => `<button type="button" class="meeting-result" data-meeting-pick="participant:${h(person.id)}" data-name="${h(person.full_name)}"><i class="fa-regular fa-user" aria-hidden="true"></i><span><strong>${h(person.full_name)}</strong><small>@${h(person.username)}</small></span><i class="fa-solid fa-plus" aria-hidden="true"></i></button>`).join('')}` : ''}${!people.length && !teams.length ? '<p class="meeting-search-note">No registered attendees match this search.</p>' : ''}`;
    } catch (error) { if (version === queryVersion && node.isConnected) node.innerHTML = `<p class="meeting-search-note">${h(failure(error))}</p>`; }
  }
  async function roster(id, node, button) {
    if (!node.hidden) { node.hidden = true; button.setAttribute('aria-expanded', 'false'); return; }
    node.hidden = false; button.setAttribute('aria-expanded', 'true');
    node.textContent = 'Loading assignments…';
    try {
      const [people, teams] = await Promise.all([
        result(client.from('meeting_participant_assignments').select('participant_id').eq('meeting_id', id)),
        result(client.from('meeting_team_assignments').select('team_id').eq('meeting_id', id))
      ]);
      const peopleRows = people.length ? await result(client.from('public_profiles').select('id,full_name,username').in('id', people.map(item => item.participant_id))) : [];
      const teamRows = teams.length ? await result(client.from('competition_teams').select('id,name').in('id', teams.map(item => item.team_id))) : [];
      node.innerHTML = `<strong>Assigned attendees</strong><ul>${teamRows.map(item => `<li><i class="fa-solid fa-people-group" aria-hidden="true"></i> Team · ${h(item.name)}</li>`).join('')}${peopleRows.map(item => `<li><i class="fa-regular fa-user" aria-hidden="true"></i> ${h(item.full_name)} · @${h(item.username)}</li>`).join('')}</ul>`;
    } catch (error) { node.textContent = failure(error); }
  }
  function bind() {
    document.querySelector('[data-meeting-leave]')?.addEventListener('click', () => navigate(`/competition/${active.competition.slug}`));
    document.querySelectorAll('[data-meeting-roster]').forEach(button => button.addEventListener('click', () => roster(button.dataset.meetingRoster, document.querySelector(`[data-roster-for="${button.dataset.meetingRoster}"]`), button)));
    const form = document.querySelector('[data-meeting-form]');
    if (!form) return;
    flash = '';
    showSelected(); search();
    let timer;
    form.querySelector('[data-meeting-search]').addEventListener('input', event => { clearTimeout(timer); timer = setTimeout(() => search(event.target.value.trim()), 180); });
    form.addEventListener('click', event => {
      const pick = event.target.closest('[data-meeting-pick]');
      const remove = event.target.closest('[data-meeting-remove]');
      if (pick) { const [type, id] = pick.dataset.meetingPick.split(':'); picks[`${type}s`].set(id, { type, id, name: pick.dataset.name }); showSelected(); }
      if (remove) { const [type, id] = remove.dataset.meetingRemove.split(':'); picks[`${type}s`].delete(id); showSelected(); }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const status = form.querySelector('[data-meeting-error]');
      const button = form.querySelector('[data-meeting-submit]');
      status.textContent = '';
      if (!picks.participants.size && !picks.teams.size) { status.textContent = 'Choose at least one registered participant or team.'; return; }
      const values = new FormData(form);
      const time = new Date(String(values.get('starts_at')));
      if (!Number.isFinite(time.getTime())) { status.textContent = 'Choose a valid start date and time.'; return; }
      button.disabled = true;
      try {
        await result(client.rpc('create_competition_meeting', { target_competition_id: active.competition.id, meeting_name: String(values.get('name')).trim(), meeting_starts_at: time.toISOString(), participant_ids: [...picks.participants.keys()], team_ids: [...picks.teams.keys()] }));
        flash = 'Meeting created. Assigned people have been notified.';
        await refresh();
      } catch (error) { status.textContent = failure(error); button.disabled = false; }
    });
  }
  function subscribe() {
    if (active?.type !== 'room' || !document.querySelector('[data-meeting-room]')) return () => {};
    let cancelled = false;
    const status = document.querySelector('[data-meeting-status]');
    const embed = document.querySelector('[data-meeting-embed]');
    const fail = () => {
      if (!status?.isConnected || cancelled) return;
      status.innerHTML = '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><strong>Could not connect to Jitsi.</strong><p>Check your connection, then try again.</p><button class="button secondary" type="button" data-meeting-retry>Try again</button>';
      status.querySelector('[data-meeting-retry]').addEventListener('click', () => { status.innerHTML = '<span class="meeting-loader" aria-hidden="true"></span><strong>Connecting to meeting…</strong>'; load(); });
    };
    const load = async () => {
      try {
        if (!window.JitsiMeetExternalAPI) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://meet.jit.si/external_api.js';
            script.async = true;
            script.onload = resolve; script.onerror = reject;
            document.head.append(script);
          });
        }
        if (cancelled || !embed.isConnected) return;
        if (!window.JitsiMeetExternalAPI) throw new Error('Jitsi unavailable');
        jitsi?.dispose();
        jitsi = new window.JitsiMeetExternalAPI('meet.jit.si', { roomName: active.meeting.jitsi_room_name, width: '100%', height: '100%', parentNode: embed, userInfo: { displayName: state.profile?.full_name || 'Vertex member' }, onload: () => { if (status.isConnected) status.hidden = true; } });
        jitsi.addListener('readyToClose', () => navigate(`/competition/${active.competition.slug}`));
        jitsi.addListener('errorOccurred', fail);
      } catch { fail(); }
    };
    load();
    return () => { cancelled = true; jitsi?.dispose(); jitsi = null; };
  }
  return { resolve, bind, subscribe };
}
