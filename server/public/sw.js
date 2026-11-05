// Offline media cache for Let's Connect's web app — cache-first for shared
// images/videos/files (/uploads/*) and release APKs (/downloads/*), so a
// photo or file already opened once in a chat still opens (and can still
// be saved) with no network. Deliberately does NOT touch anything else —
// not the API, not the app's own JS/CSS bundle — a stale cached bundle has
// bitten this app before (see the "web/src edited but never rebuilt" fix
// earlier in its history); that risk isn't worth it for a feature whose
// whole point is offline media, not an offline app shell.
const CACHE_NAME = "cuorbit-media-v1";
const CACHEABLE_PREFIXES = ["/uploads/", "/downloads/"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!CACHEABLE_PREFIXES.some((p) => url.pathname.startsWith(p))) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const resp = await fetch(req);
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
      } catch (e) {
        // Offline and never cached — nothing we can do for this one.
        if (cached) return cached;
        throw e;
      }
    })
  );
});
