export function createNotifications({ client, state, escapeHtml: h, refresh, pwa }) {
  const date = value => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  let activeUser = null;
  let channel = null;
  let unread = 0;
  let page = 0;
  const pageSize = 30;
  const result = async query => { const { data, error, count } = await query; if (error) throw error; return { data, count }; };
  const safePath = value => /^\/(?!\/)[a-zA-Z0-9/_@.?=&%-]*$/.test(value || '') ? value : '/notifications';
  const icon = kind => ({ announcement: 'bullhorn', registration_confirmed: 'circle-check', team_invitation: 'envelope', competition_organiser_invitation: 'user-plus', submission_confirmed: 'file-circle-check', qa_question: 'circle-question', qa_reply: 'comments', meeting_assignment: 'video' })[kind] || 'bell';
  const card = item => `<article class="notice-row ${item.read_at ? '' : 'notice-unread'}" data-notice-id="${h(item.id)}"><span class="notice-icon"><i class="fa-solid fa-${icon(item.kind)}" aria-hidden="true"></i></span><div class="notice-content"><div class="notice-title"><strong>${h(item.title)}</strong>${item.read_at ? '' : '<span class="notice-dot" aria-label="Unread"></span>'}</div><p>${h(item.body)}</p><time datetime="${h(item.created_at)}">${h(date(item.created_at))}</time><div class="notice-actions"><a data-link data-notice-open="${h(item.id)}" href="${h(safePath(item.link_path))}">Open update</a>${item.read_at ? '' : `<button type="button" data-notice-read="${h(item.id)}">Mark as read</button>`}</div></div></article>`;

  function updateBadge() {
    document.querySelectorAll('[data-notification-count]').forEach(node => {
      node.textContent = unread > 99 ? '99+' : String(unread);
      node.hidden = unread === 0;
    });
    document.querySelectorAll('[data-notification-link]').forEach(node => node.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications'));
  }
  async function countUnread() {
    if (!activeUser) return;
    const id = activeUser;
    const response = await result(client.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', id).is('read_at', null));
    if (id !== activeUser) return;
    unread = response.count || 0;
    updateBadge();
  }
  function start(id) {
    if (id === activeUser) return;
    if (channel) client.removeChannel(channel);
    activeUser = id || null; channel = null; unread = 0; updateBadge();
    if (!id) return;
    channel = client.channel(`vertex-notifications-${id}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${id}`
    }, () => {
      countUnread().catch(console.error);
      if (location.pathname === '/notifications') refresh();
    }).subscribe();
    countUnread().catch(console.error);
  }
  function headerAction() {
    if (!state.session) return '';
    return `<a class="notification-bell" data-notification-link data-link href="/notifications" aria-label="${unread ? `Notifications, ${unread} unread` : 'Notifications'}" ${location.pathname === '/notifications' ? 'aria-current="page"' : ''}><i class="fa-regular fa-bell" aria-hidden="true"></i><span data-notification-count ${unread ? '' : 'hidden'}>${unread > 99 ? '99+' : unread}</span></a>`;
  }
  async function resolve(path) {
    if (path !== '/notifications') return undefined;
    if (!state.session) return { protected: true };
    await countUnread();
    const id = state.session.user.id;
    const { data: rows } = await result(client.from('notifications').select('id,kind,title,body,link_path,created_at,read_at')
      .eq('recipient_id', id).order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1));
    const { count } = await result(client.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', id));
    const total = count || 0;
    return { title: 'Notifications - Vertex', content: `<div class="page notice-page"><div class="page-head compact-head"><span class="eyebrow">Your activity</span><h1>Notifications.</h1><p>Updates from the competitions and teams you follow.</p></div>${pwa.controls()}<div class="notice-toolbar"><span>${unread} unread · ${total} total</span><button class="button secondary" type="button" data-notice-all ${unread ? '' : 'disabled'}>Mark all as read</button></div><div class="form-status" data-notice-status role="status" aria-live="polite"></div><section class="notice-list" aria-label="Notifications">${rows.length ? rows.map(card).join('') : `<div class="empty compact-empty"><span class="empty-marker" aria-hidden="true"><i class="fa-regular fa-bell"></i></span><div><h2>No notifications yet.</h2><p>Competition updates and invitations will arrive here.</p></div></div>`}</section>${total > pageSize ? `<nav class="notice-pagination" aria-label="Notification pages"><button class="button secondary" type="button" data-notice-page="previous" ${page ? '' : 'disabled'}>Previous</button><span>Page ${page + 1} of ${Math.ceil(total / pageSize)}</span><button class="button secondary" type="button" data-notice-page="next" ${(page + 1) * pageSize < total ? '' : 'disabled'}>Next</button></nav>` : ''}</div>` };
  }
  function bind() {
    document.querySelectorAll('[data-notice-read]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      const { error } = await client.rpc('mark_notification_read', { target_notification_id: button.dataset.noticeRead });
      if (error) { button.disabled = false; document.querySelector('[data-notice-status]').textContent = error.message; return; }
      await countUnread(); refresh();
    }));
    document.querySelector('[data-notice-all]')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      const { error } = await client.rpc('mark_all_notifications_read');
      if (error) { event.currentTarget.disabled = false; document.querySelector('[data-notice-status]').textContent = error.message; return; }
      await countUnread(); refresh();
    });
    document.querySelectorAll('[data-notice-open]').forEach(anchor => anchor.addEventListener('click', async () => {
      const { error } = await client.rpc('mark_notification_read', { target_notification_id: anchor.dataset.noticeOpen });
      if (error) console.error(error); else countUnread().catch(console.error);
    }));
    document.querySelectorAll('[data-notice-page]').forEach(button => button.addEventListener('click', () => {
      page += button.dataset.noticePage === 'next' ? 1 : -1;
      refresh();
    }));
  }
  return { resolve, bind, start, headerAction, countUnread };
}
