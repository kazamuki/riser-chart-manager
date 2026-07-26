/* Run: npm i jsdom && node smoke_hosting.js   (dev-only; safe to leave in the repo) */
/* v4.12 hosting smoke test.
   Boots the patched app in jsdom under BOTH habitats and checks the SW guard:
     1. file://  → app boots, no serviceWorker.register call, no throw
     2. https:// → app boots, exactly one register("./sw.js")
   Plus core regressions: wizard fires on a clean first run, version chip renders,
   and a saved state round-trips through load().                                   */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const HTML = fs.readFileSync(__dirname + "/Riser_Chart_Manager.html", "utf8");
let fails = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fails++; };

function boot(url, { seed } = {}) {
  const registered = [];
  const errors = [];
  const dom = new JSDOM(HTML, {
    url,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(w) {
      // jsdom has no serviceWorker; install a spy only for the https run so the guard
      // is exercised for real rather than short-circuited by the "in navigator" test.
      if (url.startsWith("http")) {
        Object.defineProperty(w.navigator, "serviceWorker", {
          configurable: true,
          value: { register: (p) => { registered.push(p); return Promise.resolve({}); } }
        });
      }
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      w.scrollTo = () => {};
      w.alert = () => {}; w.confirm = () => true;
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.addEventListener("error", e => errors.push(String(e.error || e.message)));
      if (seed) w.localStorage.setItem("riserChartPro.v1", seed);
    }
  });
  const w = dom.window;
  w.dispatchEvent(new w.Event("load"));
  return { w, registered, errors, doc: w.document };
}

console.log("\n[1] file:// habitat — the standalone file must not touch service workers");
{
  const { w, registered, errors, doc } = boot("file:///C:/Users/kathy/Desktop/Riser_Chart_Manager.html");
  ok(errors.length === 0, "boots with no uncaught errors" + (errors[0] ? " → " + errors[0] : ""));
  ok(registered.length === 0, "no service-worker registration attempted");
  ok(!!w.APP_VERSION || doc.querySelector(".hpver") !== null, "app script ran (help version node present)");
  ok(doc.querySelector('link[rel="manifest"]') !== null, "manifest link present but inert");
  ok(doc.getElementById("wizardModal").classList.contains("open"), "first-run wizard fires");
  ok(doc.getElementById("wzOpenExisting") !== null, "wizard offers 'Open a .riserchart file…' (hosted first-visit escape hatch)");
  w.close();
}

console.log("\n[2] https:// habitat — hosted app registers the worker exactly once");
{
  const { w, registered, errors } = boot("https://example.github.io/riser-chart-manager/app/");
  ok(errors.length === 0, "boots with no uncaught errors" + (errors[0] ? " → " + errors[0] : ""));
  ok(registered.length === 1, "register() called exactly once");
  ok(registered[0] === "./sw.js", "registers ./sw.js (scope = /app/, not the whole site)");
  w.close();
}

console.log("\n[3] returning user — saved state still loads and skips the wizard");
{
  // Build a state by finishing a wizard-free boot, then re-boot with it seeded.
  const first = boot("https://example.github.io/riser-chart-manager/app/");
  first.w.finishWizardTestHook = null;
  // Fabricate the minimum a real save contains by running the app's own freshState().
  const seed = first.w.eval("JSON.stringify(Object.assign(freshState({name:'Oregon Spirit Chorus',onboarded:true})))");
  first.w.close();
  const { w, doc, errors } = boot("https://example.github.io/riser-chart-manager/app/", { seed });
  ok(errors.length === 0, "boots with no uncaught errors" + (errors[0] ? " → " + errors[0] : ""));
  ok(!doc.getElementById("wizardModal").classList.contains("open"), "wizard does NOT fire for an onboarded user");
  const chip = doc.querySelector(".verchip, .hpver");
  ok(chip !== null, "version chip rendered");
  w.close();
}

console.log("\n[4] sw.js sanity — the strategy is network-first, not cache-first");
{
  const sw = fs.readFileSync(__dirname + "/app/sw.js", "utf8");
  ok(/fetch\(new Request[\s\S]{0,300}caches\.match/.test(sw), "navigation handler tries fetch() before caches.match()");
  ok(/caches\.keys\(\)/.test(sw) && /caches\.delete/.test(sw), "activate purges old cache versions");
  ok(/url\.origin !== location\.origin/.test(sw), "cross-origin requests are passed through untouched");
  new (require("vm").Script)(sw); // parses
  ok(true, "sw.js parses");
}

console.log("\n[5] manifest sanity");
{
  const m = JSON.parse(fs.readFileSync(__dirname + "/app/manifest.webmanifest", "utf8"));
  ok(m.start_url === "./" && m.scope === "./", "start_url and scope are relative to /app/");
  ok(m.icons.some(i => i.purpose === "maskable"), "a maskable icon is declared");
  ok(m.icons.every(i => fs.existsSync(__dirname + "/app/" + i.src)), "every declared icon file exists");
}

console.log(fails ? `\n${fails} FAILURE(S)\n` : "\nALL CHECKS PASSED\n");
process.exit(fails ? 1 : 0);
