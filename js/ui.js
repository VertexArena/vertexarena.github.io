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
  const nav = [
    ["discover", "/", "fa-compass", "Discover"],
    ["participant", "/student", "fa-user-graduate", "Student"],
    ["organiser", "/organiser", "fa-building-user", "Organiser"],
    ["create", "/organiser/create", "fa-plus", "Create"],
    ["profile", "/profile", "fa-id-badge", "Profile"]
  ];
  document.documentElement.dataset.theme = state.theme;
  return `
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="/" data-link><img src="/assets/logo.png" alt=""><span>VERTEX</span></a>
        <nav class="nav" aria-label="Main navigation">
          ${nav.map(([id, href, icon, label]) => `<a href="${href}" data-link class="${active === id ? "active" : ""}"><i class="fa-solid ${icon}"></i> ${label}</a>`).join("")}
        </nav>
        <div class="top-actions">
          <button class="icon-btn" data-action="notify" title="Notifications"><i class="fa-solid fa-bell"></i></button>
          <button class="icon-btn" data-action="theme" title="Toggle theme"><i class="fa-solid ${state.theme === "dark" ? "fa-sun" : "fa-moon"}"></i></button>
          <a class="btn primary" href="/auth" data-link><i class="fa-solid fa-right-to-bracket"></i><span>${state.session ? "Account" : "Sign in"}</span></a>
        </div>
      </div>
    </header>
    <main class="container masked">${content}</main>
  `;
}

export function hero() {
  return `
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">Competition operating system</span>
        <h1>Run school competitions without scattered tools.</h1>
        <p class="lede">Discovery, registration, teams, announcements, meetings, submissions, scoring, leaderboards, and certificate generation in one clean workspace.</p>
        <div class="hero-actions">
          <a class="btn primary" href="/organiser/create" data-link><i class="fa-solid fa-plus"></i>Create competition</a>
          <a class="btn" href="/student" data-link><i class="fa-solid fa-magnifying-glass"></i>Find opportunities</a>
        </div>
      </div>
      <aside class="bracket-board" data-tilt>
        <div class="bracket-head">
          <div><span class="eyebrow">Live bracket</span><h3>Code Cup judging</h3></div>
          <span class="live-dot"></span>
        </div>
        <div class="bracket-grid">
          <div class="bracket-lane">
            ${["540 entries", "100 advancing", "tie at rank 100"].map((text, index) => bracketNode(text, ["Registration", "Round 1", "Review"][index])).join("")}
          </div>
          <div class="bracket-lane">
            <div class="bracket-line"></div>
            ${bracketNode("30 finalists", "Round 2")}
            <div class="bracket-line"></div>
          </div>
          <div class="bracket-lane">
            ${bracketNode("3 winners", "Podium")}
            ${bracketNode("8 category awards", "Certificates")}
          </div>
        </div>
        <div class="metric-row">
          <div class="metric"><b data-count="184">0</b><span>participants</span></div>
          <div class="metric"><b data-count="62">0</b><span>teams</span></div>
          <div class="metric"><b data-count="4">0</b><span>rounds tracked</span></div>
        </div>
      </aside>
    </section>
  `;
}

function bracketNode(value, label) {
  return `<div class="bracket-node"><strong>${value}</strong><span>${label}</span></div>`;
}

export function discovery(competitions) {
  return `
    ${hero()}
    <section class="section">
      <div class="section-head">
        <div><span class="eyebrow">Browse</span><h2>Competitions</h2></div>
        <div class="segmented" data-filter="team">
          ${["all", "individual", "team", "both"].map((mode) => `<button class="${state.filters.team === mode ? "active" : ""}" data-team="${mode}">${mode}</button>`).join("")}
        </div>
      </div>
      ${filters()}
      <div class="grid cols-3 stagger" id="competition-grid">
        ${competitions.map((item, index) => competitionCard(item, index)).join("")}
      </div>
    </section>
    <section class="section">
      <div class="section-head"><div><span class="eyebrow">Recommendations</span><h2>Made for range</h2></div></div>
      <div class="grid cols-2">
        ${recommendationPanel("Because you like team events", "Research forums and build sprints where team coordination matters.", "fa-users")}
        ${recommendationPanel("New to you", "Writing, debate, and maths events intentionally outside your normal pattern.", "fa-shuffle")}
      </div>
    </section>
  `;
}

function filters() {
  return `
    <div class="panel form-grid two" style="margin-bottom:16px">
      <label><span>Search</span><input class="field" data-search placeholder="Search by competition name"></label>
      <label><span>Field</span><select class="select" data-field><option>All</option>${FIELDS.map((field) => `<option ${state.filters.field === field ? "selected" : ""}>${field}</option>`).join("")}</select></label>
    </div>
  `;
}

export function competitionCard(item, index = 0) {
  const deadline = new Date(item.registration_deadline);
  const daysLeft = Math.max(0, Math.ceil((deadline - new Date()) / 86400000));
  return `
    <article class="card competition-card" style="--i:${index};--banner:${item.banner_gradient}">
      <div class="competition-banner"></div>
      <div class="tags">
        <span class="tag"><i class="fa-solid fa-tag"></i>${item.field}</span>
        <span class="tag"><i class="fa-solid fa-users"></i>${item.team_mode}</span>
        <span class="tag"><i class="fa-solid fa-child-reaching"></i>${item.age_min}-${item.age_max}</span>
      </div>
      <h3>${item.name}</h3>
      <p class="mini">${item.description}</p>
      <div class="deadline">
        <div class="list-row"><span><b>${daysLeft} days</b><br><span class="mini">registration deadline</span></span><button class="icon-btn" data-save="${item.slug}" title="Save"><i class="fa-${item.saved ? "solid" : "regular"} fa-bookmark"></i></button></div>
        <div class="progress" aria-label="Timeline progress"><span style="--value:${item.status === "in_progress" ? "64%" : "28%"}"></span></div>
      </div>
      <a class="btn primary" href="/competition/${item.slug}" data-link><i class="fa-solid fa-arrow-up-right-from-square"></i>Open</a>
    </article>
  `;
}

function recommendationPanel(title, body, icon) {
  return `<article class="panel"><div class="tags"><span class="tag"><i class="fa-solid ${icon}"></i>${title}</span></div><p class="lede" style="font-size:18px">${body}</p></article>`;
}

export function competitionDetail(item, role = "participant") {
  if (!item) return notFound();
  return shell(`
    <section class="section">
      <div class="competition-banner" style="--banner:${item.banner_gradient};border-radius:var(--radius);height:220px;margin:0 0 22px"></div>
      <div class="section-head">
        <div><span class="eyebrow">${item.organizer_name}</span><h1 style="font-size:clamp(44px,7vw,86px)">${item.name}</h1></div>
        <button class="btn primary" data-action="register" data-id="${item.id}"><i class="fa-solid fa-check"></i>Register</button>
      </div>
      <div class="grid cols-3">
        ${infoMetric("Prize", item.prize)}
        ${infoMetric("Format", item.team_mode)}
        ${infoMetric("Deadline", formatDate(item.registration_deadline))}
      </div>
    </section>
    <section class="dashboard">
      ${toolNav(role)}
      <div class="panel tool-surface" id="tool-surface">${toolView(state.activeTool, item, role)}</div>
    </section>
  `, role === "organiser" ? "organiser" : "discover");
}

function infoMetric(title, value) {
  return `<div class="panel"><span class="mini">${title}</span><h3>${value}</h3></div>`;
}

function toolNav(role) {
  const tools = [
    ["overview", "fa-table-columns", "Overview"],
    ["announcements", "fa-bullhorn", "Announcements"],
    ["qa", "fa-circle-question", "Q&A"],
    ["meetings", "fa-video", "Meetings"],
    ["submissions", "fa-file-arrow-up", "Submissions"],
    ["scoring", "fa-ranking-star", "Scoring"],
    ["leaderboard", "fa-trophy", "Leaderboard"],
    ["certificates", "fa-certificate", "Certificates"],
    ["prizes", "fa-gift", "Prizes"]
  ];
  if (role === "organiser") tools.splice(4, 0, ["team", "fa-user-plus", "Team"]);
  return `<aside class="sidebar">${tools.map(([id, icon, label]) => `<button class="btn ${state.activeTool === id ? "primary" : ""}" data-tool="${id}"><i class="fa-solid ${icon}"></i>${label}</button>`).join("")}</aside>`;
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
  if (tool === "prizes") return comingSoon("Prize distribution", "Prize logistics stay captured, distribution arrives later.");
  return overviewView(item, editable);
}

function overviewView(item, editable) {
  return `
    <div class="section-head"><div><span class="eyebrow">Control room</span><h2>${item.name}</h2></div>${editable ? '<button class="btn"><i class="fa-solid fa-pen"></i>Edit details</button>' : ""}</div>
    <p class="lede" style="font-size:18px">${item.description}</p>
    <div class="grid cols-3" style="margin-top:18px">
      ${item.structure.rounds.map((round) => `<div class="card"><span class="mini">${round.name}</span><h3>Top ${round.advances}</h3><div class="progress"><span style="--value:45%"></span></div></div>`).join("")}
    </div>
    <div class="grid cols-2" style="margin-top:18px">
      <div class="panel"><h3>Participants</h3><p class="lede" style="font-size:18px">${item.participant_count || 0} students, ${item.team_count || 0} teams</p></div>
      <div class="panel"><h3>Categories</h3><div class="tags">${item.categories.map((cat) => `<span class="tag">${cat}</span>`).join("")}</div></div>
    </div>
  `;
}

function announcementsView(editable) {
  return `
    <div class="section-head"><div><span class="eyebrow">Push-ready</span><h2>Announcements</h2></div></div>
    ${editable ? `<form class="form-grid" data-form="announcement"><input class="field" name="title" placeholder="Title"><textarea class="textarea" name="body" placeholder="Message to all participants"></textarea><button class="btn primary"><i class="fa-solid fa-paper-plane"></i>Send announcement</button></form>` : ""}
    <div class="list" style="margin-top:16px">${mockAnnouncements.map((item) => `<div class="list-row"><div><b>${item.title}</b><p class="mini">${item.body}</p></div><span class="tag">${formatDate(item.created_at)}</span></div>`).join("")}</div>
  `;
}

function qaView(editable) {
  return `
    <div class="section-head"><div><span class="eyebrow">Realtime</span><h2>Q&A</h2></div></div>
    ${!editable ? `<form class="form-grid" data-form="question"><textarea class="textarea" name="question" placeholder="Ask a question"></textarea><button class="btn primary"><i class="fa-solid fa-plus"></i>Post question</button></form>` : ""}
    <div class="list" style="margin-top:16px">${mockQuestions.map((item) => `<div class="list-row"><div><b>${item.question}</b><p class="mini">Asked by ${item.author_name}</p><p>${item.answer || "Waiting for organiser reply."}</p></div>${editable ? '<button class="btn"><i class="fa-solid fa-reply"></i>Reply</button>' : ""}</div>`).join("")}</div>
  `;
}

function meetingsView(item, editable) {
  return `
    <div class="section-head"><div><span class="eyebrow">Jitsi</span><h2>Meetings</h2></div></div>
    ${editable ? `<form class="form-grid two" data-form="meeting"><input class="field" name="name" placeholder="meeting-name"><select class="select" name="audience"><option>All participants</option><option>Top 30</option><option>Specific teams</option></select><button class="btn primary"><i class="fa-solid fa-video"></i>Create meeting</button></form>` : ""}
    <div class="list" style="margin-top:16px"><div class="list-row"><div><b>orientation</b><p class="mini">/${item.slug}/meeting/orientation</p></div><a class="btn primary" href="/${item.slug}/meeting/orientation" data-link><i class="fa-solid fa-arrow-up-right-from-square"></i>Join</a></div></div>
  `;
}

function teamToolsView() {
  return `
    <div class="section-head"><div><span class="eyebrow">Organiser access</span><h2>Event team</h2></div></div>
    <form class="form-grid two" data-form="organiser-invite"><input class="field" name="username" placeholder="@username"><select class="select" name="role"><option>Organiser</option><option>Judge</option><option>Viewer</option></select><button class="btn primary"><i class="fa-solid fa-user-plus"></i>Invite</button></form>
    <div class="list" style="margin-top:16px"><div class="list-row"><div><b>Priya Kapoor</b><p class="mini">@priya</p></div><span class="tag">Organiser</span></div></div>
  `;
}

function submissionsView(editable) {
  return `
    <div class="section-head"><div><span class="eyebrow">25 MB hard limit</span><h2>Submissions</h2></div></div>
    ${editable ? `<form class="form-grid two" data-form="submission-box"><input class="field" name="round" placeholder="Round name"><input class="field" name="fileTypes" placeholder=".pdf,.zip,.png"><select class="select" name="mode"><option>Files and links</option><option>Files only</option><option>Links only</option></select><input class="field" type="datetime-local" name="closeAt"><button class="btn primary"><i class="fa-solid fa-lock"></i>Save submission box</button></form>` : `<form class="form-grid" data-form="submission"><input class="field" type="file" name="file"><input class="field" name="url" placeholder="GitHub, Drive, or live URL"><button class="btn primary"><i class="fa-solid fa-upload"></i>Submit round</button></form>`}
  `;
}

function scoringView() {
  const cutoff = 3;
  return `
    <div class="section-head"><div><span class="eyebrow">Tie-aware</span><h2>Scoring</h2></div><button class="btn primary"><i class="fa-solid fa-check"></i>Auto-select top ${cutoff}</button></div>
    <div class="list">${mockTeams.map((team, index) => `<div class="list-row ${index === cutoff - 1 || index === cutoff ? "score-tie" : ""}"><div><b>${index + 1}. ${team.name}</b><p class="mini">${team.category}</p></div><input class="field" style="width:110px" value="${index >= 2 ? 92 : team.score}"></div>`).join("")}</div>
    <div class="panel" style="margin-top:16px"><div class="segmented"><button class="active">Leave tied teams</button><button>Include all tied</button><button>Pick manually</button></div></div>
  `;
}

function leaderboardView(item) {
  return `
    <div class="section-head"><div><span class="eyebrow">/${item.slug}/leaderboard/top-100</span><h2>Leaderboard</h2></div><input class="field" style="max-width:260px" data-leader-search placeholder="Search team or name"></div>
    <div class="podium">
      ${mockTeams.slice(0, 3).map((team, index) => `<div class="card place" style="--h:${[170, 220, 140][index]}px"><span class="tag">#${index + 1}</span><h3>${team.name}</h3><p class="mini">${team.score} points</p></div>`).join("")}
    </div>
    <div class="list" style="margin-top:16px">${mockTeams.map((team, index) => `<div class="list-row" data-leader="${team.name.toLowerCase()} ${team.members.map((member) => member.full_name.toLowerCase()).join(" ")}"><div><b>${index + 1}. ${team.name}</b><ul class="team-members">${team.members.map((member) => `<li>${member.full_name}<br><span>@${member.username}</span></li>`).join("")}</ul></div><span class="tag">${team.category}</span></div>`).join("")}</div>
  `;
}

function certificatesView() {
  return `
    <div class="section-head"><div><span class="eyebrow">Generated on request</span><h2>Certificates</h2></div><button class="btn primary" data-action="preview-certificate"><i class="fa-solid fa-wand-magic-sparkles"></i>Preview</button></div>
    <div class="certificate-editor">
      <div class="certificate-canvas"><div class="certificate-field">Participant Name</div></div>
      <div class="form-grid">
        <label><span>Template type</span><select class="select"><option>Participation</option><option>Top 100</option><option>Overall winner</option><option>Category winner</option></select></label>
        <label><span>Dynamic value</span><select class="select"><option>Participant name</option><option>Placement</option><option>Category</option><option>Competition name</option></select></label>
        <label><span>Font size</span><input class="field" type="number" value="38"></label>
        <label><span>Color</span><input class="field" type="color" value="#0f172a"></label>
      </div>
    </div>
  `;
}

function comingSoon(title, body) {
  return `<div class="section-head"><div><span class="eyebrow">Coming Soon</span><h2>${title}</h2></div></div><p class="lede">${body}</p>`;
}

export function organiserHome(competitions) {
  return shell(`
    <section class="section">
      <div class="section-head"><div><span class="eyebrow">Organiser workspace</span><h1 style="font-size:clamp(44px,7vw,82px)">Create, judge, publish.</h1></div><a class="btn primary" href="/organiser/create" data-link><i class="fa-solid fa-plus"></i>New competition</a></div>
      <div class="grid cols-3">${competitions.map((item) => competitionCard(item)).join("")}</div>
    </section>
  `, "organiser");
}

export function studentHome(competitions) {
  return shell(`
    <section class="section">
      <div class="section-head"><div><span class="eyebrow">Student cockpit</span><h1 style="font-size:clamp(44px,7vw,82px)">Your competitions stay in one place.</h1></div></div>
      <div class="grid cols-3">
        ${infoMetric("Upcoming", "2 registered")}
        ${infoMetric("In progress", "1 active")}
        ${infoMetric("Achievements", "7 earned")}
      </div>
    </section>
    <section class="section"><div class="section-head"><div><span class="eyebrow">Registered</span><h2>Next actions</h2></div></div><div class="grid cols-3">${competitions.slice(0, 2).map((item) => competitionCard(item)).join("")}</div></section>
  `, "participant");
}

export function createCompetitionView() {
  return shell(`
    <section class="section">
      <div class="section-head"><div><span class="eyebrow">Competition setup</span><h1 style="font-size:clamp(42px,7vw,78px)">Build event flow.</h1></div></div>
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
          <label><span>Banner gradient</span><select class="select" name="banner_gradient"><option value="linear-gradient(135deg, #2563eb, #0d9488)">Blue teal</option><option value="linear-gradient(135deg, #1d4ed8, #7c3aed)">Blue violet</option><option value="linear-gradient(135deg, #0f766e, #f59e0b)">Teal gold</option></select></label>
        </div>
        <label><span>Categories</span><input class="field" name="categories" placeholder="Junior, Senior, Best UI"></label>
        <label><span>Description</span><textarea class="textarea" name="description" required placeholder="Explain what students will do and how judging works."></textarea></label>
        <label><span>Certificate template</span><input class="field" type="file" name="certificate" accept="image/*"></label>
        <button class="btn primary"><i class="fa-solid fa-check"></i>Create competition</button>
      </form>
    </section>
  `, "create");
}

export function authView() {
  return shell(`
    <section class="section">
      <div class="section-head"><div><span class="eyebrow">Account</span><h1 style="font-size:clamp(44px,7vw,82px)">Sign in or create account.</h1></div></div>
      <div class="grid cols-2">
        <form class="panel form-grid" data-form="signin">
          <h2>Sign in</h2>
          <input class="field" type="email" name="email" placeholder="Email" required>
          <input class="field" type="password" name="password" placeholder="Password" required>
          <button class="btn primary"><i class="fa-solid fa-right-to-bracket"></i>Sign in</button>
        </form>
        <form class="panel form-grid" data-form="signup">
          <h2>Create account</h2>
          <div class="form-grid two">
            <input class="field" name="full_name" placeholder="Full name" required>
            <input class="field" name="username" placeholder="@username" required>
            <input class="field" type="email" name="email" placeholder="Email" required>
            <input class="field" type="password" name="password" placeholder="Password" required>
            <select class="select" name="account_type"><option>participant</option><option>organiser</option><option>organisation</option></select>
          </div>
          <textarea class="textarea" name="bio" placeholder="Bio"></textarea>
          <button class="btn primary"><i class="fa-solid fa-user-plus"></i>Create account</button>
        </form>
      </div>
    </section>
  `, "profile");
}

export function profileView(profile) {
  const item = profile || { full_name: "Guest", username: "guest", account_type: "visitor", bio: "Sign in to register, manage teams, and receive notifications." };
  return shell(`
    <section class="section">
      <div class="panel">
        <div class="section-head"><div><span class="eyebrow">${item.account_type}</span><h1 style="font-size:clamp(44px,7vw,82px)">${item.full_name}</h1><p class="lede">@${item.username}</p></div><button class="btn primary" data-action="push"><i class="fa-solid fa-bell"></i>Enable push</button></div>
        <p class="lede" style="font-size:18px">${item.bio || ""}</p>
      </div>
    </section>
  `, "profile");
}

export function meetingPage(params) {
  const room = encodeURIComponent(`vertex-${params.competition}-${params.meeting}`);
  return `
    <div style="height:100vh;background:#0b1120">
      <iframe title="Jitsi meeting" src="https://meet.jit.si/${room}" allow="camera; microphone; fullscreen; display-capture" style="width:100%;height:100%;border:0"></iframe>
    </div>
  `;
}

export function notFound() {
  const particles = Array.from({ length: 42 }, (_, index) => `<span class="particle" style="--x:${(index * 73) % 100}vw;--y:${(index * 41) % 100}vh;--d:${8 + (index % 9)}s"></span>`).join("");
  return shell(`
    <section class="not-found-scene" data-error-tilt>
      ${particles}
      <div class="error-card">
        <div class="error-code">404</div>
        <h1 style="font-size:clamp(34px,6vw,70px)">Route not found.</h1>
        <p class="lede">This competition link does not exist yet.</p>
        <div class="hero-actions" style="justify-content:center"><a class="btn primary" href="/" data-link><i class="fa-solid fa-compass"></i>Back to discovery</a></div>
      </div>
    </section>
  `);
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
