# Deploying Riser Chart Manager to GitHub Pages

Runbook for the person with the keys. Everything here assumes the repo contents in this
folder. Cross-reference: `HOSTING_PWA_HANDOFF.md` for *why*, `SCHEMA.md` §3c for where this
sits in the roadmap.

**The governing rule, restated:** one file, two habitats. `Riser_Chart_Manager.html` must keep
working when double-clicked from a desktop. Every hosting hook in it is guarded so that stays true.

---

## 0. Decisions to make before you start

| Decision | Why it's semi-permanent |
|---|---|
| GitHub account to publish under | It's in the URL |
| Repo name (suggest `riser-chart-manager`) | Also in the URL: `https://<user>.github.io/riser-chart-manager/` |
| Custom domain, now or later | Adding it later works and GitHub keeps the old URL redirecting, but every link you've already emailed points at the old one |

---

## 1. Repo layout

```
riser-chart-manager/
├── index.html                  landing + download page
├── Riser_Chart_Manager.html    THE canonical app file — the one you edit
├── HOW_TO_UPDATE.md
├── DEPLOY.md                   this file (command-line route)
├── GITHUB_FIRST_TIME.md        same job, click-by-click, no terminal
├── sync.sh / sync.bat          mirrors the canonical file into app/index.html
├── .gitignore                  blocks .riserchart / .csv / .xlsx — chorus data must never be pushed
├── .nojekyll                   stops GitHub's Jekyll pass from touching anything
└── app/
    ├── index.html              a byte-for-byte COPY of Riser_Chart_Manager.html
    ├── manifest.webmanifest
    ├── sw.js
    └── icons/
        ├── icon-192.png
        ├── icon-512.png
        ├── icon-maskable-512.png
        └── icon-180-apple.png
```

`app/index.html` is a copy, never an edit target. `sync.sh` (or the one-line `cp`) makes it.
Two copies exist because a `<a download>` link pointing at `app/index.html` would save to the
visitor's Downloads folder under the name `index.html`, which is useless.

---

> **Never done this before?** Read `GITHUB_FIRST_TIME.md` instead — same outcome, using GitHub
> Desktop, no terminal. Come back here for §3 (service-worker testing) and §6 (unsticking someone
> on an old build), which apply either way.

## 2. First publish

```bash
cd riser-chart-manager
git init -b main
git add .
git commit -m "Riser Chart Manager v1.6 — hosted app, PWA, landing page"
git remote add origin https://github.com/<user>/riser-chart-manager.git
git push -u origin main
```

Then on github.com: **Settings → Pages → Build and deployment → Source: Deploy from a branch →
Branch: `main`, folder `/ (root)` → Save.** First build takes a minute or two.

Live at:

- Landing page — `https://<user>.github.io/riser-chart-manager/`
- The app — `https://<user>.github.io/riser-chart-manager/app/`
- Standalone download — `https://<user>.github.io/riser-chart-manager/Riser_Chart_Manager.html`

---

## 3. Test the service worker *before* announcing anything

Service workers do not run on `file://`. They do run on `localhost`. Test there first —
a broken worker on the live site is worse than no worker at all.

```bash
cd riser-chart-manager
python3 -m http.server 8000
# open http://localhost:8000/app/
```

In DevTools → **Application**:

1. **Service Workers** — status `activated and is running`, source `sw.js`.
2. **Cache Storage** — one cache named `rcm-v1` containing `./`, the manifest and the icons.
3. **Manifest** — no errors; icons preview; "Installability" clean.
4. Tick **Network → Offline**, reload. The app must open and be fully usable.
5. Untick Offline. Edit a word in `Riser_Chart_Manager.html`, run `./sync.sh`, reload.
   **The change must appear on the first reload.** If it takes two reloads or never shows,
   the worker has gone cache-first and must be fixed before this goes anywhere near Kathy.

Then repeat step 5 once against the live GitHub Pages URL, because that's where the CDN's
`Cache-Control: max-age=600` lives. The worker already asks for a revalidation on every
navigation specifically to defeat that, but confirm it rather than trusting it.

---

## 4. Verify installation and the file-system hypothesis

**Install (Chrome/Edge desktop):** open `/app/`, click the install icon in the address bar.
It should open in its own window with the arcs icon, appear in the Start menu, and still work
with the wifi off.

**File System Access API — the thing hosting was supposed to fix.** In the *installed* window:

1. Save a chart to disk. Header should read `Saved 3:42 PM`.
2. Make an edit, wait for the debounce. Header should go `saving…` → `Saved`, and the file on
   disk should actually change (check the modified time).
3. Close the window entirely. Reopen. The **resume bar** should offer the last file; one click
   should reopen it.

If all three hold, the `file://`-was-the-problem theory is confirmed and can be closed out in
SCHEMA.md. If autosave still misbehaves on `https://`, the cause is elsewhere and that's a real
finding worth writing down.

---

## 5. Shipping a new build, from then on

```bash
# 1. edit the one real file
vim Riser_Chart_Manager.html          # bump APP_VERSION, add a WHATS_NEW entry
# 2. mirror it into the served copy   (Windows: double-click sync.bat)
./sync.sh
# 3. mirror the version number onto the landing page (the chip and the What's new block)
vim index.html
git commit -am "v1.7 — <one line>"
git push
```

That's the whole release. Within about a minute, anyone who reloads the hosted app is on the
new build; the version chip shows the new number and the **What's new** panel fires once. No
banner, no "update available" prompt, no file swap.

**Bump `CACHE` in `sw.js` (e.g. `rcm-v1` → `rcm-v2`) only when the icons or manifest change.**
Bumping it for an app change is harmless but pointless — the HTML is never served from cache
while online.

**Also tag the release**, so there's an archived copy of every build people might be running:

```bash
git tag -a v1.7 -m "v1.7" && git push --tags
```

---

## 6. If someone gets stuck on an old build

In order of escalation:

1. **Hard reload** — Ctrl+Shift+R. Bypasses both caches.
2. **DevTools → Application → Service Workers → Unregister**, then reload.
3. **Bump `CACHE` in `sw.js`** and push. Every client throws away its old cache on next visit.
4. **Nuclear option**: replace `sw.js` with a self-unregistering stub —
   `self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",e=>{e.waitUntil(self.registration.unregister().then(()=>self.clients.claim()))});`
   Push that, let everyone load once, then restore the real worker. Keep this in your back pocket;
   it's the reason the worker is deliberately tiny.

---

## 7. Custom domain (optional)

1. Buy the domain. Namecheap/Cloudflare, ~$12–15/yr.
2. DNS: four `A` records for the apex → `185.199.108.153`, `185.199.109.153`,
   `185.199.110.153`, `185.199.111.153`; and a `CNAME` for `www` → `<user>.github.io`.
   (Verify these against GitHub's current docs before pasting — they do change.)
3. Settings → Pages → Custom domain → enter it → wait for the check → tick **Enforce HTTPS**.
4. A `CNAME` file appears in the repo. Leave it there.

Everything in the app and the landing page uses relative links, so nothing needs editing when
the domain changes. That is deliberate.

---

## 8. Things that will bite you

- **`.nojekyll` matters.** Without it GitHub runs Jekyll over the repo and ignores files and
  folders beginning with `_`. Nothing here starts with `_` today; keep the file anyway.
- **Pages serves `Cache-Control: max-age=600`** on assets. Allow ten minutes before believing
  a landing-page change is missing, and don't be surprised by the icons lagging.
- **The scope rule.** `sw.js` lives in `/app/`, so it can only control `/app/` and below. The
  landing page is intentionally outside it — it should never be cached or offline-capable.
- **Don't move `sw.js` to the repo root** to "cache everything." That would put the download
  page and the standalone file under the worker, which is exactly what you don't want.
- **Never edit `app/index.html` directly.** It will get overwritten by the next `sync.sh` and
  the change will vanish with no error.
- **Git history is permanent.** A `.riserchart` or roster spreadsheet committed once stays in the
  history even after you delete the file, and rosters carry members' phone numbers and email
  addresses. `.gitignore` covers the obvious extensions; don't work on real charts inside the repo
  folder anyway.

---

## 9. Service-worker changelog

**`rcm-v2` (fixes the "offline didn't work" report).** `cache.addAll()` is atomic: one 404 or
one flaky response rejects the whole batch and stores *nothing*, silently, and the old worker
swallowed that rejection. Offline then failed even though the worker showed as activated. v2
caches each asset individually and warms the app HTML explicitly during install, so offline
works after the first visit and a single missing icon can no longer take the whole cache down.

`app/sw_test.js` drives the worker through a simulated `ServiceWorkerGlobalScope` — install,
activate, online fetch, offline fetch, cross-origin passthrough, cache purge — because service
workers can't be exercised by the app's jsdom suite and don't run from `file://` at all. Run it
with `node sw_test.js`; no dependencies.

**Deploying a worker change takes two reloads, not one.** The currently-installed worker serves
the first reload while the new one installs; the second reload is controlled by the new worker.
Verify in DevTools → Application → Cache storage: you should see `rcm-v2` and no `rcm-v1`.
