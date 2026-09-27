// Phase 6 — regressions for the ways annotations used to disappear.
//
// Every case here was a real, reproducible loss of user work:
//   1. A class name with no index in the project list was dropped on save,
//      so a plain open->save round-trip deleted boxes.
//   2. Split/export with "copy images" off deleted label files out of the
//      SOURCE folder — a read-only operation destroying its own input.
//   3. Overlapping COCO writes clobbered each other (one shared json).
//   4. A zip with non-ASCII names was written without the UTF-8 flag.
//
//   node --experimental-strip-types tests/phase6-data-loss.ts

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { phase, check, eq, report } from "./_assert.ts";
import {
  loadAnnotations, saveAnnotations, annotationFileFor,
} from "../electron/annotation-io.ts";
import { splitDataset, exportDataset } from "../electron/dataset-split.ts";
import { makeZip } from "../electron/zip.ts";

// A 100x80 PNG header is enough for readImageDims — no pixel data needed.
function pngHeader(w = 100, h = 80): Buffer {
  const buf = Buffer.alloc(64);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  return buf;
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "ls-phase6-"));
const dir = (name: string) => path.join(root, name);
async function mk(name: string): Promise<string> {
  const d = dir(name);
  await fs.mkdir(d, { recursive: true });
  return d;
}
const ls = async (d: string) => (await fs.readdir(d)).sort();

// ============================================================
phase("YOLO: a class index outside the project list survives a round-trip");
{
  const d = await mk("unknown-class");
  const img = path.join(d, "a.png");
  await fs.writeFile(img, pngHeader());
  // index 5 has no name in a 2-class project -> loads as `unknown_5`
  await fs.writeFile(path.join(d, "a.txt"),
    "0 0.5 0.5 0.2 0.2\n1 0.25 0.25 0.1 0.1\n5 0.75 0.75 0.1 0.1\n");

  const classes = ["person", "car"];
  const loaded = await loadAnnotations({ imagePath: img, classes, format: "YOLO", outputDir: "" });
  eq(loaded.length, 3, "all three boxes load");
  eq(loaded[2].cls, "unknown_5", "the out-of-range index becomes unknown_5");

  const res = await saveAnnotations({
    imagePath: img, annotations: loaded, classes, format: "YOLO", outputDir: "",
  });
  const after = (await fs.readFile(path.join(d, "a.txt"), "utf-8")).trim().split("\n");
  eq(after.length, 3, "all three boxes are still on disk after save");
  check(after[2].startsWith("5 "), "the unknown class writes its original index back", after[2]);
  eq(res.dropped, [], "nothing reported as dropped");
}

// ============================================================
phase("YOLO: a genuinely unrepresentable class is reported, not silently lost");
{
  const d = await mk("dropped-class");
  const img = path.join(d, "a.png");
  await fs.writeFile(img, pngHeader());
  const res = await saveAnnotations({
    imagePath: img,
    annotations: [
      { cls: "person", x1: 10, y1: 10, x2: 20, y2: 20 },
      { cls: "ghost", x1: 30, y1: 30, x2: 40, y2: 40 },
    ],
    classes: ["person"], format: "YOLO", outputDir: "",
  });
  eq(res.dropped, ["ghost"], "the unwritable class name is reported back to the caller");
}

// ============================================================
phase("COCO: an unlisted class gets its own category instead of being dropped");
{
  const d = await mk("coco-class");
  const img = path.join(d, "a.png");
  await fs.writeFile(img, pngHeader());
  const res = await saveAnnotations({
    imagePath: img,
    annotations: [
      { cls: "person", x1: 10, y1: 10, x2: 20, y2: 20 },
      { cls: "ghost", x1: 30, y1: 30, x2: 40, y2: 40 },
    ],
    classes: ["person"], format: "COCO", outputDir: "",
  });
  eq(res.dropped, [], "COCO stores names, so nothing is unrepresentable");
  const doc = JSON.parse(await fs.readFile(annotationFileFor(img, "COCO", ""), "utf-8"));
  eq(doc.annotations.length, 2, "both boxes are written");
  check(doc.categories.some((c: any) => c.name === "ghost"), "a category was minted for the unlisted class");
}

// ============================================================
phase("Split with copyImages=false leaves the SOURCE folder untouched");
{
  const d = await mk("split-nocopy");
  for (const n of ["a", "b", "c"]) await fs.writeFile(path.join(d, n + ".png"), pngHeader());
  await fs.writeFile(path.join(d, "a.txt"), "0 0.5 0.5 0.2 0.2\n");
  await fs.writeFile(path.join(d, "b.txt"), "");   // a valid negative sample
  const before = await ls(d);

  await splitDataset({
    imagePaths: ["a", "b", "c"].map(n => path.join(d, n + ".png")),
    classes: ["person"], sourceFormat: "YOLO", sourceOutputDir: "",
    outRoot: dir("split-nocopy-out"),
    trainRatio: 0.7, valRatio: 0.2, testRatio: 0.1,
    copyImages: false, seed: 42, writeYaml: true, writeTrainPy: false,
  });
  eq(await ls(d), before, "no source file was deleted (b.txt in particular)");
}

// ============================================================
phase("Split with a MISMATCHED source format cannot wipe the source labels");
{
  const d = await mk("split-wrongfmt");
  for (const n of ["a", "b", "c", "d"]) {
    await fs.writeFile(path.join(d, n + ".png"), pngHeader());
    await fs.writeFile(path.join(d, n + ".txt"), "0 0.5 0.5 0.2 0.2\n");
  }
  const before = await ls(d);

  const res = await splitDataset({
    imagePaths: ["a", "b", "c", "d"].map(n => path.join(d, n + ".png")),
    classes: ["person"],
    sourceFormat: "COCO",         // wrong on purpose: labels on disk are YOLO
    sourceOutputDir: "",
    outRoot: dir("split-wrongfmt-out"),
    trainRatio: 0.7, valRatio: 0.2, testRatio: 0.1,
    copyImages: false, seed: 42, writeYaml: false, writeTrainPy: false,
  });
  eq(await ls(d), before, "every source label file survives");
  eq(res.labeled, 0, "the result reports zero labels so the UI can warn");
}

// ============================================================
phase("Export reports how many images actually carried labels");
{
  const d = await mk("export-count");
  for (const n of ["a", "b"]) await fs.writeFile(path.join(d, n + ".png"), pngHeader());
  await fs.writeFile(path.join(d, "a.txt"), "0 0.5 0.5 0.2 0.2\n");

  const res = await exportDataset({
    imagePaths: ["a", "b"].map(n => path.join(d, n + ".png")),
    classes: ["person"], sourceFormat: "YOLO", sourceOutputDir: "",
    outRoot: dir("export-count-out"), format: "YOLO",
    copyImages: true, writeYaml: false,
  });
  eq(res.count, 2, "both images exported");
  eq(res.labeled, 1, "only one of them had labels");
}

// ============================================================
phase("Concurrent COCO saves do not clobber each other");
{
  const d = await mk("coco-race");
  const names = ["a", "b", "c", "d", "e", "f", "g", "h"];
  for (const n of names) await fs.writeFile(path.join(d, n + ".png"), pngHeader());

  // Fire every save at once — this is exactly what the three renderer save
  // paths used to do, and it lost annotations because each one re-read the
  // shared json before the previous write landed.
  await Promise.all(names.map(n => saveAnnotations({
    imagePath: path.join(d, n + ".png"),
    annotations: [{ cls: "person", x1: 1, y1: 2, x2: 30, y2: 40 }],
    classes: ["person"], format: "COCO", outputDir: "",
  })));

  const doc = JSON.parse(await fs.readFile(annotationFileFor(path.join(d, "a.png"), "COCO", ""), "utf-8"));
  eq(doc.images.length, names.length, "every image survived the concurrent writes");
  eq(doc.annotations.length, names.length, "every annotation survived the concurrent writes");
  const ids = new Set(doc.annotations.map((a: any) => a.id));
  eq(ids.size, names.length, "annotation ids stayed unique");
}

// ============================================================
phase("ZIP marks file names as UTF-8");
{
  const zip = makeZip([{ name: "تصاویر/عکس ۱.jpg", data: Buffer.from("hello") }]);
  // General purpose bit flag: local header offset 6, central header offset 8.
  const localFlags = zip.readUInt16LE(6);
  check((localFlags & 0x0800) !== 0, "local header sets the UTF-8 flag", localFlags);

  const sig = 0x02014b50;
  let central = -1;
  for (let i = 0; i < zip.length - 4; i++) if (zip.readUInt32LE(i) === sig) { central = i; break; }
  check(central > 0, "central directory header found");
  check((zip.readUInt16LE(central + 8) & 0x0800) !== 0, "central header sets the UTF-8 flag");
}

// ============================================================
phase("ZIP refuses to silently emit a corrupt archive past its format limits");
{
  const tooMany = Array.from({ length: 70000 }, (_, i) => ({ name: `f${i}`, data: Buffer.alloc(0) }));
  let threw = false;
  try { makeZip(tooMany); } catch { threw = true; }
  check(threw, "more than 65535 entries throws instead of overflowing the count field");
}

await fs.rm(root, { recursive: true, force: true });
report();
