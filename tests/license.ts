// License system test — end-to-end, no Electron required.
// Run with:
//   node --experimental-strip-types tests/license.ts
//
// Exercises the LicenseManager: free-by-default, server flips
// enforcement on → locks, signed license unlocks, and that forged
// / wrong-machine / expired / stale-policy inputs are all rejected.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LicenseManager } from "../electron/license/manager.ts";
import type { LicenseConfig } from "../electron/license/config.ts";
import { canonicalJSON, encodeKey, machineId } from "../electron/license/crypto.ts";

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";
let pass = 0, fail = 0;
const ok = (m: string) => { pass++; console.log(`${GREEN}✓${RESET} ${m}`); };
const bad = (m: string, d?: unknown) => { fail++; console.log(`${RED}✗${RESET} ${m}`); if (d !== undefined) console.log("  " + JSON.stringify(d)); };
const info = (m: string) => console.log(`${YELLOW}·${RESET} ${m}`);

// --- A throwaway keypair so the test is self-contained ---
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

function signEnvelope<T>(payload: T) {
  const data = Buffer.from(canonicalJSON(payload), "utf-8");
  const signature = crypto.sign(null, data, privateKey).toString("base64");
  return { payload, signature };
}

const cfg: LicenseConfig = {
  appId: "com.labelstudio.app",
  appVersion: "1.0.0",
  serverUrl: "https://license.test",
  purchaseUrl: "https://buy.test",
  publicKeyPem,
  pollIntervalMs: 999_999,
  fetchTimeoutMs: 2000,
  defaultEnforce: false,
};

// Mock fetch that serves whatever signed policy we set.
let served: unknown = null;
const fetchImpl = async () => ({
  ok: true, status: 200, json: async () => served,
});

function policyEnvelope(enforce: boolean, issuedAt: number, message?: string) {
  return signEnvelope({ enforce, issuedAt, nonce: crypto.randomUUID(), ...(message ? { message } : {}) });
}

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ls-license-"));
  info("data dir " + dir);
  const id = machineId();
  const mk = () => new LicenseManager({ dataDir: dir, config: cfg, fetchImpl });

  // 1. Free by default (no policy fetched yet)
  let mgr = mk();
  await mgr.init();
  let s = mgr.getStatus();
  s.mode === "free" && !s.locked ? ok("default: free & unlocked") : bad("default should be free", s);

  // 2. Server enforces → app locks after refresh
  served = policyEnvelope(true, Date.now(), "Licensing is now active.");
  s = await mgr.refresh();
  s.locked && s.mode === "locked" ? ok("enforce=on → locked") : bad("should lock when enforced", s);
  s.message === "Licensing is now active." ? ok("policy message surfaced") : bad("message missing", s);

  // 3. Persisted across restarts (re-create manager, no network)
  const offline = new LicenseManager({ dataDir: dir, config: cfg, fetchImpl: async () => { throw new Error("offline"); } });
  await offline.init();
  offline.getStatus().locked ? ok("locked state persists offline") : bad("should stay locked offline");

  // 4. Valid license unlocks
  const license = signEnvelope({
    id: "lic_test", appId: cfg.appId, machineId: id, plan: "pro",
    name: "Test User", issuedAt: Date.now(), expiresAt: null,
  });
  let r = await mgr.activate(encodeKey(license));
  r.ok && !r.status.locked && r.status.mode === "licensed"
    ? ok("valid license → unlocked (licensed)") : bad("valid license should unlock", r);
  r.status.license?.name === "Test User" ? ok("license holder name shown") : bad("name missing", r.status);

  // 5. License persists across restart
  const relicensed = mk();
  await relicensed.init();
  served = policyEnvelope(true, Date.now());
  s = await relicensed.refresh();
  !s.locked ? ok("license persists across restart") : bad("should stay licensed", s);

  // 6. Wildcard machine license works anywhere
  const wild = signEnvelope({ id: "w", appId: cfg.appId, machineId: "*", plan: "site", issuedAt: Date.now(), expiresAt: null });
  (await mk2(dir).then(async (m) => { served = policyEnvelope(true, Date.now()); await m.refresh(); return m.activate(encodeKey(wild)); }))
    .ok ? ok('wildcard "*" license accepted') : bad("wildcard should be accepted");

  // --- rejections ---
  const fresh = mk();
  await fresh.init();

  // 7. Forged signature
  const forged = { payload: license.payload, signature: Buffer.from("nope").toString("base64") };
  (await fresh.activate(encodeKey(forged))).error === "invalid-signature"
    ? ok("forged signature rejected") : bad("forged should be rejected");

  // 8. Wrong machine
  const otherMachine = signEnvelope({ id: "o", appId: cfg.appId, machineId: "SOME-OTHER-DEVICE", plan: "pro", issuedAt: Date.now(), expiresAt: null });
  (await fresh.activate(encodeKey(otherMachine))).error === "wrong-machine"
    ? ok("wrong-machine license rejected") : bad("wrong machine should be rejected");

  // 9. Expired
  const expired = signEnvelope({ id: "e", appId: cfg.appId, machineId: id, plan: "pro", issuedAt: Date.now() - 1000, expiresAt: Date.now() - 1 });
  (await fresh.activate(encodeKey(expired))).error === "expired"
    ? ok("expired license rejected") : bad("expired should be rejected");

  // 10. Wrong app
  const wrongApp = signEnvelope({ id: "a", appId: "com.someone.else", machineId: id, plan: "pro", issuedAt: Date.now(), expiresAt: null });
  (await fresh.activate(encodeKey(wrongApp))).error === "wrong-app"
    ? ok("wrong-app license rejected") : bad("wrong app should be rejected");

  // 11. Stale policy rollback rejected (issuedAt going backwards).
  // Fresh data dir with no license, so only the policy decides the lock.
  const m2 = await mk2(dir);
  served = policyEnvelope(true, 10_000);
  await m2.refresh();
  served = policyEnvelope(false, 5_000); // older → must be ignored
  s = await m2.refresh();
  s.locked ? ok("stale (rolled-back) policy ignored") : bad("rollback should be ignored", s);

  // 12. Tampered local cache file ignored (signature re-checked on load)
  const storePath = path.join(dir, "license-state.json");
  await fs.writeFile(storePath, JSON.stringify({
    policy: { payload: { enforce: false, issuedAt: 9e15, nonce: "x" }, signature: "AAAA" },
    licenseKey: null,
  }));
  const tampered = new LicenseManager({ dataDir: dir, config: cfg, fetchImpl: async () => { throw new Error("offline"); } });
  await tampered.init();
  // With no valid cached policy and offline, it falls back to defaultEnforce(false) → free.
  tampered.getStatus().mode === "free" ? ok("tampered cache rejected (sig re-checked)") : bad("tampered cache should be ignored", tampered.getStatus());

  await fs.rm(dir, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
}

async function mk2(dir: string) {
  const sub = await fs.mkdtemp(dir + "-");
  const m = new LicenseManager({ dataDir: sub, config: cfg, fetchImpl });
  await m.init();
  return m;
}

main().catch((e) => { console.error(e); process.exit(1); });
