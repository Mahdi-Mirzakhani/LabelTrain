// Duplicates tab: scan a folder or a whole YOLO dataset for copies and
// look-alikes, review them group by group, and move the extras out of the
// dataset (to <root>.duplicates/, undoable). Logic in lib/dedup.ts, file work
// in electron/dedup.ts, the scan in scripts/dedup_scan.py.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Checkbox, Segmented, Slider } from "./ui";
import { t } from "../i18n";
import { inElectron, pathToAppUrl } from "../ipc";
import {
  PRESETS, bytesText, groupPairs, pairKey, suggestKeeper, type DupGroup, type MatchKind, type Sensitivity,
} from "../lib/dedup";
import type { BBox, DedupScanResult, DedupScope } from "../electron-api";
import type { AnnotationFormat, ClassDef, ProjectInfo } from "../types";

type Preset = keyof typeof PRESETS | "custom";
type KindFilter = "all" | MatchKind;

interface Props {
  project: ProjectInfo | null;
  classes: ClassDef[];
  classColor: (key: string) => string;
  format: AnnotationFormat;
  outputDir: string;
  fa: boolean;
  pushToast: (toast: { icon?: string; msg: string; undo?: () => void; actionLabel?: string; sticky?: boolean }) => void;
  /** Save any unsaved label edits before files move. */
  beforeChange: () => Promise<void>;
  /** Images of the open folder that were moved out: drop them from its list. */
  onRemoved: (paths: string[]) => void;
  /** Images came back: re-read the open folder. */
  onRestored: () => void;
}

interface Facts { boxes: BBox[] }
const ROW_H = 78;

function norm(p: string) { return p.replaceAll("\\", "/"); }
function rel(root: string, p: string) {
  const r = norm(root).replace(/\/+$/, "") + "/";
  const q = norm(p);
  return q.toLowerCase().startsWith(r.toLowerCase()) ? q.slice(r.length) : q;
}

export function DuplicatesRoute({
  project, classes, classColor, format, outputDir, fa, pushToast, beforeChange, onRemoved, onRestored,
}: Props) {
  const [scope, setScope] = useState<DedupScope | null>(null);
  const [whole, setWhole] = useState(true);
  const [deep, setDeep] = useState(true);
  const [progress, setProgress] = useState<{ phase: string; done: number; total: number } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scan, setScan] = useState<{ root: string; result: DedupScanResult; at: number } | null>(null);
  const [preset, setPreset] = useState<Preset>("frames");
  const [sens, setSens] = useState<Sensitivity>(PRESETS.frames);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [facts, setFacts] = useState<Map<string, Facts>>(new Map());
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [crossOnly, setCrossOnly] = useState(false);
  const [keepTrain, setKeepTrain] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [keepers, setKeepers] = useState<Map<string, Set<number>>>(new Map());
  const [showLabels, setShowLabels] = useState(true);
  const [flicker, setFlicker] = useState(false);
  const [flickPhase, setFlickPhase] = useState(0);
  const [lastBatch, setLastBatch] = useState<{ batch: string; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // ---- scope, not-duplicates list and undo state for the open project
  useEffect(() => {
    if (!inElectron || !project?.imageDir) return;
    let live = true;
    void window.api!.dedupScope(project.imageDir).then(s => { if (live) setScope(s); });
    return () => { live = false; };
  }, [project?.imageDir]);
  const root = scope ? (whole && scope.splits.length ? scope.root : scope.folder) : null;
  useEffect(() => {
    if (!inElectron || !root) return;
    let live = true;
    void window.api!.loadNotDuplicates(root).then(pairs => {
      if (live) setIgnored(new Set(pairs.map(([a, b]) => pairKey(a, b))));
    });
    void window.api!.dedupLastBatch(root).then(b => { if (live) setLastBatch(b); });
    return () => { live = false; };
  }, [root]);
  useEffect(() => inElectron ? window.api!.onDedupProgress(p => setProgress(p)) : undefined, []);

  // ---- scanning
  const runScan = useCallback(async () => {
    if (!scope || !root || progress) return;
    setScanError(null);
    setProgress({ phase: "list", done: 0, total: 0 });
    try {
      const dirs = whole && scope.splits.length ? scope.splits.map(s => s.dir) : [scope.folder];
      const lists = await Promise.all(dirs.map(d => window.api!.listImagePaths(d)));
      const images = lists.flat();
      if (!images.length) throw new Error(t("No images to scan"));
      const result = await window.api!.dedupScan({ images, root, deep });
      setScan({ root, result, at: Date.now() });
      setRemoved(new Set());
      setKeepers(new Map());
      setFacts(new Map());
      setSelId(null);
      if (deep && !result.deep) {
        pushToast({ icon: "alert", sticky: true, msg: `${t("Look-alikes were skipped")}: ${result.deepError ?? ""}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/cancelled/.test(msg)) setScanError(msg);
    } finally {
      setProgress(null);
    }
  }, [scope, root, whole, deep, progress, pushToast]);

  // ---- groups at the chosen sensitivity
  const items = scan?.result.items ?? [];
  const splitOf = useCallback((p: string) => {
    if (!scope?.splits.length) return "";
    const q = norm(p).toLowerCase();
    return scope.splits.find(s => q.startsWith(norm(s.dir).toLowerCase() + "/"))?.name ?? "";
  }, [scope]);
  const allGroups = useMemo(() => {
    if (!scan) return [];
    const r = scan.root;
    return groupPairs(items.length, scan.result.pairs, sens, (a, b) =>
      removed.has(items[a].path) || removed.has(items[b].path) ||
      ignored.has(pairKey(rel(r, items[a].path), rel(r, items[b].path))));
  }, [scan, items, sens, removed, ignored]);
  const isCross = useCallback((g: DupGroup) => new Set(g.members.map(i => splitOf(items[i].path))).size > 1,
    [items, splitOf]);
  const groups = useMemo(() => allGroups.filter(g =>
    (kindFilter === "all" || g.kind === kindFilter) && (!crossOnly || isCross(g))), [allGroups, kindFilter, crossOnly, isCross]);

  // ---- label facts for the members, loaded as groups appear
  useEffect(() => {
    if (!inElectron || !scan || !project) return;
    const need = [...new Set(allGroups.flatMap(g => g.members.map(i => items[i].path)))].filter(p => !facts.has(p));
    if (!need.length) return;
    let live = true;
    (async () => {
      const names = classes.map(c => c.name);
      const inFolder = (p: string) => norm(p).toLowerCase().startsWith(norm(project.imageDir).toLowerCase() + "/");
      const next = new Map(facts);
      for (let s = 0; s < need.length; s += 200) {
        const chunk = need.slice(s, s + 200);
        const own = chunk.filter(inFolder), other = chunk.filter(p => !inFolder(p));
        for (const [paths, od] of [[own, outputDir], [other, ""]] as const) {
          if (!paths.length) continue;
          const anns = await window.api!.loadAnnotationsBatch({ imagePaths: paths, classes: names, format, outputDir: od });
          for (const p of paths) next.set(p, { boxes: anns[p] ?? [] });
        }
        if (!live) return;
      }
      if (live) setFacts(next);
    })();
    return () => { live = false; };
  }, [allGroups, scan, project, classes, format, outputDir, items, facts]);

  const keepOf = useCallback((g: DupGroup): Set<number> => {
    const chosen = keepers.get(g.id);
    if (chosen && chosen.size) return chosen;
    const order = keepTrain ? ["train", "valid", "val", "test"] : ["test", "valid", "val", "train"];
    return new Set([suggestKeeper(g.members, i => ({
      boxes: facts.get(items[i].path)?.boxes.length ?? 0, split: splitOf(items[i].path),
      pixels: items[i].width * items[i].height, bytes: items[i].bytes,
    }), order)]);
  }, [keepers, keepTrain, facts, items, splitOf]);

  const toRemove = useMemo(() => groups.flatMap(g => g.members.filter(i => !keepOf(g).has(i))), [groups, keepOf]);
  const freed = toRemove.reduce((s, i) => s + items[i].bytes, 0);
  const crossCount = useMemo(() => groups.filter(isCross).length, [groups, isCross]);

  const selIdx = Math.max(0, groups.findIndex(g => g.id === selId));
  const sel = groups[selIdx] ?? null;
  useEffect(() => { if (groups.length && !groups.some(g => g.id === selId)) setSelId(groups[0].id); }, [groups, selId]);
  useEffect(() => { setFlickPhase(0); }, [selId]);
  useEffect(() => {
    if (!flicker) return;
    const id = window.setInterval(() => setFlickPhase(p => p + 1), 650);
    return () => window.clearInterval(id);
  }, [flicker]);
  useEffect(() => {
    const el = listRef.current;
    if (!el || selIdx < 0) return;
    const top = selIdx * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
  }, [selIdx]);

  // ---- actions
  const choosePreset = (p: Preset) => { setPreset(p); if (p !== "custom") setSens(PRESETS[p]); };
  const tweak = (patch: Partial<Sensitivity>) => { setPreset("custom"); setSens(s => ({ ...s, ...patch })); };

  const toggleKeep = (g: DupGroup, i: number) => {
    const cur = new Set(keepOf(g));
    if (cur.has(i)) { if (cur.size > 1) cur.delete(i); } else cur.add(i);
    setKeepers(m => new Map(m).set(g.id, cur));
  };
  const keepOnly = (g: DupGroup, i: number) => setKeepers(m => new Map(m).set(g.id, new Set([i])));

  const markNotDuplicates = useCallback(async (g: DupGroup) => {
    if (!scan) return;
    const next = new Set(ignored);
    for (const p of g.pairs) next.add(pairKey(rel(scan.root, items[p.a].path), rel(scan.root, items[p.b].path)));
    setIgnored(next);
    await window.api!.saveNotDuplicates(scan.root, [...next].map(k => k.split("\n") as [string, string]));
    pushToast({ icon: "check", msg: t("Marked as not duplicates — they will not be grouped again") });
  }, [scan, ignored, items, pushToast]);

  const refreshUndo = useCallback(async () => {
    if (root) setLastBatch(await window.api!.dedupLastBatch(root));
  }, [root]);

  const removeGroups = useCallback(async (gs: DupGroup[]) => {
    if (!scan || busy) return;
    const list = gs.flatMap(g => {
      const keep = keepOf(g);
      const keeper = items[[...keep][0]].path;
      return g.members.filter(i => !keep.has(i)).map(i => {
        const p = g.pairs.find(pp => (pp.a === i && keep.has(pp.b)) || (pp.b === i && keep.has(pp.a))) ?? g.pairs[0];
        return { image: items[i].path, keeper, match: p.kind, hamming: p.ham, cosine: p.cos >= 0 ? p.cos : undefined };
      });
    });
    if (!list.length) return;
    setBusy(true);
    try {
      await beforeChange();
      const res = await window.api!.dedupApply({ root: scan.root, items: list, outputDir });
      setRemoved(r => new Set([...r, ...res.moved]));
      onRemoved(res.moved);
      await refreshUndo();
      if (res.errors.length) pushToast({ icon: "alert", sticky: true, msg: `${t("Some files could not be moved")}: ${res.errors.slice(0, 3).join("; ")}` });
      pushToast({
        icon: "trash", msg: `${res.moved.length} ${t("images moved out of the dataset, with their labels")}`,
        actionLabel: t("Undo"), undo: () => { void undo(); },
      });
    } finally {
      setBusy(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, busy, keepOf, items, beforeChange, outputDir, onRemoved, refreshUndo, pushToast]);

  const undo = useCallback(async () => {
    if (!root || busy) return;
    setBusy(true);
    try {
      const res = await window.api!.dedupUndo(root);
      if (!res) { pushToast({ icon: "info", msg: t("Nothing to undo") }); return; }
      setRemoved(r => { const n = new Set(r); for (const p of res.restored) n.delete(p); return n; });
      onRestored();
      await refreshUndo();
      pushToast({ icon: "refresh", msg: `${res.restored.length} ${t("images put back")}` +
        (res.skipped.length ? ` · ${res.skipped.length} ${t("left in quarantine: their place is taken")}` : "") });
    } finally {
      setBusy(false);
    }
  }, [root, busy, onRestored, refreshUndo, pushToast]);

  const removeAll = useCallback(async () => {
    if (!toRemove.length) return;
    const ask = fa
      ? `${toRemove.length} عکس از ${groups.length} گروه همراه لیبل‌هایشان از دیتاست بیرون برده شوند؟\nبه پوشهٔ ${root}.duplicates می‌روند و با «برگرداندن» برمی‌گردند.`
      : `Move ${toRemove.length} images from ${groups.length} groups out of the dataset, with their labels?\nThey go to ${root}.duplicates and Undo puts them back.`;
    if (!window.confirm(ask)) return;
    await removeGroups(groups);
  }, [toRemove, groups, fa, root, removeGroups]);

  // ---- keyboard: J/K or ↓/↑ groups, 1-9 keep only, Enter remove, I not duplicates, C compare, L labels, Ctrl+Z undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target instanceof HTMLElement ? e.target.tagName : "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); void undo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); if (groups[selIdx + 1]) setSelId(groups[selIdx + 1].id); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); if (groups[selIdx - 1]) setSelId(groups[selIdx - 1].id); }
      else if (!sel) return;
      else if (/^[1-9]$/.test(e.key) && sel.members[+e.key - 1] !== undefined) keepOnly(sel, sel.members[+e.key - 1]);
      else if (e.key === "Enter" || e.key === "Delete") { e.preventDefault(); void removeGroups([sel]); }
      else if (k === "i") void markNotDuplicates(sel);
      else if (k === "c") setFlicker(v => !v);
      else if (k === "l") setShowLabels(v => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- render
  if (!project) {
    return <div className="workspace"><div className="empty"><div className="t-title">{t("Open a project first")}</div></div></div>;
  }
  const kindLabel: Record<MatchKind, string> = { exact: t("Exact copy"), near: t("Copy"), similar: t("Look-alike") };
  const presetOptions: { value: Preset; label: string }[] = [
    { value: "exact", label: t("Exact only") },
    { value: "copies", label: t("Copies") },
    { value: "frames", label: t("+ Crops & frames") },
    { value: "loose", label: t("Loose") },
    { value: "custom", label: t("Custom") },
  ];
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 8);
  const visible = groups.slice(start, start + 40);
  const phaseText = progress ? ({ list: t("Listing images"), read: t("Reading images"), compare: t("Comparing") } as Record<string, string>)[progress.phase] ?? progress.phase : "";

  return (
    <div className="body dup-body">
      <div className="workspace">
        <div className="wsbar">
          <div className="row gap-md" style={{ minWidth: 0 }}>
            <span className="t-title">{t("Duplicates")}</span>
            {scope && scope.splits.length > 0 && (
              <Segmented value={whole ? "all" : "one"} onChange={v => setWhole(v === "all")} options={[
                { value: "one", label: t("This folder") },
                { value: "all", label: `${t("Whole dataset")} · ${scope.splits.map(s => s.name).join(" · ")}` },
              ]} />
            )}
            <Checkbox on={deep} onChange={setDeep} label={t("Look-alikes (needs torch)")} />
          </div>
          <div className="row gap-sm">
            {lastBatch && (
              <button className="btn btn-secondary sm" onClick={() => void undo()} disabled={busy}
                title={`${lastBatch.batch} (Ctrl+Z)`}>
                <Icon name="undo" size={14} />{t("Undo last removal")} ({lastBatch.count})
              </button>
            )}
            {progress ? (
              <button className="btn btn-secondary sm" onClick={() => void window.api!.cancelDedupScan()}>
                <Icon name="x" size={14} />{t("Cancel")}
              </button>
            ) : (
              <button className="btn btn-primary sm" onClick={() => void runScan()} disabled={!scope}>
                <Icon name="scan" size={14} />{scan ? t("Rescan") : t("Scan for duplicates")}
              </button>
            )}
          </div>
        </div>

        {progress && (
          <div className="dup-progress">
            <span>{phaseText}{progress.total ? ` ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}` : "…"}</span>
            <div className="dup-progress-bar"><div style={{ width: progress.total ? `${progress.done / progress.total * 100}%` : "15%" }} /></div>
          </div>
        )}
        {scanError && <div className="dup-error"><Icon name="alert" size={14} />{scanError}</div>}

        {!scan && !progress ? (
          <div className="dup-intro">
            <Icon name="copy" size={40} />
            <div className="t-title">{t("Find duplicate images")}</div>
            <div className="dup-intro-grid">
              <div><b>{t("Exact copy")}</b><span>{t("the same file twice")}</span></div>
              <div><b>{t("Copy")}</b><span>{t("resized, re-saved, mirrored or letterboxed")}</span></div>
              <div><b>{t("Look-alike")}</b><span>{t("cropped, zoomed, recoloured, or the next frame of a video")}</span></div>
            </div>
            <div className="t-body tsec" style={{ maxWidth: 560, textAlign: "center" }}>
              {t("Nothing is deleted: extras move, with their label files, to a folder beside the dataset, and Undo puts them back. A copy shared by train and test is the one that matters most — it makes test scores look better than they are.")}
            </div>
            <button className="btn btn-primary lg" onClick={() => void runScan()} disabled={!scope}>
              <Icon name="scan" size={16} />{t("Scan for duplicates")}
            </button>
          </div>
        ) : scan && (
          <>
            <div className="dup-controls">
              <div className="row gap-sm" style={{ flexWrap: "wrap" }}>
                <span className="t-caption tsec">{t("Sensitivity")}</span>
                <Segmented value={preset} onChange={choosePreset} options={presetOptions} />
              </div>
              <div className="dup-sliders">
                <label className={"dup-slider" + (sens.near ? "" : " off")}>
                  <Checkbox on={sens.near} onChange={v => tweak({ near: v })} />
                  <span>{t("Copies: hash distance")} ≤ <b className="tnum">{sens.maxHam}</b></span>
                  <Slider value={sens.maxHam} min={0} max={12} step={1} onChange={v => tweak({ maxHam: v })} width={140} />
                </label>
                <label className={"dup-slider" + (sens.similar && scan.result.deep ? "" : " off")}>
                  <Checkbox on={sens.similar} onChange={v => tweak({ similar: v })} />
                  <span>{t("Look-alikes: similarity")} ≥ <b className="tnum">{sens.minCos.toFixed(2)}</b></span>
                  <Slider value={sens.minCos} min={0.85} max={0.99} step={0.01} onChange={v => tweak({ minCos: v })} width={140} />
                </label>
              </div>
            </div>

            <div className="dup-kpis">
              <div className="kpi"><div className="num tnum">{groups.length.toLocaleString()}</div><div className="lbl">{t("groups")}</div></div>
              <div className="kpi"><div className="num tnum">{toRemove.length.toLocaleString()}</div><div className="lbl">{t("images to move out")}</div></div>
              <div className="kpi"><div className="num tnum" style={{ color: crossCount ? "var(--warning)" : undefined }}>{crossCount.toLocaleString()}</div><div className="lbl">{t("groups across splits")}</div></div>
              <div className="kpi"><div className="num tnum">{bytesText(freed)}</div><div className="lbl">{t("freed")} · {items.length.toLocaleString()} {t("images scanned")}</div></div>
            </div>

            <div className="dup-main">
              <div className="dup-list-col">
                <div className="dup-list-head">
                  <Segmented value={kindFilter} onChange={setKindFilter} options={[
                    { value: "all", label: t("All") }, { value: "exact", label: t("Exact") },
                    { value: "near", label: t("Copies") }, { value: "similar", label: t("Look-alikes") },
                  ]} />
                  {scope && scope.splits.length > 0 && whole && (
                    <Checkbox on={crossOnly} onChange={setCrossOnly} label={t("Across splits only")} />
                  )}
                </div>
                <div className="dup-list" ref={listRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
                  {groups.length === 0 ? (
                    <div className="dup-none"><Icon name="checkCircle" size={28} />{t("No duplicates at this sensitivity")}</div>
                  ) : (
                    <div style={{ height: groups.length * ROW_H, position: "relative" }}>
                      {visible.map((g, k) => {
                        const i = start + k;
                        const splits = [...new Set(g.members.map(m => splitOf(items[m].path)).filter(Boolean))];
                        return (
                          <div key={g.id} className={"dup-row" + (g.id === sel?.id ? " active" : "")}
                            style={{ top: i * ROW_H, height: ROW_H }} onClick={() => setSelId(g.id)}>
                            <div className="dup-row-thumbs">
                              {g.members.slice(0, 3).map(m => <img key={m} src={pathToAppUrl(items[m].path)} loading="lazy" alt="" />)}
                            </div>
                            <div className="dup-row-meta">
                              <div className="row gap-xs">
                                <span className={"dup-kind dup-kind-" + g.kind}>{kindLabel[g.kind]}</span>
                                <span className="t-caption tnum">{g.kind === "similar" ? `${g.maxCos.toFixed(3)}` : g.kind === "near" ? `Δ${g.minHam}` : ""}</span>
                              </div>
                              <div className="t-caption tsec dup-row-name">{items[g.members[0]].path.split(/[\\/]/).pop()}{g.members.length > 1 ? ` +${g.members.length - 1}` : ""}</div>
                              {splits.length > 1
                                ? <span className="dup-cross">{splits.join(" ↔ ")}</span>
                                : splits.length === 1 ? <span className="t-caption tsec">{splits[0]}</span> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="dup-list-foot">
                  <label className="row gap-sm" title={t("Which copy is suggested to stay when a group crosses splits")}>
                    <Checkbox on={keepTrain} onChange={setKeepTrain} label={t("Prefer keeping the train copy")} />
                  </label>
                  <button className="btn btn-danger sm" onClick={() => void removeAll()} disabled={!toRemove.length || busy}>
                    <Icon name="trash" size={14} />{t("Move all extras out")} ({toRemove.length})
                  </button>
                </div>
              </div>

              <div className="dup-detail">
                {!sel ? <div className="dup-none">{t("Pick a group")}</div> : (
                  <>
                    <div className="dup-detail-bar">
                      <div className="row gap-sm">
                        <span className={"dup-kind dup-kind-" + sel.kind}>{kindLabel[sel.kind]}</span>
                        <span className="t-caption tsec">{t("group")} {selIdx + 1} / {groups.length}</span>
                      </div>
                      <div className="row gap-sm">
                        <button className={"btn sm " + (showLabels ? "btn-secondary" : "btn-ghost")} onClick={() => setShowLabels(v => !v)} title="L">
                          <Icon name="tag" size={14} />{t("Labels")}
                        </button>
                        <button className={"btn sm " + (flicker ? "btn-secondary" : "btn-ghost")} onClick={() => setFlicker(v => !v)} title="C">
                          <Icon name="eye" size={14} />{flicker ? t("Side by side") : t("Flicker compare")}
                        </button>
                        <button className="btn btn-secondary sm" onClick={() => void markNotDuplicates(sel)} title="I">
                          <Icon name="x" size={14} />{t("Not duplicates")}
                        </button>
                        <button className="btn btn-primary sm" onClick={() => void removeGroups([sel])} disabled={busy}
                          title="Enter">
                          <Icon name="trash" size={14} />{t("Move extras out")} ({sel.members.length - keepOf(sel).size})
                        </button>
                      </div>
                    </div>
                    {flicker ? (() => {
                      const keep = [...keepOf(sel)][0];
                      const other = sel.members.find(m => m !== keep) ?? keep;
                      const show = flickPhase % 2 === 0 ? keep : other;
                      return (
                        <div className="dup-flicker">
                          <DupCard i={show} big items={items} splitOf={splitOf} facts={facts} showLabels={showLabels}
                            classColor={classColor} keep={keepOf(sel).has(show)} index={sel.members.indexOf(show)}
                            pair={sel.pairs.find(p => (p.a === show && p.b === keep) || (p.b === show && p.a === keep))}
                            onToggle={() => toggleKeep(sel, show)} fa={fa} />
                        </div>
                      );
                    })() : (
                      <div className={"dup-cards n" + Math.min(sel.members.length, 4)}>
                        {sel.members.map((m, k) => {
                          const keep = [...keepOf(sel)][0];
                          return (
                            <DupCard key={m} i={m} items={items} splitOf={splitOf} facts={facts} showLabels={showLabels}
                              classColor={classColor} keep={keepOf(sel).has(m)} index={k}
                              pair={m === keep ? undefined : sel.pairs.find(p => (p.a === m && p.b === keep) || (p.b === m && p.a === keep)) ?? sel.pairs.find(p => p.a === m || p.b === m)}
                              onToggle={() => toggleKeep(sel, m)} fa={fa} />
                          );
                        })}
                      </div>
                    )}
                    <div className="dup-keys t-caption tsec">
                      <b>J/K</b> {t("next / previous group")} · <b>1-9</b> {t("keep only this one")} · <b>Enter</b> {t("move extras out")} · <b>I</b> {t("not duplicates")} · <b>C</b> {t("flicker")} · <b>L</b> {t("labels")} · <b>Ctrl+Z</b> {t("undo")}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DupCard({ i, items, splitOf, facts, showLabels, classColor, keep, index, pair, onToggle, big, fa }: {
  i: number; items: DedupScanResult["items"]; splitOf: (p: string) => string; facts: Map<string, Facts>;
  showLabels: boolean; classColor: (k: string) => string; keep: boolean; index: number;
  pair?: { kind: MatchKind; ham: number; cos: number; mirrored: boolean }; onToggle: () => void; big?: boolean; fa: boolean;
}) {
  const it = items[i];
  const boxes = facts.get(it.path)?.boxes;
  const name = it.path.split(/[\\/]/).pop();
  const split = splitOf(it.path);
  return (
    <div className={"dup-card" + (keep ? " keep" : " drop") + (big ? " big" : "")}>
      <div className="dup-card-img" style={{ aspectRatio: `${it.width || 4} / ${it.height || 3}` }} onClick={onToggle}>
        <img src={pathToAppUrl(it.path)} alt={name} />
        {showLabels && boxes?.map((b, k) => (
          <div key={k} className="dup-box" style={{
            left: `${b.x1 / it.width * 100}%`, top: `${b.y1 / it.height * 100}%`,
            width: `${(b.x2 - b.x1) / it.width * 100}%`, height: `${(b.y2 - b.y1) / it.height * 100}%`,
            borderColor: classColor(b.cls),
          }} />
        ))}
        <span className={"dup-badge " + (keep ? "keep" : "drop")}>{index + 1} · {keep ? (fa ? "می‌ماند" : "KEEP") : (fa ? "بیرون" : "MOVE OUT")}</span>
      </div>
      <div className="dup-card-meta">
        <div className="dup-card-name" title={it.path}>{name}</div>
        <div className="row gap-xs" style={{ flexWrap: "wrap" }}>
          {split && <span className={"dup-split dup-split-" + split}>{split}</span>}
          <span className="t-caption tnum">{it.width}×{it.height}</span>
          <span className="t-caption tnum">{bytesText(it.bytes)}</span>
          <span className="t-caption tnum">{boxes ? `${boxes.length} ${t("boxes")}` : "…"}</span>
        </div>
        {pair && (
          <div className="t-caption tsec tnum">
            {pair.kind === "exact" ? t("identical file") : `${t("hash distance")} ${pair.ham}${pair.cos >= 0 ? ` · ${t("similarity")} ${pair.cos.toFixed(3)}` : ""}`}
            {pair.mirrored ? ` · ${t("mirrored")}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
