// Project-list helpers — pure, so the tests can run them without a window.
//
// A project is a folder, and its default name is the folder's own name. For a
// YOLO dataset that is almost always "images" or "train", so every split of
// every dataset showed up as the same word. Titles are built from the path
// instead, and the card shows where the folder lives.

// Folder names that say nothing about which dataset they belong to.
const GENERIC = new Set(["images", "image", "imgs", "img", "jpegimages", "photos", "pictures", "data", "frames"]);
const SPLIT = /^(train|training|val|valid|validation|test|testing)[-_]?\d*$/i;

function segments(dir: string): string[] {
  return dir.split(/[\\/]+/).filter(Boolean);
}

/**
 * The name to show for a project. A name the user gave it (anything other than
 * the folder's own name) is kept; otherwise generic trailing folders are
 * dropped and a split folder is prefixed with its dataset:
 *   …/helmet-merged-v4/train/images  →  "helmet-merged-v4 · train"
 *   …/coco/images/train2017          →  "coco · train2017"
 *   …/33pol-img                      →  "33pol-img"
 */
export function projectTitle(name: string, dir: string): string {
  const parts = segments(dir);
  const base = parts[parts.length - 1] ?? "";
  if (name && name !== base) return name;
  const segs = [...parts];
  while (segs.length > 1 && GENERIC.has(segs[segs.length - 1].toLowerCase())) segs.pop();
  const leaf = segs[segs.length - 1] ?? base;
  if (SPLIT.test(leaf)) {
    // The dataset is the nearest folder above that is neither generic nor a drive.
    for (let i = segs.length - 2; i >= 0; i--) {
      if (/^[a-z]:$/i.test(segs[i])) break;
      if (!GENERIC.has(segs[i].toLowerCase())) return `${segs[i]} · ${leaf}`;
    }
  }
  return leaf || name || dir;
}

/** The last few folders of a path, e.g. "…\helmet-merged-v4\train\images". */
export function pathTail(dir: string, keep = 3): string {
  const parts = segments(dir);
  const sep = dir.includes("\\") ? "\\" : "/";
  if (parts.length <= keep) return dir;
  return "…" + sep + parts.slice(-keep).join(sep);
}

/** "just now", "5 min ago", "1 hour ago", "3 days ago", else the date — in English or Persian. */
export function ago(ms: number, fa: boolean, now = Date.now()): string {
  if (!ms) return "—";
  const diff = now - ms;
  const min = 60_000, hr = 60 * min, day = 24 * hr;
  const n = (x: number) => Math.max(1, Math.round(x));
  if (diff < min) return fa ? "همین الان" : "just now";
  if (diff < hr) return fa ? `${n(diff / min)} دقیقه پیش` : `${n(diff / min)} min ago`;
  if (diff < day) { const h = n(diff / hr); return fa ? `${h} ساعت پیش` : `${h} hour${h === 1 ? "" : "s"} ago`; }
  if (diff < 7 * day) { const d = n(diff / day); return fa ? `${d} روز پیش` : `${d} day${d === 1 ? "" : "s"} ago`; }
  return new Date(ms).toLocaleDateString(fa ? "fa-IR" : undefined);
}

/** Does a search query match this project (title, path or class names)? */
export function matchesProject(query: string, title: string, dir: string, classes: string[] = []): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [title, dir, ...classes].some(s => s.toLowerCase().includes(q));
}
