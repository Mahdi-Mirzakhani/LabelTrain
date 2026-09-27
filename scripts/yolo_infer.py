"""
yolo_infer.py — single-shot YOLO inference helper invoked by Electron main.

Reads a JSON payload from stdin:
  { "model": "...", "images": ["..."], "conf": 0.25, "iou": 0.45,
    "device": "cpu"|"cuda", "allowed": null|["person","car",...] }

Writes a JSON array to stdout:
  [ { "imagePath": "...", "width": W, "height": H,
      "detections": [{"cls","x1","y1","x2","y2","conf"}, ...] }, ... ]

`width`/`height` are the pixel dims of the frame the detections were computed
on (EXIF rotation already applied by the image loader), so the caller can
normalize the boxes without guessing.

Progress is streamed on stderr as lines of the form `@@progress <done> <total>`
so the Electron side can drive a progress bar; all other stderr output is
diagnostic text.

Exits with code 0 on success. Any setup/import/model-load failure exits with
a non-zero code and writes a human-readable message to stderr so the
Electron side can surface it.
"""
from __future__ import annotations
import json
import sys
import traceback


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    sys.exit(code)


def main() -> None:
    # The JSON payload arrives UTF-8 encoded. On Windows, Python < 3.15 decodes
    # piped stdio with the locale code page (cp1256 on Persian systems, cp1252
    # elsewhere) which mangles any non-ASCII path. Force UTF-8 on all three
    # streams; the Electron side also sets PYTHONUTF8=1 as a belt-and-braces.
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

    raw = sys.stdin.read()
    if not raw.strip():
        die("yolo_infer.py: no JSON payload on stdin (empty input)")
    try:
        req = json.loads(raw)
    except json.JSONDecodeError as exc:
        die(f"yolo_infer.py: invalid JSON on stdin: {exc}")

    try:
        from ultralytics import YOLO
    except ImportError:
        die(
            "ultralytics is not installed.\n"
            "Install it on the same Python the app launches:\n"
            "    pip install ultralytics torch\n"
            "Detected interpreter: " + sys.executable,
            code=2,
        )

    model_path = req.get("model")
    images = req.get("images") or []
    conf = float(req.get("conf", 0.25))
    iou = float(req.get("iou", 0.45))
    device = req.get("device") or "cpu"
    allowed = req.get("allowed")  # list[str] or None

    if not model_path:
        die("yolo_infer.py: no model path provided")
    if not images:
        die("yolo_infer.py: no images provided")

    try:
        model = YOLO(model_path)
    except Exception as exc:
        die(f"Failed to load YOLO model from {model_path}\n{exc}\n{traceback.format_exc()}", code=3)

    try:
        model.to(device)
    except Exception:
        # CUDA requested but unavailable — fall back to CPU silently.
        device = "cpu"
        try:
            model.to("cpu")
        except Exception as exc:
            die(f"Failed to move model to CPU: {exc}", code=3)

    names = getattr(model, "names", {}) or {}
    if isinstance(names, list):
        names = {i: v for i, v in enumerate(names)}

    total = len(images)
    out = []
    for done, img in enumerate(images, start=1):
        try:
            results = model.predict(
                source=img, conf=conf, iou=iou, device=device, verbose=False
            )
        except Exception as exc:
            out.append({"imagePath": img, "width": 0, "height": 0,
                        "detections": [], "error": str(exc)})
            print(f"@@progress {done} {total}", file=sys.stderr, flush=True)
            continue

        # orig_shape is (h, w) of the frame inference actually ran on — the
        # loader has already applied EXIF rotation, so these are the dims the
        # detections' pixel coords live in.
        width = height = 0
        dets = []
        for r in results:
            shape = getattr(r, "orig_shape", None)
            if shape and len(shape) >= 2:
                height, width = int(shape[0]), int(shape[1])
            if r.boxes is None:
                continue
            try:
                xyxy = r.boxes.xyxy.cpu().numpy()
                confs = r.boxes.conf.cpu().numpy()
                cls_ids = r.boxes.cls.cpu().numpy().astype(int)
            except Exception:
                continue
            for (x1, y1, x2, y2), c, cid in zip(xyxy, confs, cls_ids):
                cls_name = str(names.get(int(cid), f"class_{int(cid)}"))
                if allowed is not None and cls_name not in allowed:
                    continue
                dets.append(
                    {
                        "cls": cls_name,
                        "x1": int(x1),
                        "y1": int(y1),
                        "x2": int(x2),
                        "y2": int(y2),
                        "conf": float(c),
                    }
                )
        out.append({"imagePath": img, "width": width, "height": height,
                    "detections": dets})
        print(f"@@progress {done} {total}", file=sys.stderr, flush=True)

    json.dump(out, sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        die(f"unhandled exception: {exc}\n{traceback.format_exc()}", code=10)
