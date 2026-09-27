// Quick one-off: evaluate an expression in the live app page and print the result.
//   node tests/cdp-eval.mjs "EXPRESSION"
const CDP = "http://127.0.0.1:9222";
const expr = process.argv[2] || "1+1";
const list = await (await fetch(CDP + "/json/list")).json();
const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl && (t.url.includes("5173") || t.title === "LabelStudio"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable");
const m = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
if (m.result?.exceptionDetails) console.log("EXCEPTION:", JSON.stringify(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails, null, 2));
else console.log("RESULT:", JSON.stringify(m.result?.result?.value, null, 2));
process.exit(0);
