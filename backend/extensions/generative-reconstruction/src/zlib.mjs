// Pure-JS zlib (RFC 1950/1951): inflate (all block types) and deflate (greedy LZ77 + fixed Huffman).
const LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
const CLORD = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

let CRC_T = null;
export function crc32(bytes, crc = 0) {
  if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
  crc = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) crc = CRC_T[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return ~crc >>> 0;
}
export function adler32(bytes) { let a = 1, b = 0; for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; } return ((b << 16) | a) >>> 0; }

function buildHuff(lengths) {
  const max = Math.max(0, ...lengths); const count = new Uint16Array(max + 1); for (const l of lengths) if (l) count[l]++;
  const next = new Uint16Array(max + 2); let code = 0; for (let b = 1; b <= max; b++) { code = (code + count[b - 1]) << 1; next[b] = code; }
  const map = new Map(); // key: (len<<16)|code
  lengths.forEach((l, sym) => { if (l) map.set((l << 16) | next[l]++, sym); });
  return { map, max };
}
export function inflateRaw(data) {
  let pos = 0, bit = 0; const out = []; let outArr = new Uint8Array(Math.max(1024, data.length * 4)); let olen = 0;
  const push = (b) => { if (olen >= outArr.length) { const n = new Uint8Array(outArr.length * 2); n.set(outArr); outArr = n; } outArr[olen++] = b; };
  const bits = (n) => { let v = 0; for (let i = 0; i < n; i++) { if (pos >= data.length) throw new Error('inflate: unexpected end'); v |= ((data[pos] >> bit) & 1) << i; if (++bit === 8) { bit = 0; pos++; } } return v; };
  const sym = (h) => { let code = 0; for (let len = 1; len <= h.max; len++) { code = (code << 1) | bits(1); const s = h.map.get((len << 16) | code); if (s !== undefined) return s; } throw new Error('inflate: bad code'); };
  let fixedL = null, fixedD = null; let final = 0;
  do {
    final = bits(1); const type = bits(2);
    if (type === 0) { if (bit) { bit = 0; pos++; } const len = data[pos] | (data[pos + 1] << 8); pos += 4; for (let i = 0; i < len; i++) push(data[pos++]); continue; }
    let lh, dh;
    if (type === 1) { if (!fixedL) { const l = []; for (let i = 0; i < 288; i++) l.push(i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8); fixedL = buildHuff(l); fixedD = buildHuff(new Array(30).fill(5)); } lh = fixedL; dh = fixedD; }
    else if (type === 2) {
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4; const cl = new Array(19).fill(0);
      for (let i = 0; i < hclen; i++) cl[CLORD[i]] = bits(3);
      const ch = buildHuff(cl); const lens = [];
      while (lens.length < hlit + hdist) { const s = sym(ch); if (s < 16) lens.push(s); else if (s === 16) { const p = lens[lens.length - 1]; for (let r = bits(2) + 3; r; r--) lens.push(p); } else if (s === 17) { for (let r = bits(3) + 3; r; r--) lens.push(0); } else { for (let r = bits(7) + 11; r; r--) lens.push(0); } }
      lh = buildHuff(lens.slice(0, hlit)); dh = buildHuff(lens.slice(hlit));
    } else throw new Error('inflate: bad block type');
    for (;;) {
      const s = sym(lh); if (s < 256) { push(s); continue; } if (s === 256) break;
      const li = s - 257; const len = LBASE[li] + bits(LEXT[li]); const di = sym(dh); const dist = DBASE[di] + bits(DEXT[di]);
      if (dist > olen) throw new Error('inflate: bad distance'); for (let i = 0; i < len; i++) push(outArr[olen - dist]);
    }
  } while (!final);
  void out; return outArr.slice(0, olen);
}
export function inflate(z) { if ((z[0] & 15) !== 8) throw new Error('zlib: not deflate'); return inflateRaw(z.subarray(2)); }

class BitWriter { constructor() { this.buf = new Uint8Array(1 << 16); this.len = 0; this.acc = 0; this.n = 0; }
  put(v, n) { this.acc |= v << this.n; this.n += n; while (this.n >= 8) { if (this.len >= this.buf.length) { const b = new Uint8Array(this.buf.length * 2); b.set(this.buf); this.buf = b; } this.buf[this.len++] = this.acc & 255; this.acc >>>= 8; this.n -= 8; } }
  huff(code, n) { let r = 0; for (let i = 0; i < n; i++) r = (r << 1) | ((code >> i) & 1); this.put(r, n); }
  done() { if (this.n) this.put(0, 8 - this.n); return this.buf.slice(0, this.len); } }
function lit(w, s) { if (s < 144) w.huff(0x30 + s, 8); else if (s < 256) w.huff(0x190 + s - 144, 9); else if (s < 280) w.huff(s - 256, 7); else w.huff(0xc0 + s - 280, 8); }
export function deflateRaw(data) {
  const w = new BitWriter(); w.put(1, 1); w.put(1, 2);
  const head = new Int32Array(1 << 15).fill(-1), prev = new Int32Array(data.length); const H = (i) => ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & 0x7fff;
  let i = 0;
  while (i < data.length) {
    let bestLen = 0, bestDist = 0;
    if (i + 2 < data.length) {
      const h = H(i); let j = head[h], chain = 32;
      while (j >= 0 && i - j <= 32768 && chain--) { let l = 0; while (l < 258 && i + l < data.length && data[j + l] === data[i + l]) l++; if (l > bestLen) { bestLen = l; bestDist = i - j; if (l === 258) break; } j = prev[j]; }
      prev[i] = head[h]; head[h] = i;
    }
    if (bestLen >= 3) {
      let li = 28; while (LBASE[li] > bestLen) li--; lit(w, 257 + li); w.put(bestLen - LBASE[li], LEXT[li]);
      let di = 29; while (DBASE[di] > bestDist) di--; w.huff(di, 5); w.put(bestDist - DBASE[di], DEXT[di]);
      for (let k = 1; k < bestLen; k++) { const p = i + k; if (p + 2 < data.length) { const h = H(p); prev[p] = head[h]; head[h] = p; } }
      i += bestLen;
    } else { lit(w, data[i]); i++; }
  }
  lit(w, 256); return w.done();
}
export function deflate(data) { const raw = deflateRaw(data); const a = adler32(data); const out = new Uint8Array(raw.length + 6); out[0] = 0x78; out[1] = 0x01; out.set(raw, 2); out.set([a >>> 24, (a >>> 16) & 255, (a >>> 8) & 255, a & 255], raw.length + 2); return out; }

