// Service worker for the installable app.
// Network first: the app always loads the newest published version, and falls back to the last
// copy it saw when you're offline. Only this site's own files are touched; API and price
// requests to other sites go straight to the network.
const CACHE = "skyblock-helper";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, {cache: "no-store"});
      if (res.ok && !url.search) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, {ignoreSearch: true});
      if (hit) return hit;
      throw err;
    }
  })());
});
