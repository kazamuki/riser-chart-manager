/* Riser Chart Manager — service worker.
 *
 * ONE RULE: the app HTML is fetched NETWORK-FIRST. A reload while online is always the
 * newest build; the cache exists only so the app still opens with the internet off.
 * A cache-first worker would strand directors on whatever build they first loaded —
 * that is the exact problem this whole exercise is meant to solve.
 *
 * Keep this file tiny. Every line here is a line that can strand someone on an old build.
 */
const CACHE = "rcm-v2";                 // bump this string to throw away every cached copy
const ASSETS = [
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon-180-apple.png"
];

/* v2 fix: cache items ONE AT A TIME.
   cache.addAll() is atomic — a single 404 or flaky response rejects the whole batch and
   nothing at all gets stored, silently. That is why the first offline test failed.
   The app HTML is warmed explicitly here so offline works after the FIRST visit, instead
   of waiting for a second, worker-controlled navigation. */
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(async cache => {
      await Promise.allSettled(ASSETS.map(u => cache.add(new Request(u, { cache: "reload" }))));
      try {
        const res = await fetch(new Request("./", { cache: "reload" }));
        if (res && res.ok) await cache.put("./", res);
      } catch (err) { /* offline during install — the fetch handler warms it later */ }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // never intercept Ko-fi or anything off-site

  // The app itself → network first, cache as the offline fallback.
  // `cache:"no-cache"` forces a revalidation with the server on every load. Without it,
  // GitHub Pages' own Cache-Control (max-age=600) can hand back a ten-minute-old build
  // from the browser's HTTP cache and quietly undo the whole point of network-first.
  if (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html")) {
    e.respondWith(
      fetch(new Request(req.url, { cache: "no-cache", credentials: "same-origin" }))
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put("./", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("./", { ignoreSearch: true })
                           .then(r => r || caches.match(req, { ignoreSearch: true }))
                           .then(r => r || Response.error()))
    );
    return;
  }

  // Icons and manifest → cache first, then network, storing what the network gives back so
  // a missed precache repairs itself instead of failing forever.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
