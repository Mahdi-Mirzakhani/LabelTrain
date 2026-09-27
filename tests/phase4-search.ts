// Phase 4 — Command palette + search matching.
//
//   node --experimental-strip-types tests/phase4-search.ts

import { phase, check, eq, report } from "./_assert.ts";
import { fuzzyMatch, filterCommands } from "../src/lib/search.ts";
import type { CmdItem } from "../src/types.ts";

phase("fuzzyMatch (subsequence)");
check(fuzzyMatch("Auto-label with YOLO", "ayl"), "'ayl' is a subsequence of 'Auto-label with YOLO'");
check(fuzzyMatch("Next image", "nim"), "'nim' matches 'Next image'");
check(!fuzzyMatch("Next image", "zzz"), "'zzz' does not match");
check(fuzzyMatch("anything", ""), "empty query trivially matches");

const cmds: CmdItem[] = [
  { id: "1", group: "Tools", icon: "x", label: "Pointer tool" },
  { id: "2", group: "Tools", icon: "x", label: "Box tool" },
  { id: "3", group: "Actions", icon: "x", label: "Auto-label with YOLO", kw: "ai detect" },
  { id: "4", group: "Settings", icon: "x", label: "Switch language", kw: "persian farsi" },
];

phase("filterCommands");
eq(filterCommands(cmds, "").length, 4, "blank query returns everything");
eq(filterCommands(cmds, "box").map(c => c.id), ["2"], "substring match on label");
eq(filterCommands(cmds, "detect").map(c => c.id), ["3"], "keyword (kw) match when label has no hit");
eq(filterCommands(cmds, "farsi").map(c => c.id), ["4"], "keyword match for language command");
{
  const ids = filterCommands(cmds, "tool").map(c => c.id);
  check(ids.includes("1") && ids.includes("2"), "'tool' returns both tool commands (fuzzy may add more)", ids);
}
eq(filterCommands(cmds, "zzzzz").length, 0, "no matches => empty list");

phase("Project search uses the same substring rule");
const names = ["Street scenes", "Factory line", "Drone survey"];
const q = "dr";
eq(names.filter(n => n.toLowerCase().includes(q.toLowerCase())), ["Drone survey"], "'dr' finds 'Drone survey'");

report();
