// Phase 1 — Annotate / Canvas: box drawing geometry, coordinate conversion,
// and a regression test for the "one drag draws two boxes" StrictMode bug.
//
//   node --experimental-strip-types tests/phase1-annotate.ts

import { phase, check, eq, ok, bad, report } from "./_assert.ts";
import { isDrawable, makeBox, clampRect, MIN_BOX, type Rect } from "../src/lib/boxes.ts";
import { pxToNorm, normToPx } from "../src/ipc.ts";
import type { NBox } from "../src/types.ts";

phase("Box draw threshold (isDrawable)");
check(isDrawable({ x: 0.1, y: 0.1, w: 0.5, h: 0.3 }), "a normal drag is drawable");
check(!isDrawable(null), "null rubber is not drawable");
check(!isDrawable({ x: 0, y: 0, w: 0, h: 0 }), "a zero-size click is not drawable");
check(!isDrawable({ x: 0, y: 0, w: MIN_BOX, h: 0.5 }), "exactly MIN_BOX wide is rejected");
check(isDrawable({ x: 0, y: 0, w: MIN_BOX + 0.001, h: MIN_BOX + 0.001 }), "just over MIN_BOX is accepted");

phase("makeBox");
eq(makeBox({ x: 0.2, y: 0.3, w: 0.4, h: 0.1 }, "car", "b1"),
  { id: "b1", cls: "car", x: 0.2, y: 0.3, w: 0.4, h: 0.1 }, "stamps id + class onto the rect");

phase("clampRect keeps boxes inside the image");
{
  const a = clampRect({ x: -0.2, y: -0.1, w: 0.5, h: 0.5 });
  check(a.x === 0 && a.y === 0 && Math.abs(a.w - 0.5) < 1e-9 && Math.abs(a.h - 0.5) < 1e-9,
    "negative origin clamps to 0", a);
  const b = clampRect({ x: 0.8, y: 0.8, w: 0.5, h: 0.5 });
  check(Math.abs(b.x - 0.8) < 1e-9 && Math.abs(b.w - 0.2) < 1e-9 && Math.abs(b.h - 0.2) < 1e-9,
    "over-wide box is trimmed to the edge", b);
}

phase("Coordinate conversion round-trips (pxToNorm <-> normToPx)");
{
  const W = 1280, H = 853;
  const orig = { cls: "person", x1: 100, y1: 200, x2: 460, y2: 700 };
  const back = normToPx(pxToNorm(orig, W, H), W, H);
  check(
    back.cls === orig.cls &&
    Math.abs(back.x1 - orig.x1) <= 1 && Math.abs(back.y1 - orig.y1) <= 1 &&
    Math.abs(back.x2 - orig.x2) <= 1 && Math.abs(back.y2 - orig.y2) <= 1,
    "px -> norm -> px is stable within 1px", { orig, back },
  );
}

// ---------------------------------------------------------------------------
// Regression: drawing one box must commit exactly ONE box, even though React
// StrictMode double-invokes state updaters in dev. The original bug called
// setBoxes() as a side effect INSIDE the setRubber updater, so it ran twice.
// ---------------------------------------------------------------------------
phase("Regression: StrictMode double-invoke must not duplicate a drawn box");

// A state cell that models React StrictMode: functional updaters are invoked
// twice (both seeing the same committed value); only the last result sticks.
function strictCell<T>(initial: T) {
  let value = initial;
  return {
    get: () => value,
    set: (u: T | ((v: T) => T)) => {
      if (typeof u === "function") { (u as (v: T) => T)(value); value = (u as (v: T) => T)(value); }
      else value = u;
    },
  };
}

const rubberRect: Rect = { x: 0.1, y: 0.1, w: 0.5, h: 0.4 };

// OLD (buggy) shape: side effect nested inside another updater.
{
  const boxes = strictCell<NBox[]>([]);
  const rubber = strictCell<Rect | null>(rubberRect);
  rubber.set((r) => {
    if (isDrawable(r)) boxes.set(bs => [...bs, makeBox(r, "car", "b1")]);
    return null;
  });
  check(boxes.get().length === 2, "OLD pattern reproduces the duplicate (2 boxes)", boxes.get());
}

// NEW (fixed) shape: read the rect, then commit ONCE with a pure updater.
{
  const boxes = strictCell<NBox[]>([]);
  const r = rubberRect;
  if (isDrawable(r)) {
    const id = "b1";
    boxes.set(bs => [...bs, makeBox(r, "car", id)]);
  }
  check(boxes.get().length === 1, "FIXED pattern commits exactly one box", boxes.get());
  eq(boxes.get()[0].cls, "car", "the committed box carries the active class");
}

report();
