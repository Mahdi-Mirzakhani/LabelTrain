// ============================================================
//  License server — shared crypto helpers (Node, no deps)
// ============================================================
//  MUST stay byte-compatible with electron/license/crypto.ts so
//  signatures produced here verify in the app.
// ============================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KEYS_DIR = path.join(HERE, "keys");

/** Deterministic JSON — keys sorted recursively. Mirrors the client. */
export function canonicalJSON(value) {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

export function loadPrivateKey() {
  const p = path.join(KEYS_DIR, "private.pem");
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${p}. Run:  node server/keygen.mjs`);
  }
  return fs.readFileSync(p, "utf-8");
}

export function loadPublicKey() {
  return fs.readFileSync(path.join(KEYS_DIR, "public.pem"), "utf-8");
}

/** Sign a payload → { payload, signature } envelope the app understands. */
export function sign(payload, privateKeyPem = loadPrivateKey()) {
  const data = Buffer.from(canonicalJSON(payload), "utf-8");
  const signature = crypto.sign(null, data, privateKeyPem).toString("base64");
  return { payload, signature };
}

/** Encode a signed object as the compact base64url license key. */
export function encodeKey(obj) {
  return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64url");
}

export function verify(payload, signatureB64, publicKeyPem = loadPublicKey()) {
  try {
    const data = Buffer.from(canonicalJSON(payload), "utf-8");
    return crypto.verify(null, data, publicKeyPem, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}
