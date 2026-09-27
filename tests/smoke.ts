// Smoke test for annotation IO + dataset split.
// Run with:
//   node --experimental-strip-types tests/smoke.ts
//
// Sets up a tmp folder with a real JPG (copied from src/assets/samples/00.jpg),
// writes annotations in all 4 formats, reads them back, and verifies round-trip.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  loadAnnotations,
  saveAnnotations,
} from "../electron/annotation-io.ts";
import { splitDataset } from "../electron/dataset-split.ts";
import { readImageDims } from "../electron/image-dims.ts";
import type { AnnotationFormat, BBox } from "../electron/ipc-types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";
let pass = 0, fail = 0;

function ok(msg: string) { pass++; console.log(`${GREEN}✓${RESET} ${msg}`); }
function bad(msg: string, detail?: any) {
  fail++;
  console.log(`${RED}✗${RESET} ${msg}`);
  if (detail !== undefined) console.log("  " + JSON.stringify(detail));
}
function info(msg: string) { console.log(`${YELLOW}·${RESET} ${msg}`); }

function approxEq(a: BBox, b: BBox, tol = 2): boolean {
  return a.cls === b.cls &&
    Math.abs(a.x1 - b.x1) <= tol &&
    Math.abs(a.y1 - b.y1) <= tol &&
    Math.abs(a.x2 - b.x2) <= tol &&
    Math.abs(a.y2 - b.y2) <= tol;
}

async function makeTmpDir(): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "labelstudio-smoke-"));
  return tmp;
}

// 900x600 black PNG (just IHDR; the test only needs valid dims, not pixel data)
function makePng(width: number, height: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrType = Buffer.from("IHDR");
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
  const ihdrLen = Buffer.alloc(4); ihdrLen.writeUInt32BE(13, 0);
  const ihdrCrc = Buffer.alloc(4); ihdrCrc.writeUInt32BE(crc32(Buffer.concat([ihdrType, ihdrData])), 0);
  // Minimal IDAT (empty deflate stream)
  const idatType = Buffer.from("IDAT");
  const idatData = Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]); // empty zlib
  const idatLen = Buffer.alloc(4); idatLen.writeUInt32BE(idatData.length, 0);
  const idatCrc = Buffer.alloc(4); idatCrc.writeUInt32BE(crc32(Buffer.concat([idatType, idatData])), 0);
  // IEND
  const iendType = Buffer.from("IEND");
  const iendLen = Buffer.alloc(4);
  const iendCrc = Buffer.alloc(4); iendCrc.writeUInt32BE(crc32(iendType), 0);
  return Buffer.concat([sig, ihdrLen, ihdrType, ihdrData, ihdrCrc, idatLen, idatType, idatData, idatCrc, iendLen, iendType, iendCrc]);
}

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xffffffff) >>> 0;
}

async function setupProject(): Promise<{ folder: string; imagePath: string; w: number; h: number }> {
  const folder = await makeTmpDir();
  const dst = path.join(folder, "test_image.png");
  await fs.writeFile(dst, makePng(900, 600));
  const dims = await readImageDims(dst);
  return { folder, imagePath: dst, w: dims.width, h: dims.height };
}

async function testFormat(
  format: AnnotationFormat,
  imagePath: string,
  outputDir: string,
  classes: string[],
  truth: BBox[],
): Promise<void> {
  info(`--- ${format} round-trip ---`);
  // Save
  await saveAnnotations({ imagePath, annotations: truth, classes, format, outputDir });
  ok(`${format}: saved`);

  // Load
  const loaded = await loadAnnotations({ imagePath, classes, format, outputDir });
  if (loaded.length !== truth.length) {
    bad(`${format}: expected ${truth.length} boxes, got ${loaded.length}`, loaded);
    return;
  }
  ok(`${format}: loaded ${loaded.length} boxes`);

  // Compare
  for (let i = 0; i < truth.length; i++) {
    if (!approxEq(loaded[i], truth[i])) {
      bad(`${format}: box ${i} mismatch`, { want: truth[i], got: loaded[i] });
    }
  }
  if (truth.every((t, i) => approxEq(loaded[i], truth[i]))) {
    ok(`${format}: all boxes round-trip correctly (within 2px)`);
  }

  // Empty save should clean up
  await saveAnnotations({ imagePath, annotations: [], classes, format, outputDir });
  const afterClear = await loadAnnotations({ imagePath, classes, format, outputDir });
  if (afterClear.length === 0) ok(`${format}: cleared after empty save`);
  else bad(`${format}: residual boxes after clear`, afterClear);
}

async function main() {
  console.log("\n== LabelStudio smoke test ==\n");

  const { folder, imagePath, w, h } = await setupProject();
  info(`tmp project at ${folder}`);
  info(`image: ${imagePath}  ${w}x${h}`);

  const classes = ["car", "person", "truck"];
  // 3 typical boxes
  const truth: BBox[] = [
    { cls: "car", x1: 50, y1: 100, x2: 250, y2: 300 },
    { cls: "person", x1: 400, y1: 150, x2: 480, y2: 380 },
    { cls: "truck", x1: 600, y1: 200, x2: 850, y2: 450 },
  ];

  for (const fmt of ["YOLO", "Pascal VOC", "COCO", "CSV"] as const) {
    await testFormat(fmt, imagePath, folder, classes, truth);
  }

  // Dataset split test
  info("--- dataset split ---");
  const splitFolder = await makeTmpDir();
  // Create a few image copies so we can split
  const splitInputs: string[] = [];
  for (let i = 0; i < 5; i++) {
    const dst = path.join(folder, `img_${i}.jpg`);
    if (i > 0) await fs.copyFile(imagePath, dst);
    const final = i === 0 ? imagePath : dst;
    splitInputs.push(final);
    // Save YOLO labels per image
    await saveAnnotations({
      imagePath: final,
      annotations: truth,
      classes,
      format: "YOLO",
      outputDir: folder,
    });
  }
  const result = await splitDataset({
    imagePaths: splitInputs,
    classes,
    sourceFormat: "YOLO",
    sourceOutputDir: folder,
    outRoot: splitFolder,
    trainRatio: 0.6,
    valRatio: 0.2,
    testRatio: 0.2,
    copyImages: true,
    seed: 7,
  });

  if (result.train + result.val + result.test === splitInputs.length)
    ok(`split: ${result.train}/${result.val}/${result.test} = ${splitInputs.length} total`);
  else
    bad(`split count mismatch`, result);

  // Verify dataset.yaml exists
  try {
    const yaml = await fs.readFile(result.yamlPath, "utf-8");
    if (yaml.includes("nc: 3") && yaml.includes("car") && yaml.includes("truck"))
      ok("split: dataset.yaml has 3 classes");
    else bad("split: dataset.yaml malformed", yaml);
  } catch (e) {
    bad("split: dataset.yaml missing", String(e));
  }

  // Verify YOLO label files exist
  const trainLabels = await fs.readdir(path.join(splitFolder, "labels", "train"));
  if (trainLabels.length === result.train) ok(`split: ${trainLabels.length} train labels written`);
  else bad("split: train label count mismatch", { expect: result.train, got: trainLabels.length });

  // Verify each label file has 3 lines (one per box)
  let oneFile = path.join(splitFolder, "labels", "train", trainLabels[0]);
  let content = await fs.readFile(oneFile, "utf-8");
  const lines = content.trim().split("\n");
  if (lines.length === 3) ok(`split: each label has 3 boxes`);
  else bad("split: label line count off", { file: oneFile, content });

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
