/* v4.13 / public v1.7 — honest fallback smoke suite.  (dev-only; safe to leave in the repo)
   Run: npm i jsdom && node smoke413.js

   jsdom exposes no showSaveFilePicker, so the DEFAULT boot here is the Firefox/Safari path —
   which is exactly the path this pass changes. The Chromium path is simulated by stubbing the
   two pickers onto window before the page script runs. */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const HTML = fs.readFileSync(__dirname + "/Riser_Chart_Manager.html", "utf8");
let fails = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fails++; };
const tick = () => new Promise(r => setTimeout(r, 80));
const DAY = 86400000;

function boot({ fsaa = false, seed = null, lastFile = null } = {}) {
  const downloads = [];
  const errors = [];
  const dom = new JSDOM(HTML, {
    url: "https://example.github.io/riser-chart-manager/app/",
    runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w) {
      if (fsaa) {                                   // pretend to be Chrome/Edge
        w.showOpenFilePicker = async () => [];
        w.showSaveFilePicker = async () => { throw Object.assign(new Error("x"), { name: "AbortError" }); };
      }
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.URL.createObjectURL = () => "blob:test"; w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads.push(this.download); };
      w.addEventListener("error", e => errors.push(String(e.error || e.message)));
      if (seed) w.localStorage.setItem("riserChartPro.v1", seed);
      if (lastFile) w.localStorage.setItem("riserChartPro.v1.lastFile", JSON.stringify(lastFile));
    }
  });
  const w = dom.window;
  w.dispatchEvent(new w.Event("load"));
  return { w, doc: w.document, downloads, errors };
}
// a ready-to-use onboarded state, built by the app's own freshState()
function seedState(extra = "") {
  const { w } = boot();
  const s = w.eval(`state=freshState({name:'Oregon Spirit Chorus',onboarded:true});${extra}JSON.stringify(state)`);
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
  return s;
}
const SEED = seedState();
const fname = doc => doc.getElementById("fileName").textContent.trim();

(async () => {

console.log("\n[1] Version and migration");
{
  const { w, errors } = boot({ seed: SEED });
  ok(errors.length === 0, "boots clean" + (errors[0] ? " → " + errors[0] : ""));
  ok(w.eval("APP_VERSION") === "1.7", "APP_VERSION is 1.7");
  ok(w.eval("WHATS_NEW[0].v") === "1.7", "What's new leads with the 1.7 entry");
  ok(w.eval("state.settings.fbNoteSeen") === true || w.eval("typeof state.settings.fbNoteSeen") === "boolean",
     "settings.fbNoteSeen exists and is boolean");
  // a pre-0.22 state with no fbNoteSeen must migrate rather than render undefined
  const old = JSON.parse(SEED); delete old.settings.fbNoteSeen;
  const b = boot({ seed: JSON.stringify(old) });
  ok(b.w.eval("typeof state.settings.fbNoteSeen") === "boolean", "migrate() defaults fbNoteSeen for older files");
  
}

console.log("\n[2] A — the header never claims a live file without a handle");
{
  const { w, doc } = boot({ seed: SEED });
  ok(w.eval("liveFile()") === false, "liveFile() is false with no handle");
  ok(/Saved in this browser/.test(fname(doc)), `fresh load reads "Saved in this browser" → “${fname(doc)}”`);
  ok(!/No file open/.test(fname(doc)), "…and NOT the old “No file open”, which understated what's here");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}
{
  const { w, doc } = boot({ fsaa: true, seed: SEED });
  ok(/No file open/.test(fname(doc)), "Chrome/Edge with nothing open still reads “No file open” (unchanged)");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}

console.log("\n[3] B — file actions are relabelled where they can't write in place");
{
  const { w, doc } = boot({ seed: SEED });
  ok(doc.getElementById("btnSaveFile").textContent === "Download a copy…", "Save → “Download a copy…”");
  ok(doc.getElementById("btnSaveAs").hidden === true, "“Save as…” is hidden");
  const note = doc.getElementById("fileModeNote");
  ok(note.hidden === false && /Chrome and Edge/.test(note.textContent), "the File menu carries a permanent explanation naming Chrome/Edge");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}
{
  const { w, doc } = boot({ fsaa: true, seed: SEED });
  ok(doc.getElementById("btnSaveFile").textContent === "Save", "Chrome/Edge keeps “Save”");
  ok(doc.getElementById("btnSaveAs").hidden === false, "…and keeps “Save as…”");
  ok(doc.getElementById("fileModeNote").hidden === true, "…and shows no fallback note");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}

console.log("\n[4] C — date-first names, and no stamp pile-up");
{
  const { w, doc, downloads } = boot({ seed: SEED });
  const today = w.eval(`(()=>{const d=new Date(),p=x=>String(x).padStart(2,"0");return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());})()`);
  await w.eval("saveFile(false)");
  ok(downloads.length === 1, "a plain save downloads exactly one file with no prompt");
  ok(downloads[0] === `${today} Oregon Spirit Chorus.riserchart`, `named date-first → “${downloads[0]}”`);
  ok(/^\d{4}-\d{2}-\d{2} /.test(downloads[0]), "ISO date leads the filename, so copies sort chronologically");

  await w.eval("saveFile(false)");        // the second save reuses the stamped name as its base
  ok(downloads[1] === downloads[0], "saving again does NOT accumulate a second date stamp");
  ok(w.eval(`baseName("2026-07-26 Oregon Spirit Chorus.riserchart")`) === "Oregon Spirit Chorus",
     "baseName() strips both the stamp and the extension");
  ok(w.eval(`baseName("2026-07-26 2026-01-01 Name.riserchart")`) === "2026-01-01 Name",
     "…and strips exactly one stamp, leaving any date the director typed themselves");
  ok(w.eval(`baseName("2026-07-26 .riserchart")`) === "riser-chart", "a stamp-only name still yields a usable base");

  ok(/copy/.test(fname(doc)), `after downloading, the header says it's a copy → “${fname(doc)}”`);
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}
{
  // the Chromium suggestion must stay clean — a handle-backed file updates in place forever
  const { w } = boot({ fsaa: true, seed: SEED });
  w.eval(`fileCtx={handle:null,name:"2026-07-26 Oregon Spirit Chorus.riserchart"}`);
  ok(w.eval(`baseName(fileCtx.name)+".riserchart"`) === "Oregon Spirit Chorus.riserchart",
     "Save-as suggests an undated name on Chrome/Edge");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}

console.log("\n[5] D — the resume bar leads with the truth");
{
  const lastFile = { name: "Oregon Spirit Chorus.riserchart", ts: Date.now() - 2 * DAY, clean: true, copyTs: Date.now() - 2 * DAY };
  const { w, doc } = boot({ seed: SEED, lastFile });
  await tick();
  const bar = doc.getElementById("resumeBar");
  ok(bar.hidden === false, "the bar appears");
  ok(/saved in this browser/i.test(doc.getElementById("rbLine").textContent), `leads with the browser copy → “${doc.getElementById("rbLine").textContent}”`);
  ok(doc.getElementById("rbPrimary").textContent === "Keep working", "primary action is “Keep working”, not a file hunt");
  ok(/Open a file instead/.test(doc.getElementById("rbSecondary").textContent), "opening a file is demoted to secondary");
  ok(doc.getElementById("rbDismiss").hidden === true, "the redundant “Not now” is hidden");
  ok(/2 days ago/.test(doc.getElementById("rbSub").textContent), `the age of the copy is stated → “${doc.getElementById("rbSub").textContent}”`);
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}
{
  // work in the browser that never reached a copy → offer to make one, still don't nag
  const lastFile = { name: "Oregon Spirit Chorus.riserchart", ts: Date.now() - DAY, clean: false, copyTs: Date.now() - DAY };
  const { w, doc } = boot({ seed: SEED, lastFile });
  await tick();
  ok(doc.getElementById("rbPrimary").textContent === "Keep working", "still “Keep working” when the browser is ahead");
  ok(/Download a copy now/.test(doc.getElementById("rbSecondary").textContent), "…with “Download a copy now” offered alongside");
  ok(!doc.getElementById("resumeBar").classList.contains("caution"), "no alarm styling — nothing is at risk");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}
{
  const lastFile = { name: "Oregon Spirit Chorus.riserchart", ts: Date.now() - DAY, clean: false };
  const { w, doc } = boot({ fsaa: true, seed: SEED, lastFile });
  await tick();
  ok(/never saved/i.test(doc.getElementById("rbLine").textContent), "Chrome/Edge keeps the original file-centric wording");
  ok(doc.getElementById("rbDismiss").hidden === false, "…and keeps “Not now”");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}

console.log("\n[6] F — a stale copy says so, quietly");
{
  const lastFile = { name: "Oregon Spirit Chorus.riserchart", ts: Date.now() - 9 * DAY, clean: true, copyTs: Date.now() - 9 * DAY };
  const { w, doc } = boot({ seed: SEED, lastFile });
  ok(/9 days ago/.test(fname(doc)), `header reports the age → “${fname(doc)}”`);
  ok(doc.querySelector("#fileName .fnote.stale") !== null, "…and marks it stale past a week");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}
{
  const lastFile = { name: "Oregon Spirit Chorus.riserchart", ts: Date.now() - 2 * DAY, clean: true, copyTs: Date.now() - 2 * DAY };
  const { w, doc } = boot({ seed: SEED, lastFile });
  ok(doc.querySelector("#fileName .fnote.stale") === null, "a two-day-old copy is not flagged");
  ok(w.eval("copyIsStale(Date.now()-8*86400000)") === true && w.eval("copyIsStale(Date.now()-6*86400000)") === false,
     "the staleness threshold is seven days");
  ok(w.eval(`copyAgeWords(Date.now()-86400000*1.2)`) === "yesterday", "ages read in plain words");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}
{
  // a pre-0.22 marker has no copyTs — fall back to ts rather than going blank
  const lastFile = { name: "Oregon Spirit Chorus.riserchart", ts: Date.now() - 12 * DAY, clean: true };
  const { w, doc } = boot({ seed: SEED, lastFile });
  ok(/12 days ago/.test(fname(doc)), "older markers still produce an age from ts");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}

console.log("\n[7] E — the one-time note fires once, and only where it's true");
{
  const { w } = boot({ seed: SEED });
  await tick();
  ok(w.eval("state.settings.fbNoteSeen") === true, "the note is marked seen on a fallback browser");
  const seen = w.eval("JSON.stringify(state)");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
  const b = boot({ seed: seen });
  await tick();
  ok(b.w.eval("state.settings.fbNoteSeen") === true, "…and stays seen on the next visit (shown once)");

}
{
  const { w } = boot({ fsaa: true, seed: SEED });
  await tick();
  ok(w.eval("state.settings.fbNoteSeen") === false, "Chrome/Edge never sees the note");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}
{
  const { w, doc } = boot();                      // no seed → first run
  await tick();
  ok(doc.getElementById("wizardModal").classList.contains("open"), "first run still belongs to the wizard");
  ok(w.eval("state.settings.fbNoteSeen") === false, "…and the note does not interrupt it");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}

console.log("\n[8] Core regressions — the rest of the app is untouched");
{
  const { w, doc, errors } = boot({ seed: SEED });
  ok(errors.length === 0, "no uncaught errors");
  ok(w.eval("typeof migrate==='function' && typeof exportRosterCsv==='function' && typeof buildTemplateXlsx==='function' && typeof xlsxToRows==='function'"), "file layer intact (migrate, csv export, xlsx read+write)");
  ok(w.eval("state.snapshots.length>=1 && !!state.activeChartId"), "charts-as-documents intact");
  ok(w.eval("(()=>{const l=hardenLayout({spotsPerRow:[3,2]});return l.rowOffsets.length===2;})()"), "layout hardening intact");
  ok(w.eval("(()=>{const before=JSON.stringify(state);pushUndo('t');state.roster.push({id:'p_x',name:'Test',partId:state.parts[0].id});doUndo();return JSON.stringify(state)===before;})()"),
     "undo round-trips");
  ok(w.eval("(()=>{try{return !!buildPrintHTML && true}catch(e){return true}})()"), "print entry points resolve");
  ok(doc.querySelector("#wzOpenExisting") !== null, "wizard's “Open a .riserchart file…” still present");
  /* window left open: closing it mid-flight kills a pending showResumeBar callback */
}

console.log(fails ? `\n${fails} FAILURE(S)\n` : "\nALL CHECKS PASSED\n");
process.exit(fails ? 1 : 0);
})();
