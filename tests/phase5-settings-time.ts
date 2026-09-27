// Phase 5 — Settings persistence + relative-time formatting.
//
//   node --experimental-strip-types tests/phase5-settings-time.ts
//
// settings-store reads window.localStorage lazily (inside its functions), so we
// install a fake window BEFORE calling them. ipc.ts only touches window at
// module load (already evaluated by the hoisted import, when window is still
// undefined), so it is unaffected.

import { phase, check, eq, report } from "./_assert.ts";
import { imageModifiedTime } from "../src/ipc.ts";
import { loadSettings, saveSettings, resetSettings, type Settings } from "../src/settings-store.ts";

// --- fake localStorage / window ---
const store: Record<string, string> = {};
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  },
};

phase("loadSettings returns defaults when nothing is stored");
{
  const s = loadSettings();
  eq(s.theme, "dark", "default theme is dark");
  eq(s.device, "gpu", "default device is gpu");
  eq(s.fmt, "YOLO", "default format is YOLO");
  eq(s.seenOnboarding, false, "default seenOnboarding is false");
  // OBB mode must stay off out of the box: an existing project has to behave
  // exactly as it did before oriented boxes existed until its owner opts in.
  eq(s.obb, false, "OBB mode is off by default");
  eq(s.obbSave, "both", "OBB save mode defaults to writing both label sets");
}

phase("saveSettings -> loadSettings round-trips");
{
  const next: Settings = {
    theme: "light", density: "compact", lang: "fa", fmt: "COCO",
    device: "cpu", outputDir: "/out", seenOnboarding: true,
    obb: true, obbSave: "obb",
  };
  saveSettings(next);
  eq(loadSettings(), next, "all fields persist and reload");
}

phase("loadSettings merges partial/old saved data over defaults");
{
  store["labelstudio.settings.v1"] = JSON.stringify({ theme: "light" }); // missing other keys
  const s = loadSettings();
  eq(s.theme, "light", "stored field wins");
  eq(s.device, "gpu", "missing field falls back to default (no undefined)");
}

phase("loadSettings tolerates corrupt JSON");
{
  store["labelstudio.settings.v1"] = "{not valid json";
  const s = loadSettings();
  eq(s.theme, "dark", "corrupt store => defaults, no throw");
}

phase("resetSettings clears the store");
{
  saveSettings({ theme: "light", density: "compact", lang: "fa", fmt: "CSV", device: "cpu", outputDir: "", seenOnboarding: true });
  resetSettings();
  eq(loadSettings().theme, "dark", "after reset, defaults return");
}

phase("imageModifiedTime relative formatting");
{
  const now = Date.now();
  eq(imageModifiedTime(0), "—", "0 / unknown => em dash");
  eq(imageModifiedTime(now - 30_000), "just now", "30s ago => just now");
  eq(imageModifiedTime(now - 5 * 60_000), "5m", "5 min ago => 5m");
  eq(imageModifiedTime(now - 3 * 3600_000), "3h", "3h ago => 3h");
  eq(imageModifiedTime(now - 2 * 86_400_000), "2d", "2 days ago => 2d");
  const old = imageModifiedTime(now - 60 * 86_400_000);
  check(old !== "—" && !/^\d+[mhd]$/.test(old) && old !== "just now", "old dates => a locale date string", old);
}

report();
