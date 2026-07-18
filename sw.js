const CACHE_NAME = "vertex-v1";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/404.html",
  "/manifest.webmanifest",
  "/config.js",
  "/css/styles.css",
  "/js/app.js",
  "/js/data.js",
  "/js/router.js",
  "/js/supabase.js",
  "/js/ui.js",
  "/js/certificates.js",
  "/assets/logo.png",
  "/student/",
  "/organiser/",
  "/organiser/create/",
  "/auth/",
  "/profile/",
  "/not-found/",
  "/competition/vertex-code-cup/",
  "/competition/young-research-forum/",
  "/competition/maths-sprint/",
  "/competition/vertex-code-cup/leaderboard/top-100/",
  "/competition/young-research-forum/leaderboard/top-100/",
  "/competition/maths-sprint/leaderboard/final-results/",
  "/organiser/competition/vertex-code-cup/",
  "/organiser/competition/young-research-forum/",
  "/organiser/competition/maths-sprint/",
  "/vertex-code-cup/meeting/orientation/",
  "/young-research-forum/meeting/orientation/",
  "/maths-sprint/meeting/orientation/"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && new URL(request.url).origin === location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => {
        if (request.mode === "navigate") return caches.match("/");
        return cached;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(payload.title || "Vertex", {
      body: payload.body || "New competition update.",
      icon: "/assets/logo.png",
      badge: "/assets/logo.png",
      data: payload.url || "/"
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data || "/"));
});
