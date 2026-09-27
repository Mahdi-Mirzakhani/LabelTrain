// Real system probes — CPU, RAM, GPU (nvidia-smi), disk, runtime versions.

import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { statfs } from "node:fs/promises";
import type { SystemInfo } from "./ipc-types.ts";

const execFileP = promisify(execFile);

async function runCmd(cmd: string, args: string[], timeoutMs = 2500): Promise<string | null> {
  try {
    const { stdout } = await execFileP(cmd, args, { timeout: timeoutMs });
    return stdout;
  } catch {
    return null;
  }
}

async function probeGpu(): Promise<SystemInfo["gpu"]> {
  // nvidia-smi --query-gpu=name,memory.total,memory.used,driver_version,utilization.gpu --format=csv,noheader,nounits
  const out = await runCmd("nvidia-smi", [
    "--query-gpu=name,memory.total,memory.used,driver_version,utilization.gpu",
    "--format=csv,noheader,nounits",
  ]);
  if (!out) return null;
  const line = out.trim().split("\n")[0];
  if (!line) return null;
  const parts = line.split(",").map(s => s.trim());
  if (parts.length < 5) return null;
  const [name, totalStr, usedStr, driver, utilStr] = parts;
  const vramTotalMB = parseFloat(totalStr) || 0;
  const vramUsedMB = parseFloat(usedStr) || 0;
  const utilizationPct = parseFloat(utilStr) || 0;
  return { name, vramTotalMB, vramUsedMB, driver, utilizationPct };
}

async function probeDisk(): Promise<SystemInfo["disk"]> {
  try {
    // statfs works on the OS root or any path; pick the user's home as a proxy.
    const target = os.homedir() || "/";
    const s: any = await statfs(target);
    const totalGB = +(s.blocks * s.bsize / 1024 / 1024 / 1024).toFixed(1);
    const freeGB = +(s.bfree * s.bsize / 1024 / 1024 / 1024).toFixed(1);
    const usedPct = totalGB > 0 ? Math.round((1 - freeGB / totalGB) * 100) : 0;
    return { totalGB, freeGB, usedPct };
  } catch {
    return null;
  }
}

async function probePython(): Promise<{ python: string | null; ultralytics: string | null }> {
  const pyCmd = process.platform === "win32" ? "python" : "python3";
  const pyOut = await runCmd(pyCmd, ["--version"]);
  const python = pyOut ? pyOut.trim().replace(/^Python\s+/i, "") : null;

  let ultralytics: string | null = null;
  const uOut = await runCmd(pyCmd, ["-c", "import ultralytics, sys; sys.stdout.write(ultralytics.__version__)"]);
  if (uOut) ultralytics = uOut.trim() || null;
  return { python, ultralytics };
}

async function probePhysicalCores(threadCount: number): Promise<number> {
  if (process.platform === "win32") {
    // wmic is deprecated but still present on most Windows installs.
    // Try PowerShell first, then fall back to wmic.
    const ps = await runCmd("powershell", [
      "-NoProfile", "-Command",
      "(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum",
    ], 4000);
    if (ps) {
      const n = parseInt(ps.trim(), 10);
      if (n > 0) return n;
    }
    const wmic = await runCmd("wmic", ["cpu", "get", "NumberOfCores", "/value"]);
    if (wmic) {
      const m = wmic.match(/NumberOfCores=(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
  } else if (process.platform === "darwin") {
    const out = await runCmd("sysctl", ["-n", "hw.physicalcpu"]);
    if (out) {
      const n = parseInt(out.trim(), 10);
      if (n > 0) return n;
    }
  } else if (process.platform === "linux") {
    // Count unique "core id" entries in /proc/cpuinfo
    try {
      const txt = await (await import("node:fs/promises")).readFile("/proc/cpuinfo", "utf-8");
      const ids = new Set<string>();
      for (const line of txt.split("\n")) {
        const m = line.match(/^core id\s*:\s*(\d+)/);
        if (m) ids.add(m[1]);
      }
      if (ids.size > 0) return ids.size;
    } catch { /* ignore */ }
  }
  // Last-ditch heuristic
  return Math.max(1, Math.round(threadCount / 2));
}

async function getCpuInfo(): Promise<SystemInfo["cpu"]> {
  const cpus = os.cpus();
  const model = cpus[0]?.model?.trim().replace(/\s+/g, " ") || "Unknown CPU";
  const threads = cpus.length;
  const physicalCores = await probePhysicalCores(threads);
  const speedGHz = cpus[0]?.speed ? +(cpus[0].speed / 1000).toFixed(2) : 0;
  return { model, physicalCores, threads, speedGHz };
}

function getRamInfo(): SystemInfo["ram"] {
  const totalGB = +(os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  const freeGB = +(os.freemem() / 1024 / 1024 / 1024).toFixed(1);
  const usedPct = totalGB > 0 ? Math.round((1 - freeGB / totalGB) * 100) : 0;
  return { totalGB, freeGB, usedPct };
}

export async function collectSystemInfo(): Promise<SystemInfo> {
  const [cpu, gpu, disk, py] = await Promise.all([
    getCpuInfo(), probeGpu(), probeDisk(), probePython(),
  ]);
  const cudaAvailable = gpu !== null;
  return {
    platform: process.platform,
    arch: process.arch,
    cpu,
    ram: getRamInfo(),
    gpu,
    disk,
    cudaAvailable,
    versions: {
      node: process.versions.node,
      electron: process.versions.electron || "n/a",
      chrome: process.versions.chrome || "n/a",
      v8: process.versions.v8 || "n/a",
      python: py.python,
      ultralytics: py.ultralytics,
    },
  };
}
