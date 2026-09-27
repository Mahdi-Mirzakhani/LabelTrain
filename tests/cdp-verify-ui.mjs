// Live verification of the interaction fixes (keyboard scoping, auto-label
// defaults, drop warning). Assumes a project is already open in the running
// app — run cdp-verify-fixes.mjs first.
//
//   node tests/cdp-verify-ui.mjs

const CDP = "http://127.0.0.1:9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  \x1b[32m✓\x1b[0m " + m); };
const bad = (m, d) => { fail++; console.log("  \x1b[31m✗\x1b[0m " + m); if (d !== undefined) console.log("    " + JSON.stringify(d)); };
const check = (c, m, d) => c ? ok(m) : bad(m, d);

const list = await (await fetch(CDP + "/json/list")).json();
const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl &&
  (t.url.includes("5173") || t.title === "LabelStudio"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expression) {
  const m = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || "eval failed");
  return m.result?.result?.value;
}
await send("Runtime.enable");

// Real key events through the input pipeline, not synthetic DOM events.
async function key(text, code, windowsVirtualKeyCode) {
  for (const type of ["keyDown", "keyUp"]) {
    await send("Input.dispatchKeyEvent", {
      type, text: type === "keyDown" ? text : undefined,
      key: text, code, windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
    });
  }
  await sleep(120);
}
const header = () => ev(`document.querySelector(".wsbar .t-caption")?.textContent || ""`);
const clickByText = (re) => ev(`
  (() => {
    const b = [...document.querySelectorAll("button")].find(x => new RegExp(${JSON.stringify(re)}).test(x.textContent || ""));
    if (!b) return false; b.click(); return true;
  })()
`);

console.log("\n\x1b[1m\x1b[33m▶ Navigation shortcuts work on the canvas\x1b[0m");
await ev(`document.body.click()`);
const before = await header();
await key("n", "KeyN", 78);
const afterN = await header();
check(before !== afterN, `"n" advances to the next image (${before} -> ${afterN})`);
await key("p", "KeyP", 80);
check((await header()) === before, `"p" goes back`);

console.log("\n\x1b[1m\x1b[33m▶ Shortcuts are suppressed while a drawer is open\x1b[0m");
check(await clickByText("Classes|کلاس‌ها"), "opened the Classes drawer");
await sleep(400);
const drawerOpen = await ev(`!!document.querySelector(".drawer")`);
check(drawerOpen, "drawer is on screen");
const posBefore = await header();
await key("n", "KeyN", 78);
await key("n", "KeyN", 78);
const posAfter = await header();
check(posBefore === posAfter,
  `"n" no longer navigates behind the drawer (${posBefore} == ${posAfter})`);

const boxesBefore = await ev(`document.querySelectorAll(".ann-row").length`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
await sleep(250);
const boxesAfter = await ev(`document.querySelectorAll(".ann-row").length`);
check(boxesBefore === boxesAfter, `Delete does not remove a box behind the drawer (${boxesBefore} == ${boxesAfter})`);

console.log("\n\x1b[1m\x1b[33m▶ Escape closes the drawer\x1b[0m");
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(400);
check(!(await ev(`!!document.querySelector(".drawer")`)), "Escape closed the Classes drawer");

console.log("\n\x1b[1m\x1b[33m▶ Shortcuts work again once the drawer is gone\x1b[0m");
const p2 = await header();
await key("n", "KeyN", 78);
check(p2 !== (await header()), "navigation is restored after closing");

console.log("\n\x1b[1m\x1b[33m▶ Auto-label keeps every class by default\x1b[0m");
check(await clickByText("Auto-label|لیبل خودکار"), "opened the Auto-label modal");
await sleep(400);
const autoState = await ev(`
  (() => {
    const modal = document.querySelector(".modal");
    if (!modal) return null;
    const checked = [...modal.querySelectorAll(".cbx.on")].length;
    return { checked, text: modal.textContent.slice(0, 400) };
  })()
`);
check(autoState !== null, "modal is on screen");
check(autoState && autoState.checked === 0,
  "no class is pre-selected, so nothing gets filtered out", autoState && { checked: autoState.checked });
check(autoState && /all the model finds|هرچه مدل پیدا کند/.test(autoState.text),
  "the UI says every detected class is kept");
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(300);

console.log("\n\x1b[1m\x1b[33m▶ Deleting a class warns before orphaning boxes\x1b[0m");
check(await clickByText("Classes|کلاس‌ها"), "reopened the Classes drawer");
await sleep(400);
// Intercept confirm() so the dialog does not block the automation, and record
// what it would have told the user.
await ev(`
  window.__confirmMsg = null;
  window.__origConfirm = window.confirm;
  window.confirm = (m) => { window.__confirmMsg = m; return false; };  // answer "no"
  true
`);
const classCountBefore = await ev(`document.querySelectorAll(".drawer .field").length`);
await ev(`
  (() => {
    // The trash button on the FIRST class row.
    const row = document.querySelector(".drawer-body .row");
    const btns = [...document.querySelectorAll(".drawer-body .row .iconbtn")];
    btns[btns.length - 1] && btns[0].click();
    const del = [...document.querySelectorAll(".drawer-body .row")][0]
      ?.querySelectorAll("button");
    del && del[del.length - 1] && del[del.length - 1].click();
    return true;
  })()
`);
await sleep(300);
const confirmMsg = await ev(`window.__confirmMsg`);
check(!!confirmMsg, "a confirmation was raised before deleting a class", confirmMsg);
check(/box|باکس/i.test(confirmMsg || ""),
  "the warning says how many boxes it would affect", confirmMsg);
const classCountAfter = await ev(`document.querySelectorAll(".drawer .field").length`);
check(classCountBefore === classCountAfter, "answering 'no' kept the class");
await ev(`window.confirm = window.__origConfirm; true`);

console.log(`\n\x1b[1m${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed.\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);
