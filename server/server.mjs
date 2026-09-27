// ============================================================
//  Reference license server (Node built-in http, no deps)
// ============================================================
//  Run:   node server/server.mjs           (PORT defaults to 8787)
//         ADMIN_TOKEN=secret node server/server.mjs
//
//  Endpoints:
//    GET  /api/license/policy   → the signed policy the app fetches.
//                                 Reads server/policy.json (your switch).
//    GET  /admin                → tiny status page.
//    POST /admin/enforce        → flip licensing on/off.
//                                 body: { "enforce": true,
//                                         "message": "...", "minVersion": "" }
//                                 header: x-admin-token: <ADMIN_TOKEN>
//
//  THE WHOLE LICENSING SWITCH is server/policy.json. Today it says
//  enforce:false → every app stays free. Months later, POST to
//  /admin/enforce (or just edit policy.json) to set enforce:true and
//  every app locks the next time its machine is online.
//
//  This is a REFERENCE: put it behind HTTPS (a reverse proxy) and a
//  real admin auth before production. The private key must live only
//  on this server.
// ============================================================

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { HERE, sign } from "./lib.mjs";

const PORT = Number(process.env.PORT || 8787);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me";
const POLICY_PATH = path.join(HERE, "policy.json");

function readPolicy() {
  try {
    return JSON.parse(fs.readFileSync(POLICY_PATH, "utf-8"));
  } catch {
    return { enforce: false, message: "", minVersion: "" };
  }
}

function buildSignedPolicy() {
  const cfg = readPolicy();
  const payload = {
    enforce: !!cfg.enforce,
    issuedAt: Date.now(),
    nonce: crypto.randomUUID(),
  };
  if (cfg.message) payload.message = String(cfg.message);
  if (cfg.minVersion) payload.minVersion = String(cfg.minVersion);
  return sign(payload);
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}"); }
  catch { return {}; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/api/license/policy") {
    return json(res, 200, buildSignedPolicy());
  }

  if (req.method === "GET" && url.pathname === "/admin") {
    const cfg = readPolicy();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><meta charset=utf-8>
<title>LabelStudio license panel</title>
<body style="font-family:system-ui;max-width:560px;margin:40px auto">
<h2>LabelStudio — license switch</h2>
<p>Enforcement is currently:
   <b style="color:${cfg.enforce ? "#c00" : "#0a0"}">${cfg.enforce ? "ON (apps require a license)" : "OFF (free)"}</b></p>
<pre style="background:#f4f4f4;padding:12px;border-radius:8px">${JSON.stringify(cfg, null, 2)}</pre>
<p>To flip it, POST to <code>/admin/enforce</code> with header
   <code>x-admin-token</code> and JSON body, or just edit
   <code>server/policy.json</code> and the change is live immediately.</p>
</body>`);
  }

  if (req.method === "POST" && url.pathname === "/admin/enforce") {
    if ((req.headers["x-admin-token"] || "") !== ADMIN_TOKEN) {
      return json(res, 401, { error: "bad admin token" });
    }
    const body = await readBody(req);
    const next = {
      enforce: !!body.enforce,
      message: typeof body.message === "string" ? body.message : "",
      minVersion: typeof body.minVersion === "string" ? body.minVersion : "",
    };
    fs.writeFileSync(POLICY_PATH, JSON.stringify(next, null, 2) + "\n");
    return json(res, 200, { ok: true, policy: next });
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`License server on http://localhost:${PORT}`);
  console.log(`  policy:  GET  /api/license/policy`);
  console.log(`  panel:   GET  /admin`);
  console.log(`  switch:  POST /admin/enforce   (x-admin-token: ${ADMIN_TOKEN})`);
});
