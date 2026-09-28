// Duplicates tab, main-process side: what to scan, running scripts/dedup_scan.py,
// moving duplicates out of the dataset and back, and the pairs the user said are
// not duplicates.
//
// Removed images are never deleted. They go, with every label file of theirs,
// to <root>.duplicates/<stamp>-labeltrain/ beside the dataset, keeping their
// path relative to the root, and each move is logged in that folder's
// manifest.jsonl. Outside the dataset on purpose: Ultralytics reads images/
// folders recursively, so a quarantine inside one would be trained on. The
// helmet project's dataset-dedup.py writes batches to the same parent folder in
// the same manifest shape; the app only ever undoes its own "-labeltrain" ones.

import fs from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { labelFilesOf } from "./annotation-io.ts";
import type { DedupApplyResult, DedupScanRequest, DedupScanResult, DedupScope, DedupUndoResult } from "./ipc-types.ts";

const SPLITS = ["train", "valid", "val", "test"];
const IGNORE_FILE = ".labeler_dedup.json";
const BATCH_SUFFIX = "-labeltrain";

async function isDir(p: string): Promise<boolean> {
  try { return (await fs.stat(p)).isDirectory(); } catch { return false; }
}

/**
 * What a folder belongs to. A split's images folder (…/<root>/<split>/images)
 * belongs to a dataset whose other splits are worth scanning with it — a copy
 * shared by train and test is the duplicate that matters most.
 */
export async function dedupScope(folder: string): Promise<DedupScope> {
  const abs = path.resolve(folder);
  const parent = path.dirname(abs);
  if (path.basename(abs).toLowerCase() === "images" && SPLITS.includes(path.basename(parent).toLowerCase())) {
    const root = path.dirname(parent);
    const splits: { name: string; dir: string }[] = [];
    for (const s of SPLITS) {
      const dir = path.join(root, s, "images");
      if (await isDir(dir)) splits.push({ name: s, dir });
    }
    if (splits.length > 1) return { root, folder: abs, splits };
  }
  return { root: abs, folder: abs, splits: [] };
}

// ------------------------------------------------------------------ scan

let scanProc: ChildProcess | null = null;
let scanCancelled = false;

export function cancelDedupScan(): void {
  scanCancelled = true;
  scanProc?.kill();
}

/**
 * Run the scanner on `python` (then `py` on Windows, past the Microsoft Store
 * stub), forwarding `@@progress <phase> <done> <total>` lines to `onProgress`.
 */
export async function runDedupScan(
  script: string,
  req: DedupScanRequest,
  onProgress: (p: { phase: string; done: number; total: number }) => void,
): Promise<DedupScanResult> {
  const payload = JSON.stringify({
    images: req.images, cache: path.join(req.root, ".labeler_dedup_cache"),
    deep: req.deep, device: "auto", maxHam: req.maxHam ?? 12, minCos: req.minCos ?? 0.85,
  });
  const candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  scanCancelled = false;
  let last = "";
  for (const cmd of candidates) {
    const r = await new Promise<{ ok: true; out: string } | { ok: false; retry: boolean; msg: string }>(resolve => {
      let proc: ChildProcess;
      try {
        proc = spawn(cmd, [script], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } });
      } catch (err) {
        resolve({ ok: false, retry: true, msg: String(err) });
        return;
      }
      scanProc = proc;
      let out = "", err = "", buf = "";
      proc.stdout!.on("data", (c: Buffer) => { out += c.toString("utf-8"); });
      proc.stderr!.on("data", (c: Buffer) => {
        buf += c.toString("utf-8");
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).replace(/\r$/, "");
          buf = buf.slice(nl + 1);
          const m = line.match(/^@@progress (\w+) (\d+) (\d+)$/);
          if (m) onProgress({ phase: m[1], done: +m[2], total: +m[3] });
          else err += line + "\n";
        }
      });
      proc.stdin!.on("error", () => { /* the Store stub never reads stdin */ });
      proc.on("error", (e: NodeJS.ErrnoException) => resolve({ ok: false, retry: e.code === "ENOENT", msg: e.message }));
      proc.on("close", code => {
        scanProc = null;
        if (scanCancelled) resolve({ ok: false, retry: false, msg: "cancelled" });
        else if (code === 0) resolve({ ok: true, out });
        else resolve({ ok: false, retry: code === 9009 || /Microsoft Store/i.test(err), msg: `${cmd} exited with ${code}\n${(err + buf).trim()}` });
      });
      proc.stdin!.write(payload);
      proc.stdin!.end();
    });
    if (r.ok) return JSON.parse(r.out) as DedupScanResult;
    if (!r.retry) throw new Error(r.msg);
    last = r.msg;
  }
  throw new Error("Python was not found. The duplicate scan needs Python with Pillow and numpy " +
    "(and torch + torchvision for look-alikes).\n" + last);
}

// ------------------------------------------------------------------ move out / back

async function move(from: string, to: string): Promise<void> {
  await fs.mkdir(path.dirname(to), { recursive: true });
  try {
    await fs.rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await fs.copyFile(from, to);
    await fs.unlink(from);
  }
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Where a file goes inside a batch: its path relative to the dataset root. */
function storedPath(batchDir: string, root: string, file: string): string {
  const rel = path.relative(root, file);
  return path.join(batchDir, rel.startsWith("..") || path.isAbsolute(rel) ? path.join("_outside", path.basename(file)) : rel);
}

export async function applyDedup(
  root: string,
  items: { image: string; keeper: string; match?: string; cosine?: number; hamming?: number }[],
  outputDir: string,
): Promise<DedupApplyResult> {
  const batch = stamp() + BATCH_SUFFIX;
  const batchDir = path.join(`${root}.duplicates`, batch);
  const lines: string[] = [];
  const moved: string[] = [];
  const errors: string[] = [];
  for (const it of items) {
    try {
      const labels = await labelFilesOf(it.image, outputDir);
      const stored = storedPath(batchDir, root, it.image);
      await move(it.image, stored);
      const labelMoves: { from: string; to: string }[] = [];
      for (const l of labels) {
        const to = storedPath(batchDir, root, l);
        await move(l, to);
        labelMoves.push({ from: l, to });
      }
      moved.push(it.image);
      lines.push(JSON.stringify({
        image: it.image, stored,
        label: labelMoves[0]?.from ?? null, label_stored: labelMoves[0]?.to ?? null,
        labels: labelMoves, keeper: it.keeper, match: it.match ?? null,
        cosine: it.cosine ?? null, hamming: it.hamming ?? null, tool: "labeltrain",
      }));
      // Written as we go, so a failure half-way still leaves an undoable record.
      await fs.mkdir(batchDir, { recursive: true });
      await fs.writeFile(path.join(batchDir, "manifest.jsonl"), lines.join("\n") + "\n", "utf-8");
    } catch (err) {
      errors.push(`${path.basename(it.image)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { batch: moved.length ? batch : null, folder: moved.length ? batchDir : null, moved, errors };
}

/** The newest batch this app made, if any. */
export async function lastDedupBatch(root: string): Promise<{ batch: string; count: number } | null> {
  const parent = `${root}.duplicates`;
  let names: string[];
  try { names = await fs.readdir(parent); } catch { return null; }
  const ours = names.filter(n => n.endsWith(BATCH_SUFFIX)).sort().reverse();
  for (const b of ours) {
    try {
      const txt = await fs.readFile(path.join(parent, b, "manifest.jsonl"), "utf-8");
      const n = txt.split("\n").filter(l => l.trim()).length;
      if (n) return { batch: b, count: n };
    } catch { /* already undone */ }
  }
  return null;
}

/** Put the newest "-labeltrain" batch back where it came from. */
export async function undoDedup(root: string): Promise<DedupUndoResult | null> {
  const last = await lastDedupBatch(root);
  if (!last) return null;
  const dir = path.join(`${root}.duplicates`, last.batch);
  const manifest = path.join(dir, "manifest.jsonl");
  const entries = (await fs.readFile(manifest, "utf-8")).split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
  const restored: string[] = [];
  const skipped: string[] = [];
  for (const e of entries) {
    const moves: { from: string; to: string }[] = [{ from: e.image, to: e.stored }, ...(e.labels ?? [])];
    for (const m of moves) {
      try {
        await fs.access(m.from);
        skipped.push(m.from);                // something new took its place: leave both
        continue;
      } catch { /* free */ }
      try { await move(m.to, m.from); if (m.from === e.image) restored.push(e.image); } catch { skipped.push(m.from); }
    }
  }
  await fs.rename(manifest, path.join(dir, "manifest.undone.jsonl"));
  return { batch: last.batch, restored, skipped };
}

// ------------------------------------------------------------------ not duplicates

export async function loadNotDuplicates(root: string): Promise<[string, string][]> {
  try {
    const obj = JSON.parse(await fs.readFile(path.join(root, IGNORE_FILE), "utf-8"));
    return Array.isArray(obj?.notDuplicates)
      ? obj.notDuplicates.filter((p: unknown): p is [string, string] =>
        Array.isArray(p) && p.length === 2 && p.every(x => typeof x === "string"))
      : [];
  } catch {
    return [];
  }
}

/** Pairs are stored relative to the root, so the list survives moving the dataset. */
export async function saveNotDuplicates(root: string, pairs: [string, string][]): Promise<void> {
  const target = path.join(root, IGNORE_FILE);
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ notDuplicates: pairs }, null, 1), "utf-8");
  await fs.rename(tmp, target);
}
