// Renderer-side helpers wrapping window.api with normalized<->pixel conversion
// and graceful fallback when running outside Electron (e.g. plain `vite` dev).

import type { ElectronAPI, BBox } from "./electron-api.d";
import type { NBox, AnnotationFormat, ImageItem } from "./types";

// Detect Electron at module load. window.api is set by the preload script
// which runs before the renderer's script bundle is evaluated.
//
// If this is false in a built Electron app, the preload script failed to load
// (wrong file path, syntax error, missing file). Open DevTools to see why.
export const inElectron: boolean = typeof window !== "undefined" && !!window.api;

if (typeof window !== "undefined") {
  (window as any).__labelstudio_inElectron = inElectron;
  if (!inElectron) {
    console.warn(
      "[labelstudio] window.api is undefined. The preload script did not run. " +
      "Check the main process console for path errors.",
    );
  } else {
    console.log("[labelstudio] window.api ready ✓");
  }
}

function api(): ElectronAPI {
  if (!window.api) throw new Error("Electron API not available — running outside Electron?");
  return window.api;
}

export function pathToAppUrl(absolute: string): string {
  // app:///C:/foo/bar.jpg  — see electron/main.ts protocol handler
  const norm = absolute.replaceAll("\\", "/");
  const prefix = norm.startsWith("/") ? "app://local" : "app://local/";
  return prefix + encodeURI(norm);
}

export function pxToNorm(b: BBox, w: number, h: number, id?: string): NBox {
  return {
    id: id ?? "b_" + Math.random().toString(36).slice(2, 9),
    cls: b.cls,
    x: b.x1 / w,
    y: b.y1 / h,
    w: (b.x2 - b.x1) / w,
    h: (b.y2 - b.y1) / h,
    // Rotation is an angle, not a length, so it crosses the pixel/normalized
    // boundary untouched — see the note on NBox.r.
    r: b.r,
    conf: b.conf,
  };
}

export function normToPx(b: NBox, w: number, h: number): BBox {
  return {
    cls: b.cls,
    x1: Math.round(b.x * w),
    y1: Math.round(b.y * h),
    x2: Math.round((b.x + b.w) * w),
    y2: Math.round((b.y + b.h) * h),
    r: b.r,
    conf: b.conf,
  };
}

export async function openFolder(): Promise<string | null> {
  return inElectron ? api().openFolderDialog() : null;
}

export async function listImagesInFolder(folder: string): Promise<ImageItem[]> {
  if (!inElectron) return [];
  const paths = await api().listImagePaths(folder);
  return paths.map((imagePath) => ({
    id: imagePath,
    name: imagePath.split(/[\\/]/).pop() ?? imagePath,
    path: imagePath,
    url: pathToAppUrl(imagePath),
    thumb: pathToAppUrl(imagePath),
    w: 1280,
    h: 853,
    size: 0,
    mtime: 0,
    labeled: false,
    boxes: [],
    modified: "—",
    hydrated: false,
  }));
}

export async function loadBoxes(
  image: ImageItem,
  classes: string[],
  format: AnnotationFormat,
  outputDir: string,
): Promise<NBox[]> {
  if (!inElectron || !image.path) return [];
  const px = await api().loadAnnotations({
    imagePath: image.path, classes, format, outputDir,
  });
  return px.map((b) => pxToNorm(b, image.w, image.h));
}

/**
 * Which file(s) a save produces. `format` is the one the app also READS back,
 * so it must be the lossless one whenever a lossless option exists — otherwise
 * reopening an image would silently drop whatever the other file was keeping.
 */
export interface SavePlan {
  format: AnnotationFormat;
  companion?: { format: AnnotationFormat; dirSuffix: string };
}

export async function saveBoxes(
  image: ImageItem,
  boxes: NBox[],
  classes: string[],
  plan: SavePlan,
  outputDir: string,
): Promise<string[]> {
  if (!inElectron || !image.path) return [];
  // The renderer stores boxes normalized (0..1) and converts back with the
  // image's OWN dimensions, so writing before those are known would scale every
  // coordinate by the placeholder size. Refuse instead of writing garbage.
  if (!(image.w > 0) || !(image.h > 0)) {
    throw new Error(`Unknown image size for ${image.name} — refusing to write misplaced labels.`);
  }
  const px = boxes.map((b) => normToPx(b, image.w, image.h));
  const res = await api().saveAnnotations({
    imagePath: image.path, annotations: px,
    classes, format: plan.format, outputDir,
    companion: plan.companion,
  });
  // Class names the target format could not represent (YOLO only). Returned so
  // the caller can warn — these boxes are NOT in the file that was just written.
  return res?.dropped ?? [];
}

export function imageModifiedTime(mtime: number): string {
  if (!mtime) return "—";
  const diff = Date.now() - mtime;
  const min = 60_000, hr = 60 * min, day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return Math.round(diff / min) + "m";
  if (diff < day) return Math.round(diff / hr) + "h";
  if (diff < 7 * day) return Math.round(diff / day) + "d";
  return new Date(mtime).toLocaleDateString();
}
