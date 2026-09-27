// Minimal, dependency-free ZIP writer (deflate, no zip64).
// Good for typical datasets; individual entries / archives are limited to 4 GB.

import zlib from "node:zlib";

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export interface ZipEntry {
  /** Path inside the archive; backslashes are normalized to forward slashes. */
  name: string;
  data: Buffer;
}

// General purpose bit 11 ("language encoding flag") tells the reader the file
// name is UTF-8. Without it, extractors fall back to CP437 / the OEM code page
// and any non-ASCII name — Persian, Arabic, CJK — comes out as mojibake in
// Windows Explorer. The names are already written as UTF-8 bytes below; this
// is the flag that makes readers interpret them that way.
const FLAG_UTF8 = 0x0800;

// This writer emits the classic (non-zip64) format, whose headers are 16-bit
// for the entry count and 32-bit for offsets. Past those limits a zip must use
// zip64; silently wrapping the fields would produce an archive that looks
// written but cannot be opened, so refuse instead.
const MAX_ENTRIES = 0xffff;
const MAX_OFFSET = 0xffffffff;

export function makeZip(entries: ZipEntry[]): Buffer {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(
      `Too many files for a plain ZIP: ${entries.length} (limit ${MAX_ENTRIES}). ` +
      `Export to a folder instead of a .zip archive.`,
    );
  }
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name.replaceAll("\\", "/"), "utf8");
    const crc = crc32(e.data);
    const compressed = zlib.deflateRawSync(e.data);
    const method = 8; // deflate

    if (offset > MAX_OFFSET) {
      throw new Error(
        "Dataset is too large for a plain ZIP (over 4 GB). " +
        "Export to a folder instead of a .zip archive.",
      );
    }

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // local file header signature
    lh.writeUInt16LE(20, 4);         // version needed
    lh.writeUInt16LE(FLAG_UTF8, 6);  // flags — UTF-8 file names
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10);         // mod time
    lh.writeUInt16LE(0x21, 12);      // mod date (valid placeholder)
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(compressed.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);         // extra length
    parts.push(lh, nameBuf, compressed);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); // central dir header signature
    ch.writeUInt16LE(20, 4);         // version made by
    ch.writeUInt16LE(20, 6);         // version needed
    ch.writeUInt16LE(FLAG_UTF8, 8);  // flags — UTF-8 file names
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(0, 12);         // mod time
    ch.writeUInt16LE(0x21, 14);      // mod date
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(compressed.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);         // extra length
    ch.writeUInt16LE(0, 32);         // comment length
    ch.writeUInt16LE(0, 34);         // disk number start
    ch.writeUInt16LE(0, 36);         // internal attrs
    ch.writeUInt32LE(0, 38);         // external attrs
    ch.writeUInt32LE(offset, 42);    // local header offset
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central dir signature
  eocd.writeUInt16LE(0, 4);          // disk number
  eocd.writeUInt16LE(0, 6);          // central dir start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);    // central dir offset
  eocd.writeUInt16LE(0, 20);         // comment length

  return Buffer.concat([...parts, centralBuf, eocd]);
}
