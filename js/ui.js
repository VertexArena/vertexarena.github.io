import { FIELDS, STRUCTURES, mockAnnouncements, mockQuestions, mockTeams } from "./data.js";

export const state = {
  session: null,
  profile: null,
  theme: localStorage.getItem("vertex:theme") || "light",
  installPrompt: null,
  filters: { search: "", field: "All", team: "all" },
  activeTool: "overview"
};

export function shell(content, active = "discover") {
  const isHome = active === "discover" && location.pathname === "/";
  const isAuthed = Boolean(state.session);
  const nav = isAuthed
    ? [["discover", "/", "Discover"], ["student", "/student", "Student"], ["organiser", "/organiser", "Organiser"], ["create", "/organisercreate", "Create"], ["profile", "/profile", "Profile"]]
    : [["discover", "/", "Discover"], ["student", "/student", "For students"], ["organiser", "/organiser", "For organisers"]];
  document.documentElement.dataset.theme = state.theme;
  const authActions = isAuthed
    ? `${!isHome ? '<button class="icon-btn" data-action="notify" title="Notifications"><i class="fa-solid fa-bell"></i></button>' : ''}<button class="btn secondary compact" data-action="signout">Sign out</button>`
    : `<a class="btn secondary compact" href="/signin" data-link>Sign in</a><a class="btn primary compact" href="/signup" data-link>Create account</a>`;
  return `
    <header class="topbar ${isHome ? "home-topbar" : ""}">
      <div class="topbar-inner">
        <a class="brand" href="/" data-link><img src="/assets/logo.png" alt=""><span>VERTEX</span></a>
        <nav class="nav" aria-label="Main navigation">
          ${nav.map(([id, href, label]) => `<a href="${href}" data-link class="${active === id ? "active" : ""}">${label}</a>`).join("")}
        </nav>
        <div class="top-actions">
          <button class="icon-btn" data-action="theme" title="Toggle theme"><i class="fa-solid ${state.theme === "dark" ? "fa-sun" : "fa-moon"}"></i></button>
          ${authActions}
        </div>
      </div>
    </header>
    <main class="container page-enter">${content}</main>
  `;
}

function authShell(content, mode) {
  document.documentElement.dataset.theme = state.theme;
  return `
    <main class="auth-scene ${mode}">
      <a class="auth-brand" href="/" data-link><img src="/assets/logo.png" alt=""><span>VERTEX</span></a>
      <button class="icon-btn auth-theme" data-action="theme" title="Toggle theme"><i class="fa-solid ${state.theme === "dark" ? "fa-sun" : "fa-moon"}"></i></button>
      <section class="auth-panel page-enter">
        ${content}
      </section>
    </main>
  `;
}

export function hero(competitions = []) {
  const featured = competitions[0];
  return `
    <section class="landing-hero">
      <div class="hero-statement">
        <span class="eyebrow">Competition infrastructure for schools</span>
        <h1>One place to discover, enter, and run student competitions.</h1>
        <p class="lede">Vertex replaces scattered forms, chats, drive folders, and manual result sheets with a structured competition workspace for students and organisers.</p>
        <div class="hero-actions">
          <a class="btn primary" href="#discovery">Browse competitions</a>
          <a class="btn secondary" href="/organiser" data-link>Organiser workspace</a>
        </div>
      </div>
      <aside class="operations-sheet" data-tilt aria-label="Vertex operations preview">
        <div class="sheet-head">
          <div>
            <span class="eyebrow">Current round</span>
            <h2>${featured?.name || "Vertex Code Cup"}</h2>
          </div>
          <span class="status-chip">Registration open</span>
        </div>
        <div class="sheet-grid">
          ${operationMetric("Participants", featured?.participant_count || 184)}
          ${operationMetric("Teams", featured?.team_count || 62)}
          ${operationMetric("Submissions", "128")}
        </div>
        <ol class="process-list">
          <li><span>Registration closes</span><b>${formatDate(featured?.registration_deadline)}</b></li>
          <li><span>Round 1 submissions</span><b>File + link upload</b></li>
          <li><span>Leaderboard release</span><b>Scheduled</b></li>
          <li><span>Certificates</span><b>Dynamic templates</b></li>
        </ol>
      </aside>
    </section>
  `;
}

function operationMetric(label, value) {
  return `<div class="op-metric"><span>${label}</span><b>${value}</b></div>`;
}

export function discovery(competitions) {
  return `
    ${hero(competitions)}
    <section class="section discovery-section" id="discovery">
      <div class="section-head editorial-head">
        <div><span class="eyebrow">Discovery</span><h2>Find competitions accepting students.</h2></div>
      </div>
      ${filters()}
      <div class="competition-list" id="competition-grid">
        ${competitions.length ? competitions.map((item, index) => competitionCard(item, index)).join("") : emptyState("No competitions match these filters.", "Adjust search or field filters to expand the list.")}
      </div>
    </section>
  `;
}

function filters() {
  return `
    <div class="filter-bar">
      <label><span>Search</span><input class="field" data-search placeholder="Search competitions"></label>
      <label><span>Field</span><select class="select" data-field><option>All</option>${FIELDS.map((field) => `<option ${state.filters.field === field ? "selected" : ""}>${field}</option>`).join("")}</select></label>
      <div class="segmented" data-filter="team" aria-label="Team filter">
        ${[["all", "All"], ["individual", "Individual"], ["team", "Team"], ["both", "Both"]].map(([mode, label]) => `<button class="${state.filters.team === mode ? "active" : ""}" data-team="${mode}">${label}</button>`).join("")}
      </div>
    </div>
  `;
}

export function competitionCard(item, index = 0) {
  const deadline = new Date(item.registration_deadline);
  const daysLeft = Math.max(0, Math.ceil((deadline - new Date()) / 86400000));
  return `
    <article class="competition-row" style="--i:${index}">
      <div class="competition-mark" style="--banner:${item.banner_gradient}"></div>
      <div class="competition-main">
        <div class="row-title">
          <div>
            <h3>${item.name}</h3>
            <p>${item.description}</p>
          </div>
          <button class="bookmark" data-save="${item.slug}" title="Save"><i class="fa-${item.saved ? "solid" : "regular"} fa-bookmark"></i></button>
        </div>
        <div class="meta-line">
          <span>${item.field}</span><span>${item.team_mode}</span><span>Ages ${item.age_min}-${item.age_max}</span><span>${item.organizer_name}</span>
        </div>
      </div>
      <div class="competition-deadline">
        <span>${daysLeft} days left</span>
        <b>${formatDate(item.registration_deadline)}</b>
        <a class="btn primary compact" href="/competition/${item.slug}" data-link>Open</a>
      </div>
    </article>
  `;
}

export function competitionDetail(item, role = "participant") {
  if (!item) return notFound();
  return shell(`
    <section class="detail-header">
      <div class="banner-strip" style="--banner:${item.banner_gradient}"></div>
      <div class="detail-title">
        <div>
          <span class="eyebrow">${item.organizer_name || "Organisation"}</span>
          <h1>${item.name}</h1>
          <p class="lede">${item.description}</p>
        </div>
        ${role === "participant" ? `<button class="btn primary" data-action="register" data-id="${item.id}">Register</button>` : `<a class="btn primary" href="/organisercreate/" data-link>Edit setup</a>`}
      </div>
      <div class="stat-grid">
        ${infoMetric("Prize", item.prize)}
        ${infoMetric("Format", item.team_mode)}
        ${infoMetric("Deadline", formatDate(item.registration_deadline))}
      </div>
    </section>
    <section class="dashboard ${role}">
      ${toolNav(role)}
      <div class="work-surface" id="tool-surface">${toolView(state.activeTool, item, role)}</div>
    </section>
  `, role === "organiser" ? "organiser" : "discover");
}

function infoMetric(title, value) {
  return `<div class="stat"><span>${title}</span><b>${value}</b></div>`;
}

function toolNav(role) {
  const tools = [
    ["overview", "Overview"], ["announcements", "Announcements"], ["qa", "Q&A"], ["meetings", "Meetings"],
    ["submissions", "Submissions"], ["scoring", "Scoring"], ["leaderboard", "Leaderboard"], ["certificates", "Certificates"], ["prizes", "Prizes"]
  ];
  if (role === "organiser") tools.splice(4, 0, ["team", "Team"]);
  return `<aside class="sidebar"><span class="sidebar-label">${role === "organiser" ? "Organiser tools" : "Competition panel"}</span>${tools.map(([id, label]) => `<button class="side-link ${state.activeTool === id ? "active" : ""}" data-tool="${id}">${label}</button>`).join("")}</aside>`;
}

export function toolView(tool, item, role = "participant") {
  const editable = role === "organiser";
  if (tool === "announcements") return announcementsView(editable);
  if (tool === "qa") return qaView(editable);
  if (tool === "meetings") return meetingsView(item, editable);
  if (tool === "team") return teamToolsView();
  if (tool === "submissions") return submissionsView(editable);
  if (tool === "scoring") return scoringView();
  if (tool === "leaderboard") return leaderboardView(item);
  if (tool === "certificates") return certificatesView();
  if (tool === "prizes") return comingSoon("Prize distribution", "Prize details are stored now. Distribution tools are coming soon.");
  return overviewView(item, editable);
}

function toolHeader(kicker, title, action = "") {
  return `<div class="tool-head"><div><span class="eyebrow">${kicker}</span><h2>${title}</h2></div>${action}</div>`;
}

function overviewView(item, editable) {
  return `
    ${toolHeader("Control room", item.name, editable ? '<button class="btn secondary compact">Edit details</button>' : "")}
    <p class="body-copy">${item.description}</p>
    <div class="round-table">
      <div class="table-row head"><span>Round</span><span>Advance rule</span><span>Status</span></div>
      ${item.structure.rounds.map((round, index) => `<div class="table-row"><span>${round.name}</span><span>Top ${round.advances}</span><span>${index === 0 ? "Open" : "Pending"}</span></div>`).join("")}
    </div>
    <div class="split-grid">
      <div class="panel flat"><h3>Participation</h3><p>${item.participant_count || 0} students and ${item.team_count || 0} teams are tracked for this event.</p></div>
      <div class="panel flat"><h3>Categories</h3><div class="tag-line">${item.categories.map((cat) => `<span>${cat}</span>`).join("") || "No categories"}</div></div>
    </div>
  `;
}

function announcementsView(editable) {
  return `
    ${toolHeader("Communication", "Announcements")}
    ${editable ? `<form class="form-grid" data-form="announcement"><input class="field" name="title" placeholder="Title"><textarea class="textarea" name="body" placeholder="Message to all participants"></textarea><button class="btn primary">Send announcement</button></form>` : emptyState("No new action needed.", "Announcements from organisers appear here as they are posted.")}
    <div class="timeline-list">${mockAnnouncements.map((item) => `<article><time>${formatDate(item.created_at)}</time><div><h3>${item.title}</h3><p>${item.body}</p></div></article>`).join("")}</div>
  `;
}

function qaView(editable) {
  return `
    ${toolHeader("Realtime questions", "Q&A")}
    ${!editable ? `<form class="form-grid" data-form="question"><textarea class="textarea" name="question" placeholder="Ask a question"></textarea><button class="btn primary">Post question</button></form>` : ""}
    <div class="timeline-list">${mockQuestions.map((item) => `<article><time>${item.author_name}</time><div><h3>${item.question}</h3><p>${item.answer || "Waiting for organiser reply."}</p>${editable ? '<button class="btn secondary compact">Reply</button>' : ""}</div></article>`).join("")}</div>
  `;
}

function meetingsView(item, editable) {
  return `
    ${toolHeader("Jitsi meetings", "Meetings")}
    ${editable ? `<form class="form-grid two" data-form="meeting"><input class="field" name="name" placeholder="meeting-name"><select class="select" name="audience"><option>All participants</option><option>Top 30</option><option>Specific teams</option></select><button class="btn primary">Create meeting</button></form>` : ""}
    <div class="table-row meeting-row"><span>orientation</span><span>/${item.slug}/meeting/orientation</span><a class="btn primary compact" href="/${item.slug}/meeting/orientation" data-link>Join</a></div>
  `;
}

function teamToolsView() {
  return `
    ${toolHeader("Access", "Event team")}
    <form class="form-grid two" data-form="organiser-invite"><input class="field" name="username" placeholder="@username"><select class="select" name="role"><option>Organiser</option><option>Judge</option><option>Viewer</option></select><button class="btn primary">Invite</button></form>
    <div class="table-row"><span>Priya Kapoor<br><small>@priya</small></span><span>Organiser</span><span>Accepted</span></div>
  `;
}

function submissionsView(editable) {
  return `
    ${toolHeader("25 MB hard limit", "Submissions")}
    ${editable ? `<form class="form-grid two" data-form="submission-box"><input class="field" name="round" placeholder="Round name"><input class="field" name="fileTypes" placeholder=".pdf,.zip,.png"><select class="select" name="mode"><option>Files and links</option><option>Files only</option><option>Links only</option></select><input class="field" type="datetime-local" name="closeAt"><button class="btn primary">Save submission box</button></form>` : `<form class="form-grid" data-form="submission"><input class="field" type="file" name="file"><input class="field" name="url" placeholder="GitHub, Drive, or live URL"><button class="btn primary">Submit round</button></form>`}
  `;
}

function scoringView() {
  const cutoff = 3;
  return `
    ${toolHeader("Tie-aware scoring", "Scores", `<button class="btn primary compact">Auto-select top ${cutoff}</button>`)}
    <div class="round-table score-table">
      <div class="table-row head"><span>Rank</span><span>Team</span><span>Category</span><span>Score</span></div>
      ${mockTeams.map((team, index) => `<div class="table-row ${index === cutoff - 1 || index === cutoff ? "score-tie" : ""}"><span>${index + 1}</span><span>${team.name}</span><span>${team.category}</span><input class="field compact-field" value="${index >= 2 ? 92 : team.score}"></div>`).join("")}
    </div>
    <div class="segmented tie-policy"><button class="active">Leave tied teams</button><button>Include all tied</button><button>Pick manually</button></div>
  `;
}

function leaderboardView(item) {
  return `
    ${toolHeader(`/${item.slug}/leaderboard/top-100`, "Leaderboard", '<input class="field search-field" data-leader-search placeholder="Search team or name">')}
    <div class="podium">
      ${mockTeams.slice(0, 3).map((team, index) => `<div class="place"><span>#${index + 1}</span><h3>${team.name}</h3><p>${team.score} points</p></div>`).join("")}
    </div>
    <div class="round-table">${mockTeams.map((team, index) => `<div class="table-row" data-leader="${team.name.toLowerCase()} ${team.members.map((member) => member.full_name.toLowerCase()).join(" ")}"><span>${index + 1}. ${team.name}</span><span>${team.members.map((member) => `${member.full_name} @${member.username}`).join("; ")}</span><span>${team.category}</span></div>`).join("")}</div>
  `;
}

function certificatesView() {
  return `
    ${toolHeader("Generated on request", "Certificates", '<button class="btn primary compact" data-action="preview-certificate">Preview</button>')}
    <div class="certificate-editor">
      <div class="certificate-canvas"><div class="certificate-field">Participant Name</div></div>
      <div class="form-grid panel flat">
        <label><span>Template type</span><select class="select"><option>Participation</option><option>Top 100</option><option>Overall winner</option><option>Category winner</option></select></label>
        <label><span>Dynamic value</span><select class="select"><option>Participant name</option><option>Placement</option><option>Category</option><option>Competition name</option></select></label>
        <label><span>Font size</span><input class="field" type="number" value="38"></label>
        <label><span>Color</span><input class="field" type="color" value="#111827"></label>
      </div>
    </div>
  `;
}

function comingSoon(title, body) {
  return `${toolHeader("Coming soon", title)}<div class="empty-state"><h3>${body}</h3><p>Prize details remain visible on competition pages.</p></div>`;
}

export function organiserHome(competitions) {
  const signedOut = !state.session;
  return shell(`
    <section class="workspace-hero organiser-hero ${signedOut ? "signed-out" : ""}">
      <div><span class="eyebrow">Organiser workspace</span><h1>${signedOut ? "Run competitions with fewer moving parts." : "Create the competition, then run every operational step."}</h1><p class="lede">${signedOut ? "Schools can publish competitions, collect registrations, brief participants, host meetings, review submissions, release results, and generate certificates from one place." : "Set structure, deadlines, teams, meetings, submissions, scoring, results, and certificate rules from one workspace."}</p></div>
      ${signedOut ? '<div class="hero-actions"><a class="btn primary" href="/signup" data-link>Create organiser account</a><a class="btn secondary" href="/signin" data-link>Sign in</a></div>' : '<a class="btn primary" href="/organiser/create" data-link>New competition</a>'}
    </section>
    ${signedOut ? organiserPreview() : `<section class="section"><div class="section-head"><h2>Managed competitions</h2></div><div class="competition-list">${competitions.map((item) => competitionCard(item)).join("")}</div></section>`}
  `, "organiser");
}

function organiserPreview() {
  return `
    <section class="section preview-grid">
      <div class="preview-panel"><span>01</span><h3>Structure rounds</h3><p>Choose direct winners or multi-round advancement with clear cutoffs.</p></div>
      <div class="preview-panel"><span>02</span><h3>Operate live</h3><p>Announcements, Q&A, meetings, teams, submissions, and judging stay together.</p></div>
      <div class="preview-panel"><span>03</span><h3>Release outcomes</h3><p>Schedule leaderboards and generate certificate downloads from templates.</p></div>
    </section>
  `;
}

export function studentHome(competitions) {
  const signedOut = !state.session;
  return shell(`
    <section class="workspace-hero student-hero ${signedOut ? "signed-out" : ""}">
      <div><span class="eyebrow">Student workspace</span><h1>${signedOut ? "Find competitions before making an account." : "Track registrations, submissions, results, and certificates."}</h1><p class="lede">${signedOut ? "Browse public competitions freely. Sign in when you want to register, save events, join teams, ask questions, or submit work." : "Your active competitions stay separate from public discovery."}</p></div>
      ${signedOut ? '<a class="btn primary" href="/signin" data-link>Sign in to register</a>' : ""}
    </section>
    ${signedOut ? `<section class="section"><div class="section-head"><h2>Open competitions</h2></div><div class="competition-list">${competitions.map((item) => competitionCard(item)).join("")}</div></section>` : `<section class="stat-grid">${infoMetric("Upcoming", "2 registered")}${infoMetric("In progress", "1 active")}${infoMetric("Achievements", "7 earned")}</section><section class="section"><div class="section-head"><h2>Next actions</h2></div><div class="competition-list">${competitions.slice(0, 2).map((item) => competitionCard(item)).join("")}</div></section>`}
  `, "student");
}

export function createCompetitionView() {
  if (!state.session) {
    return shell(`
      <section class="workspace-hero signed-out">
        <div><span class="eyebrow">Organiser access</span><h1>Sign in before creating a competition.</h1><p class="lede">Competition setup writes organiser data, storage rules, timelines, and staff permissions. Create an organiser account or sign in to continue.</p></div>
        <div class="hero-actions"><a class="btn primary" href="/signin" data-link>Sign in</a><a class="btn secondary" href="/signup" data-link>Create account</a></div>
      </section>
    `, "create");
  }
  return shell(`
    <section class="form-page">
      <div><span class="eyebrow">Competition setup</span><h1>Define event structure.</h1><p class="lede">Start with essentials. Organiser tools become available after creation.</p></div>
      <form class="panel form-grid" data-form="create-competition">
        <div class="form-grid two">
          <label><span>Name</span><input class="field" name="name" required placeholder="Vertex Code Cup"></label>
          <label><span>Field</span><select class="select" name="field">${FIELDS.map((field) => `<option>${field}</option>`).join("")}</select></label>
          <label><span>Prize</span><input class="field" name="prize" required placeholder="INR 25,000 and certificates"></label>
          <label><span>Age range</span><input class="field" name="age" placeholder="12-18"></label>
          <label><span>Team mode</span><select class="select" name="team_mode"><option>individual</option><option>team</option><option>both</option></select></label>
          <label><span>Structure</span><select class="select" name="structure_id">${STRUCTURES.map((item) => `<option value="${item.id}">${item.name}</option>`).join("")}</select></label>
          <label><span>Registration deadline</span><input class="field" type="datetime-local" name="registration_deadline" required></label>
          <label><span>Start date</span><input class="field" type="datetime-local" name="start_at" required></label>
          <label><span>End date</span><input class="field" type="datetime-local" name="end_at" required></label>
          <label><span>Banner colour</span><select class="select" name="banner_gradient"><option value="#005fe0">Logo blue</option><option value="#1f2937">Slate</option><option value="#0f766e">Institutional teal</option></select></label>
        </div>
        <label><span>Categories</span><input class="field" name="categories" placeholder="Junior, Senior, Best UI"></label>
        <label><span>Description</span><textarea class="textarea" name="description" required placeholder="Explain what students will do and how judging works."></textarea></label>
        <label><span>Certificate template</span><input class="field" type="file" name="certificate" accept="image/*"></label>
        <button class="btn primary">Create competition</button>
      </form>
    </section>
  `, "create");
}

export function signInView() {
  return authShell(`
    <div class="auth-copy">
      <span class="eyebrow">Secure account</span>
      <h1>Sign in to Vertex.</h1>
      <p>Access registrations, submissions, judging tools, announcements, and certificates from your workspace.</p>
    </div>
    <form class="auth-card form-grid" data-form="signin">
      <label><span>Email</span><input class="field" type="email" name="email" placeholder="you@example.com" required></label>
      <label><span>Password</span><input class="field" type="password" name="password" placeholder="Password" required></label>
      <button class="btn primary auth-submit">Sign in</button>
      <p class="auth-switch">New to Vertex? <a href="/signup" data-link>Create account</a></p>
    </form>
  `, "signin");
}

export function signUpView() {
  return authShell(`
    <div class="auth-copy">
      <span class="eyebrow">Join Vertex</span>
      <h1>Create your account.</h1>
      <p>Choose participant, organiser, or organisation. Usernames stay unique; full names appear on certificates.</p>
    </div>
    <form class="auth-card form-grid" data-form="signup">
      <div class="form-grid two">
        <label><span>Full name</span><input class="field" name="full_name" placeholder="Aarav Mehta" required></label>
        <label><span>Username</span><input class="field" name="username" placeholder="@username" required></label>
        <label><span>Email</span><input class="field" type="email" name="email" placeholder="you@example.com" required></label>
        <label><span>Password</span><input class="field" type="password" name="password" placeholder="Password" required></label>
      </div>
      <label><span>Account type</span><select class="select" name="account_type"><option>participant</option><option>organiser</option><option>organisation</option></select></label>
      <label><span>Bio</span><textarea class="textarea" name="bio" placeholder="Short profile for other participants and organisers"></textarea></label>
      <button class="btn primary auth-submit">Create account</button>
      <p class="auth-switch">Already have an account? <a href="/signin" data-link>Sign in</a></p>
    </form>
  `, "signup");
}

export function authView() {
  return signInView();
}

export function profileView(profile) {
  const item = profile || { full_name: "Guest", username: "guest", account_type: "visitor", bio: "Sign in to register, manage teams, and receive notifications." };
  const action = state.session ? '<button class="btn primary" data-action="push">Enable push</button>' : '<a class="btn primary" href="/signin" data-link>Sign in</a>';
  return shell(`
    <section class="detail-header">
      <div class="detail-title"><div><span class="eyebrow">${item.account_type}</span><h1>${item.full_name}</h1><p class="lede">@${item.username}</p></div>${action}</div>
      <p class="body-copy">${item.bio || ""}</p>
    </section>
  `, "profile");
}

export function meetingPage(params) {
  const room = encodeURIComponent(`vertex-${params.competition}-${params.meeting}`);
  return `<div style="height:100vh;background:#0b1120"><iframe title="Jitsi meeting" src="https://meet.jit.si/${room}" allow="camera; microphone; fullscreen; display-capture" style="width:100%;height:100%;border:0"></iframe></div>`;
}

export function notFound() {
  const particles = Array.from({ length: 42 }, (_, index) => `<span class="particle" style="--x:${(index * 73) % 100}vw;--y:${(index * 41) % 100}vh;--d:${8 + (index % 9)}s"></span>`).join("");
  return shell(`<section class="not-found-scene" data-error-tilt>${particles}<div class="error-card"><div class="error-code">404</div><h1>Route not found.</h1><p class="lede">This competition link does not exist yet.</p><div class="hero-actions" style="justify-content:center"><a class="btn primary" href="/" data-link>Back to discovery</a></div></div></section>`);
}

function emptyState(title, body) {
  return `<div class="empty-state"><h3>${title}</h3><p>${body}</p></div>`;
}

export function formatDate(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function toast(message) {
  const region = document.getElementById("toast-region");
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}
