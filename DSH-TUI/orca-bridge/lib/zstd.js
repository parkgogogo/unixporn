import zlib from 'node:zlib';

const ZSTD_MAGIC = 0xfd2fb528;
const SKIPPABLE_MASK = 0xfffffff0;
const SKIPPABLE_MAGIC = 0x184d2a50;

// DSH appends one zstd frame per write, so a session file is many concatenated frames.
// zlib.zstdDecompressSync stops after the first frame, so split the frames and decompress each.
// A truncated trailing frame (DSH is mid-write) is ignored; the next sync picks it up.
export function decompressFrames(buf) {
  const parts = [];
  let off = 0;
  while (off + 4 <= buf.length) {
    const magic = buf.readUInt32LE(off);
    if ((magic & SKIPPABLE_MASK) === SKIPPABLE_MAGIC) {
      if (off + 8 > buf.length) break;
      off += 8 + buf.readUInt32LE(off + 4);
      continue;
    }
    if (magic !== ZSTD_MAGIC) throw new Error(`not a zstd frame at byte ${off}`);
    const end = frameEnd(buf, off);
    if (end < 0) break;
    parts.push(zlib.zstdDecompressSync(buf.subarray(off, end)));
    off = end;
  }
  return Buffer.concat(parts);
}

// End offset of the frame starting at `start`, or -1 when the frame is incomplete (RFC 8878 §3.1.1).
function frameEnd(buf, start) {
  let p = start + 4;
  if (p >= buf.length) return -1;
  const fhd = buf[p++];
  const fcsFlag = fhd >> 6;
  const singleSegment = (fhd >> 5) & 1;
  const hasChecksum = (fhd >> 2) & 1;
  const dictIdFlag = fhd & 3;
  p += singleSegment ? 0 : 1;
  p += [0, 1, 2, 4][dictIdFlag];
  p += [singleSegment ? 1 : 0, 2, 4, 8][fcsFlag];
  for (;;) {
    if (p + 3 > buf.length) return -1;
    const header = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
    p += 3;
    const last = header & 1;
    const type = (header >> 1) & 3;
    const size = header >>> 3;
    p += type === 1 ? 1 : size; // an RLE block stores a single byte
    if (p > buf.length) return -1;
    if (last) break;
  }
  p += hasChecksum ? 4 : 0;
  return p > buf.length ? -1 : p;
}
