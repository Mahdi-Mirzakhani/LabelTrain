// Duplicates tab: scan a folder or a whole YOLO dataset for copies and
// look-alikes, review them group by group, and move the extras out of the
// dataset (to <root>.duplicates/, undoable). Logic in lib/dedup.ts, file work
// in electron/dedup.ts, the scan in scripts/dedup_scan.py.
//
// The component stays mounted once opened (App hides it with `active`), so a
// scan keeps running while the user labels in another tab.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Checkbox, Segmented, Slider } from "./ui";
import { t } from "../i18n";
import { inElectron, pathToAppUrl } from "../ipc";
import {
  MAX_BOX_TOL, MODELS, bytesText, clock, durationText, estimateSeconds, groupPairs, labelPairs, pairKey, pairKind, preset, suggestKeeper,
  type DupGroup, type DupMethod, type GroupPair, type MatchKind, type Pair, type PresetName, type Sensitivity,
} from "../lib/dedup";
import type { BBox, DedupCacheInfo, DedupModel, DedupProgress, DedupScanResult, DedupScope } from "../electron-api";
import type { AnnotationFormat, ClassDef, ProjectInfo } from "../types";

type Preset = PresetName | "custom";
type KindFilter = "all" | MatchKind;

interface Props {
  active: boolean;
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
interface Run {
  started: number;
  model: DupMethod;
  align: boolean;
  images: number;
  guess: number | null;   // seconds the whole scan should take, for "left" before the first rate is known
  steps: Record<string, { done: number; total: number; t0: number; t1?: number }>;
  info: Record<string, string>;
}
/** A scan's result: the scanner's, or the label comparison's, whose pairs carry two more numbers. */
type ScanData = Omit<DedupScanResult, "pairs"> & { pairs: Pair[] };
interface Scan { root: string; method: DupMethod; result: ScanData; seconds: number; label: string }

const ROW_H = 78;
const MODEL_ORDER: DedupModel[] = ["none", "resnet50", "dinov2"];

function norm(p: string) { return p.replaceAll("\\", "/"); }
function rel(root: string, p: string) {
  const r = norm(root).replace(/\/+$/, "") + "/";
  const q = norm(p);
  return q.toLowerCase().startsWith(r.toLowerCase()) ? q.slice(r.length) : q;
}

export function DuplicatesRoute({
  active, project, classes, classColor, format, outputDir, fa, pushToast, beforeChange, onRemoved, onRestored,
}: Props) {
  const [scope, setScope] = useState<DedupScope | null>(null);
  const [whole, setWhole] = useState(true);
  const [model, setModel] = useState<DupMethod>("resnet50");
  const [align, setAlign] = useState(false);
  const [counted, setCounted] = useState<number | null>(null);
  const [cacheInfo, setCacheInfo] = useState<DedupCacheInfo | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [now, setNow] = useState(Date.now());
  const [scanError, setScanError] = useState<string | null>(null);
  /** Back on the method picker with a result still kept, to scan another way or return to it. */
  const [picking, setPicking] = useState(false);
  const [scan, setScan] = useState<Scan | null>(null);
  const [presetName, setPresetName] = useState<Preset>("frames");
  const [sens, setSens] = useState<Sensitivity>(preset("frames"));
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
  const cancelLabels = useRef(false);

  const modelName = (m: DupMethod) => ({ none: t("Hashes only"), resnet50: "ResNet50", dinov2: "DINOv2", labels: t("Same labels") } as const)[m];

  // ---- scope, not-duplicates list, undo state and what is cached
  useEffect(() => {
    if (!inElectron || !project?.imageDir) return;
    let live = true;
    void window.api!.dedupScope(project.imageDir).then(s => { if (live) setScope(s); });
    return () => { live = false; };
  }, [project?.imageDir]);
  const root = scope ? (whole && scope.splits.length ? scope.root : scope.folder) : null;
  const dirs = useMemo(() => scope ? (whole && scope.splits.length ? scope.splits.map(s => s.dir) : [scope.folder]) : [],
    [scope, whole]);
  useEffect(() => {
    if (!inElectron || !root) return;
    let live = true;
    void window.api!.loadNotDuplicates(root).then(pairs => {
      if (live) setIgnored(new Set(pairs.map(([a, b]) => pairKey(a, b))));
    });
    void window.api!.dedupLastBatch(root).then(b => { if (live) setLastBatch(b); });
    void window.api!.dedupCacheInfo(root).then(c => { if (live) setCacheInfo(c); });
    setCounted(null);
    void Promise.all(dirs.map(d => window.api!.listImagePaths(d))).then(l => { if (live) setCounted(l.flat().length); });
    return () => { live = false; };
  }, [root, dirs]);

  // ---- scan progress: steps with their own clocks, info lines
  useEffect(() => inElectron ? window.api!.onDedupProgress((p: DedupProgress) => {
    setRun(r => {
      if (!r) return r;
      if (p.phase === "info" && p.key) return { ...r, info: { ...r.info, [p.key]: p.value ?? "" } };
      const prev = r.steps[p.phase];
      const t = Date.now();
      const step = { done: p.done, total: p.total, t0: prev?.t0 ?? t, t1: p.total > 0 && p.done >= p.total ? t : undefined };
      // a new phase closes the ones before it (a fully cached read reports 0 of 0 and never fills up)
      const steps = prev ? { ...r.steps } : Object.fromEntries(Object.entries(r.steps).map(([k, s]) => [k, s.t1 ? s : { ...s, t1: t }]));
      return { ...r, steps: { ...steps, [p.phase]: step } };
    });
  }) : undefined, []);
  useEffect(() => {
    if (!run) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [run]);

  /**
   * The "Same labels" scan, in this window: every image's size and boxes
   * through the loaders the Annotate tab uses — so any label format works —
   * then labelPairs. No Python, no pixels read.
   */
  const scanLabels = useCallback(async (images: string[]): Promise<{ result: ScanData; boxes: Map<string, BBox[]> }> => {
    const names = classes.map(c => c.name);
    const own = project ? norm(project.imageDir).toLowerCase() + "/" : "\0";
    const sizes = new Map<string, { width: number; height: number; size: number }>();
    const boxes = new Map<string, BBox[]>();
    const t0 = Date.now();
    const step = (done: number, t1?: number) =>
      setRun(r => r && { ...r, steps: { ...r.steps, read: { done, total: images.length, t0, t1 } } });
    step(0);
    for (let s = 0; s < images.length; s += 250) {
      if (cancelLabels.current) throw new Error("cancelled");
      const chunk = images.slice(s, s + 250);
      const mine = chunk.filter(p => norm(p).toLowerCase().startsWith(own)), other = chunk.filter(p => !norm(p).toLowerCase().startsWith(own));
      const none: Record<string, BBox[]> = {};
      const [meta, a, b] = await Promise.all([
        window.api!.loadImageMetadata(chunk),
        mine.length ? window.api!.loadAnnotationsBatch({ imagePaths: mine, classes: names, format, outputDir }) : none,
        other.length ? window.api!.loadAnnotationsBatch({ imagePaths: other, classes: names, format, outputDir: "" }) : none,
      ]);
      for (const m of meta) sizes.set(m.path, m);
      for (const [p, bx] of Object.entries({ ...a, ...b })) boxes.set(p, bx);
      step(s + chunk.length);
    }
    step(images.length, Date.now());
    const c0 = Date.now();
    setRun(r => r && { ...r, steps: { ...r.steps, compare: { done: 0, total: 1, t0: c0 } } });
    const pairs = labelPairs(images.map(p => ({ width: sizes.get(p)?.width ?? 0, height: sizes.get(p)?.height ?? 0, boxes: boxes.get(p) ?? [] })));
    setRun(r => r && { ...r, steps: { ...r.steps, compare: { done: 1, total: 1, t0: c0, t1: Date.now() } } });
    const items = images.map(p => ({ path: p, width: sizes.get(p)?.width ?? 0, height: sizes.get(p)?.height ?? 0, bytes: sizes.get(p)?.size ?? 0 }));
    return { result: { items, pairs, model: "none", deep: false, deepError: null, align: false }, boxes };
  }, [project, classes, format, outputDir]);

  const runScan = useCallback(async (withModel = model, withAlign = align) => {
    if (!scope || !root || run) return;
    const byLabels = withModel === "labels";
    const alignOn = withAlign && withModel !== "none" && !byLabels;
    setModel(withModel);
    setAlign(alignOn);
    setScanError(null);
    cancelLabels.current = false;
    setPicking(false);
    const started = Date.now();
    const guess = counted !== null ? estimateSeconds(counted, withModel, alignOn, {
      hashes: !!cacheInfo?.hashes, model: !!cacheInfo?.models.includes(withModel), align: !!cacheInfo?.align.includes(withModel),
    }) : null;
    setRun({ started, model: withModel, align: alignOn, images: counted ?? 0, guess, steps: { list: { done: 0, total: 1, t0: started } }, info: {} });
    try {
      const lists = await Promise.all(dirs.map(d => window.api!.listImagePaths(d)));
      const images = lists.flat();
      setRun(r => r && { ...r, images: images.length, steps: { ...r.steps, list: { done: 1, total: 1, t0: started, t1: Date.now() } } });
      if (!images.length) throw new Error(t("No images to scan"));
      let result: ScanData;
      let loaded = new Map<string, Facts>();
      if (byLabels) {
        const r = await scanLabels(images);
        result = r.result;
        loaded = new Map([...r.boxes].map(([p, b]) => [p, { boxes: b }]));
      } else {
        result = await window.api!.dedupScan({ images, root, model: withModel, align: alignOn, minCos: MODELS[withModel].floor });
      }
      const method: DupMethod = byLabels ? "labels" : result.deep ? result.model : "none";
      const label = modelName(method) + (result.align ? ` + ${t("pixel alignment")}` : "");
      setScan({ root, method, result, seconds: (Date.now() - started) / 1000, label });
      setRemoved(new Set());
      setKeepers(new Map());
      setFacts(loaded);
      setSelId(null);
      setKindFilter("all");
      const m = result.deep ? result.model : "none";
      setSens(s => presetName === "custom" ? { ...s, minCos: Math.max(MODELS[m].min, s.minCos) }
        : { ...preset(presetName, m), boxTol: s.boxTol, sameClass: s.sameClass });
      if (!byLabels) void window.api!.dedupCacheInfo(root).then(setCacheInfo);
      if (!byLabels && withModel !== "none" && !result.deep) {
        pushToast({ icon: "alert", sticky: true, msg: `${modelName(withModel)} ${t("could not run")}: ${result.deepError ?? ""}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/cancelled/.test(msg)) setScanError(msg);
    } finally {
      setRun(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, root, dirs, run, model, align, counted, cacheInfo, presetName, pushToast, scanLabels]);

  // ---- groups at the chosen sensitivity
  const items = scan?.result.items ?? [];
  const byLabels = scan?.method === "labels";
  const scanModel: DedupModel = scan ? (scan.result.deep ? scan.result.model : "none") : model === "labels" ? "none" : model;
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
  /** Matching pairs left out because the user marked them "not duplicates" — so an empty list is not mistaken for none found. */
  const hiddenPairs = useMemo(() => {
    if (!scan || !ignored.size) return 0;
    const r = scan.root;
    return scan.result.pairs.filter(p => pairKind(p, sens) && !removed.has(items[p[0]].path) && !removed.has(items[p[1]].path)
      && ignored.has(pairKey(rel(r, items[p[0]].path), rel(r, items[p[1]].path)))).length;
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
    if (!flicker || !active) return;
    const id = window.setInterval(() => setFlickPhase(p => p + 1), 650);
    return () => window.clearInterval(id);
  }, [flicker, active]);
  useEffect(() => {
    const el = listRef.current;
    if (!el || selIdx < 0) return;
    const top = selIdx * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
  }, [selIdx]);

  // ---- actions
  const choosePreset = (p: Preset) => { setPresetName(p); if (p !== "custom") setSens(preset(p, scanModel)); };
  const tweak = (patch: Partial<Sensitivity>) => { setPresetName("custom"); setSens(s => ({ ...s, ...patch })); };

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

  const removeGroups = useCallback(async (gs: DupGroup[]) => {
    if (!scan || busy) return;
    const list = gs.flatMap(g => {
      const keep = keepOf(g);
      const keeper = items[[...keep][0]].path;
      return g.members.filter(i => !keep.has(i)).map(i => {
        const p = g.pairs.find(pp => (pp.a === i && keep.has(pp.b)) || (pp.b === i && keep.has(pp.a))) ?? g.pairs[0];
        return { image: items[i].path, keeper, match: p.kind, hamming: p.kind === "labels" ? undefined : p.ham, cosine: p.cos >= 0 ? p.cos : undefined };
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
  }, [scan, busy, keepOf, items, beforeChange, outputDir, onRemoved, refreshUndo, pushToast, undo]);

  const removeAll = useCallback(async () => {
    if (!toRemove.length) return;
    const ask = fa
      ? `${toRemove.length} عکس از ${groups.length} گروه همراه لیبل‌هایشان از دیتاست بیرون برده شوند؟\nبه پوشهٔ ${root}.duplicates می‌روند و با «برگرداندن» برمی‌گردند.`
      : `Move ${toRemove.length} images from ${groups.length} groups out of the dataset, with their labels?\nThey go to ${root}.duplicates and Undo puts them back.`;
    if (!window.confirm(ask)) return;
    await removeGroups(groups);
  }, [toRemove, groups, fa, root, removeGroups]);

  // ---- keyboard: J/K or ↓/↑ groups, 1-9 keep only, Enter remove, I not duplicates, C compare, L labels, Ctrl+Z undo,
  //      Esc back from the method picker to the results
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target instanceof HTMLElement ? e.target.tagName : "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); void undo(); return; }
      if (e.key === "Escape" && picking && scan && !run) { setPicking(false); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || !scan || picking || run) return;
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
    return active ? <div className="workspace"><div className="empty"><div className="t-title">{t("Open a project first")}</div></div></div> : null;
  }
  const kindLabel: Record<MatchKind, string> = {
    exact: t("Exact copy"), near: t("Copy"), labels: t("Same labels"), aligned: t("Same photo"), similar: t("Look-alike"),
  };
  const presetOptions: { value: Preset; label: string }[] = [
    { value: "exact", label: t("Exact only") },
    { value: "copies", label: t("Copies") },
    { value: "frames", label: t("+ Crops & frames") },
    { value: "loose", label: t("Loose") },
    { value: "custom", label: t("Custom") },
  ];
  const estimate = counted !== null ? estimateSeconds(counted, model, align, {
    hashes: !!cacheInfo?.hashes, model: !!cacheInfo?.models.includes(model), align: !!cacheInfo?.align.includes(model),
  }) : null;
  const stronger = byLabels ? [] : MODEL_ORDER.slice(MODEL_ORDER.indexOf(scanModel) + 1);
  const canAlign = !!scan && !byLabels && !scan.result.align && scanModel !== "none";
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 8);
  const visible = groups.slice(start, start + 40);
  const noAlign = model === "none" || model === "labels";

  const picker = (<>
    <div className="dup-models">
      {MODEL_ORDER.map(m => (
        <button key={m} className={"dup-model" + (model === m ? " on" : "")} onClick={() => setModel(m)} disabled={!!run}>
          <div className="dup-model-head">
            <span className="dup-model-name">{m === "none" ? t("Fast") : m === "resnet50" ? t("Standard") : t("Strong")}</span>
            <span className="t-caption tsec">{modelName(m)}</span>
          </div>
          <span className="t-caption tsec">{m === "none"
            ? t("Only exact and resized / mirrored copies. No torch needed.")
            : m === "resnet50" ? t("Adds look-alikes: cropped, recoloured, video frames.")
              : t("Tells a changed copy from a different photo best. Downloads ~350 MB the first time.")}</span>
          {cacheInfo?.models.includes(m) && <span className="dup-cached">{t("scanned before — quick")}</span>}
        </button>
      ))}
      <label className={"dup-model dup-align" + (align && !noAlign ? " on" : "") + (noAlign ? " off" : "")}>
        <div className="dup-model-head">
          <Checkbox on={align && !noAlign} onChange={v => setAlign(v)} />
          <span className="dup-model-name">{t("+ Pixel alignment")}</span>
        </div>
        <span className="t-caption tsec">{t("Strongest: lines each image up with its nearest neighbours pixel by pixel — finds heavy crops, shifts and turns. Slower the first time.")}</span>
      </label>
    </div>
    <div className="t-caption tsec dup-section-title">{t("Or compare the labels")}</div>
    <button className={"dup-model dup-labels" + (model === "labels" ? " on" : "")} onClick={() => setModel("labels")} disabled={!!run}>
      <div className="dup-model-head">
        <span className="dup-model-name"><Icon name="tag" size={13} /> {t("Same labels")}</span>
        <span className="t-caption tsec">{t("no pixels read · seconds")}</span>
      </div>
      <span className="t-caption tsec">{t("Two images count as duplicates when they are the same size, have the same number of boxes, and every box sits in the same place — within 1 px, which you can change after the scan. The order of the boxes does not matter, nor their class unless you ask.")}</span>
      <span className="t-caption tsec">{t("Finds a copy saved under another name or re-exported with its labels, whatever was done to its pixels. Images without boxes are skipped. Frames of a still camera whose boxes did not move match too — compare those side by side before moving them out.")}</span>
    </button>
  </>);

  return (
    <div className="body dup-body" style={{ display: active ? undefined : "none" }}>
      <div className="workspace">
        <div className="wsbar">
          <div className="row gap-md" style={{ minWidth: 0 }}>
            <span className="t-title">{t("Duplicates")}</span>
            {scope && scope.splits.length > 0 && (
              <Segmented value={whole ? "all" : "one"} onChange={v => { if (!run) setWhole(v === "all"); }} options={[
                { value: "one", label: t("This folder") },
                { value: "all", label: `${t("Whole dataset")} · ${scope.splits.map(s => s.name).join(" · ")}` },
              ]} />
            )}
            {counted !== null && <span className="t-caption tsec tnum">{counted.toLocaleString()} {t("images")}</span>}
          </div>
          <div className="row gap-sm">
            {lastBatch && !run && (
              <button className="btn btn-secondary sm" onClick={() => void undo()} disabled={busy} title={`${lastBatch.batch} (Ctrl+Z)`}>
                <Icon name="undo" size={14} />{t("Undo last removal")} ({lastBatch.count})
              </button>
            )}
            {run ? (
              <button className="btn btn-secondary sm" onClick={() => {
                if (run.model === "labels") cancelLabels.current = true; else void window.api!.cancelDedupScan();
              }}>
                <Icon name="x" size={14} />{t("Cancel")}
              </button>
            ) : scan && !picking && (<>
              <button className="btn btn-secondary sm" onClick={() => setPicking(true)} title={t("Pick another way to look, and scan again")}>
                <Icon name="arrowLeft" size={14} className="rtl-flip" />{t("Change method")}
              </button>
              <button className="btn btn-primary sm" onClick={() => void runScan()} disabled={!scope}>
                <Icon name="scan" size={14} />{t("Rescan")}
              </button>
            </>)}
          </div>
        </div>

        {scanError && <div className="dup-error"><Icon name="alert" size={14} />{scanError}</div>}

        {run ? (
          <ScanProgress run={run} now={now} fa={fa} modelName={modelName} scopeText={
            scope && whole && scope.splits.length ? scope.splits.map(s => s.name).join(" · ") : t("This folder")} />
        ) : !scan || picking ? (
          <div className="dup-intro">
            <div className="dup-intro-top">
              <Icon name="copy" size={34} />
              <div>
                <div className="t-title">{t("Find duplicate images")}</div>
                <div className="t-body tsec">{t("Nothing is deleted: extras move, with their label files, to a folder beside the dataset, and Undo puts them back. A copy shared by train and test is the one that matters most — it makes test scores look better than they are.")}</div>
              </div>
            </div>
            <div className="t-caption tsec dup-section-title">{t("How hard to look")}</div>
            {picker}
            <div className="dup-intro-go">
              <button className="btn btn-primary lg" onClick={() => void runScan()} disabled={!scope}>
                <Icon name="scan" size={16} />{t("Scan for duplicates")}
              </button>
              {estimate !== null && <span className="t-body tsec">{counted!.toLocaleString()} {t("images")} · {durationText(estimate, fa)}</span>}
              {scan && (
                <button className="btn btn-ghost dup-back" onClick={() => setPicking(false)} title="Esc">
                  <Icon name="arrowLeft" size={14} className="rtl-flip" />{t("Back to the results")}
                  <span className="t-caption">{scan.label} · {scan.result.items.length.toLocaleString()} {t("images")}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="dup-summary">
              <span><Icon name="checkCircle" size={14} /> {t("Scanned")} <b className="tnum">{items.length.toLocaleString()}</b> {t("images with")} <b>{scan.label}</b> {t("in")} {clock(scan.seconds)}
                {hiddenPairs > 0 && <span className="tsec"> · <b className="tnum">{hiddenPairs.toLocaleString()}</b> {t("pairs you marked “Not duplicates” are hidden")}</span>}</span>
              {(stronger.length > 0 || canAlign) && (
                <span className="dup-stronger">
                  {t("Missing some?")}
                  {stronger.map(m => (
                    <button key={m} className="btn btn-ghost sm" onClick={() => void runScan(m, align)}>{t("Try")} {modelName(m)}</button>
                  ))}
                  {canAlign && (
                    <button className="btn btn-ghost sm" onClick={() => void runScan(scanModel, true)}>{t("+ Pixel alignment")}</button>
                  )}
                </span>
              )}
            </div>
            {byLabels ? (
              <div className="dup-controls">
                <span className="t-caption tsec">{t("Same size, same number of boxes, and box for box:")}</span>
                <div className="dup-sliders">
                  <div className="dup-slider">
                    <span>{t("every corner within")} <b className="tnum">{sens.boxTol} px</b></span>
                    <Slider value={sens.boxTol} min={0} max={MAX_BOX_TOL} step={0.5} onChange={v => setSens(s => ({ ...s, boxTol: v }))} width={140} />
                  </div>
                  <div className="dup-slider">
                    <Checkbox on={sens.sameClass} onChange={v => setSens(s => ({ ...s, sameClass: v }))} label={t("Classes must match too")} />
                  </div>
                </div>
              </div>
            ) : (
            <div className="dup-controls">
              <div className="row gap-sm" style={{ flexWrap: "wrap" }}>
                <span className="t-caption tsec">{t("Sensitivity")}</span>
                <Segmented value={presetName} onChange={choosePreset} options={presetOptions} />
              </div>
              <div className="dup-sliders">
                <label className={"dup-slider" + (sens.near ? "" : " off")}>
                  <Checkbox on={sens.near} onChange={v => tweak({ near: v })} />
                  <span>{t("Copies: hash distance")} ≤ <b className="tnum">{sens.maxHam}</b></span>
                  <Slider value={sens.maxHam} min={0} max={12} step={1} onChange={v => tweak({ maxHam: v })} width={120} />
                </label>
                {scan.result.align && (
                  <label className={"dup-slider" + (sens.aligned ? "" : " off")}>
                    <Checkbox on={sens.aligned} onChange={v => tweak({ aligned: v })} />
                    <span>{t("Same photo (aligned)")}</span>
                  </label>
                )}
                {scanModel !== "none" && (
                  <label className={"dup-slider" + (sens.similar ? "" : " off")}>
                    <Checkbox on={sens.similar} onChange={v => tweak({ similar: v })} />
                    <span>{t("Look-alikes: similarity")} ≥ <b className="tnum">{sens.minCos.toFixed(2)}</b></span>
                    <Slider value={Math.max(MODELS[scanModel].min, sens.minCos)} min={MODELS[scanModel].min} max={0.99} step={0.01}
                      onChange={v => tweak({ minCos: v })} width={120} />
                  </label>
                )}
              </div>
            </div>
            )}

            <div className="dup-kpis">
              <div className="kpi"><div className="num tnum">{groups.length.toLocaleString()}</div><div className="lbl">{t("groups")}</div></div>
              <div className="kpi"><div className="num tnum">{toRemove.length.toLocaleString()}</div><div className="lbl">{t("images to move out")}</div></div>
              <div className="kpi"><div className="num tnum" style={{ color: crossCount ? "var(--warning)" : undefined }}>{crossCount.toLocaleString()}</div><div className="lbl">{t("groups across splits")}</div></div>
              <div className="kpi"><div className="num tnum">{bytesText(freed)}</div><div className="lbl">{t("freed")}</div></div>
            </div>

            <div className="dup-main">
              <div className="dup-list-col">
                <div className="dup-list-head">
                  {!byLabels && <Segmented value={kindFilter} onChange={setKindFilter} options={[
                    { value: "all", label: t("All") }, { value: "exact", label: t("Exact") },
                    { value: "near", label: t("Copies") },
                    ...(scan.result.align ? [{ value: "aligned" as const, label: t("Same photo") }] : []),
                    ...(scanModel !== "none" ? [{ value: "similar" as const, label: t("Look-alikes") }] : []),
                  ]} />}
                  {scope && scope.splits.length > 0 && whole && (
                    <Checkbox on={crossOnly} onChange={setCrossOnly} label={t("Across splits only")} />
                  )}
                </div>
                <div className="dup-list" ref={listRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
                  {groups.length === 0 ? (
                    <div className="dup-none">
                      <Icon name="checkCircle" size={28} />
                      <b>{byLabels ? t("No two images share their size and boxes") : t("No duplicates at this sensitivity")}</b>
                      <button className="btn btn-secondary sm" onClick={() => setPicking(true)}>
                        <Icon name="arrowLeft" size={13} className="rtl-flip" />{t("Choose another method")}
                      </button>
                      {(stronger.length > 0 || canAlign) && <span>{t("A stronger model may find what this one missed:")}</span>}
                      {stronger.map(m => (
                        <button key={m} className="btn btn-secondary sm" onClick={() => void runScan(m, align)}>
                          <Icon name="scan" size={13} />{t("Scan with")} {modelName(m)}
                        </button>
                      ))}
                      {canAlign && (
                        <button className="btn btn-secondary sm" onClick={() => void runScan(scanModel, true)}>
                          <Icon name="scan" size={13} />{t("+ Pixel alignment")}
                        </button>
                      )}
                    </div>
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
                                <span className="t-caption tnum">{g.kind === "similar" ? `${g.maxCos.toFixed(3)}` : g.kind === "near" ? `Δ${g.minHam}`
                                  : g.kind === "labels" ? `${items[g.members[0]].width}×${items[g.members[0]].height}` : ""}</span>
                                {g.pairs.some(p => p.kind === "labels" && !p.sameClass) && <span className="dup-cls-diff">{t("classes differ")}</span>}
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
                {!sel ? <div className="dup-none">{groups.length ? t("Pick a group") : ""}</div> : (
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
                        <button className="btn btn-primary sm" onClick={() => void removeGroups([sel])} disabled={busy} title="Enter">
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

/** The scan as a list of steps, each with its own count, speed and clock, plus the time left. */
function ScanProgress({ run, now, fa, modelName, scopeText }: {
  run: Run; now: number; fa: boolean; modelName: (m: DupMethod) => string; scopeText: string;
}) {
  const elapsed = (now - run.started) / 1000;
  const cached = +(run.info.cached ?? NaN);
  const todo = +(run.info.todo ?? NaN);
  const device = run.info.device === "cuda" ? "GPU" : run.info.device === "cpu" ? "CPU" : "";
  type Step = { id: string; title: string; detail?: string };
  const listStep: Step = { id: "list", title: t("List the images"), detail: run.images ? `${run.images.toLocaleString()} ${t("images")} · ${scopeText}` : scopeText };
  const steps: Step[] = run.model === "labels" ? [
    listStep,
    { id: "read", title: t("Read each image's size and label file") },
    { id: "compare", title: t("Compare the boxes of images with the same size and box count") },
  ] : [
    listStep,
    ...(run.model !== "none" ? [{
      id: "load", title: `${t("Load")} ${modelName(run.model)}`,
      detail: [device, run.model === "dinov2" ? t("the first time it downloads ~350 MB") : ""].filter(Boolean).join(" · "),
    }] : []),
    { id: "read", title: run.model === "none" ? t("Read and hash every image") : t("Read, hash and describe every image"),
      detail: Number.isFinite(cached) ? `${cached.toLocaleString()} ${t("cached from an earlier scan")} · ${todo.toLocaleString()} ${t("to read")}` : undefined },
    { id: "compare", title: t("Compare every image with every other") },
    ...(run.align ? [{ id: "align", title: t("Line up each image with its nearest neighbours, pixel by pixel"),
      detail: run.info.align_pairs ? `${(+run.info.align_pairs).toLocaleString()} ${t("pairs")}` : undefined }] : []),
  ];
  const order = steps.map(s => s.id);
  const current = [...order].reverse().find(id => run.steps[id]) ?? "list";
  const left = (() => {
    const st = run.steps[current];
    if (!st || !st.total || st.done <= 0) return run.guess !== null ? Math.max(1, run.guess - elapsed) : null;
    const rate = st.done / Math.max(0.5, (now - st.t0) / 1000);
    let sec = (st.total - st.done) / rate;
    if (current === "read" && run.align) sec += (run.images * 2.2) / 60;   // alignment still to come
    return sec;
  })();
  return (
    <div className="dup-scan">
      <div className="dup-scan-head">
        <div className="dup-scan-spin" />
        <div>
          <div className="t-title">{t("Looking for duplicates")}</div>
          <div className="t-body tsec tnum">
            {t("elapsed")} {clock(elapsed)}{left !== null ? ` · ${t("left")} ${durationText(left, fa)}` : ""}
          </div>
        </div>
      </div>
      <ol className="dup-steps">
        {steps.map(s => {
          const st = run.steps[s.id];
          const state = st?.t1 ? "done" : st ? "now" : "wait";
          const pct = st?.total ? Math.min(100, (st.done / st.total) * 100) : 0;
          const rate = st && st.total > 1 && st.done > 0 ? st.done / Math.max(0.5, ((st.t1 ?? now) - st.t0) / 1000) : null;
          return (
            <li key={s.id} className={"dup-step " + state}>
              <span className="dup-step-mark">{state === "done" ? <Icon name="check" size={12} /> : state === "now" ? <span className="dup-dot" /> : null}</span>
              <div className="dup-step-body">
                <div className="dup-step-line">
                  <span className="dup-step-title">{s.title}</span>
                  <span className="t-caption tsec tnum">
                    {[
                      st && st.total > 1 ? `${st.done.toLocaleString()} / ${st.total.toLocaleString()}` : "",
                      rate && s.id !== "compare" ? `${Math.round(rate)}/s` : "",
                      st?.t1 ? clock((st.t1 - st.t0) / 1000) : "",
                    ].filter(Boolean).join(" · ")}
                  </span>
                </div>
                {s.detail && <div className="t-caption tsec">{s.detail}</div>}
                {state === "now" && st && st.total > 1 && (
                  <div className="dup-progress-bar"><div style={{ width: `${pct}%` }} /></div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="t-caption tsec dup-scan-foot">
        <Icon name="info" size={13} />{run.model === "labels" ? t("You can switch to another tab — the scan keeps running.")
          : t("You can switch to another tab — the scan keeps running, and a second scan of the same images takes seconds.")}
      </div>
    </div>
  );
}

function DupCard({ i, items, splitOf, facts, showLabels, classColor, keep, index, pair, onToggle, big, fa }: {
  i: number; items: DedupScanResult["items"]; splitOf: (p: string) => string; facts: Map<string, Facts>;
  showLabels: boolean; classColor: (k: string) => string; keep: boolean; index: number;
  pair?: GroupPair; onToggle: () => void; big?: boolean; fa: boolean;
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
            {pair.kind === "exact" ? t("identical file")
              : pair.kind === "aligned" ? t("lines up pixel for pixel")
                : pair.kind === "labels" ? (pair.boxDev > 0 ? `${t("same size and boxes, corners within")} ${pair.boxDev} px` : t("same size and boxes, exactly"))
                  : `${t("hash distance")} ${pair.ham}${pair.cos >= 0 ? ` · ${t("similarity")} ${pair.cos.toFixed(3)}` : ""}`}
            {pair.mirrored ? ` · ${t("mirrored")}` : ""}
            {pair.kind === "labels" && !pair.sameClass && <> · <span className="dup-cls-diff">{t("classes differ")}</span></>}
          </div>
        )}
      </div>
    </div>
  );
}
