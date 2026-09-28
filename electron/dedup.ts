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
import type {
  DedupApplyResult, DedupCacheInfo, DedupProgress, DedupScanRequest, DedupScanResult, DedupScope, DedupUndoResult,
} from "./ipc-types.ts";

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

const CACHE_DIR = ".labeler_dedup_cache";

/** What a previous scan left in the cache, so the tab can say how long the next one will take. */
export async function dedupCacheInfo(root: string): Promise<DedupCacheInfo> {
  let names: string[] = [];
  try { names = await fs.readdir(path.join(root, CACHE_DIR)); } catch { /* never scanned */ }
  const models = new Set<string>(), align = new Set<string>();
  let hashes = false;
  for (const n of names) {
    const m = n.match(/^dedup-[0-9a-f]+(?:-([a-z0-9]+))?(-align\.json|\.npz)$/);
    if (!m) continue;
    if (!m[1]) hashes = true;
    else if (m[2] === ".npz") models.add(m[1]);
    else align.add(m[1]);
  }
  return { hashes, models: [...models], align: [...align] };
}

/**
 * Run the scanner on `python` (then `py` on Windows, past the Microsoft Store
 * stub), forwarding `@@progress <phase> <done> <total>` lines, and `@@info
 * <key> <value>` lines as phase "info", to `onProgress`.
 */
export async function runDedupScan(
  script: string,
  req: DedupScanRequest,
  onProgress: (p: DedupProgress) => void,
): Promise<DedupScanResult> {
  const payload = JSON.stringify({
    images: req.images, cache: path.join(req.root, CACHE_DIR),
    model: req.model, align: req.align, device: "auto", maxHam: req.maxHam ?? 12, minCos: req.minCos ?? 0.85,
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
          const i = line.match(/^@@info (\w+) (.*)$/);
          if (m) onProgress({ phase: m[1], done: +m[2], total: +m[3] });
          else if (i) onProgress({ phase: "info", done: 0, total: 0, key: i[1], value: i[2] });
          else if (!/unauthenticated requests to the HF Hub|symlinks on Windows|developer mode/i.test(line)) err += line + "\n";
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
    "(torch + torchvision for ResNet50, timm for DINOv2, opencv-python for pixel alignment).\n" + last);
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

/** 20260928-130831-042: to the millisecond, so batch names sort in the order they were made. */
function stamp(d = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
}

/**
 * A batch folder no earlier move-out has used. Two move-outs within one second
 * (Enter, Enter on the next group) used to share one, and the second manifest
 * overwrote the first: those images stayed in quarantine with no record, so
 * Undo could not bring them back.
 */
async function freshBatch(parent: string): Promise<string> {
  let t = Date.now();
  for (;;) {
    const name = stamp(new Date(t)) + BATCH_SUFFIX;
    try { await fs.access(path.join(parent, name)); t++; } catch { return name; }
  }
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
  const batch = await freshBatch(`${root}.duplicates`);
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
