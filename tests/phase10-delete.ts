// Phase 10 — deleting an image takes every label of it along, and nothing else.
//
//   node --experimental-strip-types tests/phase10-delete.ts
//
// The app passes Electron's shell.trashItem; here a fake bin moves the files
// into a folder so the test can see exactly what went.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { phase, check, eq, report } from "./_assert.ts";
import { deleteImageAndLabels, saveAnnotations } from "../electron/annotation-io.ts";

function pngHeader(w = 100, h = 80): Buffer {
  const buf = Buffer.alloc(64);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  return buf;
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "ls-phase10-"));
const bin = path.join(root, "_bin");
await fs.mkdir(bin);
let n = 0;
const trash = async (p: string) => { await fs.rename(p, path.join(bin, `${++n}-${path.basename(p)}`)); };
const exists = async (p: string) => { try { await fs.access(p); return true; } catch { return false; } };
const ls = async (d: string) => (await fs.readdir(d)).sort();
async function put(p: string, data: string | Buffer) { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, data); }

try {
  phase("YOLO split layout: the image and all of its label files go, the neighbour stays");
  {
    const d = path.join(root, "yolo", "train");
    await put(path.join(d, "images", "a.png"), pngHeader());
    await put(path.join(d, "images", "b.png"), pngHeader());
    await put(path.join(d, "labels", "a.txt"), "0 0.5 0.5 0.1 0.1\n");
    await put(path.join(d, "labels", "b.txt"), "1 0.5 0.5 0.1 0.1\n");
    await put(path.join(d, "labels_obb", "a.txt"), "0 0.4 0.4 0.6 0.4 0.6 0.6 0.4 0.6\n");
    await put(path.join(d, "images", "a.txt"), "0 0.5 0.5 0.1 0.1\n");   // a stray copy beside the image
    const res = await deleteImageAndLabels(path.join(d, "images", "a.png"), "", "YOLO", trash);
    check(res.ok, "reports ok", res);
    eq(res.removed.length, 4, "the image and 3 label files were removed");
    eq(await ls(path.join(d, "images")), ["b.png"], "only b's image is left");
    eq(await ls(path.join(d, "labels")), ["b.txt"], "only b's label is left");
    eq(await ls(path.join(d, "labels_obb")), [], "the OBB companion went too");
    eq((await ls(bin)).length, 4, "all four are in the bin, none destroyed");
  }

  phase("the image cannot be removed => nothing else is touched");
  {
    const d = path.join(root, "locked");
    await put(path.join(d, "images", "a.png"), pngHeader());
    await put(path.join(d, "labels", "a.txt"), "0 0.5 0.5 0.1 0.1\n");
    const res = await deleteImageAndLabels(path.join(d, "images", "a.png"), "", "YOLO",
      async (p) => { if (p.endsWith(".png")) throw new Error("in use"); await trash(p); });
    check(!res.ok && /in use/.test(res.error ?? ""), "reports the failure", res);
    check(await exists(path.join(d, "labels", "a.txt")), "the label file is still there");
  }

  phase("a label file that cannot be removed is reported, not silently left");
  {
    const d = path.join(root, "half");
    await put(path.join(d, "images", "a.png"), pngHeader());
    await put(path.join(d, "labels", "a.txt"), "0 0.5 0.5 0.1 0.1\n");
    const res = await deleteImageAndLabels(path.join(d, "images", "a.png"), "", "YOLO",
      async (p) => { if (p.endsWith(".txt")) throw new Error("locked"); await trash(p); });
    check(!res.ok && res.removed.length === 1 && /a\.txt/.test(res.error ?? ""), "names the file it could not remove", res);
  }

  phase("an explicit output directory is searched");
  {
    const d = path.join(root, "outdir");
    await put(path.join(d, "pics", "a.png"), pngHeader());
    await put(path.join(d, "ann", "a.xml"), "<annotation/>");
    const res = await deleteImageAndLabels(path.join(d, "pics", "a.png"), path.join(d, "ann"), "Pascal VOC", trash);
    check(res.ok && !(await exists(path.join(d, "ann", "a.xml"))), "the VOC file in the output dir went", res);
  }

  phase("COCO: the image's entries leave the shared json, the others stay");
  {
    const d = path.join(root, "coco");
    await put(path.join(d, "a.png"), pngHeader());
    await put(path.join(d, "b.png"), pngHeader());
    await put(path.join(d, "coco_dataset.json"), JSON.stringify({
      images: [{ id: 1, file_name: "a.png" }, { id: 2, file_name: "b.png" }],
      annotations: [{ id: 1, image_id: 1, category_id: 1 }, { id: 2, image_id: 2, category_id: 1 }],
      categories: [{ id: 1, name: "helmet" }],
    }));
    const res = await deleteImageAndLabels(path.join(d, "a.png"), "", "COCO", trash);
    const j = JSON.parse(await fs.readFile(path.join(d, "coco_dataset.json"), "utf-8"));
    check(res.ok, "reports ok", res);
    eq(j.images.map((i: { file_name: string }) => i.file_name), ["b.png"], "a's image entry is gone");
    eq(j.annotations.map((a: { image_id: number }) => a.image_id), [2], "a's boxes are gone, b's stay");
  }

  phase("a save already on its way lands before the delete, not after it");
  {
    const d = path.join(root, "race");
    const img = path.join(d, "images", "a.png");
    await put(img, pngHeader());
    await fs.mkdir(path.join(d, "labels"), { recursive: true });
    const box = { cls: "helmet", x1: 10, y1: 10, x2: 30, y2: 30 };
    const save = saveAnnotations({ imagePath: img, annotations: [box], classes: ["helmet"], format: "YOLO", outputDir: "" });
    const del = deleteImageAndLabels(img, "", "YOLO", trash);
    await Promise.allSettled([save, del]);
    check(!(await exists(path.join(d, "labels", "a.txt"))), "no label file is left behind");
    let late: unknown = null;
    try { await saveAnnotations({ imagePath: img, annotations: [box], classes: ["helmet"], format: "YOLO", outputDir: "" }); }
    catch (err) { late = err; }
    check(late !== null && !(await exists(path.join(d, "labels", "a.txt"))),
      "a save after the delete fails instead of recreating the label file");
  }
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

report();
