import { contextBridge, ipcRenderer } from "electron";
import type {
  ElectronAPI,
  ProjectMeta,
  ReviewProgress,
  SaveAnnotationsRequest,
  LoadAnnotationsRequest,
  SplitConfig,
  ExportConfig,
  AutoLabelRequest,
} from "./ipc-types.ts";

// Run as soon as preload script is evaluated. Visible in DevTools and forwarded
// via console-message listener in main.ts to the main-process terminal.
console.log("[preload] loaded — exposing window.api");

const api: ElectronAPI = {
  // Window controls (frameless custom title bar)
  minimizeWindow: () => ipcRenderer.invoke("win:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("win:toggleMaximize"),
  closeWindow: () => ipcRenderer.invoke("win:close"),
  isWindowMaximized: () => ipcRenderer.invoke("win:isMaximized"),
  onWindowMaximize: (cb) => {
    const handler = (_e: unknown, isMax: boolean) => cb(isMax);
    ipcRenderer.on("win:maximized", handler);
    return () => ipcRenderer.removeListener("win:maximized", handler);
  },

  openFolderDialog: () => ipcRenderer.invoke("dialog:openFolder"),
  openSaveDialog: (defaultName) => ipcRenderer.invoke("dialog:openSave", defaultName),
  loadProject: (folder) => ipcRenderer.invoke("project:load", folder),
  saveProject: (project: ProjectMeta) => ipcRenderer.invoke("project:save", project),
  loadProgress: (folder: string) => ipcRenderer.invoke("progress:load", folder),
  saveProgress: (folder: string, progress: ReviewProgress) => ipcRenderer.invoke("progress:save", folder, progress),
  listRecentProjects: () => ipcRenderer.invoke("project:listRecent"),
  clearRecentProjects: () => ipcRenderer.invoke("project:clearRecent"),
  removeRecentProject: (imageDir: string) => ipcRenderer.invoke("project:removeRecent", imageDir),
  listImages: (folder) => ipcRenderer.invoke("images:list", folder),
  listImagePaths: (folder) => ipcRenderer.invoke("images:listPaths", folder),
  loadImageMetadata: (imagePaths) => ipcRenderer.invoke("images:metadata", imagePaths),
  readImageAsDataUrl: (path) => ipcRenderer.invoke("images:dataUrl", path),
  loadAnnotations: (req: LoadAnnotationsRequest) => ipcRenderer.invoke("ann:load", req),
  detectClasses: (folder: string) => ipcRenderer.invoke("dataset:detectClasses", folder),
  pickClassesFile: () => ipcRenderer.invoke("dataset:pickClassesFile"),
  loadAnnotationsBatch: (req) => ipcRenderer.invoke("ann:loadBatch", req),
  saveAnnotations: (req: SaveAnnotationsRequest) => ipcRenderer.invoke("ann:save", req),
  splitDataset: (cfg: SplitConfig) => ipcRenderer.invoke("dataset:split", cfg),
  exportDataset: (cfg: ExportConfig) => ipcRenderer.invoke("dataset:export", cfg),
  autoLabel: (req: AutoLabelRequest) => ipcRenderer.invoke("auto:label", req),
  cancelAutoLabel: () => ipcRenderer.invoke("auto:cancel"),
  onAutoLabelProgress: (cb) => {
    const handler = (_e: unknown, p: Parameters<typeof cb>[0]) => cb(p);
    ipcRenderer.on("auto:progress", handler);
    return () => ipcRenderer.removeListener("auto:progress", handler);
  },
  findYoloModel: () => ipcRenderer.invoke("auto:findModel"),

  // App lifecycle — close flush handshake (see main.ts "close" handler)
  onBeforeClose: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("app:before-close", handler);
    return () => ipcRenderer.removeListener("app:before-close", handler);
  },
  closeReady: () => ipcRenderer.send("app:close-ready"),
  getSystemInfo: () => ipcRenderer.invoke("system:info"),
  openInExplorer: (target: string) => ipcRenderer.invoke("system:reveal", target),

  // Licensing
  getLicenseStatus: () => ipcRenderer.invoke("license:status"),
  refreshLicense: () => ipcRenderer.invoke("license:refresh"),
  activateLicense: (key: string) => ipcRenderer.invoke("license:activate", key),
  clearLicense: () => ipcRenderer.invoke("license:clear"),
  openPurchasePage: () => ipcRenderer.invoke("license:openPurchase"),
  onLicenseChanged: (cb) => {
    const handler = (_e: unknown, status: Parameters<typeof cb>[0]) => cb(status);
    ipcRenderer.on("license:changed", handler);
    return () => ipcRenderer.removeListener("license:changed", handler);
  },
};

try {
  contextBridge.exposeInMainWorld("api", api);
  contextBridge.exposeInMainWorld("__preloadReady", { at: Date.now() });
  console.log("[preload] window.api ready");
} catch (err) {
  console.error("[preload] failed to expose api:", err);
}
