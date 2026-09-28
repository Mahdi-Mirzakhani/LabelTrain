// Review progress — pure helpers, so the tests can run them without a window.
//
// An image counts as reviewed once the user has looked at it and moved on to
// another one; the image they are on is where the folder reopens. Both are
// file names, which survive files being added to or removed from the folder.

export interface Progress {
  reviewed: Set<string>;
  last: string | null;
}

/**
 * How long an image must stay on screen to count as looked at. Holding an
 * arrow key flies past images at the keyboard's repeat rate (~30 a second);
 * those were skipped, not reviewed.
 */
export const MIN_LOOK_MS = 400;

/**
 * File-list filters: the labelling status, the review status, and the audit's
 * review list — "toReview" is flagged and not yet looked at, "flagged" all of it.
 */
export type ListFilter = "all" | "labeled" | "unlabeled" | "reviewed" | "unreviewed" | "toReview" | "flagged";

/** Where to reopen a folder: the image the user was on last, else the first. */
export function resumeIndex(names: string[], last: string | null): number {
  if (!last) return 0;
  const i = names.indexOf(last);
  return i < 0 ? 0 : i;
}

/**
 * The user moved from `prev` to `cur`: `prev` is now reviewed and `cur` is the
 * place to resume. Returns `p` itself when nothing changed, so React skips the
 * re-render and nothing is written to disk.
 */
export function stepProgress(p: Progress, prev: string | null, cur: string): Progress {
  const mark = prev !== null && prev !== cur && !p.reviewed.has(prev);
  if (!mark && p.last === cur) return p;
  return {
    reviewed: mark ? new Set(p.reviewed).add(prev) : p.reviewed,
    last: cur,
  };
}

export function matchesFilter(filter: ListFilter, labeled: boolean, reviewed: boolean, flagged = false): boolean {
  switch (filter) {
    case "all": return true;
    case "labeled": return labeled;
    case "unlabeled": return !labeled;
    case "reviewed": return reviewed;
    case "unreviewed": return !reviewed;
    case "toReview": return flagged && !reviewed;
    case "flagged": return flagged;
  }
}

/** Filters that list the audit's images by urgency rather than in folder order. */
export const RANKED_FILTERS: ReadonlySet<ListFilter> = new Set(["toReview", "flagged"]);
