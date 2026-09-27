# LabelStudio — Advanced Image Labeling Tool

A keyboard-first desktop tool for drawing bounding boxes, auto-labeling with YOLO, and exporting clean datasets for training. Built with **Electron + React + TypeScript + Vite**.

Ported from the original Python/PyQt6 tool (`main (2).py`) with the same feature surface plus a redesigned UI.

## Features

- Multi-project management (recent projects, project metadata stored beside images as `.labeler_project.json`).
  Each project card is named after its dataset and split rather than its folder
  (`…/helmet-merged-v4/train/images` → **helmet-merged-v4 · train**), shows where
  it lives, how many images are labelled and reviewed, and its classes; search
  matches names, paths and classes, and folders with no images of their own sink
  to the end with a hint. The labelled count is exact once a project has been
  opened and every image read (`src/lib/projects.ts`, `tests/phase9-projects.ts`).
- Annotate canvas: pointer / box tool, draw, move, resize (8 handles), context menu, multi-class
- File list with search + filter (labeled / unlabeled / reviewed / not reviewed)
- Review progress: images you have gone past are marked, and a folder reopens where you stopped
- Dataset overview with KPIs and per-class distribution
- Train / Val / Test split exporter with `dataset.yaml`
- **Annotation IO** — full TS port of the original Python AnnotationIO:
  - YOLO (one `.txt` per image, normalized)
  - Pascal VOC (one `.xml` per image)
  - COCO (single `coco_dataset.json`)
  - CSV (one `.csv` per image)
- Auto-label via YOLO (Ultralytics) — shells out to a bundled Python script
- 2 themes (Dark / Light), 3 density modes, EN + FA (Persian, with RTL) localization
- Command palette (`⌘/Ctrl + K`), full keyboard shortcuts

## Project layout

```
labelstudio/
├── electron/                 # Electron main + preload (Node-side)
│   ├── main.ts               # window, IPC handlers, file dialogs
│   ├── preload.ts            # contextBridge → window.api
│   ├── ipc-types.ts          # shared IPC types
│   ├── annotation-io.ts      # YOLO/COCO/VOC/CSV (TS port of Python)
│   ├── dataset-split.ts      # train/val/test split + dataset.yaml
│   ├── progress.ts           # review progress file (.labeler_progress.json)
│   └── image-dims.ts         # header-only image dimension reader
├── scripts/
│   └── yolo_infer.py         # invoked by main process for inference
├── src/                      # React + TS renderer
│   ├── App.tsx
│   ├── main.tsx
│   ├── data.ts               # sample / fallback data
│   ├── i18n.ts               # EN/FA strings
│   ├── ipc.ts                # typed wrapper around window.api
│   ├── types.ts
│   ├── electron-api.d.ts     # global window.api typing
│   ├── styles.css            # design tokens + components
│   └── components/
│       ├── Icon.tsx
│       ├── ui.tsx            # Switch, Slider, Pill, Tip, ...
│       ├── Canvas.tsx        # the labeling canvas
│       ├── Annotate.tsx      # FileList, ToolRail, ChipBar, Inspector
│       ├── Tabs.tsx          # Dataset / Train / Deploy routes
│       ├── Modals.tsx        # palette, auto-label, settings, ...
│       └── Onboarding.tsx    # onboarding + project picker
├── models/                   # drop your yolov8n.pt etc. here (optional)
├── index.html
├── vite.config.ts
├── tsconfig.json (+ .app/.node/.electron)
├── package.json
└── README.md
```

### Build output

All generated artefacts live under a single `build/` folder — nothing is dropped at the project root:

```
build/
├── renderer/    # Vite build: index.html + bundled JS/CSS/assets
├── main/        # Electron main process + preload (main.js, preload.mjs)
└── release/     # electron-builder installers (NSIS, etc.)
```

`build/` is in `.gitignore`. Wipe it with `rm -rf build` to do a clean rebuild.

## Setup

Requires **Node.js 20+** and **npm**.

```bash
# 1. install dependencies
npm install

# 2. dev — launches Electron + Vite dev server with HMR
npm run dev

# 3. typecheck
npm run typecheck

# 4. build a Windows installer (NSIS)
npm run electron:build:win
# Output goes to ./build/release/
```

The first `npm install` will download Electron (~120 MB).

## Auto-label setup (optional)

Auto-label uses a Python sidecar so it can leverage the same Ultralytics stack as the original app.

1. Install Python 3.10+ on the same machine.
2. Install Ultralytics:

   ```bash
   pip install ultralytics torch
   ```

3. Drop a YOLO model file into a folder named `models/` next to the app — for example:
   - `models/yolov8n.pt`  *(fast)*
   - `models/yolo11n.pt`  *(YOLO11 nano)*
   - or any other `.pt` weights file.

   The app searches in this order:
   1. `<userData>/models/`
   2. `<cwd>/models/`
   3. `<exe dir>/models/`

Without Python or a model, the rest of the app still works — you just won't be able to auto-label.

## Licensing (free now, lockable later)

The app ships with a built-in license gate that is **off by default** — today the
app is completely free. The infrastructure is in place so that later you can flip a
single switch on your server and every installed copy will require a license the
next time its machine is online.

### How it works

- A one-time **Ed25519 keypair**. The **private** key lives only on your server
  (`server/keys/private.pem`, git-ignored). The **public** key is embedded in the
  app (`electron/license/config.ts`).
- On startup the app reads a cached, *signed* **policy** and renders immediately.
  When the machine has internet it fetches a fresh signed policy from your server
  (`GET /api/license/policy`).
  - `enforce: false` → app is free (today's behaviour).
  - `enforce: true` + no valid license → the app shows the **activation screen**.
- A **license key** is a signed token bound to a device (or `*` for any device).
  The app verifies it **offline** with the embedded public key, so activation works
  without a round-trip and can't be forged without your private key.

Because the policy and licenses are signed, a user cannot fake `enforce:false` or a
license. (Electron ships JS source, so a determined attacker can still patch the
gate out — for real revenue protection later, add a server-validated feature and
ASAR integrity. The signing scheme here stops casual tampering.)

### Going from free → paid (months later)

1. Edit `server/policy.json` (or `POST /admin/enforce`) and set `"enforce": true`.
2. That's it. Each app locks the next time its machine reaches the server.
3. Users click **Buy / register a license**, you collect their **Device ID** (shown
   on the lock screen), and issue them a key:
   ```bash
   node server/sign-license.mjs --machine <DEVICE_ID> --plan pro --name "Acme" --days 365
   ```
   A `--machine "*"` key works on any device.

### Server setup

```bash
# 1. one-time: generate the keypair, then paste the printed public key
#    into electron/license/config.ts → publicKeyPem
npm run license:keygen

# 2. set serverUrl + purchaseUrl in electron/license/config.ts

# 3. run the reference server (put it behind HTTPS for production)
ADMIN_TOKEN=yoursecret npm run license:server
#   GET  /api/license/policy   ← the app polls this
#   GET  /admin                ← status page
#   POST /admin/enforce        ← the on/off switch (x-admin-token header)
```

The license logic is covered by `tests/license.ts` (`npm test`): free-by-default,
remote lock, offline persistence, signed activation, and rejection of forged /
wrong-machine / expired / rolled-back inputs.

## Annotation formats

The renderer always works with normalized 0..1 coordinates internally. At the IO boundary (when reading/writing files), `electron/annotation-io.ts` converts to/from pixel coordinates and the on-disk schema for the chosen format.

| Format | File layout |
| --- | --- |
| **YOLO** | `<name>.txt` per image, lines `class_id cx cy w h` (normalized) |
| **YOLO OBB** | `<name>.txt` per image, lines `class_id x1 y1 x2 y2 x3 y3 x4 y4` (normalized corners) |
| **Pascal VOC** | `<name>.xml` per image |
| **COCO** | single `coco_dataset.json` in the output dir |
| **CSV** | `<name>.csv` per image |

The output directory is configurable in **Settings → Output directory**. Empty means "same folder as the image."

## Review progress

Going through a large folder one image at a time — checking labels someone else
made, say — takes more than one sitting. The file list keeps track:

| Mark | Meaning |
| --- | --- |
| green tick (top) | the image has labels |
| purple eye (bottom) | you looked at the image for at least 0.4 s and moved on to another |
| orange bookmark | where the previous session stopped |

Reopening the folder lands on the image you were on last, with a toast saying
how many of the folder's images are reviewed; the footer keeps that count too.
**Filter → Not reviewed** leaves only what is still to do. The image you land
on is not marked until you leave it, and the bookmark stays where the last
session ended while you work, so it always shows how far the review had got.
Images you fly past by holding an arrow key (under 0.4 s on screen each,
`MIN_LOOK_MS`) count as skipped, not reviewed.

The marks live in `.labeler_progress.json` beside the images (file names, so
they survive files being added or removed), not in `.labeler_project.json`,
which is also copied into the recent-projects list. It is written a second
after you stop moving, when you switch folders and when the app closes, by a
temp-file-and-rename so a crash cannot leave it half-written. Delete it to
start the review over. See `tests/phase8-progress.ts`.

## Oriented boxes (OBB)

**Settings → Oriented boxes → Rotatable boxes** turns on rotation. It is **off by
default** and changes nothing until enabled: existing projects keep the exact
axis-aligned behaviour they had.

With it on, a selected box grows a rotation knob above its top edge. Drag it to
turn the box (hold <kbd>Shift</kbd> to snap to 15°), or use the keyboard — see
the shortcut table. The angle also has a slider and a numeric field in the
inspector. Resizing a turned box pins the opposite corner and measures the drag
along the box's own axes, so a corner follows the pointer instead of sliding.

**Settings → Oriented boxes → Save as** picks what each save writes:

| Mode | Files written |
| --- | --- |
| **Both** (default) | `YOLO OBB` where labels normally live, **plus** the upright set beside it in a `…_hbb` folder |
| **YOLO OBB only** | just the rotated set |
| **Upright only** | just the project format — **the angle is discarded** |

"Both" is the default because the two sets train two different models from one
labelling pass: `yolo obb train` reads the OBB folder, and an ordinary
`yolo detect train` reads the upright one.

The app **reads back** whichever format can hold an angle, so reopening an image
never silently flattens a rotation. The one exception is "Upright only", and
that mode raises a warning dialog the first time a rotated box exists — with a
shortcut into Settings to change it.

A rotated box saved to a non-OBB format becomes the **upright rectangle around
it**, not its pre-rotation footprint. The plain YOLO reader also accepts
9-value lines, so an OBB dataset opened by a project still set to `YOLO` loads
its boxes instead of appearing unlabeled.

The angle is stored in radians about the box centre and lives in image-pixel
space — see the note at the top of `src/lib/obb.ts` for why that distinction
matters. It is never written to the file: like Ultralytics, the corners are the
storage and `cv2.minAreaRect` recovers the angle. Round-tripping is exact for
files this app wrote, because the corner ORDER identifies which side is the
width. See `tests/phase7-obb.ts`.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `V` | Pointer tool |
| `B` | Box tool |
| `N` / `P` | Next / Previous image |
| `→` `↓` / `←` `↑` | Next / Previous image *(Annotate tab)* |
| `Del` / `Backspace` | Delete selected box |
| `Esc` | Deselect |
| `1`–`9` | Set active class |
| `Ctrl/⌘ + S` | Save current image |
| `Ctrl/⌘ + K` | Command palette |
| `Ctrl/⌘ + +` / `-` / `0` | Zoom in / out / reset |
| `Q` / `E` | Rotate selected box by −1° / +1° *(OBB mode)* |
| `A` / `D` | Rotate selected box by −5° / +5° *(OBB mode)* |
| `R` | Reset the selected box to upright *(OBB mode)* |

The rotation keys are bound only while OBB mode is on, so `A` and `D` stay free
otherwise. They match the keys the PyQt annotator this tool grew out of used.

## Notes on the conversion

- The original Python tool's `AnnotationIO`, `DatasetSplitter`, and `ImageDimCache` are ported faithfully to TypeScript (Node side).
- Undo/Redo is currently linear within a single image session (delete-box undo via the "Undo" button on the toast). The full Command-pattern stack from the Python version is intentionally simplified for this rewrite — it can be added back if you want full multi-step undo.
- The system analysis panel reads real OS info via `os.totalmem()` etc. and probes CUDA via `nvidia-smi -L`. The rest of the gauges are still illustrative; replace with `systeminformation` package when you want true live metrics.

## Sample images

The app ships **without** bundled sample photos — it starts empty and you load a
real image folder from the onboarding / project picker (see `src/data.ts`). When an
image fails to load, an inline SVG placeholder is rendered (`placeholder()` in
`src/data.ts`); there are **no runtime network calls** for images.

## Legacy files

The old prototype files (`LabelStudio.html`, `*.jsx`, `styles.css`) are kept at the project root for reference. The CSS was copied as-is into `src/styles.css`. You can safely delete `LabelStudio.html` and the `.jsx` files once you've verified the TS build works.
