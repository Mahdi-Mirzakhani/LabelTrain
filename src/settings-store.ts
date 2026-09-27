// User preferences persisted in localStorage. Survives app restart.

import type { AnnotationFormat, Density, LangCode, ObbSaveMode, ThemeMode } from "./types";

const KEY = "labelstudio.settings.v1";

export interface Settings {
  theme: ThemeMode;
  density: Density;
  lang: LangCode;
  fmt: AnnotationFormat;
  device: "cpu" | "gpu";
  outputDir: string;
  seenOnboarding: boolean;
  /** Oriented-box mode: rotatable boxes on the canvas. Off = the classic tool. */
  obb: boolean;
  /** Which label files OBB mode writes. Ignored entirely while `obb` is off. */
  obbSave: ObbSaveMode;
}

const DEFAULTS: Settings = {
  theme: "dark",
  density: "comfortable",
  lang: "en",
  fmt: "YOLO",
  device: "gpu",
  outputDir: "",
  seenOnboarding: false,
  // Off by default: an existing project must keep behaving exactly as it did
  // before this feature landed until its owner opts in.
  obb: false,
  // When they do opt in, write both sets — the rotated dataset for `yolo obb
  // train` and the upright one for ordinary detection — so neither is a
  // surprise later. `loadSettings` merges over DEFAULTS, so a settings blob
  // saved by an older build picks these up without a migration.
  obbSave: "both",
};

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* localStorage full or disabled — silently ignore */
  }
}

export function resetSettings(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}
