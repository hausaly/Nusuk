/* Raudah GSMS service worker: installable PWA + faster repeat loads.
   The app is always-online by design: only static assets are cached; pages and API calls always hit the network
   (so clearance status is never stale). Navigations fall back to /offline.html when the network is down. */
const CACHE = "raudah-static-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/offline.html", "/brand/logo.png", "/icons/icon-192.png"])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") { e.respondWith(fetch(req).catch(() => caches.match("/offline.html"))); return; }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/"))
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
});
