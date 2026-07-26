/* Riser Chart Manager — service worker.
 *
 * ONE RULE: the app HTML is fetched NETWORK-FIRST. A reload while online is always the
 * newest build; the cache exists only so the app still opens with the internet off.
 * A cache-first worker would strand directors on whatever build they first loaded —
 * that is the exact problem this whole exercise is meant to solve.
 *
 * Keep this file tiny. Every line here is a line that can strand someone on an old build.
 */
const CACHE = "rcm-v1";                 // bump this string to throw away every cached copy
const SHELL = [
  "./",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", e => {
  // Pre-cache so the very first offline open works even if nothing was fetched yet.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .catch(() => {})                  // a missing icon must never block activation
      .then(() => self.skipWaiting())
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
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put("./", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./", { ignoreSearch: true })
                           .then(r => r || caches.match(req)))
    );
    return;
  }

  // Icons and manifest → cache first. They never change meaningfully.
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
