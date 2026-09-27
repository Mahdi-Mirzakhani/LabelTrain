// Live verification of the data-loss / UX fixes against the RUNNING app.
// Requires the app started with LS_DEBUG_PORT=9222.
//
//   node tests/cdp-verify-fixes.mjs "<absolute image folder>"

const CDP = "http://127.0.0.1:9222";
const folder = process.argv[2];
if (!folder) { console.error("usage: cdp-verify-fixes.mjs <folder>"); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  \x1b[32m✓\x1b[0m " + m); };
const bad = (m, d) => { fail++; console.log("  \x1b[31m✗\x1b[0m " + m); if (d !== undefined) console.log("    " + JSON.stringify(d)); };
const check = (c, m, d) => c ? ok(m) : bad(m, d);

// The detached DevTools window is ALSO a "page" target — match the app itself.
const list = await (await fetch(CDP + "/json/list")).json();
const page = list.find((t) =>
  t.type === "page" && t.webSocketDebuggerUrl &&
  (t.url.includes("5173") || t.title === "LabelStudio"));
if (!page) { console.error("no app page target", list.map(t => t.url)); process.exit(2); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled") {
    logs.push(m.params.type + ": " + m.params.args.map(a => a.value ?? a.description ?? "").join(" "));
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
});
async function evaluate(expression) {
  const m = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (m.result?.exceptionDetails) {
    throw new Error(m.result.exceptionDetails.exception?.description || JSON.stringify(m.result.exceptionDetails));
  }
  return m.result?.result?.value;
}
await send("Runtime.enable");

// ---- React internals: find the AppShell hook state we need ---------------
// Rather than reach into fibers, drive the real UI and read the real DOM.

const esc = JSON.stringify(folder);

console.log("\n\x1b[1m\x1b[33m▶ Open a Persian-named folder through the real UI\x1b[0m");
// Onboarding may or may not be showing depending on stored settings; get to
// the project screen, then open the folder via the same IPC the UI uses.
await evaluate(`
  (async () => {
    // Click "Skip" / "Maybe later" if the welcome tour is up.
    const btns = [...document.querySelectorAll("button")];
    const skip = btns.find(b => /Skip|Maybe later|بعداً|رد کردن/.test(b.textContent || ""));
    if (skip) skip.click();
  })()
`);
await sleep(400);

// Seed the folder as a recent project and open it via the project card, so the
// whole open path (detectClasses, listing, hydration) runs for real.
await evaluate(`
  window.api.saveProject({
    name: "live-check", imageDir: ${esc}, classes: ["person","car"],
    format: "YOLO", outputDir: "", createdAt: Date.now(), lastOpenedAt: Date.now(),
  })
`);
await sleep(300);
await evaluate(`
  (async () => {
    const btns = [...document.querySelectorAll("button")];
    const proj = btns.find(b => /Switch project|All projects|همهٔ پروژه‌ها/.test(b.textContent || ""));
    if (proj) proj.click();
  })()
`);
await sleep(300);
// Reload so the ProjectManager picks up the seeded recent entry, then click it.
await evaluate(`window.location.reload()`);
await sleep(2500);
await evaluate(`
  (async () => {
    const btns = [...document.querySelectorAll("button")];
    const skip = btns.find(b => /Skip|Maybe later|بعداً|رد کردن/.test(b.textContent || ""));
    if (skip) skip.click();
  })()
`);
await sleep(600);
const opened = await evaluate(`
  (() => {
    const card = [...document.querySelectorAll(".pm-card")].find(c => /live-check/.test(c.textContent || ""));
    if (!card) return "no-card";
    card.click();
    return "clicked";
  })()
`);
check(opened === "clicked", "found and clicked the seeded project card", opened);
await sleep(3500);

console.log("\n\x1b[1m\x1b[33m▶ Images load and hydrate\x1b[0m");
const rows = await evaluate(`document.querySelectorAll(".file-row").length`);
check(rows > 0, `file list rendered ${rows} rows`);
const subs = await evaluate(`
  [...document.querySelectorAll(".file-sub")].map(e => e.textContent).slice(0, 12)
`);
check(subs.some(s => /box/i.test(s) || /باکس/.test(s)),
  "labeled rows show a box count (background hydration ran)", subs.slice(0, 4));
check(!subs.every(s => s.trim().startsWith("…")), "rows are not stuck on the placeholder");

console.log("\n\x1b[1m\x1b[33m▶ Thumbnails are downscaled, not full-resolution\x1b[0m");
const thumbInfo = await evaluate(`
  (() => {
    const imgs = [...document.querySelectorAll(".file-row img")];
    return {
      count: imgs.length,
      blobs: imgs.filter(i => i.src.startsWith("blob:")).length,
      appUrls: imgs.filter(i => i.src.startsWith("app://")).length,
      natural: imgs.slice(0, 5).map(i => i.naturalWidth + "x" + i.naturalHeight),
    };
  })()
`);
check(thumbInfo.blobs > 0, `thumbnails resolve to downscaled blobs (${thumbInfo.blobs}/${thumbInfo.count})`, thumbInfo);
check(thumbInfo.appUrls === 0, "no row points at the full-resolution source file", thumbInfo);
check(thumbInfo.natural.every(d => parseInt(d) <= 128 || d === "0x0"),
  "decoded thumbnail width is <= 128px (source is 3000px)", thumbInfo.natural);

console.log("\n\x1b[1m\x1b[33m▶ Out-of-range class index is preserved, not dropped\x1b[0m");
// The dataset has `7 ...` lines but only 2 classes -> loads as unknown_7.
const boxCls = await evaluate(`
  (async () => {
    const r = await window.api.loadAnnotations({
      imagePath: ${JSON.stringify(folder)} + "\\\\عکس_00.jpg",
      classes: ["person","car"], format: "YOLO", outputDir: "",
    });
    return r.map(b => b.cls);
  })()
`);
check(boxCls.includes("unknown_7"), "the out-of-range index loads as unknown_7", boxCls);

const saveRes = await evaluate(`
  (async () => {
    const p = ${JSON.stringify(folder)} + "\\\\عکس_00.jpg";
    const r = await window.api.loadAnnotations({ imagePath: p, classes: ["person","car"], format: "YOLO", outputDir: "" });
    const res = await window.api.saveAnnotations({
      imagePath: p, annotations: r, classes: ["person","car"], format: "YOLO", outputDir: "",
    });
    const back = await window.api.loadAnnotations({ imagePath: p, classes: ["person","car"], format: "YOLO", outputDir: "" });
    return { dropped: res.dropped, before: r.length, after: back.length, clss: back.map(b => b.cls) };
  })()
`);
check(saveRes.before === saveRes.after,
  `round-trip through the real IPC keeps every box (${saveRes.before} -> ${saveRes.after})`, saveRes);
check(saveRes.clss.includes("unknown_7"), "unknown_7 is still there after saving", saveRes.clss);
check(saveRes.dropped.length === 0, "nothing reported dropped", saveRes.dropped);

console.log("\n\x1b[1m\x1b[33m▶ Persian path handling\x1b[0m");
const persian = await evaluate(`
  (() => {
    const names = [...document.querySelectorAll(".file-name")].map(e => e.textContent);
    return { first: names[0], anyMojibake: names.some(n => /Ø|Ù|â€/.test(n)) };
  })()
`);
check(/عکس/.test(persian.first || ""), "Persian file names render correctly", persian);
check(!persian.anyMojibake, "no mojibake in the file list");

console.log("\n\x1b[1m\x1b[33m▶ No renderer errors\x1b[0m");
const errs = logs.filter(l => l.startsWith("error"));
check(errs.length === 0, "renderer console is clean", errs.slice(0, 5));

console.log(`\n\x1b[1m${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed.\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);
