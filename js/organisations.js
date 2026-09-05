export function createOrganisations({ client, state, escapeHtml: h, safeUrl, avatar, peopleResults, socialRow, setStatus, setSubmitting, navigate, render }) {
  const imageTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const result = async query => {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  };
  const logoUrl = path => path ? client.storage.from('organisation-logos').getPublicUrl(path).data.publicUrl : null;
  const logo = (org, size = '') => org.logo_path
    ? `<img class="organisation-logo ${size}" src="${h(logoUrl(org.logo_path))}" alt="${h(org.name)} logo">`
    : `<span class="organisation-logo logo-fallback ${size}" aria-hidden="true"><i class="fa-solid fa-building-columns"></i></span>`;
  const statusBox = () => '<div class="form-status" data-org-status role="status" aria-live="polite"></div>';
  const message = error => /duplicate key/i.test(error.message)
    ? 'That organisation slug is already in use. Choose another.'
    : /fetch/i.test(error.message) ? 'Could not reach Vertex. Check your connection and try again.' : error.message;
  const date = value => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
  const orgLink = org => `<a class="organisation-row" data-link href="/organisation/${encodeURIComponent(org.slug)}">${logo(org)}<span><strong>${h(org.name)}</strong><small>/${h(org.slug)}</small></span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>`;
  const empty = (title, copy) => `<div class="organisation-empty"><h3>${h(title)}</h3><p>${h(copy)}</p></div>`;

  async function memberships(query) {
    // PostgREST caps each response. Page explicitly so associations never silently disappear.
    let rows = [], offset = 0;
    while (true) {
      const page = await result(query().order('created_at', { ascending: false }).range(offset, offset + 199));
      rows.push(...page);
      if (page.length < 200) return rows;
      offset += 200;
    }
  }

  async function associations(profile) {
    if (profile.account_type === 'organisation') {
      const org = await result(client.from('organisations').select('*').eq('management_profile_id', profile.id).maybeSingle());
      return org ? `<section class="organisation-associations"><h2>Organisation</h2>${orgLink(org)}</section>` : '';
    }
    if (profile.account_type !== 'organiser') return '';
    const rows = await memberships(() => client.from('organisation_memberships').select('*, organisations(*)').eq('organiser_id', profile.id).eq('status', 'accepted'));
    return rows.length ? `<section class="organisation-associations"><h2>Organisations</h2>${rows.map(row => orgLink(row.organisations)).join('')}</section>` : '';
  }

  async function managementView() {
    const org = await result(client.from('organisations').select('*').eq('management_profile_id', state.session.user.id).maybeSingle());
    const rows = org ? await memberships(() => client.from('organisation_memberships').select('*').eq('organisation_id', org.id)) : [];
    const profiles = rows.length ? await result(client.from('public_profiles').select('*').in('id', rows.map(row => row.organiser_id))) : [];
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    const socials = org?.social_links?.length ? org.social_links : [{ label: '', url: '' }];
    return `<div class="organisation-manage page"><div class="page-head compact-head"><span class="eyebrow">Organisation account</span><h1>${org ? 'Your organisation.' : 'Give your organisation a home.'}</h1><p>Introduce your school or organisation, then invite the organisers who represent it.</p></div><div class="organisation-layout"><aside class="profile-preview"><div data-org-logo-preview>${logo(org || { name: state.profile.full_name }, 'logo-large')}</div><strong>${h(org?.name || state.profile.full_name)}</strong><p>Your public profile brings organisers and their competitions together. Linked organisers manage competitions through their own accounts.</p>${org ? `<a class="button secondary" data-link href="/organisation/${h(org.slug)}">View organisation</a>` : ''}<a class="text-link" data-link href="/profile/edit">Edit account identity</a></aside><div class="organisation-sections"><section class="form-surface" aria-labelledby="organisation-details-heading"><h2 id="organisation-details-heading">Public profile</h2>${statusBox()}<form class="form-stack" data-organisation-form data-id="${h(org?.id || '')}" data-old-logo="${h(org?.logo_path || '')}"><label class="field"><span>Organisation name</span><input name="name" required minlength="2" maxlength="140" value="${h(org?.name || state.profile.full_name)}"></label><label class="field"><span>Organisation slug</span><input name="slug" required minlength="3" maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" value="${h(org?.slug || '')}" aria-describedby="slug-help"><small id="slug-help">3–80 lowercase letters, numbers, or hyphens. Public address: /organisation/<span data-slug-preview>${h(org?.slug || 'your-slug')}</span></small>${org ? '<small>Changing this address makes the previous link unavailable.</small>' : ''}</label><div class="avatar-upload"><label class="button secondary upload-button"><input name="logo" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><i class="fa-solid fa-camera" aria-hidden="true"></i> Choose logo</label><small>JPG, PNG, WebP, or GIF. Maximum 5 MB.</small></div>${org?.logo_path ? '<label class="check-field"><input name="remove_logo" type="checkbox"><span>Remove current logo</span></label>' : ''}<label class="field"><span>Description</span><textarea name="description" rows="5" maxlength="3000">${h(org?.description || '')}</textarea></label><label class="field"><span>Website <small>Optional</small></span><input name="website_url" type="url" maxlength="2048" placeholder="https://" value="${h(org?.website_url || '')}"></label><fieldset><legend>Social links</legend><p class="field-intro">Up to eight public links.</p><div data-social-list class="social-list">${socials.map(socialRow).join('')}</div><button type="button" class="button secondary" data-add-social>Add link</button></fieldset><button type="submit" class="button primary" data-submit>${org ? 'Save organisation' : 'Create organisation'}</button></form></section>${org ? `<section class="form-surface" aria-labelledby="organiser-team-heading"><h2 id="organiser-team-heading">Associated organisers</h2><p class="field-intro">Invitations expire after 14 days. Membership appears publicly only after acceptance.</p><form class="form-stack" data-org-invite data-id="${h(org.id)}"><label class="field"><span>Organiser username</span><input name="username" required pattern="@?[A-Za-z0-9_]{3,24}" maxlength="25" placeholder="@username" autocomplete="off"></label><button class="button primary" type="submit" data-submit>Send invitation</button></form><div class="form-status" data-invite-status role="status" aria-live="polite"></div><div class="membership-list">${rows.length ? rows.map(row => managementMember(row, profileMap.get(row.organiser_id))).join('') : empty('No organisers yet.', 'Invite an organiser by their @username to get started.')}</div></section>` : ''}</div></div></div>`;
  }

  function managementMember(row, profile) {
    const expired = row.status === 'pending' && new Date(row.expires_at) <= new Date();
    const label = expired ? 'Expired' : row.status === 'accepted' ? 'Member' : row.status === 'declined' ? 'Declined' : 'Invitation pending';
    return `<article class="membership-row">${profile ? `<a class="member-identity" data-link href="/profile/@${h(profile.username)}">${avatar(profile, 'avatar-small')}<span><strong>${h(profile.full_name)}</strong><small>@${h(profile.username)}</small></span></a>` : '<span>Profile unavailable</span>'}<span class="account-badge">${label}</span><button type="button" class="button quiet" data-remove-membership="${h(row.id)}" data-confirm="${row.status === 'accepted' ? 'Remove this organiser’s public association?' : 'Remove this invitation?'}">${row.status === 'accepted' ? 'Remove organiser' : 'Cancel invitation'}</button></article>`;
  }

  async function directoryView() {
    const page = Math.max(0, Math.min(100000, Number.parseInt(new URLSearchParams(location.search).get('page'), 10) || 0));
    const orgs = await result(client.from('organisations').select('*').order('name').order('id').range(page * 24, page * 24 + 24));
    const mine = state.profile?.account_type === 'organiser'
      ? await memberships(() => client.from('organisation_memberships').select('*, organisations(*)').eq('organiser_id', state.session.user.id)) : [];
    const pending = mine.filter(row => row.status === 'pending');
    const accepted = mine.filter(row => row.status === 'accepted');
    return `<div class="organisations page"><div class="page-head compact-head"><span class="eyebrow">The people behind the opportunities</span><h1>Organisations.</h1><p>Find schools and organisations, meet their organisers, and explore their public profiles.</p>${state.profile?.account_type === 'organisation' ? '<a class="button primary" data-link href="/organisation/edit">Manage organisation</a>' : !state.session ? '<a class="button secondary" data-link href="/signup">Create an organisation account</a>' : ''}</div>${state.profile?.account_type === 'organiser' ? `<section class="organisation-inbox" aria-labelledby="invitations-heading"><div class="section-title-row"><h2 id="invitations-heading">Your invitations</h2><button class="button secondary" type="button" data-org-refresh>Refresh invitations</button></div>${statusBox()}${pending.length ? pending.map(invitationCard).join('') : empty('No pending invitations.', 'Invitations from organisation accounts will appear here.')}<h2>Your organisations</h2>${accepted.length ? accepted.map(row => `<article class="membership-row">${orgLink(row.organisations)}<button type="button" class="button quiet" data-remove-membership="${h(row.id)}" data-confirm="Leave this organisation? Your public association will be removed.">Leave organisation</button></article>`).join('') : empty('No associations yet.', 'Accept an invitation to join an organisation’s public profile.')}</section>` : ''}<section aria-labelledby="directory-heading"><h2 id="directory-heading">Explore organisations</h2><div class="organisation-directory">${orgs.length ? orgs.slice(0, 24).map(orgLink).join('') : empty('No organisations here yet.', 'Organisation accounts can create a public profile and invite their organisers.')}</div><nav class="pagination" aria-label="Organisation pages">${page ? `<a class="button secondary" data-link href="/organisations?page=${page - 1}">Previous page</a>` : ''}${orgs.length > 24 ? `<a class="button secondary" data-link href="/organisations?page=${page + 1}">Next page</a>` : ''}</nav></section></div>`;
  }

  function invitationCard(row) {
    const expired = new Date(row.expires_at) <= new Date();
    return `<article class="invitation-card">${orgLink(row.organisations)}<p>${expired ? 'Invitation expired. Ask this organisation to send another.' : `Invited ${h(date(row.created_at))}. Respond by ${h(date(row.expires_at))}.`}</p>${expired ? '' : `<div class="form-actions"><button class="button primary" type="button" data-respond-invitation="${h(row.id)}" data-accept="true">Accept invitation</button><button class="button secondary" type="button" data-respond-invitation="${h(row.id)}" data-accept="false">Decline invitation</button></div>`}</article>`;
  }

  async function publicView(slug) {
    const org = await result(client.from('organisations').select('*').eq('slug', slug).maybeSingle());
    if (!org) return null;
    const rows = await memberships(() => client.from('organisation_memberships').select('organiser_id, created_at').eq('organisation_id', org.id).eq('status', 'accepted'));
    const profiles = rows.length ? await result(client.from('public_profiles').select('*').in('id', rows.map(row => row.organiser_id)).order('full_name')) : [];
    const links = [...(org.website_url ? [{ label: 'Website', url: org.website_url }] : []), ...(org.social_links || [])].filter(item => safeUrl(item.url));
    return { title: `${org.name} - Vertex`, content: `<div class="public-organisation page"><a class="back-link" data-link href="/organisations"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Organisations</a><article class="profile-hero"><div class="profile-identity">${logo(org, 'logo-hero')}<div><span class="account-badge">Organisation</span><h1>${h(org.name)}</h1><p class="profile-username">/${h(org.slug)}</p></div></div><div class="profile-detail"><p class="profile-bio">${h(org.description || 'This organisation has not added a description yet.')}</p>${links.length ? `<nav class="social-links" aria-label="Organisation links">${links.map(item => `<a href="${h(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${h(item.label)}<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>`).join('')}</nav>` : ''}${org.management_profile_id === state.session?.user.id ? '<a class="button secondary" data-link href="/organisation/edit">Edit organisation</a>' : ''}</div></article><section class="organisation-associations"><h2>Associated organisers</h2><div class="people-results">${profiles.length ? peopleResults(profiles) : empty('No associated organisers yet.', 'Organisers will appear here after accepting an invitation.')}</div></section><section class="organisation-associations"><h2>Competitions</h2>${empty('No competitions published yet.', 'Competitions associated with this organisation will appear here.')}</section></div>` };
  }

  async function resolve(path) {
    if (path === '/organisations') return { content: await directoryView(), title: 'Organisations - Vertex' };
    if (path === '/organisation/edit') {
      if (!state.session) return { protected: true };
      if (state.profile?.account_type !== 'organisation') return { title: 'Organisation account required - Vertex', content: `<div class="page">${empty('Organisation account required.', 'Only the organisation’s management account can edit its profile.')}<a class="button secondary" data-link href="/organisations">View your organisations</a></div>` };
      return { content: await managementView(), title: 'Manage organisation - Vertex' };
    }
    const match = path.match(/^\/organisation\/([a-z0-9]+(?:-[a-z0-9]+)*)$/i);
    if (match) return publicView(match[1].toLowerCase());
    return undefined;
  }

  async function save(form) {
    const status = document.querySelector('[data-org-status]');
    const values = new FormData(form);
    setStatus(status, ''); setSubmitting(form, true, 'Saving organisation');
    let uploaded = null, persisted = false;
    try {
      const labels = values.getAll('social_label');
      const links = values.getAll('social_url').map((url, index) => ({ label: String(labels[index]).trim(), url: String(url).trim() })).filter(item => item.label || item.url);
      const website = String(values.get('website_url') || '').trim();
      if (website && !safeUrl(website)) throw new Error('Website needs a valid http or https URL.');
      if (links.length > 8 || links.some(item => !item.label || !safeUrl(item.url) || item.url.length > 2048)) throw new Error('Each social link needs a label and a valid http or https URL (maximum 2048 characters).');
      const slug = String(values.get('slug')).trim();
      if (['edit', 'new'].includes(slug)) throw new Error('That slug is reserved. Choose another.');
      const file = values.get('logo');
      if (file?.size && values.get('remove_logo')) throw new Error('Choose a new logo or remove the current logo, not both.');
      if (values.get('remove_logo') && !confirm('Remove the current organisation logo?')) {
        setSubmitting(form, false);
        return;
      }
      if (file?.size) {
        if (!imageTypes[file.type] || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG, WebP, or GIF logo, 5 MB or smaller.');
        uploaded = `${state.session.user.id}/${crypto.randomUUID()}.${imageTypes[file.type]}`;
        await result(client.storage.from('organisation-logos').upload(uploaded, file, { contentType: file.type, cacheControl: '3600', upsert: false }));
      }
      const details = { name: String(values.get('name')).trim(), slug,
        description: String(values.get('description')).trim() || null, website_url: website || null,
        social_links: links, logo_path: uploaded || (values.get('remove_logo') ? null : form.dataset.oldLogo || null) };
      const id = form.dataset.id;
      await result(id ? client.from('organisations').update(details).eq('id', id).select().single()
        : client.from('organisations').insert({ ...details, management_profile_id: state.session.user.id }).select().single());
      persisted = true;
      if (form.dataset.oldLogo && details.logo_path !== form.dataset.oldLogo) await client.storage.from('organisation-logos').remove([form.dataset.oldLogo]);
      await render();
      setStatus(document.querySelector('[data-org-status]'), 'Organisation saved.', 'success');
    } catch (error) {
      if (uploaded && !persisted) await client.storage.from('organisation-logos').remove([uploaded]);
      setStatus(status, message(error), 'error'); setSubmitting(form, false);
    }
  }

  async function action(button, operation, success) {
    const selector = button.closest('section')?.querySelector('[data-invite-status]') ? '[data-invite-status]' : '[data-org-status]';
    const container = document.querySelector(selector);
    button.disabled = true;
    try {
      await operation();
      await render();
      setStatus(document.querySelector(selector), success, 'success');
    } catch (error) { setStatus(container, message(error), 'error'); button.disabled = false; }
  }

  function bind() {
    const form = document.querySelector('[data-organisation-form]');
    form?.addEventListener('submit', event => { event.preventDefault(); save(form); });
    form?.elements.slug.addEventListener('input', event => { document.querySelector('[data-slug-preview]').textContent = event.target.value || 'your-slug'; });
    form?.elements.logo.addEventListener('change', event => {
      const file = event.target.files[0];
      if (!file) return;
      if (!imageTypes[file.type] || file.size > 5 * 1024 * 1024) {
        setStatus(document.querySelector('[data-org-status]'), 'Choose a JPG, PNG, WebP, or GIF logo, 5 MB or smaller.', 'error');
        return;
      }
      const url = URL.createObjectURL(file);
      const image = new Image(); image.className = 'organisation-logo logo-large'; image.alt = 'Selected organisation logo preview';
      image.onload = image.onerror = () => URL.revokeObjectURL(url);
      image.src = url;
      document.querySelector('[data-org-logo-preview]').replaceChildren(image);
    });
    document.querySelector('[data-org-invite]')?.addEventListener('submit', async event => {
      event.preventDefault();
      const inviteForm = event.currentTarget, button = inviteForm.querySelector('[data-submit]');
      setStatus(document.querySelector('[data-invite-status]'), 'Sending invitation…');
      await action(button, () => result(client.rpc('invite_organisation_organiser', { organisation_id: inviteForm.dataset.id, username: inviteForm.elements.username.value.trim() })), 'Invitation sent.');
    });
    document.querySelectorAll('[data-respond-invitation]').forEach(button => button.addEventListener('click', () => action(button,
      () => result(client.rpc('respond_organisation_invitation', { invitation_id: button.dataset.respondInvitation, accept_invitation: button.dataset.accept === 'true' })),
      button.dataset.accept === 'true' ? 'Invitation accepted.' : 'Invitation declined.')));
    document.querySelectorAll('[data-remove-membership]').forEach(button => button.addEventListener('click', () => {
      if (confirm(button.dataset.confirm)) action(button,
        () => result(client.rpc('remove_organisation_membership', { membership_id: button.dataset.removeMembership })), 'Association or invitation removed.');
    }));
    document.querySelector('[data-org-refresh]')?.addEventListener('click', event => action(event.currentTarget, async () => {}, 'Invitations refreshed.'));
  }
  return { resolve, bind, associations };
}
