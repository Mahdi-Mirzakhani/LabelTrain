// Review list helpers — pure, so the tests can run them without a window.
//
// The list itself comes from .labeler_review.json (electron/review.ts). Here:
// which rows the file list shows and in what order, how the arrow keys walk
// that order, and the short text that says why an image was flagged.

import type { ReviewFlag } from "../electron-api";

/**
 * Indices of the images to list, in the order to list them: every index `keep`
 * accepts, by `score` (highest first, ties by position) when one is given,
 * otherwise in folder order.
 */
export function listOrder(n: number, keep: (i: number) => boolean, score?: (i: number) => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep(i)) out.push(i);
  if (score) {
    const s = new Map(out.map(i => [i, score(i)]));
    out.sort((a, b) => (s.get(b)! - s.get(a)!) || a - b);
  }
  return out;
}

/**
 * Where next / previous goes from image `cur` when the list shows `order`:
 * the neighbour in that order, or `cur` itself at either end. When `cur` is
 * not listed (the filter just changed), a folder-order list continues from
 * the nearest listed image on that side, and a ranked list starts at its top.
 */
export function stepInOrder(order: number[], cur: number, d: number, ranked = false): number {
  const pos = order.indexOf(cur);
  if (pos >= 0) {
    const t = pos + d;
    return t >= 0 && t < order.length ? order[t] : cur;
  }
  if (order.length === 0) return cur;
  if (ranked) return d > 0 ? order[0] : cur;
  if (d > 0) return order.find(i => i > cur) ?? cur;
  for (let k = order.length - 1; k >= 0; k--) if (order[k] < cur) return order[k];
  return cur;
}

const NAMES_FA: Record<string, string> = { helmet: "کلاه", head: "سر" };

function className(names: string[], i: number | undefined, fa: boolean): string {
  const n = i !== undefined && i >= 0 ? names[i] ?? `#${i}` : "?";
  return fa ? NAMES_FA[n] ?? n : n;
}

/** The label drawn on the canvas beside a flagged spot. */
export function flagText(f: ReviewFlag, names: string[], fa: boolean): string {
  const n = className(names, f.cls, fa);
  switch (f.kind) {
    case "missing": return fa ? `${n} بی‌برچسب؟` : `unlabelled ${n}?`;
    case "too big": return fa ? "جعبه‌ی بزرگ؟" : "box too big?";
    case "wrong class": return fa ? `${className(names, f.other, fa)}؟ نه ${n}` : `${className(names, f.other, fa)}, not ${n}?`;
    case "empty": return fa ? "چیزی زیرش نیست؟" : "nothing under it?";
  }
}

const SHORT: Record<ReviewFlag["kind"], [string, string]> = {
  "missing": ["unlabelled", "بی‌برچسب"],
  "too big": ["too big", "بزرگ"],
  "wrong class": ["wrong class", "کلاس"],
  "empty": ["empty", "خالی"],
};

/** One line for the file list: "2 unlabelled · 1 too big". */
export function flagSummary(flags: ReviewFlag[], fa: boolean): string {
  const counts = new Map<ReviewFlag["kind"], number>();
  for (const f of flags) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  return [...counts].map(([k, c]) => `${c} ${SHORT[k][fa ? 1 : 0]}`).join(" · ");
}
