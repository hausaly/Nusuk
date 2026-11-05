// Service worker: makes the site installable and lets the app shell open offline.
// Live data (/api/, /pay/) is never cached. Bump V on every release (kept in sync with BUILD).
const V = 'nusuk-20261105f';
const SHELL = ['./', 'index.html', 'css/style.css?v=20261105f', 'js/app.js?v=20261105f', 'js/pwa.js?v=20261105f', 'js/tour.js?v=20261105f', 'js/boot.js?v=20261105f', 'img/logo-gold.png', 'img/logo-stack-white.png', 'img/logo.jpg', 'img/logo-white.png', 'img/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/api/') || url.pathname.includes('/pay/') || url.pathname.endsWith('.pdf')) return;
  if (req.mode === 'navigate') {   // network first so releases show at once; cached shell when offline
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(V).then(x => x.put('index.html', c)); return r; })
      .catch(() => caches.match('index.html').then(r => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(req, c)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
