// Duplicates tab — pure logic, so the tests can run it without a window.
//
// The scanner (scripts/dedup_scan.py) lists every pair of images that is close
// by any measure, with all its measures. Here those pairs are turned into
// groups for whatever sensitivity the user picks — instantly, no rescan —
// and each group gets a suggested image to keep.

import type { DedupPair } from "../electron-api";

export type MatchKind = "exact" | "near" | "similar";
const RANK: Record<MatchKind, number> = { exact: 0, near: 1, similar: 2 };

/** Which pairs count as duplicates. */
export interface Sensitivity {
  near: boolean;     // perceptual hash: resized, re-saved, mirrored, letterboxed
  maxHam: number;    // ... at most this many of 64 bits apart
  similar: boolean;  // CNN features: crops, zooms, colour changes, video frames
  minCos: number;    // ... at least this cosine similarity
}

export const PRESETS: Record<"exact" | "copies" | "frames" | "loose", Sensitivity> = {
  exact: { near: false, maxHam: 0, similar: false, minCos: 1 },
  copies: { near: true, maxHam: 4, similar: false, minCos: 1 },
  frames: { near: true, maxHam: 6, similar: true, minCos: 0.95 },
  loose: { near: true, maxHam: 8, similar: true, minCos: 0.92 },
};

/** How a pair matches at this sensitivity, or null when it does not. Exact copies always count. */
export function pairKind(p: DedupPair, s: Sensitivity): MatchKind | null {
  if (p[2]) return "exact";
  if (s.near && p[3] <= s.maxHam) return "near";
  if (s.similar && p[4] >= 0 && p[4] >= s.minCos) return "similar";
  return null;
}

export interface GroupPair { a: number; b: number; kind: MatchKind; ham: number; cos: number; mirrored: boolean; }
export interface DupGroup {
  id: string;              // stable while the scan result stands: the lowest member index
  members: number[];       // item indices, ascending
  kind: MatchKind;         // the strongest match inside the group
  minHam: number;
  maxCos: number;          // -1 when the deep level was off
  pairs: GroupPair[];
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}\n${b}` : `${b}\n${a}`;
}

/**
 * Union the matching pairs into groups. `skip(a, b)` drops a pair the user
 * marked as not duplicates, so a look-alike chain is cut exactly there.
 * Strongest groups first: exact, then the closest hashes, then the most similar.
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
