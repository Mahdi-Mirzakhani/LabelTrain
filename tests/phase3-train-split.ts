// Phase 3 — Train / Split: ratio math (pure) + real dataset export including
// the new train.py starter and the optional dataset.yaml toggle.
//
//   node --experimental-strip-types tests/phase3-train-split.ts

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { phase, check, eq, report } from "./_assert.ts";
import { rebalanceRatios, ratiosSumOk, splitCounts } from "../src/lib/split.ts";
import { splitDataset } from "../electron/dataset-split.ts";
import { saveAnnotations } from "../electron/annotation-io.ts";

phase("rebalanceRatios redistributes the remainder proportionally");
{
  const r = rebalanceRatios({ train: 0.7, val: 0.2, test: 0.1 }, "train", 0.5);
  check(r.train === 0.5, "the edited ratio takes the new value", r);
  check(Math.abs(r.train + r.val + r.test - 1) < 0.02, "the three still sum to ~1", r);
  check(r.val > r.test, "the 2:1 val:test proportion is preserved", r);
}
{
  // Degenerate start (others are 0) must not divide by zero / produce NaN.
  const r = rebalanceRatios({ train: 1, val: 0, test: 0 }, "train", 0.6);
  check(!Number.isNaN(r.val) && !Number.isNaN(r.test), "no NaN when others start at 0", r);
}

phase("ratiosSumOk");
check(ratiosSumOk({ train: 0.7, val: 0.2, test: 0.1 }), "0.7/0.2/0.1 is valid");
check(!ratiosSumOk({ train: 0.7, val: 0.7, test: 0.1 }), "0.7/0.7/0.1 is rejected");

phase("splitCounts partitions exactly (no lost/extra items)");
{
  const c = splitCounts(10, { train: 0.7, val: 0.2, test: 0.1 });
  eq(c, { train: 7, val: 2, test: 1 }, "10 images -> 7/2/1");
  check(c.train + c.val + c.test === 10, "counts sum to the total");
}
{
  const c = splitCounts(7, { train: 0.34, val: 0.33, test: 0.33 });
  check(c.train + c.val + c.test === 7, "remainder lands in test, total preserved", c);
}

// --- Real export -----------------------------------------------------------
function makePng(w: number, h: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrType = Buffer.from("IHDR");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const crc = (d: Buffer) => { let c = 0xffffffff; for (const b of d) { c ^= b; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); } return (c ^ 0xffffffff) >>> 0; };
  const len = Buffer.alloc(4); len.writeUInt32BE(13, 0);
  const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(Buffer.concat([ihdrType, ihdr])), 0);
  const idatT = Buffer.from("IDAT"); const idatD = Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]);
  const il = Buffer.alloc(4); il.writeUInt32BE(idatD.length, 0);
  const ic = Buffer.alloc(4); ic.writeUInt32BE(crc(Buffer.concat([idatT, idatD])), 0);
  const iendT = Buffer.from("IEND"); const iendL = Buffer.alloc(4);
  const iendC = Buffer.alloc(4); iendC.writeUInt32BE(crc(iendT), 0);
  return Buffer.concat([sig, len, ihdrType, ihdr, cc, il, idatT, idatD, ic, iendL, iendT, iendC]);
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

phase("splitDataset writes train.py when requested, and honors writeYaml=false");
{
  const src = await fs.mkdtemp(path.join(os.tmpdir(), "labelstudio-p3-src-"));
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "labelstudio-p3-out-"));
  const classes = ["car", "person"];
  const imgs: string[] = [];
  for (let i = 0; i < 4; i++) {
    const p = path.join(src, `img_${i}.png`);
    await fs.writeFile(p, makePng(640, 480));
    imgs.push(p);
    await saveAnnotations({
      imagePath: p, annotations: [{ cls: "car", x1: 10, y1: 10, x2: 100, y2: 100 }],
      classes, format: "YOLO", outputDir: src,
    });
  }

  const res = await splitDataset({
    imagePaths: imgs, classes, sourceFormat: "YOLO", sourceOutputDir: src,
    outRoot: out, trainRatio: 0.5, valRatio: 0.25, testRatio: 0.25,
    copyImages: true, seed: 1, writeYaml: false, writeTrainPy: true,
  });

  check(!(await exists(path.join(out, "dataset.yaml"))), "writeYaml=false => dataset.yaml NOT written");
  check(res.trainPyPath != null && await exists(res.trainPyPath), "train.py IS written and path returned");
  const py = await fs.readFile(path.join(out, "train.py"), "utf-8");
  check(py.includes("from ultralytics import YOLO") && py.includes("data=\"dataset.yaml\""),
    "train.py is a runnable Ultralytics starter");
  check(py.includes("seed=1"), "train.py carries the chosen seed");

  await fs.rm(src, { recursive: true, force: true });
  await fs.rm(out, { recursive: true, force: true });
}

report();
