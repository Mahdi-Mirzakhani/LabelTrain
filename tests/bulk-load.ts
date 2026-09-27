// Benchmark listImages + batch annotation load with 500 tiny PNGs.
// Run: node --experimental-strip-types tests/bulk-load.ts

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readImageDims } from "../electron/image-dims.ts";
import { loadAnnotations, saveAnnotations } from "../electron/annotation-io.ts";

const COUNT = 500;
const GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";

function makePng(w: number, h: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrType = Buffer.from("IHDR");
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0); ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8; ihdrData[9] = 2;
  const crc = (data: Buffer): number => {
    let c = 0xffffffff;
    for (const b of data) { c ^= b; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); }
    return (c ^ 0xffffffff) >>> 0;
  };
  const len = Buffer.alloc(4); len.writeUInt32BE(13, 0);
  const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(Buffer.concat([ihdrType, ihdrData])), 0);
  const idatT = Buffer.from("IDAT");
  const idatD = Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]);
  const il = Buffer.alloc(4); il.writeUInt32BE(idatD.length, 0);
  const ic = Buffer.alloc(4); ic.writeUInt32BE(crc(Buffer.concat([idatT, idatD])), 0);
  const iendT = Buffer.from("IEND");
  const iendL = Buffer.alloc(4);
  const iendC = Buffer.alloc(4); iendC.writeUInt32BE(crc(iendT), 0);
  return Buffer.concat([sig, len, ihdrType, ihdrData, cc, il, idatT, idatD, ic, iendL, iendT, iendC]);
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "labelstudio-bulk-"));
console.log("setting up", COUNT, "PNGs at", tmp);

const t0 = Date.now();
const png = makePng(640, 480);
for (let i = 0; i < COUNT; i++) {
  await fs.writeFile(path.join(tmp, `img_${String(i).padStart(4, "0")}.png`), png);
}
console.log(`  wrote ${COUNT} PNGs in ${Date.now() - t0}ms`);

// Save annotations for half of them
const CLASSES = ["car", "person", "truck"];
const t1 = Date.now();
for (let i = 0; i < COUNT; i += 2) {
  await saveAnnotations({
    imagePath: path.join(tmp, `img_${String(i).padStart(4, "0")}.png`),
    annotations: [
      { cls: "car", x1: 10, y1: 20, x2: 100, y2: 200 },
      { cls: "person", x1: 200, y1: 100, x2: 280, y2: 350 },
    ],
    classes: CLASSES, format: "YOLO", outputDir: tmp,
  });
}
console.log(`  wrote labels for ${COUNT/2} images in ${Date.now() - t1}ms`);

// Now benchmark: parallel listImages-like scan
console.log("\nbenchmark: parallel image scan (24 concurrency)");
const t2 = Date.now();
const entries = await fs.readdir(tmp, { withFileTypes: true });
const imgFiles = entries
  .filter(e => e.isFile() && e.name.endsWith(".png"))
  .map(e => path.join(tmp, e.name));

const CONCURRENCY = 24;
const dims: { p: string; w: number; h: number }[] = [];
for (let i = 0; i < imgFiles.length; i += CONCURRENCY) {
  const batch = imgFiles.slice(i, i + CONCURRENCY);
  const r = await Promise.all(batch.map(async (p) => {
    const [st, d] = await Promise.all([fs.stat(p), readImageDims(p)]);
    return { p, w: d.width, h: d.height, size: st.size };
  }));
  for (const x of r) dims.push(x);
}
console.log(`  ${GREEN}✓${RESET} scanned ${dims.length} images in ${Date.now() - t2}ms`);

// Benchmark: batch annotation load (parallel, 32 concurrency)
console.log("\nbenchmark: batch annotation load (32 concurrency)");
const t3 = Date.now();
const annResults: Record<string, any[]> = {};
const ANN_CONC = 32;
for (let i = 0; i < imgFiles.length; i += ANN_CONC) {
  const batch = imgFiles.slice(i, i + ANN_CONC);
  const r = await Promise.all(batch.map(async (p) => {
    const boxes = await loadAnnotations({
      imagePath: p, classes: CLASSES, format: "YOLO", outputDir: tmp,
    });
    return [p, boxes] as const;
  }));
  for (const [p, b] of r) annResults[p] = b;
}
const withBoxes = Object.values(annResults).filter(b => b.length > 0).length;
console.log(`  ${GREEN}✓${RESET} loaded annotations for ${Object.keys(annResults).length} images in ${Date.now() - t3}ms`);
console.log(`  ${withBoxes} images had labels (expected ${COUNT/2})`);

// Compare with sequential
console.log("\nbenchmark: SEQUENTIAL annotation load (for comparison)");
const t4 = Date.now();
for (const p of imgFiles) {
  await loadAnnotations({ imagePath: p, classes: CLASSES, format: "YOLO", outputDir: tmp });
}
console.log(`  ${YELLOW}·${RESET} sequential: ${Date.now() - t4}ms`);

await fs.rm(tmp, { recursive: true, force: true });
console.log("\ndone — tmp cleaned up.");
