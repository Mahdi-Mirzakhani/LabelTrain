// Review progress — which images the user has looked at in a folder and where
// they stopped, so a long review can be picked up where it was left.
//
// Kept in its own file beside the images rather than in .labeler_project.json:
// the project object is also copied into the recent-projects list, and a list
// of every reviewed file name (tens of thousands on a big dataset) does not
// belong there. Names, not indices, so the marks survive files being added or
// removed; a name that no longer exists is simply never shown.

import fs from "node:fs/promises";
import path from "node:path";
import type { ReviewProgress } from "./ipc-types.ts";

export const PROGRESS_FILE = ".labeler_progress.json";

const EMPTY: ReviewProgress = { reviewed: [], last: null };

export async function loadProgress(folder: string): Promise<ReviewProgress> {
  let obj: unknown;
  try {
    obj = JSON.parse(await fs.readFile(path.join(folder, PROGRESS_FILE), "utf-8"));
  } catch {
    return { ...EMPTY };
  }
  const o = obj as { reviewed?: unknown; last?: unknown } | null;
  return {
    reviewed: Array.isArray(o?.reviewed) ? o.reviewed.filter((x): x is string => typeof x === "string") : [],
    last: typeof o?.last === "string" ? o.last : null,
  };
}

// One write at a time per file: two overlapping saves could otherwise rename
// an older snapshot over a newer one.
const queues = new Map<string, Promise<unknown>>();

/**
 * Written to a temp file and renamed over the old one, so a crash mid-write
 * leaves the previous progress in place instead of a truncated file that would
 * read back as "nothing reviewed".
 */
export function saveProgress(folder: string, progress: ReviewProgress): Promise<{ ok: boolean; error?: string }> {
  const target = path.join(folder, PROGRESS_FILE);
  const key = path.resolve(target);
  const run = (queues.get(key) ?? Promise.resolve()).then(async () => {
    const tmp = `${target}.${process.pid}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify({ last: progress.last, reviewed: progress.reviewed }), "utf-8");
      await fs.rename(tmp, target);
      return { ok: true };
    } catch (err) {
      try { await fs.unlink(tmp); } catch { /* nothing to clean up */ }
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  const tail = run.then(() => undefined);
  queues.set(key, tail);
  void tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return run;
}
