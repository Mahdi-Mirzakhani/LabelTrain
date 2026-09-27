// Phase 7 — oriented bounding boxes.
//
// Covers the parts where a rotation can silently vanish or land in the wrong
// place, since the file format stores CORNERS and the app stores an upright
// rect plus an angle:
//   1. geometry round-trips (box -> corners -> box) for the angles a user
//      actually draws, including the ones a naive minAreaRect reports 90° off
//   2. the YOLO OBB writer emits the 9-value layout Ultralytics documents
//   3. reading it back reproduces the same box
//   4. HBB formats degrade a rotated box to the rect AROUND it, not to its
//      pre-rotation footprint (which would sit at the wrong angle)
//   5. "both" mode writes the two label sets into separate folders
//   6. the plain YOLO reader accepts a 9-value file instead of seeing zero boxes
//
//   node --experimental-strip-types tests/phase7-obb.ts

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { phase, check, eq, report } from "./_assert.ts";
import { loadAnnotations, saveAnnotations } from "../electron/annotation-io.ts";
import { boxFromCorners, cornersOf, minAreaRect, normalizeAngle } from "../electron/obb.ts";

function pngHeader(w = 100, h = 80): Buffer {
  const buf = Buffer.alloc(64);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  return buf;
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "ls-phase7-"));
async function mk(name: string): Promise<string> {
  const d = path.join(root, name);
  await fs.mkdir(d, { recursive: true });
  return d;
}
/** A 100x80 image plus its path, ready to hang labels off. */
async function scene(name: string): Promise<{ dir: string; img: string }> {
  const dir = await mk(name);
  const img = path.join(dir, "a.png");
  await fs.writeFile(img, pngHeader());
  return { dir, img };
}
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
const deg = (d: number) => (d * Math.PI) / 180;

// ============================================================
phase("normalizeAngle folds to (-90°, 90°]");
{
  eq(Math.round((normalizeAngle(deg(200)) * 180) / Math.PI), 20, "200° -> 20°");
  eq(Math.round((normalizeAngle(deg(-200)) * 180) / Math.PI), -20, "-200° -> -20°");
  eq(Math.round((normalizeAngle(deg(180)) * 180) / Math.PI), 0, "180° is the same rectangle as 0°");
  eq(normalizeAngle(deg(0.001)), 0, "a hair off upright reads as exactly upright");
}

// ============================================================
phase("corners -> minAreaRect reproduces the original box");
{
  // 0° and 90° are the degenerate cases (a hull edge is axis-aligned); ±45° is
  // where the two candidate orientations tie on area and the tie-break decides.
  for (const d of [0, 12, 30, 45, -45, 60, 89, -89]) {
    const r = deg(d);
    const pts = cornersOf(20, 30, 60, 50, r);   // 40 x 20 centred at (40, 40)
    const got = boxFromCorners(pts);
    const w = got.x2 - got.x1, h = got.y2 - got.y1;
    check(
      near((got.x1 + got.x2) / 2, 40, 1e-6) && near((got.y1 + got.y2) / 2, 40, 1e-6),
      `${d}°: centre survives the round-trip`,
      `(${(got.x1 + got.x2) / 2}, ${(got.y1 + got.y2) / 2})`,
    );
    check(
      near(w, 40, 1e-6) && near(h, 20, 1e-6),
      `${d}°: 40x20 stays 40x20 (not transposed)`,
      `${w} x ${h}`,
    );
    check(near(got.r, normalizeAngle(r), 1e-6), `${d}°: angle survives`, `${(got.r * 180) / Math.PI}`);
  }
}

// ============================================================
phase("minAreaRect handles a quad that is not a perfect rectangle");
{
  // A slightly skewed quad, as a DOTA-converted dataset can contain. The result
  // must still enclose every corner — that is the contract cv2.minAreaRect has.
  const pts = [{ x: 0, y: 0 }, { x: 40, y: 2 }, { x: 39, y: 22 }, { x: -1, y: 20 }];
  const { cx, cy, w, h, r } = minAreaRect(pts);
  const cos = Math.cos(-r), sin = Math.sin(-r);
  let inside = true;
  for (const p of pts) {
    const dx = p.x - cx, dy = p.y - cy;
    const u = dx * cos - dy * sin;
    const v = dx * sin + dy * cos;
    if (Math.abs(u) > w / 2 + 1e-6 || Math.abs(v) > h / 2 + 1e-6) inside = false;
  }
  check(inside, "every corner of the skewed quad lies inside the fitted rect");
  check(w > 0 && h > 0, "the fitted rect has real extent", `${w} x ${h}`);
}

// ============================================================
phase("YOLO OBB writes the documented 9-value layout");
{
  const { dir, img } = await scene("obb-write");
  await saveAnnotations({
    imagePath: img,
    annotations: [{ cls: "crazing", x1: 20, y1: 30, x2: 60, y2: 50, r: deg(30) }],
    classes: ["crazing", "patches"],
    format: "YOLO OBB",
    outputDir: "",
  });
  const txt = (await fs.readFile(path.join(dir, "a.txt"), "utf-8")).trim();
  const parts = txt.split(/\s+/);
  eq(parts.length, 9, "one class index plus four xy pairs");
  eq(parts[0], "0", "the class index leads the line");
  const nums = parts.slice(1).map(Number);
  check(nums.every(n => n >= 0 && n <= 1), "every coordinate is normalized to 0..1", txt);
  // An upright box is written the same way, so an OBB dataset is one shape.
  await saveAnnotations({
    imagePath: img,
    annotations: [{ cls: "crazing", x1: 20, y1: 30, x2: 60, y2: 50 }],
    classes: ["crazing"],
    format: "YOLO OBB",
    outputDir: "",
  });
  const upright = (await fs.readFile(path.join(dir, "a.txt"), "utf-8")).trim().split(/\s+/);
  eq(upright.length, 9, "an unrotated box also writes 9 values");
}

// ============================================================
phase("YOLO OBB survives a save -> load round-trip");
{
  const { img } = await scene("obb-roundtrip");
  const classes = ["crazing"];
  const original = { cls: "crazing", x1: 20, y1: 30, x2: 60, y2: 50, r: deg(30) };
  await saveAnnotations({
    imagePath: img, annotations: [original], classes, format: "YOLO OBB", outputDir: "",
  });
  const [back] = await loadAnnotations({ imagePath: img, classes, format: "YOLO OBB", outputDir: "" });
  check(!!back, "the box loads back");
  eq(back.cls, "crazing", "class name resolves from the index");
  // Coordinates are rounded to whole pixels on load, as every format here does.
  check(Math.abs(back.x1 - 20) <= 1 && Math.abs(back.y1 - 30) <= 1
     && Math.abs(back.x2 - 60) <= 1 && Math.abs(back.y2 - 50) <= 1,
    "the upright rect comes back within a pixel",
    `${back.x1},${back.y1},${back.x2},${back.y2}`);
  check(Math.abs(((back.r ?? 0) - deg(30)) * 180 / Math.PI) < 0.5,
    "the angle comes back within half a degree", `${((back.r ?? 0) * 180) / Math.PI}`);
}

// ============================================================
phase("HBB formats store the rect AROUND a rotated box");
{
  const { dir, img } = await scene("obb-degrade");
  // 40x20 at 90°: the enclosing upright rect is 20 wide and 40 tall — the
  // transpose of the box's own footprint. Getting this wrong is invisible in
  // the file and puts every label in the wrong place.
  await saveAnnotations({
    imagePath: img,
    annotations: [{ cls: "crazing", x1: 20, y1: 30, x2: 60, y2: 50, r: deg(90) }],
    classes: ["crazing"],
    format: "YOLO",
    outputDir: "",
  });
  const [cid, cx, cy, w, h] = (await fs.readFile(path.join(dir, "a.txt"), "utf-8"))
    .trim().split(/\s+/);
  eq(cid, "0", "class index");
  check(near(Number(cx), 0.4, 1e-3) && near(Number(cy), 0.5, 1e-3),
    "the centre is unchanged by rotation", `${cx}, ${cy}`);
  check(near(Number(w) * 100, 20, 0.5), "width becomes the rotated box's height", `${Number(w) * 100}`);
  check(near(Number(h) * 80, 40, 0.5), "height becomes the rotated box's width", `${Number(h) * 80}`);
}

// ============================================================
phase("Pascal VOC also degrades to the enclosing rect");
{
  const { dir, img } = await scene("obb-voc");
  await saveAnnotations({
    imagePath: img,
    annotations: [{ cls: "crazing", x1: 20, y1: 30, x2: 60, y2: 50, r: deg(90) }],
    classes: ["crazing"],
    format: "Pascal VOC",
    outputDir: "",
  });
  const xml = await fs.readFile(path.join(dir, "a.xml"), "utf-8");
  const get = (tag: string) => Number(xml.match(new RegExp(`<${tag}>(-?\\d+)</${tag}>`))?.[1]);
  eq(get("xmin"), 30, "xmin is the rotated extent, not the original 20");
  eq(get("xmax"), 50, "xmax likewise");
  eq(get("ymin"), 20, "ymin");
  eq(get("ymax"), 60, "ymax");
}

// ============================================================
phase("\"both\" mode writes the OBB set and the upright set side by side");
{
  const dir = await mk("obb-both");
  const labels = path.join(dir, "labels");
  await fs.mkdir(labels, { recursive: true });
  const img = path.join(dir, "a.png");
  await fs.writeFile(img, pngHeader());

  await saveAnnotations({
    imagePath: img,
    annotations: [{ cls: "crazing", x1: 20, y1: 30, x2: 60, y2: 50, r: deg(30) }],
    classes: ["crazing"],
    format: "YOLO OBB",
    outputDir: labels,
    companion: { format: "YOLO", dirSuffix: "_hbb" },
  });

  const obbLine = (await fs.readFile(path.join(labels, "a.txt"), "utf-8")).trim();
  eq(obbLine.split(/\s+/).length, 9, "the primary file holds the 9-value OBB line");

  const hbbPath = path.join(dir, "labels_hbb", "a.txt");
  const hbbLine = (await fs.readFile(hbbPath, "utf-8")).trim();
  eq(hbbLine.split(/\s+/).length, 5, "the companion holds the 5-value upright line");

  // Clearing every box must remove BOTH files, or the stale one resurrects the
  // boxes on the next load.
  await saveAnnotations({
    imagePath: img, annotations: [], classes: ["crazing"],
    format: "YOLO OBB", outputDir: labels,
    companion: { format: "YOLO", dirSuffix: "_hbb" },
  });
  const primaryGone = !(await fs.access(path.join(labels, "a.txt")).then(() => true, () => false));
  const companionGone = !(await fs.access(hbbPath).then(() => true, () => false));
  check(primaryGone, "clearing the boxes deletes the OBB file");
  check(companionGone, "clearing the boxes deletes the companion too");
}

// ============================================================
phase("the plain YOLO reader accepts a 9-value file");
{
  const { dir, img } = await scene("obb-mixed-read");
  // An OBB dataset opened by a project still set to plain YOLO used to load as
  // zero boxes, which reads as "unlabeled" and invites overwriting real work.
  await fs.writeFile(path.join(dir, "a.txt"),
    "0 0.2 0.375 0.6 0.375 0.6 0.625 0.2 0.625\n");
  const boxes = await loadAnnotations({
    imagePath: img, classes: ["crazing"], format: "YOLO", outputDir: "",
  });
  eq(boxes.length, 1, "the 9-value line is read, not skipped");
  eq(boxes[0].cls, "crazing", "class resolves");
  check(near(boxes[0].x1, 20, 1) && near(boxes[0].x2, 60, 1),
    "corners map back to pixels", `${boxes[0].x1}..${boxes[0].x2}`);
}

await fs.rm(root, { recursive: true, force: true });
report();
