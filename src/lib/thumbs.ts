// Downscaled thumbnails for the file list and the dataset table.
//
// Those lists used to point <img src> straight at the full-resolution source
// file. A row is 48x36 on screen, but the browser still decoded the whole
// picture — sixty visible rows of 12-megapixel photos is several gigabytes of
// bitmap held in the renderer, which is what made scrolling a large project
// stutter and the memory graph climb until something got evicted.
//
// Instead decode once through createImageBitmap (which can resize as part of
// the decode, so the full bitmap never materializes), re-encode small, and hand
// out an object URL. Results are cached with an LRU and a bounded number of
// decodes runs at a time so a fast scroll cannot queue hundreds of them.

const THUMB_WIDTH = 128;
const MAX_CACHED = 400;
const MAX_PARALLEL = 4;

interface Entry { url: string; }

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<string | null>>();
const failed = new Set<string>();

let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_PARALLEL) { active++; return Promise.resolve(); }
  return new Promise<void>(resolve => queue.push(() => { active++; resolve(); }));
}

function release(): void {
  active--;
  queue.shift()?.();
}

/** Most-recently-used wins: re-inserting moves the key to the end of the Map. */
function touch(key: string, entry: Entry): void {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    const victim = cache.get(oldest);
    cache.delete(oldest);
    // Object URLs pin their blob in memory until explicitly revoked.
    if (victim) URL.revokeObjectURL(victim.url);
  }
}

export function cachedThumb(src: string): string | null {
  return cache.get(src)?.url ?? null;
}

/**
 * Resolve a small thumbnail for `src` (an app:// URL). Returns null when the
 * image can't be decoded, in which case callers should fall back to `src`.
 */
export async function getThumb(src: string): Promise<string | null> {
  const hit = cache.get(src);
  if (hit) { touch(src, hit); return hit.url; }
  if (failed.has(src)) return null;
  const pending = inFlight.get(src);
  if (pending) return pending;

  const job = (async (): Promise<string | null> => {
    await acquire();
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`thumb fetch ${res.status}`);
      const blob = await res.blob();
      // resizeWidth lets the decoder scale during decode, so the full-size
      // bitmap is never allocated.
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: THUMB_WIDTH,
        resizeQuality: "medium",
      });
      let url: string;
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(bitmap, 0, 0);
        const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.72 });
        url = URL.createObjectURL(out);
      } finally {
        bitmap.close();
      }
      touch(src, { url });
      return url;
    } catch {
      // Unsupported/corrupt file, or a browser without OffscreenCanvas —
      // remember it so we don't retry on every scroll, and let the caller
      // fall back to the original URL.
      failed.add(src);
      return null;
    } finally {
      release();
      inFlight.delete(src);
    }
  })();

  inFlight.set(src, job);
  return job;
}

/** Drop every cached thumbnail (e.g. when switching projects). */
export function clearThumbs(): void {
  for (const entry of cache.values()) URL.revokeObjectURL(entry.url);
  cache.clear();
  failed.clear();
}
