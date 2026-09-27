// ============================================================
//  License system — crypto primitives
// ============================================================
//  Pure Node built-ins (no extra dependencies). Ed25519 verify,
//  canonical JSON, stable machine fingerprint, and a compact
//  base64url codec for license keys.
// ============================================================

import crypto from "node:crypto";
import os from "node:os";

/**
 * Deterministic JSON: object keys sorted recursively so that the
 * server and client serialize the same payload to the exact same
 * bytes before signing / verifying.
 */
export function canonicalJSON(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Verify an Ed25519 signature (base64) over the canonical JSON of `payload`.
 * Returns false on any malformed input rather than throwing.
 */
export function verifySignature(
  payload: unknown,
  signatureB64: string,
  publicKeyPem: string,
): boolean {
  try {
    const data = Buffer.from(canonicalJSON(payload), "utf-8");
    const sig = Buffer.from(signatureB64, "base64");
    if (sig.length === 0) return false;
    // For Ed25519 the algorithm argument must be null.
    return crypto.verify(null, data, publicKeyPem, sig);
  } catch {
    return false;
  }
}

/**
 * Stable, privacy-preserving machine fingerprint. Combines hostname,
 * platform/arch, CPU model and the first non-internal MAC address,
 * then hashes — so we never expose raw hardware identifiers. Truncated
 * to 20 hex chars (80 bits) which is plenty to bind a license.
 */
export function machineId(): string {
  const parts = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()?.[0]?.model ?? "",
    firstMac(),
  ];
  return crypto
    .createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 20)
    .toUpperCase()
    .replace(/(.{4})/g, "$1-")
    .replace(/-$/, "");
}

function firstMac(): string {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (!ni.internal && ni.mac && ni.mac !== "00:00:00:00:00:00") return ni.mac;
    }
  }
  return "no-mac";
}

/** Encode any signed object as a compact, copy-pasteable license key. */
export function encodeKey(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64url");
}

/** Decode a license key back to its signed object, or null if malformed. */
export function decodeKey<T = unknown>(key: string): T | null {
  try {
    const json = Buffer.from(key.trim(), "base64url").toString("utf-8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
