const CACHE='vertex-shell-v6',SHELL=['/','/index.html','/css/style.css','/js/app.js','/js/api.js','/js/components.js','/js/auth-enhancements.js','/config.js','/assets/logo.png','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;if(e.request.mode==='navigate')return e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));if(new URL(e.request.url).origin===location.origin)e.respondWith(caches.match(e.request).then(h=>h||fetch(e.request)));});
self.addEventListener('push',e=>{const d=e.data?.json()||{title:'Vertex',body:'You have a new update.'};e.waitUntil(self.registration.showNotification(d.title,{body:d.body,icon:'/assets/logo.png',badge:'/assets/logo.png',data:{url:d.url||'/notifications'}}));});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.openWindow(e.notification.data.url));});
