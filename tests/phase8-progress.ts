// Phase 8 — review progress: which images were gone past, and where to resume.
//
//   node --experimental-strip-types tests/phase8-progress.ts

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { phase, check, eq, report } from "./_assert.ts";
import { matchesFilter, resumeIndex, stepProgress, type Progress } from "../src/lib/progress.ts";
import { loadProgress, saveProgress, PROGRESS_FILE } from "../electron/progress.ts";

phase("resumeIndex reopens at the last image, or the first");
{
  const names = ["a.jpg", "b.jpg", "c.jpg"];
  eq(resumeIndex(names, "c.jpg"), 2, "the last image's index");
  eq(resumeIndex(names, null), 0, "nothing saved => first image");
  eq(resumeIndex(names, "gone.jpg"), 0, "a file that was removed => first image");
  eq(resumeIndex([], "a.jpg"), 0, "empty folder => 0");
}

phase("stepProgress marks the image left behind, never the one arrived at");
{
  const p0: Progress = { reviewed: new Set(), last: "a.jpg" };
  const p1 = stepProgress(p0, "a.jpg", "b.jpg");
  eq([...p1.reviewed], ["a.jpg"], "moving a -> b marks a");
  eq(p1.last, "b.jpg", "b is where to resume");
  check(!p1.reviewed.has("b.jpg"), "b itself is not marked yet");
  check(p0.reviewed.size === 0, "the previous state is not mutated");

  const p2 = stepProgress(p1, "b.jpg", "b.jpg");
  check(p2 === p1, "no move => the same object (no re-render, no write)");

  const p3 = stepProgress(p1, null, "b.jpg");
  check(p3 === p1, "arriving at a freshly opened folder changes nothing");

  const p4 = stepProgress(p1, "b.jpg", "a.jpg");
  eq([...p4.reviewed].sort(), ["a.jpg", "b.jpg"], "going back marks b and keeps a");
  const p5 = stepProgress(p4, "a.jpg", "b.jpg");
  check(p5.reviewed === p4.reviewed, "an already-marked image is not re-added (set reused)");
  eq(p5.last, "b.jpg", "but the resume point still moves");
}

phase("matchesFilter combines labelling and review status");
{
  eq(matchesFilter("all", false, false), true, "all shows everything");
  eq(matchesFilter("labeled", true, false), true, "labeled");
  eq(matchesFilter("unlabeled", true, false), false, "unlabeled hides labeled");
  eq(matchesFilter("reviewed", false, true), true, "reviewed shows reviewed");
  eq(matchesFilter("reviewed", true, false), false, "reviewed hides unreviewed");
  eq(matchesFilter("unreviewed", true, false), true, "unreviewed shows the rest");
}

phase("the progress file round-trips and fails soft");
{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ls-progress-"));
  try {
    eq(await loadProgress(dir), { reviewed: [], last: null }, "no file => nothing reviewed");

    const res = await saveProgress(dir, { reviewed: ["a.jpg", "b.jpg"], last: "c.jpg" });
    check(res.ok, "save reports ok", res);
    eq(await loadProgress(dir), { reviewed: ["a.jpg", "b.jpg"], last: "c.jpg" }, "save -> load");
    eq((await fs.readdir(dir)).sort(), [PROGRESS_FILE], "no temp file left behind");

    await fs.writeFile(path.join(dir, PROGRESS_FILE), "{not json", "utf-8");
    eq(await loadProgress(dir), { reviewed: [], last: null }, "corrupt file => empty, no throw");

    await fs.writeFile(path.join(dir, PROGRESS_FILE), JSON.stringify({ reviewed: ["x.jpg", 3, null], last: 7 }), "utf-8");
    eq(await loadProgress(dir), { reviewed: ["x.jpg"], last: null }, "wrong types are dropped");

    // Overlapping saves must land in call order, so the newest marks win.
    const many = Array.from({ length: 20 }, (_, i) =>
      saveProgress(dir, { reviewed: Array.from({ length: i + 1 }, (_, k) => `img${k}.jpg`), last: `img${i}.jpg` }));
    await Promise.all(many);
    const final = await loadProgress(dir);
    eq(final.last, "img19.jpg", "the last of 20 overlapping saves wins");
    eq(final.reviewed.length, 20, "with all of its marks");

    const big = Array.from({ length: 15000 }, (_, i) => `hh_${String(i).padStart(6, "0")}.jpg`);
    await saveProgress(dir, { reviewed: big, last: big[14999] });
    eq((await loadProgress(dir)).reviewed.length, 15000, "a 15k-image folder round-trips");

    const ro = await saveProgress(path.join(dir, "no", "such", "folder"), { reviewed: [], last: null });
    check(!ro.ok && typeof ro.error === "string", "an unwritable folder reports the error instead of throwing", ro);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

report();
