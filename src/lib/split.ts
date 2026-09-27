// Train/Val/Test ratio math — shared by the Split modal and the Train tab so
// the two stay in sync, and unit-testable on its own.

export interface Ratios { train: number; val: number; test: number; }

/**
 * Set one ratio to `v` and redistribute the remainder across the other two,
 * preserving their relative proportions. Result components are rounded to 2dp.
 */
export function rebalanceRatios(r: Ratios, key: keyof Ratios, v: number): Ratios {
  const others = (["train", "val", "test"] as const).filter(k => k !== key);
  const rest = 1 - v;
  const sum = r[others[0]] + r[others[1]] || 1;
  return {
    ...r,
    [key]: v,
    [others[0]]: +(rest * (r[others[0]] / sum)).toFixed(2),
    [others[1]]: +(rest * (r[others[1]] / sum)).toFixed(2),
  } as Ratios;
}

/** Whether the three ratios add up to 1 within tolerance. */
export function ratiosSumOk(r: Ratios, tol = 0.02): boolean {
  return Math.abs(r.train + r.val + r.test - 1) < tol;
}

/** How many items land in each split for a dataset of `n` images. */
export function splitCounts(n: number, r: Ratios): { train: number; val: number; test: number } {
  const train = Math.floor(n * r.train);
  const val = Math.floor(n * r.val);
  const test = Math.max(0, n - train - val);
  return { train, val, test };
}
