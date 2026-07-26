/* sw_test.js — drives sw.js through a simulated ServiceWorkerGlobalScope.
 *
 * Service workers can't be exercised by the app's jsdom smoke suite (no SW in jsdom) and
 * can't run from file:// at all, so without this the only test is "push it and hope".
 * This harness fakes CacheStorage + fetch and drives install → activate → fetch, online
 * and offline, including the flaky-asset case that broke offline in v1.
 *
 * Run: node sw_test.js            (no dependencies)
 */
const fs = require("fs");
const vm = require("vm");

const BASE = "https://example.github.io/riser-chart-manager/app/";
let fails = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fails++; };

/* ---------- a tiny origin server we control ---------- */
function makeServer({ offline = false, missing = [], html = "<html>APP v1.6</html>" } = {}) {
  const log = [];
  return {
    log, set offline(v) { offline = v; }, get offline() { return offline; },
    set html(v) { html = v; }, get html() { return html; },
    set missing(v) { missing = v; }, get missing() { return missing; },
    async fetch(req) {
      const url = new URL(typeof req === "string" ? req : req.url, BASE);
      log.push(url.pathname);
      if (offline) throw new TypeError("Failed to fetch");
      if (missing.some(m => url.pathname.endsWith(m))) return new Response("nope", { status: 404 });
      if (url.pathname.endsWith("/") || url.pathname.endsWith(".html"))
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      return new Response("asset-bytes", { status: 200 });
    }
  };
}

/* ---------- fake CacheStorage ---------- */
const keyOf = (r, ignoreSearch) => {
  const u = new URL(typeof r === "string" ? r : r.url, BASE);
  return ignoreSearch ? u.origin + u.pathname : u.href;
};
class FakeCache {
  constructor(server) { this.map = new Map(); this.server = server; }
  async put(req, res) { this.map.set(keyOf(req), res); }
  async add(req) {
    const res = await this.server.fetch(req);
    if (!res.ok) throw new TypeError("bad response for " + keyOf(req));
    this.map.set(keyOf(req), res);
  }
  async addAll(list) {                                    // atomic, exactly like the real thing:
    const pairs = [];                                     // fetch everything first...
    for (const r of list) {
      const res = await this.server.fetch(r);
      if (!res.ok) throw new TypeError("bad response for " + keyOf(r)); // ...and store NOTHING on failure
      pairs.push([keyOf(r), res]);
    }
    pairs.forEach(([k, v]) => this.map.set(k, v));
  }
  async match(req, opts = {}) {
    return this.map.get(keyOf(req)) ||
      (opts.ignoreSearch ? [...this.map].find(([k]) => k.split("?")[0] === keyOf(req, true))?.[1] : undefined);
  }
  get size() { return this.map.size; }
  get paths() { return [...this.map.keys()].map(k => k.replace(BASE, "./")); }
}
function makeCaches(server) {
  const store = new Map();
  return {
    store,
    async open(n) { if (!store.has(n)) store.set(n, new FakeCache(server)); return store.get(n); },
    async keys() { return [...store.keys()]; },
    async delete(n) { return store.delete(n); },
    async match(req, opts) {
      for (const c of store.values()) { const r = await c.match(req, opts); if (r) return r; }
      return undefined;
    }
  };
}

/* ---------- load a worker into a sandbox ---------- */
function loadWorker(path, server, { seedCaches = [] } = {}) {
  const caches = makeCaches(server);
  seedCaches.forEach(n => caches.store.set(n, new FakeCache(server)));
  const handlers = {};
  const claimed = { skipWaiting: false, claim: false };
  const self = {
    addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); },
    skipWaiting: () => { claimed.skipWaiting = true; },
    clients: { claim: async () => { claimed.claim = true; } },
    registration: {}
  };
  class Req extends Request {                          // resolve relative URLs like a SW does
    constructor(input, init) { super(typeof input === "string" ? new URL(input, BASE).href : input, init); }
  }
  const sandbox = {
    self, caches, console,
    location: new URL(BASE + "sw.js"),
    fetch: (r, i) => server.fetch(r instanceof Request ? r : new Req(r, i)),
    Request: Req, Response, Headers, URL, Promise, TypeError,
  };
  sandbox.self.location = sandbox.location;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path, "utf8"), sandbox, { filename: path });

  const fire = async (type, event) => {
    const waits = [];
    const resp = {};
    const ev = Object.assign({
      waitUntil: p => waits.push(p),
      respondWith: p => { resp.called = true; resp.promise = p; }
    }, event);
    for (const fn of handlers[type] || []) await fn(ev);
    await Promise.all(waits);
    return resp;
  };
  return { caches, fire, claimed, handlers };
}

const nav = (path = "./") => ({
  request: { url: new URL(path, BASE).href, method: "GET", mode: "navigate" }
});
const asset = (path) => ({ request: new Request(new URL(path, BASE).href) });

/* ================================ TESTS ================================ */
(async () => {

console.log("\n[1] v1 REGRESSION — reproduce the offline failure from the first deploy");
if (!fs.existsSync(__dirname + "/../sw_v1_broken.js")) {
  console.log("  SKIP  sw_v1_broken.js not present (this check only documents the fixed bug)");
} else {
  // One asset temporarily unavailable is enough. addAll() is atomic, so nothing is stored.
  const server = makeServer({ missing: ["icon-512.png"] });   // an asset v1 DOES precache
  const w = loadWorker(__dirname + "/../sw_v1_broken.js", server);
  await w.fire("install", {});
  const cache = await w.caches.open("rcm-v1");
  ok(cache.size === 0, "v1: a single 404 during install left the cache completely EMPTY (silently)");
  server.offline = true;
  const r = await w.fire("fetch", nav());
  const res = await r.promise.catch(() => null);
  ok(!res || !res.ok, "v1: offline navigation therefore fails — this is symptom 1");
}

console.log("\n[2] v2 — the same flaky install still leaves a usable offline app");
{
  const server = makeServer({ missing: ["icon-512.png"] });   // same failure as [1]
  const w = loadWorker(__dirname + "/sw.js", server);
  await w.fire("install", {});
  const cache = await w.caches.open("rcm-v2");
  ok(await cache.match("./") !== undefined, "v2: the app HTML is cached despite the 404");
  ok(cache.size >= 5, `v2: every asset that DID load was stored (${cache.size} entries)`);
  ok(!cache.paths.includes("./icons/icon-512.png"), "v2: only the genuinely missing item is absent");
  ok(w.claimed.skipWaiting, "v2: skipWaiting() called so the new worker takes over immediately");
}

console.log("\n[3] Offline navigation serves the cached build");
{
  const server = makeServer();
  const w = loadWorker(__dirname + "/sw.js", server);
  await w.fire("install", {});
  server.offline = true;
  const r = await w.fire("fetch", nav());
  ok(r.called, "the worker answered the navigation");
  const res = await r.promise;
  ok(res && res.ok, "offline navigation returns a good response");
  ok((await res.text()).includes("APP v1.6"), "…and it is the real app HTML");
}

console.log("\n[4] Online navigation is network-first — a new build lands on the FIRST reload");
{
  const server = makeServer();
  const w = loadWorker(__dirname + "/sw.js", server);
  await w.fire("install", {});
  server.html = "<html>APP v1.7</html>";               // Ken pushes a new build
  const r = await w.fire("fetch", nav());
  const body = await (await r.promise).text();
  ok(body.includes("v1.7"), "first reload after a push serves the NEW build, not the cached one");
  const cache = await w.caches.open("rcm-v2");
  ok((await (await cache.match("./")).text()).includes("v1.7"), "…and the offline copy was refreshed to match");
  ok(server.log.some(p => p.endsWith("/app/")), "the network was actually consulted");
}

console.log("\n[5] Scope, method and origin discipline");
{
  const server = makeServer();
  const w = loadWorker(__dirname + "/sw.js", server);
  await w.fire("install", {});
  const cross = await w.fire("fetch", { request: new Request("https://ko-fi.com/kenscheel") });
  ok(!cross.called, "cross-origin requests are not intercepted (Ko-fi is left alone)");
  const post = await w.fire("fetch", { request: new Request(BASE, { method: "POST" }) });
  ok(!post.called, "non-GET requests are not intercepted");
  const ico = await w.fire("fetch", asset("icons/icon-192.png"));
  ok(ico.called && (await ico.promise).ok, "icons are served (cache-first)");
}

console.log("\n[6] A missed asset repairs itself on a later online visit");
{
  const server = makeServer({ missing: ["icon-512.png"] });
  const w = loadWorker(__dirname + "/sw.js", server);
  await w.fire("install", {});
  const cache = await w.caches.open("rcm-v2");
  ok(await cache.match("./icons/icon-512.png") === undefined, "the icon is missing after install");
  server.missing = [];                                  // whatever it was, it passed
  const r = await w.fire("fetch", asset("icons/icon-512.png"));
  await r.promise;
  ok(await cache.match("./icons/icon-512.png") !== undefined, "…and is repaired the next time it's requested");
}

console.log("\n[7] activate purges older caches");
{
  const server = makeServer();
  const w = loadWorker(__dirname + "/sw.js", server, { seedCaches: ["rcm-v1", "rcm-old"] });
  await w.fire("install", {});
  await w.fire("activate", {});
  const keys = await w.caches.keys();
  ok(keys.length === 1 && keys[0] === "rcm-v2", `only the current cache survives (${keys.join(", ")})`);
  ok(w.claimed.claim, "clients.claim() called so open tabs come under control");
}

console.log(fails ? `\n${fails} FAILURE(S)\n` : "\nALL CHECKS PASSED\n");
process.exit(fails ? 1 : 0);
})();
