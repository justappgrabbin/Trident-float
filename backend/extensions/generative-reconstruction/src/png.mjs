// Pure-JS PNG decode (8/16-bit, gray/RGB/palette/gray-alpha/RGBA, non-interlaced) and RGBA encode.
import { inflate, deflate, crc32 } from './zlib.mjs';
const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
export function isPng(b) { return SIG.every((v, i) => b[i] === v); }
export function decodePng(bytes) {
  if (!isPng(bytes)) throw new Error('png: bad signature');
  let o = 8, ihdr = null, plte = null, trns = null; const idat = [];
  while (o < bytes.length) {
    const len = u32(bytes, o), type = String.fromCharCode(...bytes.subarray(o + 4, o + 8)), d = bytes.subarray(o + 8, o + 8 + len); o += 12 + len;
    if (type === 'IHDR') ihdr = { w: u32(d, 0), h: u32(d, 4), depth: d[8], ct: d[9], il: d[12] };
    else if (type === 'PLTE') plte = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
  }
  const { w, h, depth, ct, il } = ihdr; if (il) throw new Error('png: interlaced not supported (investigating)');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct]; const bpp = Math.max(1, (ch * depth) >> 3); const stride = Math.ceil((w * ch * depth) / 8);
  const z = new Uint8Array(idat.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of idat) { z.set(x, p); p += x.length; }
  const raw = inflate(z); const px = new Uint8Array(stride * h); let prevRow = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0, b = prevRow[x], c = x >= bpp ? prevRow[x - bpp] : 0; let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[x] = v & 255;
    }
    prevRow = out;
  }
  const rgba = new Uint8Array(w * h * 4);
  const sample = (y, i) => { if (depth === 8) return px[y * stride + i]; if (depth === 16) return px[y * stride + 2 * i]; const per = 8 / depth, byte = px[y * stride + Math.floor(i / per)], sh = 8 - depth * (1 + (i % per)); return (byte >> sh) & ((1 << depth) - 1); };
  const scale = depth < 8 && ct !== 3 ? 255 / ((1 << depth) - 1) : 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = (y * w + x) * 4; let r, g, b, a = 255;
    if (ct === 3) { const i = sample(y, x); r = plte[i * 3]; g = plte[i * 3 + 1]; b = plte[i * 3 + 2]; if (trns && i < trns.length) a = trns[i]; }
    else if (ct === 0 || ct === 4) { r = g = b = Math.round(sample(y, x * ch) * scale); if (ct === 4) a = sample(y, x * ch + 1); }
    else { r = sample(y, x * ch); g = sample(y, x * ch + 1); b = sample(y, x * ch + 2); if (ct === 6) a = sample(y, x * ch + 3); }
    rgba[q] = r; rgba[q + 1] = g; rgba[q + 2] = b; rgba[q + 3] = a;
  }
  return { width: w, height: h, data: rgba };
}
function chunk(type, data) { const out = new Uint8Array(12 + data.length); const len = data.length; out.set([len >>> 24, (len >>> 16) & 255, (len >>> 8) & 255, len & 255]); const td = new Uint8Array(4 + data.length); for (let i = 0; i < 4; i++) td[i] = type.charCodeAt(i); td.set(data, 4); out.set(td, 4); const c = crc32(td); out.set([c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255], 8 + len); return out; }
export function encodePng({ width, height, data }) {
  const stride = width * 4, raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) { // Sub filter (good for photos), all rows
    raw[y * (stride + 1)] = 1; const o = y * (stride + 1) + 1, s = y * stride;
    for (let x = 0; x < stride; x++) raw[o + x] = (data[s + x] - (x >= 4 ? data[s + x - 4] : 0)) & 255;
  }
  const ih = new Uint8Array(13); ih.set([width >>> 24, (width >>> 16) & 255, (width >>> 8) & 255, width & 255, height >>> 24, (height >>> 16) & 255, (height >>> 8) & 255, height & 255, 8, 6, 0, 0, 0]);
  const parts = [new Uint8Array(SIG), chunk('IHDR', ih), chunk('IDAT', deflate(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}

