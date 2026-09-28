import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./components/Icon";
import { Tip } from "./components/ui";
import {
  CommandPalette, AutoLabelModal, SplitModal, ClassManagerDrawer,
  SettingsDrawer, BoxContextMenu, ToastHost, SystemDrawer, ObbWarningModal,
} from "./components/Modals";
import { Onboarding, ProjectManager } from "./components/Onboarding";
import { LicenseGate, useLicense } from "./components/LicenseGate";
import { CanvasStage } from "./components/Canvas";
import { FileList, ToolRail, ChipBar, AnnotateInspector } from "./components/Annotate";
import { DatasetRoute, TrainRoute, DeployRoute } from "./components/Tabs";
import { DuplicatesRoute } from "./components/Duplicates";
import { applyLang, t } from "./i18n";
import { DEFAULT_CLASSES, PALETTE } from "./data";
import {
  imageModifiedTime, inElectron, listImagesInFolder, saveBoxes, type SavePlan,
} from "./ipc";
import {
  loadSettings, saveSettings,
} from "./settings-store";
import { clearThumbs } from "./lib/thumbs";
import { normalizeAngle, toRad } from "./lib/obb";
import {
  MIN_LOOK_MS, RANKED_FILTERS, matchesFilter, resumeIndex, stepProgress, type ListFilter, type Progress,
} from "./lib/progress";
import { listOrder, stepInOrder } from "./lib/review";
import type { ReviewItem } from "./electron-api";
import { projectTitle } from "./lib/projects";
import type {
  ClassDef, CmdItem, Density, ImageItem, LangCode, NBox, ObbSaveMode,
  ProjectInfo, ThemeMode, Toast, AnnotationFormat,
} from "./types";

type Screen = "onboarding" | "projects" | "app";
type Tab = "annotate" | "dataset" | "train" | "deploy" | "duplicates";

/**
 * How annotations are addressed to disk. `plan.format` is used for BOTH saving
 * and loading, which is why "both" makes YOLO OBB the primary rather than the
 * companion: the format the app reads back has to be the one that can hold an
 * angle, or every reopen would quietly flatten the rotations.
 *
 *   obb off → the project format, exactly as before this feature existed
 *   "obb"   → YOLO OBB only
 *   "hbb"   → the project format only; angles are dropped (hence the warning)
 *   "both"  → YOLO OBB where labels normally live, plus the upright set beside
 *             it in a "…_hbb" folder
 *
 * A plain function rather than a hook so `openFolder` can apply it to a format
 * restored from a project file before that format reaches React state.
 */
function planFor(obb: boolean, obbSave: ObbSaveMode, fmt: AnnotationFormat): SavePlan {
  if (!obb) return { format: fmt };
  if (obbSave === "obb") return { format: "YOLO OBB" };
  if (obbSave === "hbb") return { format: fmt };
  return { format: "YOLO OBB", companion: { format: fmt, dirSuffix: "_hbb" } };
}

export default function App() {
  // Top-level guard: if the preload script did not expose window.api, the app
  // cannot do anything useful. Show a clear diagnostic instead of silently
  // letting every action toast "requires the desktop app".
  if (!inElectron) {
    return <NoElectronError />;
  }

  return <LicensedApp />;
}

// Gate the whole app behind the license check. While enforcement is OFF
// (the default, free mode) this renders AppShell immediately. If the server
// later turns enforcement ON and there is no valid license, it shows the
// activation screen instead.
function LicensedApp() {
  const { status, setStatus } = useLicense();

  // Still resolving the initial status — keep it blank for a frame to avoid
  // flashing the app and then snapping to the lock screen.
  if (!status) return <div className="fullscreen" />;

  if (status.locked) {
    return <LicenseGate status={status} onResolved={setStatus} />;
  }
  return <AppShell />;
}

function NoElectronError() {
  const isBrowser = typeof navigator !== "undefined" && /Chrome|Mozilla/.test(navigator.userAgent) && !(window as any).process?.versions?.electron;
  return (
    <div className="fullscreen" style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "var(--sp-xl)", gap: "var(--sp-md)",
      textAlign: "center",
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: 24, background: "var(--danger-bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon name="alert" size={40} style={{ color: "var(--danger)" }} />
      </div>
      <div className="t-display">window.api is not available</div>
      <div className="t-body tsec" style={{ maxWidth: 520 }}>
        The preload bridge did not load. This usually means one of these:
      </div>
      <div className="card pad col gap-sm" style={{ maxWidth: 600, textAlign: "left" }}>
        <div className="row gap-md">
          <span className="kbd">1</span>
          <span className="t-body">
            You are viewing the Vite dev URL in a browser instead of the Electron window. <b>Don't open <code>http://localhost:5173</code> in Chrome.</b> Wait for the Electron window to open by itself when you run <code>npm run dev</code>.
          </span>
        </div>
        <div className="row gap-md">
          <span className="kbd">2</span>
          <span className="t-body">
            The preload script crashed. Open <b>View → Toggle Developer Tools</b> in the Electron window and check the console for errors.
          </span>
        </div>
        <div className="row gap-md">
          <span className="kbd">3</span>
          <span className="t-body">
            Stale build output. Run <code>npm run clean</code> then <code>npm run dev</code> again.
          </span>
        </div>
      </div>
      {isBrowser && (
        <div className="t-caption" style={{ color: "var(--warning)" }}>
          You appear to be in a regular browser. Close this tab and use the Electron window.
        </div>
      )}
      <button className="btn btn-primary lg" onClick={() => window.location.reload()}>
        <Icon name="refresh" size={16} />Reload
      </button>
    </div>
  );
}

function AppShell() {
  // Hydrate preferences from disk on first render
  const initial = loadSettings();
  // Show the welcome tour only until it has been completed or skipped once —
  // `seenOnboarding` was being written on every render but never read back, so
  // the tour reappeared on every single launch. It can be replayed from the
  // command palette ("Show welcome tour").
  const [screen, setScreen] = useState<Screen>(initial.seenOnboarding ? "projects" : "onboarding");
  // Sticky once true, so replaying the tour from the command palette does not
  // make it come back on the next launch.
  const [seenOnboarding, setSeenOnboarding] = useState(initial.seenOnboarding);
  const [tab, setTab] = useState<Tab>("annotate");

  // appearance / preferences
  const [theme, setTheme] = useState<ThemeMode>(initial.theme);
  const [density, setDensity] = useState<Density>(initial.density);
  const [fmt, setFmt] = useState<AnnotationFormat>(initial.fmt);
  const [device, setDevice] = useState<"cpu" | "gpu">(initial.device);
  const [lang, setLang] = useState<LangCode>(initial.lang);
  const [outputDir, setOutputDir] = useState<string>(initial.outputDir);
  // Oriented-box mode + which label files it writes. Both live in settings so
  // the choice survives a restart and applies to whatever project is opened.
  const [obb, setObb] = useState<boolean>(initial.obb);
  const [obbSave, setObbSave] = useState<ObbSaveMode>(initial.obbSave);

  const savePlan = useMemo<SavePlan>(() => planFor(obb, obbSave, fmt), [obb, obbSave, fmt]);
  // The dictionary must be swapped BEFORE the tree below renders, otherwise the
  // first paint after a language change still shows the old strings. useMemo is
  // the render-phase hook for this — a plain call in the body would re-run on
  // every render, and useEffect would run one paint too late.
  useMemo(() => applyLang(lang), [lang]);

  // Persist whenever any preference changes
  useEffect(() => {
    saveSettings({ theme, density, fmt, device, lang, outputDir, seenOnboarding, obb, obbSave });
  }, [theme, density, fmt, device, lang, outputDir, seenOnboarding, obb, obbSave]);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.documentElement.dataset.density = density; }, [density]);
  useEffect(() => {
    document.documentElement.dataset.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
  }, [lang]);

  // project / images / classes
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [curIdx, setCurIdx] = useState(0);
  const [classes, setClasses] = useState<ClassDef[]>(DEFAULT_CLASSES);
  const [loading, setLoading] = useState(false);

  const cur = images[curIdx];

  // -------- Review progress --------
  // Which images of the open folder the user has gone past, and the one to
  // reopen at (lib/progress.ts); saved beside the images by electron/progress.ts.
  // `lastStop` is where the PREVIOUS session ended and stays put during this
  // one, so the list can show how far the review had got.
  const [progress, setProgress] = useState<Progress | null>(null);
  const [lastStop, setLastStop] = useState<string | null>(null);
  // The audit's review list for the open folder (.labeler_review.json, read by
  // electron/review.ts), by file name; null when the folder has none. Its flags
  // are drawn on the canvas as dashed hints, H hides them.
  const [reviewList, setReviewList] = useState<Map<string, ReviewItem> | null>(null);
  const [reviewClasses, setReviewClasses] = useState<string[]>([]);
  const [showHints, setShowHints] = useState(true);
  const progressFolder = useRef<string | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const progressDirty = useRef(false);
  const prevNameRef = useRef<string | null>(null);

  // Refs mirror the latest state so the history logic can snapshot it
  // synchronously without threading it through every callback dependency.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const curIdxRef = useRef(curIdx);
  curIdxRef.current = curIdx;

  // -------- Undo / redo history --------
  // Each entry is a full `images` snapshot (plus the image it applies to) taken
  // BEFORE a user edit. Only edits routed through setBoxes are recorded —
  // background hydration and auto-save write straight to setImages, so undo
  // never fights the annotation loader.
  type Snapshot = { images: ImageItem[]; idx: number };
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const pendingBefore = useRef<Snapshot | null>(null);
  const historyTimer = useRef<number | undefined>(undefined);
  const HISTORY_LIMIT = 60;

  const flushHistory = useCallback(() => {
    if (historyTimer.current) { window.clearTimeout(historyTimer.current); historyTimer.current = undefined; }
    if (pendingBefore.current) {
      undoStack.current.push(pendingBefore.current);
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
      pendingBefore.current = null;
    }
  }, []);

  const setBoxes = useCallback((updater: NBox[] | ((bs: NBox[]) => NBox[])) => {
    // Capture the pre-edit state once per burst. Rapid updates from a single
    // drag (move/resize) coalesce into one undo step; a trailing timer commits
    // it shortly after the gesture ends.
    if (!pendingBefore.current) {
      pendingBefore.current = { images: imagesRef.current, idx: curIdxRef.current };
    }
    redoStack.current = [];
    if (historyTimer.current) window.clearTimeout(historyTimer.current);
    historyTimer.current = window.setTimeout(flushHistory, 350);
    setImages(ims => ims.map((im, i) => {
      if (i !== curIdx) return im;
      const next = typeof updater === "function" ? updater(im.boxes) : updater;
      return { ...im, boxes: next, labeled: next.length > 0, dirty: true };
    }));
  }, [curIdx, flushHistory]);
  const boxes = cur ? cur.boxes : [];

  // annotate-view state
  const [tool, setTool] = useState<"pointer" | "box">("pointer");
  const [zoom, setZoom] = useState(1);
  const [selId, setSelId] = useState<string | null>(null);
  const [activeClass, setActiveClass] = useState<string>(classes[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ListFilter>("all");
  // Optional class-name filter for the file list: show only images that contain
  // at least one box of this class. null = no class filter.
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [showInspector, setShowInspector] = useState(true);
  // Boxes store their class by NAME (that is what the on-disk YOLO/COCO/VOC/CSV
  // formats use, and what loaded + auto-labeled boxes carry). These resolvers
  // accept either a class id OR a name so older boxes keep working.
  const classColor = useCallback(
    (key: string) => (classes.find(c => c.id === key || c.name === key) || { color: "#888" }).color,
    [classes],
  );
  const classNameOf = useCallback(
    (key: string) => classes.find(c => c.id === key || c.name === key)?.name ?? key,
    [classes],
  );
  const activeClassName = classNameOf(activeClass);

  // overlays
  const [cmdk, setCmdk] = useState(false);
  const [autoLabel, setAutoLabel] = useState(false);
  const [split, setSplit] = useState(false);
  const [classMgr, setClassMgr] = useState(false);
  const [settings, setSettings] = useState(false);
  const [sysPanel, setSysPanel] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; box: NBox } | null>(null);
  const [projMenu, setProjMenu] = useState(false);
  const [obbWarning, setObbWarning] = useState<number | null>(null);

  // toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((toast: { icon?: string; msg: string; undo?: () => void; actionLabel?: string; sticky?: boolean }) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { ...toast, id }]);
    // Sticky toasts (e.g. the "set class names" warning) wait for the user.
    if (!toast.sticky) setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 5000);
  }, []);
  const dismiss = useCallback((id: string) => setToasts(ts => ts.filter(tt => tt.id !== id)), []);

  // A save can report class names the format could not store (YOLO keeps only
  // a class INDEX, so a name outside the ordered class list is unrepresentable)
  // — those boxes are NOT on disk. This used to happen silently and was the
  // worst bug in the app: imported labels with an out-of-range index, or boxes
  // left behind by a deleted class, quietly disappeared on the next auto-save.
  // Warn once per class name, and point the user at the fix.
  const warnedDrops = useRef(new Set<string>());
  const reportDropped = useCallback((dropped: string[], imageName: string) => {
    const fresh = dropped.filter(c => !warnedDrops.current.has(c));
    if (fresh.length === 0) return;
    for (const c of fresh) warnedDrops.current.add(c);
    pushToast({
      icon: "alert",
      sticky: true,
      msg: `${t("These boxes could not be saved because their class is not in the class list:")} ` +
        `${fresh.join(", ")} (${imageName}). ${t("Add the class in Classes, then save again.")}`,
      actionLabel: t("Open Classes"),
      undo: () => setClassMgr(true),
    });
  }, [pushToast]);

  const undo = useCallback(() => {
    flushHistory();
    const snap = undoStack.current.pop();
    if (!snap) { pushToast({ icon: "info", msg: t("Nothing to undo") }); return; }
    redoStack.current.push({ images: imagesRef.current, idx: curIdxRef.current });
    // Mark the affected image dirty so auto-save rewrites its label file to
    // match the restored boxes — otherwise the canvas and disk would disagree.
    setImages(snap.images.map((im, i) => i === snap.idx ? { ...im, dirty: true } : im));
    setCurIdx(snap.idx);
    setSelId(null);
  }, [flushHistory, pushToast]);

  const redo = useCallback(() => {
    const snap = redoStack.current.pop();
    if (!snap) return;
    undoStack.current.push({ images: imagesRef.current, idx: curIdxRef.current });
    setImages(snap.images.map((im, i) => i === snap.idx ? { ...im, dirty: true } : im));
    setCurIdx(snap.idx);
    setSelId(null);
  }, []);

  // Write the review progress if it changed. Reads refs, so it always saves the
  // latest marks to the folder they belong to — openFolder calls it before
  // switching folders, the close handshake before quitting.
  const progressWarned = useRef(false);
  const saveProgressNow = useCallback(async () => {
    const folder = progressFolder.current;
    const p = progressRef.current;
    if (!inElectron || !folder || !p || !progressDirty.current) return;
    progressDirty.current = false;
    const res = await window.api!.saveProgress(folder, { reviewed: [...p.reviewed], last: p.last })
      .catch(err => ({ ok: false, error: String(err) }));
    if (!res.ok) {
      progressDirty.current = true;
      if (!progressWarned.current) {
        progressWarned.current = true;
        pushToast({ icon: "alert", msg: t("Couldn't save the review progress — is the folder read-only?") });
      }
    }
  }, [pushToast]);
  const saveProgressRef = useRef(saveProgressNow);
  saveProgressRef.current = saveProgressNow;

  // Moving to another image marks the one left behind as reviewed, if it was on
  // screen long enough to have been looked at (MIN_LOOK_MS).
  const curName = cur?.name ?? null;
  const arrivedAt = useRef(0);
  useEffect(() => {
    if (!curName) return;
    const prev = prevNameRef.current;
    const looked = performance.now() - arrivedAt.current >= MIN_LOOK_MS;
    prevNameRef.current = curName;
    arrivedAt.current = performance.now();
    setProgress(p => {
      if (!p) return p;
      const next = stepProgress(p, looked ? prev : null, curName);
      if (next !== p) progressDirty.current = true;
      return next;
    });
  }, [curName]);

  // Debounced: paging through images quickly writes the file once.
  useEffect(() => {
    if (!progressDirty.current) return;
    const id = window.setTimeout(() => { void saveProgressNow(); }, 1000);
    return () => window.clearTimeout(id);
  }, [progress, saveProgressNow]);

  // The rows the file list shows, in the order it shows them. Next / previous
  // (buttons, N/P, arrow keys) walk this order, so with "To review" on they go
  // from one flagged image to the next instead of through the whole folder.
  const ranked = RANKED_FILTERS.has(filter);
  const order = useMemo(() => {
    const q = search.toLowerCase();
    const seen = progress?.reviewed;
    return listOrder(images.length, i => {
      const im = images[i];
      return im.name.toLowerCase().includes(q)
        && matchesFilter(filter, im.labeled, !!seen?.has(im.name), !!reviewList?.has(im.name))
        && (!classFilter || im.boxes.some(b => classNameOf(b.cls) === classFilter));
    }, ranked ? i => reviewList?.get(images[i].name)?.score ?? 0 : undefined);
  }, [images, search, filter, classFilter, classNameOf, progress, reviewList, ranked]);
  const orderRef = useRef(order);
  orderRef.current = order;
  const rankedRef = useRef(ranked);
  rankedRef.current = ranked;

  // navigation
  const go = useCallback((d: number) => {
    setCurIdx(i => stepInOrder(orderRef.current, i, d, rankedRef.current));
    setSelId(null);
  }, []);
  const openImageInAnnotate = useCallback((i: number) => {
    setCurIdx(i); setTab("annotate");
  }, []);

  // -------- Open a real folder (Electron-only) --------
  const openFolder = useCallback(async (folder: string, projName?: string) => {
    if (!inElectron) return;
    // Clear stale state from any previously opened project FIRST so we never
    // flash old images / boxes while the new folder is being scanned.
    clearThumbs();
    warnedDrops.current.clear();
    // The previous folder's review marks go to ITS file before they are dropped.
    await saveProgressRef.current();
    progressFolder.current = null;
    progressDirty.current = false;
    prevNameRef.current = null;
    setProgress(null);
    setLastStop(null);
    setReviewList(null);
    setImages([]);
    setCurIdx(0);
    setSelId(null);
    setProject(null);
    setLoading(true);
    try {
      // 1. If this folder has a project metadata file, restore classes + format from it.
      const existing = await window.api!.loadProject(folder);
      let effectiveClasses = classes;
      let effectiveFmt = fmt;
      let effectiveOutputDir = outputDir;
      if (existing) {
        if (existing.classes && existing.classes.length > 0) {
          effectiveClasses = existing.classes.map((name, i) => {
            const prior = classes.find(c => c.name === name);
            return prior ?? {
              id: name, name,
              color: Object.values(PALETTE)[i % Object.values(PALETTE).length],
            };
          });
          setClasses(effectiveClasses);
        }
        if (existing.format) { effectiveFmt = existing.format; setFmt(existing.format); }
        if (existing.outputDir) { effectiveOutputDir = existing.outputDir; setOutputDir(existing.outputDir); }
      }

      // 1b. No saved class list for this folder? Read the dataset's own class
      // definition (classes.txt / data.yaml / *.names) so YOLO & COCO class
      // INDICES resolve to the right names. Without this the app fell back to
      // the default person/car/truck/bus order and mislabeled imported datasets.
      let classNamesKnown = !!existing?.classes?.length;
      if (!existing?.classes?.length) {
        const detected = await window.api!.detectClasses(folder).catch(() => null);
        if (detected && detected.length > 0) {
          classNamesKnown = true;
          effectiveClasses = detected.map((name, i) => {
            const prior = classes.find(c => c.name === name);
            return prior ?? {
              id: name, name,
              color: Object.values(PALETTE)[i % Object.values(PALETTE).length],
            };
          });
          setClasses(effectiveClasses);
        }
      }

      // 2. Return the directory listing immediately. Dimensions, timestamps,
      // and annotations are loaded only when an image is selected.
      const [list, saved, audit] = await Promise.all([
        listImagesInFolder(folder),
        window.api!.loadProgress(folder).catch(() => ({ reviewed: [] as string[], last: null })),
        window.api!.loadReview(folder).catch(() => null),
      ]);
      const classNames = effectiveClasses.map(c => c.name);
      const start = resumeIndex(list.map(im => im.name), saved.last);
      const resumed = saved.last !== null && list[start]?.name === saved.last;

      // Two files with the same stem (photo.jpg + photo.png) map to the SAME
      // label file — whichever is saved last silently overwrites the other,
      // and both rows show the same boxes. Warn up front instead of letting
      // the user discover it after hours of labeling.
      {
        const seen = new Map<string, string>();
        const dupes: string[] = [];
        for (const im of list) {
          const stem = im.name.replace(/\.[^.]+$/, "").toLowerCase();
          const prior = seen.get(stem);
          if (prior) dupes.push(`${prior} ↔ ${im.name}`);
          else seen.set(stem, im.name);
        }
        if (dupes.length > 0) {
          pushToast({
            icon: "alert", sticky: true,
            msg: t("Files sharing a name will overwrite each other's labels:") + " " +
              dupes.slice(0, 3).join(", ") + (dupes.length > 3 ? ` (+${dupes.length - 3})` : ""),
          });
        }
      }

      // Resolve only the first image. Loading every annotation here makes
      // very large folders take minutes before they become usable.
      let firstImageHasBoxes = false;
      if (list.length > 0) {
        const [[firstMeta], firstAnns] = await Promise.all([
          window.api!.loadImageMetadata([list[0].path]),
          window.api!.loadAnnotationsBatch({
            imagePaths: [list[0].path], classes: classNames,
            // The project file may carry a different format than the current
            // setting, and it lands in state too late for `savePlan` to have
            // picked it up — resolve the read format from it directly.
            format: planFor(obb, obbSave, effectiveFmt).format,
            outputDir: effectiveOutputDir,
          }),
        ]);
        if (firstMeta) {
          const width = firstMeta.width || list[0].w;
          const height = firstMeta.height || list[0].h;
          list[0] = {
            ...list[0],
            w: width,
            h: height,
            size: firstMeta.size,
            mtime: firstMeta.mtime,
            modified: imageModifiedTime(firstMeta.mtime),
            boxes: (firstAnns[list[0].path] ?? []).map((b, j) => ({
              id: `b_${list[0].id}_${j}`, cls: b.cls,
              x: b.x1 / width, y: b.y1 / height,
              w: (b.x2 - b.x1) / width, h: (b.y2 - b.y1) / height, r: b.r,
              conf: b.conf,
            })),
            labeled: (firstAnns[list[0].path] ?? []).length > 0,
            hydrated: true,
          };
        }
        firstImageHasBoxes = (firstAnns[list[0].path] ?? []).length > 0;
      }

      // Keep the first image's already-loaded boxes. Resetting every entry here
      // (the previous behavior) wiped the boxes we just hydrated above while
      // leaving `hydrated: true`, so the on-demand loader below skipped it and
      // the first image looked permanently unlabeled.
      setImages(list.map(im => im.hydrated ? im : { ...im, boxes: [], labeled: false }));
      // Reopen where the review stopped. The image we land on is not "gone
      // past", so it must not be marked on arrival.
      prevNameRef.current = list[start]?.name ?? null;
      progressFolder.current = folder;
      setProgress({ reviewed: new Set(saved.reviewed), last: list[start]?.name ?? null });
      setLastStop(resumed ? saved.last : null);
      const present = new Set(list.map(im => im.name));
      const flagged = audit ? audit.items.filter(it => present.has(it.name)) : [];
      setReviewList(audit ? new Map(flagged.map(it => [it.name, it])) : null);
      setReviewClasses(audit?.classes.length ? audit.classes : classNames);
      setCurIdx(start);
      setSelId(null);
      setLoading(false);

      const meta: ProjectInfo = {
        id: folder,
        name: projName ?? existing?.name ?? folder.split(/[\\/]/).filter(Boolean).pop() ?? "Untitled",
        imageDir: folder,
        classes: classNames,
        format: effectiveFmt,
        outputDir: effectiveOutputDir,
        createdAt: existing?.createdAt ?? Date.now(),
        lastOpenedAt: Date.now(),
        count: list.length,
        labeled: existing?.labeled ?? 0,
        labeledAt: existing?.labeledAt,
      };
      setProject(meta);
      void window.api!.saveProject(meta).then(res => {
        // Surface write failures (read-only folder, locked network share) —
        // otherwise the class list and format are silently lost on reopen.
        if (res && !res.ok) {
          pushToast({ icon: "alert", msg: t("Couldn't write project settings — is the folder read-only?") });
        }
      }).catch(err => {
        console.warn("Could not persist recent project metadata", err);
      });

      pushToast({ icon: "folder", msg: `Opened ${projectTitle(meta.name, folder)} — ${list.length} image${list.length === 1 ? "" : "s"}` });
      if (resumed) {
        const done = saved.reviewed.filter(n => present.has(n)).length;
        pushToast({ icon: "eye", msg: `${t("Resumed at")} ${saved.last} — ${done}/${list.length} ${t("reviewed")}` });
      }
      if (audit) {
        const seen = new Set(saved.reviewed);
        const left = flagged.filter(it => !seen.has(it.name)).length;
        pushToast({ icon: "alert", msg: `${t("Review list")}: ${left} ${t("to review")} (${flagged.length} ${t("flagged")}) — ${t("Filter → To review")}` });
      }

      // YOLO stores class NUMBERS, not names. If this dataset shipped no class
      // list and we couldn't detect one, the names shown are just the app's
      // defaults (person/car/…) and are almost certainly wrong. Warn once and
      // point the user at Classes, where they can type the names or import a file.
      if (effectiveFmt === "YOLO" && !classNamesKnown && firstImageHasBoxes) {
        pushToast({
          icon: "alert",
          sticky: true,
          msg: t("Class names couldn't be detected — the labels show default names. Set them in Classes."),
          actionLabel: t("Set names"),
          undo: () => setClassMgr(true),
        });
      }
    } catch (err) {
      pushToast({ icon: "alert", msg: `Open failed: ${err}` });
    } finally {
      setLoading(false);
    }
    // `fmt`, `obb` and `obbSave` are all read directly (via planFor on the
    // project file's own format), so they are listed rather than leaning on
    // `savePlan` — which collapses to a constant in "obb" mode and would then
    // hold a stale `fmt` in this closure.
  }, [classes, fmt, obb, obbSave, outputDir, pushToast]);

  // Dimensions and annotations are loaded on demand for the selected image.
  // This keeps projects with tens of thousands of files responsive.
  const hydratingImages = useRef(new Set<string>());
  useEffect(() => {
    const image = images[curIdx];
    // Never re-load an image the user is editing (dirty): a late-arriving load
    // would overwrite freshly drawn boxes or resurrect ones they just deleted.
    if (!image || image.hydrated || image.dirty || hydratingImages.current.has(image.path)) return;
    hydratingImages.current.add(image.path);
    const classNames = classes.map(c => c.name);
    Promise.all([
      window.api!.loadImageMetadata([image.path]),
      window.api!.loadAnnotationsBatch({
        imagePaths: [image.path], classes: classNames, format: savePlan.format, outputDir,
      }),
    ]).then(([[info], annsMap]) => {
      setImages(prev => prev.map(im => {
        if (im.path !== image.path || im.dirty) return im;
        const width = info?.width || im.w;
        const height = info?.height || im.h;
        const nboxes: NBox[] = (annsMap[im.path] ?? []).map((b, j) => ({
          id: `b_${im.id}_${j}`, cls: b.cls,
          x: b.x1 / width, y: b.y1 / height,
          w: (b.x2 - b.x1) / width, h: (b.y2 - b.y1) / height, r: b.r,
          conf: b.conf,
        }));
        return {
          ...im, w: width, h: height,
          size: info?.size ?? im.size, mtime: info?.mtime ?? im.mtime,
          modified: info ? imageModifiedTime(info.mtime) : im.modified,
          boxes: nboxes, labeled: nboxes.length > 0, hydrated: true,
        };
      }));
    }).catch(err => {
      pushToast({ icon: "alert", msg: `Image load failed: ${err}` });
    }).finally(() => {
      hydratingImages.current.delete(image.path);
    });
  }, [images, curIdx, classes, savePlan, outputDir, pushToast]);

  // Several views need EVERY image's annotations, not just the one on screen:
  // the Annotate file list shows a "labeled" tick + box count + modified time
  // per row, and the Dataset/Train tabs aggregate box counts and class
  // distribution. Normal browsing only hydrates the image you open, so a
  // pre-labeled dataset looked entirely unlabeled until each row was clicked.
  // Hydrate the remaining images in the background (chunked) on those tabs so
  // the ticks and file info fill in on their own.
  const hydratingAll = useRef(false);
  useEffect(() => {
    if (!inElectron) return;
    if (tab !== "annotate" && tab !== "dataset" && tab !== "train") return;
    if (hydratingAll.current) return;
    const pending = images.filter(im => !im.hydrated && !im.dirty && im.path);
    if (pending.length === 0) return;
    hydratingAll.current = true;
    const classNames = classes.map(c => c.name);
    (async () => {
      try {
        const CHUNK = 48;
        for (let i = 0; i < pending.length; i += CHUNK) {
          const slice = pending.slice(i, i + CHUNK);
          const paths = slice.map(s => s.path);
          const [metas, annsMap] = await Promise.all([
            window.api!.loadImageMetadata(paths),
            window.api!.loadAnnotationsBatch({ imagePaths: paths, classes: classNames, format: savePlan.format, outputDir }),
          ]);
          const metaByPath = new Map(metas.map(m => [m.path, m]));
          const want = new Set(paths);
          setImages(prev => prev.map(im => {
            if (im.hydrated || im.dirty || !want.has(im.path)) return im;
            const info = metaByPath.get(im.path);
            const width = info?.width || im.w;
            const height = info?.height || im.h;
            const nboxes: NBox[] = (annsMap[im.path] ?? []).map((b, j) => ({
              id: `b_${im.id}_${j}`, cls: b.cls,
              x: b.x1 / width, y: b.y1 / height,
              w: (b.x2 - b.x1) / width, h: (b.y2 - b.y1) / height, r: b.r,
              conf: b.conf,
            }));
            return {
              ...im, w: width, h: height,
              size: info?.size ?? im.size, mtime: info?.mtime ?? im.mtime,
              modified: info ? imageModifiedTime(info.mtime) : im.modified,
              boxes: nboxes, labeled: nboxes.length > 0, hydrated: true,
            };
          }));
        }
      } catch (err) {
        pushToast({ icon: "alert", msg: `Scan failed: ${err}` });
      } finally {
        hydratingAll.current = false;
      }
    })();
  }, [tab, images, classes, savePlan, outputDir, pushToast]);

  // Re-read every annotation from disk with the CURRENT class list. Used after
  // the user fixes the class names (typed or imported): YOLO boxes carry only a
  // class index, so the on-disk numbers must be re-resolved against the new
  // ordered names. Unsaved (dirty) images are left alone so edits aren't lost.
  const reloadAnnotations = useCallback(() => {
    hydratingImages.current.clear();
    hydratingAll.current = false;
    setSelId(null);
    setImages(ims => ims.map(im => im.dirty ? im : { ...im, hydrated: false, boxes: [], labeled: false }));
  }, []);

  // Persist the class list back to the project file whenever it changes (e.g.
  // after the user fixes imported names), so reopening the folder keeps the
  // corrected names instead of reverting to what was saved at open time.
  const projectRef = useRef(project);
  projectRef.current = project;
  useEffect(() => {
    if (!inElectron) return;
    const p = projectRef.current;
    if (!p) return;
    const names = classes.map(c => c.name);
    if (p.classes.length === names.length && p.classes.every((n, i) => n === names[i])) return;
    const updated = { ...p, classes: names };
    setProject(updated);
    void window.api!.saveProject(updated).catch(() => { /* best-effort */ });
  }, [classes]);

  // Once every image has been read, the labelled count is exact: store it in
  // the project file so the project list shows it (it used to show whatever
  // was known at open time — usually 0). Debounced, so labelling an image
  // writes the file once, not per box.
  const allHydrated = images.length > 0 && images.every(im => im.hydrated);
  const labeledNow = useMemo(() => images.filter(im => im.labeled).length, [images]);
  useEffect(() => {
    if (!inElectron || !allHydrated) return;
    const p = projectRef.current;
    if (!p || (p.labeledAt && p.labeled === labeledNow && p.count === images.length)) return;
    const id = window.setTimeout(() => {
      const cur = projectRef.current;
      if (!cur || cur.id !== p.id) return;
      const updated = { ...cur, labeled: labeledNow, count: images.length, labeledAt: Date.now() };
      setProject(updated);
      void window.api!.saveProject(updated).catch(() => { /* best-effort */ });
    }, 1500);
    return () => window.clearTimeout(id);
  }, [allHydrated, labeledNow, images.length]);

  const switchProject = useCallback(async (p: ProjectInfo) => {
    setProjMenu(false);
    if (!inElectron) {
      pushToast({ icon: "alert", msg: "Project loading requires the desktop app (Electron)." });
      return;
    }
    if (!p.imageDir) {
      pushToast({ icon: "alert", msg: "Project has no image folder." });
      return;
    }
    setScreen("app");
    await openFolder(p.imageDir, p.name);
  }, [openFolder, pushToast]);

  const newProject = useCallback(async () => {
    if (!inElectron) {
      pushToast({ icon: "alert", msg: "Creating a project requires the desktop app (Electron)." });
      return;
    }
    const folder = await window.api!.openFolderDialog();
    if (!folder) return;
    setScreen("app");
    await openFolder(folder);
  }, [openFolder, pushToast]);

  // -------- Lossy-save warning --------
  // "Upright only" is the one setting where the canvas and the file stop
  // agreeing: the boxes are turned on screen but stored as the rectangle around
  // them. Raise it once per session, as soon as a rotation actually exists, so
  // the user finds out on the first rotated box rather than after a whole
  // folder. Changing the setting re-arms it, because the risk is new again.
  const obbWarnedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!obb || obbSave !== "hbb") { obbWarnedFor.current = null; return; }
    const key = `hbb:${fmt}`;
    if (obbWarnedFor.current === key) return;
    const rotated = images.reduce((n, im) => n + im.boxes.filter(b => b.r).length, 0);
    if (rotated === 0) return;
    obbWarnedFor.current = key;
    setObbWarning(rotated);
  }, [obb, obbSave, fmt, images]);

  // -------- Auto-save (debounced) --------
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!inElectron) return;
    if (!cur?.path || !cur.dirty) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const savedBoxes = cur.boxes;
    saveTimer.current = window.setTimeout(async () => {
      try {
        const dropped = await saveBoxes(cur, savedBoxes.map(b => ({ ...b, cls: classNameOf(b.cls) })), classes.map(c => c.name), savePlan, outputDir);
        reportDropped(dropped, cur.name);
        // Only clear dirty if the boxes weren't edited again while the save
        // was in flight — otherwise the newer edit would never be persisted.
        setImages(ims => ims.map(im => im.id === cur.id && im.boxes === savedBoxes ? { ...im, dirty: false } : im));
      } catch (err) {
        pushToast({ icon: "alert", msg: `Save failed: ${err}` });
      }
    }, 800);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [cur, classes, savePlan, outputDir, classNameOf, pushToast, reportDropped]);

  // -------- Persist dirty images the user navigated away from --------
  // The debounced saver above only covers the image on screen. Navigating away
  // within its 800ms window used to cancel the pending save, leaving the edits
  // in memory only: exports read stale label files and closing the app lost
  // the boxes. An off-screen image can't be mid-edit, so save it immediately.
  // Sequential on purpose — COCO keeps every image in ONE json file, and
  // parallel read-modify-write cycles there would drop annotations.
  const savingOthers = useRef(new Set<string>());
  // Don't hot-loop on a folder that rejects writes: remember which boxes
  // failed and retry only after the user edits that image again.
  const failedSaves = useRef(new Map<string, NBox[]>());
  useEffect(() => {
    if (!inElectron) return;
    const others = images.filter((im, i) =>
      im.dirty && i !== curIdx && im.path &&
      !savingOthers.current.has(im.id) &&
      failedSaves.current.get(im.id) !== im.boxes);
    if (others.length === 0) return;
    for (const im of others) savingOthers.current.add(im.id);
    const classNames = classes.map(c => c.name);
    void (async () => {
      for (const im of others) {
        const savedBoxes = im.boxes;
        try {
          const dropped = await saveBoxes(im, savedBoxes.map(b => ({ ...b, cls: classNameOf(b.cls) })), classNames, savePlan, outputDir);
          reportDropped(dropped, im.name);
          failedSaves.current.delete(im.id);
          setImages(ims => ims.map(x => x.id === im.id && x.boxes === savedBoxes ? { ...x, dirty: false } : x));
        } catch (err) {
          failedSaves.current.set(im.id, savedBoxes);
          pushToast({ icon: "alert", msg: `Save failed (${im.name}): ${err}` });
        } finally {
          savingOthers.current.delete(im.id);
        }
      }
    })();
  }, [images, curIdx, classes, savePlan, outputDir, classNameOf, pushToast, reportDropped]);

  // Save EVERY dirty image (including the current one). Runs before export /
  // split so the files on disk match the canvas, and when the app is closing.
  const flushAllDirty = useCallback(async () => {
    if (!inElectron) return;
    const dirty = imagesRef.current.filter(im => im.dirty && im.path);
    const classNames = classes.map(c => c.name);
    for (const im of dirty) {
      const savedBoxes = im.boxes;
      try {
        const dropped = await saveBoxes(im, savedBoxes.map(b => ({ ...b, cls: classNameOf(b.cls) })), classNames, savePlan, outputDir);
        reportDropped(dropped, im.name);
        failedSaves.current.delete(im.id);
        setImages(ims => ims.map(x => x.id === im.id && x.boxes === savedBoxes ? { ...x, dirty: false } : x));
      } catch (err) {
        pushToast({ icon: "alert", msg: `Save failed (${im.name}): ${err}` });
      }
    }
  }, [classes, savePlan, outputDir, classNameOf, pushToast, reportDropped]);

  // Always call the LATEST flush, without making the identity of `flushAllDirty`
  // part of any effect's dependency list — see the unmount effect below.
  const flushRef = useRef(flushAllDirty);
  flushRef.current = flushAllDirty;

  // Window is closing (custom close button, Alt+F4, OS shutdown): flush, then
  // tell main to proceed. Main also has a 1.5s failsafe so a hung save can
  // never block quitting.
  useEffect(() => {
    if (!inElectron) return;
    return window.api!.onBeforeClose(() => {
      void Promise.allSettled([flushRef.current(), saveProgressRef.current()])
        .finally(() => window.api!.closeReady());
    });
  }, []);

  // The license gate can unmount the whole shell mid-session (enforcement
  // flipped on while working). Fire-and-forget the same flush — the IPC
  // writes complete in the main process even as this tree goes away.
  //
  // Empty dep list on purpose: `flushAllDirty` changes identity whenever the
  // class list / format / output dir changes, and with it in the deps React ran
  // this CLEANUP on every such change — so every keystroke while renaming a
  // class kicked off a full disk flush of every dirty image (using the previous
  // class list, no less). Go through the ref so the cleanup fires only on a
  // real unmount but still calls the current implementation.
  useEffect(() => () => { void flushRef.current(); void saveProgressRef.current(); }, []);

  const saveNow = useCallback(async () => {
    if (!cur) return;
    if (!inElectron || !cur.path) {
      pushToast({ icon: "save", msg: t("Auto-saved") });
      return;
    }
    try {
      // Same class-id → name mapping as the auto-saver, so a manual Ctrl+S
      // can't write legacy class ids into the label files.
      const savedBoxes = cur.boxes;
      const dropped = await saveBoxes(cur, savedBoxes.map(b => ({ ...b, cls: classNameOf(b.cls) })), classes.map(c => c.name), savePlan, outputDir);
      reportDropped(dropped, cur.name);
      setImages(ims => ims.map(im => im.id === cur.id && im.boxes === savedBoxes ? { ...im, dirty: false } : im));
      pushToast({ icon: "save", msg: "Saved " + cur.name });
    } catch (err) {
      pushToast({ icon: "alert", msg: `Save failed: ${err}` });
    }
  }, [cur, classes, savePlan, outputDir, classNameOf, pushToast, reportDropped]);

  // Delete the image on screen together with its label file(s). Both go to the
  // Recycle Bin (electron main: shell.trashItem), so a wrong click can be put
  // back from there. The list then shows the image that followed it.
  const deletingImage = useRef(false);
  const deleteImage = useCallback(async () => {
    const im = imagesRef.current[curIdxRef.current];
    if (!inElectron || !im?.path || deletingImage.current) return;
    const n = im.boxes.length;
    const fa = lang === "fa";
    const what = !im.hydrated ? "" : fa
      ? ` و ${n} باکس آن`
      : ` and its ${n} box${n === 1 ? "" : "es"}`;
    const ask = fa
      ? `«${im.name}»${what} حذف شود؟\nعکس و فایل لیبلش به سطل بازیافت ویندوز می‌روند و از آنجا برمی‌گردند.`
      : `Delete ${im.name}${what}?\nThe image and its label file go to the Recycle Bin, where they can be restored.`;
    if (!window.confirm(ask)) return;
    deletingImage.current = true;
    try {
      // A pending auto-save of this image must not land after the delete and
      // recreate its label file (main also serialises the two per image).
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      const res = await window.api!.deleteImage({ imagePath: im.path, outputDir, format: savePlan.format });
      if (!res.ok && !res.removed.includes(im.path)) {
        pushToast({ icon: "alert", sticky: true, msg: `${t("Couldn't delete")} ${im.name}: ${res.error}` });
        return;
      }
      if (!res.ok) pushToast({ icon: "alert", sticky: true, msg: res.error ?? "" });
      // Undo snapshots hold the old image list; replaying one would resurrect
      // an image whose file is gone.
      flushHistory();
      undoStack.current = [];
      redoStack.current = [];
      // Leaving a deleted image must not mark it reviewed.
      prevNameRef.current = null;
      const left = imagesRef.current.length - 1;
      setImages(ims => ims.filter(x => x.path !== im.path));
      setCurIdx(i => Math.max(0, Math.min(i, left - 1)));
      setSelId(null);
      setProgress(p => {
        if (!p || (!p.reviewed.has(im.name) && p.last !== im.name)) return p;
        const reviewed = new Set(p.reviewed);
        reviewed.delete(im.name);
        progressDirty.current = true;
        return { reviewed, last: p.last === im.name ? null : p.last };
      });
      pushToast({ icon: "trash", msg: `${im.name} ${t("moved to the Recycle Bin, with its labels")}` });
    } finally {
      deletingImage.current = false;
    }
  }, [lang, outputDir, savePlan, flushHistory, pushToast]);

  // Images the Duplicates tab moved out of the open folder: drop them from the
  // list as deleteImage does — no undo snapshot may bring back a file that is
  // gone, and leaving one must not mark it reviewed.
  const dropImages = useCallback((paths: string[]) => {
    const key = (p: string) => p.replaceAll("\\", "/").toLowerCase();
    const gone = new Set(paths.map(key));
    const before = imagesRef.current;
    const keep = before.filter(im => !gone.has(key(im.path)));
    if (keep.length === before.length) return;
    flushHistory();
    undoStack.current = [];
    redoStack.current = [];
    prevNameRef.current = null;
    const curName = before[curIdxRef.current]?.name;
    const idx = keep.findIndex(im => im.name === curName);
    setImages(keep);
    setCurIdx(idx >= 0 ? idx : Math.min(curIdxRef.current, Math.max(0, keep.length - 1)));
    setSelId(null);
  }, [flushHistory]);

  const deleteSel = useCallback(() => {
    if (!selId) return;
    setBoxes(bs => bs.filter(b => b.id !== selId));
    pushToast({ icon: "trash", msg: "Box deleted" });
    setSelId(null);
  }, [selId, setBoxes, pushToast]);

  // -------- Auto-label runner (Electron only) --------
  // Live progress streamed from the Python child (per processed image).
  const [autoProg, setAutoProg] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    if (!inElectron) return;
    return window.api!.onAutoLabelProgress(p => {
      // Only track while a run is active (autoProg set by runAutoLabel).
      setAutoProg(prev => (prev ? p : prev));
    });
  }, []);

  const runAutoLabel = useCallback(async (cfg: {
    conf: number; iou: number; scope: "current" | "batch";
    pickedClasses: string[]; addNew: boolean;
  }) => {
    if (!inElectron || !cur) {
      pushToast({ icon: "alert", msg: "Auto-label needs the desktop app + a YOLO model in ./models/" });
      return;
    }
    const modelPath = await window.api!.findYoloModel();
    if (!modelPath) {
      pushToast({ icon: "alert", msg: "No model (.pt) found in ./models/" });
      return;
    }
    const targets = cfg.scope === "current" ? [cur] : images;
    const imagePaths = targets.filter(i => i.path).map(i => i.path);
    setAutoProg({ done: 0, total: imagePaths.length });
    try {
      const results = await window.api!.autoLabel({
        imagePaths,
        modelPath,
        conf: cfg.conf, iou: cfg.iou,
        device: device === "gpu" ? "cuda" : "cpu",
        allowedClasses: cfg.pickedClasses.length ? cfg.pickedClasses : undefined,
      });
      // merge detections
      const palette = Object.values(PALETTE);
      const newClasses = [...classes];
      const ensureClass = (n: string) => {
        if (newClasses.find(c => c.name === n)) return;
        if (!cfg.addNew) return;
        newClasses.push({ id: n, name: n, color: palette[newClasses.length % palette.length] });
      };
      // Precompute the merge OUTSIDE the state updater (StrictMode double-
      // invokes updaters in dev, which would double counters and box ids).
      // Detections are normalized with the dims Python actually ran inference
      // on (real pixels, EXIF rotation applied) — never with the renderer's
      // pre-hydration placeholder dims, which used to write garbage coords for
      // every image that hadn't been opened yet. No usable dims → skip the
      // image instead of emitting NaN boxes.
      const merged = new Map<string, { w: number; h: number; boxes: NBox[] }>();
      let skippedNoDims = 0;
      for (const im of imagesRef.current) {
        const r = results.find(rr => rr.imagePath === im.path);
        if (!r || r.detections.length === 0) continue;
        const w = r.width && r.width > 0 ? r.width : (im.hydrated && im.w > 0 ? im.w : 0);
        const h = r.height && r.height > 0 ? r.height : (im.hydrated && im.h > 0 ? im.h : 0);
        if (!w || !h) { skippedNoDims++; continue; }
        const newBoxes: NBox[] = r.detections
          .filter(d => cfg.addNew || newClasses.find(c => c.name === d.cls))
          .map((d, k) => {
            ensureClass(d.cls);
            return {
              id: `auto_${im.id}_${k}_${Date.now()}`,
              cls: d.cls,
              x: d.x1 / w,
              y: d.y1 / h,
              w: (d.x2 - d.x1) / w,
              h: (d.y2 - d.y1) / h,
              conf: d.conf,
            };
          });
        if (newBoxes.length > 0) merged.set(im.path, { w, h, boxes: newBoxes });
      }
      // Record one undo step for the whole auto-label pass so a bad run can be
      // reverted with Ctrl+Z.
      flushHistory();
      undoStack.current.push({ images: imagesRef.current, idx: curIdxRef.current });
      redoStack.current = [];
      setImages(ims => ims.map(im => {
        const m = merged.get(im.path);
        if (!m) return im;
        return {
          ...im, w: m.w, h: m.h,
          boxes: [...im.boxes, ...m.boxes], labeled: true, dirty: true,
        };
      }));
      setClasses(newClasses);
      const totalDetections = results.reduce((a, r) => a + r.detections.length, 0);
      pushToast({ icon: "checkCircle", msg: `Auto-label done — ${totalDetections} detections` });
      // "Done, 0 detections" with no explanation is the single most confusing
      // outcome here. The usual causes are a class filter that doesn't match
      // the model's own class names, or a confidence threshold set too high.
      if (totalDetections === 0) {
        pushToast({
          icon: "alert", sticky: true,
          msg: cfg.pickedClasses.length
            ? t("No detections. The selected class filter may not match this model's class names — clear the selection to keep everything it finds.")
            : t("No detections. Try lowering the confidence threshold, or check that the model fits these images."),
        });
      }
      if (skippedNoDims > 0) {
        pushToast({ icon: "alert", msg: `${skippedNoDims} ${t("images skipped — could not read image size")}` });
      }
    } catch (err) {
      if (/cancel/i.test(String(err))) {
        pushToast({ icon: "info", msg: t("Auto-label cancelled") });
      } else {
        pushToast({ icon: "alert", msg: `Auto-label failed: ${err}` });
      }
    } finally {
      setAutoProg(null);
    }
  }, [cur, images, classes, device, pushToast, flushHistory]);

  // -------- Split runner --------
  const runSplit = useCallback(async (cfg: {
    ratios: { train: number; val: number; test: number };
    seed: number; copy: boolean; outRoot?: string;
    yaml?: boolean; trainPy?: boolean;
  }) => {
    if (!inElectron) {
      pushToast({ icon: "alert", msg: "Split needs the desktop app" });
      return;
    }
    if (images.length === 0) {
      pushToast({ icon: "alert", msg: "No images in this project to split." });
      return;
    }
    let out = cfg.outRoot;
    if (!out || out.startsWith(".") || out.startsWith("~")) {
      out = (await window.api!.openSaveDialog("dataset")) ?? undefined;
    }
    if (!out) return;
    try {
      // The split reads label FILES — make sure unsaved edits reach disk first.
      await flushAllDirty();
      const result = await window.api!.splitDataset({
        imagePaths: images.filter(i => i.path).map(i => i.path),
        classes: classes.map(c => c.name),
        // Read the labels back in whatever format the app actually wrote them
        // — for an OBB project that is the rotated set, so a split/export never
        // silently flattens the angles on the way out.
        sourceFormat: savePlan.format,
        sourceOutputDir: outputDir,
        outRoot: out,
        trainRatio: cfg.ratios.train,
        valRatio: cfg.ratios.val,
        testRatio: cfg.ratios.test,
        copyImages: cfg.copy,
        seed: cfg.seed,
        writeYaml: cfg.yaml,
        writeTrainPy: cfg.trainPy,
      });
      pushToast({
        icon: "split",
        msg: `Split: ${result.train} train · ${result.val} val · ${result.test} test`,
        actionLabel: t("Open folder"),
        undo: () => { window.api!.openInExplorer(result.outRoot); },
      });
      // Zero labels out of a non-empty project almost always means the output
      // format setting doesn't match what is actually on disk, and the bundle
      // that just got written is useless for training. Say so.
      if (result.labeled === 0 && images.length > 0) {
        pushToast({
          icon: "alert", sticky: true,
          msg: t("The split contains no labels. Check that the annotation format in Settings matches the files on disk.") + ` (${savePlan.format})`,
        });
      }
    } catch (err) {
      pushToast({ icon: "alert", msg: `Split failed: ${err}` });
    }
  }, [images, classes, savePlan, outputDir, flushAllDirty, pushToast]);

  // Flat "Save As" export — copies the whole labeled dataset (images + labels)
  // into a folder the user picks, no train/val split.
  const runExport = useCallback(async (opts?: { labeledOnly?: boolean; zip?: boolean }) => {
    if (!inElectron) {
      pushToast({ icon: "alert", msg: "Export needs the desktop app" });
      return;
    }
    if (images.length === 0) {
      pushToast({ icon: "alert", msg: "No images in this project to export." });
      return;
    }
    const out = (await window.api!.openSaveDialog(opts?.zip ? "dataset-export.zip" : "dataset-export")) ?? undefined;
    if (!out) return;
    try {
      // The export reads label FILES — make sure unsaved edits reach disk first.
      await flushAllDirty();
      const result = await window.api!.exportDataset({
        imagePaths: images.filter(i => i.path).map(i => i.path),
        classes: classes.map(c => c.name),
        // Read the labels back in whatever format the app actually wrote them
        // — for an OBB project that is the rotated set, so a split/export never
        // silently flattens the angles on the way out.
        sourceFormat: savePlan.format,
        sourceOutputDir: outputDir,
        outRoot: out,
        format: savePlan.format,
        copyImages: true,
        labeledOnly: opts?.labeledOnly,
        zip: opts?.zip,
      });
      pushToast({
        icon: "download",
        msg: `Exported ${result.count} images → ${result.outRoot}`,
        actionLabel: t("Open folder"),
        undo: () => { window.api!.openInExplorer(result.outRoot); },
      });
      if (result.labeled === 0 && result.count > 0) {
        pushToast({
          icon: "alert", sticky: true,
          msg: t("The export contains no labels. Check that the annotation format in Settings matches the files on disk.") + ` (${savePlan.format})`,
        });
      }
    } catch (err) {
      pushToast({ icon: "alert", msg: `Export failed: ${err}` });
    }
  }, [images, classes, savePlan, outputDir, flushAllDirty, pushToast]);

  // -------- Command palette items --------
  const commands = useMemo<CmdItem[]>(() => {
    const raw: CmdItem[] = [
      { id: "tool-pointer", group: "Tools", icon: "pointer", label: "Pointer tool", keys: ["V"], run: () => setTool("pointer") },
      { id: "tool-box", group: "Tools", icon: "box", label: "Box tool", keys: ["B"], run: () => setTool("box") },
      { id: "next", group: "Navigate", icon: "arrowRight", label: "Next image", keys: ["N"], run: () => go(1) },
      { id: "prev", group: "Navigate", icon: "arrowLeft", label: "Previous image", keys: ["P"], run: () => go(-1) },
      { id: "go-annotate", group: "Navigate", icon: "edit", label: "Go to Annotate", run: () => setTab("annotate") },
      { id: "go-dataset", group: "Navigate", icon: "layers", label: "Go to Dataset", run: () => setTab("dataset") },
      { id: "go-train", group: "Navigate", icon: "cpu", label: "Go to Train", run: () => setTab("train") },
      { id: "go-deploy", group: "Navigate", icon: "rocket", label: "Go to Deploy", run: () => setTab("deploy") },
      { id: "auto", group: "Actions", icon: "sparkles", label: "Auto-label with YOLO", kw: "ai detect", run: () => setAutoLabel(true) },
      { id: "split", group: "Actions", icon: "split", label: "Split train / val / test", run: () => setSplit(true) },
      { id: "export", group: "Actions", icon: "download", label: "Export dataset (Save As)…", run: () => { void runExport(); } },
      { id: "export-zip", group: "Actions", icon: "download", label: "Export dataset as ZIP…", kw: "zip archive compress", run: () => { void runExport({ zip: true }); } },
      { id: "classes", group: "Actions", icon: "tag", label: "Manage classes", run: () => setClassMgr(true) },
      { id: "sys", group: "Actions", icon: "cpu", label: "Open system analysis", kw: "cuda gpu ram", run: () => setSysPanel(true) },
      { id: "save", group: "Actions", icon: "save", label: "Save current image", keys: ["⌘", "S"], run: saveNow },
      { id: "delete-image", group: "Actions", icon: "trash", label: "Delete image and its labels", kw: "remove recycle bin trash", keys: ["⌘", "Del"], run: () => { void deleteImage(); } },
      { id: "undo", group: "Actions", icon: "arrowLeft", label: "Undo", keys: ["⌘", "Z"], run: undo },
      { id: "redo", group: "Actions", icon: "arrowRight", label: "Redo", keys: ["⌘", "⇧", "Z"], run: redo },
      { id: "theme", group: "Settings", icon: theme === "dark" ? "sun" : "moon", label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`, run: () => setTheme(theme === "dark" ? "light" : "dark") },
      { id: "lang", group: "Settings", icon: "info", label: "Switch language", kw: "persian farsi", run: () => setLang(lang === "en" ? "fa" : "en") },
      { id: "density", group: "Settings", icon: "layers", label: "Cycle density", run: () => setDensity(({ comfortable: "compact", compact: "spacious", spacious: "comfortable" } as const)[density]) },
      { id: "settings", group: "Settings", icon: "settings", label: "Open settings", run: () => setSettings(true) },
      { id: "projects", group: "Settings", icon: "folder", label: "Switch project…", run: () => setScreen("projects") },
      { id: "tour", group: "Settings", icon: "info", label: "Show welcome tour", kw: "onboarding intro", run: () => setScreen("onboarding") },
      ...images.slice(0, 8).map((im, i): CmdItem => ({
        id: "img" + i, group: "Files", icon: "image", label: im.name,
        run: () => openImageInAnnotate(i),
      })),
    ];
    return raw.map(c => ({
      ...c,
      label: c.group === "Files" ? c.label : t(c.label),
      group: t(c.group),
    }));
  }, [theme, lang, density, images, go, openImageInAnnotate, saveNow, runExport, undo, redo, deleteImage]);

  const runCmd = useCallback((c: CmdItem) => c.run?.(), []);

  // -------- Keyboard shortcuts --------
  // True while any modal / drawer / menu sits above the workspace. Canvas and
  // navigation shortcuts must not fire then: with the Classes drawer open,
  // pressing "n" flipped to the next image and Delete removed a box — behind
  // the scrim, where the user could not see it happen.
  const overlayOpen = autoLabel || split || classMgr || settings || sysPanel || !!ctxMenu || projMenu
    || obbWarning !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target instanceof HTMLElement ? e.target.tagName : "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select"
        || (e.target instanceof HTMLElement && e.target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setCmdk(v => !v); return;
      }
      if (typing) return;
      if (screen !== "app") return;
      // Escape still closes whatever is on top; everything else waits.
      // The Duplicates tab has its own keys (J/K, Enter, Delete, Ctrl+Z…) —
      // the canvas shortcuts would otherwise act on an image nobody can see.
      if (tab === "duplicates" && !overlayOpen && !cmdk) return;
      if (overlayOpen || cmdk) {
        if (e.key === "Escape") {
          setAutoLabel(false); setSplit(false); setClassMgr(false);
          setSettings(false); setSysPanel(false); setCtxMenu(null);
          setProjMenu(false); setCmdk(false); setObbWarning(null);
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault(); saveNow(); return;
      }
      // Undo / redo. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault(); if (e.shiftKey) redo(); else undo(); return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault(); redo(); return;
      }
      // Ctrl+Del (Cmd+Backspace on a Mac, as in Finder) deletes the image;
      // plain Del stays "delete the selected box".
      if ((e.metaKey || e.ctrlKey) && (e.key === "Delete" || e.key === "Backspace") && tab === "annotate") {
        e.preventDefault(); void deleteImage(); return;
      }
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "=" || e.key === "+") { e.preventDefault(); setZoom(z => Math.min(8, +(z * 1.2).toFixed(2))); return; }
        if (e.key === "-") { e.preventDefault(); setZoom(z => Math.max(0.2, +(z * 0.83).toFixed(2))); return; }
        if (e.key === "0") { e.preventDefault(); setZoom(1); return; }
        return;
      }
      const k = e.key.toLowerCase();
      // Rotation nudges, matching the keys the PyQt annotator this tool grew
      // out of already used: Q/E turn by 1°, A/D by 5°, R sets the box upright.
      // Only bound in OBB mode, so A and D stay free otherwise.
      if (obb && selId && tab === "annotate" && "qeadr".includes(k)) {
        const step = k === "q" ? -1 : k === "e" ? 1 : k === "a" ? -5 : k === "d" ? 5 : null;
        e.preventDefault();
        setBoxes(bs => bs.map(b => b.id !== selId ? b : {
          ...b, r: step === null ? 0 : normalizeAngle((b.r ?? 0) + toRad(step)),
        }));
        return;
      }
      if (k === "v") setTool("pointer");
      else if (k === "b") setTool("box");
      else if (k === "n") go(1);
      else if (k === "p") go(-1);
      else if (k === "h" && tab === "annotate") setShowHints(v => !v);
      // Arrow keys follow the arrows on screen: → / ↓ next, ← / ↑ previous
      // (↓ is also "the next row" in the file list). Annotate only, and
      // preventDefault so the list and canvas don't scroll as well.
      else if (tab === "annotate" && (e.key === "ArrowRight" || e.key === "ArrowDown")) { e.preventDefault(); go(1); }
      else if (tab === "annotate" && (e.key === "ArrowLeft" || e.key === "ArrowUp")) { e.preventDefault(); go(-1); }
      else if (e.key === "Delete" || e.key === "Backspace") deleteSel();
      else if (e.key === "Escape") setSelId(null);
      else if (tab === "annotate" && /^[1-9]$/.test(e.key)) {
        const c = classes[+e.key - 1]; if (c) setActiveClass(c.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, tab, classes, go, deleteSel, deleteImage, saveNow, undo, redo, overlayOpen, cmdk,
      obb, selId, setBoxes]);

  // ---- Routes ----
  if (screen === "onboarding") {
    return (
      <>
        <Onboarding
          onDone={() => { setSeenOnboarding(true); setScreen("projects"); }}
          // The final step's folder picker used to throw the chosen folder
          // away and just move to the project list — picking a folder appeared
          // to do nothing. Open it for real.
          onFolder={(folder) => {
            setSeenOnboarding(true);
            setScreen("app");
            void openFolder(folder);
          }} />
        <ToastHost toasts={toasts} dismiss={dismiss} />
      </>
    );
  }
  if (screen === "projects") {
    return (
      <>
        <ProjectManager onOpen={switchProject} onNew={newProject} />
        <ToastHost toasts={toasts} dismiss={dismiss} />
      </>
    );
  }

  // Boxes per class NAME across everything loaded — the Classes drawer uses it
  // to tell the user what a deletion is about to cost them.
  const boxCountsByClass = images.reduce<Record<string, number>>((acc, im) => {
    for (const b of im.boxes) {
      const name = classNameOf(b.cls);
      acc[name] = (acc[name] ?? 0) + 1;
    }
    return acc;
  }, {});

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "annotate", label: t("Annotate"), icon: "edit" },
    { id: "dataset", label: t("Dataset"), icon: "layers" },
    { id: "train", label: t("Train"), icon: "cpu" },
    { id: "deploy", label: t("Deploy"), icon: "rocket" },
    { id: "duplicates", label: t("Duplicates"), icon: "copy" },
  ];
  const labeledCount = images.filter(i => i.labeled).length;
  const pct = images.length ? Math.round(labeledCount / images.length * 100) : 0;

  return (
    <div className="app">
      {/* Title bar */}
      <div className="titlebar">
        <div className="tb-traffic nodrag">
          <span style={{ background: "#FF5F57" }} title={t("Close")}
            onClick={() => window.api?.closeWindow()} />
          <span style={{ background: "#FEBC2E" }} title={t("Minimize")}
            onClick={() => window.api?.minimizeWindow()} />
          <span style={{ background: "#28C840" }} title={t("Maximize")}
            onClick={() => window.api?.toggleMaximizeWindow()} />
        </div>
        <div className="tb-logo" style={{ marginLeft: 6 }}>
          <span className="mark"><Icon name="scan" size={14} /></span>
        </div>
        <div className="nodrag" style={{ position: "relative" }}>
          <button className="proj-switch" onClick={() => setProjMenu(v => !v)} title={project?.imageDir}>
            <span className="t-body-strong">{project ? projectTitle(project.name, project.imageDir) : "—"}</span>
            <Icon name="chevDown" size={14} />
          </button>
          {projMenu && (
            <div className="dropmenu" style={{ top: "100%", left: 0, minWidth: 240 }}>
              <div className="cmdk-group">Switch project</div>
              <div className="menu-item" onClick={() => { setScreen("projects"); setProjMenu(false); }}>
                <Icon name="layers" size={15} className="ic" />{t("All projects…")}
              </div>
            </div>
          )}
        </div>

        <div className="grow" style={{ display: "flex", justifyContent: "center" }}>
          <div className="tabs-top nodrag">
            {TABS.map(tt => (
              <button key={tt.id} className={"tab-top" + (tab === tt.id ? " active" : "")}
                onClick={() => setTab(tt.id)}>
                <Icon name={tt.icon} size={14} />{tt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="row gap-sm nodrag">
          <button className="cmdk-btn" onClick={() => setCmdk(true)}>
            <Icon name="search" size={14} />
            <span>{t("Search")}</span>
            <span className="kbd-group"><span className="kbd">⌘</span><span className="kbd">K</span></span>
          </button>
          <Tip label={t("System analysis")}>
            <button className="iconbtn" onClick={() => setSysPanel(true)}><Icon name="cpu" size={17} /></button>
          </Tip>
          <Tip label={t("Auto-label")}>
            <button className="iconbtn" onClick={() => setAutoLabel(true)}><Icon name="sparkles" size={17} /></button>
          </Tip>
          <Tip label={theme === "dark" ? t("Light theme") : t("Dark theme")}>
            <button className="iconbtn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
            </button>
          </Tip>
          <Tip label={t("Settings")}>
            <button className="iconbtn" onClick={() => setSettings(true)}><Icon name="settings" size={17} /></button>
          </Tip>
        </div>
      </div>

      {/* Body per tab */}
      {tab === "annotate" && (
        <div className="body">
          <FileList images={images} curIdx={curIdx}
            setCurIdx={(i) => { setCurIdx(i); setSelId(null); }}
            search={search} setSearch={setSearch}
            filter={filter} setFilter={setFilter}
            classes={classes} classFilter={classFilter} setClassFilter={setClassFilter}
            classNameOf={classNameOf} loading={loading}
            reviewed={progress?.reviewed} lastStop={lastStop}
            order={order} review={reviewList} reviewClasses={reviewClasses} fa={lang === "fa"} />
          <div className="workspace">
            <div className="wsbar">
              <div className="row gap-md">
                <button className="iconbtn" onClick={() => go(-1)} disabled={stepInOrder(order, curIdx, -1, ranked) === curIdx}
                  title={`${t("Previous image")} (P, ←)`}><Icon name="chevLeft" size={18} /></button>
                <div className="col" style={{ alignItems: "center" }}>
                  <span className="t-body-strong mono">{cur ? cur.name : "—"}</span>
                  <span className="t-caption tnum">
                    {order.length !== images.length && order.includes(curIdx)
                      ? <>{order.indexOf(curIdx) + 1} {t("of")} {order.length} · {curIdx + 1}/{images.length}</>
                      : <>{curIdx + 1} {t("of")} {images.length}</>}
                  </span>
                </div>
                <button className="iconbtn" onClick={() => go(1)} disabled={stepInOrder(order, curIdx, 1, ranked) === curIdx}
                  title={`${t("Next image")} (N, →)`}><Icon name="chevRight" size={18} /></button>
              </div>
              <div className="row gap-sm">
                {reviewList && (
                  <button className={"btn sm " + (showHints ? "btn-secondary" : "btn-ghost")} onClick={() => setShowHints(v => !v)}
                    title={`${t("Show where the audit found a problem")} (H)`}>
                    <Icon name="alert" size={14} />{t("Hints")}
                    {cur && reviewList.get(cur.name) ? ` ${reviewList.get(cur.name)!.flags.length}` : ""}
                  </button>
                )}
                <button className="btn btn-secondary sm" onClick={() => setAutoLabel(true)}>
                  <Icon name="sparkles" size={14} />{t("Auto-label")}
                </button>
                <button className="btn btn-secondary sm" onClick={() => setClassMgr(true)}>
                  <Icon name="tag" size={14} />{t("Classes")}
                </button>
                <button className="btn btn-secondary sm" onClick={deleteImage} disabled={!cur?.path}
                  title={`${t("Delete image and its labels")} (Ctrl+Del)`}>
                  <Icon name="trash" size={14} />{t("Delete image")}
                </button>
                <button className="btn btn-primary sm" onClick={saveNow}>
                  <Icon name="save" size={14} />{t("Save")}
                </button>
              </div>
            </div>
            <div style={{ position: "relative", flex: 1, display: "flex", minHeight: 0 }}>
              <CanvasStage image={cur} boxes={boxes} setBoxes={setBoxes}
                selId={selId} setSelId={setSelId}
                tool={tool} activeClass={activeClass} activeClassName={activeClassName}
                obb={obb} zoom={zoom} setZoom={setZoom}
                classColor={classColor} classNameOf={classNameOf}
                onContext={(e, b) => setCtxMenu({ x: e.clientX, y: e.clientY, box: b })}
                pushToast={pushToast}
                hints={showHints && cur ? reviewList?.get(cur.name)?.flags : undefined}
                hintNames={reviewClasses} fa={lang === "fa"} />
              <ToolRail tool={tool} setTool={setTool} zoom={zoom} setZoom={setZoom}
                toggleInspector={() => setShowInspector(v => !v)} />
              <ChipBar classes={classes} boxes={boxes}
                activeClass={activeClass} setActiveClass={setActiveClass}
                onAddClass={() => setClassMgr(true)} />
              <div className="overlay zoom-pill">
                <button className="iconbtn sm" onClick={() => setZoom(z => Math.max(0.2, +(z * 0.83).toFixed(2)))}>
                  <Icon name="minus" size={14} />
                </button>
                {Math.round(zoom * 100)}%
                <button className="iconbtn sm" onClick={() => setZoom(z => Math.min(8, +(z * 1.2).toFixed(2)))}>
                  <Icon name="plus" size={14} />
                </button>
              </div>
            </div>
          </div>
          {showInspector && (
            <AnnotateInspector boxes={boxes} setBoxes={setBoxes}
              selId={selId} setSelId={setSelId}
              classes={classes} classColor={classColor} classNameOf={classNameOf} image={cur}
              obb={obb} />
          )}
        </div>
      )}
      {tab === "dataset" && (
        <DatasetRoute images={images} classes={classes}
          classColor={classColor} openImage={openImageInAnnotate}
          onExport={runExport} />
      )}
      {tab === "train" && (
        <TrainRoute
          classes={classes} images={images} project={project}
          pushToast={pushToast}
          onExportSplit={(cfg) => runSplit(cfg)}
        />
      )}
      {tab === "deploy" && <DeployRoute project={project} classes={classes} pushToast={pushToast} />}
      {tab === "duplicates" && (
        <DuplicatesRoute project={project} classes={classes} classColor={classColor}
          format={savePlan.format} outputDir={outputDir} fa={lang === "fa"} pushToast={pushToast}
          beforeChange={flushAllDirty} onRemoved={dropImages}
          onRestored={() => { if (project) void openFolder(project.imageDir, project.name); }} />
      )}

      {/* Status bar */}
      <div className="statusbar">
        <button className="status-item" onClick={() => setSysPanel(true)} style={{ background: "none" }}>
          <Icon name={device === "gpu" ? "gpu" : "cpu"} size={13} style={{ color: "var(--success)" }} />
          YOLO {device === "gpu" ? t("CUDA ready") : t("CPU ready")}
        </button>
        <span className="sep" />
        <span className="status-item"><Icon name="tag" size={13} />{classes.length} {t("classes")}</span>
        <span className="sep" />
        <span className="status-item mono">{savePlan.format}</span>
        {obb && (
          <>
            <span className="sep" />
            <button className="status-item" onClick={() => setSettings(true)}
              style={{ background: "none", color: obbSave === "hbb" ? "var(--warning)" : undefined }}>
              <Icon name="rotate" size={13} />
              {obbSave === "both" ? t("OBB + upright")
                : obbSave === "obb" ? t("OBB only") : t("Upright only")}
            </button>
          </>
        )}
        <span className="grow" />
        <span className="status-item">
          <Icon name="checkCircle" size={13} style={{ color: "var(--success)" }} />
          {t("Auto-saved")}
        </span>
        <span className="sep" />
        <span className="status-item tnum">{labeledCount}/{images.length} {t("labeled")}</span>
        <div style={{ width: 90 }}><div className="prog"><i style={{ width: pct + "%" }} /></div></div>
        <span className="status-item tnum">{pct}%</span>
      </div>

      {/* Overlays */}
      {cmdk && <CommandPalette commands={commands} onClose={() => setCmdk(false)} onRun={runCmd} />}
      {autoLabel && (
        <AutoLabelModal onClose={() => setAutoLabel(false)} classes={classes}
          imageCount={images.length} pushToast={pushToast} onRun={runAutoLabel} />
      )}
      {split && <SplitModal onClose={() => setSplit(false)} onRun={runSplit} />}
      {classMgr && (
        <ClassManagerDrawer onClose={() => setClassMgr(false)}
          classes={classes} setClasses={setClasses} pushToast={pushToast}
          onReloadAnnotations={reloadAnnotations} boxCounts={boxCountsByClass} />
      )}
      {settings && (
        <SettingsDrawer onClose={() => setSettings(false)}
          theme={theme} setTheme={setTheme}
          density={density} setDensity={setDensity}
          fmt={fmt} setFmt={(v) => setFmt(v as AnnotationFormat)}
          device={device} setDevice={setDevice}
          lang={lang} setLang={setLang}
          outputDir={outputDir} setOutputDir={setOutputDir}
          obb={obb} setObb={setObb}
          obbSave={obbSave} setObbSave={setObbSave} />
      )}
      {obbWarning !== null && (
        <ObbWarningModal count={obbWarning} fmt={fmt}
          onClose={() => setObbWarning(null)}
          onOpenSettings={() => { setObbWarning(null); setSettings(true); }} />
      )}
      {sysPanel && <SystemDrawer onClose={() => setSysPanel(false)} pushToast={pushToast} />}
      {ctxMenu && (
        <BoxContextMenu {...ctxMenu} classes={classes}
          onClose={() => setCtxMenu(null)}
          onDelete={(id) => {
            setBoxes(bs => bs.filter(b => b.id !== id));
            if (id === selId) setSelId(null);
          }}
          onChangeClass={(id, cls) =>
            setBoxes(bs => bs.map(b => b.id === id ? { ...b, cls } : b))
          } />
      )}
      {autoProg && (
        <div style={{
          position: "fixed", bottom: 44, insetInlineEnd: 16, zIndex: 80,
          display: "flex", alignItems: "center", gap: "var(--sp-md)",
          padding: "10px 14px", background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: "var(--r-md)",
          boxShadow: "0 8px 24px rgba(0,0,0,.35)",
        }}>
          <Icon name="sparkles" size={16} style={{ color: "var(--primary)" }} />
          <div className="col" style={{ minWidth: 180, gap: 4 }}>
            <span className="t-body">
              {t("Auto-labeling…")}{" "}
              <span className="mono tnum">{autoProg.done}/{autoProg.total}</span>
            </span>
            <div className="prog">
              <i style={{ width: (autoProg.total ? Math.round(autoProg.done / autoProg.total * 100) : 0) + "%" }} />
            </div>
          </div>
          <button className="btn btn-ghost sm" onClick={() => { void window.api!.cancelAutoLabel(); }}>
            {t("Cancel")}
          </button>
        </div>
      )}
      <ToastHost toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
