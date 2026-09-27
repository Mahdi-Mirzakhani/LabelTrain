// Lightweight image dimension reader — reads just the file header.
// Supports PNG, JPEG, GIF, BMP, WEBP, TIFF (no full decode).

import fs from "node:fs/promises";

export interface Dims { width: number; height: number; }

// Keyed by path, but validated against the file's size + mtime: a stale entry
// would make every box on that image land at the wrong coordinates if the file
// were replaced outside the app (re-export, re-crop, sync client).
interface CacheEntry extends Dims { size: number; mtimeMs: number; }
const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 2000;

export async function readImageDims(filePath: string): Promise<Dims> {
  let stat: { size: number; mtimeMs: number } | null = null;
  try {
    const st = await fs.stat(filePath);
    stat = { size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    /* unreadable — fall through and let the open() below report it */
  }

  const cached = cache.get(filePath);
  if (cached && stat && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
    return { width: cached.width, height: cached.height };
  }

  const fh = await fs.open(filePath, "r");
  try {
    const head = Buffer.alloc(64 * 1024);
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    const dims = parseDims(head.subarray(0, bytesRead), fh);
    const resolved = await dims;
    if (stat) {
      if (cache.size >= MAX_CACHE) {
        const firstKey = cache.keys().next().value as string | undefined;
        if (firstKey !== undefined) cache.delete(firstKey);
      }
      cache.set(filePath, { ...resolved, ...stat });
    }
    return resolved;
  } finally {
    await fh.close();
  }
}

async function parseDims(buf: Buffer, fh: import("node:fs/promises").FileHandle): Promise<Dims> {
  // PNG
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // GIF
  if (buf.length >= 10 && (buf.toString("ascii", 0, 3) === "GIF")) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // BMP
  if (buf.length >= 26 && buf[0] === 0x42 && buf[1] === 0x4d) {
    return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
  }
  // WebP (VP8/VP8L/VP8X)
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const fmt = buf.toString("ascii", 12, 16);
    if (fmt === "VP8 ") {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fmt === "VP8L") {
      const b = buf;
      const w = 1 + (((b[22] | (b[23] << 8)) & 0x3fff));
      const h = 1 + ((((b[23] >> 6) | (b[24] << 2) | (b[25] << 10)) & 0x3fff));
      return { width: w, height: h };
    }
    if (fmt === "VP8X") {
      const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { width: w, height: h };
    }
  }
  // TIFF
  if (buf.length >= 8 && (buf.readUInt16LE(0) === 0x4949 || buf.readUInt16BE(0) === 0x4d4d)) {
    const little = buf.readUInt16LE(0) === 0x4949;
    const u16 = (o: number) => little ? buf.readUInt16LE(o) : buf.readUInt16BE(o);
    const u32 = (o: number) => little ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
    if (u16(2) === 42) {
      const ifd = u32(4);
      if (ifd + 2 < buf.length) {
        const count = u16(ifd);
        let w = 0, h = 0;
        for (let i = 0; i < count; i++) {
          const base = ifd + 2 + i * 12;
          if (base + 8 > buf.length) break;
          const tag = u16(base);
          const valOff = base + 8;
          // type 3 = SHORT, 4 = LONG
          const type = u16(base + 2);
          const v = type === 3 ? u16(valOff) : u32(valOff);
          if (tag === 256) w = v;
          if (tag === 257) h = v;
        }
        if (w && h) return { width: w, height: h };
      }
    }
  }
  // JPEG (scan markers, may need to read more)
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) {
    return await parseJpegDims(buf, fh);
  }
  // Fallback
  return { width: 0, height: 0 };
}

async function parseJpegDims(initial: Buffer, fh: import("node:fs/promises").FileHandle): Promise<Dims> {
  // Walk markers, fetching more bytes as needed.
  let buf = initial;
  let offset = 2; // skip SOI
  let fileOff = initial.length;
  // EXIF Orientation (tag 0x0112). Values 5–8 mean the pixels are stored
  // rotated 90°/270° and every consumer that honors EXIF (Chromium's <img>,
  // cv2.imread, PIL with exif_transpose) shows width/height SWAPPED relative
  // to the SOF header. Report the displayed dims so normalized boxes drawn on
  // screen and pixel coords written to YOLO/VOC/COCO files agree — without
  // this every portrait phone photo got misplaced boxes.
  let orientation = 1;

  const ensure = async (need: number) => {
    while (buf.length - offset < need) {
      const chunk = Buffer.alloc(64 * 1024);
      const { bytesRead } = await fh.read(chunk, 0, chunk.length, fileOff);
      if (bytesRead <= 0) return false;
      buf = Buffer.concat([buf, chunk.subarray(0, bytesRead)]);
      fileOff += bytesRead;
    }
    return true;
  };

  while (true) {
    if (!(await ensure(4))) return { width: 0, height: 0 };
    if (buf[offset] !== 0xff) return { width: 0, height: 0 };
    let marker = buf[offset + 1];
    offset += 2;
    while (marker === 0xff) {
      if (!(await ensure(1))) return { width: 0, height: 0 };
      marker = buf[offset];
      offset += 1;
    }
    // Standalone markers (no payload)
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (!(await ensure(2))) return { width: 0, height: 0 };
    const segLen = buf.readUInt16BE(offset);
    // APP1 — may carry the EXIF block with the Orientation tag.
    if (marker === 0xe1 && segLen >= 2) {
      if (!(await ensure(segLen))) return { width: 0, height: 0 };
      const o = parseExifOrientation(buf.subarray(offset + 2, offset + segLen));
      if (o) orientation = o;
      offset += segLen;
      continue;
    }
    // SOF markers (baseline + progressive + lossless variants)
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (!(await ensure(7))) return { width: 0, height: 0 };
      const h = buf.readUInt16BE(offset + 3);
      const w = buf.readUInt16BE(offset + 5);
      return orientation >= 5 ? { width: h, height: w } : { width: w, height: h };
    }
    offset += segLen;
  }
}

/** Extract the EXIF Orientation value (1–8) from an APP1 payload, or 0. */
function parseExifOrientation(seg: Buffer): number {
  if (seg.length < 16 || seg.toString("ascii", 0, 6) !== "Exif\0\0") return 0;
  const t = 6; // TIFF header base
  const little = seg[t] === 0x49 && seg[t + 1] === 0x49;
  const big = seg[t] === 0x4d && seg[t + 1] === 0x4d;
  if (!little && !big) return 0;
  const u16 = (o: number) => (little ? seg.readUInt16LE(o) : seg.readUInt16BE(o));
  const u32 = (o: number) => (little ? seg.readUInt32LE(o) : seg.readUInt32BE(o));
  if (t + 8 > seg.length || u16(t + 2) !== 42) return 0;
  const ifd = t + u32(t + 4);
  if (ifd + 2 > seg.length) return 0;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > seg.length) break;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8); // type SHORT — value lives in the entry itself
      return v >= 1 && v <= 8 ? v : 0;
    }
  }
  return 0;
}
