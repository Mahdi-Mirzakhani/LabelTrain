"""
dedup_scan.py — find duplicate and look-alike images; invoked by Electron main.

Reads a JSON payload from stdin:
  { "images": ["..."], "cache": "<dir>", "model": "resnet50"|"dinov2"|"none",
    "align": false, "device": "auto"|"cuda"|"cpu", "maxHam": 12, "minCos": 0.85 }

Writes one JSON object to stdout:
  { "items": [ {"path", "width", "height", "bytes", "error"?} ],
    "pairs": [ [a, b, exact, ham, cos, mirrored, aligned] ],
    "model": "...", "deep": true|false, "deepError": null|"...", "align": true|false }

Every pair of images that is close by ANY measure is listed once, with all its
measures, so the app can regroup instantly as the user moves its sliders:
  exact     1 when the files are byte-identical (BLAKE2 of the contents)
  ham       Hamming distance of the 64-bit DCT perceptual hashes, 0..64 — the
            smaller of straight and mirrored, so a flipped copy counts
  cos       cosine similarity of the chosen model's features, -1 without one
  mirrored  1 when the mirrored hash was the closer one
  aligned   1 when ORB keypoints + a RANSAC homography line one image up with
            the other and the overlap matches pixel for pixel — the same photo
            cropped, shifted, scaled or turned (only with "align")
A pair is listed when exact, ham <= maxHam, cos >= minCos, or aligned.

Models (FP32 — FP16 has produced all-NaN batches on some consumer GPUs):
  resnet50   torchvision ResNet50, ImageNet. Fast; good at consecutive video frames.
  dinov2     DINOv2 ViT-B/14 through timm, self-supervised; better at telling a
             changed copy (cropped, zoomed, recoloured) from a different photo.
             ~330 MB from Hugging Face the first time.
  (ResNet152 was tried and dropped: on real duplicates it separated copies from
  different photos worse than ResNet50.)
Alignment checks each image against its nearest neighbours by the model's
features: on a helmet dataset it confirmed all 14 true copies among 31 known
duplicates while lining up 0-1 of ~10,000 other neighbour pairs.

Uniform borders (letterbox bars) are cropped before hashing. Hashes, each
model's features and alignment verdicts are cached in <cache>, keyed by path,
size and mtime, so a rescan reads only new or changed files.

stderr carries `@@progress <phase> <done> <total>` (phase load | read | compare
| align) and `@@info <key> <value>` lines; anything else is diagnostics.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import traceback

N_HASH = 32          # the perceptual hash is taken from a 32x32 DCT ...
N_KEEP = 8           # ... keeping its 8x8 lowest frequencies
MODELS = {
    "resnet50": {"lib": "torchvision", "arch": "resnet50", "weights": "ResNet50_Weights", "tag": "IMAGENET1K_V1"},
    "dinov2": {"lib": "timm", "name": "vit_base_patch14_dinov2.lvd142m"},
}
ALIGN_K = 3              # neighbours per image the alignment looks at
ALIGN_FLOOR = {"resnet50": 0.75, "dinov2": 0.45}   # neighbours less similar than this are not tried


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    sys.exit(code)


def progress(phase: str, done: int, total: int) -> None:
    print(f"@@progress {phase} {done} {total}", file=sys.stderr, flush=True)


def info(key: str, value) -> None:
    print(f"@@info {key} {value}", file=sys.stderr, flush=True)


def dct_matrix(n):
    import numpy as np
    k = np.arange(n)
    m = np.cos(np.pi * (2 * k[None, :] + 1) * k[:, None] / (2 * n)) * np.sqrt(2 / n)
    m[0] /= np.sqrt(2)
    return m


def trim_borders(im):
    """Crop bars of one flat colour (letterbox, padding); keep the image when the
    'content' would be under 30% of it — a plain background is not a bar."""
    from PIL import ImageChops
    small = im.convert("L")
    corner = small.getpixel((0, 0))
    diff = ImageChops.difference(small, small.point(lambda _: corner)).point(lambda v: 255 if v > 12 else 0)
    box = diff.getbbox()
    if not box:
        return im
    w, h = im.size
    if (box[2] - box[0]) * (box[3] - box[1]) < 0.3 * w * h:
        return im
    return im.crop(box)


def phash_bits(gray, dct):
    """64-bit perceptual hash and the hash of the mirrored image, from one DCT:
    flipping the image left-right negates the odd horizontal frequencies."""
    import numpy as np
    c = dct @ gray @ dct.T
    low = c[:N_KEEP, :N_KEEP]
    med = np.median(low.flatten()[1:])
    flip = np.where(np.arange(N_KEEP) % 2 == 1, -1.0, 1.0)[None, :]
    lowm = low * flip
    medm = np.median(lowm.flatten()[1:])
    weights = (1 << np.arange(64, dtype=np.uint64)).reshape(N_KEEP, N_KEEP)
    h = int(((low > med).astype(np.uint64) * weights).sum())
    hm = int(((lowm > medm).astype(np.uint64) * weights).sum())
    return h, hm


def popcount64(x):
    import numpy as np
    if hasattr(np, "bitwise_count"):
        return np.bitwise_count(x)
    x = x - ((x >> np.uint64(1)) & np.uint64(0x5555555555555555))
    x = (x & np.uint64(0x3333333333333333)) + ((x >> np.uint64(2)) & np.uint64(0x3333333333333333))
    x = (x + (x >> np.uint64(4))) & np.uint64(0x0F0F0F0F0F0F0F0F)
    return (x * np.uint64(0x0101010101010101)) >> np.uint64(56)


class Features:
    """Pooled image features of one model, L2-normalised."""

    def __init__(self, model, device):
        import torch
        self.torch = torch
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cuda" and not torch.cuda.is_available():
            device = "cpu"
        self.device = torch.device(device)
        spec = MODELS[model]
        if spec["lib"] == "torchvision":
            import torchvision
            wts = getattr(getattr(torchvision.models, spec["weights"]), spec["tag"])
            net = getattr(torchvision.models, spec["arch"])(weights=wts)
            self.net = torch.nn.Sequential(*list(net.children())[:-1])
        else:
            try:
                import timm
            except ImportError as exc:
                raise RuntimeError("DINOv2 needs timm: pip install timm") from exc
            self.net = timm.create_model(spec["name"], pretrained=True, num_classes=0, img_size=224)
        self.net = self.net.eval().to(self.device)
        self.mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
        self.std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)

    def tensor(self, im):
        import numpy as np
        a = np.asarray(im.convert("RGB").resize((224, 224)), dtype=np.float32) / 255.0
        t = self.torch.from_numpy(a).permute(2, 0, 1)
        return (t - self.mean) / self.std

    def __call__(self, tensors):
        import numpy as np
        with self.torch.no_grad():
            f = self.net(self.torch.stack(tensors).to(self.device)).flatten(1)
            f = self.torch.nn.functional.normalize(f, dim=1).cpu().numpy()
        return np.where(np.isfinite(f), f, 0).astype(np.float16)


class Aligner:
    """Is B the same photo as A, cropped, shifted, scaled or turned? ORB
    keypoints, a RANSAC homography, then the overlap compared pixel for pixel
    after normalising brightness and contrast: a copy lines up everywhere, a
    different frame of the same scene leaves a blob where people moved."""

    def __init__(self, paths):
        import cv2
        from functools import lru_cache
        self.cv2 = cv2
        self.orb = cv2.ORB_create(nfeatures=1000)
        self.bf = cv2.BFMatcher(cv2.NORM_HAMMING)
        self.paths = paths
        self.load = lru_cache(maxsize=3000)(self._load)

    def _load(self, i):
        import numpy as np
        from PIL import Image, ImageOps
        with Image.open(self.paths[i]) as im0:
            im = ImageOps.exif_transpose(im0).convert("L")
        im.thumbnail((400, 400))
        g = np.asarray(im)
        kp, des = self.orb.detectAndCompute(g, None)
        pts = np.float32([k.pt for k in kp]).reshape(-1, 2) if kp else np.zeros((0, 2), np.float32)
        return g, pts, des

    def __call__(self, a, b):
        import numpy as np
        cv2 = self.cv2
        ga, pa, da = self.load(a)
        gb, pb, db = self.load(b)
        if da is None or db is None or len(da) < 20 or len(db) < 20:
            return 0.0
        good = [m for m, n in (p for p in self.bf.knnMatch(da, db, k=2) if len(p) == 2) if m.distance < 0.75 * n.distance]
        if len(good) < 15:
            return 0.0
        src = pa[[m.queryIdx for m in good]].reshape(-1, 1, 2)
        dst = pb[[m.trainIdx for m in good]].reshape(-1, 1, 2)
        H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 4.0)
        if H is None or mask is None or int(mask.sum()) < 15:
            return 0.0
        warped = cv2.warpPerspective(ga, H, (gb.shape[1], gb.shape[0]))
        cover = cv2.warpPerspective(np.full_like(ga, 255), H, (gb.shape[1], gb.shape[0])) > 0
        cover = cv2.erode(cover.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        if cover.mean() < 0.25:
            return 0.0
        x = warped[cover].astype(np.float32)
        y = gb[cover].astype(np.float32)
        x = (x - x.mean()) / (x.std() + 1e-6)
        y = (y - y.mean()) / (y.std() + 1e-6)
        return float((x * y).mean())    # normalised cross-correlation of the overlap, -1..1


def load_npz(path):
    import numpy as np
    try:
        z = np.load(path, allow_pickle=False)
        return {k: z[k] for k in z.files}
    except Exception:
        return None


def save_npz(path, **arrays):
    import numpy as np
    tmp = path + ".tmp.npz"
    np.savez(tmp, **arrays)
    os.replace(tmp, path)


def main() -> None:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    raw = sys.stdin.read()
    if not raw.strip():
        die("dedup_scan.py: no JSON payload on stdin")
    req = json.loads(raw)
    paths = req.get("images") or []
    cache_dir = req.get("cache") or ""
    model = req.get("model") or ("resnet50" if req.get("deep", True) else "none")
    want_align = bool(req.get("align", False))
    max_ham = int(req.get("maxHam", 12))
    min_cos = float(req.get("minCos", 0.85))
    if not paths:
        die("dedup_scan.py: no images")
    if model != "none" and model not in MODELS:
        die(f"dedup_scan.py: unknown model {model}")

    try:
        import numpy as np
        from PIL import Image, ImageOps
    except ImportError as exc:
        die(f"dedup_scan.py needs Pillow and numpy: pip install pillow numpy\n({exc})", code=2)

    # --- the model first: a failure (no torch, no network for DINOv2) is reported, not fatal
    feats, deep_error = None, None
    info("model", model)
    if model != "none":
        progress("load", 0, 1)
        try:
            feats = Features(model, req.get("device") or "auto")
            info("device", feats.device.type)
        except Exception as exc:
            deep_error = f"{type(exc).__name__}: {exc}"
        progress("load", 1, 1)

    # --- caches: hashes, features of this model, alignment verdicts
    n = len(paths)
    key_of = []
    for p in paths:
        try:
            st = os.stat(p)
            key_of.append(f"{p}|{st.st_size}|{st.st_mtime_ns}")
        except OSError:
            key_of.append(f"{p}|missing")
    base = ""
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        tag = hashlib.md5("\n".join(sorted({os.path.dirname(p) for p in paths})).encode("utf-8")).hexdigest()[:16]
        base = os.path.join(cache_dir, f"dedup-{tag}")
    hc = load_npz(base + ".npz") if base else None
    fc = load_npz(f"{base}-{model}.npz") if base and feats else None
    if fc is None and hc is not None and feats and model == "resnet50" and "emb" in hc:
        fc = {"keys": hc["keys"][hc["has_emb"]], "emb": hc["emb"][hc["has_emb"]]}   # the first version kept them together
    hidx = {k: i for i, k in enumerate(hc["keys"])} if hc is not None else {}
    fidx = {k: i for i, k in enumerate(fc["keys"])} if fc is not None else {}

    blake = [""] * n
    ph = np.zeros(n, np.uint64)
    phm = np.zeros(n, np.uint64)
    wh = np.zeros((n, 2), np.int32)
    size = np.zeros(n, np.int64)
    dim = None
    emb = None
    have = np.zeros(n, bool)
    have_emb = np.zeros(n, bool)
    for i, k in enumerate(key_of):
        j = hidx.get(k)
        if j is not None:
            blake[i] = str(hc["blake"][j])
            ph[i], phm[i] = hc["ph"][j], hc["phm"][j]
            wh[i] = hc["wh"][j]
            size[i] = hc["size"][j]
            have[i] = True
    if feats:
        if fc is not None and len(fidx):
            dim = fc["emb"].shape[1]
        emb_rows = {}
        for i, k in enumerate(key_of):
            j = fidx.get(k)
            if j is not None:
                emb_rows[i] = fc["emb"][j]
                have_emb[i] = True
    todo = [i for i in range(n) if not have[i] or (feats and not have_emb[i])]
    info("cached", n - len(todo))
    info("todo", len(todo))

    # --- read what is not cached
    dct = dct_matrix(N_HASH)
    errors = {}
    batch, batch_idx = [], []
    new_emb = {}

    def flush():
        if batch:
            f = feats(batch)
            for k2, i2 in enumerate(batch_idx):
                new_emb[i2] = f[k2]
            batch.clear()
            batch_idx.clear()

    progress("read", 0, len(todo))
    for done, i in enumerate(todo, 1):
        p = paths[i]
        try:
            if not have[i]:
                with open(p, "rb") as fh:
                    data = fh.read()
                blake[i] = hashlib.blake2b(data, digest_size=16).hexdigest()
                size[i] = len(data)
            with Image.open(p) as im0:
                im = ImageOps.exif_transpose(im0)
                im.load()
            wh[i] = im.size
            content = trim_borders(im)
            gray = np.asarray(content.convert("L").resize((N_HASH, N_HASH), Image.LANCZOS), dtype=np.float64)
            ph[i], phm[i] = phash_bits(gray, dct)
            have[i] = True
            if feats and not have_emb[i]:
                batch.append(feats.tensor(content))
                batch_idx.append(i)
                if len(batch) == 32:
                    flush()
        except Exception as exc:
            errors[i] = f"{type(exc).__name__}: {exc}"
        if done % 16 == 0 or done == len(todo):
            progress("read", done, len(todo))
    if feats:
        flush()
        if dim is None:
            dim = next(iter(new_emb.values())).shape[0] if new_emb else 1
        emb = np.zeros((n, dim), np.float16)
        for i, row in emb_rows.items():
            emb[i] = row
        for i, row in new_emb.items():
            emb[i] = row
            have_emb[i] = True

    ok = np.array([i not in errors for i in range(n)])
    if base:
        try:
            save_npz(base + ".npz", keys=np.array(key_of)[ok], blake=np.array(blake)[ok], ph=ph[ok], phm=phm[ok],
                     wh=wh[ok], size=size[ok])
            if feats:
                sel = ok & have_emb
                save_npz(f"{base}-{model}.npz", keys=np.array(key_of)[sel], emb=emb[sel])
        except Exception as exc:
            print(f"could not write the cache: {exc}", file=sys.stderr)

    # --- compare every image with every other
    pairs = {}
    by_hash = {}
    for i in range(n):
        if ok[i]:
            by_hash.setdefault(blake[i], []).append(i)
    for members in by_hash.values():
        for a_ in range(len(members)):
            for b_ in range(a_ + 1, len(members)):
                pairs[(members[a_], members[b_])] = 0

    chunk = 512       # three 512 x n uint64 matrices stay a few hundred MB on 15,000 images
    total_chunks = (n + chunk - 1) // chunk
    et = None
    neighbours = {}
    floor = ALIGN_FLOOR.get(model, 0.75)
    if feats:
        torch = feats.torch
        et = torch.from_numpy(emb.astype(np.float32)).to(feats.device)
        et[torch.from_numpy(~have_emb).to(feats.device)] = 0
    progress("compare", 0, total_chunks)
    for c, s in enumerate(range(0, n, chunk)):
        e = min(n, s + chunk)
        ham = popcount64(ph[s:e, None] ^ ph[None, :])
        hamm = popcount64(ph[s:e, None] ^ phm[None, :])
        close = np.minimum(ham, hamm) <= max_ham
        if feats:
            sims_t = et[s:e] @ et.T
            sims = sims_t.cpu().numpy()
            close |= sims >= min_cos
            if want_align:
                sims_t[torch.arange(e - s, device=feats.device), torch.arange(s, e, device=feats.device)] = -2  # not itself
                top = torch.topk(sims_t, k=min(ALIGN_K, n - 1), dim=1)
                for r in range(e - s):
                    for v, j in zip(top.values[r].tolist(), top.indices[r].tolist()):
                        if v >= floor:
                            neighbours[(min(s + r, j), max(s + r, j))] = v
        rows, cols = np.nonzero(close)
        for r, j in zip(rows, cols):
            i = s + int(r)
            j = int(j)
            if j > i and ok[i] and ok[j]:
                pairs.setdefault((i, j), 0)
        progress("compare", c + 1, total_chunks)

    # --- alignment of each image with its nearest neighbours
    aligned_ok = False
    if want_align:
        if not feats:
            deep_error = (deep_error or "") + " alignment needs a model's features to pick the neighbours"
        else:
            try:
                import cv2  # noqa: F401
                verdicts = {}
                vfile = f"{base}-{model}-align.json" if base else ""
                if vfile and os.path.exists(vfile):
                    try:
                        verdicts = json.load(open(vfile, encoding="utf-8"))
                    except Exception:
                        verdicts = {}
                aligner = Aligner(paths)
                todo_pairs = sorted(p for p in neighbours if ok[p[0]] and ok[p[1]])
                info("align_pairs", len(todo_pairs))
                progress("align", 0, len(todo_pairs))
                for k, (a, b) in enumerate(todo_pairs, 1):
                    vk = f"{key_of[a]}\n{key_of[b]}"
                    if vk not in verdicts:
                        try:
                            verdicts[vk] = round(aligner(a, b), 4)
                        except Exception:
                            verdicts[vk] = 0.0
                    if verdicts[vk] >= 0.9:
                        pairs[(a, b)] = 1
                    if k % 25 == 0 or k == len(todo_pairs):
                        progress("align", k, len(todo_pairs))
                if vfile:
                    live = {f"{key_of[a]}\n{key_of[b]}" for a, b in todo_pairs}
                    tmp = vfile + ".tmp"
                    json.dump({k: v for k, v in verdicts.items() if k in live}, open(tmp, "w", encoding="utf-8"))
                    os.replace(tmp, vfile)
                aligned_ok = True
            except ImportError:
                deep_error = (deep_error or "") + " alignment needs OpenCV: pip install opencv-python"

    out_pairs = []
    for (i, j), aligned in pairs.items():
        h1 = int(popcount64(np.array([ph[i] ^ ph[j]], np.uint64))[0])
        h2 = int(popcount64(np.array([ph[i] ^ phm[j]], np.uint64))[0])
        cos = float(emb[i].astype(np.float32) @ emb[j].astype(np.float32)) if feats and have_emb[i] and have_emb[j] else -1.0
        out_pairs.append([i, j, int(blake[i] == blake[j] and blake[i] != ""), min(h1, h2), round(cos, 4),
                          int(h2 < h1), int(aligned)])

    items = []
    for i, p in enumerate(paths):
        it = {"path": p, "width": int(wh[i][0]), "height": int(wh[i][1]), "bytes": int(size[i])}
        if i in errors:
            it["error"] = errors[i]
        items.append(it)
    json.dump({"items": items, "pairs": out_pairs, "model": model, "deep": bool(feats), "deepError": deep_error,
               "align": aligned_ok}, sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        die(f"unhandled exception: {exc}\n{traceback.format_exc()}", code=10)
