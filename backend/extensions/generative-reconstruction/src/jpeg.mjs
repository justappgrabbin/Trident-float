// Pure-JS baseline (sequential Huffman) JPEG decoder -> RGBA. Progressive/arithmetic JPEG: not supported (investigating).
import { ZIGZAG, idct } from './dct.mjs';
export function isJpeg(b) { return b[0] === 0xff && b[1] === 0xd8; }
export function decodeJpeg(bytes) {
  if (!isJpeg(bytes)) throw new Error('jpeg: bad SOI');
  const qt = [], hts = { 0: [], 1: [] }; let frame = null, restart = 0, adobe = null, o = 2;
  const u16 = (i) => (bytes[i] << 8) | bytes[i + 1];
  for (;;) {
    while (bytes[o] !== 0xff) o++; while (bytes[o] === 0xff) o++; const m = bytes[o++];
    if (m === 0xd9) break; if (m >= 0xd0 && m <= 0xd7) continue;
    const len = u16(o), seg = bytes.subarray(o + 2, o + len);
    if (m === 0xdb) { for (let p = 0; p < seg.length;) { const pq = seg[p] >> 4, tq = seg[p] & 15; p++; const t = new Int32Array(64); for (let i = 0; i < 64; i++) { t[ZIGZAG[i]] = pq ? (seg[p] << 8) | seg[p + 1] : seg[p]; p += pq ? 2 : 1; } qt[tq] = t; } }
    else if (m === 0xc4) { for (let p = 0; p < seg.length;) { const tc = seg[p] >> 4, th = seg[p] & 15; const counts = seg.subarray(p + 1, p + 17); p += 17; const map = new Map(); let code = 0, k = 0; const syms = seg.subarray(p); for (let l = 1; l <= 16; l++) { for (let i = 0; i < counts[l - 1]; i++) map.set((l << 16) | code++, syms[k++]); code <<= 1; } p += k; hts[tc][th] = map; } }
    else if (m === 0xc0 || m === 0xc1) { frame = { h: u16(o + 3), w: u16(o + 5), comps: [] }; for (let i = 0; i < seg[5]; i++) { const b = 6 + i * 3; frame.comps.push({ id: seg[b], hs: seg[b + 1] >> 4, vs: seg[b + 1] & 15, tq: seg[b + 2] }); } }
    else if (m === 0xc2 || m === 0xc3 || (m >= 0xc5 && m <= 0xcf && m !== 0xc8 && m !== 0xcc)) throw new Error('jpeg: only baseline/extended sequential Huffman JPEG is supported (progressive: investigating)');
    else if (m === 0xdd) restart = u16(o + 2);
    else if (m === 0xee && String.fromCharCode(...seg.subarray(0, 5)) === 'Adobe') adobe = seg[11];
    else if (m === 0xda) {
      const ns = seg[0], sc = []; for (let i = 0; i < ns; i++) { const c = frame.comps.find((x) => x.id === seg[1 + i * 2]); c.dc = hts[0][seg[2 + i * 2] >> 4]; c.ac = hts[1][seg[2 + i * 2] & 15]; sc.push(c); }
      o = o + len; o = decodeScan(bytes, o, frame, sc, qt, restart); continue;
    }
    o += len;
  }
  return toRgba(frame, adobe);
}
function decodeScan(bytes, o, frame, sc, qt, restart) {
  const hmax = Math.max(...frame.comps.map((c) => c.hs)), vmax = Math.max(...frame.comps.map((c) => c.vs));
  const mcux = Math.ceil(frame.w / (8 * hmax)), mcuy = Math.ceil(frame.h / (8 * vmax));
  for (const c of frame.comps) { c.bw = mcux * c.hs; c.bh = mcuy * c.vs; c.pix ||= new Uint8Array(c.bw * 8 * c.bh * 8); c.pred = 0; }
  let acc = 0, n = 0;
  const bit = () => { if (n === 0) { let b = bytes[o]; if (b === 0xff) { const nx = bytes[o + 1]; if (nx === 0) o += 2; else { b = 0; } if (nx !== 0) { acc = 0; n = 8; return 0; } } else o++; acc = b; n = 8; } n--; return (acc >> n) & 1; };
  const recv = (s) => { let v = 0; for (let i = 0; i < s; i++) v = (v << 1) | bit(); return v; };
  const ext = (v, s) => (s && v < 1 << (s - 1) ? v - (1 << s) + 1 : v);
  const huff = (map) => { let code = 0; for (let l = 1; l <= 16; l++) { code = (code << 1) | bit(); const s = map.get((l << 16) | code); if (s !== undefined) return s; } throw new Error('jpeg: bad huffman code'); };
  const F = new Float64Array(64), f = new Float64Array(64);
  const block = (c, by, bx) => {
    F.fill(0); const q = qt[c.tq]; const t = huff(c.dc); c.pred += t ? ext(recv(t), t) : 0; F[0] = c.pred * q[0];
    for (let k = 1; k < 64;) { const rs = huff(c.ac), r = rs >> 4, s = rs & 15; if (!s) { if (r !== 15) break; k += 16; continue; } k += r; const z = ZIGZAG[k]; F[z] = ext(recv(s), s) * q[z]; k++; }
    idct(F, f); const W = c.bw * 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = Math.round(f[y * 8 + x] + 128); c.pix[(by * 8 + y) * W + bx * 8 + x] = v < 0 ? 0 : v > 255 ? 255 : v; }
  };
  const single = sc.length === 1; const total = single ? Math.ceil(Math.ceil(frame.w * sc[0].hs / hmax) / 8) * Math.ceil(Math.ceil(frame.h * sc[0].vs / vmax) / 8) : mcux * mcuy;
  const sbw = single ? Math.ceil(Math.ceil(frame.w * sc[0].hs / hmax) / 8) : 0;
  for (let m = 0; m < total; m++) {
    if (restart && m && m % restart === 0) { n = 0; while (!(bytes[o] === 0xff && bytes[o + 1] >= 0xd0 && bytes[o + 1] <= 0xd7)) o++; o += 2; for (const c of sc) c.pred = 0; }
    if (single) block(sc[0], Math.floor(m / sbw), m % sbw);
    else { const my = Math.floor(m / mcux), mx = m % mcux; for (const c of sc) for (let v = 0; v < c.vs; v++) for (let h = 0; h < c.hs; h++) block(c, my * c.vs + v, mx * c.hs + h); }
  }
  while (o < bytes.length && !(bytes[o] === 0xff && bytes[o + 1] !== 0 && !(bytes[o + 1] >= 0xd0 && bytes[o + 1] <= 0xd7))) o++;
  return o;
}
function toRgba(frame, adobe) {
  const { w, h, comps } = frame, hmax = Math.max(...comps.map((c) => c.hs)), vmax = Math.max(...comps.map((c) => c.vs)), out = new Uint8Array(w * h * 4);
  const get = (c, x, y) => c.pix[Math.floor((y * c.vs) / vmax) * c.bw * 8 + Math.floor((x * c.hs) / hmax)];
  const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; out[i + 3] = 255;
    if (comps.length === 1) { out[i] = out[i + 1] = out[i + 2] = get(comps[0], x, y); continue; }
    const Y = get(comps[0], x, y), cb = get(comps[1], x, y) - 128, cr = get(comps[2], x, y) - 128;
    if (comps.length === 3 && adobe !== 0) { out[i] = cl(Y + 1.402 * cr); out[i + 1] = cl(Y - 0.344136 * cb - 0.714136 * cr); out[i + 2] = cl(Y + 1.772 * cb); }
    else if (comps.length === 3) { out[i] = Y; out[i + 1] = cb + 128; out[i + 2] = cr + 128; }
    else throw new Error('jpeg: CMYK not supported (investigating)');
  }
  return { width: w, height: h, data: out };
}

