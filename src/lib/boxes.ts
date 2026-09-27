// Pure box-geometry helpers shared by the canvas and tested in isolation.

import type { NBox } from "../types";

export interface Rect { x: number; y: number; w: number; h: number; }

// Fallback minimum normalized side length for a drawn rubber-band to become a
// real box. The canvas passes a much smaller, pixel-based threshold instead (a
// few on-screen pixels) so that small objects — especially when zoomed in — can
// still be labeled; this constant is only the default when no threshold is given.
export const MIN_BOX = 0.02;

/**
 * A rubber-band rect is only committed once it is larger than the minimum on
 * both axes. Anything smaller is treated as an accidental click, not a drag.
 * `minW`/`minH` let the caller pass a pixel-derived threshold so the minimum
 * drawable size does not scale with the image resolution.
 */
export function isDrawable(
  r: Rect | null | undefined,
  minW: number = MIN_BOX,
  minH: number = minW,
): r is Rect {
  return !!r && r.w > minW && r.h > minH;
}

/** Build a normalized box from a finished rubber-band rect. */
export function makeBox(r: Rect, cls: string, id: string): NBox {
  return { id, cls, x: r.x, y: r.y, w: r.w, h: r.h };
}

/** Clamp a normalized rect fully inside the [0,1] unit square. */
export function clampRect(r: Rect): Rect {
  const x = Math.max(0, Math.min(1, r.x));
  const y = Math.max(0, Math.min(1, r.y));
  return {
    x, y,
    w: Math.max(0, Math.min(1 - x, r.w)),
    h: Math.max(0, Math.min(1 - y, r.h)),
  };
}
