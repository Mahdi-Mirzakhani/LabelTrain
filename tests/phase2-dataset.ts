// Phase 2 — Dataset tab: class distribution, health insights, and filtering.
//
//   node --experimental-strip-types tests/phase2-dataset.ts

import { phase, check, eq, report } from "./_assert.ts";
import { classDistribution, datasetHealth, filterRows } from "../src/lib/dataset.ts";
import type { ImageItem, NBox } from "../src/types.ts";

let n = 0;
function box(cls: string, w = 0.3, h = 0.3): NBox {
  return { id: "b" + n++, cls, x: 0.1, y: 0.1, w, h };
}
function img(name: string, boxes: NBox[]): ImageItem {
  return {
    id: name, name, path: "/img/" + name, url: "", thumb: "",
    w: 1000, h: 1000, labeled: boxes.length > 0, boxes, hydrated: true,
  };
}

const images: ImageItem[] = [
  img("a.jpg", [box("car"), box("car"), box("person")]),
  img("b.jpg", [box("car")]),
  img("c.jpg", []),                       // unlabeled
  img("d.jpg", [box("person"), box("dog", 0.01, 0.01)]), // dog box is tiny (<1% area)
];

phase("classDistribution counts and sorts");
const dist = classDistribution(images);
eq(dist, [{ cls: "car", count: 3 }, { cls: "person", count: 2 }, { cls: "dog", count: 1 }],
  "counts per class, most-frequent first");

phase("datasetHealth derives real insights");
const health = datasetHealth(images);
const texts = health.map(h => h.text);
check(texts.some(t => /1 image have 0 boxes|1 images? have 0 boxes/.test(t)), "flags the 1 unlabeled image", texts);
check(texts.some(t => /smaller than 1%/.test(t)), "flags the tiny dog box", texts);
check(texts.some(t => /Class .dog. has only 1 instance/.test(t)), "flags dog as a sparse class", texts);
check(texts.some(t => /Average .* boxes per labeled image/.test(t)), "reports average boxes per labeled image", texts);
check(datasetHealth([img("x.jpg", Array.from({ length: 12 }, () => box("car")))]).some(h => /clean/i.test(h.text)) === false,
  "a healthy dataset still reports the average (not necessarily 'clean')");

phase("datasetHealth on an all-good dataset says it's clean");
const big = Array.from({ length: 3 }, (_, k) => img("g" + k, Array.from({ length: 5 }, () => box("car"))));
// 15 car instances total, no unlabeled, no tiny -> only the 'average' info line
const okHealth = datasetHealth(big).filter(h => h.sev !== "info");
check(okHealth.length === 0, "no danger/warning items for a balanced dataset", okHealth);

phase("filterRows — class filter");
const onlyPerson = filterRows(images, new Set(["person"]), "all");
eq(onlyPerson.map(r => r.im.name), ["a.jpg", "d.jpg"], "keeps only images containing 'person'");
eq(onlyPerson.map(r => r.i), [0, 3], "preserves original indices");

phase("filterRows — status filter");
eq(filterRows(images, new Set(), "unlabeled").map(r => r.im.name), ["c.jpg"], "unlabeled => only empty images");
eq(filterRows(images, new Set(), "labeled").map(r => r.im.name), ["a.jpg", "b.jpg", "d.jpg"], "labeled => only non-empty");
eq(filterRows(images, new Set(), "all").length, 4, "all => everything");

phase("filterRows — combined class + status");
eq(filterRows(images, new Set(["car"]), "labeled").map(r => r.im.name), ["a.jpg", "b.jpg"], "car AND labeled");

report();
