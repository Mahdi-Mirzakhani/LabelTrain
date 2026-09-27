// Phase 9 — project list: titles built from the path, path tails, relative time, search.
//
//   node --experimental-strip-types tests/phase9-projects.ts

import { phase, eq, report } from "./_assert.ts";
import { ago, matchesProject, pathTail, projectTitle } from "../src/lib/projects.ts";

phase("projectTitle names a folder by its dataset, not by 'images'");
{
  eq(projectTitle("images", "D:\\data\\helmet-merged-v4\\train\\images"), "helmet-merged-v4 · train", "dataset/split/images");
  eq(projectTitle("images", "D:\\data\\helmet-merged\\train\\images"), "helmet-merged · train", "another dataset, same split");
  eq(projectTitle("train", "D:\\data\\helmet-merged-v4\\train"), "helmet-merged-v4 · train", "the split folder itself");
  eq(projectTitle("train2017", "D:\\python\\detect-face\\train2017"), "detect-face · train2017", "numbered split");
  eq(projectTitle("val2017", "/home/u/coco/images/val2017"), "coco · val2017", "unix path; a generic parent is skipped");
  eq(projectTitle("33pol-img", "D:\\python\\detect-face\\33pol-img"), "33pol-img", "an ordinary folder keeps its name");
  eq(projectTitle("images", "D:\\shots\\images"), "shots", "dataset/images => dataset");
  eq(projectTitle("Site cameras", "D:\\data\\x\\train\\images"), "Site cameras", "a name the user gave is kept");
  eq(projectTitle("train", "D:\\train"), "train", "a split at the drive root has no dataset to add");
}

phase("pathTail keeps the last folders");
{
  eq(pathTail("D:\\python\\Helmet detection\\datasets\\helmet-merged-v4\\train\\images"), "…\\helmet-merged-v4\\train\\images", "windows");
  eq(pathTail("/a/b/c/d/e", 2), "…/d/e", "unix, custom depth");
  eq(pathTail("D:\\x\\y"), "D:\\x\\y", "short paths are left alone");
}

phase("ago speaks proper English and Persian");
{
  const now = 1_800_000_000_000;
  eq(ago(now - 30_000, false, now), "just now", "seconds");
  eq(ago(now - 5 * 60_000, false, now), "5 min ago", "minutes");
  eq(ago(now - 3_600_000, false, now), "1 hour ago", "one hour, singular");
  eq(ago(now - 3 * 3_600_000, false, now), "3 hours ago", "hours, plural");
  eq(ago(now - 86_400_000, false, now), "1 day ago", "one day, singular");
  eq(ago(now - 3 * 3_600_000, true, now), "3 ساعت پیش", "Persian hours");
  eq(ago(0, false, now), "—", "unknown");
}

phase("search matches the title, the path and the classes");
{
  const dir = "D:\\data\\helmet-merged-v4\\train\\images";
  eq(matchesProject("v4", "helmet-merged-v4 · train", dir, ["helmet", "head"]), true, "part of the title");
  eq(matchesProject("DATASETS", "x", "D:\\datasets\\x"), true, "part of the path, any case");
  eq(matchesProject("head", "x", "D:\\x", ["helmet", "head"]), true, "a class name");
  eq(matchesProject("coco", "helmet-merged-v4 · train", dir, ["helmet"]), false, "no match");
  eq(matchesProject("  ", "x", "D:\\x"), true, "blank query matches all");
}

report();
