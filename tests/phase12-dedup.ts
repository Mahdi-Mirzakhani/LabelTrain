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
import {
  PRESETS, clock, durationText, estimateSeconds, groupPairs, labelPairs, matchBoxes, pairKind, preset, suggestKeeper, bytesText,
  type LabelFacts,
} from "../src/lib/dedup.ts";
import {
  applyDedup, dedupCacheInfo, dedupHistory, dedupScope, lastDedupBatch, loadNotDuplicates, runDedupScan, saveNotDuplicates, undoDedup,
} from "../electron/dedup.ts";
import type { DedupPair } from "../electron/ipc-types.ts";

const exists = async (p: string) => { try { await fs.access(p); return true; } catch { return false; } };
async function put(p: string, data: string | Buffer = "x") { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, data); }

phase("pairKind: exact always counts, the rest by sensitivity");
{
  const exact: DedupPair = [0, 1, 1, 0, 1, 0, 1];
  const near: DedupPair = [0, 2, 0, 3, 0.9, 0, 0];
  const frame: DedupPair = [1, 3, 0, 20, 0.96, 0, 0];
  const crop: DedupPair = [2, 4, 0, 22, 0.86, 0, 1];
  eq(pairKind(exact, PRESETS.exact), "exact", "exact copy at the strictest setting");
  eq(pairKind(near, PRESETS.exact), null, "a resized copy is not exact");
  eq(pairKind(near, PRESETS.copies), "near", "... but is a copy");
  eq(pairKind(frame, PRESETS.copies), null, "a video frame is not a copy");
  eq(pairKind(frame, PRESETS.frames), "similar", "... but counts with crops & frames");
  eq(pairKind(crop, PRESETS.exact), null, "a crop that lines up is not exact");
  eq(pairKind(crop, PRESETS.copies), "aligned", "... but is the same photo from 'copies' on, whatever its similarity");
  eq(pairKind([0, 1, 0, 30, -1, 0, 0], PRESETS.loose), null, "no model score (-1) never counts as similar");
}

phase("presets follow the model's calibration");
{
  eq(preset("frames", "resnet50").minCos, 0.93, "ResNet50: 0.93");
  eq(preset("frames", "dinov2").minCos, 0.90, "DINOv2: 0.90");
  eq(preset("loose", "dinov2").minCos, 0.85, "DINOv2 loose: 0.85");
  eq(preset("frames", "none").similar, false, "hashes only: no look-alike level");
}

phase("groupPairs unions chains, ranks groups and honours 'not duplicates'");
{
  const pairs: DedupPair[] = [
    [0, 1, 0, 2, 0.99, 1, 0],   // near, mirrored
    [1, 2, 0, 20, 0.96, 0, 0],  // similar only
    [3, 4, 1, 0, 1, 0, 1],      // exact
    [5, 6, 0, 30, 0.91, 0, 0],  // loose only (ResNet50 loose = 0.90)
    [7, 8, 0, 25, 0.80, 0, 1],  // lined up, low similarity
  ];
  const copies = groupPairs(9, pairs, PRESETS.copies);
  eq(copies.map(g => [g.kind, g.members]), [["exact", [3, 4]], ["near", [0, 1]], ["aligned", [7, 8]]],
    "copies: exact, then near, then the same photo lined up");
  check(copies[1].pairs[0].mirrored, "the mirrored flag is carried");
  const frames = groupPairs(9, pairs, PRESETS.frames);
  eq(frames.map(g => [g.kind, g.members]), [["exact", [3, 4]], ["near", [0, 1, 2]], ["aligned", [7, 8]]], "frames: 0-1-2 chain into one group, kind = strongest");
  eq(groupPairs(9, pairs, PRESETS.loose).length, 4, "loose adds the 0.91 pair");
  const cut = groupPairs(9, pairs, PRESETS.frames, (a, b) => a === 1 && b === 2);
  eq(cut.map(g => g.members), [[3, 4], [0, 1], [7, 8]], "marking 1-2 as not duplicates cuts the chain there");
}

phase("labelPairs: same size, same number of boxes, same corners — in any order");
{
  const b = (cls: string, x1: number, y1: number, x2: number, y2: number, r?: number) => ({ cls, x1, y1, x2, y2, r });
  const two = [b("head", 10, 10, 50, 50), b("helmet", 100, 100, 150, 160)];
  const shift = (d: number) => two.map(x => ({ ...x, x1: x.x1 + d, x2: x.x2 + d }));
  const facts: LabelFacts[] = [
    { width: 640, height: 480, boxes: two },                                               // 0
    { width: 640, height: 480, boxes: [...two].reverse() },                                // 1 same, other order
    { width: 640, height: 480, boxes: shift(0.6) },                                        // 2 0.6 px off
    { width: 640, height: 480, boxes: [two[0], { ...two[1], cls: "head" }] },              // 3 a class differs
    { width: 640, height: 481, boxes: two },                                               // 4 other size
    { width: 640, height: 480, boxes: [...two, b("head", 300, 300, 320, 330)] },           // 5 one box more
    { width: 640, height: 480, boxes: [two[0], { ...two[1], x1: 120, x2: 170 }] },        // 6 a box 20 px away
    { width: 640, height: 480, boxes: [] },                                                // 7 no boxes
    { width: 640, height: 480, boxes: [] },                                                // 8 no boxes
    { width: 640, height: 480, boxes: shift(5) },                                          // 9 5 px off
    { width: 640, height: 480, boxes: [b("head", 10, 10, 50, 50, 0.5), two[1]] },          // 10 a box turned
  ];
  const pairs = labelPairs(facts);
  const has = (a: number, c: number) => pairs.find(p => p[0] === a && p[1] === c);
  eq(pairs.filter(p => [4, 5, 6, 7, 8, 10].includes(p[0]) || [4, 5, 6, 7, 8, 10].includes(p[1])).length, 0,
    "no pair with another size, another box count, a box 20 px away, a turned box, or no boxes at all");
  eq(has(0, 1)?.slice(7), [0, 1], "the same boxes in another order: 0 px, classes agree");
  eq(has(0, 2)?.slice(7), [0.6, 1], "0.6 px off");
  eq(has(0, 3)?.slice(7), [0, 0], "same corners, a class differs: listed, flagged");
  eq(has(0, 9)?.slice(7), [5, 1], "5 px off is listed (up to MAX_BOX_TOL)");
  eq(has(2, 9)?.slice(7), [4.4, 1], "... and between two shifted copies, the difference of their shifts");
  check(pairs.every(p => p[0] < p[1] && p[2] === 0 && p[4] === -1 && p[6] === 0), "label pairs claim no hash, model or alignment match");

  const s = preset("frames", "none");
  eq([s.boxTol, s.sameClass], [1, false], "by default: within 1 px, classes not compared");
  eq(pairKind(has(0, 2)!, s), "labels", "0.6 px counts at 1 px");
  eq(pairKind(has(0, 9)!, s), null, "5 px does not ...");
  eq(pairKind(has(0, 9)!, { ...s, boxTol: 5 }), "labels", "... until the slider says 5");
  eq(pairKind(has(0, 3)!, s), "labels", "a differing class still counts ...");
  eq(pairKind(has(0, 3)!, { ...s, sameClass: true }), null, "... unless classes must match");
  eq(pairKind([0, 1, 0, 30, -1, 0, 0], s), null, "a scanner pair is never a label match");
  const groups = groupPairs(facts.length, pairs, s);
  eq(groups.map(g => [g.kind, g.members]), [["labels", [0, 1, 2, 3]]], "one group at 1 px: 0, 1, 2, 3");
  check(groups[0].pairs.some(p => !p.sameClass) && groups[0].pairs.every(p => p.boxDev >= 0), "its pairs carry the corner difference and the class flag");
  eq(matchBoxes(two, shift(1.5), 1), null, "matchBoxes: 1.5 px is outside 1 px");

  let seed = 7;   // mulberry32
  const rnd = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296 * 600;
  };
  const many: LabelFacts[] = Array.from({ length: 15000 }, (_, i) => ({
    width: 640, height: 640, boxes: Array.from({ length: 1 + (i % 4) }, () => { const x = rnd(), y = rnd(); return b("head", x, y, x + 10 + rnd() / 10, y + 10 + rnd() / 10); }),
  }));
  many[14999] = { ...many[3], boxes: [...many[3].boxes].reverse() };
  const t0 = performance.now();
  const found = labelPairs(many);
  const ms = performance.now() - t0;
  check(found.some(p => p[0] === 3 && p[1] === 14999), "15,000 images: the planted copy is found");
  const close = found.filter(p => (p as number[])[7] <= 1);
  eq(close.map(p => [p[0], p[1]]), [[3, 14999]], "... and at 1 px nothing else among random boxes");
  check(ms < 1500, "... in well under a couple of seconds", Math.round(ms));
}

phase("time estimates read like times");
{
  const cold = estimateSeconds(14725, "resnet50", false, { hashes: false, model: false, align: false });
  const warm = estimateSeconds(14725, "resnet50", false, { hashes: true, model: true, align: false });
  check(cold > 240 && cold < 420, "a first ResNet50 scan of 14,725 images: ~5 min (measured 292 s)", cold);
  check(warm < 30, "the same scan cached: seconds", warm);
  check(estimateSeconds(14725, "dinov2", true, { hashes: true, model: false, align: false }) > cold,
    "a new model plus alignment takes longer than a first ResNet50 scan");
  eq(durationText(5, false), "under 10 s", "seconds");
  eq(durationText(43, false), "about 45 s", "rounded seconds");
  eq(durationText(292, false), "about 5 min", "minutes");
  eq(durationText(292, true), "حدود 5 دقیقه", "Persian");
  eq(clock(83), "1:23", "clock");
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
  const kept = (i: number) => ({ ...facts[i], keptBefore: i === 2 });
  eq(suggestKeeper([2, 3], kept), 2, "the image kept in an earlier move-out stays again, before more pixels");
  eq(suggestKeeper([1, 2], (i: number) => ({ ...facts[i], keptBefore: i === 1 })), 2,
    "... but not over the split rule: a train survivor still gives way to its test copy");
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

  phase("two move-outs in the same second get two batches, undone last first");
  {
    const ds = path.join(root, "ds4");
    const a = path.join(ds, "images", "a.jpg"), b = path.join(ds, "images", "b.jpg");
    await put(a, "a"); await put(b, "b");
    const r1 = await applyDedup(ds, [{ image: a, keeper: "k" }], "");
    const r2 = await applyDedup(ds, [{ image: b, keeper: "k" }], "");
    check(r1.batch !== r2.batch && r1.batch! < r2.batch!, "two batches, in order", [r1.batch, r2.batch]);
    eq((await undoDedup(ds))?.restored, [b], "undo brings back the second first");
    eq((await undoDedup(ds))?.restored, [a], "then the first — its record was not overwritten");
  }

  phase("dedupHistory: images still out, in how many batches, and the ones kept in their place");
  {
    const ds = path.join(root, "ds3");
    const img = (split: string, n: string) => path.join(ds, split, "images", n);
    const [a, b, c, k, k2] = [img("train", "a.jpg"), img("train", "b.jpg"), img("valid", "c.jpg"), img("test", "k.jpg"), img("test", "k2.jpg")];
    for (const p of [a, b, c, k, k2]) await put(p, "x");
    eq(await dedupHistory(ds), { moved: 0, batches: 0, keepers: [] }, "nothing moved yet");
    await applyDedup(ds, [{ image: a, keeper: k }, { image: b, keeper: k }], "");
    eq(await dedupHistory(ds), { moved: 2, batches: 1, keepers: [k] }, "two moved in one batch, k stayed");
    await applyDedup(ds, [{ image: c, keeper: k2 }], "");
    await undoDedup(ds);
    eq(await dedupHistory(ds), { moved: 2, batches: 1, keepers: [k] }, "an undone batch does not count");
    const other = img("train", "x.jpg"), y = img("test", "y.jpg");
    await put(path.join(`${ds}.duplicates`, "20260101-000000", "manifest.jsonl"), JSON.stringify({ image: other, stored: "s", keeper: y }) + "\n{torn");
    const h = await dedupHistory(ds);
    eq([h.moved, h.batches, h.keepers.sort()], [3, 2, [k, y].sort()], "dataset-dedup.py's batches count too; a torn line is skipped");
    await put(a, "back by hand");
    eq((await dedupHistory(ds)).moved, 2, "an image put back by hand is no longer counted as out");
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
      const steps: string[] = [];
      const info: Record<string, string> = {};
      const res = await runDedupScan(path.resolve("scripts", "dedup_scan.py"), { images, root: dir, model: "none", align: false },
        p => { if (p.phase === "info" && p.key) info[p.key] = p.value ?? ""; else if (!steps.includes(p.phase)) steps.push(p.phase); });
      const names = (p: DedupPair) => [path.basename(res.items[p[0]].path), path.basename(res.items[p[1]].path)].sort().join(" ");
      const byName = new Map(res.pairs.map(p => [names(p), p]));
      check(byName.get("a.png a_copy.png")?.[2] === 1, "a.png and its byte copy are exact", [...byName.keys()]);
      const m = byName.get("a.png a_mirror.png");
      check(!!m && m[3] === 0 && m[5] === 1, "the mirrored copy matches on the mirrored hash", m);
      check(![...byName.keys()].some(k => k.includes("other.png")), "the unrelated image pairs with nothing");
      eq(steps, ["read", "compare"], "progress arrives step by step");
      eq([info.model, info.cached, info.todo], ["none", "0", "4"], "and says what is cached and what is left to read");
      eq(res.model, "none", "the result says which model ran");
      eq((await dedupCacheInfo(dir)).hashes, true, "the hashes are cached beside the images");
      const again: Record<string, string> = {};
      await runDedupScan(path.resolve("scripts", "dedup_scan.py"), { images, root: dir, model: "none", align: false },
        p => { if (p.phase === "info" && p.key) again[p.key] = p.value ?? ""; });
      eq([again.cached, again.todo], ["4", "0"], "a second scan reads nothing");
    }
  }

  phase("dedupCacheInfo reads which models and alignments are cached");
  {
    const ds = path.join(root, "cached");
    for (const f of ["dedup-0123abcd.npz", "dedup-0123abcd-resnet50.npz", "dedup-0123abcd-dinov2.npz", "dedup-0123abcd-dinov2-align.json", "other.txt"]) {
      await put(path.join(ds, ".labeler_dedup_cache", f));
    }
    const c = await dedupCacheInfo(ds);
    eq([c.hashes, c.models.sort(), c.align], [true, ["dinov2", "resnet50"], ["dinov2"]], "hashes, two models, one alignment");
    eq(await dedupCacheInfo(path.join(root, "never")), { hashes: false, models: [], align: [] }, "never scanned: nothing");
  }
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

report();
