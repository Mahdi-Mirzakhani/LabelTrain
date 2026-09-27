// Live end-to-end driver for the running Electron app over the Chrome DevTools
// Protocol. Seeds a recent project, opens it (no native dialog), switches to the
// Box tool, draws boxes by dispatching real pointer events, and asserts that one
// drag creates exactly one box — proving the StrictMode duplicate bug is fixed.
//
//   node tests/cdp-drive.mjs

const CDP = "http://127.0.0.1:9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(CDP + "/json/list")).json();
      const page = list.find((t) =>
        t.type === "page" && t.webSocketDebuggerUrl &&
        (t.url.includes("5173") || t.title === "LabelStudio"));
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error("No CDP page target on " + CDP);
}

function makeClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const ready = new Promise((res) => { ws.onopen = res; });
  const send = (method, params = {}) => new Promise((res) => {
    const myId = ++id;
    pending.set(myId, res);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  return { ready, send, ws };
}

async function main() {
  const target = await findPageTarget();
  const { ready, send } = makeClient(target.webSocketDebuggerUrl);
  await ready;
  await send("Runtime.enable");
  await send("Page.enable");

  const evaluate = async (expression) => {
    const m = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (m.result?.exceptionDetails) {
      throw new Error("page error: " + JSON.stringify(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails));
    }
    return m.result?.result?.value;
  };
  const poll = async (expression, label, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = await evaluate(expression);
      if (v) return v;
      await sleep(300);
    }
    throw new Error("timeout waiting for: " + (label || expression));
  };

  let pass = 0, fail = 0;
  const ok = (m) => { pass++; console.log("  \x1b[32m✓\x1b[0m " + m); };
  const bad = (m, d) => { fail++; console.log("  \x1b[31m✗\x1b[0m " + m + (d !== undefined ? "  " + JSON.stringify(d) : "")); };

  console.log("\n\x1b[1m\x1b[33m▶ Live app — open project & draw boxes\x1b[0m");

  await poll("!!document.querySelector('#root') && document.querySelector('#root').children.length>0", "app mount");
  ok("app mounted");

  // Onboarding -> Projects (click "Skip" if present)
  await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Skip');if(b)b.click();return !!b;})()`);
  await poll("!!document.querySelector('.pm-card')", "projects screen");
  ok("projects screen shown");

  // The "New project" card renders immediately; the seeded recent project only
  // appears after the async recents load — wait for it specifically.
  await poll("!!document.querySelector('.pm-card:not(.pm-new)')", "recent project card");
  const clickedCard = await evaluate(`(()=>{const c=document.querySelector('.pm-card:not(.pm-new)');if(c){c.click();return true;}return false;})()`);
  if (!clickedCard) { bad("could not find a recent project card"); return finish(); }
  ok("recent project card clicked");

  // Wait for the canvas to render a real image.
  await poll("!!document.querySelector('.canvas-img-wrap')", "canvas stage (image loaded)");
  ok("project opened, canvas visible");

  // Switch to Box tool.
  await evaluate(`(()=>{const b=document.querySelector('button[aria-label=\"Box\"]');if(b)b.click();return !!b;})()`);
  await sleep(200);
  ok("Box tool selected");

  // Inject a drawing helper that dispatches real pointer events over the canvas.
  await evaluate(`
    window.__draw = (a,b,c,d) => {
      const wrap = document.querySelector('.canvas-img-wrap');
      const stage = document.querySelector('.canvas-stage');
      const r = wrap.getBoundingClientRect();
      const pt = (nx,ny) => ({ clientX: r.left + nx*r.width, clientY: r.top + ny*r.height });
      const base = (p, extra) => Object.assign({ bubbles:true, cancelable:true, button:0, buttons:1, pointerId:1, pointerType:'mouse', isPrimary:true }, p, extra);
      const p1 = pt(a,b), p2 = pt(c,d);
      stage.dispatchEvent(new PointerEvent('pointerdown', base(p1)));
      window.dispatchEvent(new PointerEvent('pointermove', base(p2)));
      window.dispatchEvent(new PointerEvent('pointermove', base(p2)));
      window.dispatchEvent(new PointerEvent('pointerup', base(p2, { buttons:0 })));
    };
    true;
  `);

  const countBoxes = () => evaluate("document.querySelectorAll('.canvas-img-wrap .box').length");
  const baseline = await countBoxes();
  console.log("  · baseline boxes on image: " + baseline);

  // Draw #1
  await evaluate("window.__draw(0.15,0.15,0.55,0.55)");
  await sleep(400);
  const after1 = await countBoxes();
  if (after1 === baseline + 1) ok(`one drag -> exactly one new box (was ${baseline}, now ${after1})`);
  else bad(`expected ${baseline + 1} boxes after one drag, got ${after1} (duplicate bug if ${baseline + 2})`, { baseline, after1 });

  // Draw #2
  await evaluate("window.__draw(0.6,0.2,0.85,0.6)");
  await sleep(400);
  const after2 = await countBoxes();
  if (after2 === baseline + 2) ok(`second drag -> one more box (now ${after2})`);
  else bad(`expected ${baseline + 2} boxes after two drags, got ${after2}`, { after2 });

  // Capture a screenshot of the live window for the user.
  try {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    if (shot.result?.data) {
      const fs = await import("node:fs");
      const out = "tests/_live-shot.png";
      fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
      console.log("  · screenshot saved to back/" + out);
    }
  } catch (e) { console.log("  · screenshot skipped: " + e.message); }

  function finish() {
    console.log(`\n\x1b[1m${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed.\x1b[0m`);
    process.exit(fail === 0 ? 0 : 1);
  }
  finish();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(2); });
