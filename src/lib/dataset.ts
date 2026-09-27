// Dataset aggregate stats — class distribution and health checks. Pure so the
// Dataset tab can render them and tests can verify the numbers.

import type { ImageItem } from "../types";

export interface ClassCount { cls: string; count: number; }
export interface HealthItem { sev: "danger" | "warning" | "info"; text: string; }
export type StatusFilter = "all" | "labeled" | "unlabeled";

/**
 * Apply the Dataset tab's class + status filters, preserving each image's
 * original index so selection and "open in Annotate" stay correct.
 * `selectedNames` is empty => no class filtering.
 */
export function filterRows(
  images: ImageItem[],
  selectedNames: Set<string>,
  status: StatusFilter,
): { im: ImageItem; i: number }[] {
  return images
    .map((im, i) => ({ im, i }))
    .filter(({ im }) => selectedNames.size === 0 || im.boxes.some(b => selectedNames.has(b.cls)))
    .filter(({ im }) => status === "all" || (status === "labeled" ? im.labeled : !im.labeled));
}

/** Count boxes per class across all images, sorted most-frequent first. */
export function classDistribution(images: ImageItem[]): ClassCount[] {
  const counts: Record<string, number> = {};
  for (const im of images) {
    for (const b of im.boxes) counts[b.cls] = (counts[b.cls] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([cls, count]) => ({ cls, count }))
    .sort((a, b) => b.count - a.count);
}

/** Derived warnings/insights about a dataset — no hardcoded fakes. */
export function datasetHealth(images: ImageItem[]): HealthItem[] {
  const out: HealthItem[] = [];
  const classDist = classDistribution(images);
  const labeled = images.filter(i => i.boxes.length > 0).length;
  const anns = images.reduce((a, i) => a + i.boxes.length, 0);

  const unlabeled = images.filter(i => i.boxes.length === 0).length;
  if (unlabeled > 0) {
    out.push({ sev: "danger", text: `${unlabeled} image${unlabeled === 1 ? "" : "s"} have 0 boxes` });
  }
  let tiny = 0;
  for (const im of images) for (const b of im.boxes) if (b.w * b.h < 0.001) tiny++;
  if (tiny > 0) out.push({ sev: "warning", text: `${tiny} box${tiny === 1 ? "" : "es"} smaller than 1% of image (may be noise)` });
  for (const d of classDist) {
    if (d.count < 10) out.push({ sev: "warning", text: `Class “${d.cls}” has only ${d.count} instance${d.count === 1 ? "" : "s"} — consider augmentation` });
  }
  if (labeled > 0) {
    out.push({ sev: "info", text: `Average ${(anns / labeled).toFixed(1)} boxes per labeled image` });
  }
  if (out.length === 0) out.push({ sev: "info", text: "Dataset is clean — no issues detected." });
  return out;
}
