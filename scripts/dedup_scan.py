"""
dedup_scan.py — find duplicate and look-alike images; invoked by Electron main.

Reads a JSON payload from stdin:
  { "images": ["..."], "cache": "<dir>", "deep": true, "device": "auto"|"cuda"|"cpu",
    "maxHam": 12, "minCos": 0.85 }

Writes one JSON object to stdout:
  { "items": [ {"path", "width", "height", "bytes", "error"?} ],
    "pairs": [ [a, b, exact, ham, cos, mirrored] ],
    "deep": true|false, "deepError": null|"..." }

Every pair of images that is close by EITHER measure is listed once, with both
measures, so the app can regroup instantly as the user moves its sliders:
  exact     1 when the files are byte-identical (BLAKE2 of the contents)
  ham       Hamming distance of the 64-bit DCT perceptual hashes, 0..64 — the
            smaller of straight and mirrored, so a flipped copy counts
  cos       cosine similarity of ResNet50 features, -1 when deep is off
  mirrored  1 when the mirrored hash was the closer one
A pair is listed when exact, ham <= maxHam, or cos >= minCos.

Before hashing, uniform borders (letterbox bars) are cropped, so a padded copy
matches its original. Per-image results are cached in <cache> keyed by path,
size and mtime, so a rescan only reads new or changed files.

Progress goes to stderr as `@@progress <phase> <done> <total>` with phase
read | compare. Other stderr lines are diagnostics. Needs Pillow and numpy;
the "deep" level also needs torch + torchvision (it is skipped, with the reason
in deepError, when they are missing).
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import traceback

N_HASH = 32          # the perceptual hash is taken from a 32x32 DCT ...
N_KEEP = 8           # ... keeping its 8x8 lowest frequencies
FEATURES = 2048


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    sys.exit(code)


def progress(phase: str, done: int, total: int) -> None:
    print(f"@@progress {phase} {done} {total}", file=sys.stderr, flush=True)


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


class Deep:
    """ResNet50 (ImageNet) pooled features, L2-normalised. FP32 on purpose:
    FP16 autocast has produced all-NaN batches on some consumer GPUs."""

    def __init__(self, device):
        import torch
        import torchvision
        self.torch = torch
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = torch.device(device if device != "cuda" or torch.cuda.is_available() else "cpu")
        wts = torchvision.models.ResNet50_Weights.IMAGENET1K_V1
        net = torchvision.models.resnet50(weights=wts).eval().to(self.device)
        self.body = torch.nn.Sequential(*list(net.children())[:-1])
        self.mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
        self.std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)

    def tensor(self, im):
        import numpy as np
        a = np.asarray(im.convert("RGB").resize((224, 224)), dtype=np.float32) / 255.0
        t = self.torch.from_numpy(a).permute(2, 0, 1)
        return (t - self.mean) / self.std

    def features(self, tensors):
        with self.torch.no_grad():
            f = self.body(self.torch.stack(tensors).to(self.device)).flatten(1)
            f = self.torch.nn.functional.normalize(f, dim=1)
            out = f.cpu().numpy()
        import numpy as np
        return np.where(np.isfinite(out), out, 0).astype(np.float16)


def load_cache(path):
    import numpy as np
    try:
        z = np.load(path, allow_pickle=False)
        keys = list(z["keys"])
        return {k: i for i, k in enumerate(keys)}, z
    except Exception:
        return {}, None


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
    want_deep = bool(req.get("deep", True))
    max_ham = int(req.get("maxHam", 12))
    min_cos = float(req.get("minCos", 0.85))
    if not paths:
        die("dedup_scan.py: no images")

    try:
        import numpy as np
        from PIL import Image, ImageOps
    except ImportError as exc:
        die(f"dedup_scan.py needs Pillow and numpy: pip install pillow numpy\n({exc})", code=2)

    deep, deep_error = None, None
    if want_deep:
        try:
            deep = Deep(req.get("device") or "auto")
        except Exception as exc:
            deep_error = f"{type(exc).__name__}: {exc}"

    # --- cache -------------------------------------------------------------
    key_of = []
    for p in paths:
        try:
            st = os.stat(p)
            key_of.append(f"{p}|{st.st_size}|{st.st_mtime_ns}")
        except OSError:
            key_of.append(f"{p}|missing")
    cache_file = ""
    cached, z = {}, None
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        tag = hashlib.md5("\n".join(sorted({os.path.dirname(p) for p in paths})).encode("utf-8")).hexdigest()[:16]
        cache_file = os.path.join(cache_dir, f"dedup-{tag}.npz")
        cached, z = load_cache(cache_file)

    n = len(paths)
    blake = [""] * n
    ph = np.zeros(n, np.uint64)
    phm = np.zeros(n, np.uint64)
    wh = np.zeros((n, 2), np.int32)
    size = np.zeros(n, np.int64)
    emb = np.zeros((n, FEATURES), np.float16) if deep else None
    have_emb = np.zeros(n, bool)
    errors = {}
    todo = []
    for i, k in enumerate(key_of):
        j = cached.get(k)
        if j is not None and z is not None:
            blake[i] = str(z["blake"][j])
            ph[i], phm[i] = z["ph"][j], z["phm"][j]
            wh[i] = z["wh"][j]
            size[i] = z["size"][j]
            if deep and "emb" in z.files and bool(z["has_emb"][j]):
                emb[i] = z["emb"][j]
                have_emb[i] = True
            else:
                todo.append(i) if deep else None
        else:
            todo.append(i)

    # --- read what is not cached --------------------------------------------
    dct = dct_matrix(N_HASH)
    batch, batch_idx = [], []

    def flush():
        if batch:
            f = deep.features(batch)
            for k2, i2 in enumerate(batch_idx):
                emb[i2] = f[k2]
                have_emb[i2] = True
            batch.clear()
            batch_idx.clear()

    for done, i in enumerate(todo, 1):
        p = paths[i]
        try:
            if not blake[i]:
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
            if deep:
                batch.append(deep.tensor(content))
                batch_idx.append(i)
                if len(batch) == 32:
                    flush()
        except Exception as exc:
            errors[i] = f"{type(exc).__name__}: {exc}"
        if done % 16 == 0 or done == len(todo):
            progress("read", done, len(todo))
    if deep:
        flush()

    if cache_file:
        ok = np.array([i not in errors for i in range(n)])
        arrays = dict(keys=np.array(key_of)[ok], blake=np.array(blake)[ok], ph=ph[ok], phm=phm[ok],
                      wh=wh[ok], size=size[ok])
        if deep:
            arrays.update(emb=emb[ok], has_emb=have_emb[ok])
        try:
            tmp = cache_file + ".tmp.npz"
            np.savez(tmp, **arrays)
            os.replace(tmp, cache_file)
        except Exception as exc:
            print(f"could not write the cache: {exc}", file=sys.stderr)

    # --- compare every image with every other --------------------------------
    valid = np.array([i not in errors for i in range(n)])
    pairs = {}
    groups = {}
    for i in range(n):
        if valid[i]:
            groups.setdefault(blake[i], []).append(i)
    for members in groups.values():
        for a_ in range(len(members)):
            for b_ in range(a_ + 1, len(members)):
                pairs[(members[a_], members[b_])] = True

    # 512 rows at a time: three 512 x n uint64 matrices stay a few hundred MB
    # even on a 15,000-image set.
    chunk = 512
    total_chunks = (n + chunk - 1) // chunk
    et = None
    if deep:
        torch = deep.torch
        et = torch.from_numpy(emb.astype(np.float32)).to(deep.device)
        et[torch.from_numpy(~have_emb).to(deep.device)] = 0
    for c, s in enumerate(range(0, n, chunk)):
        e = min(n, s + chunk)
        ham = popcount64(ph[s:e, None] ^ ph[None, :])
        hamm = popcount64(ph[s:e, None] ^ phm[None, :])
        close = np.minimum(ham, hamm) <= max_ham
        if deep:
            sims = (et[s:e] @ et.T).cpu().numpy()
            close |= sims >= min_cos
        rows, cols = np.nonzero(close)
        for r, j in zip(rows, cols):
            i = s + int(r)
            j = int(j)
            if j > i and valid[i] and valid[j]:
                pairs[(i, j)] = True
        progress("compare", c + 1, total_chunks)

    out_pairs = []
    for (i, j) in pairs:
        h1 = int(popcount64(np.array([ph[i] ^ ph[j]], np.uint64))[0])
        h2 = int(popcount64(np.array([ph[i] ^ phm[j]], np.uint64))[0])
        cos = float((emb[i].astype(np.float32) @ emb[j].astype(np.float32))) if deep and have_emb[i] and have_emb[j] else -1.0
        out_pairs.append([i, j, int(blake[i] == blake[j] and blake[i] != ""), min(h1, h2), round(cos, 4), int(h2 < h1)])

    items = []
    for i, p in enumerate(paths):
        it = {"path": p, "width": int(wh[i][0]), "height": int(wh[i][1]), "bytes": int(size[i])}
        if i in errors:
            it["error"] = errors[i]
        items.append(it)
    json.dump({"items": items, "pairs": out_pairs, "deep": bool(deep), "deepError": deep_error}, sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        die(f"unhandled exception: {exc}\n{traceback.format_exc()}", code=10)
