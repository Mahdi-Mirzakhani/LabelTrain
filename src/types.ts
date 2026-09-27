// Renderer-side type definitions

export type AnnotationFormat = "YOLO" | "YOLO OBB" | "Pascal VOC" | "COCO" | "CSV";

/**
 * Which label files an OBB-mode save produces.
 *  - "obb"  → only YOLO OBB (`cls x1 y1 … x4 y4`), what `yolo obb train` reads
 *  - "hbb"  → only the project's own format, from the rotated box's upright
 *             bounding rect. Lossy: the angle is gone from the file.
 *  - "both" → both of the above, the HBB set in its usual place and the OBB set
 *             in a companion `*_obb` folder, so one pass labels two datasets.
 */
export type ObbSaveMode = "obb" | "hbb" | "both";

export interface ClassDef {
  id: string;
  name: string;
  color: string;
}

// Box in normalized (0..1) coordinates — what the canvas operates on.
export interface NBox {
  id: string;
  cls: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Rotation about the box centre, in RADIANS. Absent or 0 means an ordinary
   * upright box, so every pre-OBB box keeps working untouched.
   *
   * x/y/w/h always describe the box BEFORE this rotation is applied — the
   * angle never moves the centre. Note the angle lives in image-PIXEL space:
   * normalized units scale x by the image width and y by its height
   * independently, so an angle only means anything once both axes are back in
   * pixels. Everything in lib/obb.ts therefore takes the image dimensions.
   */
  r?: number;
  conf?: number;
}

export interface ImageItem {
  id: string;
  name: string;
  path: string;          // absolute path, empty for sample data
  url: string;           // src for <img>
  thumb: string;
  w: number;
  h: number;
  size?: number;
  mtime?: number;
  labeled: boolean;
  boxes: NBox[];
  modified?: string;     // human-readable
  dirty?: boolean;       // unsaved changes
  hydrated?: boolean;    // dimensions + annotations have been loaded
}

export interface ProjectInfo {
  id: string;
  name: string;
  imageDir: string;
  classes: string[];
  format: AnnotationFormat;
  outputDir: string;
  createdAt: number;
  lastOpenedAt: number;
  count?: number;
  labeled?: number;
  /** When `labeled` was last counted over the whole folder; absent = never, the number is stale. */
  labeledAt?: number;
  /** Images marked reviewed (from .labeler_progress.json); shown on the project card. */
  reviewed?: number;
  thumbs?: string[];
  fmt?: AnnotationFormat; // alias for sample data
  opened?: string;
}

export type ThemeMode = "dark" | "light";
export type Density = "compact" | "comfortable" | "spacious";
export type LangCode = "en" | "fa";

export interface Toast {
  id: string;
  icon?: string;
  msg: string;
  undo?: () => void;
  /** Label for the action button (defaults to "Undo" when `undo` is set). */
  actionLabel?: string;
  /** Stay until dismissed instead of auto-hiding after a few seconds. */
  sticky?: boolean;
}

export interface CmdItem {
  id: string;
  group: string;
  icon: string;
  label: string;
  keys?: string[];
  kw?: string;
  run?: () => void;
}
