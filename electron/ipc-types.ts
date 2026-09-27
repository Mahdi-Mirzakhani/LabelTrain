// Shared IPC types — imported by both main and renderer

export type { LicenseStatus, ActivateResult } from "./license/types.ts";
import type { LicenseStatus, ActivateResult } from "./license/types.ts";

export type AnnotationFormat = "YOLO" | "YOLO OBB" | "Pascal VOC" | "COCO" | "CSV";

export interface BBox {
  cls: string;
  x1: number; // pixel coords (0..imageWidth)
  y1: number;
  x2: number;
  y2: number;
  /**
   * Rotation about the box centre, in radians. Absent or 0 = an upright box,
   * so every existing format keeps round-tripping unchanged.
   *
   * x1/y1/x2/y2 stay the box's UPRIGHT rect — the rotation is applied around
   * its centre afterwards, never folded into the corners. Only "YOLO OBB" can
   * store this; the other formats write the rotated box's bounding rect.
   */
  r?: number;
  conf?: number;
}

export interface ImageEntry {
  path: string;     // absolute path
  name: string;     // file name
  width: number;
  height: number;
  size: number;     // bytes
  mtime: number;    // last modified epoch ms
}

export interface ProjectMeta {
  name: string;
  imageDir: string;
  classes: string[];
  format: AnnotationFormat;
  outputDir: string;
  createdAt: number;
  lastOpenedAt: number;
  count?: number;
  labeled?: number;
}

export interface RecentProject extends ProjectMeta {
  previewPaths?: string[];
}

export interface SaveAnnotationsRequest {
  imagePath: string;
  annotations: BBox[];
  classes: string[];
  format: AnnotationFormat;
  outputDir: string;
  /**
   * A SECOND file written from the same boxes in a different format, next to
   * the primary one. OBB mode's "both" setting uses it to emit the rotated
   * dataset and the upright one in a single save.
   *
   * The companion lands in a sibling folder named `<primary dir><dirSuffix>`
   * so the two label sets never collide on `<stem>.txt`. Resolving it in the
   * main process keeps it in step with `writeDirFor`'s output-dir rules — the
   * renderer has no business re-deriving those paths.
   */
  companion?: { format: AnnotationFormat; dirSuffix: string };
}

export interface SaveAnnotationsResult {
  ok: boolean;
  /**
   * Class names that could not be written in the target format and were left
   * out of the file. Only YOLO can produce these (it stores a class INDEX, so
   * a name outside the project's ordered list is unrepresentable). The
   * renderer surfaces them — a dropped box used to vanish silently.
   */
  dropped: string[];
}

export interface LoadAnnotationsRequest {
  imagePath: string;
  classes: string[];
  format: AnnotationFormat;
  outputDir: string;
}

export interface SplitConfig {
  imagePaths: string[];
  classes: string[];
  sourceFormat: AnnotationFormat;
  sourceOutputDir: string;
  outRoot: string;
  trainRatio: number;
  valRatio: number;
  testRatio: number;
  copyImages: boolean;
  seed: number;
  /** Write dataset.yaml (default true). */
  writeYaml?: boolean;
  /** Also emit a train.py starter script (default false). */
  writeTrainPy?: boolean;
}

export interface SplitResult {
  train: number;
  val: number;
  test: number;
  /** How many of the split images actually had labels to copy across. */
  labeled: number;
  yamlPath: string;
  trainPyPath?: string;
  outRoot: string;
}

export interface ExportConfig {
  imagePaths: string[];
  classes: string[];
  /** Format the labels are currently stored in (to read them). */
  sourceFormat: AnnotationFormat;
  sourceOutputDir: string;
  /** Destination folder picked by the user. */
  outRoot: string;
  /** Format to write the exported labels in. */
  format: AnnotationFormat;
  copyImages: boolean;
  /** Skip images that have no annotations (default false). */
  labeledOnly?: boolean;
  /** Write dataset.yaml for YOLO exports (default true). */
  writeYaml?: boolean;
  /** Compress the export into a single .zip instead of a folder. */
  zip?: boolean;
}

export interface ExportResult {
  count: number;
  /** How many of the exported images actually had labels. */
  labeled: number;
  outRoot: string;
  yamlPath?: string;
}

export interface AutoLabelRequest {
  imagePaths: string[];
  modelPath: string;
  conf: number;
  iou: number;
  device?: "cpu" | "cuda";
  allowedClasses?: string[];
}

export interface AutoLabelResult {
  imagePath: string;
  /** Pixel dims of the frame inference ran on (EXIF rotation applied). 0 = unknown. */
  width?: number;
  height?: number;
  detections: BBox[];
  error?: string;
}

export interface AutoLabelProgress {
  done: number;
  total: number;
}

export interface ElectronAPI {
  // Window controls (frameless custom title bar)
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  onWindowMaximize: (cb: (isMax: boolean) => void) => () => void;
  // Project / folder
  openFolderDialog: () => Promise<string | null>;
  openSaveDialog: (defaultName?: string) => Promise<string | null>;
  loadProject: (folder: string) => Promise<ProjectMeta | null>;
  saveProject: (project: ProjectMeta) => Promise<{ ok: boolean; error?: string }>;
  listRecentProjects: () => Promise<RecentProject[]>;
  clearRecentProjects: () => Promise<void>;
  removeRecentProject: (imageDir: string) => Promise<void>;

  // Images
  listImages: (folder: string) => Promise<ImageEntry[]>;
  listImagePaths: (folder: string) => Promise<string[]>;
  loadImageMetadata: (imagePaths: string[]) => Promise<ImageEntry[]>;
  readImageAsDataUrl: (path: string) => Promise<string>;

  // Annotations
  /** Detect a dataset's ordered class names from classes.txt / data.yaml / *.names. */
  detectClasses: (folder: string) => Promise<string[]>;
  pickClassesFile: () => Promise<string[] | null>;
  loadAnnotations: (req: LoadAnnotationsRequest) => Promise<BBox[]>;
  loadAnnotationsBatch: (req: {
    imagePaths: string[];
    classes: string[];
    format: AnnotationFormat;
    outputDir: string;
  }) => Promise<Record<string, BBox[]>>;
  saveAnnotations: (req: SaveAnnotationsRequest) => Promise<SaveAnnotationsResult>;

  // Dataset
  splitDataset: (cfg: SplitConfig) => Promise<SplitResult>;
  exportDataset: (cfg: ExportConfig) => Promise<ExportResult>;

  // Auto-label (YOLO inference) — implemented via Python subprocess
  autoLabel: (req: AutoLabelRequest) => Promise<AutoLabelResult[]>;
  cancelAutoLabel: () => Promise<void>;
  /** Subscribe to per-image auto-label progress. Returns an unsubscribe fn. */
  onAutoLabelProgress: (cb: (p: AutoLabelProgress) => void) => () => void;
  findYoloModel: () => Promise<string | null>;

  // App lifecycle
  /** Fired when the window is about to close; call closeReady() when flushed. */
  onBeforeClose: (cb: () => void) => () => void;
  closeReady: () => void;

  // System
  getSystemInfo: () => Promise<SystemInfo>;
  openInExplorer: (target: string) => Promise<void>;

  // Licensing
  getLicenseStatus: () => Promise<LicenseStatus>;
  refreshLicense: () => Promise<LicenseStatus>;
  activateLicense: (key: string) => Promise<ActivateResult>;
  clearLicense: () => Promise<LicenseStatus>;
  openPurchasePage: () => Promise<void>;
  /** Subscribe to background license changes (e.g. server flipped enforcement on). */
  onLicenseChanged: (cb: (status: LicenseStatus) => void) => () => void;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  cpu: { model: string; physicalCores: number; threads: number; speedGHz: number };
  ram: { totalGB: number; freeGB: number; usedPct: number };
  gpu: { name: string; vramTotalMB: number; vramUsedMB: number; driver: string; utilizationPct: number } | null;
  disk: { totalGB: number; freeGB: number; usedPct: number } | null;
  cudaAvailable: boolean;
  versions: { node: string; electron: string; chrome: string; v8: string; python: string | null; ultralytics: string | null };
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
