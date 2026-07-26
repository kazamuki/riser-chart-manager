/* v4.14 smoke suite — new install/habitat behaviour + core regressions.
   Run: node smoke414.js                                                    */
const fs = require("fs");
const { JSDOM } = require("jsdom");

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? "  <- " + extra : "")); }
}
function section(t) { console.log("\n— " + t); }

const HTML = fs.readFileSync("app.html", "utf8");

/* jsdom lacks a few browser APIs the app touches; stub only what it needs to boot. */
function boot(opts) {
  opts = opts || {};
  const url = opts.url || "file:///C:/charts/Riser_Chart_Manager.html";
  const dom = new JSDOM(HTML, {
    url,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(win) {
      /* jsdom refuses localStorage on a file:// opaque origin, which is exactly the habitat
         under test — so supply a deterministic in-memory one in both habitats. */
      const mem = new Map();
      Object.defineProperty(win, "localStorage", {
        configurable: true,
        value: {
          getItem: k => (mem.has(String(k)) ? mem.get(String(k)) : null),
          setItem: (k, v) => { mem.set(String(k), String(v)); },
          removeItem: k => { mem.delete(String(k)); },
          clear: () => mem.clear(),
          key: i => [...mem.keys()][i] ?? null,
          get length() { return mem.size; }
        }
      });
      if (opts.fsOk) {                      // pretend to be Chrome/Edge
        win.showOpenFilePicker = () => Promise.resolve([]);
        win.showSaveFilePicker = () => Promise.resolve({});
      } else {
        delete win.showOpenFilePicker;
        delete win.showSaveFilePicker;
      }
      win.matchMedia = win.matchMedia || (q => ({
        matches: !!(opts.standalone && /standalone/.test(q)),
        media: q, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {}
      }));
      if (opts.standalone) {
        win.matchMedia = q => ({
          matches: /standalone/.test(q), media: q,
          addListener() {}, removeListener() {},
          addEventListener() {}, removeEventListener() {}
        });
      }
      win.print = () => {};
      /* Firefox private windows: the key is present, the object is undefined. This shape
         used to throw a TypeError past the .catch(). */
      try { Object.defineProperty(win.navigator, "serviceWorker", { configurable: true, value: undefined }); } catch (e) {}
      if (opts.seed) win.localStorage.setItem("riserChartPro.v1", JSON.stringify(opts.seed));
      win.__errors = [];
      win.addEventListener("error", e => win.__errors.push(String(e.message || e.error)));
    }
  });
  return dom;
}

/* a realistic v1.7-era saved state, so migrate() is exercised on every boot */
const ev = (dom, code) => dom.window.eval(code);

function seedState() {
  return {
    version: 2, schema: "0.22",
    chorus: { name: "Oregon Spirit Chorus", tagline: "Sweet Adelines" },
    parts: [
      { id: "pt_tenor", name: "Tenor", color: "#E8508A" },
      { id: "pt_lead", name: "Lead", color: "#2F80C4" },
      { id: "pt_bari", name: "Bari", color: "#4E9A3E" },
      { id: "pt_bass", name: "Bass", color: "#EFB008" }
    ],
    roster: [
      { id: "p1", firstName: "Kathy", lastName: "Scheel", primaryPart: "pt_lead", status: "Active", height: 66, notes: "director" },
      { id: "p2", firstName: "Ann", lastName: "Boyd", primaryPart: "pt_tenor", status: "Active", height: 62 },
      { id: "p3", firstName: "Dee", lastName: "Cruz", primaryPart: "pt_bari", status: "Active", height: 64 },
      { id: "p4", firstName: "Mo", lastName: "Ellis", primaryPart: "pt_bass", status: "Prospective", height: 70 }
    ],
    quartets: [{ id: "q1", name: "Four Winds", memberIds: ["p1", "p2", "p3", "p4"] }],
    placement: {}, staging: [], notComing: [], overlays: [],
    settings: { onboarded: true, lastSeenVersion: "1.7", showCenterLine: true, fbNoteSeen: false }
  };
}

async function run() {
  /* ============================================================ 1. boot */
  section("boot, both habitats");
  {
    const dom = boot({ seed: seedState() });
    const w = dom.window;
    ok("boots from file:// without a script error", (w.__errors || []).length === 0, (w.__errors || [])[0]);
    ok("APP_VERSION is 1.8", ev(dom, "APP_VERSION") === "1.8", ev(dom, "APP_VERSION"));
    ok("version chip reads v1.8", w.document.querySelector("#verChip").textContent === "v1.8");
    ok("state survived migrate()", ev(dom, "state.roster.length") === 4);
    ok("a chart exists after boot", ev(dom, "state.snapshots.length") >= 1);
    dom.window.close();
  }
  {
    const dom = boot({ seed: seedState(), url: "https://kenscheel.github.io/riser-chart-manager/app/", fsOk: true });
    const w = dom.window;
    ok("boots over https:// without a script error", (w.__errors || []).length === 0, (w.__errors || [])[0]);
    ok("IS_HOSTED true on https", ev(dom, "IS_HOSTED") === true);
    dom.window.close();
  }

  /* ============================================================ 2. install chip */
  section("install chip (FB-34)");
  {
    const dom = boot({ seed: seedState(), url: "https://example.org/app/", fsOk: true });
    const w = dom.window, d = w.document, chip = d.querySelector("#btnInstall");
    ok("chip exists in the markup", !!chip);
    ok("chip hidden before beforeinstallprompt", chip.hidden === true);

    let prevented = false, prompted = 0;
    const ev = new w.Event("beforeinstallprompt");
    ev.preventDefault = () => { prevented = true; };
    ev.prompt = () => { prompted++; return Promise.resolve(); };
    ev.userChoice = Promise.resolve({ outcome: "accepted" });
    w.dispatchEvent(ev);

    ok("browser mini-infobar suppressed", prevented === true);
    ok("chip revealed once the event fires", chip.hidden === false);
    ok("chip is labelled, not icon-only", /Install/.test(chip.textContent));
    ok("chip carries an explanatory tooltip", (chip.getAttribute("title") || "").length > 40);

    chip.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    ok("click calls the deferred prompt", prompted === 1, "prompted=" + prompted);
    ok("chip retires after use (no dead button)", chip.hidden === true);

    chip.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));
    ok("a spent prompt is never re-prompted", prompted === 1, "prompted=" + prompted);
    dom.window.close();
  }
  {
    const dom = boot({ seed: seedState(), url: "https://example.org/app/", fsOk: true, standalone: true });
    const w = dom.window, chip = w.document.querySelector("#btnInstall");
    const ev = new w.Event("beforeinstallprompt");
    ev.preventDefault = () => {}; ev.prompt = () => Promise.resolve();
    ev.userChoice = Promise.resolve({ outcome: "accepted" });
    w.dispatchEvent(ev);
    ok("already installed -> chip stays hidden", chip.hidden === true);
    ok("isStandalone() detects standalone display-mode", w.isStandalone() === true);
    dom.window.close();
  }
  {
    /* Firefox / Safari: the event never fires, so nothing is ever offered. */
    const dom = boot({ seed: seedState(), url: "https://example.org/app/", fsOk: false });
    const w = dom.window;
    ok("no beforeinstallprompt -> chip stays hidden", w.document.querySelector("#btnInstall").hidden === true);
    dom.window.close();
  }
  {
    const dom = boot({ seed: seedState(), url: "https://example.org/app/", fsOk: true });
    const w = dom.window, chip = w.document.querySelector("#btnInstall");
    const ev = new w.Event("beforeinstallprompt");
    ev.preventDefault = () => {}; ev.prompt = () => Promise.resolve();
    ev.userChoice = Promise.resolve({ outcome: "accepted" });
    w.dispatchEvent(ev);
    ok("chip visible pre-install", chip.hidden === false);
    w.dispatchEvent(new w.Event("appinstalled"));
    ok("appinstalled retires the chip", chip.hidden === true);
    ok("appinstalled confirms where the icon went", /Start menu|Dock/.test(w.document.querySelector("#toast").textContent));
    dom.window.close();
  }

  /* ============================================================ 3. habitat copy */
  section("habitat-aware Help copy (FB-35)");
  {
    const dom = boot({ seed: seedState() });                         // file://
    const d = dom.window.document;
    ok("file://: file tip shown", d.querySelector("#hpTipFile").hidden === false);
    ok("file://: web tip hidden", d.querySelector("#hpTipWeb").hidden === true);
    ok("file://: 'this one file' wording shown", d.querySelector("#hpDataFile").hidden === false);
    ok("file://: 'no install, ever' still present", /No install, ever/.test(d.querySelector("#hpTipFile").textContent));
    dom.window.close();
  }
  {
    const dom = boot({ seed: seedState(), url: "https://example.org/app/", fsOk: true });
    const d = dom.window.document;
    ok("https: web tip shown", d.querySelector("#hpTipWeb").hidden === false);
    ok("https: file tip hidden", d.querySelector("#hpTipFile").hidden === true);
    ok("https: 'no install, ever' not on screen", d.querySelector("#hpTipFile").hidden === true);
    ok("https: web data paragraph shown", d.querySelector("#hpDataWeb").hidden === false);
    ok("https: offline is stated", /internet off/.test(d.querySelector("#hpDataWeb").textContent));
    const tip = d.querySelector("#hpTipWeb").textContent;
    ok("https tip names Chrome/Edge for install", /Chrome/.test(tip) && /Edge/.test(tip));
    ok("https tip states the Firefox/Safari limit honestly",
      /Firefox/.test(tip) && /Safari/.test(tip) && /(write to a file|download a copy)/.test(tip));
    dom.window.close();
  }

  /* ============================================================ 4. shortcut honesty */
  section("shortcut list honesty (FB-36)");
  {
    const dom = boot({ seed: seedState(), fsOk: true });
    const d = dom.window.document;
    ok("Chrome/Edge: Save as… shortcut still listed", d.querySelector("#hpKeySaveAs").hidden === false);
    ok("Chrome/Edge: Ctrl+S still reads 'save'", /save/.test(d.querySelector("#hpKeySave").textContent));
    ok("Chrome/Edge: Save as… button visible", d.querySelector("#btnSaveAs").hidden === false);
    dom.window.close();
  }
  {
    const dom = boot({ seed: seedState(), fsOk: false });
    const d = dom.window.document;
    ok("fallback: Save as… shortcut dropped", d.querySelector("#hpKeySaveAs").hidden === true);
    ok("fallback: Ctrl+S reads 'download a copy'", /download a copy/.test(d.querySelector("#hpKeySave").textContent));
    ok("fallback: Save as… button hidden (v4.13 held)", d.querySelector("#btnSaveAs").hidden === true);
    ok("fallback: Save relabelled (v4.13 held)", /Download a copy/.test(d.querySelector("#btnSaveFile").textContent));
    ok("fallback: file-mode note visible (v4.13 held)", d.querySelector("#fileModeNote").hidden === false);
    dom.window.close();
  }

  /* ============================================================ 5. core regressions */
  section("core regressions");
  {
    const dom = boot({ seed: seedState(), fsOk: true });
    const w = dom.window, d = w.document;

    /* place singers, then exercise print in all three modes */
    const spots = Object.keys(w.geom().cells);
    ok("board produced spots", spots.length >= 4, "spots=" + spots.length);
    ev(dom, `state.placement[${JSON.stringify(spots[0])}]="p1";state.placement[${JSON.stringify(spots[1])}]="p2";state.placement[${JSON.stringify(spots[2])}]="p3";update();`);
    ok("placement committed to the active chart",
      Object.keys(w.activeChart().placement).length === 3);

    ["full", "chart", "roster"].forEach(mode => {
      let err = null;
      try { w.buildPrint(mode); } catch (e) { err = e; }
      ok("print builds: " + mode, !err, err && err.message);
      ok("print produced output: " + mode, d.querySelector("#printarea").innerHTML.length > 100);
    });

    /* attendance + print marking */
    ev(dom, 'state.notComing=["p2"];update();');
    w.buildPrint("full");
    ok("away singer marked on the printout", /notcoming/.test(d.querySelector("#printarea").innerHTML));
    ok("away count reaches the print metadata", /1 away/.test(d.querySelector("#printarea").innerHTML));

    /* undo chain */
    const before = ev(dom, "JSON.stringify(state.placement)");
    ev(dom, `pushUndo("test move");state.placement[${JSON.stringify(spots[3])}]="p4";update();`);
    w.doUndo();
    ok("undo restores placement", ev(dom, "JSON.stringify(state.placement)") === before);

    /* charts */
    const n0 = ev(dom, "state.snapshots.length");
    ev(dom, 'state.snapshots.push(newChartObj("Contest",{},[],[],state.layout,null));update();');
    ok("a second chart can be added", ev(dom, "state.snapshots.length") === n0 + 1);
    ok("charts keep independent placement",
      ev(dom, "Object.keys(state.snapshots[" + n0 + "].placement).length") === 0);

    /* overlays survive a round-trip through the file text */
    ev(dom, 'state.overlays=[{id:"ov1",src:"data:image/png;base64,AAA",x:10,y:20,w:100,h:50}];update();');
    const json = ev(dom, "JSON.stringify(state)");
    ok("overlays serialise", /ov1/.test(json));
    ok("adoptFileText round-trips the state", w.adoptFileText(json) === true);
    ok("overlay survived the round-trip", ev(dom, "(state.overlays||[]).length") === 1);

    /* the hand-rolled xlsx writer and reader still round-trip */
    ok("csv roster export is callable", typeof w.exportRosterCsv === "function");
    ok("xlsx template writer is callable", typeof w.buildTemplateXlsx === "function");
    const bytes = w.buildTemplateXlsx(null);
    ok("template writer produced a zip", bytes && bytes.length > 500, "len=" + (bytes && bytes.length));
    ok("zip local-file signature present", bytes[0] === 0x50 && bytes[1] === 0x4b);
    const rows = await w.xlsxToRows(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    ok("xlsx reader round-trips the writer", Array.isArray(rows) && rows.length >= 3, "rows=" + (rows && rows.length));
    ok("locked CSV/template headers intact",
      rows && String(rows[0][0]) === "First Name" && String(rows[0][2]) === "Part" && String(rows[0][6]) === "Height (in)",
      rows && JSON.stringify(rows[0]));

    /* file status vocabulary (v4.13) */
    ev(dom, "fileCtx={handle:null,name:null};renderFileStatus();");
    ok("Chrome/Edge with nothing open says 'No file open'",
      /No file open/.test(d.querySelector("#fileName").textContent));

    ok("no script errors across the regression pass", (w.__errors || []).length === 0, (w.__errors || [])[0]);
    dom.window.close();
  }

  /* ============================================================ 6. migrations */
  section("migrations");
  {
    /* an ancient state: no snapshots, no notComing/overlays, no settings keys */
    const old = {
      version: 2,
      chorus: { name: "Old Chorus" },
      parts: [{ id: "pt_lead", name: "Lead", color: "#2F80C4" }],
      roster: [{ id: "p1", firstName: "A", lastName: "B", primaryPart: "pt_lead", status: "Active" }],
      placement: {}, settings: { onboarded: true }
    };
    const dom = boot({ seed: old, fsOk: true });
    const w = dom.window;
    ok("ancient state boots", (w.__errors || []).length === 0, (w.__errors || [])[0]);
    ok("migrate() creates a chart", ev(dom, "state.snapshots.length") >= 1);
    ok("migrate() defaults notComing", ev(dom, "Array.isArray(state.notComing)") === true);
    ok("migrate() defaults overlays", ev(dom, "Array.isArray(state.overlays)") === true);
    ok("migrate() defaults quartets", ev(dom, "Array.isArray(state.quartets)") === true);
    ok("migrate() defaults fbNoteSeen", ev(dom, '"fbNoteSeen" in state.settings') === true);
    dom.window.close();
  }
  {
    /* first run: wizard owns the screen, and the install chip must not compete with it */
    const dom = boot({ fsOk: true, url: "https://example.org/app/" });
    const w = dom.window, d = w.document;
    ok("first run opens the wizard", d.querySelector("#wizardModal").classList.contains("open"));
    ok("wizard offers to open an existing file", !!d.querySelector("#wzOpenExisting"));
    ok("install chip does not fire during first run", d.querySelector("#btnInstall").hidden === true);
    dom.window.close();
  }

  /* ============================================================ 7. what's new */
  section("what's new");
  {
    const dom = boot({ seed: seedState(), fsOk: true });
    const w = dom.window, d = w.document;
    ok("upgrade from 1.7 opens What's new", d.querySelector("#newsModal").classList.contains("open"));
    ok("What's new leads with 1.8", /v1\.8/.test(d.querySelector("#newsBody").textContent));
    ok("1.8 notes mention Install", /Install/.test(d.querySelector("#newsBody").textContent));
    w.closeNews();
    ok("closing What's new records the version", ev(dom, "state.settings.lastSeenVersion") === "1.8");
    dom.window.close();
  }

  console.log("\n" + "=".repeat(58));
  console.log("PASS " + pass + "   FAIL " + fail);
  if (fail) { console.log("\nFailures:"); failures.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
  console.log("all green");
}

run().catch(e => { console.error("suite crashed:", e); process.exit(1); });
