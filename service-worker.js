const VERSION = 'vertex-static-m20-v1';
const OFFLINE = '/offline.html';
const SHELL = [OFFLINE, '/assets/logo.png', '/assets/icon-192.png', '/assets/icon-512.png', '/assets/icon-maskable-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('vertex-static-') && key !== VERSION) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
  } else if (SHELL.includes(url.pathname) || /^\/(js|css)\/[a-z0-9-]+\.(js|css)$/.test(url.pathname)) {
    // No Auth/API requests, personal data, submissions or Storage responses.
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const response = await fetch(event.request);
        if (response.ok && response.type === 'basic') await cache.put(event.request,response.clone());
        return response;
      } catch (error) { const saved = await cache.match(event.request); if (saved) return saved; throw error; }
    })());
  }
});
function owner(value, write = false) {
  return new Promise((resolve,reject) => {
    const open = indexedDB.open('vertex-device-state',1);
    open.onupgradeneeded = () => open.result.createObjectStore('device');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, transaction = db.transaction('device',write ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('device');
      const request = write ? store.put(value,'push-owner') : store.get('push-owner');
      transaction.oncomplete = () => { resolve(write ? value : request.result); db.close(); };
      transaction.onerror = () => { reject(transaction.error); db.close(); };
    };
  });
}
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
  if (event.data?.type === 'SET_PUSH_OWNER') event.waitUntil((async () => {
    await owner(event.data.userId || null,true);
    if (!event.data.userId) for (const notification of await self.registration.getNotifications()) notification.close();
    event.ports[0]?.postMessage({ ok:true });
  })());
});
const safePath = value => typeof value === 'string' && /^\/(?!\/)[a-zA-Z0-9/_@.?=&%-]*$/.test(value) ? value : '/notifications';
self.addEventListener('push', event => event.waitUntil((async () => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* An empty push remains usable. */ }
  const activeOwner = await owner(null).catch(() => null);
  const matched = activeOwner && activeOwner === payload.recipient;
  await self.registration.showNotification(matched ? String(payload.title || 'Vertex update').slice(0,160) : 'Vertex update', {
    body: matched ? String(payload.body || '').slice(0,240) : 'Open Vertex to check your notifications.',
    icon:'/assets/icon-192.png', badge:'/assets/icon-192.png', tag:String(payload.notificationId || 'vertex-update'),
    data:{ path:matched ? safePath(payload.path) : '/notifications' },
  });
})()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL(safePath(event.notification.data?.path),self.location.origin).href;
    const windows = await self.clients.matchAll({ type:'window',includeUncontrolled:true });
    const window = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (window) { await window.navigate(url); await window.focus(); }
    else await self.clients.openWindow(url);
  })());
});
// Subscription rotation is deliberately re-authorised in the app instead of
// retaining an Auth token in the service worker for background mutations.
self.addEventListener('pushsubscriptionchange', event => event.waitUntil((async () => {
  const windows = await self.clients.matchAll({ type:'window' });
  windows.forEach(client => client.postMessage({ type:'PUSH_SUBSCRIPTION_CHANGED' }));
})()));
