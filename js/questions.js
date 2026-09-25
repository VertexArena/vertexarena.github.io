export function createQuestions({ client, state, escapeHtml: h, refresh }) {
  const result = async query => { const { data, error, count } = await query; if (error) throw error; return { data, count }; };
  const date = value => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  let active = null;
  let limit = 20;
  const statusName = { open: 'Waiting for reply', answered: 'Answered', resolved: 'Resolved' };
  const failure = error => error?.message || 'Could not complete this action. Try again.';
  function unavailable(message) {
    return { title: 'Questions unavailable - Vertex', content: `<div class="page notice-page"><h1>Questions unavailable.</h1><p>${h(message)}</p><a class="button secondary" data-link href="/discover">Explore competitions</a></div>` };
  }
  async function load(competitionId, focusedId) {
    const response = await result(client.from('competition_questions')
      .select('id,competition_id,author_id,body,status,created_at,updated_at', { count: 'exact' })
      .eq('competition_id', competitionId).order('created_at', { ascending: false }).limit(limit));
    const rows = response.data;
    if (focusedId && !rows.some(row => row.id === focusedId)) {
      const focused = await result(client.from('competition_questions').select('id,competition_id,author_id,body,status,created_at,updated_at')
        .eq('competition_id', competitionId).eq('id', focusedId).maybeSingle());
      if (!focused.data) return { missing: true };
      rows.unshift(focused.data);
    }
    const ids = rows.map(row => row.id);
    const replies = ids.length ? (await result(client.from('competition_question_replies')
      .select('id,question_id,author_id,body,created_at,updated_at').in('question_id', ids).order('created_at'))).data : [];
    const authors = [...new Set([...rows.map(row => row.author_id), ...replies.map(row => row.author_id)])];
    const people = authors.length ? (await result(client.from('public_profiles').select('id,full_name,username').in('id', authors))).data : [];
    const byId = new Map(people.map(person => [person.id, person]));
    return { rows: rows.map(row => ({ ...row, author: byId.get(row.author_id), replies: replies.filter(reply => reply.question_id === row.id).map(reply => ({ ...reply, author: byId.get(reply.author_id) })) })), total: response.count || 0 };
  }
  const person = person => `<strong>${h(person?.full_name || 'Vertex member')}</strong><span>${person?.username ? `@${h(person.username)}` : 'Member'}</span>`;
  function card(row, focusedId) {
    const manager = active.manager;
    return `<article class="qa-card ${focusedId === row.id ? 'qa-focused' : ''}" id="question-${h(row.id)}" tabindex="-1">
      <div class="qa-card-head"><span class="qa-status qa-${h(row.status)}"><i class="fa-solid fa-${row.status === 'open' ? 'circle-question' : row.status === 'resolved' ? 'circle-check' : 'comment-dots'}" aria-hidden="true"></i> ${statusName[row.status]}</span><time datetime="${h(row.created_at)}">${h(date(row.created_at))}</time></div>
      <div class="qa-author">${person(row.author)}</div><h2>${h(row.body)}</h2>
      <div class="qa-replies">${row.replies.length ? row.replies.map(reply => `<div class="qa-reply"><div class="qa-reply-meta"><div>${person(reply.author)}<span class="qa-organiser-label">Organiser</span></div><time datetime="${h(reply.created_at)}">${h(date(reply.created_at))}</time></div><p>${h(reply.body)}</p>${reply.updated_at !== reply.created_at ? `<small>Edited ${h(date(reply.updated_at))}</small>` : ''}${manager && reply.author_id === state.session?.user.id ? `<button class="button quiet qa-edit" type="button" data-qa-edit="${h(reply.id)}" data-question-id="${h(row.id)}">Edit reply</button>` : ''}</div>`).join('') : `<p class="qa-awaiting">Organisers have not replied yet.</p>`}</div>
      ${manager ? `<div class="qa-manager-actions"><button class="button quiet" type="button" data-qa-resolve="${h(row.id)}" data-resolved="${row.status === 'resolved' ? 'false' : 'true'}">${row.status === 'resolved' ? 'Reopen question' : 'Mark resolved'}</button></div><form class="qa-reply-form" data-qa-reply-form="${h(row.id)}"><input type="hidden" name="reply_id"><label class="field"><span>Reply as organiser</span><textarea name="message" rows="3" maxlength="3000" required placeholder="Give a clear answer participants can use."></textarea></label><div class="qa-form-actions"><button class="button secondary" type="submit">Post reply</button><button class="button quiet" type="button" data-qa-cancel hidden>Cancel edit</button></div><div class="form-status" role="status" aria-live="polite"></div></form>` : ''}
    </article>`;
  }
  function listHtml(data, focusedId) {
    return data.rows.length ? data.rows.map(row => card(row, focusedId)).join('')
      : '<div class="empty compact-empty"><span class="empty-marker" aria-hidden="true"><i class="fa-regular fa-comments"></i></span><div><h2>No questions yet.</h2><p>Registered participants can start the conversation.</p></div></div>';
  }
  async function resolve(path) {
    const match = path.match(/^\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/questions(?:\/([0-9a-f-]{36}))?$/);
    if (!match) return undefined;
    if (!state.session) return { protected: true };
    const competition = (await result(client.from('competitions').select('id,name,slug,status').eq('slug', match[1]).maybeSingle())).data;
    if (!competition) return null;
    const [access, manage] = await Promise.all([
      result(client.rpc('can_read_competition_questions', { target_competition_id: competition.id })),
      result(client.rpc('can_manage_competition', { target_competition_id: competition.id }))
    ]);
    if (!access.data) return unavailable('Questions are for registered participants and the competition organiser team.');
    if (active?.competition.id !== competition.id) limit = 20;
    const data = await load(competition.id, match[2]);
    if (data.missing) return unavailable('This question is no longer available.');
    active = { competition, manager: manage.data, rows: data.rows, total: data.total };
    const openCount = data.rows.filter(row => row.status === 'open').length;
    return { title: `${competition.name} questions - Vertex`, content: `<div class="page qa-page" data-qa-competition="${h(competition.id)}"><a class="back-link" data-link href="/competition/${h(competition.slug)}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${h(competition.name)}</a><div class="page-head compact-head"><span class="eyebrow">Competition Q&A</span><h1>Questions, answered.</h1><p>Ask about competition details. Organiser replies stay here for everyone registered.</p></div><div class="form-status qa-page-status" role="status" aria-live="polite"></div><div class="qa-layout"><section class="qa-main" aria-label="Competition questions"><div class="qa-list-head"><h2>Conversation</h2><span>${data.total} question${data.total === 1 ? '' : 's'}</span></div><div class="qa-feed">${listHtml(data, match[2])}</div><button class="button secondary qa-more" type="button" data-qa-more ${data.total > limit ? '' : 'hidden'}>Load older questions</button></section><aside class="qa-side">${manage.data ? `<span class="eyebrow">Organiser inbox</span><h2>Keep answers clear.</h2><p>Reply below each question, then mark it resolved when complete. <span data-qa-open-count>${openCount} visible question${openCount === 1 ? '' : 's'} await a reply.</span></p>` : `<span class="eyebrow">Ask the organisers</span><h2>Need clarity?</h2><p>Questions and answers are visible to registered participants. Do not include private details.</p><form data-qa-question-form><label class="field"><span>Your question</span><textarea name="message" rows="6" maxlength="3000" required placeholder="What would you like to know?"></textarea></label><button class="button primary" type="submit">Post question</button><div class="form-status" role="status" aria-live="polite"></div></form>`}</aside></div></div>` };
  }
  async function sync() {
    const list = document.querySelector('.qa-feed');
    if (!list || !active) return;
    const competitionId = active.competition.id;
    const focusedId = location.pathname.split('/')[4];
    const data = await load(competitionId, focusedId);
    if (!list.isConnected || active?.competition.id !== competitionId || data.missing) return;
    const drafts = [...list.querySelectorAll('[data-qa-reply-form]')].map(form => ({ id: form.dataset.qaReplyForm, message: form.elements.message.value, replyId: form.elements.reply_id.value }));
    active.rows = data.rows; active.total = data.total;
    list.innerHTML = listHtml(data, focusedId);
    for (const draft of drafts) {
      const form = [...list.querySelectorAll('[data-qa-reply-form]')].find(item => item.dataset.qaReplyForm === draft.id);
      if (!form) continue;
      form.elements.message.value = draft.message;
      form.elements.reply_id.value = draft.replyId;
      if (draft.replyId) { form.querySelector('button[type="submit"]').textContent = 'Save reply'; form.querySelector('[data-qa-cancel]').hidden = false; }
    }
    document.querySelector('.qa-list-head span').textContent = `${data.total} question${data.total === 1 ? '' : 's'}`;
    const open = data.rows.filter(row => row.status === 'open').length;
    const openLabel = document.querySelector('[data-qa-open-count]');
    if (openLabel) openLabel.textContent = `${open} visible question${open === 1 ? '' : 's'} await a reply.`;
    const more = document.querySelector('[data-qa-more]');
    if (more) more.hidden = data.total <= limit;
    bindCards();
  }
  function bind() {
    const form = document.querySelector('[data-qa-question-form]');
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const status = form.querySelector('.form-status');
      button.disabled = true; status.textContent = 'Posting question…';
      const { error } = await client.rpc('ask_competition_question', { target_competition_id: active.competition.id, message: form.elements.message.value });
      button.disabled = false;
      if (error) { status.textContent = failure(error); status.dataset.type = 'error'; return; }
      form.reset(); status.textContent = 'Question posted. Organisers have been notified.'; status.dataset.type = 'success';
      await sync();
    });
    document.querySelector('[data-qa-more]')?.addEventListener('click', () => { limit += 20; refresh(); });
    bindCards();
    const focusedId = location.pathname.split('/')[4];
    if (focusedId) requestAnimationFrame(() => document.getElementById(`question-${focusedId}`)?.scrollIntoView({ block: 'center' }));
  }
  function bindCards() {
    document.querySelectorAll('[data-qa-reply-form]').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const status = form.querySelector('.form-status');
      const replyId = form.elements.reply_id.value;
      button.disabled = true; status.textContent = replyId ? 'Saving reply…' : 'Posting reply…';
      const { error } = await client.rpc(replyId ? 'edit_competition_question_reply' : 'reply_to_competition_question',
        replyId ? { target_reply_id: replyId, message: form.elements.message.value } : { target_question_id: form.dataset.qaReplyForm, message: form.elements.message.value });
      button.disabled = false;
      if (error) { status.textContent = failure(error); status.dataset.type = 'error'; return; }
      await sync();
      const updated = document.querySelector(`[data-qa-reply-form="${form.dataset.qaReplyForm}"]`);
      if (updated) { updated.reset(); updated.elements.reply_id.value = ''; updated.querySelector('button[type="submit"]').textContent = 'Post reply'; updated.querySelector('[data-qa-cancel]').hidden = true; }
      const pageStatus = document.querySelector('.qa-page-status');
      pageStatus.textContent = replyId ? 'Reply saved.' : 'Reply posted. Participant notified.';
      pageStatus.dataset.type = 'success';
    }));
    document.querySelectorAll('[data-qa-edit]').forEach(button => button.addEventListener('click', () => {
      const question = active.rows.find(row => row.id === button.dataset.questionId);
      const reply = question?.replies.find(row => row.id === button.dataset.qaEdit);
      const form = document.querySelector(`[data-qa-reply-form="${button.dataset.questionId}"]`);
      if (!reply || !form) return;
      form.elements.reply_id.value = reply.id;
      form.elements.message.value = reply.body;
      form.querySelector('button[type="submit"]').textContent = 'Save reply';
      form.querySelector('[data-qa-cancel]').hidden = false;
      form.elements.message.focus();
    }));
    document.querySelectorAll('[data-qa-cancel]').forEach(button => button.addEventListener('click', () => {
      const form = button.closest('form'); form.reset(); form.elements.reply_id.value = '';
      form.querySelector('button[type="submit"]').textContent = 'Post reply'; button.hidden = true;
      form.querySelector('.form-status').textContent = '';
    }));
    document.querySelectorAll('[data-qa-resolve]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      const { error } = await client.rpc('set_competition_question_resolved', { target_question_id: button.dataset.qaResolve, resolved: button.dataset.resolved === 'true' });
      if (error) { button.disabled = false; const status = button.closest('.qa-card').querySelector('.form-status'); status.textContent = failure(error); status.dataset.type = 'error'; return; }
      await sync();
    }));
  }
  function subscribe(path) {
    const id = document.querySelector('[data-qa-competition]')?.dataset.qaCompetition;
    if (!id) return () => {};
    const channel = client.channel(`vertex-qa-${id}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_questions', filter: `competition_id=eq.${id}` }, () => { if (location.pathname === path) sync().catch(console.error); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_question_replies' }, payload => {
        if (location.pathname === path && active?.rows.some(row => row.id === payload.new?.question_id || row.id === payload.old?.question_id)) sync().catch(console.error);
      }).subscribe();
    return () => { client.removeChannel(channel); };
  }
  return { resolve, bind, subscribe };
}
