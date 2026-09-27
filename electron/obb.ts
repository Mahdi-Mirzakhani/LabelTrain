// Corner ⇄ (upright rect + angle) conversion for oriented boxes, on the Node
// side of the IPC boundary.
//
// A `BBox` keeps x1/y1/x2/y2 as the box's UPRIGHT rect plus a rotation `r`
// about its centre. YOLO OBB files instead store four corners. These helpers
// move between the two.
//
// Deliberately standalone rather than shared with src/lib/obb.ts: main and
// renderer compile as separate programs under different tsconfigs, and the
// codebase already mirrors its IPC types the same way.

export interface Pt { x: number; y: number }

const EPS = 1e-4;

/** Fold an angle into (-90°, 90°] — θ and θ+180° describe the same rectangle. */
export function normalizeAngle(rad: number): number {
  const HALF = Math.PI / 2;
  if (!Number.isFinite(rad)) return 0;
  let a = rad % Math.PI;
  if (a > HALF) a -= Math.PI;
  else if (a <= -HALF) a += Math.PI;
  return Math.abs(a) < EPS ? 0 : a;
}

/**
 * The four corners of an upright-rect-plus-angle box, in perimeter order
 * (TL → TR → BR → BL). Perimeter order is required: Ultralytics feeds the quad
 * straight into `cv2.minAreaRect`, which needs a traced outline.
 */
export function cornersOf(
  x1: number, y1: number, x2: number, y2: number, r: number,
): Pt[] {
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const hw = (x2 - x1) / 2, hh = (y2 - y1) / 2;
  const cos = Math.cos(r), sin = Math.sin(r);
  return [
    { x: -hw, y: -hh }, { x: hw, y: -hh },
    { x: hw, y: hh }, { x: -hw, y: hh },
  ].map(p => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos,
  }));
}

const cross = (o: Pt, a: Pt, b: Pt): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Monotone-chain convex hull, counter-clockwise, without the repeated point. */
function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (p.length < 3) return p;
  const half = (src: Pt[]): Pt[] => {
    const out: Pt[] = [];
    for (const q of src) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half([...p].reverse())];
}

/**
 * Smallest-area enclosing rectangle of a point set — the same thing
 * `cv2.minAreaRect` computes, so a file written by any other tool is read back
 * the way Ultralytics itself would read it.
 *
 * Uses the standard result that a minimal rectangle has one side flush with a
 * hull edge, so it just tries every edge direction. The hull is at most four
 * points here, which makes the quadratic scan free.
 */
export function minAreaRect(pts: Pt[]): {
  cx: number; cy: number; w: number; h: number; r: number;
} {
  const hull = convexHull(pts);
  if (hull.length < 2) {
    const p = hull[0] ?? { x: 0, y: 0 };
    return { cx: p.x, cy: p.y, w: 0, h: 0, r: 0 };
  }

  let best: { cx: number; cy: number; w: number; h: number; r: number; area: number } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    // Unit axes for this candidate orientation.
    const ux = ex / len, uy = ey / len;

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = p.x * ux + p.y * uy;
      const v = -p.x * uy + p.y * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const w = maxU - minU, h = maxV - minV;
    const area = w * h;
    // First orientation wins ties, which keeps the result deterministic. A true
    // rectangle has two tied orientations 90° apart describing the SAME shape,
    // and nothing in an unordered point set can say which one the author meant
    // — that is exactly why `boxFromCorners` reads ordered corners directly and
    // only falls back here for quads that are not rectangles.
    if (best && area >= best.area) continue;

    // Centre back in image space, from its (u, v) midpoint.
    const mu = (minU + maxU) / 2, mv = (minV + maxV) / 2;
    best = {
      cx: mu * ux - mv * uy,
      cy: mu * uy + mv * ux,
      w, h,
      // Folding only ever shifts by a multiple of 180°, which maps a rectangle
      // onto itself — so w and h stay as measured.
      r: normalizeAngle(Math.atan2(uy, ux)),
      area,
    };
  }

  if (!best) {
    const p = hull[0];
    return { cx: p.x, cy: p.y, w: 0, h: 0, r: 0 };
  }
  return { cx: best.cx, cy: best.cy, w: best.w, h: best.h, r: best.r };
}

/** How far a quad may stray from a true rectangle and still be read by order. */
const RECT_TOL = 1e-3;

/**
 * Recover the box from ordered corners, assuming they trace a rectangle from
 * its own top-left: p0→p1 spans the WIDTH and p0→p3 the HEIGHT.
 *
 * This is what makes a save→load round-trip exact. `minAreaRect` alone cannot
 * do it: a 40×20 box at 60° and a 20×40 box at −30° are the same four points,
 * and an unordered fit has no way to tell which the user drew — so it would
 * report a box the inspector shows transposed, with an angle nobody typed.
 * Corner ORDER carries that missing information, and we write it ourselves.
 *
 * Returns null when the quad is not a rectangle (a DOTA-converted file, say),
 * leaving the caller to fall back to the unordered fit.
 */
function asOrderedRectangle(pts: Pt[]): {
  cx: number; cy: number; w: number; h: number; r: number;
} | null {
  if (pts.length !== 4) return null;
  const [p0, p1, p2, p3] = pts;
  const w = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const h = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  if (w < 1e-9 || h < 1e-9) return null;
  const scale = Math.max(w, h);
  // Opposite sides equal…
  if (Math.abs(w - Math.hypot(p2.x - p3.x, p2.y - p3.y)) > scale * RECT_TOL) return null;
  if (Math.abs(h - Math.hypot(p2.x - p1.x, p2.y - p1.y)) > scale * RECT_TOL) return null;
  // …and adjacent sides square to each other.
  const ux = (p1.x - p0.x) / w, uy = (p1.y - p0.y) / w;
  const vx = (p3.x - p0.x) / h, vy = (p3.y - p0.y) / h;
  if (Math.abs(ux * vx + uy * vy) > RECT_TOL) return null;
  return { cx: (p0.x + p2.x) / 2, cy: (p0.y + p2.y) / 2, w, h, r: Math.atan2(uy, ux) };
}

/** Quad → the upright rect + angle a BBox stores. */
export function boxFromCorners(pts: Pt[]): {
  x1: number; y1: number; x2: number; y2: number; r: number;
} {
  const fit = asOrderedRectangle(pts) ?? minAreaRect(pts);
  const { cx, cy, w, h } = fit;
  // Folding shifts by a multiple of 180°, which maps a rectangle onto itself,
  // so the width and height measured above stay put.
  return {
    x1: cx - w / 2, y1: cy - h / 2,
    x2: cx + w / 2, y2: cy + h / 2,
    r: normalizeAngle(fit.r),
  };
}
