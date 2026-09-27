// Verify the spawn/stdin/stderr pipeline for the YOLO inference sidecar.
// Run: node --experimental-strip-types tests/autolabel.ts
//
// Does NOT require ultralytics to be installed — we're just verifying that
// the JSON payload reaches Python, error handling works, and the protocol
// is what the renderer expects.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "yolo_infer.py");

const pythonCmd = process.platform === "win32" ? "python" : "python3";

interface RunResult { stdout: string; stderr: string; code: number | null; }

async function runPython(payload: any): Promise<RunResult> {
  return await new Promise((resolve, reject) => {
    const proc = spawn(pythonCmd, [SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (b: Buffer) => stdout += b.toString());
    proc.stderr.on("data", (b: Buffer) => stderr += b.toString());
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ stdout, stderr, code }));
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";
let pass = 0, fail = 0;
const ok = (m: string) => { pass++; console.log(`${GREEN}✓${RESET} ${m}`); };
const bad = (m: string, detail?: any) => { fail++; console.log(`${RED}✗${RESET} ${m}`); if (detail !== undefined) console.log("  ", detail); };

console.log("== auto-label spawn/stdin test ==\n");

// 1) Empty stdin should fail clearly
{
  const r = await new Promise<RunResult>((resolve, reject) => {
    const proc = spawn(pythonCmd, [SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (b: Buffer) => stdout += b.toString());
    proc.stderr.on("data", (b: Buffer) => stderr += b.toString());
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ stdout, stderr, code }));
    proc.stdin.end();
  });
  if (r.code !== 0 && r.stderr.includes("empty input")) ok(`empty stdin → exit ${r.code}, clear error`);
  else bad("empty stdin", r);
}

// 2) Invalid JSON should fail clearly
{
  const proc = spawn(pythonCmd, [SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  proc.stdout.on("data", (b: Buffer) => stdout += b.toString());
  proc.stderr.on("data", (b: Buffer) => stderr += b.toString());
  const r = await new Promise<RunResult>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ stdout, stderr, code }));
    proc.stdin.write("not json");
    proc.stdin.end();
  });
  if (r.code !== 0 && r.stderr.includes("invalid JSON")) ok(`invalid JSON → exit ${r.code}, clear error`);
  else bad("invalid JSON", r);
}

// 3) No model field should fail
{
  const r = await runPython({ images: ["x.jpg"] });
  // Either it fails on missing ultralytics (code 2) or on missing model
  if (r.code !== 0 && (r.stderr.includes("ultralytics") || r.stderr.includes("no model"))) {
    ok(`missing model → exit ${r.code}: ${r.stderr.trim().split("\n")[0]}`);
  } else {
    bad("missing model field", r);
  }
}

// 4) Valid-shape payload — if ultralytics installed, this would try to load.
//    If not installed, we should get the helpful "pip install ultralytics" error.
{
  const r = await runPython({
    model: "nonexistent.pt",
    images: ["fake.jpg"],
    conf: 0.25, iou: 0.45, device: "cpu",
  });
  if (r.code !== 0) {
    if (r.stderr.includes("ultralytics is not installed")) {
      ok(`ultralytics missing → exit ${r.code}, install hint shown`);
      console.log(`  ${YELLOW}note:${RESET} install with → pip install ultralytics torch`);
    } else if (r.stderr.includes("Failed to load YOLO model")) {
      ok(`ultralytics installed, bad model → exit ${r.code}, model error shown`);
    } else {
      bad("unexpected failure", r);
    }
  } else {
    // ultralytics is installed AND the model loaded (probably won't happen with "nonexistent.pt")
    console.log("  unexpected success:", r.stdout.slice(0, 200));
  }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
