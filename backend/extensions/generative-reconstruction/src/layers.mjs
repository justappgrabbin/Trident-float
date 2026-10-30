// Frequency decomposition into addressed coefficient layers (coarse -> fine) and reconstruction from any subset.
// Layers are stored in an exact-address chunk store compatible with morphmir-memory's ExactChunkMemory
// (morphmir://chunk|manifest/<sha256>, sha256 per chunk, supersedes links). The image manifest lives at
// genrec://image/<sourceSha256>.
import { ZIGZAG, fdct, idct } from './dct.mjs';
import { toYCbCr, fromYCbCr } from './image.mjs';
import { sha256Hex } from '../../translation-layer/src/sha256.mjs';
import { ExactChunkMemory } from '../../morphmir-memory/src/index.mjs';

export const DEFAULT_BANDS = Object.freeze([[0, 1], [1, 3], [3, 10], [10, 21], [21, 36], [36, 64]]); // zigzag [from,to)
export const COEF_SCALE = 4; // stored as Int16 of round(coef * COEF_SCALE)
export const imageAddress = (sha) => `genrec://image/${sha}`;

/** RGBA -> per-channel block coefficient planes. coefs[ch][block*64 + zigzagIndex] (Float64). */
export function analyze(img) {
  const bx = Math.ceil(img.width / 8), by = Math.ceil(img.height / 8), planes = toYCbCr(img), f = new Float64Array(64), F = new Float64Array(64);
  const coefs = planes.map((p) => {
    const out = new Float64Array(bx * by * 64);
    for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const yy = Math.min(j * 8 + y, img.height - 1), xx = Math.min(i * 8 + x, img.width - 1); f[y * 8 + x] = p[yy * img.width + xx] - 128; }
      fdct(f, F); const o = (j * bx + i) * 64; for (let k = 0; k < 64; k++) out[o + k] = F[ZIGZAG[k]];
    }
    return out;
  });
  return { width: img.width, height: img.height, bx, by, coefs };
}
/** Coefficient planes -> RGBA. */
export function synthesize({ width, height, bx, by, coefs }) {
  const F = new Float64Array(64), f = new Float64Array(64);
  const planes = coefs.map((c) => {
    const p = new Float64Array(width * height);
    for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
      const o = (j * bx + i) * 64; for (let k = 0; k < 64; k++) F[ZIGZAG[k]] = c[o + k]; idct(F, f);
      for (let y = 0; y < 8; y++) { const yy = j * 8 + y; if (yy >= height) break; for (let x = 0; x < 8; x++) { const xx = i * 8 + x; if (xx >= width) break; p[yy * width + xx] = f[y * 8 + x] + 128; } }
    }
    return p;
  });
  return fromYCbCr(planes, width, height);
}
function packBand(an, [a, b]) {
  const n = an.bx * an.by, len = b - a, arr = new Int16Array(3 * n * len); let q = 0;
  for (const c of an.coefs) for (let blk = 0; blk < n; blk++) for (let k = a; k < b; k++) arr[q++] = Math.max(-32768, Math.min(32767, Math.round(c[blk * 64 + k] * COEF_SCALE)));
  const bytes = new Uint8Array(arr.length * 2); for (let i = 0; i < arr.length; i++) { bytes[2 * i] = arr[i] & 255; bytes[2 * i + 1] = (arr[i] >> 8) & 255; } return bytes;
}
function unpackBand(bytes, an, [a, b]) {
  const n = an.bx * an.by; let q = 0;
  for (const c of an.coefs) for (let blk = 0; blk < n; blk++) for (let k = a; k < b; k++) { let v = bytes[2 * q] | (bytes[2 * q + 1] << 8); if (v & 0x8000) v -= 0x10000; c[blk * 64 + k] = v / COEF_SCALE; q++; }
}

/** Addressed generative store. `memory` may be a shared ExactChunkMemory (e.g. the one inside MorphMirMemory). */
export class GenerativeImageStore {
  constructor({ memory = new ExactChunkMemory(), bands = DEFAULT_BANDS } = {}) { this.memory = memory; this.bands = bands; this.manifests = new Map(); this.latestByName = new Map(); }
  /** Decompose and store. `sourceBytes` (optional) is also kept byte-exact in the same chunk store. */
  store(name, img, { sourceBytes = null } = {}) {
    const rgbaSha = sha256Hex(img.data), sourceSha = sourceBytes ? sha256Hex(sourceBytes) : rgbaSha;
    const exact = sourceBytes ? this.memory.store(`${name}#original`, sourceBytes) : null;
    const an = analyze(img);
    const layers = this.bands.map((band, index) => {
      const m = this.memory.store(`${name}#layer${index}`, packBand(an, band), { chunkSize: 1 << 16 });
      return Object.freeze({ index, band: Object.freeze([...band]), address: m.address, sha256: m.sha256, byteLength: m.byteLength, supersedes: m.supersedes });
    });
    const prior = this.latestByName.get(name) ?? null;
    const manifest = Object.freeze({ schema: 'synthia.generative-reconstruction.v1', address: imageAddress(sourceSha), name, width: img.width, height: img.height, blocksX: an.bx, blocksY: an.by, color: 'YCbCr-BT601-full', transform: 'dct8x8-orthonormal-zigzag', coefScale: COEF_SCALE, rgbaSha256: rgbaSha, sourceSha256: sourceSha, exactOriginal: exact ? exact.address : null, layers: Object.freeze(layers), supersedes: prior && prior !== imageAddress(sourceSha) ? prior : null });
    this.manifests.set(manifest.address, manifest); this.latestByName.set(name, manifest.address); return manifest;
  }
  manifest(address) { const m = this.manifests.get(address); if (!m) throw new Error(`no generative manifest at ${address}`); return m; }
  /** Load coefficient planes using only the given layer indices (default: all available). Missing/corrupt layers -> zeros. */
  load(address, { layers = null } = {}) {
    const m = this.manifest(address), an = { width: m.width, height: m.height, bx: m.blocksX, by: m.blocksY, coefs: [0, 1, 2].map(() => new Float64Array(m.blocksX * m.blocksY * 64)) };
    const used = [], missing = [];
    for (const L of m.layers) {
      if (layers && !layers.includes(L.index)) continue;
      try { const { bytes } = this.memory.rebuild(L.address); unpackBand(bytes, an, L.band); used.push(L.index); } catch (e) { missing.push({ index: L.index, reason: e.code || e.message }); }
    }
    return { ...an, used, missing };
  }
  reconstruct(address, opts) { const an = this.load(address, opts); return { image: synthesize(an), used: an.used, missing: an.missing }; }
  /** Byte-exact original (if stored) via the morphmir exact-address chunks. */
  exactOriginal(address) { const m = this.manifest(address); if (!m.exactOriginal) return null; return this.memory.rebuild(m.exactOriginal).bytes; }
}

