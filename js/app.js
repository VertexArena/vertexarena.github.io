import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const app = document.querySelector('#app');
const config = window.VERTEX_CONFIG;
const supabase = config?.SUPABASE_PROJECT_URL && config?.SUPABASE_ANON_KEY
  ? createClient(config.SUPABASE_PROJECT_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

const state = { session: null, profile: null, authReady: false };
const publicNav = [['/', 'Home'], ['/discover', 'Discover'], ['/people', 'People']];
let cleanup = () => {};
let initialRender = true;

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character]);

const safeUrl = value => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
};

const link = (href, label, path) => `<a data-link href="${href}" ${path === href || (href !== '/' && path.startsWith(`${href}/`)) ? 'aria-current="page"' : ''}>${label}</a>`;

function avatarUrl(path) {
  if (!path || !supabase) return null;
  return supabase.storage.from('profile-pictures').getPublicUrl(path).data.publicUrl;
}

function initials(name) {
  return (name || 'Vertex member').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function avatar(profile, className = '') {
  const url = avatarUrl(profile?.avatar_path);
  return url
    ? `<img class="avatar ${className}" src="${escapeHtml(url)}" alt="${escapeHtml(profile.full_name)} profile picture">`
    : `<span class="avatar avatar-fallback ${className}" aria-hidden="true">${escapeHtml(initials(profile?.full_name))}</span>`;
}

function header(path) {
  const dark = document.documentElement.dataset.theme === 'dark';
  const authPage = ['/login', '/signup'].includes(path);
  const identity = authPage
    ? `<a class="back-home" data-link href="/"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Back to Vertex</span></a>`
    : `<a class="brand" data-link href="/" aria-label="Vertex home"><img src="/assets/logo.png" alt=""><span class="word">VERTEX</span></a>`;
  const accountAction = state.session
    ? `<a class="account-link" data-link href="/profile/edit" aria-label="Edit your profile">${avatar(state.profile, 'avatar-small')}<span>${escapeHtml(state.profile?.full_name || 'Complete profile')}</span></a>`
    : `<a class="button quiet login" data-link href="/login" ${path === '/login' ? 'aria-current="page"' : ''}>Log in</a>`;
  const drawerAccount = state.session
    ? `<a class="button primary" data-link href="/profile/edit">Edit profile</a><button class="button secondary" type="button" data-logout>Log out</button>`
    : `<a class="button primary" data-link href="/login">Log in</a>`;
  return `<header class="header"><div class="header-in">${identity}<nav class="nav" aria-label="Primary">${publicNav.map(item => link(...item, path)).join('')}</nav><div class="actions">${accountAction}<button class="theme-toggle" data-theme type="button" role="switch" aria-checked="${dark}" aria-label="Switch to ${dark ? 'light' : 'dark'} mode"><span class="theme-scene" aria-hidden="true"><span class="theme-clouds"></span><span class="theme-stars"><i></i><i></i><i></i></span><span class="theme-orbit"><span class="theme-orb"><span class="theme-moon"><i></i><i></i><i></i></span></span></span></span></button><button class="icon menu" data-menu aria-label="Open navigation" aria-expanded="false"><i class="fa-solid fa-bars" aria-hidden="true"></i></button></div></div></header><nav class="drawer" data-open="false" aria-label="Mobile">${publicNav.map(item => link(...item, path)).join('')}${drawerAccount}</nav>`;
}

function footer() {
  return `<footer class="footer"><div class="footer-in"><div class="brand"><img src="/assets/logo.png" alt=""><span class="word">VERTEX</span></div><span>Student competitions, clearly organised.</span><a data-link href="/discover">Discover</a></div></footer>`;
}

function shell(content, path, noFooter = false) {
  return `${header(path)}<main id="main-content" class="shell" tabindex="-1">${content}</main>${noFooter ? '' : footer()}`;
}

function home() {
  return `<section class="hero"><canvas class="opportunity-grid" aria-hidden="true"></canvas><div class="hero-in"><div class="hero-copy"><span class="eyebrow">A world of student competitions</span><h1>Find your next <span>challenge.</span></h1><p>Explore ideas across every field, follow what sparks your curiosity, and find the opportunity worth pursuing.</p><div class="hero-buttons"><a class="button primary" data-link href="/discover">Explore competitions <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a><a class="button secondary" data-link href="/signup">Create account</a></div></div><p class="hero-aside">New directions are always waiting just beyond the familiar.</p></div></section><section class="section story-section"><div class="story-heading"><span class="eyebrow">Why Vertex exists</span><h2>Opportunity should be easier to see.</h2></div><div class="story-copy"><p class="story-lead">The right competition can change what a student believes they are capable of.</p><p>Yet opportunities are often scattered across school notices, social posts, forms, and disconnected websites. Vertex gives that landscape one calm place—so curiosity can become a decision instead of a search through noise.</p></div></section><section class="journey-section"><div class="section"><div class="journey-heading"><span class="eyebrow">The competition journey</span><h2>Clarity at every meaningful moment.</h2><p>A competition is more than a deadline. It is a sequence of choices, effort, feedback, and growth.</p></div><ol class="journey"><li><span class="journey-number">01</span><div><h3>Discover what draws you in.</h3><p>See enough context to recognise the challenge that fits your interests and ambition.</p></div></li><li><span class="journey-number">02</span><div><h3>Know what comes next.</h3><p>Keep the important moments of participation understandable as the competition unfolds.</p></div></li><li><span class="journey-number">03</span><div><h3>Carry the outcome forward.</h3><p>Let every result become part of a lasting record of effort, progress, and achievement.</p></div></li></ol></div></section><section class="section audience-section"><div class="intro"><span class="eyebrow">Built for both sides</span><h2>Students explore. Organisers create the opportunity.</h2></div><div class="audience-grid"><article class="audience-card student-card"><span class="audience-icon"><i class="fa-solid fa-compass" aria-hidden="true"></i></span><div><h3>For students</h3><p>Vertex makes the wider competition landscape easier to understand, helping students move from “What is out there?” to “This is worth trying.”</p></div></article><article class="audience-card organiser-card"><span class="audience-icon"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i></span><div><h3>For organisers</h3><p>Vertex gives each competition a credible, coherent home where expectations stay clear and the work of participants can be treated with care.</p></div></article></div></section><section class="difference-section"><div class="section difference-in"><div><span class="eyebrow">What makes Vertex different</span><h2>The challenge stays at the centre.</h2></div><div class="difference-copy"><p>Vertex is not a feed competing for attention and not a collection of disconnected forms. It is designed around the arc of a real competition.</p><p>Discovery leads naturally toward participation, participation toward an outcome, and every outcome toward the next possibility.</p></div></div></section><section class="section closing-section"><div class="closing-card"><span class="eyebrow">Your next direction</span><h2>See what might be worth pursuing.</h2><p>Begin with the open catalogue, or create an account when you are ready to make Vertex your own.</p><div class="hero-buttons"><a class="button primary" data-link href="/discover">Explore competitions <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a><a class="button secondary" data-link href="/signup">Create account</a></div></div></section>`;
}

const fields = [['fa-square-root-variable', 'Mathematics'], ['fa-atom', 'Physics'], ['fa-flask', 'Chemistry'], ['fa-dna', 'Biology'], ['fa-code', 'Programming'], ['fa-robot', 'Robotics'], ['fa-microscope', 'Research'], ['fa-pen-nib', 'Writing'], ['fa-pen-ruler', 'Design'], ['fa-briefcase', 'Business'], ['fa-comments', 'Debate'], ['fa-lightbulb', 'Innovation']];

function discover() {
  return `<div class="page discover-page"><div class="page-head"><span class="eyebrow">Discover</span><h1>Open field.</h1><p>Look across disciplines, follow more than one curiosity, and leave room for the challenge you did not expect.</p></div><section class="field-selector" aria-labelledby="field-selector-title"><div class="selector-heading"><div><span class="eyebrow">Explore by field</span><h2 id="field-selector-title">Choose the ideas that pull you in.</h2></div><p>Select as many fields as you want to explore. Your choices stay visible together, leaving room for more than one direction.</p></div><div class="field-options">${fields.map(([icon, name]) => `<button class="field-option" type="button" data-field-option aria-pressed="false"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${name}</span><i class="fa-solid fa-check field-check" aria-hidden="true"></i></button>`).join('')}</div><p class="selection-status" data-selection-status aria-live="polite">No fields selected yet.</p></section><section class="empty"><span class="empty-marker" aria-hidden="true"><i class="fa-solid fa-binoculars"></i></span><div><span class="status-label">Ready to explore</span><h2>The first opportunities will appear here.</h2><p>As competitions are published, this space will become a clear view across every field.</p></div></section></div>`;
}

function authView(mode) {
  const login = mode === 'login';
  return `<div class="auth"><section class="auth-visual"><img class="auth-logo" src="/assets/logo.png" alt="Vertex logo"><div><span class="eyebrow" style="color:#fff">Vertex account</span><h1>${login ? 'Welcome back.' : 'Make your work visible.'}</h1><p>${login ? 'Return to the opportunities you are following and see what comes next.' : 'Create one clear identity for every challenge entered, organised, and completed.'}</p></div></section><section class="auth-panel"><div class="auth-inner"><span class="eyebrow">${login ? 'Log in' : 'Sign up'}</span><h2>${login ? 'Access your workspace' : 'Join Vertex'}</h2><p>${login ? 'Use your email and password. Your session remains available when you return.' : 'Choose how you will use Vertex. You can refine your public profile after signup.'}</p><div class="form-status" data-form-status role="status" aria-live="polite"></div><form class="form-stack" data-auth-form="${mode}">${login ? loginFields() : signupFields()}<button class="button primary button-full" type="submit" data-submit>${login ? 'Log in' : 'Create account'} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></form><p class="auth-switch">${login ? 'Don’t have an account? <a data-link href="/signup">Create one</a>' : 'Already have an account? <a data-link href="/login">Log in</a>'}</p></div></section></div>`;
}

function loginFields() {
  return `<label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></label><label class="field"><span>Password</span><span class="password-field"><input name="password" type="password" autocomplete="current-password" required minlength="8"><button type="button" data-password-toggle aria-label="Show password"><i class="fa-regular fa-eye" aria-hidden="true"></i></button></span></label>`;
}

function signupFields() {
  return `<fieldset class="account-type"><legend>I will use Vertex as</legend><div><label><input type="radio" name="account_type" value="participant" checked><span><i class="fa-solid fa-compass" aria-hidden="true"></i><strong>Participant</strong><small>Discover and enter competitions</small></span></label><label><input type="radio" name="account_type" value="organiser"><span><i class="fa-solid fa-lightbulb" aria-hidden="true"></i><strong>Organiser</strong><small>Create and manage opportunities</small></span></label></div></fieldset><div class="form-grid"><label class="field"><span>Full name</span><input name="full_name" autocomplete="name" required minlength="2" maxlength="100"></label><label class="field"><span>Username</span><span class="username-field"><span aria-hidden="true">@</span><input name="username" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" aria-describedby="username-help"></span><small id="username-help">3–24 letters, numbers, or underscores</small></label></div><label class="field participant-only"><span>Date of birth</span><input name="birthday" type="date" autocomplete="bday" required></label><label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" required maxlength="254"></label><div class="form-grid"><label class="field"><span>Password</span><span class="password-field"><input name="password" type="password" autocomplete="new-password" required minlength="8"><button type="button" data-password-toggle aria-label="Show password"><i class="fa-regular fa-eye" aria-hidden="true"></i></button></span></label><label class="field"><span>Confirm password</span><input name="confirm_password" type="password" autocomplete="new-password" required minlength="8"></label></div><label class="check-field"><input type="checkbox" name="public_notice" required><span>I understand my name, @username, bio, picture, affiliation, location, and social links form a public profile. Date of birth stays private.</span></label>`;
}

function profileForm(profile) {
  const socials = Array.isArray(profile.social_links) ? profile.social_links : [];
  const rows = [...socials, ...Array(Math.max(2 - socials.length, 0)).fill({ label: '', url: '' })];
  return `<div class="profile-edit page"><div class="page-head compact-head"><span class="eyebrow">Your Vertex identity</span><h1>Edit profile.</h1><p>Keep public details useful and current. Birthday remains private and only supports eligibility checks.</p></div><div class="profile-edit-grid"><aside class="profile-preview" aria-label="Profile preview"><div class="profile-preview-top">${avatar(profile, 'avatar-large')}<div><strong data-preview-name>${escapeHtml(profile.full_name || 'Your name')}</strong><span data-preview-username>@${escapeHtml(profile.username || 'username')}</span></div></div><span class="account-badge"><i class="fa-solid ${profile.account_type === 'organiser' ? 'fa-lightbulb' : 'fa-compass'}" aria-hidden="true"></i>${escapeHtml(profile.account_type)}</span><p>Your public identity updates when changes save.</p><a class="text-link" data-public-profile-link data-link href="${profile.username ? `/profile/@${encodeURIComponent(profile.username)}` : '/profile/edit'}">View public profile</a></aside><section class="form-surface"><div class="form-status" data-form-status role="status" aria-live="polite"></div><form class="form-stack" data-profile-form><fieldset><legend>Identity</legend><div class="avatar-upload"><div data-avatar-preview>${avatar(profile, 'avatar-medium')}</div><label class="button secondary upload-button"><input type="file" name="avatar" accept="image/jpeg,image/png,image/webp,image/gif"><i class="fa-solid fa-camera" aria-hidden="true"></i> Choose picture</label><small>JPG, PNG, WebP, or GIF. Maximum 5 MB.</small></div><div class="form-grid"><label class="field"><span>Full name</span><input name="full_name" autocomplete="name" required minlength="2" maxlength="100" value="${escapeHtml(profile.full_name)}"></label><label class="field"><span>Username</span><span class="username-field"><span aria-hidden="true">@</span><input name="username" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" value="${escapeHtml(profile.username)}"></span></label></div>${profile.account_type === 'participant' ? `<label class="field"><span>Date of birth <small>Private</small></span><input name="birthday" type="date" autocomplete="bday" required value="${escapeHtml(profile.birthday)}"><small>Never shown on your public profile.</small></label>` : ''}</fieldset><fieldset><legend>About</legend><label class="field"><span>Bio</span><textarea name="bio" maxlength="1000" rows="5" placeholder="What do you study, build, or organise?">${escapeHtml(profile.bio)}</textarea><small><span data-bio-count>${String(profile.bio || '').length}</span>/1000</small></label><div class="form-grid"><label class="field"><span>School or affiliation <small>Optional</small></span><input name="affiliation" maxlength="160" value="${escapeHtml(profile.affiliation)}"></label><label class="field"><span>Location <small>Optional</small></span><input name="location" maxlength="120" value="${escapeHtml(profile.location)}"></label></div></fieldset><fieldset><legend>Social links</legend><p class="field-intro">Add up to eight public links. Only secure HTTP links are accepted.</p><div class="social-list" data-social-list>${rows.map(socialRow).join('')}</div><button class="button secondary add-social" type="button" data-add-social><i class="fa-solid fa-plus" aria-hidden="true"></i> Add link</button></fieldset><div class="form-actions"><button class="button primary" type="submit" data-submit>Save profile</button><button class="button quiet" type="button" data-logout>Log out</button></div></form></section></div></div>`;
}

function socialRow(item = { label: '', url: '' }) {
  return `<div class="social-row"><label class="field"><span>Label</span><input name="social_label" maxlength="30" placeholder="Portfolio" value="${escapeHtml(item.label)}"></label><label class="field"><span>URL</span><input name="social_url" type="url" inputmode="url" placeholder="https://" value="${escapeHtml(item.url)}"></label><button class="icon remove-social" type="button" data-remove-social aria-label="Remove social link"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`;
}

function publicProfileView(profile) {
  const socials = Array.isArray(profile.social_links) ? profile.social_links.filter(item => safeUrl(item.url)) : [];
  return `<div class="public-profile page"><a class="back-link" data-link href="/people"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Find people</a><article class="profile-hero"><div class="profile-identity">${avatar(profile, 'avatar-hero')}<div><span class="account-badge"><i class="fa-solid ${profile.account_type === 'organiser' ? 'fa-lightbulb' : 'fa-compass'}" aria-hidden="true"></i>${escapeHtml(profile.account_type)}</span><h1>${escapeHtml(profile.full_name)}</h1><p class="profile-username">@${escapeHtml(profile.username)}</p></div></div><div class="profile-detail"><p class="profile-bio">${escapeHtml(profile.bio || 'No bio added yet.')}</p>${profile.affiliation || profile.location ? `<dl>${profile.affiliation ? `<div><dt>Affiliation</dt><dd>${escapeHtml(profile.affiliation)}</dd></div>` : ''}${profile.location ? `<div><dt>Location</dt><dd>${escapeHtml(profile.location)}</dd></div>` : ''}</dl>` : ''}${socials.length ? `<nav class="social-links" aria-label="Social links">${socials.map(item => `<a href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(item.label || new URL(item.url).hostname)}</span><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>`).join('')}</nav>` : ''}<p class="joined">Joined Vertex ${new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(profile.created_at))}</p></div></article></div>`;
}

function peopleView() {
  return `<div class="people page"><div class="page-head compact-head"><span class="eyebrow">Vertex community</span><h1>Find people.</h1><p>Search a precise @username or a full name. Public profiles show work and interests, never private birthdays.</p></div><form class="people-search" role="search" data-people-search><label for="people-query">Search people</label><div><span aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span><input id="people-query" name="query" type="search" minlength="2" maxlength="100" autocomplete="off" placeholder="@username or full name"><button class="button primary" type="submit">Search</button></div></form><div class="search-status" data-search-status role="status" aria-live="polite">Enter at least two characters.</div><section class="people-results" data-people-results aria-label="Search results"></section></div>`;
}

function peopleResults(rows) {
  if (!rows.length) return `<div class="empty compact-empty"><span class="empty-marker" aria-hidden="true"><i class="fa-solid fa-user-group"></i></span><div><h2>No public profiles match.</h2><p>Check spelling or try a shorter username.</p></div></div>`;
  return rows.map(profile => `<a class="person-row" data-link href="/profile/@${encodeURIComponent(profile.username)}">${avatar(profile, 'avatar-medium')}<span><strong>${escapeHtml(profile.full_name)}</strong><small>@${escapeHtml(profile.username)}</small>${profile.affiliation ? `<em>${escapeHtml(profile.affiliation)}</em>` : ''}</span><span class="account-badge">${escapeHtml(profile.account_type)}</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>`).join('');
}

function notFound() {
  return `<section class="notfound"><canvas class="nf-canvas" aria-hidden="true"></canvas><div class="fallback" aria-hidden="true"></div><div class="nf-content"><span class="code">404</span><span class="eyebrow">Route not found</span><h1>This path left the field.</h1><p>Nothing lives at this address. Return home or reopen discovery to find a valid route.</p><div class="nf-actions"><a class="button primary" data-link href="/"><i class="fa-solid fa-house" aria-hidden="true"></i> Return home</a><a class="button secondary" data-link href="/discover">Open discovery</a></div></div></section>`;
}

function loadingView(label = 'Opening Vertex') {
  return `<div class="route-loading" role="status"><img src="/assets/logo.png" alt="" width="44" height="44"><span>${escapeHtml(label)}</span></div>`;
}

function errorView(title, message, retry = location.pathname) {
  return `<div class="page"><section class="empty" role="alert"><span class="empty-marker"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></span><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="button primary" data-link href="${escapeHtml(retry)}">Try again</a></div></section></div>`;
}

async function loadOwnProfile() {
  if (!state.session || !supabase) { state.profile = null; return null; }
  const { data, error } = await supabase.from('profiles').select('*').eq('id', state.session.user.id).single();
  if (error) throw error;
  state.profile = data;
  return data;
}

function authMessage(error) {
  const message = String(error?.message || error || 'This action could not be completed.');
  if (/duplicate key|profiles_username_unique|already registered|already been registered|database error saving new user|^\{\}$/i.test(message)) return 'That email or username is already in use.';
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/password/i.test(message) && /least/i.test(message)) return 'Password must contain at least 8 characters.';
  if (/fetch/i.test(message)) return 'Vertex could not reach the account service. Check your connection and try again.';
  return message;
}

function setStatus(container, message, type = '') {
  if (!container) return;
  container.textContent = message;
  container.dataset.type = type;
}

function setSubmitting(form, active, label) {
  const button = form.querySelector('[data-submit]');
  if (!button) return;
  button.disabled = active;
  if (active) {
    button.dataset.label = button.innerHTML;
    button.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> ${escapeHtml(label)}`;
  } else if (button.dataset.label) button.innerHTML = button.dataset.label;
}

async function submitAuth(form) {
  const status = document.querySelector('[data-form-status]');
  const values = new FormData(form);
  const mode = form.dataset.authForm;
  setStatus(status, '');
  setSubmitting(form, true, mode === 'login' ? 'Logging in' : 'Creating account');
  try {
    if (!supabase) throw new Error('Supabase configuration is unavailable.');
    if (mode === 'signup') {
      const password = String(values.get('password'));
      if (password !== values.get('confirm_password')) throw new Error('Passwords do not match.');
      const accountType = String(values.get('account_type'));
      const birthday = String(values.get('birthday') || '');
      const username = String(values.get('username')).trim();
      if (accountType === 'participant' && !birthday) throw new Error('Date of birth is required for participants.');
      const availability = await supabase.from('public_profiles').select('id').ilike('username', username).limit(1);
      if (availability.error) throw availability.error;
      if (availability.data.length) throw new Error('That email or username is already in use.');
      const { data, error } = await supabase.auth.signUp({
        email: String(values.get('email')).trim(), password,
        options: { data: { account_type: accountType, full_name: String(values.get('full_name')).trim(), username, birthday: accountType === 'participant' ? birthday : null } }
      });
      if (error) throw error;
      if (!data.session) throw new Error('Signup did not create an active session. Confirm email verification is disabled in Supabase Auth.');
      state.session = data.session;
      await loadOwnProfile();
      navigate('/profile/edit');
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email: String(values.get('email')).trim(), password: String(values.get('password')) });
      if (error) throw error;
      state.session = data.session;
      await loadOwnProfile();
      const destination = sessionStorage.getItem('vertex-return-path') || new URLSearchParams(location.search).get('returnTo') || '/profile/edit';
      sessionStorage.removeItem('vertex-return-path');
      navigate(destination.startsWith('/') && !destination.startsWith('//') ? destination : '/profile/edit');
    }
  } catch (error) {
    setStatus(status, authMessage(error), 'error');
    setSubmitting(form, false);
  }
}

async function saveProfile(form) {
  const status = document.querySelector('[data-form-status]');
  const values = new FormData(form);
  setStatus(status, '');
  setSubmitting(form, true, 'Saving profile');
  let uploadedPath = null;
  try {
    const socialLabels = values.getAll('social_label');
    const socialUrls = values.getAll('social_url');
    const socialLinks = socialUrls.map((url, index) => ({ label: String(socialLabels[index] || '').trim(), url: String(url || '').trim() })).filter(item => item.label || item.url);
    if (socialLinks.some(item => !item.label || !safeUrl(item.url))) throw new Error('Each social link needs a label and a valid http or https URL.');
    const file = values.get('avatar');
    if (file?.size) {
      if (file.size > 5 * 1024 * 1024) throw new Error('Profile picture must be 5 MB or smaller.');
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Choose a JPG, PNG, WebP, or GIF image.');
      const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[file.type];
      uploadedPath = `${state.session.user.id}/avatar-${Date.now()}.${extension}`;
      const upload = await supabase.storage.from('profile-pictures').upload(uploadedPath, file, { cacheControl: '3600', upsert: false, contentType: file.type });
      if (upload.error) throw upload.error;
    }
    const update = {
      full_name: String(values.get('full_name')).trim(), username: String(values.get('username')).trim(),
      bio: String(values.get('bio') || '').trim() || null, affiliation: String(values.get('affiliation') || '').trim() || null,
      location: String(values.get('location') || '').trim() || null, social_links: socialLinks
    };
    if (state.profile.account_type === 'participant') update.birthday = String(values.get('birthday'));
    if (uploadedPath) update.avatar_path = uploadedPath;
    const { data, error } = await supabase.from('profiles').update(update).eq('id', state.session.user.id).select().single();
    if (error) throw error;
    const oldPath = state.profile.avatar_path;
    state.profile = data;
    if (uploadedPath && oldPath && oldPath !== uploadedPath) await supabase.storage.from('profile-pictures').remove([oldPath]);
    setStatus(status, 'Profile saved.', 'success');
    history.replaceState({}, '', '/profile/edit');
    await render();
    requestAnimationFrame(() => setStatus(document.querySelector('[data-form-status]'), 'Profile saved.', 'success'));
  } catch (error) {
    if (uploadedPath) await supabase.storage.from('profile-pictures').remove([uploadedPath]);
    setStatus(status, authMessage(error), 'error');
    setSubmitting(form, false);
  }
}

async function logout() {
  if (supabase) await supabase.auth.signOut();
  state.session = null;
  state.profile = null;
  navigate('/login');
}

function bind() {
  document.querySelector('button[data-theme]')?.addEventListener('click', event => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('vertex-theme', theme);
    event.currentTarget.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    event.currentTarget.setAttribute('aria-checked', String(theme === 'dark'));
  });
  const menu = document.querySelector('[data-menu]');
  const drawer = document.querySelector('.drawer');
  menu?.addEventListener('click', () => {
    const open = drawer.dataset.open !== 'true';
    drawer.dataset.open = String(open);
    menu.ariaExpanded = String(open);
    menu.setAttribute('aria-label', `${open ? 'Close' : 'Open'} navigation`);
    menu.innerHTML = `<i class="fa-solid ${open ? 'fa-xmark' : 'fa-bars'}" aria-hidden="true"></i>`;
    document.body.classList.toggle('nav-open', open);
  });
  const options = [...document.querySelectorAll('[data-field-option]')];
  const selectionStatus = document.querySelector('[data-selection-status]');
  options.forEach(option => option.addEventListener('click', () => {
    option.setAttribute('aria-pressed', String(option.getAttribute('aria-pressed') !== 'true'));
    const count = options.filter(item => item.getAttribute('aria-pressed') === 'true').length;
    selectionStatus.textContent = count ? `${count} field${count === 1 ? '' : 's'} selected.` : 'No fields selected yet.';
  }));
  document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = button.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} password`);
    button.innerHTML = `<i class="fa-regular ${show ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
  }));
  document.querySelectorAll('input[name="account_type"]').forEach(input => input.addEventListener('change', () => {
    const birthday = document.querySelector('.participant-only input');
    const participant = input.form.elements.account_type.value === 'participant';
    document.querySelector('.participant-only')?.toggleAttribute('hidden', !participant);
    if (birthday) birthday.required = participant;
  }));
  document.querySelector('[data-auth-form]')?.addEventListener('submit', event => { event.preventDefault(); submitAuth(event.currentTarget); });
  document.querySelector('[data-profile-form]')?.addEventListener('submit', event => { event.preventDefault(); saveProfile(event.currentTarget); });
  document.querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', logout));
  document.querySelector('[data-add-social]')?.addEventListener('click', () => {
    const list = document.querySelector('[data-social-list]');
    if (list.children.length >= 8) { setStatus(document.querySelector('[data-form-status]'), 'You can add up to eight social links.', 'error'); return; }
    list.insertAdjacentHTML('beforeend', socialRow());
    bindSocialRemove();
    list.lastElementChild.querySelector('input').focus();
  });
  bindSocialRemove();
  const bio = document.querySelector('textarea[name="bio"]');
  bio?.addEventListener('input', () => { document.querySelector('[data-bio-count]').textContent = bio.value.length; });
  document.querySelector('input[name="full_name"]')?.addEventListener('input', event => { const target = document.querySelector('[data-preview-name]'); if (target) target.textContent = event.target.value || 'Your name'; });
  document.querySelector('input[name="username"]')?.addEventListener('input', event => { const target = document.querySelector('[data-preview-username]'); if (target) target.textContent = `@${event.target.value || 'username'}`; });
  const avatarInput = document.querySelector('input[name="avatar"]');
  avatarInput?.addEventListener('change', () => {
    const file = avatarInput.files[0];
    if (!file) return;
    const preview = document.querySelector('[data-avatar-preview]');
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img class="avatar avatar-medium" src="${url}" alt="Selected profile picture preview">`;
  });
  document.querySelector('[data-people-search]')?.addEventListener('submit', searchPeople);
}

function bindSocialRemove() {
  document.querySelectorAll('[data-remove-social]').forEach(button => {
    button.onclick = () => {
      const list = button.closest('[data-social-list]');
      if (list.children.length <= 1) {
        button.closest('.social-row').querySelectorAll('input').forEach(input => { input.value = ''; });
      } else button.closest('.social-row').remove();
    };
  });
}

async function searchPeople(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const query = String(new FormData(form).get('query')).trim();
  const status = document.querySelector('[data-search-status]');
  const results = document.querySelector('[data-people-results]');
  if (query.replace(/^@/, '').length < 2) { setStatus(status, 'Enter at least two characters.', 'error'); results.innerHTML = ''; return; }
  setStatus(status, 'Searching profiles…');
  results.innerHTML = `<div class="result-skeleton" aria-hidden="true"></div><div class="result-skeleton" aria-hidden="true"></div>`;
  const { data, error } = await supabase.rpc('search_profiles', { search_term: query, result_limit: 12 });
  if (error) { setStatus(status, authMessage(error), 'error'); results.innerHTML = ''; return; }
  setStatus(status, `${data.length} profile${data.length === 1 ? '' : 's'} found.`);
  results.innerHTML = peopleResults(data);
}

function opportunityLandscape() {
  const canvas = document.querySelector('.opportunity-grid');
  if (!canvas) return () => {};
  const context = canvas.getContext('2d', { alpha: true });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame = 0, last = 0, width = 0, height = 0, pixelRatio = 1, theme = '';
  const colors = {};
  const readColors = () => { const style = getComputedStyle(document.documentElement); theme = document.documentElement.dataset.theme; colors.base = style.getPropertyValue('--grid-canvas').trim(); colors.bright = style.getPropertyValue('--grid-canvas-bright').trim(); colors.node = style.getPropertyValue('--grid-node').trim(); };
  const point = (x, y, phase) => { const long = Math.sin(x * .009 + y * .006 + phase), cross = Math.cos(x * .005 - y * .011 - phase); return { x: x + (long + cross * .45) * 2.1, y: y + (Math.cos(x * .007 + y * .01 - phase) + long * .4) * 2.3 }; };
  const path = (phase, stroke, lineWidth) => { context.beginPath(); const gap = 48, pad = 56; for (let y = -pad; y <= height + pad; y += gap) for (let x = -pad, first = true; x <= width + pad; x += 12) { const p = point(x, y, phase); first ? (context.moveTo(p.x, p.y), first = false) : context.lineTo(p.x, p.y); } for (let x = -pad; x <= width + pad; x += gap) for (let y = -pad, first = true; y <= height + pad; y += 12) { const p = point(x, y, phase); first ? (context.moveTo(p.x, p.y), first = false) : context.lineTo(p.x, p.y); } context.strokeStyle = stroke; context.lineWidth = lineWidth; context.stroke(); };
  const draw = (time = 0, forced = false) => { if (!forced && !reduced && time - last < 32) { frame = requestAnimationFrame(draw); return; } last = time; if (theme !== document.documentElement.dataset.theme) readColors(); context.clearRect(0, 0, width, height); const phase = reduced ? Math.PI * .3 : (time % 20000) / 20000 * Math.PI * 2; path(phase, colors.base, 1); const gx = width * (.55 + .22 * Math.sin(phase)), gy = height * (.46 + .16 * Math.cos(phase)); const glow = context.createRadialGradient(gx, gy, 0, gx, gy, Math.max(width, height) * .42); glow.addColorStop(0, colors.bright); glow.addColorStop(.38, colors.base); glow.addColorStop(1, 'transparent'); path(phase, glow, 1.15); context.fillStyle = colors.node; for (let x = 0; x <= width + 48; x += 48) for (let y = 0; y <= height + 48; y += 48) { const wave = (Math.sin(x * .011 + y * .009 + phase) + 1) / 2; if (wave > .52) { const p = point(x, y, phase); context.globalAlpha = .1 + wave * .32; context.beginPath(); context.arc(p.x, p.y, .65 + wave * .55, 0, Math.PI * 2); context.fill(); } } context.globalAlpha = 1; if (!reduced && !forced) frame = requestAnimationFrame(draw); };
  const resize = () => { const bounds = canvas.getBoundingClientRect(); width = bounds.width; height = bounds.height; pixelRatio = Math.min(devicePixelRatio || 1, 1.5); canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(height * pixelRatio); context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0); readColors(); draw(0, true); };
  resize(); addEventListener('resize', resize, { passive: true }); if (!reduced) frame = requestAnimationFrame(draw);
  return () => { cancelAnimationFrame(frame); removeEventListener('resize', resize); };
}

async function scene() {
  const canvas = document.querySelector('.nf-canvas'), fallback = document.querySelector('.fallback');
  if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  try {
    const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, powerPreference: 'low-power' }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 1, .1, 100); camera.position.z = 5;
    const count = innerWidth < 700 ? 190 : 360, positions = new Float32Array(count * 3); for (let i = 0; i < positions.length; i += 3) { positions[i] = (Math.random() - .5) * 10; positions[i + 1] = (Math.random() - .5) * 7; positions[i + 2] = (Math.random() - .5) * 5; }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), size: .035, transparent: true, opacity: .65 });
    const points = new THREE.Points(geometry, material); scene.add(points); fallback.hidden = true;
    let frame = 0, x = 0, y = 0;
    const resize = () => { renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); camera.aspect = canvas.clientWidth / canvas.clientHeight; camera.updateProjectionMatrix(); };
    const pointer = event => { x = (event.clientX / innerWidth - .5) * .34; y = (event.clientY / innerHeight - .5) * .24; };
    const draw = () => { points.rotation.y += (x - points.rotation.y) * .035; points.rotation.x += (-y - points.rotation.x) * .035; points.rotation.z += .00045; renderer.render(scene, camera); frame = requestAnimationFrame(draw); };
    resize(); addEventListener('resize', resize); addEventListener('pointermove', pointer, { passive: true }); draw();
    return () => { cancelAnimationFrame(frame); removeEventListener('resize', resize); removeEventListener('pointermove', pointer); geometry.dispose(); material.dispose(); renderer.dispose(); };
  } catch (error) { console.warn('Three.js unavailable; static fallback active.', error); return () => {}; }
}

async function resolveRoute(path) {
  if (path === '/') return { content: home(), title: 'Vertex - Student competitions, clearly organised' };
  if (path === '/discover') return { content: discover(), title: 'Discover competitions - Vertex' };
  if (path === '/people') return { content: peopleView(), title: 'Find people - Vertex' };
  if (path === '/login') return { content: authView('login'), title: 'Log in - Vertex', noFooter: true };
  if (path === '/signup') return { content: authView('signup'), title: 'Sign up - Vertex', noFooter: true };
  if (path === '/profile/edit') {
    if (!state.session) return { protected: true };
    if (!state.profile) await loadOwnProfile();
    return { content: profileForm(state.profile), title: 'Edit profile - Vertex' };
  }
  const match = path.match(/^\/profile\/@([A-Za-z0-9_]{3,24})$/);
  if (match) {
    const { data, error } = await supabase.from('public_profiles').select('*').eq('username', match[1]).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { content: publicProfileView(data), title: `${data.full_name} (@${data.username}) - Vertex` };
  }
  return null;
}

async function render() {
  cleanup(); cleanup = () => {}; document.body.classList.remove('nav-open');
  const path = location.pathname;
  try {
    if (!state.authReady) app.innerHTML = shell(loadingView('Checking your session'), path, true);
    const route = await resolveRoute(path);
    if (route?.protected) {
      sessionStorage.setItem('vertex-return-path', `${location.pathname}${location.search}`);
      history.replaceState({}, '', `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return render();
    }
    document.title = route ? route.title : 'Page not found - Vertex';
    app.innerHTML = shell(route ? route.content : notFound(), location.pathname, route?.noFooter || !route);
    bind();
    if (!initialRender) document.querySelector('#main-content')?.focus({ preventScroll: true });
    initialRender = false; scrollTo(0, 0);
    if (path === '/') cleanup = opportunityLandscape(); else if (!route) cleanup = await scene();
    if (window.gsap && !matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.from('.hero-copy > *, .page-head, .profile-identity > *', { y: 22, opacity: 0, duration: .7, stagger: .07, ease: 'power3.out' });
  } catch (error) {
    console.error(error);
    document.title = 'Vertex could not open this page';
    app.innerHTML = shell(errorView('Vertex could not open this page.', authMessage(error)), path);
    bind();
  }
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

document.addEventListener('click', event => {
  const anchor = event.target.closest('a[data-link]');
  if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(anchor.href, location.origin);
  if (url.origin !== location.origin) return;
  event.preventDefault(); navigate(url.pathname + url.search);
});

addEventListener('popstate', render);

const recovered = sessionStorage.getItem('vertex-recovery-route');
if (recovered) { sessionStorage.removeItem('vertex-recovery-route'); history.replaceState({}, '', recovered); }

async function bootstrap() {
  if (!supabase) { state.authReady = true; return render(); }
  const { data, error } = await supabase.auth.getSession();
  if (error) console.error(error);
  state.session = data.session;
  if (state.session) {
    try { await loadOwnProfile(); } catch (profileError) { console.error(profileError); }
  }
  state.authReady = true;
  supabase.auth.onAuthStateChange((event, session) => {
    state.session = session;
    if (event === 'SIGNED_OUT') state.profile = null;
  });
  render();
}

bootstrap();
