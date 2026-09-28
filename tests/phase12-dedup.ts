// Phase 12 — the Duplicates tab: grouping pairs at a sensitivity, the keeper
// rules, the dataset scope, moving duplicates out and back, the not-duplicates
// list, and (when Python with Pillow is around) the scanner itself.
//
//   node --experimental-strip-types tests/phase12-dedup.ts

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { phase, check, eq, report } from "./_assert.ts";
import { PRESETS, groupPairs, pairKind, suggestKeeper, bytesText } from "../src/lib/dedup.ts";
import {
  applyDedup, dedupScope, lastDedupBatch, loadNotDuplicates, runDedupScan, saveNotDuplicates, undoDedup,
} from "../electron/dedup.ts";
import type { DedupPair } from "../electron/ipc-types.ts";

const exists = async (p: string) => { try { await fs.access(p); return true; } catch { return false; } };
async function put(p: string, data: string | Buffer = "x") { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, data); }

phase("pairKind: exact always counts, the rest by sensitivity");
{
  const exact: DedupPair = [0, 1, 1, 0, 1, 0];
  const near: DedupPair = [0, 2, 0, 3, 0.9, 0];
  const frame: DedupPair = [1, 3, 0, 20, 0.96, 0];
  eq(pairKind(exact, PRESETS.exact), "exact", "exact copy at the strictest setting");
  eq(pairKind(near, PRESETS.exact), null, "a resized copy is not exact");
  eq(pairKind(near, PRESETS.copies), "near", "... but is a copy");
  eq(pairKind(frame, PRESETS.copies), null, "a video frame is not a copy");
  eq(pairKind(frame, PRESETS.frames), "similar", "... but counts with crops & frames");
  eq(pairKind([0, 1, 0, 30, -1, 0], PRESETS.loose), null, "no CNN score (-1) never counts as similar");
}

phase("groupPairs unions chains, ranks groups and honours 'not duplicates'");
{
  const pairs: DedupPair[] = [
    [0, 1, 0, 2, 0.99, 1],   // near, mirrored
    [1, 2, 0, 20, 0.96, 0],  // similar only
    [3, 4, 1, 0, 1, 0],      // exact
    [5, 6, 0, 30, 0.93, 0],  // loose only
  ];
  const copies = groupPairs(7, pairs, PRESETS.copies);
  eq(copies.map(g => g.members), [[3, 4], [0, 1]], "copies: the exact group first, then the near one");
  check(copies[1].pairs[0].mirrored, "the mirrored flag is carried");
  const frames = groupPairs(7, pairs, PRESETS.frames);
  eq(frames.map(g => [g.kind, g.members]), [["exact", [3, 4]], ["near", [0, 1, 2]]], "frames: 0-1-2 chain into one group, kind = strongest");
  eq(groupPairs(7, pairs, PRESETS.loose).length, 3, "loose adds the 0.93 pair");
  const cut = groupPairs(7, pairs, PRESETS.frames, (a, b) => a === 1 && b === 2);
  eq(cut.map(g => g.members), [[3, 4], [0, 1]], "marking 1-2 as not duplicates cuts the chain there");
}

phase("suggestKeeper");
{
  const facts: Record<number, { boxes: number; split: string; pixels: number; bytes: number }> = {
    0: { boxes: 0, split: "test", pixels: 9e5, bytes: 9e5 },
    1: { boxes: 3, split: "train", pixels: 4e5, bytes: 1e5 },
    2: { boxes: 2, split: "test", pixels: 1e5, bytes: 1e5 },
    3: { boxes: 2, split: "test", pixels: 2e5, bytes: 1e5 },
  };
  const f = (i: number) => facts[i];
  eq(suggestKeeper([0, 1], f), 1, "a labelled copy beats an unlabelled one, whatever the split");
  eq(suggestKeeper([1, 2], f), 2, "among labelled copies the test one stays (the train copy is the leak)");
  eq(suggestKeeper([1, 2], f, ["train", "valid", "test"]), 1, "the split order can be turned round");
  eq(suggestKeeper([2, 3], f), 3, "then more pixels");
  eq(bytesText(3_355_443), "3.2 MB", "sizes read like sizes");
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "ls-phase12-"));
try {
  phase("dedupScope: a split's images/ scans with its dataset");
  {
    const ds = path.join(root, "ds");
    for (const s of ["train", "valid", "test"]) await fs.mkdir(path.join(ds, s, "images"), { recursive: true });
    const sc = await dedupScope(path.join(ds, "train", "images"));
    eq(sc.root, ds, "the dataset root");
    eq(sc.splits.map(s => s.name), ["train", "valid", "test"], "its splits");
    const plain = await dedupScope(path.join(root, "ds", "train"));
    eq(plain.splits, [], "any other folder is scanned alone");
  }

  phase("applyDedup moves each image with all its labels out of the dataset, logged; undo puts them back");
  {
    const ds = path.join(root, "ds");
    const img = path.join(ds, "train", "images", "a.jpg");
    const keeper = path.join(ds, "test", "images", "a.jpg");
    await put(img, "A"); await put(keeper, "A");
    await put(path.join(ds, "train", "labels", "a.txt"), "0 0.5 0.5 0.1 0.1\n");
    await put(path.join(ds, "train", "labels_obb", "a.txt"), "0 0 0 1 0 1 1 0 1\n");
    const res = await applyDedup(ds, [{ image: img, keeper, match: "exact", hamming: 0 }], "");
    eq(res.moved, [img], "moved the image");
    eq(res.errors, [], "no errors");
    check(res.batch !== null && res.batch.endsWith("-labeltrain"), "its batch is marked as the app's", res.batch);
    check(!(await exists(img)) && !(await exists(path.join(ds, "train", "labels", "a.txt"))) &&
      !(await exists(path.join(ds, "train", "labels_obb", "a.txt"))), "image and both label files left the dataset");
    const stored = path.join(`${ds}.duplicates`, res.batch!, "train", "images", "a.jpg");
    check(await exists(stored), "the image keeps its path under <root>.duplicates/<batch>/");
    const line = JSON.parse((await fs.readFile(path.join(`${ds}.duplicates`, res.batch!, "manifest.jsonl"), "utf-8")).trim());
    eq([line.image, line.keeper, line.labels.length, line.tool], [img, keeper, 2, "labeltrain"], "the manifest records the move");
    eq((await lastDedupBatch(ds))?.count, 1, "the batch can be undone");

    // a batch from another tool is never undone by the app
    await put(path.join(`${ds}.duplicates`, "20990101-000000", "manifest.jsonl"), JSON.stringify({ image: "x", stored: "y" }) + "\n");
    const u = await undoDedup(ds);
    eq(u?.restored, [img], "undo restored the app's batch");
    check(await exists(img) && await exists(path.join(ds, "train", "labels", "a.txt")) &&
      await exists(path.join(ds, "train", "labels_obb", "a.txt")), "image and labels are back");
    eq(await lastDedupBatch(ds), null, "nothing of the app's left to undo — the other tool's batch is ignored");
    check(await exists(path.join(`${ds}.duplicates`, "20990101-000000", "manifest.jsonl")), "and left alone");
  }

  phase("undo does not overwrite a file that took the old place");
  {
    const ds = path.join(root, "ds2");
    const img = path.join(ds, "images", "b.jpg");
    await put(img, "old");
    const res = await applyDedup(ds, [{ image: img, keeper: "k" }], "");
    await put(img, "new");
    const u = await undoDedup(ds);
    eq(u?.skipped, [img], "the occupied path is reported");
    eq(await fs.readFile(img, "utf-8"), "new", "and not overwritten");
    check(await exists(path.join(`${ds}.duplicates`, res.batch!, "images", "b.jpg")), "the stored copy stays in the batch");
  }

  phase("not-duplicates list round-trips");
  {
    const ds = path.join(root, "ds");
    eq(await loadNotDuplicates(ds), [], "none yet");
    await saveNotDuplicates(ds, [["train/images/a.jpg", "test/images/a.jpg"]]);
    eq(await loadNotDuplicates(ds), [["train/images/a.jpg", "test/images/a.jpg"]], "saved and read back");
  }

  phase("the scanner finds a byte copy and a mirrored copy (hash level, needs Python + Pillow)");
  {
    const dir = path.join(root, "scan");
    await fs.mkdir(dir, { recursive: true });
    let py: string | null = null;
    for (const cmd of process.platform === "win32" ? ["python", "py"] : ["python3", "python"]) {
      try {
        execFileSync(cmd, ["-c", [
          "import sys, random", "from PIL import Image, ImageOps",
          "random.seed(1)", "d = sys.argv[1]",
          "im = Image.new('RGB', (120, 90))",
          "im.putdata([(random.randrange(256), (x * 3) % 256, (y * 5) % 256) for y in range(90) for x in range(120)])",
          "im.save(d + '/a.png'); im.save(d + '/a_copy.png'); ImageOps.mirror(im).save(d + '/a_mirror.png')",
          "Image.new('RGB', (120, 90), (200, 30, 30)).save(d + '/other.png')",
        ].join("\n"), dir]);
        py = cmd;
        break;
      } catch { /* next */ }
    }
    if (!py) {
      console.log("  (skipped: no Python with Pillow on PATH)");
    } else {
      const images = ["a.png", "a_copy.png", "a_mirror.png", "other.png"].map(f => path.join(dir, f));
      const res = await runDedupScan(path.resolve("scripts", "dedup_scan.py"), { images, root: dir, deep: false }, () => {});
      const names = (p: DedupPair) => [path.basename(res.items[p[0]].path), path.basename(res.items[p[1]].path)].sort().join(" ");
      const byName = new Map(res.pairs.map(p => [names(p), p]));
      check(byName.get("a.png a_copy.png")?.[2] === 1, "a.png and its byte copy are exact", [...byName.keys()]);
      const m = byName.get("a.png a_mirror.png");
      check(!!m && m[3] === 0 && m[5] === 1, "the mirrored copy matches on the mirrored hash", m);
      check(![...byName.keys()].some(k => k.includes("other.png")), "the unrelated image pairs with nothing");
      check(await exists(path.join(dir, ".labeler_dedup_cache")), "the cache folder is written beside the images");
    }
  }
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

report();
