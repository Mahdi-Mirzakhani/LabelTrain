import { app, BrowserWindow, dialog, ipcMain, protocol, net, shell } from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

import * as ann from "./annotation-io.ts";
import { splitDataset, exportDataset } from "./dataset-split.ts";
import { loadProgress, saveProgress } from "./progress.ts";
import { collectSystemInfo } from "./system-info.ts";
import { LicenseManager } from "./license/manager.ts";
import { LICENSE_CONFIG } from "./license/config.ts";
import type {
  AnnotationFormat,
  AutoLabelRequest,
  AutoLabelResult,
  ImageEntry,
  ProjectMeta,
  RecentProject,
  ReviewProgress,
  SaveAnnotationsRequest,
  LoadAnnotationsRequest,
  SplitConfig,
  ExportConfig,
} from "./ipc-types.ts";

const execFileP = promisify(execFile);

const isDev = !app.isPackaged;

// Many VPNs route ALL traffic — including loopback — through their proxy. That
// stops Electron from reaching the Vite dev server on http://localhost:5173 and
// the window comes up black/blank. Telling Chromium to bypass the proxy for
// loopback fixes the black screen while leaving real traffic on the VPN.
// (Must run before app is ready — it does, this is module top-level.)
app.commandLine.appendSwitch("proxy-bypass-list", "localhost;127.0.0.1;[::1];<local>");

// Opt-in DevTools Protocol endpoint, used by the tests/cdp-*.mjs drivers to
// exercise the real window. Off unless the env var is set, so a shipped app
// never opens a debugging port.
if (process.env.LS_DEBUG_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.LS_DEBUG_PORT);
}

// The `app://` scheme (see registerAppProtocol) must be declared privileged
// BEFORE the app is ready. Without `supportFetchAPI` the renderer can put an
// app:// URL in an <img src> but cannot fetch() it — which is exactly what the
// thumbnail pipeline needs in order to decode a downscaled copy instead of the
// full-resolution original. `standard` keeps the URL parsing this scheme's
// handler already assumes (host + absolute path).
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

// Rollup transforms `import.meta.url` correctly for both ESM and CJS output,
// so this works regardless of which format vite-plugin-electron emits.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_FILE = ".labeler_project.json";
const RECENT_FILE = "recent-projects.json";
// NOTE: no TIFF here on purpose. Chromium cannot decode TIFF in <img>, so a
// listed .tif/.tiff would render as a blank canvas the user can't label.
const SUPPORTED_EXTS = [".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp"];

let mainWindow: BrowserWindow | null = null;
let license: LicenseManager | null = null;
// Close handshake: the renderer gets one chance to flush unsaved annotation
// edits (app:before-close → app:close-ready) before the window really closes.
let closeReady = false;
let closePending = false;

function recentProjectsPath(): string {
  return path.join(app.getPath("userData"), RECENT_FILE);
}

async function listImageFiles(folder: string, sort = true): Promise<Array<{ path: string; name: string }>> {
  try {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const images = entries
      .filter(e => e.isFile() && SUPPORTED_EXTS.includes(path.extname(e.name).toLowerCase()))
      .map(e => ({ path: path.join(folder, e.name), name: e.name }));
    return sort ? images.sort((a, b) => a.name.localeCompare(b.name)) : images;
  } catch {
    return [];
  }
}

async function loadImageMetadata(imagePaths: string[]): Promise<ImageEntry[]> {
  const CONCURRENCY = 64;
  const out: ImageEntry[] = [];
  for (let i = 0; i < imagePaths.length; i += CONCURRENCY) {
    const batch = imagePaths.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (imagePath) => {
      try {
        const [st, dims] = await Promise.all([fs.stat(imagePath), ann.readImageDims(imagePath)]);
        return {
          path: imagePath,
          name: path.basename(imagePath),
          width: dims.width,
          height: dims.height,
          size: st.size,
          mtime: st.mtimeMs,
        } satisfies ImageEntry;
      } catch {
        return null;
      }
    }));
    for (const result of results) if (result) out.push(result);
  }
  return out;
}

// Vite outputs the preload script per vite.config.ts rollup options.
// We try every common extension so a misconfigured build still loads.
function resolvePreload(): string {
  const candidates = ["preload.cjs", "preload.mjs", "preload.js"];
  for (const name of candidates) {
    const p = path.join(__dirname, name);
    if (existsSync(p)) return p;
  }
  // No preload found — Electron will throw a clear error.
  return path.join(__dirname, "preload.cjs");
}

async function createWindow() {
  const preloadPath = resolvePreload();
  console.log("[main] __dirname =", __dirname);
  console.log("[main] preload   =", preloadPath, existsSync(preloadPath) ? "(exists)" : "(MISSING)");
  console.log("[main] isDev     =", isDev);
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0A0A0F",
    show: false,
    autoHideMenuBar: true,
    // Frameless: the app draws its own title bar (the traffic-light controls in
    // App.tsx). Without this the native OS title bar sits on top of the custom
    // one — the doubled bar the user saw. The custom buttons are wired to the
    // win:* IPC handlers below so minimize/maximize/close still work.
    frame: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  // Ask the renderer to flush unsaved label edits before the window closes
  // (covers the custom close button, Alt+F4, and OS shutdown). Without this,
  // boxes drawn in the last ~800ms — or on images navigated away from before
  // the debounced auto-save fired — were silently lost.
  closeReady = false;
  mainWindow.on("close", (e) => {
    if (closeReady) return;
    e.preventDefault();
    if (closePending) return; // already flushing — don't stack timers
    closePending = true;
    mainWindow?.webContents.send("app:before-close");
    // Failsafe: never let a hung renderer keep the window alive. The renderer
    // calls closeReady() the moment it is done, so this only ever costs time
    // when something is genuinely stuck — which is why it is generous rather
    // than the old 1.5s, that was not enough to flush a large dirty set to a
    // slow disk or a network share and quietly dropped those edits.
    setTimeout(() => {
      if (!closeReady) {
        console.warn("[main] renderer did not finish flushing in time — closing anyway");
        closeReady = true;
        mainWindow?.close();
      }
    }, 15000);
  });

  // Keep the custom maximize button (green dot) in sync with the real state,
  // e.g. after an edge-drag resize or a snap.
  mainWindow.on("maximize", () => mainWindow?.webContents.send("win:maximized", true));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send("win:maximized", false));

  // Forward renderer console messages to the main-process terminal so the
  // user sees preload errors even when DevTools is closed.
  mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    const tag = ["DEBUG", "INFO", "WARN", "ERROR"][level] ?? "LOG";
    console.log(`[renderer ${tag}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on("preload-error", (_e, preloadPath, err) => {
    console.error(`[main] preload crashed: ${preloadPath}\n`, err);
  });
  // A black/blank window almost always means the renderer never loaded. Surface
  // why (e.g. a VPN/proxy blocking localhost) instead of failing silently, and
  // make sure the window becomes visible so the error is at least seen.
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[main] did-fail-load (${code} ${desc}) while loading ${url}`);
    console.error("[main] If a VPN is on, route localhost outside the VPN (split tunnel) or disable the proxy for loopback.");
    if (!mainWindow?.isVisible()) mainWindow?.show();
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    // Force IPv4 loopback: "localhost" can resolve to ::1 (IPv6) while Vite
    // listens on 127.0.0.1, giving ERR_CONNECTION_REFUSED and a black window.
    const devUrl = process.env.VITE_DEV_SERVER_URL.replace("localhost", "127.0.0.1");
    try {
      await mainWindow.loadURL(devUrl);
    } catch (err) {
      console.error(`[main] could not load dev server ${devUrl}:`, err);
      console.error("[main] Is `npm run dev` running, and is localhost reachable (VPN/proxy)?");
    }
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // main.js lives at build/main/, renderer at build/renderer/
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

// Register a custom `app://` protocol so the renderer can <img src="app:///abs/path.jpg" />
// without breaking electron's CSP restrictions on file:// from a packaged app.
function registerAppProtocol() {
  protocol.handle("app", async (req) => {
    try {
      const url = new URL(req.url);
      // app://host/path  → reconstruct absolute path
      // We use app:///C:/foo/bar.jpg  → pathname is "/C:/foo/bar.jpg"
      let p = decodeURIComponent(url.pathname);
      if (process.platform === "win32" && p.startsWith("/") && /^\/[A-Za-z]:/.test(p)) {
        p = p.slice(1);
      }
      const fileUrl = pathToFileURL(p).toString();
      return net.fetch(fileUrl);
    } catch (err) {
      return new Response("Not Found", { status: 404 });
    }
  });
}

app.whenReady().then(async () => {
  registerAppProtocol();

  // Bring up the license manager BEFORE the window so the first render
  // already knows whether the app is free or locked (no flash).
  license = new LicenseManager({ dataDir: app.getPath("userData") });
  await license.init();

  registerHandlers();
  await createWindow();

  // Phone home once the window exists, then on a slow background timer.
  // A machine only ever locks AFTER it reaches the server and learns
  // enforcement was switched on — exactly the "locks when it gets
  // internet" behaviour. When the lock state flips, tell the renderer.
  void license.refresh().then((status) => {
    mainWindow?.webContents.send("license:changed", status);
  });
  license.startPolling((status) => {
    mainWindow?.webContents.send("license:changed", status);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ============================================================
//  IPC handlers
// ============================================================

function registerHandlers() {
  // Window controls for the frameless custom title bar.
  ipcMain.handle("win:minimize", () => { mainWindow?.minimize(); });
  ipcMain.handle("win:toggleMaximize", (): boolean => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) { mainWindow.unmaximize(); return false; }
    mainWindow.maximize();
    return true;
  });
  ipcMain.handle("win:close", () => { mainWindow?.close(); });
  ipcMain.handle("win:isMaximized", (): boolean => mainWindow?.isMaximized() ?? false);

  // Renderer finished flushing unsaved edits — let the pending close proceed.
  ipcMain.on("app:close-ready", () => {
    if (closeReady) return;
    closeReady = true;
    mainWindow?.close();
  });

  ipcMain.handle("dialog:openFolder", async (): Promise<string | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("dialog:openSave", async (_e, defaultName: string | undefined): Promise<string | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      properties: ["createDirectory"],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle("project:load", async (_e, folder: string): Promise<ProjectMeta | null> => {
    try {
      const p = path.join(folder, PROJECT_FILE);
      const txt = await fs.readFile(p, "utf-8");
      const obj = JSON.parse(txt);
      return obj as ProjectMeta;
    } catch {
      return null;
    }
  });

  // Returns { ok:false } when the project file can't be written (read-only
  // folder, network share without write access) so the renderer can WARN the
  // user — otherwise classes/format were silently forgotten on reopen.
  ipcMain.handle("project:save", async (_e, project: ProjectMeta): Promise<{ ok: boolean; error?: string }> => {
    const p = path.join(project.imageDir, PROJECT_FILE);
    let result: { ok: boolean; error?: string } = { ok: true };
    try {
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, JSON.stringify(project, null, 2), "utf-8");
    } catch (err) {
      console.warn(`[main] Could not write ${PROJECT_FILE}:`, err);
      result = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    await addRecent(project);
    return result;
  });

  ipcMain.handle("progress:load", async (_e, folder: string): Promise<ReviewProgress> => loadProgress(folder));
  ipcMain.handle("progress:save", async (_e, folder: string, progress: ReviewProgress) => saveProgress(folder, progress));

  ipcMain.handle("project:listRecent", async (): Promise<RecentProject[]> => {
    const recent = await loadRecent();
    return await Promise.all(recent.map(async project => {
      const images = await listImageFiles(project.imageDir, false);
      return {
        ...project,
        count: images.length,
        previewPaths: images.slice(0, 4).map(image => image.path),
      };
    }));
  });

  ipcMain.handle("project:clearRecent", async (): Promise<void> => {
    await saveRecent([]);
  });

  ipcMain.handle("project:removeRecent", async (_e, imageDir: string): Promise<void> => {
    const list = await loadRecent();
    const filtered = list.filter(p => path.resolve(p.imageDir) !== path.resolve(imageDir));
    await saveRecent(filtered);
  });

  ipcMain.handle("images:list", async (_e, folder: string): Promise<ImageEntry[]> => {
    const imageFiles = await listImageFiles(folder);
    return imageFiles.map(file => ({
      ...file,
      width: 0,
      height: 0,
      size: 0,
      mtime: 0,
    }));
  });

  ipcMain.handle("images:listPaths", async (_e, folder: string): Promise<string[]> => {
    const imageFiles = await listImageFiles(folder);
    return imageFiles.map(file => file.path);
  });

  ipcMain.handle("images:metadata", async (_e, imagePaths: string[]): Promise<ImageEntry[]> => {
    return await loadImageMetadata(imagePaths);
  });

  // To the Recycle Bin, never a hard delete: a wrong click can be put back.
  ipcMain.handle("images:delete", async (_e, req: { imagePath: string; outputDir: string; format: AnnotationFormat }) =>
    ann.deleteImageAndLabels(req.imagePath, req.outputDir, req.format, (p) => shell.trashItem(p)));

  ipcMain.handle("images:dataUrl", async (_e, p: string): Promise<string> => {
    const buf = await fs.readFile(p);
    const ext = path.extname(p).toLowerCase().slice(1) || "png";
    const mime = ext === "jpg" ? "jpeg" : ext;
    return `data:image/${mime};base64,${buf.toString("base64")}`;
  });

  ipcMain.handle("ann:load", async (_e, req: LoadAnnotationsRequest) => {
    return await ann.loadAnnotations(req);
  });

  // Detect a dataset's own ordered class list (classes.txt / data.yaml / *.names)
  // so imported YOLO/COCO label indices resolve to the correct names.
  ipcMain.handle("dataset:detectClasses", async (_e, folder: string): Promise<string[]> => {
    try { return await ann.detectDatasetClasses(folder); } catch { return []; }
  });

  // Let the user point at a class-names file themselves and read the ordered
  // names out of it (for datasets where auto-detection found nothing).
  ipcMain.handle("dataset:pickClassesFile", async (): Promise<string[] | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select a class-names file",
      properties: ["openFile"],
      filters: [
        { name: "Class lists", extensions: ["txt", "yaml", "yml", "names", "json"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    try { return await ann.readClassesFromFile(result.filePaths[0]); }
    catch { return []; }
  });

  // Batch annotation loader — used at project open. Loads in parallel and
  // returns a Record<imagePath, BBox[]>. Much faster than 1000 sequential
  // round-trips (especially since the renderer would otherwise pay an IPC
  // overhead per call).
  ipcMain.handle("ann:loadBatch", async (_e, req: {
    imagePaths: string[];
    classes: string[];
    format: import("./ipc-types.ts").AnnotationFormat;
    outputDir: string;
  }): Promise<Record<string, import("./ipc-types.ts").BBox[]>> => {
    const out: Record<string, import("./ipc-types.ts").BBox[]> = {};
    const CONCURRENCY = 32;
    for (let i = 0; i < req.imagePaths.length; i += CONCURRENCY) {
      const batch = req.imagePaths.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async (p) => {
        try {
          const boxes = await ann.loadAnnotations({
            imagePath: p, classes: req.classes,
            format: req.format, outputDir: req.outputDir,
          });
          return [p, boxes] as const;
        } catch {
          return [p, [] as import("./ipc-types.ts").BBox[]] as const;
        }
      }));
      for (const [p, b] of results) out[p] = b;
    }
    return out;
  });

  ipcMain.handle("ann:save", async (_e, req: SaveAnnotationsRequest) => {
    return await ann.saveAnnotations(req);
  });

  ipcMain.handle("dataset:split", async (_e, cfg: SplitConfig) => {
    return await splitDataset(cfg);
  });
  ipcMain.handle("dataset:export", async (_e, cfg: ExportConfig) => {
    return await exportDataset(cfg);
  });

  ipcMain.handle("auto:findModel", async (): Promise<string | null> => {
    return await findYoloModel();
  });

  ipcMain.handle("auto:label", async (e, req: AutoLabelRequest): Promise<AutoLabelResult[]> => {
    return await runYoloInference(req, e.sender);
  });

  ipcMain.handle("auto:cancel", async (): Promise<void> => {
    autoLabelCancelled = true;
    try { autoLabelProc?.kill(); } catch { /* already gone */ }
  });

  ipcMain.handle("system:info", async () => collectSystemInfo());

  ipcMain.handle("system:reveal", async (_e, target: string) => {
    if (!target) return;
    try {
      const stat = await fs.stat(target);
      if (stat.isDirectory()) await shell.openPath(target);
      else shell.showItemInFolder(target);
    } catch {
      // fall back to opening parent dir
      try { await shell.openPath(path.dirname(target)); } catch { /* ignore */ }
    }
  });

  // -------- Licensing --------
  ipcMain.handle("license:status", async () => license?.getStatus());
  ipcMain.handle("license:refresh", async () => license?.refresh());
  ipcMain.handle("license:activate", async (_e, key: string) => license?.activate(key));
  ipcMain.handle("license:clear", async () => license?.clearLicense());
  ipcMain.handle("license:openPurchase", async () => {
    try { await shell.openExternal(LICENSE_CONFIG.purchaseUrl); } catch { /* ignore */ }
  });
}

// ============================================================
//  Recent projects (stored in userData)
// ============================================================

async function loadRecent(): Promise<RecentProject[]> {
  try {
    const txt = await fs.readFile(recentProjectsPath(), "utf-8");
    const arr = JSON.parse(txt);
    if (!Array.isArray(arr)) return [];
    return arr.filter((p) => typeof p?.imageDir === "string");
  } catch {
    return [];
  }
}

async function saveRecent(list: RecentProject[]): Promise<void> {
  const p = recentProjectsPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(list, null, 2), "utf-8");
}

async function addRecent(project: ProjectMeta): Promise<void> {
  const list = await loadRecent();
  const filtered = list.filter(
    (p) => path.resolve(p.imageDir) !== path.resolve(project.imageDir),
  );
  filtered.unshift({ ...project, lastOpenedAt: Date.now() });
  await saveRecent(filtered.slice(0, 20));
}

// ============================================================
//  YOLO inference (Python child process)
// ============================================================

const MODEL_DIR_CANDIDATES = ["yolov8n.pt", "yolo11n.pt", "yolov8s.pt", "yolo11s.pt"];

async function findYoloModel(): Promise<string | null> {
  const dirs = [
    path.join(app.getPath("userData"), "models"),
    path.join(process.cwd(), "models"),
    path.join(path.dirname(app.getPath("exe")), "models"),
    // electron-builder extraResources lands here in production builds
    path.join(process.resourcesPath || "", "models"),
  ];
  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir);
      // Prefer well-known filenames first
      for (const name of MODEL_DIR_CANDIDATES) {
        if (entries.includes(name)) return path.join(dir, name);
      }
      // otherwise any .pt
      const pt = entries.find((n) => n.toLowerCase().endsWith(".pt"));
      if (pt) return path.join(dir, pt);
    } catch {
      /* ignore */
    }
  }
  return null;
}

// The child currently running inference, so "auto:cancel" can kill it.
let autoLabelProc: ReturnType<typeof spawn> | null = null;
let autoLabelCancelled = false;
let autoLabelRunning = false;

interface RetryableError extends Error { retryable?: boolean; }

async function runYoloInference(
  req: AutoLabelRequest,
  sender?: Electron.WebContents,
): Promise<AutoLabelResult[]> {
  // One run at a time. Two overlapping runs would both write `autoLabelProc`,
  // so Cancel would kill only the newer child and leave the older one burning
  // CPU with nothing listening for its output.
  if (autoLabelRunning) {
    throw new Error("An auto-label run is already in progress. Cancel it first.");
  }
  autoLabelRunning = true;
  try {
    return await runYoloInferenceInner(req, sender);
  } finally {
    autoLabelRunning = false;
  }
}

async function runYoloInferenceInner(
  req: AutoLabelRequest,
  sender?: Electron.WebContents,
): Promise<AutoLabelResult[]> {
  // We shell out to a small Python script bundled at scripts/yolo_infer.py.
  // The script must be on the user's machine. If Python or ultralytics aren't
  // installed, this returns an empty result with an error injected per image.
  const scriptCandidates = [
    path.join(process.cwd(), "scripts", "yolo_infer.py"),
    path.join(path.dirname(app.getPath("exe")), "scripts", "yolo_infer.py"),
    path.join(process.resourcesPath || "", "scripts", "yolo_infer.py"),
  ];
  let script: string | null = null;
  for (const s of scriptCandidates) {
    try {
      await fs.access(s);
      script = s;
      break;
    } catch {
      /* ignore */
    }
  }
  if (!script) {
    throw new Error(
      `Inference script not found. Expected at scripts/yolo_infer.py beside the app.`,
    );
  }

  const payload = JSON.stringify({
    model: req.modelPath,
    images: req.imagePaths,
    conf: req.conf,
    iou: req.iou,
    device: req.device ?? "cpu",
    allowed: req.allowedClasses ?? null,
  });

  // On Windows, a bare `python` can be the Microsoft Store stub that prints an
  // ad and exits — try the real launcher (`py`) next before giving up.
  const candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  autoLabelCancelled = false;
  let lastErr: Error | null = null;
  for (const cmd of candidates) {
    try {
      return await runPythonInference(cmd, script, payload, sender);
    } catch (err) {
      if ((err as RetryableError).retryable) { lastErr = err as Error; continue; }
      throw err;
    }
  }
  throw new Error(
    "Python was not found on this system.\n" +
    "Auto-label needs Python plus the ultralytics package:\n" +
    "  1. Install Python from python.org (tick “Add python.exe to PATH”)\n" +
    "  2. Run: pip install ultralytics torch\n" +
    (lastErr ? `\nDetails: ${lastErr.message}` : ""),
  );
}

function runPythonInference(
  pythonCmd: string,
  script: string,
  payload: string,
  sender?: Electron.WebContents,
): Promise<AutoLabelResult[]> {
  // NOTE: child_process.execFile does NOT accept an `input` option — it would
  // be silently ignored, leaving the Python script reading from an empty stdin
  // and writing back `[]`. Use spawn + manual stdin write instead.
  return new Promise<AutoLabelResult[]>((resolve, reject) => {
    const fail = (message: string, retryable = false) => {
      const err: RetryableError = new Error(message);
      err.retryable = retryable;
      reject(err);
    };
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(pythonCmd, [script], {
        stdio: ["pipe", "pipe", "pipe"],
        // Python < 3.15 on Windows decodes piped stdio with the locale code
        // page, which destroys Persian/Arabic/CJK paths. Force UTF-8 so the
        // JSON round-trip is byte-exact regardless of system locale.
        env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      });
    } catch (err) {
      fail(`Failed to start ${pythonCmd}: ${err}`, true);
      return;
    }
    autoLabelProc = proc;
    let stdout = "";
    let stderr = "";
    let stderrLineBuf = "";
    proc.stdout!.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf-8"); });
    // stderr carries both diagnostics and `@@progress d t` lines from the
    // script — split the progress lines out and forward them to the renderer.
    proc.stderr!.on("data", (chunk: Buffer) => {
      stderrLineBuf += chunk.toString("utf-8");
      let nl: number;
      while ((nl = stderrLineBuf.indexOf("\n")) >= 0) {
        const line = stderrLineBuf.slice(0, nl).replace(/\r$/, "");
        stderrLineBuf = stderrLineBuf.slice(nl + 1);
        const m = line.match(/^@@progress (\d+) (\d+)$/);
        if (m) {
          if (!sender?.isDestroyed()) sender?.send("auto:progress", { done: +m[1], total: +m[2] });
        } else {
          stderr += line + "\n";
        }
      }
    });
    // The Store stub dies before reading stdin — swallow the resulting EPIPE
    // so it surfaces as a clean exit-code failure instead of an uncaught error.
    proc.stdin!.on("error", () => { /* ignore */ });
    proc.on("error", (err: NodeJS.ErrnoException) => {
      autoLabelProc = null;
      fail(`Python launch failed: ${err.message}. Is Python installed and on PATH?`, err.code === "ENOENT");
    });
    proc.on("close", (code) => {
      autoLabelProc = null;
      stderr += stderrLineBuf;
      if (autoLabelCancelled) {
        fail("Auto-label cancelled");
        return;
      }
      if (code !== 0) {
        // Windows Store python stub: exits 9009 with an "install from the
        // Microsoft Store" message. Not a real interpreter — try the next one.
        const isStub = code === 9009 || /Microsoft Store/i.test(stderr);
        fail(`Python exited with code ${code}.\n${stderr.trim() || "(no stderr)"}`, isStub);
        return;
      }
      try {
        resolve(JSON.parse(stdout) as AutoLabelResult[]);
      } catch {
        fail(`Could not parse Python output as JSON.\nstdout: ${stdout.slice(0, 500)}\nstderr: ${stderr.slice(0, 500)}`);
      }
    });
    proc.stdin!.write(payload);
    proc.stdin!.end();
  });
}
