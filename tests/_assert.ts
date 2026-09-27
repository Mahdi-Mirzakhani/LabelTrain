// Tiny shared assertion harness for the phase test suites.
// Each phase file imports these, runs its checks, and calls report().

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", BOLD = "\x1b[1m", RESET = "\x1b[0m";

let pass = 0, fail = 0;

export function ok(msg: string): void { pass++; console.log(`  ${GREEN}✓${RESET} ${msg}`); }

export function bad(msg: string, detail?: unknown): void {
  fail++;
  console.log(`  ${RED}✗${RESET} ${msg}`);
  if (detail !== undefined) console.log("    " + JSON.stringify(detail));
}

export function check(cond: boolean, msg: string, detail?: unknown): void {
  if (cond) ok(msg); else bad(msg, detail);
}

export function eq(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) ok(msg);
  else bad(msg, { expected: expected, actual: actual });
}

export function phase(title: string): void {
  console.log(`\n${BOLD}${YELLOW}▶ ${title}${RESET}`);
}

export function report(): void {
  console.log(`\n${BOLD}${fail === 0 ? GREEN : RED}${pass} passed, ${fail} failed.${RESET}`);
  process.exit(fail === 0 ? 0 : 1);
}
