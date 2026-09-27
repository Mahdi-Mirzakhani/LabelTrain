// ============================================================
//  License system — shared types
// ============================================================

/** What the server signs to control enforcement. */
export interface PolicyPayload {
  /** When true, the app requires a valid license. */
  enforce: boolean;
  /** Optional message shown on the lock screen (e.g. why it locked). */
  message?: string;
  /** Optional minimum app version; older builds are treated as locked. */
  minVersion?: string;
  /** Epoch ms the policy was issued. Used to ignore replayed older policies. */
  issuedAt: number;
  /** Random value so each issuance is unique. */
  nonce: string;
}

/** A signed envelope: base64 signature over the canonical JSON of `payload`. */
export interface Signed<T> {
  payload: T;
  /** Base64 Ed25519 signature over canonicalJSON(payload). */
  signature: string;
}

/** What the server signs to grant a license to a paying user. */
export interface LicensePayload {
  /** Unique license id (for your records / revocation). */
  id: string;
  /** Must match LICENSE_CONFIG.appId. */
  appId: string;
  /** Machine this license is bound to, or "*" for any machine. */
  machineId: string;
  /** Plan name, e.g. "pro", "team". */
  plan: string;
  /** Buyer display name (shown in the UI). */
  name?: string;
  issuedAt: number;
  /** Epoch ms expiry, or null for a perpetual license. */
  expiresAt: number | null;
}

export type SignedLicense = Signed<LicensePayload>;
export type SignedPolicy = Signed<PolicyPayload>;

/** Computed gate state handed to the renderer. */
export interface LicenseStatus {
  /** True → renderer must show the lock screen and block the app. */
  locked: boolean;
  /** Whether the active policy currently enforces licensing. */
  enforce: boolean;
  /** "free" = not enforced · "licensed" = enforced + valid license · "locked" = enforced + no license. */
  mode: "free" | "licensed" | "locked";
  /** Stable per-machine fingerprint. Shown to the user; used for binding. */
  machineId: string;
  /** Message from the policy (reason for the lock, etc.). */
  message?: string;
  /** Details of the active license, if any. */
  license: { plan: string; name?: string; expiresAt: number | null } | null;
  /** Epoch ms the policy was last successfully fetched, or null. */
  policyCheckedAt: number | null;
  /** Last activation / fetch error, if any (for diagnostics). */
  lastError?: string;
}

export interface ActivateResult {
  ok: boolean;
  error?: string;
  status: LicenseStatus;
}
