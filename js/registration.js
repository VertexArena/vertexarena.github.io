import { ageMismatch, participantAge } from './eligibility.js';

export function createRegistration({ client, state, escapeHtml: h, navigate, setStatus }) {
  const date = value => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const result = async query => { const { data, error } = await query; if (error) throw error; return data; };
  const pathFor = c => `/competition/${encodeURIComponent(c.slug)}/register`;
  function availability(c, teamMember = false) {
    if (c.team_mode === 'team') return 'This competition accepts teams only.';
    if (teamMember) return 'You already belong to a team for this competition. One participant can hold one entry identity.';
    if (!state.profile?.profile_completed_at || !state.profile?.birthday) return 'Complete your profile and birthday before registering.';
    const now = Date.now();
    if (!c.registration_opens_at || now < Date.parse(c.registration_opens_at)) return `Registration opens ${date(c.registration_opens_at)}.`;
    if (!c.registration_closes_at || now >= Date.parse(c.registration_closes_at)) return `Registration closed ${date(c.registration_closes_at)}.`;
    return ageMismatch(c, state.profile.birthday);
  }
  function summary(c) {
    return `<div class="registration-summary"><span class="eyebrow">Entry details</span><h2>${h(c.name)}</h2><dl><div><dt>Format</dt><dd>${h(c.team_mode === 'both' ? 'Individual or team' : 'Individual')}</dd></div><div><dt>Registration closes</dt><dd>${h(date(c.registration_closes_at))}</dd></div><div><dt>Competition starts</dt><dd>${h(date(c.starts_at))}</dd></div>${c.minimum_age !== null || c.maximum_age !== null ? `<div><dt>Age range</dt><dd>${c.minimum_age ?? 'Any'} to ${c.maximum_age ?? 'any'}</dd></div>` : ''}</dl><a data-link href="/competition/${h(c.slug)}">View full competition details</a></div>`;
  }
  function registrationView(c, existing, teamMember) {
    const reason = availability(c, teamMember);
    const choice = c.categories.length ? `<label class="field registration-category"><span>Competition category</span><select name="category" required><option value="">Choose category</option>${c.categories.map(category => `<option value="${h(category)}">${h(category)}</option>`).join('')}</select><small>Select the category for your entry.</small></label>` : '';
    const main = existing
      ? `<div class="registration-confirmed" role="status"><span class="registration-check"><i class="fa-solid fa-check" aria-hidden="true"></i></span><span class="eyebrow">Entry confirmed</span><h1>You're registered.</h1><p>Your individual entry is confirmed for <strong>${h(c.name)}</strong>.${existing.category ? ` Category: <strong>${h(existing.category)}</strong>.` : ''}</p><p class="registration-time">Registered ${h(date(existing.created_at))}</p><div class="registration-actions"><a class="button primary" data-link href="/dashboard">Open your dashboard</a><a class="button secondary" data-link href="/competition/${h(c.slug)}">Competition details</a></div></div>`
      : `<span class="eyebrow">Individual registration</span><h1>Make your entry.</h1><p class="registration-lead">Confirm the details, then register your individual place. Your profile name will identify your entry.</p><div class="registration-person"><span class="registration-person-icon"><i class="fa-solid fa-user" aria-hidden="true"></i></span><div><strong>${h(state.profile?.full_name || 'Complete your profile')}</strong><span>@${h(state.profile?.username || 'username')}${state.profile?.birthday ? ` · age ${participantAge(state.profile.birthday)}` : ''}</span></div></div>${reason ? `<div class="registration-blocked" role="note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><div><strong>Registration unavailable</strong><p>${h(reason)}</p>${!state.profile?.profile_completed_at || !state.profile?.birthday ? '<a class="text-link" data-link href="/profile/edit">Complete your profile</a>' : teamMember ? `<a class="text-link" data-link href="/competition/${h(c.slug)}/team">View your team</a>` : ''}</div></div>` : `<div class="form-status" data-registration-status role="status" aria-live="polite"></div><form data-registration-form data-competition-id="${h(c.id)}" data-slug="${h(c.slug)}">${choice}<button class="button primary" type="submit" data-registration-submit>Confirm registration <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></form>`}`;
    return { title: `${existing ? 'Registration confirmed' : 'Register'} - ${c.name} - Vertex`, content: `<div class="page registration-page"><a class="back-link" data-link href="/competition/${h(c.slug)}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${h(c.name)}</a><div class="registration-layout"><section class="registration-main">${main}</section><aside>${summary(c)}</aside></div></div>` };
  }
  async function resolve(path) {
    const match = path.match(/^\/competition\/([a-z0-9]+(?:-[a-z0-9]+)*)\/register$/);
    if (!match) return undefined;
    const c = await result(client.from('competitions').select('id,name,slug,status,team_mode,categories,minimum_age,maximum_age,registration_opens_at,registration_closes_at,starts_at').eq('slug', match[1]).eq('status', 'published').maybeSingle());
    if (!c) return null;
    if (!state.session) return { protected: true };
    if (state.profile?.account_type !== 'participant') return { title: 'Participant account required - Vertex', content: `<div class="page registration-page"><a class="back-link" data-link href="/competition/${h(c.slug)}">Back to competition</a><h1>Participant account required.</h1><p>Only participant accounts can register.</p></div>` };
    const [existing, teamMember] = await Promise.all([
      result(client.from('individual_registrations').select('id,category,created_at').eq('competition_id', c.id).eq('participant_id', state.session.user.id).maybeSingle()),
      result(client.from('competition_team_members').select('team_id').eq('competition_id', c.id).eq('participant_id', state.session.user.id).maybeSingle())
    ]);
    return registrationView(c, existing, Boolean(teamMember));
  }
  function bind() {
    document.querySelector('[data-registration-form]')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, status = document.querySelector('[data-registration-status]');
      if (!form.reportValidity()) return;
      const button = form.querySelector('[data-registration-submit]');
      button.disabled = true; button.textContent = 'Registering…';
      setStatus(status, 'Confirming your entry…');
      try {
        await result(client.rpc('register_individual', { target_competition_id: form.dataset.competitionId, chosen_category: new FormData(form).get('category') || null }));
        navigate(`/competition/${form.dataset.slug}/register?confirmed=1`);
      } catch (error) {
        setStatus(status, /fetch|network/i.test(error.message || '') ? 'Could not reach Vertex. Check your connection and try again.' : error.message || 'Could not register. Check your details and try again.', 'error');
        button.disabled = false; button.innerHTML = 'Confirm registration <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
      }
    });
  }
  return { resolve, bind };
}
