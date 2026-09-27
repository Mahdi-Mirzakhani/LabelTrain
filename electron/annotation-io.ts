// Annotation IO — port of the Python AnnotationIO class.
// Supports YOLO, YOLO OBB, Pascal VOC, COCO, CSV.

import fs from "node:fs/promises";
import path from "node:path";
import type {
  AnnotationFormat,
  BBox,
  LoadAnnotationsRequest,
  SaveAnnotationsRequest,
  SaveAnnotationsResult,
} from "./ipc-types.ts";
import { readImageDims } from "./image-dims.ts";
import { boxFromCorners, cornersOf, type Pt } from "./obb.ts";
export { readImageDims };

const COCO_FILENAME = "coco_dataset.json";

/** File extension each per-image format writes. COCO is dataset-wide instead. */
function suffixFor(format: AnnotationFormat): string {
  switch (format) {
    case "YOLO":
    case "YOLO OBB": return ".txt";
    case "Pascal VOC": return ".xml";
    case "CSV": return ".csv";
    case "COCO": return ".json";
  }
}

// ============================================================
//  Per-file write lock
// ============================================================
//  Three independent renderer paths can ask to save at the same time (the
//  debounced current-image saver, the background off-screen saver, and the
//  close/export flush). For COCO that is fatal: every image lives in ONE json,
//  so two overlapping read-modify-write cycles silently drop whichever
//  annotations the loser read before the winner wrote. Serializing by target
//  file in the MAIN process fixes it for every caller at once, instead of
//  relying on each renderer path to hold the same lock.

const fileLocks = new Map<string, Promise<unknown>>();

function withFileLock<T>(target: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(target);
  const prev = fileLocks.get(key) ?? Promise.resolve();
  // Chain onto the previous holder, running either way so one failed save
  // cannot wedge the queue for that file.
  const run = prev.then(fn, fn);
  // The queue tail must never reject, or the next waiter inherits the failure.
  const tail = run.then(() => undefined, () => undefined);
  fileLocks.set(key, tail);
  // Drop the entry once nothing queued behind us, so the map does not grow
  // without bound over a long session.
  void tail.then(() => { if (fileLocks.get(key) === tail) fileLocks.delete(key); });
  return run;
}

// ============================================================
//  Path helpers
// ============================================================

function outputPath(imagePath: string, suffix: string, outputDir: string): string {
  const name = path.basename(imagePath, path.extname(imagePath)) + suffix;
  if (outputDir) return path.join(outputDir, name);
  return path.join(path.dirname(imagePath), name);
}

// Standard YOLO layout keeps images under an ".../images/..." directory and
// labels under the sibling ".../labels/..." directory. Given an image path,
// return the labels-dir equivalent, or null when the image isn't under an
// `images` segment. The LAST `images` segment is replaced so nested paths like
// dataset/images/train/img.jpg → dataset/labels/train map correctly.
function siblingLabelsDir(imagePath: string): string | null {
  const parts = path.dirname(imagePath).split(/[\\/]/);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].toLowerCase() === "images") {
      parts[i] = "labels";
      return parts.join(path.sep);
    }
  }
  return null;
}

// Directories to look in when READING a per-image annotation file, most
// specific first: an explicit output dir, the sibling labels/ dir (YOLO split
// layout), then the image's own folder. De-duplicated.
function readDirs(imagePath: string, outputDir: string): string[] {
  const dirs: string[] = [];
  if (outputDir) dirs.push(outputDir);
  const labels = siblingLabelsDir(imagePath);
  if (labels) dirs.push(labels);
  dirs.push(path.dirname(imagePath));
  const seen = new Set<string>();
  return dirs.filter(d => {
    const key = path.resolve(d);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Locate an existing per-image annotation file across all candidate dirs.
async function findAnnotationFile(
  imagePath: string,
  suffix: string,
  outputDir: string,
): Promise<string | null> {
  const name = path.basename(imagePath, path.extname(imagePath)) + suffix;
  for (const dir of readDirs(imagePath, outputDir)) {
    const candidate = path.join(dir, name);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

// Directory to WRITE a per-image annotation file to. Mirrors readDirs so a
// round-trip stays put: an explicit output dir wins; otherwise the sibling
// labels/ dir when that split layout already exists on disk; otherwise next to
// the image. (We only redirect to labels/ when it already exists so ordinary
// single-folder projects keep writing labels beside their images.)
async function writeDirFor(imagePath: string, outputDir: string): Promise<string> {
  if (outputDir) return outputDir;
  const labels = siblingLabelsDir(imagePath);
  if (labels) {
    try { if ((await fs.stat(labels)).isDirectory()) return labels; } catch { /* no split layout */ }
  }
  return path.dirname(imagePath);
}

export function annotationFileFor(
  imagePath: string,
  format: AnnotationFormat,
  outputDir: string,
): string {
  if (format === "COCO") {
    const base = outputDir || path.dirname(imagePath);
    return path.join(base, COCO_FILENAME);
  }
  return outputPath(imagePath, suffixFor(format), outputDir);
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

// ============================================================
//  CSV field codec (RFC 4180-ish)
// ============================================================
//  A class name (or filename) may legitimately contain a comma,
//  a quote, or a newline. Quote such fields and double any inner
//  quotes so the row survives a round-trip instead of silently
//  losing the annotation.

function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// ============================================================
//  LOAD
// ============================================================

export async function loadAnnotations(req: LoadAnnotationsRequest): Promise<BBox[]> {
  switch (req.format) {
    case "YOLO":
    case "YOLO OBB": return await loadYolo(req);
    case "Pascal VOC": return await loadPascalVoc(req);
    case "CSV": return await loadCsv(req);
    case "COCO": return await loadCoco(req);
  }
}

// ============================================================
//  Class-list detection (for imported / pre-labeled datasets)
// ============================================================
//  YOLO .txt and COCO store class INDICES; resolving them to the right names
//  needs the dataset's own ordered class list. We look for the usual files a
//  YOLO/Darknet/Ultralytics export ships with, so an imported project doesn't
//  fall back to the app's default person/car/… order and mislabel every box.

/** Parse a plain one-name-per-line list (classes.txt, *.names). */
function parseLineList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith("#"));
}

const stripYamlComment = (s: string): string => {
  let inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === "#" && !inS && !inD) return s.slice(0, i);
  }
  return s;
};

const unquoteYaml = (s: string): string => {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
};

/**
 * Extract the ordered `names:` list from an Ultralytics data.yaml. Handles the
 * inline flow list `names: [a, b]`, the block sequence (`  - a`), and the
 * index-keyed map (`  0: a`) forms. No external YAML dependency.
 */
export function parseYamlNames(text: string): string[] {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = stripYamlComment(lines[i]).match(/^\s*names\s*:\s*(.*)$/);
    if (!m) continue;
    const rest = m[1].trim();

    if (rest.startsWith("[")) {
      return rest.replace(/^\[/, "").replace(/\][^\]]*$/, "")
        .split(",").map(unquoteYaml).filter(x => x.length > 0);
    }
    if (rest.startsWith("{")) {
      const map: Record<number, string> = {};
      for (const pair of rest.replace(/^\{/, "").replace(/\}[^}]*$/, "").split(",")) {
        const idx = pair.indexOf(":");
        if (idx < 0) continue;
        const k = parseInt(pair.slice(0, idx).trim(), 10);
        if (!Number.isNaN(k)) map[k] = unquoteYaml(pair.slice(idx + 1));
      }
      return Object.keys(map).map(Number).sort((a, b) => a - b).map(k => map[k]);
    }

    // Block form on the following indented lines.
    const seq: string[] = [];
    const mapped: { key: number; val: string }[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const raw = stripYamlComment(lines[j]);
      if (raw.trim() === "") continue;
      if (/^\S/.test(raw)) break; // dedent → next top-level key
      const seqM = raw.match(/^\s*-\s*(.+)$/);
      const mapM = raw.match(/^\s*(\d+)\s*:\s*(.+)$/);
      if (seqM) seq.push(unquoteYaml(seqM[1]));
      else if (mapM) mapped.push({ key: parseInt(mapM[1], 10), val: unquoteYaml(mapM[2]) });
      else break;
    }
    if (seq.length) return seq;
    if (mapped.length) return mapped.sort((a, b) => a.key - b.key).map(x => x.val);
  }
  return [];
}

async function readTextIfExists(p: string): Promise<string | null> {
  try { return await fs.readFile(p, "utf-8"); } catch { return null; }
}

/**
 * Look for a dataset's ordered class list near the opened folder. Searches the
 * folder itself, its parent (dataset root), and a sibling labels/ dir. Returns
 * an empty array when nothing recognizable is found.
 */
export async function detectDatasetClasses(folder: string): Promise<string[]> {
  const candidates: string[] = [folder, path.dirname(folder)];
  const labels = siblingLabelsDir(path.join(folder, "x")); // treat `folder` as an images dir
  if (labels) candidates.push(labels, path.dirname(labels));

  const seen = new Set<string>();
  const dirs = candidates.filter(d => {
    const k = path.resolve(d);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const lineFiles = ["classes.txt", "predefined_classes.txt", "obj.names", "classes.names", "labels.txt"];
  const yamlFiles = ["data.yaml", "data.yml", "dataset.yaml", "dataset.yml"];

  for (const dir of dirs) {
    for (const fn of lineFiles) {
      const txt = await readTextIfExists(path.join(dir, fn));
      if (txt) { const names = parseLineList(txt); if (names.length) return names; }
    }
    for (const fn of yamlFiles) {
      const txt = await readTextIfExists(path.join(dir, fn));
      if (txt) { const names = parseYamlNames(txt); if (names.length) return names; }
    }
  }
  return [];
}

/**
 * Parse an ordered class list from a SPECIFIC file the user picked (not a
 * directory scan). Dispatches on extension: YAML → `names:`, JSON → COCO
 * `categories` (by id) or a plain string array, anything else → one name per
 * line. Returns [] when nothing usable is found.
 */
export async function readClassesFromFile(file: string): Promise<string[]> {
  const txt = await fs.readFile(file, "utf-8");
  const ext = path.extname(file).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") return parseYamlNames(txt);
  if (ext === ".json") {
    try {
      const data = JSON.parse(txt);
      if (Array.isArray(data)) return data.filter((x): x is string => typeof x === "string");
      if (Array.isArray(data?.categories)) {
        return [...data.categories]
          .sort((a: any, b: any) => (a.id ?? 0) - (b.id ?? 0))
          .map((c: any) => c.name)
          .filter((n: any): n is string => typeof n === "string" && n.length > 0);
      }
      if (Array.isArray(data?.names)) return data.names.filter((x: any): x is string => typeof x === "string");
    } catch { /* fall through */ }
    return [];
  }
  return parseLineList(txt);
}

/**
 * Read a YOLO `.txt`, accepting BOTH line shapes:
 *
 *   `cls cx cy w h`                       — 5 values, the upright box
 *   `cls x1 y1 x2 y2 x3 y3 x4 y4`         — 9 values, the oriented box
 *
 * One reader for both because the file extension is the same and a dataset can
 * legitimately be either. Rejecting 9-value lines (the old behaviour) made an
 * OBB dataset open as zero boxes, which reads as "this folder is unlabeled" and
 * invites the user to overwrite real work.
 */
async function loadYolo(req: LoadAnnotationsRequest): Promise<BBox[]> {
  const txtPath = await findAnnotationFile(req.imagePath, ".txt", req.outputDir);
  if (!txtPath) return [];
  const dims = await readImageDims(req.imagePath);
  if (!dims.width || !dims.height) return [];
  const { width: W, height: H } = dims;
  const txt = await fs.readFile(txtPath, "utf-8");
  const out: BBox[] = [];
  for (const line of txt.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 5 && parts.length !== 9) continue;
    const cid = parseInt(parts[0], 10);
    const nums = parts.slice(1).map(parseFloat);
    if (Number.isNaN(cid) || nums.some(Number.isNaN)) continue;
    const cls = req.classes[cid] ?? `unknown_${cid}`;

    if (parts.length === 9) {
      // Four normalized corners. Recover the upright rect + angle the same way
      // Ultralytics does (cv2.minAreaRect), so a quad from any other tool lands
      // where training would put it.
      const pts: Pt[] = [];
      for (let i = 0; i < 8; i += 2) pts.push({ x: nums[i] * W, y: nums[i + 1] * H });
      const { x1, y1, x2, y2, r } = boxFromCorners(pts);
      out.push({
        cls,
        x1: Math.round(x1), y1: Math.round(y1),
        x2: Math.round(x2), y2: Math.round(y2),
        r,
      });
      continue;
    }

    const [cx, cy, w, h] = nums;
    const x1 = Math.max(0, Math.min(Math.round((cx - w / 2) * W), W));
    const y1 = Math.max(0, Math.min(Math.round((cy - h / 2) * H), H));
    const x2 = Math.max(0, Math.min(Math.round((cx + w / 2) * W), W));
    const y2 = Math.max(0, Math.min(Math.round((cy + h / 2) * H), H));
    out.push({ cls, x1, y1, x2, y2 });
  }
  return out;
}

async function loadPascalVoc(req: LoadAnnotationsRequest): Promise<BBox[]> {
  const xmlPath = await findAnnotationFile(req.imagePath, ".xml", req.outputDir);
  if (!xmlPath) return [];
  const xml = await fs.readFile(xmlPath, "utf-8");
  const out: BBox[] = [];
  const objRe = /<object>([\s\S]*?)<\/object>/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(xml)) !== null) {
    const body = m[1];
    const name = body.match(/<name>([\s\S]*?)<\/name>/)?.[1]?.trim();
    const bb = body.match(/<bndbox>([\s\S]*?)<\/bndbox>/)?.[1];
    if (!name || !bb) continue;
    const get = (tag: string) =>
      parseFloat(bb.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "");
    const x1 = get("xmin"), y1 = get("ymin"), x2 = get("xmax"), y2 = get("ymax");
    if ([x1, y1, x2, y2].some(Number.isNaN)) continue;
    out.push({ cls: name, x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2) });
  }
  return out;
}

async function loadCsv(req: LoadAnnotationsRequest): Promise<BBox[]> {
  const csvPath = await findAnnotationFile(req.imagePath, ".csv", req.outputDir);
  if (!csvPath) return [];
  const txt = await fs.readFile(csvPath, "utf-8");
  const lines = txt.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]).map(c => c.trim());
  const idx = (k: string) => header.indexOf(k);
  const iF = idx("filename"), iC = idx("class"), iX1 = idx("x1"), iY1 = idx("y1"), iX2 = idx("x2"), iY2 = idx("y2");
  if ([iF, iC, iX1, iY1, iX2, iY2].some(i => i < 0)) return [];
  const target = path.basename(req.imagePath);
  const out: BBox[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells[iF]?.trim() !== target) continue;
    const cls = cells[iC] ?? "unknown";
    const x1 = parseFloat(cells[iX1]), y1 = parseFloat(cells[iY1]);
    const x2 = parseFloat(cells[iX2]), y2 = parseFloat(cells[iY2]);
    if ([x1, y1, x2, y2].some(Number.isNaN)) continue;
    out.push({ cls, x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2) });
  }
  return out;
}

async function findCocoFile(imagePath: string, outputDir: string): Promise<string | null> {
  // COCO is one dataset-wide JSON. Search the per-image candidate dirs plus the
  // dataset root (parent of an images/ folder), where it commonly lives.
  const dirs = readDirs(imagePath, outputDir);
  const root = path.dirname(path.dirname(imagePath));
  if (!dirs.some(d => path.resolve(d) === path.resolve(root))) dirs.push(root);
  for (const dir of dirs) {
    const candidate = path.join(dir, COCO_FILENAME);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function loadCoco(req: LoadAnnotationsRequest): Promise<BBox[]> {
  const cocoPath = await findCocoFile(req.imagePath, req.outputDir);
  if (!cocoPath) return [];
  const data = JSON.parse(await fs.readFile(cocoPath, "utf-8"));
  const target = path.basename(req.imagePath);
  const imgEntry = (data.images ?? []).find((im: any) => im.file_name === target);
  if (!imgEntry) return [];
  const catMap = new Map<number, string>(
    (data.categories ?? []).map((c: any) => [c.id, c.name]),
  );
  const anns = (data.annotations ?? []).filter((a: any) => a.image_id === imgEntry.id);
  return anns.map((a: any) => {
    const [x, y, w, h] = a.bbox ?? [0, 0, 0, 0];
    return {
      cls: catMap.get(a.category_id) ?? "unknown",
      x1: Math.round(x), y1: Math.round(y),
      x2: Math.round(x + w), y2: Math.round(y + h),
    };
  });
}

// ============================================================
//  SAVE
// ============================================================

export async function saveAnnotations(req: SaveAnnotationsRequest): Promise<SaveAnnotationsResult> {
  const target = req.format === "COCO"
    ? annotationFileFor(req.imagePath, "COCO", req.outputDir)
    : req.imagePath;
  // Both files are written inside ONE lock acquisition. Taking a second lock
  // afterwards would leave a window in which another save for this image lands
  // between them, and the OBB set and the HBB set would disagree on disk.
  return await withFileLock(target, async () => {
    const empty = req.annotations.length === 0;
    let primary: SaveAnnotationsResult;
    if (empty) {
      await deleteExisting(req);
      primary = { ok: true, dropped: [] };
    } else {
      primary = await writeOne(req);
    }
    if (!req.companion) return primary;

    // OBB "both" mode: the same boxes again in the other format, in a sibling
    // folder so the two label sets cannot collide on `<stem>.txt`.
    const companionDir = await companionDirFor(req);
    const companionReq: SaveAnnotationsRequest = {
      ...req,
      format: req.companion.format,
      outputDir: companionDir,
      companion: undefined,
    };
    let secondary: SaveAnnotationsResult;
    if (empty) {
      await deleteExisting(companionReq);
      secondary = { ok: true, dropped: [] };
    } else {
      await fs.mkdir(companionDir, { recursive: true });
      secondary = await writeOne(companionReq);
    }
    // Surface class names either file had to drop, de-duplicated.
    return {
      ok: primary.ok && secondary.ok,
      dropped: [...new Set([...primary.dropped, ...secondary.dropped])],
    };
  });
}


function writeOne(req: SaveAnnotationsRequest): Promise<SaveAnnotationsResult> {
  switch (req.format) {
    case "YOLO": return saveYolo(req);
    case "YOLO OBB": return saveYoloObb(req);
    case "Pascal VOC": return savePascalVoc(req);
    case "CSV": return saveCsv(req);
    case "COCO": return saveCocoSingle(req);
  }
}

/**
 * Where a companion file goes: the primary's own directory with `dirSuffix`
 * appended (`labels` → `labels_obb`). Resolved through `writeDirFor` so it
 * tracks the explicit-output-dir and sibling-labels rules exactly.
 */
async function companionDirFor(req: SaveAnnotationsRequest): Promise<string> {
  const primaryDir = await writeDirFor(req.imagePath, req.outputDir);
  const suffix = req.companion?.dirSuffix ?? "_obb";
  const parent = path.dirname(primaryDir);
  const base = path.basename(primaryDir);
  // At a filesystem root `dirname` returns the root itself; joining a suffixed
  // basename onto it would escape upward, so nest instead.
  if (parent === primaryDir) return path.join(primaryDir, `labels${suffix}`);
  return path.join(parent, base + suffix);
}

async function deleteExisting(req: SaveAnnotationsRequest): Promise<void> {
  if (req.format === "COCO") {
    const cocoPath = annotationFileFor(req.imagePath, "COCO", req.outputDir);
    if (!(await exists(cocoPath))) return;
    try {
      const data = JSON.parse(await fs.readFile(cocoPath, "utf-8"));
      const target = path.basename(req.imagePath);
      const droppedIds = new Set(
        (data.images ?? [])
          .filter((im: any) => im.file_name === target)
          .map((im: any) => im.id),
      );
      data.images = (data.images ?? []).filter((im: any) => im.file_name !== target);
      data.annotations = (data.annotations ?? []).filter(
        (a: any) => !droppedIds.has(a.image_id),
      );
      await fs.writeFile(cocoPath, JSON.stringify(data, null, 2), "utf-8");
    } catch { /* ignore */ }
    return;
  }
  const suffix = suffixFor(req.format);
  const name = path.basename(req.imagePath, path.extname(req.imagePath)) + suffix;
  // An explicit output dir means the caller owns exactly ONE destination —
  // most importantly split/export, which pass their own labels/ folder while
  // `imagePath` still points at the user's ORIGINAL image. Sweeping every
  // readDir there deleted label files out of the source dataset: an operation
  // that only ever reads the source was destroying it. Stay inside the dir we
  // were told to write to.
  if (req.outputDir) {
    try { await fs.unlink(path.join(req.outputDir, name)); } catch { /* ignore */ }
    return;
  }
  // No output dir: this is an in-app "the user cleared every box" save, so
  // remove the label file from each place it may live (sibling labels/ dir,
  // image dir) — otherwise a stale copy would resurrect the boxes on reload.
  for (const dir of readDirs(req.imagePath, "")) {
    try { await fs.unlink(path.join(dir, name)); } catch { /* ignore */ }
  }
}

// ============================================================
//  DELETE AN IMAGE
// ============================================================

/**
 * Remove an image and every annotation of it: the label file wherever this
 * module would read one from (explicit output dir, sibling labels/ dir, the
 * image's own folder) or write a companion to (labels_obb / labels_hbb), and
 * its entry in a COCO json. `remove` does the removing — the app passes
 * Electron's shell.trashItem, so both land in the Recycle Bin and can be put
 * back. The image goes first; if that fails nothing else is touched.
 *
 * Runs under the same per-image lock as saveAnnotations, so a save already on
 * its way lands before the delete rather than recreating the label file after.
 */
export async function deleteImageAndLabels(
  imagePath: string,
  outputDir: string,
  format: AnnotationFormat,
  remove: (p: string) => Promise<void>,
): Promise<{ ok: boolean; removed: string[]; error?: string }> {
  return await withFileLock(imagePath, async () => {
    const removed: string[] = [];
    try {
      await remove(imagePath);
      removed.push(imagePath);
    } catch (err) {
      return { ok: false, removed, error: err instanceof Error ? err.message : String(err) };
    }
    const stem = path.basename(imagePath, path.extname(imagePath));
    const dirs = new Set(readDirs(imagePath, outputDir).map(d => path.resolve(d)));
    const primary = await writeDirFor(imagePath, outputDir);
    for (const suffix of ["_obb", "_hbb"]) {
      dirs.add(path.resolve(path.dirname(primary), path.basename(primary) + suffix));
    }
    const failed: string[] = [];
    for (const dir of dirs) {
      for (const ext of [".txt", ".xml", ".csv"]) {
        const f = path.join(dir, stem + ext);
        if (!(await exists(f))) continue;
        try { await remove(f); removed.push(f); } catch { failed.push(f); }
      }
    }
    if (format === "COCO") {
      const cocoPath = annotationFileFor(imagePath, "COCO", outputDir);
      await withFileLock(cocoPath, () => deleteExisting({ imagePath, outputDir, format, annotations: [], classes: [] }));
    }
    return failed.length
      ? { ok: false, removed, error: `the image is gone but these label files could not be removed: ${failed.join(", ")}` }
      : { ok: true, removed };
  });
}

// A YOLO label file whose class index has no name in the project list is read
// back as `unknown_<index>` (see loadYolo). Recognize that on the way out so a
// plain open→save round-trip writes the SAME index back instead of discarding
// the box — the single biggest source of silent annotation loss.
const UNKNOWN_CLASS_RE = /^unknown_(\d+)$/;

/**
 * The upright rect a non-OBB format should store for a box.
 *
 * Identity for an unrotated box. For a rotated one it is the bounding rect of
 * the four rotated corners — NOT the box's own x1/y1/x2/y2, which describe the
 * footprint before the rotation and would land at the wrong place on the image.
 * Every HBB writer goes through this, so switching a project to a plain format
 * degrades rotated work to the tightest upright box that still covers it.
 */
function uprightRect(a: BBox): { x1: number; y1: number; x2: number; y2: number } {
  if (!a.r) return { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 };
  const pts = cornersOf(a.x1, a.y1, a.x2, a.y2, a.r);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return {
    x1: Math.min(...xs), y1: Math.min(...ys),
    x2: Math.max(...xs), y2: Math.max(...ys),
  };
}

/** `uprightRect` rounded to whole pixels, for the formats that store integers. */
function uprightRectInt(a: BBox): { x1: number; y1: number; x2: number; y2: number } {
  const r = uprightRect(a);
  return {
    x1: Math.round(r.x1), y1: Math.round(r.y1),
    x2: Math.round(r.x2), y2: Math.round(r.y2),
  };
}

function yoloClassIndex(cls: string, classes: string[]): number {
  const known = classes.indexOf(cls);
  if (known >= 0) return known;
  const m = UNKNOWN_CLASS_RE.exec(cls);
  if (m) {
    const idx = parseInt(m[1], 10);
    if (Number.isInteger(idx) && idx >= 0) return idx;
  }
  return -1;
}

async function saveYolo(req: SaveAnnotationsRequest): Promise<SaveAnnotationsResult> {
  const dir = await writeDirFor(req.imagePath, req.outputDir);
  const out = path.join(dir, path.basename(req.imagePath, path.extname(req.imagePath)) + ".txt");
  await fs.mkdir(path.dirname(out), { recursive: true });
  const dims = await readImageDims(req.imagePath);
  if (!dims.width || !dims.height) {
    // Refuse to write rather than truncate a good label file to nothing just
    // because the image header could not be parsed.
    throw new Error(`Could not read image dimensions for ${path.basename(req.imagePath)} — labels not written.`);
  }
  const { width: W, height: H } = dims;
  const lines: string[] = [];
  const dropped = new Set<string>();
  for (const a of req.annotations) {
    const cid = yoloClassIndex(a.cls, req.classes);
    // YOLO can only store a class INDEX, so a name outside the project list is
    // genuinely unrepresentable. Report it so the caller can warn instead of
    // letting the box disappear silently.
    if (cid < 0) { dropped.add(a.cls); continue; }
    const { x1, y1, x2, y2 } = uprightRect(a);
    const cx = ((x1 + x2) / 2) / W;
    const cy = ((y1 + y2) / 2) / H;
    const w = (x2 - x1) / W;
    const h = (y2 - y1) / H;
    lines.push(`${cid} ${cx.toFixed(6)} ${cy.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}`);
  }
  await fs.writeFile(out, lines.join("\n") + "\n", "utf-8");
  return { ok: true, dropped: [...dropped] };
}

/**
 * Write the YOLO OBB layout: `class_index x1 y1 x2 y2 x3 y3 x4 y4`, all eight
 * coordinates normalized to 0..1, corners traced around the box's perimeter.
 * See https://docs.ultralytics.com/datasets/obb/ — the angle is NOT stored;
 * Ultralytics recovers it from the corners with `cv2.minAreaRect` at load time.
 *
 * Upright boxes are written the same way, so an OBB dataset stays one
 * consistent shape whether or not the user ever rotated anything.
 */
async function saveYoloObb(req: SaveAnnotationsRequest): Promise<SaveAnnotationsResult> {
  const dir = await writeDirFor(req.imagePath, req.outputDir);
  const out = path.join(dir, path.basename(req.imagePath, path.extname(req.imagePath)) + ".txt");
  await fs.mkdir(path.dirname(out), { recursive: true });
  const dims = await readImageDims(req.imagePath);
  if (!dims.width || !dims.height) {
    // Same guard as saveYolo: never truncate a good label file just because the
    // image header would not parse.
    throw new Error(`Could not read image dimensions for ${path.basename(req.imagePath)} — labels not written.`);
  }
  const { width: W, height: H } = dims;
  const lines: string[] = [];
  const dropped = new Set<string>();
  for (const a of req.annotations) {
    const cid = yoloClassIndex(a.cls, req.classes);
    // As in saveYolo: the format stores an INDEX, so a name outside the ordered
    // class list has nowhere to go. Report it instead of dropping it silently.
    if (cid < 0) { dropped.add(a.cls); continue; }
    const coords = cornersOf(a.x1, a.y1, a.x2, a.y2, a.r ?? 0)
      .flatMap(p => [
        clamp01(p.x / W).toFixed(6),
        clamp01(p.y / H).toFixed(6),
      ]);
    lines.push(`${cid} ${coords.join(" ")}`);
  }
  await fs.writeFile(out, lines.join("\n") + "\n", "utf-8");
  return { ok: true, dropped: [...dropped] };
}

/**
 * Keep a corner inside the unit square. A box rotated near the image edge can
 * push a corner just outside it, and Ultralytics rejects out-of-range
 * coordinates during dataset verification.
 */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

async function savePascalVoc(req: SaveAnnotationsRequest): Promise<SaveAnnotationsResult> {
  const dir = await writeDirFor(req.imagePath, req.outputDir);
  const out = path.join(dir, path.basename(req.imagePath, path.extname(req.imagePath)) + ".xml");
  await fs.mkdir(path.dirname(out), { recursive: true });
  const dims = await readImageDims(req.imagePath);
  const folder = path.basename(path.dirname(req.imagePath));
  const filename = path.basename(req.imagePath);
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  let xml = `<?xml version="1.0" encoding="utf-8"?>\n<annotation>\n`;
  xml += `  <folder>${esc(folder)}</folder>\n`;
  xml += `  <filename>${esc(filename)}</filename>\n`;
  xml += `  <size>\n    <width>${dims.width}</width>\n    <height>${dims.height}</height>\n    <depth>3</depth>\n  </size>\n`;
  for (const a of req.annotations) {
    const b = uprightRectInt(a);
    xml += `  <object>\n`;
    xml += `    <name>${esc(a.cls)}</name>\n`;
    xml += `    <pose>Unspecified</pose>\n    <truncated>0</truncated>\n    <difficult>0</difficult>\n`;
    xml += `    <bndbox>\n      <xmin>${b.x1}</xmin>\n      <ymin>${b.y1}</ymin>\n      <xmax>${b.x2}</xmax>\n      <ymax>${b.y2}</ymax>\n    </bndbox>\n`;
    xml += `  </object>\n`;
  }
  xml += `</annotation>\n`;
  await fs.writeFile(out, xml, "utf-8");
  // VOC stores the class NAME verbatim — nothing can be unrepresentable.
  return { ok: true, dropped: [] };
}

async function saveCsv(req: SaveAnnotationsRequest): Promise<SaveAnnotationsResult> {
  const dir = await writeDirFor(req.imagePath, req.outputDir);
  const out = path.join(dir, path.basename(req.imagePath, path.extname(req.imagePath)) + ".csv");
  await fs.mkdir(path.dirname(out), { recursive: true });
  const name = path.basename(req.imagePath);
  const rows = ["filename,class,x1,y1,x2,y2"];
  for (const a of req.annotations) {
    const b = uprightRectInt(a);
    rows.push([csvField(name), csvField(a.cls), b.x1, b.y1, b.x2, b.y2].join(","));
  }
  await fs.writeFile(out, rows.join("\n") + "\n", "utf-8");
  // CSV stores the class NAME verbatim — nothing can be unrepresentable.
  return { ok: true, dropped: [] };
}

async function saveCocoSingle(req: SaveAnnotationsRequest): Promise<SaveAnnotationsResult> {
  const cocoPath = annotationFileFor(req.imagePath, "COCO", req.outputDir);
  await fs.mkdir(path.dirname(cocoPath), { recursive: true });
  let data: any;
  if (await exists(cocoPath)) {
    try { data = JSON.parse(await fs.readFile(cocoPath, "utf-8")); }
    catch { data = { images: [], annotations: [], categories: [] }; }
  } else {
    data = { images: [], annotations: [], categories: [] };
  }

  // Rebuild category map from req.classes preserving prior IDs where possible.
  const existing = new Map<string, number>(
    (data.categories ?? []).map((c: any) => [c.name, c.id]),
  );
  data.categories = req.classes.map((name, i) => ({
    id: existing.get(name) ?? i + 1,
    name,
  }));
  const nameToId = new Map<string, number>(
    data.categories.map((c: any) => [c.name, c.id]),
  );
  // COCO stores category NAMES, so unlike YOLO it can represent a class that
  // is not in the project list (an imported `unknown_5`, or a class the user
  // just deleted). Mint a category for it rather than dropping the box.
  const ensureCategory = (name: string): number => {
    const known = nameToId.get(name);
    if (known !== undefined) return known;
    const id = maxId(data.categories, "id") + 1;
    data.categories.push({ id, name });
    nameToId.set(name, id);
    return id;
  };

  const dims = await readImageDims(req.imagePath);
  const target = path.basename(req.imagePath);

  const droppedIds = new Set(
    (data.images ?? [])
      .filter((im: any) => im.file_name === target)
      .map((im: any) => im.id),
  );
  data.images = (data.images ?? []).filter((im: any) => im.file_name !== target);
  data.annotations = (data.annotations ?? []).filter((a: any) => !droppedIds.has(a.image_id));

  const newId = maxId(data.images, "id") + 1;
  data.images.push({
    id: newId, file_name: target, width: dims.width, height: dims.height,
  });

  let nextAnnId = maxId(data.annotations, "id");
  for (const a of req.annotations) {
    const catId = ensureCategory(a.cls);
    nextAnnId += 1;
    const b = uprightRectInt(a);
    const w = b.x2 - b.x1, h = b.y2 - b.y1;
    data.annotations.push({
      id: nextAnnId, image_id: newId,
      category_id: catId,
      bbox: [b.x1, b.y1, w, h],
      area: w * h, iscrowd: 0,
    });
  }
  await fs.writeFile(cocoPath, JSON.stringify(data, null, 2), "utf-8");
  return { ok: true, dropped: [] };
}

/**
 * Write a whole COCO dataset in ONE pass.
 *
 * `saveAnnotations` is per-image, and because COCO keeps every image in a
 * single json it re-parses and re-serializes the entire (growing) file for
 * each one — quadratic, and effectively a hang on a few thousand images.
 * Export/split know the full set up front, so they build the document once.
 */
export async function writeCocoDataset(
  cocoPath: string,
  items: Array<{ imagePath: string; annotations: BBox[] }>,
  classes: string[],
): Promise<void> {
  await fs.mkdir(path.dirname(cocoPath), { recursive: true });
  const categories = classes.map((name, i) => ({ id: i + 1, name }));
  const nameToId = new Map(categories.map(c => [c.name, c.id]));
  const ensureCategory = (name: string): number => {
    const known = nameToId.get(name);
    if (known !== undefined) return known;
    const id = categories.length + 1;
    categories.push({ id, name });
    nameToId.set(name, id);
    return id;
  };

  const images: any[] = [];
  const annotations: any[] = [];
  let imageId = 0;
  let annId = 0;
  for (const item of items) {
    const dims = await readImageDims(item.imagePath);
    imageId += 1;
    images.push({
      id: imageId,
      file_name: path.basename(item.imagePath),
      width: dims.width,
      height: dims.height,
    });
    for (const a of item.annotations) {
      annId += 1;
      const b = uprightRectInt(a);
      const w = b.x2 - b.x1, h = b.y2 - b.y1;
      annotations.push({
        id: annId, image_id: imageId,
        category_id: ensureCategory(a.cls),
        bbox: [b.x1, b.y1, w, h],
        area: w * h, iscrowd: 0,
      });
    }
  }
  await fs.writeFile(cocoPath, JSON.stringify({ images, annotations, categories }, null, 2), "utf-8");
}

// Largest numeric `key` in a list, or 0. Written as a fold rather than
// `Math.max(0, ...list.map(...))` because the spread form throws RangeError
// once a COCO file grows past ~100k entries (argument-count limit).
function maxId(list: any[] | undefined, key: string): number {
  let max = 0;
  for (const item of list ?? []) {
    const v = item?.[key];
    if (typeof v === "number" && v > max) max = v;
  }
  return max;
}
