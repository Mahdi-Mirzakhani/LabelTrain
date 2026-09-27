import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Segmented, Slider, Switch } from "./ui";
import { t, isRTL } from "../i18n";
import { COCO_CLASSES, PALETTE } from "../data";
import { filterCommands } from "../lib/search";
import { rebalanceRatios, type Ratios } from "../lib/split";
import type { ClassDef, CmdItem, NBox, ObbSaveMode, Toast } from "../types";
import type { SystemInfo } from "../electron-api.d";

// ============================================================
//  Command palette
// ============================================================

interface CmdPaletteProps {
  commands: CmdItem[];
  onClose: () => void;
  onRun: (c: CmdItem) => void;
}

export function CommandPalette({ commands, onClose, onRun }: CmdPaletteProps) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => setIdx(0), [q]);

  const filtered = useMemo(() => filterCommands(commands, q), [q, commands]);

  const groups = useMemo(() => {
    const g: Record<string, CmdItem[]> = {};
    filtered.forEach(c => { (g[c.group] = g[c.group] || []).push(c); });
    return g;
  }, [filtered]);

  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[idx]) { onRun(filtered[idx]); onClose(); }
    }
    else if (e.key === "Escape") onClose();
  };

  let running = -1;
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="cmdk" onMouseDown={e => e.stopPropagation()}>
        <div className="cmdk-input">
          <Icon name="search" size={18} style={{ color: "var(--text-tertiary)" }} />
          <input ref={inputRef} value={q}
            onChange={e => setQ(e.target.value)} onKeyDown={key}
            placeholder={t("Search commands, files, actions…")} />
          <span className="kbd">Esc</span>
        </div>
        <div className="cmdk-list">
          {filtered.length === 0 && (
            <div className="cmdk-item" style={{ justifyContent: "center", color: "var(--text-tertiary)" }}>
              {t("No results")}
            </div>
          )}
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="cmdk-group">{group}</div>
              {items.map(c => {
                running++;
                const on = running === idx;
                return (
                  <div key={c.id} className={"cmdk-item" + (on ? " on" : "")}
                    onMouseEnter={() => setIdx(filtered.indexOf(c))}
                    onClick={() => { onRun(c); onClose(); }}>
                    <Icon name={c.icon} size={16} className="ic" />
                    <span>{c.label}</span>
                    {c.keys && (
                      <span className="meta">
                        {c.keys.map((k, i) => <span key={i} className="kbd">{k}</span>)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Auto-label modal
// ============================================================

interface AutoLabelModalProps {
  onClose: () => void;
  classes: ClassDef[];
  imageCount: number;
  pushToast: (t: { icon?: string; msg: string }) => void;
  onRun: (cfg: { conf: number; iou: number; scope: "current" | "batch"; pickedClasses: string[]; addNew: boolean }) => void;
}

export function AutoLabelModal({
  onClose, classes, imageCount, pushToast, onRun,
}: AutoLabelModalProps) {
  const [conf, setConf] = useState(0.25);
  const [iou, setIou] = useState(0.45);
  const [scope, setScope] = useState<"current" | "batch">("current");
  const [addNew, setAddNew] = useState(true);
  const [search, setSearch] = useState("");
  // Empty = keep everything the model reports. This used to default to
  // person/car/truck/bus, which is a COCO-only guess: point the app at a model
  // trained on your own classes and every detection was filtered out, so the
  // run reported "done" with zero boxes and no explanation.
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  // The project's own class names come first — for a custom model those are the
  // names it will emit, and the COCO list below is irrelevant to it.
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of [...classes.map(c => c.name), ...COCO_CLASSES]) {
      const k = name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(name);
    }
    return out;
  }, [classes]);
  const list = candidates.filter(c => c.toLowerCase().includes(search.toLowerCase()));
  const toggle = (c: string) => setPicked(p => {
    const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n;
  });

  const run = () => {
    onRun({ conf, iou, scope, pickedClasses: Array.from(picked), addNew });
    onClose();
    pushToast({
      icon: "sparkles",
      msg: `Auto-labeling ${scope === "batch" ? `${imageCount} images` : "current image"}…`,
    });
  };

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="row gap-md">
            <span className="cbx" style={{ background: "var(--primary)", boxShadow: "none", color: "#fff" }}>
              <Icon name="sparkles" size={12} />
            </span>
            <div className="col">
              <span className="t-title">{t("Auto-label with YOLO")}</span>
              <span className="t-caption">YOLO model · COCO classes</span>
            </div>
          </div>
          <button className="iconbtn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-2xl)" }}>
          <div className="col" style={{ gap: "var(--sp-xl)" }}>
            <div className="col gap-md">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="t-label">{t("Confidence")}</span>
                <span className="mono tnum t-body">{conf.toFixed(2)}</span>
              </div>
              <Slider value={conf} min={0.05} max={0.95} step={0.05} onChange={setConf} />
              <span className="t-caption">{t("Lower catches more objects but adds false positives.")}</span>
            </div>
            <div className="col gap-md">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="t-label">{t("IoU threshold")}</span>
                <span className="mono tnum t-body">{iou.toFixed(2)}</span>
              </div>
              <Slider value={iou} min={0.10} max={0.95} step={0.05} onChange={setIou} />
              <span className="t-caption">{t("Higher keeps overlapping boxes; lower merges them.")}</span>
            </div>
            <div className="col gap-md">
              <span className="t-label">{t("Scope")}</span>
              <Segmented<"current" | "batch"> value={scope} onChange={setScope}
                options={[
                  { value: "current", label: t("Current image") },
                  { value: "batch", label: `All ${imageCount} images` },
                ]} />
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="col">
                <span className="t-body">{t("Add detected classes to project")}</span>
                <span className="t-caption">{t("Auto-extend the class list")}</span>
              </div>
              <Switch on={addNew} onChange={setAddNew} />
            </div>
          </div>
          <div className="col gap-md" style={{ minHeight: 0 }}>
            <span className="t-label">
              {t("Detect classes")}{" "}
              <span className="tter">
                {picked.size === 0 ? t("(all the model finds)") : `(${picked.size})`}
              </span>
            </span>
            <span className="t-caption">
              {picked.size === 0
                ? t("Nothing selected — every class the model detects is kept. Select classes only to narrow the results.")
                : t("Only these classes will be kept. Names must match what the model outputs.")}
            </span>
            <label className="field">
              <Icon name="search" size={14} className="ic" />
              <input placeholder={t("Filter classes…")} value={search} onChange={e => setSearch(e.target.value)} />
            </label>
            {picked.size > 0 && (
              <button className="btn btn-ghost sm" style={{ alignSelf: "flex-start" }}
                onClick={() => setPicked(new Set())}>
                <Icon name="x" size={13} />{t("Clear selection")}
              </button>
            )}
            <div className="card" style={{ overflow: "auto", maxHeight: 230, padding: "var(--sp-xs)" }}>
              {list.map(c => (
                <label key={c} className="row gap-md" style={{
                  padding: "6px var(--sp-sm)", borderRadius: "var(--r-sm)", cursor: "pointer",
                }} onClick={e => { e.preventDefault(); toggle(c); }}>
                  <span className={"cbx" + (picked.has(c) ? " on" : "")}>
                    {picked.has(c) && <Icon name="check" size={12} />}
                  </span>
                  <span className="t-body">{c}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>{t("Cancel")}</button>
          <button className="btn btn-primary" onClick={run}>
            <Icon name="sparkles" size={15} />{t("Run auto-label")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Split modal
// ============================================================

interface SplitModalProps {
  onClose: () => void;
  onRun: (cfg: { ratios: { train: number; val: number; test: number }; seed: number; copy: boolean; outRoot: string }) => void;
}

export function SplitModal({ onClose, onRun }: SplitModalProps) {
  const [r, setR] = useState({ train: .7, val: .2, test: .1 });
  const [seed, setSeed] = useState(42);
  const [copy, setCopy] = useState(true);
  const [out, setOut] = useState("./dataset");
  const set = (key: keyof Ratios, v: number) => setR(prev => rebalanceRatios(prev, key, v));
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="modal" style={{ width: "min(520px,92vw)" }} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="t-title">{t("Train / Val / Test split")}</span>
          <button className="iconbtn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="modal-body col" style={{ gap: "var(--sp-xl)" }}>
          <div className="row gap-sm" style={{ height: 12, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ flex: r.train, background: "var(--primary)" }} />
            <div style={{ flex: r.val, background: "var(--info)" }} />
            <div style={{ flex: r.test, background: "var(--warning)" }} />
          </div>
          {(["train", "val", "test"] as const).map(k => (
            <div className="row gap-md" key={k}>
              <span className="t-body" style={{ width: 44, textTransform: "capitalize" }}>{k}</span>
              <Slider value={r[k]} min={0} max={1} step={0.05} onChange={v => set(k, v)} />
              <span className="mono tnum t-body" style={{ width: 38, textAlign: "right" }}>
                {Math.round(r[k] * 100)}%
              </span>
            </div>
          ))}
          <div className="coord-grid">
            <div className="coord-cell">
              <label>Random seed</label>
              <label className="field"><input type="number" value={seed} onChange={e => setSeed(+e.target.value)} /></label>
            </div>
            <div className="coord-cell">
              <label>Output</label>
              <label className="field">
                <Icon name="folder" size={14} className="ic" />
                <input value={out} onChange={e => setOut(e.target.value)} />
              </label>
            </div>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="t-body">Copy images to split folders</span>
            <Switch on={copy} onChange={setCopy} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>{t("Cancel")}</button>
          <button className="btn btn-primary" onClick={() => {
            onRun({ ratios: r, seed, copy, outRoot: out });
            onClose();
          }}>
            <Icon name="split" size={15} />{t("Export split")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Class manager drawer
// ============================================================

interface ClassManagerProps {
  onClose: () => void;
  classes: ClassDef[];
  setClasses: (c: ClassDef[] | ((cs: ClassDef[]) => ClassDef[])) => void;
  pushToast: (t: { icon?: string; msg: string }) => void;
  /** Re-read annotations from disk so index-based (YOLO) boxes pick up the
   * corrected class names. Called after import and on save. */
  onReloadAnnotations?: () => void;
  /** How many loaded boxes currently use each class NAME, for the delete warning. */
  boxCounts?: Record<string, number>;
}

export function ClassManagerDrawer({ onClose, classes, setClasses, pushToast, onReloadAnnotations, boxCounts }: ClassManagerProps) {
  const palette = Object.values(PALETTE);
  const rename = (id: string, name: string) => setClasses(cs => cs.map(c => c.id === id ? { ...c, name } : c));
  const recolor = (id: string, color: string) => setClasses(cs => cs.map(c => c.id === id ? { ...c, color } : c));
  // Deleting a class is not cosmetic: boxes carry the class NAME, so every box
  // of a removed class becomes unwritable in YOLO (which stores only an index)
  // and is dropped from the label file on the next save. It also shifts the
  // index of every class after it, re-interpreting labels already on disk.
  // Both used to happen with no warning at all.
  const del = (id: string) => {
    const victim = classes.find(c => c.id === id);
    if (!victim) return;
    const used = boxCounts?.[victim.name] ?? 0;
    const isLast = classes[classes.length - 1]?.id === id;
    const warning = [
      isRTL()
        ? `کلاس «${victim.name}» حذف شود؟`
        : `Delete the class “${victim.name}”?`,
      used > 0
        ? (isRTL()
          ? `\n${used} باکس از این کلاس استفاده می‌کند. این باکس‌ها در ذخیره‌سازی بعدی از فایل‌های لیبل حذف می‌شوند.`
          : `\n${used} box(es) use it. Those boxes will be removed from the label files on the next save.`)
        : "",
      !isLast
        ? (isRTL()
          ? "\nاین کلاس آخرین کلاس نیست، پس ایندکس کلاس‌های بعدی جابه‌جا می‌شود و معنی لیبل‌های روی دیسک تغییر می‌کند."
          : "\nThis is not the last class, so every later class shifts index — labels already on disk will change meaning.")
        : "",
    ].join("");
    if (!confirm(warning)) return;
    setClasses(cs => cs.filter(c => c.id !== id));
  };
  const [picker, setPicker] = useState<string | null>(null);

  // Read an ordered class list out of a file the user picks (classes.txt /
  // data.yaml / *.names / COCO json) and replace the class list with it.
  const importFromFile = async () => {
    const names = await window.api?.pickClassesFile?.();
    if (names == null) return; // cancelled, or not running in Electron
    if (names.length === 0) {
      pushToast({ icon: "alert", msg: "No class names found in that file" });
      return;
    }
    setClasses(names.map((name, i) => {
      const prior = classes.find(c => c.name === name);
      return prior ?? { id: name, name, color: palette[i % palette.length] };
    }));
    onReloadAnnotations?.();
    pushToast({ icon: "check", msg: `Imported ${names.length} class name${names.length === 1 ? "" : "s"}` });
  };
  const add = () => setClasses(cs => {
    // Boxes are keyed by class NAME, so give each new class a unique default
    // name to avoid two "new class" entries merging until the user renames them.
    let n = cs.length + 1;
    let name = `class ${n}`;
    while (cs.some(c => c.name === name)) name = `class ${++n}`;
    return [...cs, { id: "class_" + Date.now(), name, color: palette[cs.length % palette.length] }];
  });
  return (
    <div className="scrim" onMouseDown={onClose} style={{ justifyContent: "flex-end" }}>
      <div className="drawer" onMouseDown={e => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="col">
            <span className="t-title">{t("Classes")}</span>
            <span className="t-caption">{classes.length} {t("classes")} · {t("drag to reorder")}</span>
          </div>
          <button className="iconbtn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="drawer-body col" style={{ gap: "var(--sp-xs)" }}>
          <button className="btn btn-secondary" onClick={importFromFile}>
            <Icon name="file" size={15} />{t("Import names from file…")}
          </button>
          <div className="t-caption" style={{ marginBottom: "var(--sp-sm)" }}>
            {t("Names must be in class-index order (0 first). Editing them re-reads YOLO labels from disk.")}
          </div>
          {classes.map((c, i) => (
            <div key={c.id} className="row gap-sm" style={{
              padding: "var(--sp-sm)", borderRadius: "var(--r-md)", position: "relative",
            }}>
              <Icon name="grip" size={15} style={{ color: "var(--text-tertiary)", cursor: "grab" }} />
              <button className="cbx" style={{
                background: c.color, boxShadow: "none", width: 22, height: 22,
              }} onClick={() => setPicker(picker === c.id ? null : c.id)} />
              <input className="field" style={{
                flex: 1, boxShadow: "none", background: "transparent",
              }} value={c.name} onChange={e => rename(c.id, e.target.value)} />
              <span className="kbd">{i + 1}</span>
              <button className="iconbtn sm" onClick={() => del(c.id)}>
                <Icon name="trash" size={14} />
              </button>
              {picker === c.id && (
                <div className="dropmenu" style={{
                  top: "100%", left: 40, display: "grid",
                  gridTemplateColumns: "repeat(8,1fr)", gap: 6, padding: "var(--sp-md)",
                }}>
                  {palette.map(col => (
                    <button key={col} onClick={() => { recolor(c.id, col); setPicker(null); }}
                      style={{
                        width: 20, height: 20, borderRadius: 5, background: col,
                        boxShadow: col === c.color
                          ? "0 0 0 2px var(--surface), 0 0 0 4px var(--primary)"
                          : "none",
                      }} />
                  ))}
                </div>
              )}
            </div>
          ))}
          <button className="btn btn-secondary" style={{ marginTop: "var(--sp-md)" }} onClick={add}>
            <Icon name="plus" size={15} />{t("Add class")}
          </button>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>{t("Close")}</button>
          <button className="btn btn-primary" onClick={() => {
            onReloadAnnotations?.();
            onClose();
            pushToast({ icon: "check", msg: "Classes saved" });
          }}>{t("Save changes")}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Settings drawer
// ============================================================

interface SettingsProps {
  onClose: () => void;
  theme: "dark" | "light";
  setTheme: (v: "dark" | "light") => void;
  density: "compact" | "comfortable" | "spacious";
  setDensity: (v: "compact" | "comfortable" | "spacious") => void;
  fmt: string;
  setFmt: (v: string) => void;
  device: "cpu" | "gpu";
  setDevice: (v: "cpu" | "gpu") => void;
  lang: "en" | "fa";
  setLang: (v: "en" | "fa") => void;
  outputDir: string;
  setOutputDir: (v: string) => void;
  obb: boolean;
  setObb: (v: boolean) => void;
  obbSave: ObbSaveMode;
  setObbSave: (v: ObbSaveMode) => void;
}

export function SettingsDrawer({
  onClose, theme, setTheme, density, setDensity,
  fmt, setFmt, device, setDevice, lang, setLang, outputDir, setOutputDir,
  obb, setObb, obbSave, setObbSave,
}: SettingsProps) {
  const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div className="row" style={{
      justifyContent: "space-between", alignItems: "center",
      padding: "var(--sp-md) 0", borderBottom: "1px solid var(--border)",
    }}>
      <div className="col"><span className="t-body">{label}</span>{hint && <span className="t-caption">{hint}</span>}</div>
      {children}
    </div>
  );
  return (
    <div className="scrim" onMouseDown={onClose} style={{ justifyContent: "flex-end" }}>
      <div className="drawer" onMouseDown={e => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="t-title">{t("Settings")}</span>
          <button className="iconbtn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="drawer-body">
          <span className="section-label">{t("Appearance")}</span>
          <Row label={t("Language")}>
            <Segmented<"en" | "fa"> value={lang} onChange={setLang}
              options={[{ value: "en", label: "EN" }, { value: "fa", label: "فارسی" }]} />
          </Row>
          <Row label={t("Theme")}>
            <Segmented<"dark" | "light"> value={theme} onChange={setTheme}
              options={[{ value: "dark", label: t("Dark") }, { value: "light", label: t("Light") }]} />
          </Row>
          <Row label={t("Density")} hint={t("Affects spacing & row heights")}>
            <Segmented<"compact" | "comfortable" | "spacious"> value={density} onChange={setDensity}
              options={[
                { value: "compact", label: t("Compact") },
                { value: "comfortable", label: t("Cozy") },
                { value: "spacious", label: t("Roomy") },
              ]} />
          </Row>
          <div style={{ height: "var(--sp-lg)" }} />
          <span className="section-label">{t("Project")}</span>
          <Row label={t("Output format")} hint={t("Per-project annotation format")}>
            <select className="field" value={fmt} onChange={e => setFmt(e.target.value)} style={{ appearance: "none" }}>
              {["YOLO", "Pascal VOC", "COCO", "CSV"].map(f => <option key={f}>{f}</option>)}
            </select>
          </Row>
          <Row label={t("Output directory")}>
            <label className="field" style={{ maxWidth: 180 }}>
              <input value={outputDir} onChange={e => setOutputDir(e.target.value)} placeholder="(same as images)" />
            </label>
          </Row>

          <div style={{ height: "var(--sp-lg)" }} />
          <span className="section-label">{t("Oriented boxes (OBB)")}</span>
          <Row label={t("Rotatable boxes")} hint={t("Adds a rotation knob and the angle control")}>
            <Switch on={obb} onChange={setObb} />
          </Row>
          {obb && (
            <>
              <Row label={t("Save as")} hint={t("Which label files each save writes")}>
                <select className="field" value={obbSave} style={{ appearance: "none", maxWidth: 180 }}
                  onChange={e => setObbSave(e.target.value as ObbSaveMode)}>
                  <option value="both">{t("Both (recommended)")}</option>
                  <option value="obb">{t("YOLO OBB only")}</option>
                  <option value="hbb">{t("Upright only")}</option>
                </select>
              </Row>
              <div className="t-caption" style={{ padding: "var(--sp-sm) 0 var(--sp-md)" }}>
                {obbSave === "both" &&
                  t("Upright labels go where they always have; the rotated set lands beside them in a “…_obb” folder.")}
                {obbSave === "obb" &&
                  t("One file per image: class_index x1 y1 x2 y2 x3 y3 x4 y4, normalized. This is what “yolo obb train” reads.")}
                {obbSave === "hbb" && (
                  <span style={{ color: "var(--warning)" }}>
                    {t("Angles are NOT written — each box is stored as the upright rectangle around it.")}
                  </span>
                )}
              </div>
            </>
          )}
          <div style={{ height: "var(--sp-lg)" }} />
          <span className="section-label">{t("Inference")}</span>
          <Row label={t("Device")} hint={t("YOLO compute target")}>
            <Segmented<"cpu" | "gpu"> value={device} onChange={setDevice}
              options={[{ value: "gpu", label: "GPU" }, { value: "cpu", label: "CPU" }]} />
          </Row>
          <Row label={t("Auto-save debounce")} hint={t("Delay before writing")}>
            <span className="mono t-body">800 ms</span>
          </Row>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Lossy-OBB-save warning
// ============================================================

interface ObbWarningProps {
  /** How many rotated boxes are about to be flattened. */
  count: number;
  /** The upright format they will be flattened into. */
  fmt: string;
  onClose: () => void;
  onOpenSettings: () => void;
}

/**
 * Shown when the current save style throws away rotation the user has actually
 * drawn — OBB mode is on, at least one box is turned, and the save mode is
 * "upright only". It is deliberately a modal rather than a toast: this is the
 * one setting combination where the file on disk stops matching the canvas, and
 * a toast that scrolls away would leave a whole labelling session quietly
 * flattened. Raised once per session unless the user changes the setting.
 */
export function ObbWarningModal({ count, fmt, onClose, onOpenSettings }: ObbWarningProps) {
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 470 }} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="row gap-sm">
            <Icon name="alert" size={17} style={{ color: "var(--warning)" }} />
            <span className="t-title">{t("Rotation will not be saved")}</span>
          </span>
          <button className="iconbtn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="modal-body col gap-md">
          <div className="t-body">
            {t("You have rotated boxes, but the save style is set to “Upright only”.")}
          </div>
          <div className="card pad col gap-sm">
            <div className="row gap-sm">
              <Icon name="alert" size={14} style={{ color: "var(--warning)" }} />
              <span className="t-body">
                <b className="tnum">{count}</b>{" "}
                {count === 1 ? t("rotated box") : t("rotated boxes")}{" "}
                {t("will be written to")} <b>{fmt}</b>{" "}
                {t("as the upright rectangle around them — the angle is lost.")}
              </span>
            </div>
          </div>
          <div className="t-caption">
            {t("Switch to “Both” or “YOLO OBB only” in Settings to keep the angles.")}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>{t("Continue anyway")}</button>
          <button className="btn btn-primary" onClick={onOpenSettings}>
            <Icon name="settings" size={15} />{t("Open settings")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Box context menu
// ============================================================

interface BoxContextMenuProps {
  x: number;
  y: number;
  box: NBox;
  classes: ClassDef[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onChangeClass: (id: string, cls: string) => void;
}

export function BoxContextMenu({
  x, y, box, classes, onClose, onDelete, onChangeClass,
}: BoxContextMenuProps) {
  useEffect(() => {
    const h = () => onClose();
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [onClose]);
  const [sub, setSub] = useState(false);
  return (
    <div className="dropmenu" style={{ left: x, top: y, position: "fixed" }} onClick={e => e.stopPropagation()}>
      <div className="menu-item" onMouseEnter={() => setSub(true)} onMouseLeave={() => setSub(false)} style={{ position: "relative" }}>
        <Icon name="tag" size={15} className="ic" />Change class
        <Icon name="chevRight" size={14} style={{ marginLeft: "auto" }} />
        {sub && (
          <div className="dropmenu" style={{ left: "100%", top: 0, maxHeight: 240, overflow: "auto" }}>
            {classes.map(c => (
              <div key={c.id} className="menu-item" onClick={() => { onChangeClass(box.id, c.name); onClose(); }}>
                <span className="dot" style={{
                  width: 9, height: 9, borderRadius: 2, background: c.color, display: "inline-block",
                }} />
                {c.name}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="menu-sep" />
      <div className="menu-item danger" onClick={() => { onDelete(box.id); onClose(); }}>
        <Icon name="trash" size={15} className="ic" style={{ color: "var(--danger)" }} />
        Delete box<span className="kbd" style={{ marginLeft: "auto" }}>Del</span>
      </div>
    </div>
  );
}

// ============================================================
//  Toasts
// ============================================================

interface ToastHostProps { toasts: Toast[]; dismiss: (id: string) => void; }

export function ToastHost({ toasts, dismiss }: ToastHostProps) {
  return (
    <div className="toast-wrap">
      {toasts.map(toast => (
        <div className="toast" key={toast.id} style={{ position: "relative", overflow: "hidden" }}>
          <Icon name={toast.icon || "info"} size={18} className="ticon" style={{ color: "var(--primary)" }} />
          <span className="tmsg">{toast.msg}</span>
          {toast.undo && (
            <button className="btn btn-ghost sm" style={{ color: "var(--primary)" }}
              onClick={() => { toast.undo?.(); dismiss(toast.id); }}>{toast.actionLabel ?? "Undo"}</button>
          )}
          <button className="iconbtn sm" onClick={() => dismiss(toast.id)}><Icon name="x" size={13} /></button>
          <div className="tbar" />
        </div>
      ))}
    </div>
  );
}

// ============================================================
//  System analysis drawer
// ============================================================

interface SystemDrawerProps {
  onClose: () => void;
  pushToast: (t: { icon?: string; msg: string }) => void;
}

export function SystemDrawer({ onClose, pushToast }: SystemDrawerProps) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [scanning, setScanning] = useState(true);

  const refresh = async () => {
    if (!window.api) {
      pushToast({ icon: "alert", msg: "System info needs the desktop app" });
      setScanning(false);
      return;
    }
    setScanning(true);
    try {
      const data = await window.api.getSystemInfo();
      setInfo(data);
    } catch (err) {
      pushToast({ icon: "alert", msg: `Probe failed: ${err}` });
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const col = (p: number) => p < 60 ? "var(--success)" : p < 85 ? "var(--warning)" : "var(--danger)";

  const Gauge = ({ icon, title, value, total, unit, pct, sub }: {
    icon: string; title: string; value?: number; total?: number;
    unit?: string; pct?: number; sub: string;
  }) => {
    const p = pct != null ? pct : Math.round((value ?? 0) / (total ?? 1) * 100);
    return (
      <div className="gauge">
        <div className="gauge-top">
          <Icon name={icon} size={16} style={{ color: "var(--text-secondary)" }} />
          <span className="t-body-strong grow">{title}</span>
          <span className="mono tnum t-body">
            {pct != null ? p + "%" : `${value} / ${total} ${unit}`}
          </span>
        </div>
        <div className="gauge-bar"><i style={{ width: (scanning ? 0 : p) + "%", background: col(p) }} /></div>
        <span className="t-caption">{sub}</span>
      </div>
    );
  };

  const cudaLabel = info?.cudaAvailable
    ? "CUDA available — GPU ready"
    : info
      ? "No NVIDIA GPU detected — CPU only"
      : "Detecting…";

  return (
    <div className="scrim" onMouseDown={onClose} style={{ justifyContent: "flex-end" }}>
      <div className="drawer" onMouseDown={e => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="row gap-md">
            <span className="cbx" style={{
              background: "var(--primary)", boxShadow: "none", color: "#fff",
              width: 28, height: 28,
            }}>
              <Icon name="cpu" size={16} />
            </span>
            <div className="col">
              <span className="t-title">{t("System analysis")}</span>
              <span className="t-caption row gap-sm"><span className="live-dot" />{info?.platform ?? "—"}</span>
            </div>
          </div>
          <button className="iconbtn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="drawer-body col" style={{ gap: "var(--sp-lg)" }}>
          <div className="sys-banner">
            <span className="ok" style={{ background: info?.cudaAvailable ? undefined : "var(--surface-2)" }}>
              <Icon name={info?.cudaAvailable ? "check" : "info"} size={20} />
            </span>
            <div className="col">
              <span className="t-body-strong" style={{
                color: info?.cudaAvailable ? "var(--success)" : "var(--text-secondary)",
              }}>{cudaLabel}</span>
              <span className="t-caption">
                {info?.gpu?.driver ? `Driver ${info.gpu.driver}` : ""}
              </span>
            </div>
          </div>

          {info?.gpu ? (
            <>
              <Gauge icon="gpu" title={t("Graphics (GPU)")}
                value={+(info.gpu.vramUsedMB / 1024).toFixed(1)}
                total={+(info.gpu.vramTotalMB / 1024).toFixed(1)} unit="GB"
                sub={`${info.gpu.name} · ${t("VRAM usage")}`} />
              <Gauge icon="cpu" title={t("GPU utilization")} pct={info.gpu.utilizationPct}
                sub={info.gpu.name} />
            </>
          ) : (
            <div className="card pad col gap-sm">
              <span className="t-caption">{t("Graphics (GPU)")}</span>
              <span className="t-body tsec">
                No NVIDIA GPU found. Install <code>nvidia-smi</code> drivers to see GPU stats,
                or just run inference / training on CPU.
              </span>
            </div>
          )}

          {info && (
            <>
              <Gauge icon="layers" title={t("Memory (RAM)")}
                value={+(info.ram.totalGB - info.ram.freeGB).toFixed(1)}
                total={info.ram.totalGB} unit="GB"
                sub={`${info.ram.freeGB} GB ${t("free")}`} />
              <Gauge icon="hash" title={t("Processor (CPU)")} pct={undefined}
                value={info.cpu.threads} total={info.cpu.threads} unit="threads"
                sub={`${info.cpu.model} · ${info.cpu.physicalCores} ${t("cores")} / ${info.cpu.threads} ${t("threads")}${info.cpu.speedGHz ? " · " + info.cpu.speedGHz + " GHz" : ""}`} />
              {info.disk && (
                <Gauge icon="save" title={t("Storage")}
                  value={+(info.disk.totalGB - info.disk.freeGB).toFixed(0)}
                  total={+info.disk.totalGB.toFixed(0)} unit="GB"
                  sub={`${info.disk.freeGB.toFixed(0)} GB ${t("free")}`} />
              )}
            </>
          )}

          {info && (
            <div className="card pad col" style={{ gap: 0 }}>
              <span className="section-label" style={{ marginBottom: "var(--sp-sm)" }}>{t("Environment")}</span>
              {[
                ["Node", info.versions.node],
                ["Electron", info.versions.electron],
                ["Chrome", info.versions.chrome],
                ["V8", info.versions.v8],
                ["Python", info.versions.python ?? "not detected"],
                ["Ultralytics", info.versions.ultralytics ?? "not detected"],
                ["Platform", `${info.platform} · ${info.arch}`],
              ].map(([k, v]) => (
                <div className="spec-row" key={k}>
                  <span className="k t-body">{k}</span>
                  <span className="mono t-body">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>{t("Close")}</button>
          <button className="btn btn-primary" onClick={refresh} disabled={scanning}>
            <Icon name="refresh" size={15}
              style={{ animation: scanning ? "spin .8s linear infinite" : "none" }} />
            {t("Re-scan")}
          </button>
        </div>
      </div>
    </div>
  );
}
