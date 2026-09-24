export function createAnnouncements({ client, state, escapeHtml: h, refresh }) {
  const result = async query => { const { data, error } = await query; if (error) throw error; return data; };
  const date = value => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const errorText = error => error?.message || 'Could not complete this action. Try again.';
  let active = null;
  let visibleCount = 30;

  async function feed(competitionId) {
    const rows = [];
    let total = 0;
    for (let offset = 0; offset < visibleCount; offset += 1000) {
      const { data, error, count } = await client.from('competition_announcements')
        .select('id,competition_id,author_id,title,body,created_at,updated_at', { count: offset ? undefined : 'exact' })
        .eq('competition_id', competitionId).order('created_at', { ascending: false })
        .range(offset, Math.min(offset + 999, visibleCount - 1));
      if (error) throw error;
      if (!offset) total = count || 0;
      rows.push(...data);
      if (rows.length >= total) break;
    }
    const authors = [...new Set(rows.map(row => row.author_id))];
    const people = authors.length ? await result(client.from('public_profiles').select('id,full_name,username').in('id', authors)) : [];
    const byId = new Map(people.map(person => [person.id, person]));
    return { rows: rows.map(row => ({ ...row, author: byId.get(row.author_id) })), total };
  }
  function item(row, manager, ownerId, focused) {
    const author = row.author;
    const canEdit = manager && (row.author_id === state.session?.user.id || ownerId === state.session?.user.id);
    return `<article class="announcement-item ${focused === row.id ? 'announcement-focused' : ''}" id="announcement-${h(row.id)}" tabindex="-1"><div class="announcement-rail"><span class="announcement-node" aria-hidden="true"></span></div><div class="announcement-card"><div class="announcement-meta"><span>${h(author?.full_name || 'Organiser')}<small>${author?.username ? `@${h(author.username)}` : 'Organiser'}</small></span><time datetime="${h(row.created_at)}">${h(date(row.created_at))}</time></div><h2>${h(row.title)}</h2><p class="announcement-body">${h(row.body)}</p>${row.updated_at !== row.created_at ? `<small class="announcement-edited">Edited ${h(date(row.updated_at))}</small>` : ''}${canEdit ? `<div class="announcement-actions"><button class="button quiet" type="button" data-announcement-edit="${h(row.id)}">Edit</button><button class="button quiet" type="button" data-announcement-delete="${h(row.id)}">Delete</button></div>` : ''}</div></article>`;
  }
  function unavailable(message) {
    return { title: 'Announcements unavailable - Vertex', content: `<div class="page notice-page"><h1>Announcements unavailable.</h1><p>${h(message)}</p><a class="button secondary" data-link href="/discover">Explore competitions</a></div>` };
  }
  async function syncFeed() {
    const list = document.querySelector('.announcement-feed');
    if (!list || !active) return;
    const competitionId = active.competition.id;
    const data = await feed(competitionId);
    if (!list.isConnected || active?.competition.id !== competitionId) return;
    const focusedId = location.pathname.split('/')[4];
    let rows = data.rows;
    if (focusedId && !rows.some(row => row.id === focusedId)) {
      const focused = active.rows.find(row => row.id === focusedId);
      if (focused) rows = [focused, ...rows];
    }
    active.rows = rows;
    active.total = data.total;
    list.innerHTML = rows.length ? rows.map(row => item(row, active.manager, active.competition.owner_id, focusedId)).join('')
      : '<div class="empty compact-empty"><span class="empty-marker" aria-hidden="true"><i class="fa-solid fa-bullhorn"></i></span><div><h2>No announcements yet.</h2><p>Published messages from the organiser team will appear here.</p></div></div>';
    document.querySelector('.announcement-section-head span').textContent = `${data.total} update${data.total === 1 ? '' : 's'}`;
    const more = document.querySelector('[data-announcement-more]');
    if (more) more.hidden = data.total <= visibleCount;
    bindItems();
  }
  async function resolve(path) {
    const match = path.match(/^\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/announcements(?:\/([0-9a-f-]{36}))?$/);
    if (!match) return undefined;
    if (!state.session) return { protected: true };
    const slug = match[1];
    const competition = await result(client.from('competitions').select('id,name,slug,status,owner_id').eq('slug', slug).maybeSingle());
    if (!competition) return null;
    const [{ data: allowed, error: allowedError }, { data: manager, error: managerError }] = await Promise.all([
      client.rpc('can_read_competition_announcements', { target_competition_id: competition.id }),
      client.rpc('can_manage_competition', { target_competition_id: competition.id })
    ]);
    if (allowedError) throw allowedError;
    if (managerError) throw managerError;
    if (!allowed) return unavailable('This feed is for registered participants and the competition organiser team.');
    if (active?.competition.id !== competition.id) visibleCount = 30;
    const data = await feed(competition.id);
    let { rows } = data;
    if (match[2] && !rows.some(row => row.id === match[2])) {
      const focused = await result(client.from('competition_announcements').select('id,competition_id,author_id,title,body,created_at,updated_at').eq('id', match[2]).eq('competition_id', competition.id).maybeSingle());
      if (!focused) return unavailable('This announcement is no longer available.');
      const author = await result(client.from('public_profiles').select('id,full_name,username').eq('id', focused.author_id).maybeSingle());
      rows = [{ ...focused, author }, ...rows];
    }
    active = { competition, manager, rows, total: data.total };
    return { title: `${competition.name} announcements - Vertex`, content: `<div class="page announcement-page" data-announcement-competition="${h(competition.id)}"><a class="back-link" data-link href="/competition/${h(slug)}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${h(competition.name)}</a><div class="page-head compact-head"><span class="eyebrow">Competition notices</span><h1>Announcements.</h1><p>Updates from the organiser team, kept in one place.</p></div><div class="announcement-layout"><section class="announcement-main" aria-label="Announcement history"><div class="announcement-section-head"><h2>History</h2><span>${data.total} update${data.total === 1 ? '' : 's'}</span></div><div class="announcement-feed">${rows.length ? rows.map(row => item(row, manager, competition.owner_id, match[2])).join('') : `<div class="empty compact-empty"><span class="empty-marker" aria-hidden="true"><i class="fa-solid fa-bullhorn"></i></span><div><h2>No announcements yet.</h2><p>Published messages from the organiser team will appear here.</p></div></div>`}</div>${data.total > visibleCount ? '<button class="button secondary announcement-more" type="button" data-announcement-more>Load older announcements</button>' : ''}</section>${manager ? `<aside class="announcement-compose"><span class="eyebrow">Organiser broadcast</span><h2>Write an update.</h2><p>Every registered participant receives an in-app notification when you publish.</p><div class="form-status" data-announcement-status role="status" aria-live="polite"></div><form data-announcement-form><input type="hidden" name="announcement_id"><label class="field"><span>Heading</span><input name="heading" maxlength="160" required placeholder="What participants need to know"></label><label class="field"><span>Message</span><textarea name="message" rows="8" maxlength="5000" required placeholder="Share a clear update with your participants."></textarea></label><div class="announcement-form-actions"><button class="button primary" type="submit" data-announcement-submit>Publish announcement</button><button class="button quiet" type="button" data-announcement-cancel hidden>Cancel edit</button></div></form></aside>` : ''}</div></div>` };
  }
  function bind() {
    const form = document.querySelector('[data-announcement-form]');
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const status = document.querySelector('[data-announcement-status]');
      const submit = form.querySelector('[data-announcement-submit]');
      const id = form.elements.announcement_id.value;
      submit.disabled = true;
      status.textContent = id ? 'Saving announcement…' : 'Publishing announcement…';
      const functionName = id ? 'edit_competition_announcement' : 'publish_competition_announcement';
      const args = id ? { target_announcement_id: id, heading: form.elements.heading.value, message: form.elements.message.value }
        : { target_competition_id: active.competition.id, heading: form.elements.heading.value, message: form.elements.message.value };
      const { error } = await client.rpc(functionName, args);
      submit.disabled = false;
      if (error) { status.textContent = errorText(error); status.dataset.type = 'error'; return; }
      form.reset(); form.elements.announcement_id.value = '';
      submit.textContent = 'Publish announcement';
      form.querySelector('[data-announcement-cancel]').hidden = true;
      status.textContent = id ? 'Announcement saved.' : 'Announcement published.';
      status.dataset.type = 'success';
      await syncFeed();
    });
    form?.querySelector('[data-announcement-cancel]')?.addEventListener('click', () => {
      form.reset(); form.elements.announcement_id.value = '';
      form.querySelector('[data-announcement-submit]').textContent = 'Publish announcement';
      form.querySelector('[data-announcement-cancel]').hidden = true;
      document.querySelector('[data-announcement-status]').textContent = '';
    });
    bindItems();
    document.querySelector('[data-announcement-more]')?.addEventListener('click', () => { visibleCount += 30; refresh(); });
    const focusId = location.pathname.split('/')[4];
    if (focusId) requestAnimationFrame(() => document.getElementById(`announcement-${focusId}`)?.scrollIntoView({ block: 'center' }));
  }
  function bindItems() {
    document.querySelectorAll('[data-announcement-edit]').forEach(button => button.addEventListener('click', () => {
      const row = active.rows.find(item => item.id === button.dataset.announcementEdit);
      const form = document.querySelector('[data-announcement-form]');
      if (!row || !form) return;
      form.elements.announcement_id.value = row.id;
      form.elements.heading.value = row.title;
      form.elements.message.value = row.body;
      form.querySelector('[data-announcement-submit]').textContent = 'Save changes';
      form.querySelector('[data-announcement-cancel]').hidden = false;
      form.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      form.elements.heading.focus({ preventScroll: true });
    }));
    document.querySelectorAll('[data-announcement-delete]').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('Delete this announcement and its notifications?')) return;
      button.disabled = true;
      const { error } = await client.rpc('delete_competition_announcement', { target_announcement_id: button.dataset.announcementDelete });
      if (error) { button.disabled = false; alert(errorText(error)); return; }
      refresh();
    }));
  }
  function subscribe(path) {
    const competitionId = document.querySelector('[data-announcement-competition]')?.dataset.announcementCompetition;
    if (!competitionId) return () => {};
    const channel = client.channel(`vertex-announcements-${competitionId}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_announcements', filter: `competition_id=eq.${competitionId}` }, () => {
        if (location.pathname === path) syncFeed().catch(console.error);
      }).subscribe();
    return () => { client.removeChannel(channel); };
  }
  return { resolve, bind, subscribe };
}
