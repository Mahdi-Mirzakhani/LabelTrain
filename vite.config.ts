import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

// All build artefacts go under ./build/
//   build/renderer/   — Vite renderer output (html + js + css + assets)
//   build/main/       — Electron main process + preload
//   build/release/    — Final installer (from electron-builder)
//
// We let vite-plugin-electron choose the output format for main and preload
// (it knows what each side needs in modern Electron). We only override outDir.
export default defineConfig({
  // Pin the dev server to IPv4 loopback. Otherwise Vite may listen on
  // 127.0.0.1 while Electron resolves "localhost" to ::1 (IPv6) and gets
  // ERR_CONNECTION_REFUSED — a black window. An explicit 127.0.0.1 host
  // also stops a VPN from rewriting how "localhost" resolves.
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "build/main",
            emptyOutDir: false,
            sourcemap: "inline",
          },
        },
      },
      preload: {
        input: "electron/preload.ts",
        vite: {
          build: {
            outDir: "build/main",
            emptyOutDir: false,
            sourcemap: "inline",
            // Force CommonJS for preload — required so `require(...)` calls
            // (emitted by Rollup for native modules like 'electron') resolve.
            // ESM preload chokes with: "require is not defined in ES module scope".
            rollupOptions: {
              output: {
                entryFileNames: "preload.cjs",
                format: "cjs",
                inlineDynamicImports: true,
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  base: "./",
  build: {
    outDir: "build/renderer",
    emptyOutDir: true,
  },
});
