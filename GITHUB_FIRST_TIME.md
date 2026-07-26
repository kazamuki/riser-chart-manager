# Getting this online — first time with GitHub

Written for someone who has never used git. No command line required anywhere in this document.
`DEPLOY.md` is the same job described for a terminal; use whichever you prefer. They produce
identical results.

Total time: about 45 minutes, most of it waiting.

---

## The mental model, in four sentences

A **repository** ("repo") is a folder whose entire history GitHub keeps. A **commit** is a save
point with a note attached — like "Save As", except nothing is ever overwritten and you can walk
backwards through every version you ever saved. **Pushing** uploads your commits to GitHub's copy.
**GitHub Pages** takes the files in GitHub's copy and serves them as a website.

That's it. Everything else is vocabulary.

---

## Part 1 — Create the account

Go to <https://github.com/signup>.

**Username.** Read Part 2 before you type this. It ends up in the address of every page you
ever publish, and changing it later breaks every link you've handed out.

**Email.** Use one you'll keep. It doesn't have to be the support address in the app.

**Plan: Free.** It covers everything here. Pages is free for public repos — which is what you
want anyway, since the whole pitch is "you can read the source yourself."

Then do these three things immediately, before you forget:

1. **Turn on two-factor authentication.** Settings → Password and authentication → Two-factor.
   GitHub requires it for anyone who pushes code, so it's not optional; doing it now avoids
   being locked out mid-task later. Use an authenticator app (Google Authenticator, Authy, or
   your password manager). **Save the recovery codes somewhere that isn't your phone** — losing
   both phone and codes means losing the account.
2. **Settings → Emails → tick "Keep my email addresses private."** Otherwise your email address
   is stamped into every commit and is permanently readable by anyone. This does not affect the
   support address printed inside the app.
3. **Settings → Profile** — a display name and one line about what you build. Someone
   evaluating whether your download is trustworthy *will* click your username, and an empty
   profile does the opposite of what you want. This is part of solving Kathy's FB-20 complaint.

---

## Part 2 — Naming: account vs. project

Your question, answered directly: **the account is not the project.** One account holds as many
projects as you like, each in its own repo, each with its own website address.

The pattern for a project site is:

```
https://<USERNAME>.github.io/<REPO-NAME>/
```

So with username `kenscheel` and repo `riser-chart-manager`:

- App → `https://kenscheel.github.io/riser-chart-manager/app/`
- Next project → `https://kenscheel.github.io/whatever-that-is/`

**Therefore: username generic, repo names specific.** Your own name, a handle, or a studio name.
It's the shopfront; the repos are the shelves. `kenscheel` matches your Ko-fi handle
(`ko-fi.com/kenscheel`), which is worth something — a director who sees the same name on the
download page and the tip page reads them as the same person.

Don't pick something project-specific like `riserchartapp`, because then the *next* project lives
at an address that makes no sense for it.

**One extra trick worth knowing.** A repo named *exactly* `<USERNAME>.github.io` is served at the
bare address with no project path:

```
repo "kenscheel.github.io"  →  https://kenscheel.github.io/
```

That's where a one-page "here's what I make" hub would go later, linking out to each project.
You don't need it now. Just don't use that name for the riser chart repo.

**Can you change the username later?** Yes, and GitHub will redirect the old address — but only
until someone else claims your old username, at which point every link you've emailed to a
chorus director goes somewhere you don't control. Treat it as permanent.

---

## Part 3 — Create the repository

1. Click **+** (top right) → **New repository**.
2. **Repository name:** `riser-chart-manager`
3. **Description:** `Riser chart tool for chorus and choir directors. One file, works offline.`
4. **Public.** Required for free Pages, and correct for this project.
5. **Leave all three checkboxes off** — no README, no .gitignore, no license. The folder you're
   about to upload already contains what it needs, and adding files here creates a conflict you'd
   have to untangle on day one.
6. **Create repository.**

You'll land on a page of setup instructions. Ignore all of it.

> **A license, later.** "Free to use and free to share" is currently a promise on a web page,
> not a legal statement. It costs nothing to add a `LICENSE` file eventually (MIT is the usual
> choice for "do what you like"), and it makes the freeware claim concrete. Not urgent. Not today.

---

## Part 4 — Install GitHub Desktop

<https://desktop.github.com> → download → install → **sign in with your new account**.

This is the piece that means you never touch a command line. It's an official GitHub app, and it
does exactly three things you care about: notice what changed, commit, push.

---

## Part 5 — Get the files up

1. In GitHub Desktop: **File → Clone repository → GitHub.com** tab → pick
   `riser-chart-manager` → choose where it lives on your disk (e.g.
   `C:\Users\Ken\Documents\GitHub\riser-chart-manager`) → **Clone**.

   You now have an empty folder that is wired to GitHub. This folder is the one you work in from
   now on.

2. **Unzip `riser-chart-manager-site.zip` and copy everything inside it into that folder.**
   You want the *contents* — `index.html`, `app`, `Riser_Chart_Manager.html`, and so on — sitting
   directly in the cloned folder, not a nested `riser-chart-manager` folder inside it.

   Include the dot-files: `.gitignore` and `.nojekyll`. Windows Explorer hides them by default —
   View → Show → Hidden items. They matter; `.nojekyll` stops GitHub from mangling the site and
   `.gitignore` is what keeps chorus rosters from being published by accident.

3. Switch back to GitHub Desktop. It will list every file as a change (17 or so).

4. Bottom left, in **Summary**, type: `Riser Chart Manager v1.6 — hosted app, PWA, landing page`

5. Click **Commit to main**.

6. Click **Push origin** (top bar). Wait a few seconds.

7. Refresh your repo page on github.com. The files are there.

---

## Part 6 — Turn on the website

1. On github.com, in your repo: **Settings** (repo settings, not account settings) → **Pages**
   in the left sidebar.
2. **Source:** Deploy from a branch.
3. **Branch:** `main`, folder: `/ (root)` → **Save.**
4. Go to the **Actions** tab and watch. A green tick means it published; it takes one to three
   minutes the first time.
5. Visit:
   - `https://<USERNAME>.github.io/riser-chart-manager/` — the landing page
   - `https://<USERNAME>.github.io/riser-chart-manager/app/` — the app

**If you get a 404,** wait two more minutes and hard-reload (Ctrl+Shift+R). If it persists, check
Settings → Pages actually shows "Your site is live at…", and that `index.html` is in the root of
the repo rather than inside a subfolder.

---

## Part 7 — Test the service worker before telling anyone

This is the one step it's tempting to skip and the one step that matters most. A misbehaving
service worker doesn't just fail — it can pin someone on an old build permanently, which is
precisely the problem this whole exercise exists to fix.

**The test:**

1. Open the hosted app: `…/riser-chart-manager/app/`
2. Press **F12** → **Application** tab → **Service Workers**. It should say
   *activated and is running*.
3. Still in Application → **Cache storage** → you should see `rcm-v1`.
4. **Network** tab → tick **Offline** → reload the page. The app must open and work normally.
5. Untick Offline.
6. Now the real check. On your computer, open `Riser_Chart_Manager.html` in a text editor and
   change something visible — the tagline in the Help panel, anything. Double-click
   **`sync.bat`** (this copies your file over `app\index.html`; never edit that one by hand).
   Commit and push in GitHub Desktop. Wait two minutes.
7. Reload the hosted app **once**.

**Your change must appear on that first reload.** If it takes two reloads, or never appears, stop
and tell me — the worker has fallen back to cache-first and needs fixing before Kathy sees it.

---

## Part 8 — Install it, and check the thing hosting was supposed to fix

In Chrome or Edge, open the hosted app. An **install icon** appears at the right of the address
bar (a monitor with an arrow). Click it. You get a standalone window with the arcs icon and a
Start-menu entry.

Then, in that installed window, check the file-saving behaviour that `file://` was suspected of
breaking:

1. Save a chart to disk. The header should read `Saved 3:42 PM`.
2. Make an edit and wait a moment. Header goes `saving…` → `Saved`, and the file's modified time
   on disk actually changes.
3. Close the window completely, reopen it. The resume bar should offer that file, and one click
   should reopen it.

If all three work, we've confirmed why autosave was flaky and can close that question. If they
still misbehave on `https://`, that's a real finding — tell me and we'll dig in.

---

## Part 9 — Shipping an update, from now on

This is the payoff, and it's the answer to what you meant about uploading updates:

1. Drop the new `Riser_Chart_Manager.html` into your repo folder, replacing the old one.
2. Double-click **`sync.bat`**.
3. Update the version number in two places on the landing page (`index.html`): the little `v1.6`
   chip near the top, and the "What's new" block.
4. GitHub Desktop → type a summary → **Commit to main** → **Push origin**.

Within a minute or two, anyone who reloads the hosted app is on the new build. The version chip
shows the new number and the What's new panel appears once. Nobody swaps a file. Nobody wonders
whether it worked.

The standalone download updates at the same moment, because it's the same file — so people who
prefer their own copy get the new one next time they visit the page, and the copies already
travelling by email keep working exactly as before.

---

## Part 10 — Beginner traps, in the order you're likely to hit them

| Trap | What to do |
|---|---|
| **Committing chorus data.** A `.riserchart` or roster spreadsheet holds real names, phone numbers and email addresses, and **git history is permanent** — deleting the file in a later commit does not remove it from history. | `.gitignore` already blocks `.riserchart`, `.csv` and `.xlsx`. Don't override it. Keep real charts in a different folder entirely. |
| **Editing `app/index.html` directly.** Your change vanishes the next time `sync.bat` runs, with no error. | Only ever edit `Riser_Chart_Manager.html`. |
| **Forgetting to push.** Committing saves locally; the website doesn't change until you push. | If the site looks stale, check whether **Push origin** still shows a number. |
| **Filename case.** The web is case-sensitive; Windows isn't. `riser_chart_manager.html` will 404 even though it opens fine on your desktop. | Keep the exact capitalisation: `Riser_Chart_Manager.html`. |
| **Believing the site is broken when it's just slow.** GitHub caches files for ten minutes. | Hard-reload (Ctrl+Shift+R), then wait, then worry. |
| **Deleting things to "clean up."** Nothing here is unused. `.nojekyll` looks like clutter and isn't. | Leave the tree as delivered. |

---

## What to do if something goes sideways

Nothing here is one-way. The repo can be deleted and remade in two minutes; Pages can be switched
off in one click; git keeps every previous version, so a bad build can be reverted (in GitHub
Desktop: **History** → right-click the commit → **Revert changes in commit**). And the standalone
file on your desktop keeps working through all of it, which is rather the point of building it
that way.

`DEPLOY.md` §6 has the escalation ladder if a specific person ends up stuck on an old build.
