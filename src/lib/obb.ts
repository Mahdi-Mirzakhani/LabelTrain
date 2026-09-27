// Oriented-box geometry for the canvas.
//
// An NBox stores x/y/w/h normalized to 0..1 and an optional rotation `r` in
// radians about its centre. The one thing to keep straight: normalized space is
// ANISOTROPIC — x is divided by the image width and y by its height, so a
// rotation there would shear the box unless the image happens to be square. The
// angle is therefore defined in image-PIXEL space, and every helper below takes
// the image dimensions and does its trigonometry after scaling back up.
//
// Rendering escapes this because the canvas scales both axes by the same factor
// (its wrapper keeps the image's aspect ratio), so a CSS `rotate(r)` on screen
// really is a rotation by `r` in pixel space.

import type { NBox } from "../types";

export interface Pt { x: number; y: number }

/** Below this the angle is treated as zero — an upright box, not a 0.01° one. */
const EPS = 1e-4;

/** Smallest side a rotated resize may produce, in image pixels. */
const MIN_SIDE_PX = 2;

export const toDeg = (rad: number): number => (rad * 180) / Math.PI;
export const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Fold an angle into (-90°, 90°]. A rectangle rotated by θ and by θ+180° is the
 * same rectangle, so without this the UI would show two different numbers for
 * one shape and the angle would drift without bound as the user spins a box.
 */
export function normalizeAngle(rad: number): number {
  const HALF = Math.PI / 2;
  let a = rad;
  if (!Number.isFinite(a)) return 0;
  a = a % Math.PI;                 // (-180°, 180°)
  if (a > HALF) a -= Math.PI;      // (-90°, 90°]
  else if (a <= -HALF) a += Math.PI;
  return Math.abs(a) < EPS ? 0 : a;
}

/** True when the box carries a rotation worth preserving. */
export function isRotated(b: { r?: number }): boolean {
  return Math.abs(b.r ?? 0) > EPS;
}

/** Whether any box in the list is rotated — drives the lossy-save warning. */
export function anyRotated(boxes: { r?: number }[]): boolean {
  return boxes.some(isRotated);
}

/** Centre of a box, in image pixels. */
export function centrePx(b: NBox, W: number, H: number): Pt {
  return { x: (b.x + b.w / 2) * W, y: (b.y + b.h / 2) * H };
}

/**
 * The four corners in image-pixel space, in perimeter order starting from the
 * box's own top-left: TL → TR → BR → BL. Perimeter order matters — YOLO runs
 * the quad through `cv2.minAreaRect`, which needs a traced outline rather than
 * a zig-zag through opposite corners.
 */
export function cornersPx(b: NBox, W: number, H: number): Pt[] {
  const c = centrePx(b, W, H);
  const hw = (b.w * W) / 2;
  const hh = (b.h * H) / 2;
  const r = b.r ?? 0;
  const cos = Math.cos(r), sin = Math.sin(r);
  const local: Pt[] = [
    { x: -hw, y: -hh }, { x: hw, y: -hh },
    { x: hw, y: hh }, { x: -hw, y: hh },
  ];
  return local.map(p => ({
    x: c.x + p.x * cos - p.y * sin,
    y: c.y + p.x * sin + p.y * cos,
  }));
}

/** The same four corners normalized to 0..1 — the on-disk YOLO OBB layout. */
export function cornersNorm(b: NBox, W: number, H: number): Pt[] {
  return cornersPx(b, W, H).map(p => ({ x: p.x / W, y: p.y / H }));
}

/**
 * The upright rect that encloses a (possibly rotated) box, normalized. This is
 * what the HBB formats fall back to, and what clamping works against.
 */
export function aabbNorm(b: NBox, W: number, H: number): { x: number; y: number; w: number; h: number } {
  if (!isRotated(b)) return { x: b.x, y: b.y, w: b.w, h: b.h };
  const pts = cornersNorm(b, W, H);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Shift a box so its rotated footprint sits inside the image. Returns the new
 * x/y only — rotating never changes the size. For an upright box this is
 * exactly the old `x + w <= 1` clamp, so nothing about HBB editing changes.
 */
export function clampIntoImage(b: NBox, W: number, H: number): { x: number; y: number } {
  const a = aabbNorm(b, W, H);
  let dx = 0, dy = 0;
  if (a.x < 0) dx = -a.x;
  else if (a.x + a.w > 1) dx = 1 - (a.x + a.w);
  if (a.y < 0) dy = -a.y;
  else if (a.y + a.h > 1) dy = 1 - (a.y + a.h);
  return { x: b.x + dx, y: b.y + dy };
}

/**
 * Resize a rotated box by dragging one of its eight handles.
 *
 * The handle's OPPOSITE corner (or edge midpoint) is pinned in place and the
 * drag is measured along the box's own rotated axes, so a corner follows the
 * pointer instead of sliding sideways the way an axis-aligned resize would once
 * the box is turned. With r = 0 this reduces to the plain edge math.
 *
 * `start` is the box as it was when the drag began; `pointer` is in normalized
 * canvas coordinates.
 */
export function resizeRotated(
  start: NBox,
  handle: string,
  pointer: Pt,
  W: number,
  H: number,
): { x: number; y: number; w: number; h: number } {
  const r = start.r ?? 0;
  const cos = Math.cos(r), sin = Math.sin(r);
  // The box's local axes expressed in image space.
  const ux: Pt = { x: cos, y: sin };
  const uy: Pt = { x: -sin, y: cos };

  const c = centrePx(start, W, H);
  const hw = (start.w * W) / 2;
  const hh = (start.h * H) / 2;

  // Which local edges this handle moves. 0 = that axis is untouched, so an
  // "n"/"s" drag keeps the width and an "e"/"w" drag keeps the height.
  const sx = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0;
  const sy = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;

  // The pinned point, in local coords then in image coords.
  const ax = -sx * hw, ay = -sy * hh;
  const anchor: Pt = {
    x: c.x + ax * ux.x + ay * uy.x,
    y: c.y + ax * ux.y + ay * uy.y,
  };

  const p: Pt = { x: pointer.x * W, y: pointer.y * H };
  const d: Pt = { x: p.x - anchor.x, y: p.y - anchor.y };
  const dx = d.x * ux.x + d.y * ux.y;   // along the box's width
  const dy = d.x * uy.x + d.y * uy.y;   // along the box's height

  const newW = sx === 0 ? hw * 2 : Math.max(MIN_SIDE_PX, Math.abs(dx));
  const newH = sy === 0 ? hh * 2 : Math.max(MIN_SIDE_PX, Math.abs(dy));

  // Centre = anchor pushed half the new extent along each axis the drag owns,
  // in whichever direction the pointer went. `|| sx` keeps the sign stable when
  // the pointer lands exactly on the anchor.
  const offX = sx === 0 ? 0 : Math.sign(dx || sx) * (newW / 2);
  const offY = sy === 0 ? 0 : Math.sign(dy || sy) * (newH / 2);
  const ncx = anchor.x + offX * ux.x + offY * uy.x;
  const ncy = anchor.y + offX * ux.y + offY * uy.y;

  return {
    x: (ncx - newW / 2) / W,
    y: (ncy - newH / 2) / H,
    w: newW / W,
    h: newH / H,
  };
}

/**
 * The angle that points the box's rotation knob at the pointer. The knob hangs
 * off the top edge, i.e. along local -y, hence the quarter-turn offset.
 */
export function angleFromPointer(b: NBox, pointer: Pt, W: number, H: number): number {
  const c = centrePx(b, W, H);
  const dx = pointer.x * W - c.x;
  const dy = pointer.y * H - c.y;
  if (dx === 0 && dy === 0) return b.r ?? 0;
  return Math.atan2(dy, dx) + Math.PI / 2;
}

/** Snap to the nearest `stepDeg` — held Shift while rotating. */
export function snapAngle(rad: number, stepDeg: number): number {
  const step = toRad(stepDeg);
  return normalizeAngle(Math.round(rad / step) * step);
}
