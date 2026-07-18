const routes = [];

export function addRoute(pattern, view) {
  const keys = [];
  const regex = new RegExp(`^${pattern.replace(/\//g, "\\/").replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    keys.push(key);
    return "([^/]+)";
  })}\\/?$`);
  routes.push({ regex, keys, view });
}

export function navigate(path) {
  history.pushState(null, "", path);
  renderRoute();
}

export function linkHandler(event) {
  const anchor = event.target.closest("a[data-link]");
  if (!anchor) return;
  event.preventDefault();
  navigate(anchor.getAttribute("href"));
}

export function initRouter(root, fallback) {
  window.addEventListener("popstate", renderRoute);
  window.__vertexRoot = root;
  window.__vertexFallback = fallback;
  document.addEventListener("click", linkHandler);
  renderRoute();
}

export async function renderRoute() {
  const path = location.pathname;
  const match = routes.find((route) => route.regex.test(path));
  const root = window.__vertexRoot;
  if (!root) return;
  if (!match) {
    root.innerHTML = await window.__vertexFallback();
    return;
  }
  const values = match.regex.exec(path).slice(1);
  const params = Object.fromEntries(match.keys.map((key, index) => [key, decodeURIComponent(values[index])]));
  root.innerHTML = await match.view(params);
  document.dispatchEvent(new CustomEvent("vertex:route", { detail: { path, params } }));
}
