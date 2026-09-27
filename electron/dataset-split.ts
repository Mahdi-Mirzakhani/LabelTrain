// Dataset splitter — port of the Python DatasetSplitter.
// Always writes YOLO format (the training-friendly one) and emits dataset.yaml.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadAnnotations,
  saveAnnotations,
  writeCocoDataset,
} from "./annotation-io.ts";
import type { BBox } from "./ipc-types.ts";
import { makeZip, type ZipEntry } from "./zip.ts";
import type { SplitConfig, SplitResult, ExportConfig, ExportResult } from "./ipc-types.ts";

// Recursively collect every file under `root` as a zip entry, keyed by its path
// relative to `root` (so the archive mirrors the folder layout).
async function collectZipEntries(root: string, base = ""): Promise<ZipEntry[]> {
  const out: ZipEntry[] = [];
  const dirents = await fs.readdir(root, { withFileTypes: true });
  for (const d of dirents) {
    const abs = path.join(root, d.name);
    const rel = base ? `${base}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...await collectZipEntries(abs, rel));
    else out.push({ name: rel, data: await fs.readFile(abs) });
  }
  return out;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Flat "Save As" export — copies every image + its labels into one folder
// (<outRoot>/images and <outRoot>/labels), in the chosen format. No train/val
// split. For YOLO it can also drop a dataset.yaml pointing at the flat folder.
export async function exportDataset(cfg: ExportConfig): Promise<ExportResult> {
  // For a zip export we write the flat dataset into a temp folder first, then
  // compress it and remove the temp — reusing the exact same on-disk layout.
  const target = path.resolve(cfg.outRoot);
  const zipPath = cfg.zip ? (target.toLowerCase().endsWith(".zip") ? target : target + ".zip") : null;
  const outRoot = zipPath
    ? await fs.mkdtemp(path.join(os.tmpdir(), "ls-export-"))
    : target;

  const imgOut = path.join(outRoot, "images");
  const lblOut = path.join(outRoot, "labels");
  if (cfg.copyImages) await fs.mkdir(imgOut, { recursive: true });
  await fs.mkdir(lblOut, { recursive: true });

  let count = 0;
  let labeled = 0;
  // COCO keeps every image in ONE json, so the per-image writer would re-parse
  // and re-serialize the whole growing file each time (quadratic). Collect and
  // write once at the end instead.
  const cocoItems: Array<{ imagePath: string; annotations: BBox[] }> = [];
  for (const src of cfg.imagePaths) {
    const annotations = await loadAnnotations({
      imagePath: src,
      classes: cfg.classes,
      format: cfg.sourceFormat,
      outputDir: cfg.sourceOutputDir,
    });
    if (cfg.labeledOnly && annotations.length === 0) continue;
    let labelImagePath = src;
    if (cfg.copyImages) {
      const destImg = path.join(imgOut, path.basename(src));
      await fs.copyFile(src, destImg);
      labelImagePath = destImg;
    }
    if (cfg.format === "COCO") {
      cocoItems.push({ imagePath: labelImagePath, annotations });
    } else {
      await saveAnnotations({
        imagePath: labelImagePath,
        annotations,
        classes: cfg.classes,
        format: cfg.format,
        outputDir: lblOut,
      });
    }
    if (annotations.length > 0) labeled++;
    count++;
  }
  if (cfg.format === "COCO") {
    await writeCocoDataset(path.join(lblOut, "coco_dataset.json"), cocoItems, cfg.classes);
  }

  let yamlPath: string | undefined;
  if ((cfg.format === "YOLO" || cfg.format === "YOLO OBB") && cfg.writeYaml !== false) {
    yamlPath = path.join(outRoot, "dataset.yaml");
    // A zip gets extracted somewhere unknown, so keep the path relative.
    const posixRoot = zipPath ? "." : outRoot.replaceAll("\\", "/");
    const namesLines = cfg.classes.map((n, i) => `  ${i}: ${n}`).join("\n");
    const header = cfg.format === "YOLO OBB"
      ? `# YOLO OBB dataset config — train with:  yolo obb train data=dataset.yaml\n`
      : `# YOLO dataset config\n`;
    const yaml =
      header +
      `path: ${posixRoot}\n` +
      `train: images\n` +
      `val: images\n\n` +
      `nc: ${cfg.classes.length}\n` +
      `names:\n${namesLines}\n`;
    await fs.writeFile(yamlPath, yaml, "utf-8");
  }

  if (zipPath) {
    const entries = await collectZipEntries(outRoot);
    await fs.writeFile(zipPath, makeZip(entries));
    await fs.rm(outRoot, { recursive: true, force: true });
    return { count, labeled, outRoot: zipPath, yamlPath: undefined };
  }

  return { count, labeled, outRoot, yamlPath };
}

export async function splitDataset(cfg: SplitConfig): Promise<SplitResult> {
  const outRoot = path.resolve(cfg.outRoot);
  for (const split of ["train", "val", "test"] as const) {
    await fs.mkdir(path.join(outRoot, "images", split), { recursive: true });
    await fs.mkdir(path.join(outRoot, "labels", split), { recursive: true });
  }

  const items = shuffled(cfg.imagePaths, cfg.seed);
  const n = items.length;
  const nTrain = Math.floor(n * cfg.trainRatio);
  const nVal = Math.floor(n * cfg.valRatio);
  const splits = {
    train: items.slice(0, nTrain),
    val: items.slice(nTrain, nTrain + nVal),
    test: items.slice(nTrain + nVal),
  };

  let labeled = 0;
  for (const [name, paths] of Object.entries(splits)) {
    const imgOut = path.join(outRoot, "images", name);
    const lblOut = path.join(outRoot, "labels", name);
    for (const src of paths) {
      const annotations = await loadAnnotations({
        imagePath: src,
        classes: cfg.classes,
        format: cfg.sourceFormat,
        outputDir: cfg.sourceOutputDir,
      });
      let labelImagePath = src;
      if (cfg.copyImages) {
        const destImg = path.join(imgOut, path.basename(src));
        await fs.copyFile(src, destImg);
        labelImagePath = destImg;
      }
      await saveAnnotations({
        imagePath: labelImagePath,
        annotations,
        classes: cfg.classes,
        // A split always lands in the training-friendly YOLO layout — but an
        // OBB source has to stay OBB, or the split would quietly flatten every
        // rotated box to its bounding rect on the way out.
        format: cfg.sourceFormat === "YOLO OBB" ? "YOLO OBB" : "YOLO",
        outputDir: lblOut,
      });
      if (annotations.length > 0) labeled++;
    }
  }

  // dataset.yaml
  const isObb = cfg.sourceFormat === "YOLO OBB";
  const yamlPath = path.join(outRoot, "dataset.yaml");
  const posixRoot = outRoot.replaceAll("\\", "/");
  const namesLines = cfg.classes.map((n, i) => `  ${i}: ${n}`).join("\n");
  const yaml =
    (isObb
      ? `# YOLO OBB dataset config — train with:  yolo obb train data=dataset.yaml\n`
      : `# YOLO dataset config\n`) +
    `path: ${posixRoot}\n` +
    `train: images/train\n` +
    `val: images/val\n` +
    `test: images/test\n\n` +
    `nc: ${cfg.classes.length}\n` +
    `names:\n${namesLines}\n`;
  if (cfg.writeYaml !== false) {
    await fs.writeFile(yamlPath, yaml, "utf-8");
  }

  // Optional train.py starter — a runnable Ultralytics training script.
  let trainPyPath: string | undefined;
  if (cfg.writeTrainPy) {
    trainPyPath = path.join(outRoot, "train.py");
    const weights = isObb ? "yolo11s-obb.pt" : "yolov8s.pt";
    const weightsHint = isObb ? "yolo11n/m/l-obb" : "yolov8n/m/l, yolo11n, ...";
    const trainPy =
      `"""Ultralytics YOLO${isObb ? " OBB" : ""} training starter — generated by LabelStudio."""\n` +
      `from ultralytics import YOLO\n\n` +
      `if __name__ == "__main__":\n` +
      `    model = YOLO("${weights}")  # or ${weightsHint}\n` +
      `    model.train(\n` +
      `        data="dataset.yaml",\n` +
      `        epochs=100,\n` +
      `        imgsz=640,\n` +
      `        batch=16,\n` +
      `        seed=${cfg.seed},\n` +
      `    )\n`;
    await fs.writeFile(trainPyPath, trainPy, "utf-8");
  }

  return {
    train: splits.train.length,
    val: splits.val.length,
    test: splits.test.length,
    labeled,
    yamlPath,
    trainPyPath,
    outRoot,
  };
}
