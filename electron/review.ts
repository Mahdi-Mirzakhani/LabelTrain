// Review list — the images an audit thinks need a human look, most urgent
// first, each with the flags that put it there (an unlabelled object, a box far
// bigger than what it holds, the wrong class, a box on nothing). The helmet
// project's datasets/label_audit.py writes it; any tool can, in this shape:
//
//   { "items": [ { "name": "a.jpg", "score": 1.4,
//                  "flags": [ { "kind": "missing", "cls": 1, "conf": 0.9,
//                               "box": [x0, y0, x1, y1] } ] } ] }
//
// with boxes normalised to 0..1. The app only reads it: re-running the audit
// replaces it, and the user's progress through it is the review marks in
// .labeler_progress.json. Anything malformed is dropped rather than trusted.

import fs from "node:fs/promises";
import path from "node:path";
import type { ReviewFlag, ReviewItem, ReviewKind, ReviewList } from "./ipc-types.ts";

export const REVIEW_FILE = ".labeler_review.json";
const KINDS = new Set<ReviewKind>(["missing", "too big", "wrong class", "empty"]);

type Box = [number, number, number, number];

function toBox(v: unknown): Box | null {
  if (!Array.isArray(v) || v.length !== 4 || !v.every(x => typeof x === "number" && Number.isFinite(x))) return null;
  const [x0, y0, x1, y1] = v as Box;
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
}

export async function loadReview(folder: string): Promise<ReviewList | null> {
  let obj: any;
  try {
    obj = JSON.parse(await fs.readFile(path.join(folder, REVIEW_FILE), "utf-8"));
  } catch {
    return null;
  }
  if (!obj || !Array.isArray(obj.items)) return null;
  const items: ReviewItem[] = [];
  for (const it of obj.items) {
    if (typeof it?.name !== "string" || !it.name) continue;
    const flags: ReviewFlag[] = [];
    for (const f of Array.isArray(it.flags) ? it.flags : []) {
      const box = toBox(f?.box);
      if (!box || !KINDS.has(f.kind)) continue;
      const inner = toBox(f.inner);
      flags.push({
        kind: f.kind,
        cls: Number.isInteger(f.cls) ? f.cls : -1,
        conf: typeof f.conf === "number" ? f.conf : 0,
        box,
        ...(inner ? { inner } : {}),
        ...(Number.isInteger(f.other) ? { other: f.other } : {}),
      });
    }
    if (flags.length) items.push({ name: it.name, score: typeof it.score === "number" ? it.score : 0, flags });
  }
  return {
    created: typeof obj.created === "string" ? obj.created : "",
    classes: Array.isArray(obj.classes) ? obj.classes.filter((s: unknown): s is string => typeof s === "string") : [],
    items,
  };
}
