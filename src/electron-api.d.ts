// Mirrors electron/ipc-types.ts for the renderer side.
// Keeping these duplicated avoids cross-tsconfig imports.

export type AnnotationFormat = "YOLO" | "YOLO OBB" | "Pascal VOC" | "COCO" | "CSV";

export interface LicenseStatus {
  locked: boolean;
  enforce: boolean;
  mode: "free" | "licensed" | "locked";
  machineId: string;
  message?: string;
  license: { plan: string; name?: string; expiresAt: number | null } | null;
  policyCheckedAt: number | null;
  lastError?: string;
}

export interface ActivateResult {
  ok: boolean;
  error?: string;
  status: LicenseStatus;
}

export interface BBox {
  cls: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Rotation about the centre in radians; x1..y2 stay the UPRIGHT rect. */
  r?: number;
  conf?: number;
}

export interface SaveAnnotationsResult {
  ok: boolean;
  /**
   * Class names the target format could not represent, so their boxes were NOT
   * written. Only YOLO produces these — it stores a class INDEX, so a name
   * outside the project's ordered class list has nowhere to go.
   */
  dropped: string[];
}

export interface ImageEntry {
  path: string;
  name: string;
  width: number;
  height: number;
  size: number;
  mtime: number;
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
  /** When `labeled` was last counted over the whole folder (the main process just stores it). */
  labeledAt?: number;
}

export interface RecentProject extends ProjectMeta {
  previewPaths?: string[];
}

/** Which images of a folder the user has gone past, and the one they were on last. */
export interface ReviewProgress {
  reviewed: string[];   // file names
  last: string | null;  // file name
}

export interface ElectronAPI {
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  onWindowMaximize: (cb: (isMax: boolean) => void) => () => void;
  openFolderDialog: () => Promise<string | null>;
  openSaveDialog: (defaultName?: string) => Promise<string | null>;
  loadProject: (folder: string) => Promise<ProjectMeta | null>;
  saveProject: (project: ProjectMeta) => Promise<{ ok: boolean; error?: string }>;
  loadProgress: (folder: string) => Promise<ReviewProgress>;
  saveProgress: (folder: string, progress: ReviewProgress) => Promise<{ ok: boolean; error?: string }>;
  listRecentProjects: () => Promise<RecentProject[]>;
  clearRecentProjects: () => Promise<void>;
  removeRecentProject: (imageDir: string) => Promise<void>;
  listImages: (folder: string) => Promise<ImageEntry[]>;
  listImagePaths: (folder: string) => Promise<string[]>;
  loadImageMetadata: (imagePaths: string[]) => Promise<ImageEntry[]>;
  readImageAsDataUrl: (path: string) => Promise<string>;
  detectClasses: (folder: string) => Promise<string[]>;
  pickClassesFile: () => Promise<string[] | null>;
  loadAnnotations: (req: {
    imagePath: string; classes: string[];
    format: AnnotationFormat; outputDir: string;
  }) => Promise<BBox[]>;
  loadAnnotationsBatch: (req: {
    imagePaths: string[];
    classes: string[];
    format: AnnotationFormat;
    outputDir: string;
  }) => Promise<Record<string, BBox[]>>;
  saveAnnotations: (req: {
    imagePath: string; annotations: BBox[];
    classes: string[]; format: AnnotationFormat; outputDir: string;
    companion?: { format: AnnotationFormat; dirSuffix: string };
  }) => Promise<SaveAnnotationsResult>;
  splitDataset: (cfg: {
    imagePaths: string[]; classes: string[];
    sourceFormat: AnnotationFormat; sourceOutputDir: string;
    outRoot: string; trainRatio: number; valRatio: number; testRatio: number;
    copyImages: boolean; seed: number;
    writeYaml?: boolean; writeTrainPy?: boolean;
  }) => Promise<{ train: number; val: number; test: number; labeled: number; yamlPath: string; trainPyPath?: string; outRoot: string }>;
  exportDataset: (cfg: {
    imagePaths: string[]; classes: string[];
    sourceFormat: AnnotationFormat; sourceOutputDir: string;
    outRoot: string; format: AnnotationFormat;
    copyImages: boolean; labeledOnly?: boolean; writeYaml?: boolean; zip?: boolean;
  }) => Promise<{ count: number; labeled: number; outRoot: string; yamlPath?: string }>;
  autoLabel: (req: {
    imagePaths: string[]; modelPath: string;
    conf: number; iou: number; device?: "cpu" | "cuda";
    allowedClasses?: string[];
  }) => Promise<Array<{ imagePath: string; width?: number; height?: number; detections: BBox[]; error?: string }>>;
  cancelAutoLabel: () => Promise<void>;
  onAutoLabelProgress: (cb: (p: { done: number; total: number }) => void) => () => void;
  findYoloModel: () => Promise<string | null>;

  // App lifecycle — close flush handshake
  onBeforeClose: (cb: () => void) => () => void;
  closeReady: () => void;
  getSystemInfo: () => Promise<SystemInfo>;
  openInExplorer: (target: string) => Promise<void>;

  // Licensing
  getLicenseStatus: () => Promise<LicenseStatus>;
  refreshLicense: () => Promise<LicenseStatus>;
  activateLicense: (key: string) => Promise<ActivateResult>;
  clearLicense: () => Promise<LicenseStatus>;
  openPurchasePage: () => Promise<void>;
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
    api?: ElectronAPI;
  }
}
