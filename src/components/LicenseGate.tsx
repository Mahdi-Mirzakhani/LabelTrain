import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { t, isRTL } from "../i18n";
import { inElectron } from "../ipc";
import type { LicenseStatus } from "../electron-api.d";

// Maps the manager's error codes to a translatable, human message.
function errorMessage(code?: string): string {
  switch (code) {
    case "malformed": return t("This license key is not readable. Copy it again from your account.");
    case "invalid-signature": return t("This license key is invalid or has been altered.");
    case "wrong-app": return t("This license belongs to a different product.");
    case "wrong-machine": return t("This license is locked to another device.");
    case "expired": return t("This license has expired.");
    default: return t("Activation failed. Check the key and try again.");
  }
}

interface LicenseGateProps {
  status: LicenseStatus;
  onResolved: (status: LicenseStatus) => void;
}

/** Full-screen lock shown when the server has enforcement on and no valid license. */
export function LicenseGate({ status, onResolved }: LicenseGateProps) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const activate = useCallback(async () => {
    if (!inElectron || !key.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await window.api!.activateLicense(key.trim());
      if (res?.ok) onResolved(res.status);
      else setError(errorMessage(res?.error));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [key, onResolved]);

  const recheck = useCallback(async () => {
    if (!inElectron) return;
    setBusy(true); setError(null);
    try {
      const s = await window.api!.refreshLicense();
      onResolved(s);
      if (s.locked) setError(t("Still locked. The server has not registered a license for this device yet."));
    } finally {
      setBusy(false);
    }
  }, [onResolved]);

  const copyId = useCallback(() => {
    navigator.clipboard?.writeText(status.machineId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [status.machineId]);

  return (
    <div className="fullscreen" style={{ overflow: "auto" }}>
      <div className="ob-slide" style={{ maxWidth: 560, gap: "var(--sp-lg)" }}>
        <div style={{
          width: 88, height: 88, borderRadius: 24,
          background: "linear-gradient(135deg,var(--primary-hover),var(--primary-active))",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "var(--e3)",
        }}>
          <Icon name="lock" size={40} style={{ color: "#fff" }} />
        </div>

        <div className="t-display" style={{ textAlign: "center" }}>
          {t("Activate LabelStudio")}
        </div>
        <div className="t-body tsec" style={{ textAlign: "center", maxWidth: 460 }}>
          {status.message
            ? status.message
            : t("A license is now required to use this app. Enter your license key, or register on our website to get one.")}
        </div>

        {/* Device fingerprint — the user gives this when buying a machine-bound license */}
        <div className="card pad col gap-sm" style={{ width: "100%" }}>
          <span className="t-caption tsec">{t("Your device ID")}</span>
          <div className="row gap-sm" style={{ justifyContent: "space-between" }}>
            <span className="mono t-body-strong" style={{ wordBreak: "break-all" }}>
              {status.machineId}
            </span>
            <button className="iconbtn" onClick={copyId} title={t("Copy")}>
              <Icon name={copied ? "check" : "copy"} size={16} />
            </button>
          </div>
        </div>

        {/* License key entry */}
        <div className="col gap-sm" style={{ width: "100%" }}>
          <span className="t-caption tsec">{t("License key")}</span>
          <textarea
            className="field"
            style={{ width: "100%", minHeight: 92, padding: "10px 12px", resize: "vertical",
              fontFamily: "var(--font-mono, monospace)", fontSize: 12, direction: "ltr" }}
            placeholder={t("Paste your license key here")}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            spellCheck={false}
          />
          {error && (
            <div className="row gap-sm" style={{ color: "var(--danger)" }}>
              <Icon name="alert" size={15} />
              <span className="t-caption">{error}</span>
            </div>
          )}
        </div>

        <button className="btn btn-primary lg" style={{ width: "100%" }}
          onClick={activate} disabled={busy || !key.trim()}>
          <Icon name="key" size={16} />
          {busy ? t("Activating…") : t("Activate")}
        </button>

        <div className="row gap-md" style={{ width: "100%", justifyContent: "center" }}>
          <button className="btn btn-ghost" onClick={() => window.api?.openPurchasePage()}>
            <Icon name="globe" size={15} />{t("Buy / register a license")}
          </button>
          <button className="btn btn-ghost" onClick={recheck} disabled={busy}>
            <Icon name="refresh" size={15} />{t("Re-check")}
          </button>
        </div>

        {status.lastError && (
          <span className="t-caption tsec" style={{ opacity: 0.6, textAlign: "center" }}>
            {isRTL() ? "وضعیت اتصال: " : "Connection: "}{status.lastError}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Hook that loads license status, subscribes to background changes
 * (e.g. the server flips enforcement on while the app is open), and
 * exposes the current gate state to App.
 */
export function useLicense() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);

  useEffect(() => {
    if (!inElectron) {
      // Outside Electron there is no main process — never gate the dev browser.
      setStatus({
        locked: false, enforce: false, mode: "free",
        machineId: "browser", license: null, policyCheckedAt: null,
      });
      return;
    }
    let alive = true;
    window.api!.getLicenseStatus().then((s) => { if (alive) setStatus(s); });
    const off = window.api!.onLicenseChanged((s) => { if (alive) setStatus(s); });
    return () => { alive = false; off?.(); };
  }, []);

  return { status, setStatus };
}
