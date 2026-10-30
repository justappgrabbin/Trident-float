// Pure Synthia Automata — merged: artifact layer (real file bytes in pure JS)

/**
 * The artifact layer: the modern-day interpretations make ACTUAL FILES —
 * pictures, videos, code — as real byte sequences, encoded in pure JavaScript
 * with no DOM, no canvas, no codecs, no network, no dependencies, and no
 * clocks (every encoder below is a pure function of its arguments).
 *
 *   encodeBMP(width, height, rgba) -> Uint8Array
 *       A real 24-bit Windows BMP: BITMAPFILEHEADER + BITMAPINFOHEADER
 *       (pixel offset 54), bottom-up BGR rows padded to 4 bytes.
 *
 *   encodeGIF(width, height, frames, {loop}) -> Uint8Array
 *       A real animated GIF89a: 216-color deterministic palette (the 6x6x6
 *       web-safe cube, indices 0..215, padded to a 256-entry global table),
 *       NETSCAPE2.0 looping extension, per-frame Graphic Control Extension
 *       (delay in centiseconds), and a from-scratch GIF LZW compressor
 *       (clear/EOI codes, code table growth 9->12 bits, deferred clear at
 *       4096, LSB-first bit packing, data sub-blocks <= 255 bytes).
 *
 *   Why BMP + GIF and NOT PNG: PNG pixel data is zlib/DEFLATE (LZ77 +
 *   Huffman + Adler-32 framing). Deflate is deliberately avoided here —
 *   it is a large, fussy format surface, while BMP needs no compression at
 *   all and GIF's LZW is small enough to implement exactly (and verify
 *   byte-for-byte against reference decoders) in this file. BMP proves real
 *   decodable pictures; GIF proves real decodable animated video. That is
 *   the whole artifact contract.
 *
 *   class ArtifactWriter — deterministic artifact registry: write() stamps
 *   counter-derived ids (art-1, art-2, ...), records the fnv1a32 byte hash,
 *   and keeps the bytes. list() returns metadata without the byte payload.
 *
 * Hash helpers are local copies (media-field.js has its own too): the merged
 * layer must not import from engine/ (implementation contract, hard rule 6),
 * and this module must not import media-field.js (media-field imports THIS
 * module for CodeWeaver.weaveArtifact — importing back would be a cycle).
 */

/** FNV-1a (32-bit) over bytes -> 8-char hex. Local copy; see header note. */
export function fnv1a32Bytes(bytes) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function checkFrame(width, height, rgba) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('width/height must be positive integers');
  }
  if (!rgba || rgba.length !== width * height * 4) {
    throw new RangeError(`rgba must be ${width * height * 4} bytes (${width}x${height} RGBA)`);
  }
}

// ------------------------------------------------------------------- BMP

/**
 * 24-bit BMP, bottom-up rows, 4-byte row padding, BGR byte order.
 * Layout: 14-byte BITMAPFILEHEADER ('BM', file size, reserved, offset 54)
 * + 40-byte BITMAPINFOHEADER (size 40, w, h, planes 1, bpp 24, no
 * compression, image size, 2835 px/m, palettes 0) + pixel data.
 */
export function encodeBMP(width, height, rgba) {
  checkFrame(width, height, rgba);
  const rowBytes = width * 3;
  const paddedRow = (rowBytes + 3) & ~3;
  const pixelBytes = paddedRow * height;
  const fileSize = 54 + pixelBytes;
  const out = new Uint8Array(fileSize);
  const view = new DataView(out.buffer);
  out[0] = 0x42; // 'B'
  out[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true); // bfSize
  view.setUint32(10, 54, true); // bfOffBits
  view.setUint32(14, 40, true); // biSize (BITMAPINFOHEADER)
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive -> bottom-up
  view.setUint16(26, 1, true); // biPlanes
  view.setUint16(28, 24, true); // biBitCount
  view.setUint32(30, 0, true); // biCompression = BI_RGB
  view.setUint32(34, pixelBytes, true); // biSizeImage
  view.setInt32(38, 2835, true); // 72 DPI in px/m
  view.setInt32(42, 2835, true);
  for (let row = 0; row < height; row++) {
    const srcY = height - 1 - row; // bottom-up
    let o = 54 + row * paddedRow; // padding bytes stay 0 (fresh Uint8Array)
    for (let x = 0; x < width; x++) {
      const s = (srcY * width + x) * 4;
      out[o] = rgba[s + 2]; // B
      out[o + 1] = rgba[s + 1]; // G
      out[o + 2] = rgba[s]; // R
      o += 3;
    }
  }
  return out;
}

// ------------------------------------------------------------------- GIF

/**
 * The deterministic palette: the 6x6x6 web-safe cube (levels 0,51,...,255)
 * at indices 0..215, zero-filled to the 256-entry global color table.
 * No median cut, no histogram — quantization is a fixed rounding, so the
 * same RGBA input always yields the same indices and the same bytes.
 */
export const GIF_PALETTE = (() => {
  const palette = new Uint8Array(256 * 3);
  let i = 0;
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        palette[i] = r * 51;
        palette[i + 1] = g * 51;
        palette[i + 2] = b * 51;
        i += 3;
      }
    }
  }
  return palette; // treated as read-only (typed arrays cannot be frozen)
})();

function quantizeToCube(r, g, b) {
  const ri = Math.min(5, Math.round(r / 51));
  const gi = Math.min(5, Math.round(g / 51));
  const bi = Math.min(5, Math.round(b / 51));
  return ri * 36 + gi * 6 + bi;
}

/**
 * GIF LZW compression, implemented from the GIF89a spec (Appendix F).
 * minCodeSize 8 -> clearCode 256, EOI 257, first free code 258, code width
 * grows 9 -> 12 bits as the table fills; at 4096 the encoder emits a clear
 * code and restarts the table. Codes are packed LSB-first into bytes.
 */
export function lzwEncodeGIF(indices, minCodeSize = 8) {
  if (!indices || indices.length < 1) throw new RangeError('indices must be non-empty');
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const bytes = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let codeSize = minCodeSize + 1;
  const emit = (code) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };
  let dict = new Map(); // (prefix << 8) | k -> code
  let nextCode = eoiCode + 1;
  const reset = () => {
    dict = new Map();
    nextCode = eoiCode + 1;
    codeSize = minCodeSize + 1;
  };
  emit(clearCode);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const known = dict.get(key);
    if (known !== undefined) {
      prefix = known;
      continue;
    }
    emit(prefix);
    if (nextCode < 4096) {
      dict.set(key, nextCode);
      nextCode += 1;
      // The decoder lags the encoder by one dictionary entry (it adds an
      // entry only when it reads the NEXT code), so the width grows when the
      // next free code passes 2^codeSize — not when it reaches it.
      if (nextCode === (1 << codeSize) + 1 && codeSize < 12) codeSize += 1;
    } else {
      emit(clearCode); // deferred clear: table full, restart
      reset();
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoiCode);
  if (bitCount > 0) bytes.push(bitBuffer & 0xff);
  return bytes;
}

/**
 * Animated GIF89a. frames: [{rgba: Uint8ClampedArray, delayCs}] — delayCs is
 * the frame delay in centiseconds (GIF-native unit). loop=true adds the
 * NETSCAPE2.0 application extension with an infinite loop count.
 * Structure: header, LSD (256-entry GCT), GCT, [loop ext], per frame
 * {GCE, image descriptor, LZW min code size, sub-blocks <= 255 B, 0x00},
 * trailer 0x3B.
 */
export function encodeGIF(width, height, frames, { loop = true } = {}) {
  if (!Array.isArray(frames) || frames.length < 1) {
    throw new RangeError('frames must be a non-empty array');
  }
  for (const frame of frames) checkFrame(width, height, frame.rgba);
  const out = [];
  const pushStr = (s) => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); };
  const u16 = (v) => { out.push(v & 0xff, (v >>> 8) & 0xff); };
  pushStr('GIF89a');
  u16(width);
  u16(height);
  out.push(0xf7, 0, 0); // GCT present, 8-bit color resolution, 256 entries; bg 0; square pixels
  for (let i = 0; i < GIF_PALETTE.length; i++) out.push(GIF_PALETTE[i]);
  if (loop) {
    out.push(0x21, 0xff, 0x0b); // application extension
    pushStr('NETSCAPE2.0');
    out.push(3, 1, 0, 0, 0); // sub-block: id 1, loop count 0 = forever, terminator
  }
  for (const frame of frames) {
    const delay = Math.max(0, Math.min(0xffff, Math.round(Number(frame.delayCs) || 0)));
    out.push(0x21, 0xf9, 4, 0); // graphic control extension, no transparency/disposal
    u16(delay);
    out.push(0, 0);
    out.push(0x2c); // image descriptor
    u16(0); u16(0); u16(width); u16(height);
    out.push(0); // no local color table, no interlace
    const indices = new Uint8Array(width * height);
    for (let p = 0; p < indices.length; p++) {
      const s = p * 4;
      indices[p] = quantizeToCube(frame.rgba[s], frame.rgba[s + 1], frame.rgba[s + 2]);
    }
    out.push(8); // LZW minimum code size
    const compressed = lzwEncodeGIF(indices, 8);
    for (let i = 0; i < compressed.length; i += 255) {
      const block = compressed.slice(i, i + 255);
      out.push(block.length, ...block);
    }
    out.push(0); // image data terminator
  }
  out.push(0x3b); // trailer
  return Uint8Array.from(out);
}

// ---------------------------------------------------------- artifact writer

const textEncoder = new TextEncoder();

/**
 * Deterministic artifact registry. write(kind, {fileName, bytes|text, mime})
 * stamps a counter-derived id (art-N) and an fnv1a32 hash over the exact
 * bytes; the returned artifact record is
 * {id, kind, fileName, mime, size, hash, bytes, text?} with bytes a
 * Uint8Array. list() returns the metadata of every artifact without bytes.
 */
export class ArtifactWriter {
  constructor() {
    this.records = [];
    this.seq = 0;
  }

  write(kind, { fileName, bytes = null, text = null, mime = 'application/octet-stream' } = {}) {
    if (!kind || typeof kind !== 'string') throw new TypeError('artifact kind is required');
    if (!fileName || typeof fileName !== 'string') throw new TypeError('artifact fileName is required');
    if (bytes == null && text == null) throw new TypeError('artifact requires bytes or text');
    const data = bytes != null
      ? (bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes))
      : textEncoder.encode(String(text));
    const artifact = {
      id: `art-${++this.seq}`,
      kind,
      fileName,
      mime: String(mime),
      size: data.length,
      hash: fnv1a32Bytes(data),
      bytes: data,
    };
    if (text != null) artifact.text = String(text);
    this.records.push(artifact);
    return { artifact };
  }

  list() {
    return this.records.map(({ id, kind, fileName, mime, size, hash }) => (
      { id, kind, fileName, mime, size, hash }
    ));
  }

  get(id) {
    return this.records.find((r) => r.id === id) || null;
  }
}

export default ArtifactWriter;

