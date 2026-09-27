// ============================================================
//  License system — manager
// ============================================================
//  Owns the gate decision. Loads a cached signed policy + license
//  from disk, re-verifies their signatures on every load (never
//  trusts unsigned cached data), fetches fresh policy when online,
//  and computes the LicenseStatus the renderer uses to lock/unlock.
//
//  Everything here is testable without Electron: the constructor
//  takes a data directory and (optionally) a fetch implementation.
// ============================================================

import fs from "node:fs/promises";
import path from "node:path";

import { LICENSE_CONFIG, type LicenseConfig } from "./config.ts";
import { decodeKey, machineId, verifySignature } from "./crypto.ts";
import type {
  ActivateResult,
  LicensePayload,
  LicenseStatus,
  PolicyPayload,
  SignedLicense,
  SignedPolicy,
} from "./types.ts";

const STORE_FILE = "license-state.json";

interface PersistedState {
  policy: SignedPolicy | null;
  licenseKey: string | null;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export class LicenseManager {
  private cfg: LicenseConfig;
  private dataDir: string;
  private fetchImpl: FetchLike;

  private cachedPolicy: SignedPolicy | null = null;
  private licenseKey: string | null = null;
  private policyCheckedAt: number | null = null;
  private lastError: string | undefined;
  private id: string;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts?: {
    dataDir?: string;
    config?: LicenseConfig;
    fetchImpl?: FetchLike;
  }) {
    this.cfg = opts?.config ?? LICENSE_CONFIG;
    this.dataDir = opts?.dataDir ?? ".";
    // global fetch exists in Node 18+ and in the Electron main process.
    this.fetchImpl = opts?.fetchImpl ?? ((url, init) => fetch(url, init as RequestInit));
    this.id = machineId();
  }

  private storePath(): string {
    return path.join(this.dataDir, STORE_FILE);
  }

  /** Load persisted state from disk and re-verify signatures. */
  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.storePath(), "utf-8");
      const parsed = JSON.parse(raw) as PersistedState;
      // Only accept a cached policy whose signature still checks out.
      if (parsed.policy && this.verifyPolicy(parsed.policy)) {
        this.cachedPolicy = parsed.policy;
      }
      if (typeof parsed.licenseKey === "string") {
        this.licenseKey = parsed.licenseKey;
      }
    } catch {
      /* no state yet — fine */
    }
  }

  private async persist(): Promise<void> {
    const state: PersistedState = {
      policy: this.cachedPolicy,
      licenseKey: this.licenseKey,
    };
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.writeFile(this.storePath(), JSON.stringify(state, null, 2), "utf-8");
    } catch (err) {
      console.warn("[license] could not persist state:", err);
    }
  }

  private verifyPolicy(p: SignedPolicy): boolean {
    return (
      !!p && !!p.payload && typeof p.signature === "string" &&
      verifySignature(p.payload, p.signature, this.cfg.publicKeyPem)
    );
  }

  /** The policy currently in effect (verified cache, or the built-in default). */
  private activePolicy(): PolicyPayload {
    if (this.cachedPolicy && this.verifyPolicy(this.cachedPolicy)) {
      return this.cachedPolicy.payload;
    }
    return { enforce: this.cfg.defaultEnforce, issuedAt: 0, nonce: "default" };
  }

  /** Decode + fully validate the stored license against this machine. */
  private validLicense(): LicensePayload | null {
    if (!this.licenseKey) return null;
    const decoded = decodeKey<SignedLicense>(this.licenseKey);
    if (!decoded || !decoded.payload || typeof decoded.signature !== "string") return null;
    const lic = decoded.payload;
    if (!verifySignature(lic, decoded.signature, this.cfg.publicKeyPem)) return null;
    if (lic.appId !== this.cfg.appId) return null;
    if (lic.machineId !== "*" && lic.machineId !== this.id) return null;
    if (lic.expiresAt != null && Date.now() > lic.expiresAt) return null;
    return lic;
  }

  /** Compute the gate state handed to the renderer. */
  getStatus(): LicenseStatus {
    const policy = this.activePolicy();
    const versionTooOld =
      !!policy.minVersion && cmpVersion(this.cfg.appVersion, policy.minVersion) < 0;
    const enforce = policy.enforce || versionTooOld;

    const lic = this.validLicense();
    const licenseInfo = lic
      ? { plan: lic.plan, name: lic.name, expiresAt: lic.expiresAt }
      : null;

    if (!enforce) {
      return {
        locked: false, enforce: false, mode: "free",
        machineId: this.id, license: licenseInfo,
        policyCheckedAt: this.policyCheckedAt, lastError: this.lastError,
      };
    }
    if (lic) {
      return {
        locked: false, enforce: true, mode: "licensed",
        machineId: this.id, license: licenseInfo,
        message: policy.message, policyCheckedAt: this.policyCheckedAt,
        lastError: this.lastError,
      };
    }
    return {
      locked: true, enforce: true, mode: "locked",
      machineId: this.id, license: null,
      message: versionTooOld
        ? policy.message ?? "A newer version is required."
        : policy.message,
      policyCheckedAt: this.policyCheckedAt, lastError: this.lastError,
    };
  }

  /** Fetch a fresh signed policy from the server (only meaningful when online). */
  async refresh(): Promise<LicenseStatus> {
    const url =
      `${this.cfg.serverUrl}/api/license/policy` +
      `?appId=${encodeURIComponent(this.cfg.appId)}` +
      `&machineId=${encodeURIComponent(this.id)}` +
      `&v=${encodeURIComponent(this.cfg.appVersion)}`;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.fetchTimeoutMs);
    try {
      const res = await this.fetchImpl(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`server responded ${res.status}`);
      const json = (await res.json()) as SignedPolicy;
      if (!this.verifyPolicy(json)) {
        throw new Error("policy signature failed verification");
      }
      // Reject rollback: never accept a policy older than the one we hold.
      const current = this.cachedPolicy?.payload.issuedAt ?? -1;
      if (json.payload.issuedAt < current) {
        throw new Error("ignored stale policy (issuedAt went backwards)");
      }
      this.cachedPolicy = json;
      this.policyCheckedAt = Date.now();
      this.lastError = undefined;
      await this.persist();
    } catch (err) {
      // Offline or server error → keep the last cached policy. This is the
      // whole point: a machine only locks once it actually reaches the
      // server and learns enforcement was turned on.
      this.lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }
    return this.getStatus();
  }

  /** Validate + store a license key entered by the user (offline-capable). */
  async activate(key: string): Promise<ActivateResult> {
    const decoded = decodeKey<SignedLicense>(key);
    if (!decoded || !decoded.payload || typeof decoded.signature !== "string") {
      return { ok: false, error: "malformed", status: this.getStatus() };
    }
    const lic = decoded.payload;
    if (!verifySignature(lic, decoded.signature, this.cfg.publicKeyPem)) {
      return { ok: false, error: "invalid-signature", status: this.getStatus() };
    }
    if (lic.appId !== this.cfg.appId) {
      return { ok: false, error: "wrong-app", status: this.getStatus() };
    }
    if (lic.machineId !== "*" && lic.machineId !== this.id) {
      return { ok: false, error: "wrong-machine", status: this.getStatus() };
    }
    if (lic.expiresAt != null && Date.now() > lic.expiresAt) {
      return { ok: false, error: "expired", status: this.getStatus() };
    }
    this.licenseKey = key.trim();
    await this.persist();
    return { ok: true, status: this.getStatus() };
  }

  /** Remove the stored license (e.g. "deactivate" / move to another machine). */
  async clearLicense(): Promise<LicenseStatus> {
    this.licenseKey = null;
    await this.persist();
    return this.getStatus();
  }

  /** Begin periodic background refreshes. `onChange` fires only when locked state flips. */
  startPolling(onChange?: (status: LicenseStatus) => void): void {
    if (this.pollTimer) return;
    let lastLocked = this.getStatus().locked;
    const tick = async () => {
      const status = await this.refresh();
      if (status.locked !== lastLocked) {
        lastLocked = status.locked;
        onChange?.(status);
      }
    };
    this.pollTimer = setInterval(tick, this.cfg.pollIntervalMs);
    // Don't keep the event loop alive just for the poll.
    (this.pollTimer as { unref?: () => void }).unref?.();
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

/** Semantic-ish version compare. Returns -1 / 0 / 1. */
function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
