// Duplicates tab — pure logic, so the tests can run it without a window.
//
// The scanner (scripts/dedup_scan.py) lists every pair of images that is close
// by any measure, with all its measures. Here those pairs are turned into
// groups for whatever sensitivity the user picks — instantly, no rescan —
// and each group gets a suggested image to keep.

import type { DedupModel, DedupPair } from "../electron-api";

export type MatchKind = "exact" | "near" | "aligned" | "similar";
const RANK: Record<MatchKind, number> = { exact: 0, near: 1, aligned: 2, similar: 3 };

/** Which pairs count as duplicates. */
export interface Sensitivity {
  near: boolean;     // perceptual hash: resized, re-saved, mirrored, letterboxed
  maxHam: number;    // ... at most this many of 64 bits apart
  aligned: boolean;  // lined up pixel for pixel: cropped, shifted, scaled, turned
  similar: boolean;  // model features: crops, zooms, colour changes, video frames
  minCos: number;    // ... at least this cosine similarity
}

/**
 * Per model: the lowest similarity the scan lists (`floor`), the default of the
 * "+ crops & frames" and "loose" presets, and the slider's range. Calibrated on
 * a helmet dataset — 31 known duplicates against 1,500 random images: ResNet50
 * at 0.93 finds 23 of them with ~2 stray pairs per 1,500 images; DINOv2 at 0.90
 * finds 12 of the 14 true copies (ResNet50 at the same stray rate: 8).
 */
export const MODELS: Record<DedupModel, { floor: number; frames: number; loose: number; min: number }> = {
  none: { floor: 1, frames: 1, loose: 1, min: 0.85 },
  resnet50: { floor: 0.85, frames: 0.93, loose: 0.90, min: 0.85 },
  dinov2: { floor: 0.80, frames: 0.90, loose: 0.85, min: 0.80 },
};

export type PresetName = "exact" | "copies" | "frames" | "loose";

export function preset(name: PresetName, model: DedupModel = "resnet50"): Sensitivity {
  const m = MODELS[model];
  const features = model !== "none";
  switch (name) {
    case "exact": return { near: false, maxHam: 0, aligned: false, similar: false, minCos: 1 };
    case "copies": return { near: true, maxHam: 4, aligned: true, similar: false, minCos: 1 };
    case "frames": return { near: true, maxHam: 6, aligned: true, similar: features, minCos: m.frames };
    case "loose": return { near: true, maxHam: 8, aligned: true, similar: features, minCos: m.loose };
  }
}

/** The ResNet50 presets, by name. */
export const PRESETS: Record<PresetName, Sensitivity> = {
  exact: preset("exact"), copies: preset("copies"), frames: preset("frames"), loose: preset("loose"),
};

/** How a pair matches at this sensitivity, or null when it does not. Exact copies always count. */
export function pairKind(p: DedupPair, s: Sensitivity): MatchKind | null {
  if (p[2]) return "exact";
  if (s.near && p[3] <= s.maxHam) return "near";
  if (s.aligned && p[6]) return "aligned";
  if (s.similar && p[4] >= 0 && p[4] >= s.minCos) return "similar";
  return null;
}

export interface GroupPair { a: number; b: number; kind: MatchKind; ham: number; cos: number; mirrored: boolean; }
export interface DupGroup {
  id: string;              // stable while the scan result stands: the lowest member index
  members: number[];       // item indices, ascending
  kind: MatchKind;         // the strongest match inside the group
  minHam: number;
  maxCos: number;          // -1 when there were no model features
  pairs: GroupPair[];
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}\n${b}` : `${b}\n${a}`;
}

/**
 * Union the matching pairs into groups. `skip(a, b)` drops a pair the user
 * marked as not duplicates, so a look-alike chain is cut exactly there.
 * Strongest groups first: exact, copies, same photo lined up, then look-alikes.
 */
export function groupPairs(n: number, pairs: DedupPair[], s: Sensitivity, skip: (a: number, b: number) => boolean = () => false): DupGroup[] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const kept: GroupPair[] = [];
  for (const p of pairs) {
    const kind = pairKind(p, s);
    if (!kind || skip(p[0], p[1])) continue;
    kept.push({ a: p[0], b: p[1], kind, ham: p[3], cos: p[4], mirrored: !!p[5] });
    const ra = find(p[0]), rb = find(p[1]);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  const byRoot = new Map<number, DupGroup>();
  for (const gp of kept) {
    const r = find(gp.a);
    let g = byRoot.get(r);
    if (!g) {
      g = { id: "", members: [], kind: gp.kind, minHam: 64, maxCos: -1, pairs: [] };
      byRoot.set(r, g);
    }
    g.pairs.push(gp);
    if (RANK[gp.kind] < RANK[g.kind]) g.kind = gp.kind;
    g.minHam = Math.min(g.minHam, gp.ham);
    g.maxCos = Math.max(g.maxCos, gp.cos);
  }
  for (const g of byRoot.values()) {
    const m = new Set<number>();
    for (const gp of g.pairs) { m.add(gp.a); m.add(gp.b); }
    g.members = [...m].sort((x, y) => x - y);
    g.id = `g${g.members[0]}`;
  }
  return [...byRoot.values()].sort((x, y) =>
    RANK[x.kind] - RANK[y.kind] || x.minHam - y.minHam || y.maxCos - x.maxCos || x.members[0] - y.members[0]);
}

export interface KeepFacts { boxes: number; split: string; pixels: number; bytes: number; }

/**
 * The member to keep, by these rules in order: it has boxes; it sits in the
 * earliest split of `splitOrder` (by default test, then valid, then train, so
 * the evaluation sets keep their size while the leak into train disappears);
 * it has more boxes; more pixels; the bigger file; the lower index.
 */
export function suggestKeeper(members: number[], facts: (i: number) => KeepFacts,
  splitOrder: string[] = ["test", "valid", "val", "train"]): number {
  const rank = (s: string) => { const r = splitOrder.indexOf(s); return r < 0 ? splitOrder.length : r; };
  return [...members].sort((a, b) => {
    const fa = facts(a), fb = facts(b);
    return Number(fb.boxes > 0) - Number(fa.boxes > 0) || rank(fa.split) - rank(fb.split)
      || fb.boxes - fa.boxes || fb.pixels - fa.pixels || fb.bytes - fa.bytes || a - b;
  })[0];
}

/** Human size: "3.2 MB". */
export function bytesText(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * A rough time for a scan, before it starts. Measured on a GTX 1660 Ti and a
 * hard disk: a first read ~50 images/s (the disk is the limit; hashes alone
 * ~120/s), a cached one ~2,000/s; alignment ~3 neighbour pairs per image at
 * ~60 pairs/s, cached ~5,000/s; loading the model 5-10 s.
 */
export function estimateSeconds(n: number, model: DedupModel, align: boolean,
  cached: { hashes: boolean; model: boolean; align: boolean }): number {
  const readRate = cached.hashes && (model === "none" || cached.model) ? 2000 : model === "none" ? 120 : 50;
  let s = (model === "none" ? 1 : model === "dinov2" ? 10 : 5) + n / readRate + n / 1500;
  if (align && model !== "none") s += (n * 2.2) / (cached.align ? 5000 : 60);
  return Math.max(2, Math.round(s));
}

/** "about 5 min", "about 40 s", "under 10 s" — or the Persian. */
export function durationText(sec: number, fa: boolean): string {
  if (sec < 10) return fa ? "کمتر از ۱۰ ثانیه" : "under 10 s";
  if (sec < 90) {
    const s = Math.round(sec / 5) * 5;
    return fa ? `حدود ${s} ثانیه` : `about ${s} s`;
  }
  const m = Math.round(sec / 60);
  return fa ? `حدود ${m} دقیقه` : `about ${m} min`;
}

/** 83 -> "1:23". */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
