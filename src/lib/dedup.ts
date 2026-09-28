// Duplicates tab — pure logic, so the tests can run it without a window.
//
// The scanner (scripts/dedup_scan.py) lists every pair of images that is close
// by any measure, with all its measures; the label comparison (labelPairs)
// lists pairs whose boxes agree. Here those pairs are turned into groups for
// whatever sensitivity the user picks — instantly, no rescan — and each group
// gets a suggested image to keep.

import type { DedupModel, DedupPair } from "../electron-api";

/** How to look: by the pictures (hashes, then a model) or by the label files. */
export type DupMethod = DedupModel | "labels";

export type MatchKind = "exact" | "near" | "labels" | "aligned" | "similar";
const RANK: Record<MatchKind, number> = { exact: 0, near: 1, labels: 2, aligned: 3, similar: 4 };

/**
 * A scanner pair — [a, b, exact 0/1, hamming 0..64, cosine or -1, mirrored 0/1,
 * aligned 0/1] — or a label pair, with two more: the largest corner difference
 * of its boxes in pixels, and whether every matched box has the same class.
 */
export type Pair = DedupPair | [number, number, number, number, number, number, number, number, number];

/** Which pairs count as duplicates. */
export interface Sensitivity {
  near: boolean;     // perceptual hash: resized, re-saved, mirrored, letterboxed
  maxHam: number;    // ... at most this many of 64 bits apart
  aligned: boolean;  // lined up pixel for pixel: cropped, shifted, scaled, turned
  similar: boolean;  // model features: crops, zooms, colour changes, video frames
  minCos: number;    // ... at least this cosine similarity
  labels: boolean;   // same size, same number of boxes, same box corners
  boxTol: number;    // ... every corner at most this many pixels apart
  sameClass: boolean; // ... and every box of the same class too
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
  const labels = { labels: true, boxTol: 1, sameClass: false };
  switch (name) {
    case "exact": return { near: false, maxHam: 0, aligned: false, similar: false, minCos: 1, ...labels };
    case "copies": return { near: true, maxHam: 4, aligned: true, similar: false, minCos: 1, ...labels };
    case "frames": return { near: true, maxHam: 6, aligned: true, similar: features, minCos: m.frames, ...labels };
    case "loose": return { near: true, maxHam: 8, aligned: true, similar: features, minCos: m.loose, ...labels };
  }
}

/** The ResNet50 presets, by name. */
export const PRESETS: Record<PresetName, Sensitivity> = {
  exact: preset("exact"), copies: preset("copies"), frames: preset("frames"), loose: preset("loose"),
};

/** How a pair matches at this sensitivity, or null when it does not. Exact copies always count. */
export function pairKind(p: Pair, s: Sensitivity): MatchKind | null {
  if (p[2]) return "exact";
  if (s.near && p[3] <= s.maxHam) return "near";
  const q = p as readonly number[];
  if (s.labels && (q[7] ?? -1) >= 0 && q[7] <= s.boxTol + 1e-6 && (!s.sameClass || q[8])) return "labels";
  if (s.aligned && p[6]) return "aligned";
  if (s.similar && p[4] >= 0 && p[4] >= s.minCos) return "similar";
  return null;
}

export interface GroupPair {
  a: number; b: number; kind: MatchKind; ham: number; cos: number; mirrored: boolean;
  boxDev: number;          // largest box-corner difference in pixels; -1 when the labels were not compared
  sameClass: boolean;
}
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
export function groupPairs(n: number, pairs: Pair[], s: Sensitivity, skip: (a: number, b: number) => boolean = () => false): DupGroup[] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const kept: GroupPair[] = [];
  for (const p of pairs) {
    const kind = pairKind(p, s);
    if (!kind || skip(p[0], p[1])) continue;
    const q = p as readonly number[];
    kept.push({ a: p[0], b: p[1], kind, ham: p[3], cos: p[4], mirrored: !!p[5], boxDev: q[7] ?? -1, sameClass: q[8] !== 0 });
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

// ---------------------------------------------------------------- same labels

/** What the label comparison needs of an image: its size and its boxes, in pixels. */
export interface LabelFacts {
  width: number; height: number;
  boxes: { cls: string; x1: number; y1: number; x2: number; y2: number; r?: number }[];
}

/** The largest corner difference, in pixels, the label comparison lists; the slider goes up to it. */
export const MAX_BOX_TOL = 8;

/**
 * Match two images' boxes one to one, in any order: each box of `a` takes the
 * closest unused box of `b`, closeness being the largest of its four corner
 * differences. Null when some box has no partner within `tol` pixels (or, for
 * rotated boxes, within 0.02 rad of turn).
 */
export function matchBoxes(a: LabelFacts["boxes"], b: LabelFacts["boxes"], tol: number): { dev: number; sameClass: boolean } | null {
  if (a.length !== b.length) return null;
  const used = new Array<boolean>(b.length).fill(false);
  let dev = 0, sameClass = true;
  for (const p of a) {
    let best = -1, bestD = Infinity;
    for (let j = 0; j < b.length; j++) {
      const q = b[j];
      if (used[j] || Math.abs((p.r ?? 0) - (q.r ?? 0)) > 0.02) continue;
      const d = Math.max(Math.abs(p.x1 - q.x1), Math.abs(p.y1 - q.y1), Math.abs(p.x2 - q.x2), Math.abs(p.y2 - q.y2));
      // equally close: prefer the box of the same class
      if (d < bestD || (d === bestD && q.cls === p.cls && b[best].cls !== p.cls)) { best = j; bestD = d; }
    }
    if (best < 0 || bestD > tol + 1e-6) return null;
    used[best] = true;
    dev = Math.max(dev, bestD);
    if (b[best].cls !== p.cls) sameClass = false;
  }
  return { dev: Math.round(dev * 100) / 100, sameClass };
}

/**
 * Images with the same labels: the same width and height, the same number of
 * boxes (at least one — or every empty image of a size would match) and, box
 * for box, corners at most `maxTol` pixels apart. Each pair keeps its largest
 * corner difference and whether the classes agree, so the tolerance slider and
 * "classes too" regroup without comparing again.
 *
 * Only images of one size and box count are compared, and among those only
 * ones whose corner sums lie within 4 x boxes x maxTol of each other — boxes
 * that match corner by corner cannot differ by more — so 15,000 images take
 * well under a second.
 */
export function labelPairs(facts: LabelFacts[], maxTol = MAX_BOX_TOL): Pair[] {
  const buckets = new Map<string, number[]>();
  facts.forEach((f, i) => {
    if (!f.boxes.length || !(f.width > 0) || !(f.height > 0)) return;
    const key = `${f.width}x${f.height}#${f.boxes.length}`;
    const list = buckets.get(key);
    if (list) list.push(i); else buckets.set(key, [i]);
  });
  const out: Pair[] = [];
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const reach = 4 * facts[members[0]].boxes.length * maxTol + 1e-6;
    const keyed = members
      .map(i => ({ i, sum: facts[i].boxes.reduce((s, b) => s + b.x1 + b.y1 + b.x2 + b.y2, 0) }))
      .sort((x, y) => x.sum - y.sum);
    for (let x = 0; x < keyed.length; x++) {
      for (let y = x + 1; y < keyed.length && keyed[y].sum - keyed[x].sum <= reach; y++) {
        const m = matchBoxes(facts[keyed[x].i].boxes, facts[keyed[y].i].boxes, maxTol);
        if (!m) continue;
        const a = Math.min(keyed[x].i, keyed[y].i), b = Math.max(keyed[x].i, keyed[y].i);
        out.push([a, b, 0, 64, -1, 0, 0, m.dev, m.sameClass ? 1 : 0]);
      }
    }
  }
  return out;
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
 * Images a second the label comparison reads (the image's header and its label
 * file): 14,458 in 3.8 s once in the OS cache; a cold hard disk is slower.
 */
export const LABEL_RATE = 1000;

/**
 * A rough time for a scan, before it starts. Measured on a GTX 1660 Ti and a
 * hard disk: a first read ~50 images/s (the disk is the limit; hashes alone
 * ~120/s), a cached one ~2,000/s; alignment ~3 neighbour pairs per image at
 * ~60 pairs/s, cached ~5,000/s; loading the model 5-10 s.
 */
export function estimateSeconds(n: number, model: DupMethod, align: boolean,
  cached: { hashes: boolean; model: boolean; align: boolean }): number {
  if (model === "labels") return Math.max(2, Math.round(1 + n / LABEL_RATE));
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
