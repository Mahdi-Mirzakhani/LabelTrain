// Command-palette filtering — substring + subsequence ("fuzzy") match plus a
// keyword field. Extracted so the matcher is testable without React.

import type { CmdItem } from "../types";

/** True if every character of `q` appears in `text` in order (subsequence). */
export function fuzzyMatch(text: string, q: string): boolean {
  const s = q.toLowerCase();
  let i = 0;
  for (const ch of text.toLowerCase()) if (ch === s[i]) i++;
  return i === s.length;
}

/** Filter commands by label substring, label subsequence, or keyword hit. */
export function filterCommands(commands: CmdItem[], q: string): CmdItem[] {
  if (!q.trim()) return commands;
  const s = q.toLowerCase();
  return commands.filter(c =>
    c.label.toLowerCase().includes(s) ||
    fuzzyMatch(c.label, s) ||
    (c.kw || "").includes(s),
  );
}
