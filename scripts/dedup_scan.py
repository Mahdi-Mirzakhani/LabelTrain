"""
dedup_scan.py — find duplicate and look-alike images; invoked by Electron main.

Reads a JSON payload from stdin:
  { "images": ["..."], "cache": "<dir>", "model": "resnet50"|"dinov2"|"thorough"|"none",
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
  mirrored  1 when the mirrored hash was the closer one, or the alignment
            lined one image up with the other's mirror image
  aligned   1 when the two line up pixel for pixel (see Aligner) — the same
            photo cropped, shifted, scaled, turned, mirrored, recoloured,
            padded, drawn on or put in a mosaic (only with "align")
A pair is listed when exact, ham <= maxHam, cos >= minCos, or aligned.

Models (FP32 — FP16 has produced all-NaN batches on some consumer GPUs):
  resnet50   torchvision ResNet50, ImageNet. Fast; good at consecutive video frames.
  dinov2     DINOv2 ViT-B/14 through timm, self-supervised; better at telling a
             changed copy (cropped, zoomed, recoloured) from a different photo.
             ~330 MB from Hugging Face the first time.
  thorough   DINOv2 for the similarity, plus Meta's SSCD copy detector
             (ResNeXt101, 178 MB the first time) on each image as is and turned
             90/180/270 to choose what to line up: each image's 10 nearest, and
             the 3 nearest of each turned version, down to similarity 0.15.
             Alignment always runs. Meant for a GPU.
  (ResNet152 was tried and dropped: on real duplicates it separated copies from
  different photos worse than ResNet50.)
Alignment checks each image against its nearest neighbours by the model's
features (3 of them; thorough: by SSCD as above, plus DINOv2's 3).

Measured on 400 edited copies of helmet-merged-v4 images (18 kinds of edit:
crops, turns, mirror, stretch, letterbox, reflect padding, colour, grey, blur
and noise, perspective, pasted boxes, mosaics ...) among 3,650 other v4 images,
counting the copies lined up pixel for pixel:
  hashes alone (no alignment)                     166 found by hash
  ResNet50 / DINOv2 + the aligner before this one 294 / 287 (never a mirrored copy)
  DINOv2 + this aligner                           355
  thorough                                        395 (all but 4 mosaics, 1 blurred copy)
SSCD puts the original among the 10 nearest of all 400 copies. The only other
pairs thorough lined up were copies too: mosaics holding the image, a padded
copy, a mirrored grey one, a collage. It took 17 min for the 4,058 images on a
GTX 1660 Ti and a 6-core i5 (reading ~8 images/s, 29,000 pairs at ~55/s).

Uniform borders (letterbox bars) are cropped before hashing. Hashes, each
model's features and alignment verdicts are cached in <cache>, keyed by path,
size and mtime, so a rescan reads only new or changed files.

stderr carries `@@progress <phase> <done> <total>` (phase load | download (MB)
| read | compare | align) and `@@info <key> <value>` lines; anything else is
diagnostics.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import traceback

N_HASH = 32          # the perceptual hash is taken from a 32x32 DCT ...
N_KEEP = 8           # ... keeping its 8x8 lowest frequencies
SSCD_URL = "https://dl.fbaipublicfiles.com/sscd-copy-detection/sscd_disc_large.torchscript.pt"
MODELS = {
    "resnet50": {"lib": "torchvision", "arch": "resnet50", "weights": "ResNet50_Weights", "tag": "IMAGENET1K_V1"},
    "dinov2": {"lib": "timm", "name": "vit_base_patch14_dinov2.lvd142m"},
    # Meta's copy detector (MIT licence), ResNeXt101: every image as is and turned 90/180/270
    "sscd": {"lib": "torchscript", "url": SSCD_URL, "size": 320, "turns": 4},
}
# "thorough": DINOv2's similarity for look-alikes, SSCD to pick what to line up
PLAN = {"resnet50": ["resnet50"], "dinov2": ["dinov2"], "thorough": ["dinov2", "sscd"]}
ALIGN_K = 3              # neighbours per image the alignment looks at
ALIGN_FLOOR = {"resnet50": 0.75, "dinov2": 0.45}   # neighbours less similar than this are not tried
SSCD_K, SSCD_TURN_K = 10, 3   # thorough: SSCD neighbours of each image, and of each of its turned versions
SSCD_FLOOR = 0.15        # ... at least this similar: a photo that is one tile of a mosaic scores ~0.2
ALIGN_VERSION = 2        # verdicts of an older aligner in the cache are not reused


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


def download(url, dest):
    """Fetch url to dest (through .part, so a broken download is not mistaken
    for the model), reporting `@@progress download <MB> <MB>`."""
    import urllib.request
    part = dest + ".part"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with urllib.request.urlopen(url, timeout=60) as r, open(part, "wb") as fh:
        total = int(r.headers.get("Content-Length") or 0) // 2**20
        done = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            fh.write(chunk)
            done += 1
            progress("download", done, max(total, done))
    os.replace(part, dest)


class Features:
    """Pooled image features of one model, L2-normalised; for a model with
    "turns", one row per turn of the image (0, 90, 180, 270 degrees)."""

    def __init__(self, model, device):
        import torch
        self.torch = torch
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cuda" and not torch.cuda.is_available():
            device = "cpu"
        self.device = torch.device(device)
        spec = MODELS[model]
        self.size = spec.get("size", 224)
        self.turns = spec.get("turns", 1)
        if spec["lib"] == "torchvision":
            import torchvision
            wts = getattr(getattr(torchvision.models, spec["weights"]), spec["tag"])
            net = getattr(torchvision.models, spec["arch"])(weights=wts)
            self.net = torch.nn.Sequential(*list(net.children())[:-1])
        elif spec["lib"] == "torchscript":
            path = os.path.join(torch.hub.get_dir(), "checkpoints", spec["url"].rsplit("/", 1)[1])
            if not os.path.exists(path):
                download(spec["url"], path)
            self.net = torch.jit.load(path, map_location=self.device)
        else:
            try:
                import timm
            except ImportError as exc:
                raise RuntimeError("DINOv2 needs timm: pip install timm") from exc
            self.net = timm.create_model(spec["name"], pretrained=True, num_classes=0, img_size=224)
        self.net = self.net.eval().to(self.device)
        self.mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
        self.std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)

    def tensors(self, im):
        """The image's input tensors, one per turn."""
        import numpy as np
        from PIL import Image
        small = im.convert("RGB").resize((self.size, self.size))
        views = [small, small.transpose(Image.ROTATE_90), small.transpose(Image.ROTATE_180),
                 small.transpose(Image.ROTATE_270)][:self.turns]
        out = []
        for v in views:
            t = self.torch.from_numpy(np.asarray(v, dtype=np.float32) / 255.0).permute(2, 0, 1)
            out.append((t - self.mean) / self.std)
        return out

    def __call__(self, tensors):
        """Features of whole images' tensors -> (images, turns * dim)."""
        import numpy as np
        with self.torch.no_grad():
            f = self.net(self.torch.stack(tensors).to(self.device)).flatten(1).float()
            f = self.torch.nn.functional.normalize(f, dim=1).cpu().numpy()
        f = np.where(np.isfinite(f), f, 0).astype(np.float16)
        return f.reshape(len(tensors) // self.turns, -1)


class Aligner:
    """Is B the same photo as A — cropped, shifted, scaled, turned, mirrored,
    stretched, recoloured, padded, drawn on, or one tile of a mosaic?

    ORB keypoints of A are matched to those of B and of B mirrored; a MAGSAC
    homography lines the two up. The overlap is then compared in the frame
    where the shared content is smaller (a crop is not judged against its own
    blurry enlargement), in 32 px cells, each after normalising its brightness
    and contrast and allowing 2 px of slack. A copy agrees almost everywhere.
    Another frame of the same video does not: the person who moved leaves a
    blob of cells that disagree. Cells flat in one picture only (a pasted box)
    are left out, and so are disagreeing cells on the edge of the overlap,
    twice over — where a crop or a mosaic tile ends, the other picture's
    neighbourhood begins.

    Tuned on 400 edited copies of helmet-merged-v4 images (18 kinds of edit)
    among 3,650 others: 395 found; of ~15,000 look-alike pairs it was handed,
    the only ones called the same photo were copies too (a mosaic holding the
    image, a padded or greyscale copy)."""

    SIZE = 512           # thumbnails, longest side
    CELL = 32
    SLACK = 2
    PEEL = 2

    def __init__(self, paths):
        import cv2
        from functools import lru_cache
        cv2.setNumThreads(1)                   # parallel over pairs, not inside OpenCV
        self.cv2 = cv2
        self.paths = paths
        self.gray = lru_cache(maxsize=64)(self._gray)
        self.feat = lru_cache(maxsize=int(os.environ.get("DEDUP_ALIGN_CACHE", 4000)))(self._feat)
        import threading
        self.local = threading.local()

    def tools(self):
        if not hasattr(self.local, "orb"):
            self.local.orb = self.cv2.ORB_create(nfeatures=2000, fastThreshold=12)
            self.local.bf = self.cv2.BFMatcher(self.cv2.NORM_HAMMING)
        return self.local.orb, self.local.bf

    def _gray(self, i):
        import numpy as np
        from PIL import Image, ImageOps
        for draft in (True, False):          # a few damaged JPEGs only open without draft mode
            try:
                with Image.open(self.paths[i]) as im:
                    if draft:
                        im.draft("L", (self.SIZE, self.SIZE))
                    im = ImageOps.exif_transpose(im).convert("L")
                    im.thumbnail((self.SIZE, self.SIZE), Image.BILINEAR)
                    return np.ascontiguousarray(np.asarray(im))
            except OSError:
                if not draft:
                    raise

    def _feat(self, i, mirror):
        import numpy as np
        g = self.gray(i)
        if mirror:
            g = np.ascontiguousarray(g[:, ::-1])
        kp, des = self.tools()[0].detectAndCompute(g, None)
        pts = np.float32([k.pt for k in kp]).reshape(-1, 2) if kp else np.zeros((0, 2), np.float32)
        return pts, des

    def homography(self, fa, fb):
        import numpy as np
        cv2 = self.cv2
        (pa, da), (pb, db) = fa, fb
        if da is None or db is None or len(da) < 8 or len(db) < 8:
            return None, 0
        good = [m for m, n in (p for p in self.tools()[1].knnMatch(da, db, k=2) if len(p) == 2)
                if m.distance < 0.8 * n.distance]
        if len(good) < 10:
            return None, 0
        H, mask = cv2.findHomography(pa[[m.queryIdx for m in good]], pb[[m.trainIdx for m in good]], cv2.USAC_MAGSAC, 4.0)
        if H is None or mask is None:
            return None, 0
        inliers = int(mask.sum())
        if inliers < 10 or abs(np.linalg.det(H[:2, :2])) < 1e-3:
            return None, inliers
        return H, inliers

    def same(self, ga, gb, H):
        """Pixel verdict on a lined-up pair."""
        import numpy as np
        cv2 = self.cv2
        if abs(np.linalg.det(H[:2, :2])) > 1.0:      # a is enlarged in b: judge in a's frame
            ref, mov, M = ga, gb, np.linalg.inv(H)
        else:
            ref, mov, M = gb, ga, H
        hr, wr = ref.shape
        scale2 = abs(np.linalg.det(M[:2, :2]))
        warped = cv2.warpPerspective(mov, M, (wr, hr), flags=cv2.INTER_AREA if scale2 < 1 else cv2.INTER_LINEAR)
        valid = cv2.warpPerspective(np.full(mov.shape, 255, np.uint8), M, (wr, hr)) > 127
        valid = cv2.erode(valid.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
        n_valid = int(valid.sum())
        cover = max(n_valid / (wr * hr), n_valid / max(1.0, mov.shape[0] * mov.shape[1] * scale2))
        if n_valid < 3000 or cover < 0.3:
            return False
        a = cv2.GaussianBlur(ref, (0, 0), 1.5).astype(np.float32)
        b = cv2.GaussianBlur(warped, (0, 0), 1.5).astype(np.float32)
        x, y = a[valid], b[valid]
        ncc = float((((x - x.mean()) / (x.std() + 1e-6)) * ((y - y.mean()) / (y.std() + 1e-6))).mean())
        if ncc < 0.6:
            return False
        c, s = self.CELL, self.SLACK
        gh, gw = hr // c, wr // c

        def cells(img):
            return img[:gh * c, :gw * c].reshape(gh, c, gw, c).swapaxes(1, 2).reshape(gh, gw, c * c)

        A = cells(a)
        inside = cells(valid.astype(np.float32)).mean(-1) >= 0.9
        da = A - A.mean(-1, keepdims=True)
        sa = np.sqrt((da * da).mean(-1))
        best = np.full(inside.shape, -1.0, np.float32)
        sb0 = None
        pad = np.pad(b, s, mode="edge")
        for dy in (-s, 0, s):
            for dx in (-s, 0, s):
                B = cells(pad[s + dy:s + dy + hr, s + dx:s + dx + wr])
                db = B - B.mean(-1, keepdims=True)
                sb = np.sqrt((db * db).mean(-1))
                if dy == 0 and dx == 0:
                    sb0 = sb
                best = np.maximum(best, (da * db).mean(-1) / (sa * sb + 1e-6))
        flat = (sa < 4) & (sb0 < 4)                         # flat in both: says nothing
        painted = inside & ~flat & (np.minimum(sa, sb0) < 2.5)   # flat in one only: painted over
        tested = inside & ~flat & ~painted
        agree = tested & (best >= 0.6)
        differ = tested & (best < 0.6)
        outside = ~inside
        for _ in range(self.PEEL):
            edge = differ & (cv2.dilate(outside.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0)
            if not edge.any():
                break
            differ &= ~edge
            outside |= edge
        n = int(agree.sum() + differ.sum())
        if n < 8 or agree.sum() < 0.85 * n:
            return False
        blob = 0
        if differ.any():
            _, _, stats, _ = cv2.connectedComponentsWithStats(differ.astype(np.uint8), connectivity=8)
            blob = int(stats[1:, cv2.CC_STAT_AREA].max())
        r = best[agree | differ]
        return blob <= 0.08 * n and float(np.median(r)) >= 0.965 and float((r >= 0.8).mean()) >= 0.85

    def __call__(self, a, b):
        """(same photo, b mirrored)."""
        import numpy as np
        fa = self.feat(a, False)
        for mirror in (False, True):
            H, _ = self.homography(fa, self.feat(b, mirror))
            if H is None:
                continue
            gb = self.gray(b)
            if self.same(self.gray(a), np.ascontiguousarray(gb[:, ::-1]) if mirror else gb, H):
                return True, mirror
        return False, False


def locality_order(n, pairs):
    """Images in breadth-first order over the pair graph, so that the two ends
    of a pair are usually close in it and a bounded feature cache still hits."""
    nbr = [[] for _ in range(n)]
    for a, b in pairs:
        nbr[a].append(b)
        nbr[b].append(a)
    pos, seen = {}, [False] * n
    for start in range(n):
        if seen[start] or not nbr[start]:
            continue
        seen[start] = True
        queue = [start]
        for v in queue:
            pos[v] = len(pos)
            for w in nbr[v]:
                if not seen[w]:
                    seen[w] = True
                    queue.append(w)
    return pos


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
    want_align = bool(req.get("align", False)) or model == "thorough"
    max_ham = int(req.get("maxHam", 12))
    min_cos = float(req.get("minCos", 0.85))
    if not paths:
        die("dedup_scan.py: no images")
    if model != "none" and model not in PLAN:
        die(f"dedup_scan.py: unknown model {model}")

    try:
        import numpy as np
        from PIL import Image, ImageOps
    except ImportError as exc:
        die(f"dedup_scan.py needs Pillow and numpy: pip install pillow numpy\n({exc})", code=2)

    # --- the models first: a failure (no torch, no network) is reported, not fatal.
    # Thorough without SSCD goes on as DINOv2; without DINOv2 it has no similarity to show.
    nets, deep_error = {}, None
    info("model", model)
    if model != "none":
        names = PLAN[model]
        progress("load", 0, len(names))
        for k, name in enumerate(names):
            try:
                nets[name] = Features(name, req.get("device") or "auto")
            except Exception as exc:
                deep_error = f"{name}: {type(exc).__name__}: {exc}"
                break
            progress("load", k + 1, len(names))
        progress("load", len(names), len(names))
        if names[0] not in nets:
            nets.clear()
        if nets:
            info("device", nets[names[0]].device.type)
    main_net = next(iter(nets), None)          # the model whose similarity the app shows
    used = model if model == "none" or len(nets) == len(PLAN[model]) else (main_net or "none")
    feats = nets.get(main_net)

    # --- caches: hashes, each model's features, alignment verdicts
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
    hidx = {k: i for i, k in enumerate(hc["keys"])} if hc is not None else {}

    blake = [""] * n
    ph = np.zeros(n, np.uint64)
    phm = np.zeros(n, np.uint64)
    wh = np.zeros((n, 2), np.int32)
    size = np.zeros(n, np.int64)
    have = np.zeros(n, bool)
    for i, k in enumerate(key_of):
        j = hidx.get(k)
        if j is not None:
            blake[i] = str(hc["blake"][j])
            ph[i], phm[i] = hc["ph"][j], hc["phm"][j]
            wh[i] = hc["wh"][j]
            size[i] = hc["size"][j]
            have[i] = True
    rows = {}                                  # model -> {image: feature row}
    have_emb = {}
    for name in nets:
        fc = load_npz(f"{base}-{name}.npz") if base else None
        if fc is None and hc is not None and name == "resnet50" and "emb" in hc:
            fc = {"keys": hc["keys"][hc["has_emb"]], "emb": hc["emb"][hc["has_emb"]]}   # the first version kept them together
        fidx = {k: i for i, k in enumerate(fc["keys"])} if fc is not None else {}
        rows[name] = {}
        have_emb[name] = np.zeros(n, bool)
        for i, k in enumerate(key_of):
            j = fidx.get(k)
            if j is not None:
                rows[name][i] = fc["emb"][j]
                have_emb[name][i] = True
    todo = [i for i in range(n) if not have[i] or any(not h[i] for h in have_emb.values())]
    info("cached", n - len(todo))
    info("todo", len(todo))

    # --- read what is not cached
    dct = dct_matrix(N_HASH)
    errors = {}
    batch = {name: ([], []) for name in nets}   # model -> (tensors, images)

    def flush(name):
        tensors, idx = batch[name]
        if tensors:
            for i2, row in zip(idx, nets[name](tensors)):
                rows[name][i2] = row
                have_emb[name][i2] = True
            tensors.clear()
            idx.clear()

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
            for name, net in nets.items():
                if not have_emb[name][i]:
                    batch[name][0].extend(net.tensors(content))
                    batch[name][1].append(i)
                    if len(batch[name][0]) >= 32:
                        flush(name)
        except Exception as exc:
            errors[i] = f"{type(exc).__name__}: {exc}"
        if done % 16 == 0 or done == len(todo):
            progress("read", done, len(todo))
    emb = {}
    for name in nets:
        flush(name)
        dim = next(iter(rows[name].values())).shape[0] if rows[name] else 1
        emb[name] = np.zeros((n, dim), np.float16)
        for i, row in rows[name].items():
            emb[name][i] = row
    rows.clear()

    ok = np.array([i not in errors for i in range(n)])
    if base:
        try:
            save_npz(base + ".npz", keys=np.array(key_of)[ok], blake=np.array(blake)[ok], ph=ph[ok], phm=phm[ok],
                     wh=wh[ok], size=size[ok])
            for name in nets:
                sel = ok & have_emb[name]
                save_npz(f"{base}-{name}.npz", keys=np.array(key_of)[sel], emb=emb[name][sel])
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
    neighbours = set()
    torch = feats.torch if feats else None

    def on_device(name, col=slice(None)):
        t = torch.from_numpy(np.ascontiguousarray(emb[name][:, col], dtype=np.float32)).to(nets[name].device)
        t[torch.from_numpy(~(have_emb[name] & ok)).to(t.device)] = 0
        return t

    def nearest(queries, base_t, s, k, floor):
        """Each query row's k most similar base rows (not itself), at least `floor` similar."""
        sims = queries @ base_t.T
        r = torch.arange(sims.shape[0], device=sims.device)
        sims[r, r + s] = -2
        top = torch.topk(sims, k=min(k, n - 1), dim=1)
        for q, (vals, idx) in enumerate(zip(top.values.tolist(), top.indices.tolist())):
            for v, j in zip(vals, idx):
                if v >= floor:
                    neighbours.add((min(s + q, j), max(s + q, j)))

    et = on_device(main_net) if feats else None
    sscd = None
    if want_align and "sscd" in nets:
        d = emb["sscd"].shape[1] // MODELS["sscd"]["turns"]
        sscd = [on_device("sscd", slice(t * d, (t + 1) * d)) for t in range(MODELS["sscd"]["turns"])]
    progress("compare", 0, total_chunks)
    for c, s in enumerate(range(0, n, chunk)):
        e = min(n, s + chunk)
        ham = popcount64(ph[s:e, None] ^ ph[None, :])
        hamm = popcount64(ph[s:e, None] ^ phm[None, :])
        close = np.minimum(ham, hamm) <= max_ham
        if feats:
            close |= (et[s:e] @ et.T).cpu().numpy() >= min_cos
            if want_align:
                nearest(et[s:e], et, s, ALIGN_K, ALIGN_FLOOR.get(main_net, 0.75))
            if sscd:
                # each image as is against the others as they are, then each of its turned versions
                for t, q in enumerate(sscd):
                    nearest(q[s:e], sscd[0], s, SSCD_K if t == 0 else SSCD_TURN_K, SSCD_FLOOR)
        rows_, cols = np.nonzero(close)
        for r, j in zip(rows_, cols):
            i = s + int(r)
            j = int(j)
            if j > i and ok[i] and ok[j]:
                pairs.setdefault((i, j), 0)
        progress("compare", c + 1, total_chunks)

    # --- alignment of each image with its nearest neighbours, on every core
    aligned_ok = False
    mirrored_by_align = set()
    if want_align:
        if not feats:
            deep_error = (deep_error or "") + " alignment needs a model's features to pick the neighbours"
        else:
            try:
                import cv2  # noqa: F401
                from concurrent.futures import ThreadPoolExecutor
                vfile = f"{base}-{used}-align.json" if base else ""
                verdicts = {}
                if vfile and os.path.exists(vfile):
                    try:
                        with open(vfile, encoding="utf-8") as fh:
                            saved = json.load(fh)
                        if isinstance(saved, dict) and saved.get("version") == ALIGN_VERSION:
                            verdicts = saved["verdicts"]
                    except Exception:
                        verdicts = {}

                def save_verdicts(live):
                    if vfile:
                        tmp = vfile + ".tmp"
                        with open(tmp, "w", encoding="utf-8") as fh:
                            json.dump({"version": ALIGN_VERSION,
                                       "verdicts": {k: v for k, v in verdicts.items() if k in live}}, fh)
                        os.replace(tmp, vfile)

                aligner = Aligner(paths)
                todo_pairs = [p for p in neighbours if ok[p[0]] and ok[p[1]]]
                order = locality_order(n, todo_pairs)
                todo_pairs.sort(key=lambda p: (min(order[p[0]], order[p[1]]), max(order[p[0]], order[p[1]])))
                vkey = {p: f"{key_of[p[0]]}\n{key_of[p[1]]}" for p in todo_pairs}
                need = [p for p in todo_pairs if vkey[p] not in verdicts]
                info("align_pairs", len(todo_pairs))
                info("align_cached", len(todo_pairs) - len(need))

                def verdict(p):
                    try:
                        same, mirror = aligner(*p)
                        return [int(same), int(mirror)]
                    except Exception:
                        return [0, 0]

                done = len(todo_pairs) - len(need)
                progress("align", done, len(todo_pairs))
                with ThreadPoolExecutor(max(2, min(8, os.cpu_count() or 4))) as pool:
                    for k, (p, v) in enumerate(zip(need, pool.map(verdict, need)), 1):
                        verdicts[vkey[p]] = v
                        done += 1
                        if done % 50 == 0 or done == len(todo_pairs):
                            progress("align", done, len(todo_pairs))
                        if k % 5000 == 0:
                            save_verdicts(set(verdicts))      # a cancelled scan keeps what it has lined up
                save_verdicts(set(vkey.values()))
                for p in todo_pairs:
                    v = verdicts[vkey[p]]
                    if isinstance(v, list) and v[0]:
                        pairs[p] = 1
                        if v[1]:
                            mirrored_by_align.add(p)
                aligned_ok = True
            except ImportError:
                deep_error = (deep_error or "") + " alignment needs OpenCV: pip install opencv-python"

    main_emb = emb[main_net] if feats else None
    main_have = have_emb[main_net] if feats else None
    out_pairs = []
    for (i, j), aligned in pairs.items():
        h1 = int(popcount64(np.array([ph[i] ^ ph[j]], np.uint64))[0])
        h2 = int(popcount64(np.array([ph[i] ^ phm[j]], np.uint64))[0])
        cos = float(main_emb[i].astype(np.float32) @ main_emb[j].astype(np.float32)) \
            if feats and main_have[i] and main_have[j] else -1.0
        mirrored = (i, j) in mirrored_by_align if aligned else h2 < h1
        out_pairs.append([i, j, int(blake[i] == blake[j] and blake[i] != ""), min(h1, h2), round(cos, 4),
                          int(mirrored), int(aligned)])

    items = []
    for i, p in enumerate(paths):
        it = {"path": p, "width": int(wh[i][0]), "height": int(wh[i][1]), "bytes": int(size[i])}
        if i in errors:
            it["error"] = errors[i]
        items.append(it)
    json.dump({"items": items, "pairs": out_pairs, "model": used, "deep": bool(feats), "deepError": deep_error,
               "align": aligned_ok}, sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        die(f"unhandled exception: {exc}\n{traceback.format_exc()}", code=10)
