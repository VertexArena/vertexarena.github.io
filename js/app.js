import { addRoute, initRouter, navigate, renderRoute } from "./router.js";
import { createCompetition, fetchCompetitions, getCompetition, insertTable, registerForCompetition, slugify } from "./data.js";
import { getSession, signIn, signUp, subscribeTo } from "./supabase.js";
import { authView, competitionDetail, createCompetitionView, discovery, meetingPage, notFound, organiserHome, profileView, shell, state, studentHome, toast, toolView } from "./ui.js";
import { enableCertificateDragging } from "./certificates.js";

async function boot() {
  state.session = await getSession();
  wireGlobalEvents();
  addRoute("/", async () => shell(discovery(await fetchCompetitions(state.filters)), "discover"));
  addRoute("/student", async () => studentHome(await fetchCompetitions()));
  addRoute("/organiser", async () => organiserHome(await fetchCompetitions()));
  addRoute("/organiser/create", async () => createCompetitionView());
  addRoute("/auth", async () => authView());
  addRoute("/profile", async () => profileView(state.profile || state.session?.user?.user_metadata));
  addRoute("/competition/:slug", async ({ slug }) => competitionDetail(await getCompetition(slug), "participant"));
  addRoute("/competition/:slug/leaderboard/:round", async ({ slug }) => {
    state.activeTool = "leaderboard";
    return competitionDetail(await getCompetition(slug), "participant");
  });
  addRoute("/organiser/competition/:slug", async ({ slug }) => competitionDetail(await getCompetition(slug), "organiser"));
  addRoute("/:competition/meeting/:meeting", async (params) => meetingPage(params));
  addRoute("/not-found", async () => notFound());
  initRouter(document.getElementById("app"), async () => notFound());
  registerServiceWorker();
  subscribeRealtime();
}

function wireGlobalEvents() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    if (sessionStorage.getItem("vertex:install-dismissed")) return;
    showInstallBanner();
  });

  document.addEventListener("vertex:route", () => hydrateInteractions());

  document.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "theme") {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("vertex:theme", state.theme);
      renderRoute();
    }
    if (action === "notify") navigate("/profile");
    if (action === "register") {
      if (!state.session) {
        toast("Sign in required before registration.");
        navigate("/auth");
        return;
      }
      await registerForCompetition(event.target.closest("[data-id]").dataset.id, "individual", "");
      toast("Registration saved.");
    }
    if (action === "push") enablePushNotifications();
    if (action === "preview-certificate") toast("Preview generated from live dynamic fields.");
    const save = event.target.closest("[data-save]");
    if (save) {
      event.preventDefault();
      save.querySelector("i").className = "fa-solid fa-bookmark";
      toast("Competition saved.");
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-search]")) {
      state.filters.search = event.target.value;
      debounceRender();
    }
    if (event.target.matches("[data-leader-search]")) {
      const needle = event.target.value.toLowerCase();
      document.querySelectorAll("[data-leader]").forEach((row) => {
        row.hidden = !row.dataset.leader.includes(needle);
      });
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-field]")) {
      state.filters.field = event.target.value;
      renderRoute();
    }
  });

  document.addEventListener("click", (event) => {
    const teamButton = event.target.closest("[data-team]");
    if (teamButton) {
      state.filters.team = teamButton.dataset.team;
      renderRoute();
    }
    const toolButton = event.target.closest("[data-tool]");
    if (toolButton) {
      state.activeTool = toolButton.dataset.tool;
      document.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("active", button === toolButton));
      const slug = location.pathname.split("/").pop();
      getCompetition(slug).then((competition) => {
        const role = location.pathname.startsWith("/organiser") ? "organiser" : "participant";
        document.getElementById("tool-surface").innerHTML = toolView(state.activeTool, competition, role);
        hydrateInteractions();
      });
    }
  });

  document.addEventListener("submit", handleSubmit);
}

let renderTimer;
function debounceRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderRoute, 180);
}

async function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.dataset.form === "signin") {
      await signIn(data.email, data.password);
      state.session = await getSession();
      toast("Signed in.");
      navigate("/student");
      return;
    }
    if (form.dataset.form === "signup") {
      await signUp(data.email, data.password, data);
      state.session = await getSession();
      toast("Account created.");
      navigate("/profile");
      return;
    }
    if (form.dataset.form === "create-competition") {
      const [ageMin, ageMax] = (data.age || "12-18").split("-").map(Number);
      const competition = await createCompetition({
        name: data.name,
        field: data.field,
        prize: data.prize,
        age_min: ageMin || 12,
        age_max: ageMax || 18,
        team_mode: data.team_mode,
        structure_id: data.structure_id,
        categories: data.categories.split(",").map((item) => item.trim()).filter(Boolean),
        description: data.description,
        banner_gradient: data.banner_gradient,
        registration_deadline: new Date(data.registration_deadline).toISOString(),
        start_at: new Date(data.start_at).toISOString(),
        end_at: new Date(data.end_at).toISOString()
      });
      toast("Competition created.");
      navigate(`/organiser/competition/${competition.slug || slugify(data.name)}`);
      return;
    }
    await insertTable(form.dataset.form.replace("-", "_"), data);
    toast("Saved.");
    form.reset();
  } catch (error) {
    toast(error.message || "Action failed.");
  }
}

function hydrateInteractions() {
  document.querySelectorAll("[data-tilt]").forEach((node) => {
    node.onpointermove = (event) => {
      const rect = node.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      node.style.transform = `rotateX(${y * -5}deg) rotateY(${x * 5}deg)`;
    };
    node.onpointerleave = () => { node.style.transform = ""; };
  });
  document.querySelectorAll("[data-error-tilt]").forEach((node) => {
    const card = node.querySelector(".error-card");
    node.onpointermove = (event) => {
      const x = event.clientX / innerWidth - 0.5;
      const y = event.clientY / innerHeight - 0.5;
      card.style.setProperty("--rx", `${y * -12}deg`);
      card.style.setProperty("--ry", `${x * 12}deg`);
    };
  });
  document.querySelectorAll("[data-count]").forEach((node) => animateCount(node));
  enableCertificateDragging(document);
}

function animateCount(node) {
  const target = Number(node.dataset.count);
  const start = performance.now();
  function tick(time) {
    const progress = Math.min(1, (time - start) / 900);
    node.textContent = Math.round(target * progress).toLocaleString("en-IN");
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function showInstallBanner() {
  const banner = document.createElement("div");
  banner.className = "install-banner panel";
  banner.innerHTML = `<div><b>Install Vertex</b><p class="mini">Use full-screen app mode and enable competition alerts.</p></div><div class="hero-actions" style="margin:0"><button class="btn primary" data-install><i class="fa-solid fa-download"></i>Install</button><button class="icon-btn" data-dismiss title="Dismiss"><i class="fa-solid fa-xmark"></i></button></div>`;
  document.body.appendChild(banner);
  banner.querySelector("[data-install]").onclick = async () => {
    await state.installPrompt?.prompt();
    banner.remove();
  };
  banner.querySelector("[data-dismiss]").onclick = () => {
    sessionStorage.setItem("vertex:install-dismissed", "1");
    banner.remove();
  };
}

async function enablePushNotifications() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (!standalone) {
    toast("Install Vertex before enabling push notifications.");
    if (state.installPrompt) showInstallBanner();
    return;
  }
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    toast("Push notifications not supported in this browser.");
    return;
  }
  const permission = await Notification.requestPermission();
  toast(permission === "granted" ? "Push notifications enabled." : "Push notifications blocked.");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch (error) {
    console.warn("Service worker registration failed", error);
  }
}

function subscribeRealtime() {
  ["announcements", "questions", "leaderboards", "notifications"].forEach((table) => {
    subscribeTo(table, undefined, (payload) => {
      toast(`${table.replace("_", " ")} updated.`);
      console.info("Realtime payload", payload);
    });
  });
}

boot();
