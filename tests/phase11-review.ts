// Phase 11 — the review list: reading an audit's .labeler_review.json, ranking
// the file list by it, walking that order with next/previous, and the hint text.
//
//   node --experimental-strip-types tests/phase11-review.ts

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { phase, check, eq, report } from "./_assert.ts";
import { loadReview, REVIEW_FILE } from "../electron/review.ts";
import { flagSummary, flagText, listOrder, stepInOrder } from "../src/lib/review.ts";
import { matchesFilter } from "../src/lib/progress.ts";

phase("loadReview keeps what is well-formed and drops the rest");
{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ls-review-"));
  try {
    eq(await loadReview(dir), null, "no file => null");
    await fs.writeFile(path.join(dir, REVIEW_FILE), "{broken", "utf-8");
    eq(await loadReview(dir), null, "corrupt file => null, no throw");
    await fs.writeFile(path.join(dir, REVIEW_FILE), JSON.stringify({
      created: "2026-09-28T08:38:50", classes: ["helmet", "head"],
      items: [
        { name: "a.jpg", score: 1.4, flags: [
          { kind: "missing", cls: 1, conf: 0.9, box: [0.1, 0.1, 0.2, 0.3] },
          { kind: "too big", cls: 0, conf: 0.8, box: [0.3, 0.3, 0.6, 0.7], inner: [0.35, 0.35, 0.45, 0.5] },
          { kind: "nonsense", cls: 0, box: [0, 0, 1, 1] },
          { kind: "empty", cls: 0, box: [0.5, 0.5, 0.4, 0.6] },
        ] },
        { name: "b.jpg", score: 0.6, flags: [{ kind: "wrong class", cls: 1, conf: 0.8, other: 0, box: [0, 0, 0.1, 0.1] }] },
        { name: "c.jpg", flags: [] },
        { flags: [{ kind: "missing", cls: 0, box: [0, 0, 0.1, 0.1] }] },
      ],
    }), "utf-8");
    const r = await loadReview(dir);
    eq(r?.items.map(i => i.name), ["a.jpg", "b.jpg"], "items without a name or a usable flag are dropped");
    eq(r?.items[0].flags.map(f => f.kind), ["missing", "too big"], "unknown kinds and inverted boxes are dropped");
    eq(r?.items[0].flags[1].inner, [0.35, 0.35, 0.45, 0.5], "the inner box of 'too big' is kept");
    eq(r?.items[1].flags[0].other, 0, "the other class of 'wrong class' is kept");
    eq(r?.classes, ["helmet", "head"], "class names");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

phase("listOrder: folder order, or by score");
{
  const score = [0.2, 1.5, 0, 0.9, 1.5];
  eq(listOrder(5, i => i !== 2), [0, 1, 3, 4], "kept indices in folder order");
  eq(listOrder(5, i => score[i] > 0, i => score[i]), [1, 4, 3, 0], "highest first, ties in folder order");
  eq(listOrder(0, () => true), [], "empty");
}

phase("stepInOrder walks what the list shows");
{
  const folder = [0, 2, 5, 7];
  eq(stepInOrder(folder, 2, 1), 5, "next in folder order");
  eq(stepInOrder(folder, 2, -1), 0, "previous");
  eq(stepInOrder(folder, 7, 1), 7, "stays at the end");
  eq(stepInOrder(folder, 0, -1), 0, "stays at the start");
  eq(stepInOrder(folder, 3, 1), 5, "from an unlisted image: the next listed one after it");
  eq(stepInOrder(folder, 3, -1), 2, "and the previous listed one before it");
  const ranked = [7, 0, 5];
  eq(stepInOrder(ranked, 0, 1), 5, "ranked: the next by urgency, not by position");
  eq(stepInOrder(ranked, 3, 1, true), 7, "ranked, from an unlisted image: the top of the list");
  eq(stepInOrder(ranked, 3, -1, true), 3, "ranked, backwards from outside: stay");
  eq(stepInOrder([], 4, 1), 4, "nothing listed: stay");
}

phase("the review filters");
{
  eq(matchesFilter("toReview", true, false, true), true, "flagged, not yet looked at");
  eq(matchesFilter("toReview", true, true, true), false, "flagged but already reviewed");
  eq(matchesFilter("toReview", true, false, false), false, "not flagged");
  eq(matchesFilter("flagged", true, true, true), true, "all flagged, reviewed or not");
  eq(matchesFilter("all", false, false), true, "the old filters still work without the flag");
}

phase("hint and summary text");
{
  const names = ["helmet", "head"];
  const miss = { kind: "missing" as const, cls: 1, conf: 0.9, box: [0, 0, 1, 1] as [number, number, number, number] };
  const wrong = { kind: "wrong class" as const, cls: 1, conf: 0.8, other: 0, box: [0, 0, 1, 1] as [number, number, number, number] };
  eq(flagText(miss, names, false), "unlabelled head?", "missing, English");
  eq(flagText(miss, names, true), "سر بی‌برچسب؟", "missing, Persian");
  eq(flagText(wrong, names, false), "helmet, not head?", "wrong class");
  eq(flagSummary([miss, miss, wrong], false), "2 unlabelled · 1 wrong class", "summary counts by kind");
  check(flagText({ ...miss, cls: 7 }, names, false).includes("#7"), "an unknown class index still reads");
}

report();
