// Visual primitives read straight from genrec's addressed DCT layers (no words in between).
// Per 8x8 block: DC brightness/colour, edge direction+strength from first AC terms, texture energy per layer band.
import { DEFAULT_BANDS } from '../../generative-reconstruction/src/layers.mjs';
export function blockPrimitives(an, bands = DEFAULT_BANDS) {
  const n = an.bx * an.by, [Y, Cb, Cr] = an.coefs, out = new Array(n);
  for (let b = 0; b < n; b++) {
    const o = b * 64, h = Y[o + 1], v = Y[o + 2]; // zigzag 1 = horizontal freq (vertical edge), 2 = vertical freq (horizontal edge)
    const energy = bands.map(([a, z]) => { let s = 0; for (let k = Math.max(a, 1); k < z; k++) s += Y[o + k] ** 2; return Math.sqrt(s); });
    out[b] = { block: b, x: b % an.bx, y: Math.floor(b / an.bx), Y: Y[o] / 8 + 128, Cb: Cb[o] / 8, Cr: Cr[o] / 8,
      edge: { strength: Math.hypot(h, v), dir: Math.abs(h) >= Math.abs(v) ? 'vertical' : 'horizontal' }, textureByLayer: energy };
  }
  return out;
}
/** Deterministic k-means on (Y, Cb, Cr) DC: k region classes. */
export function segment(prims, k = 4, iters = 12) {
  const f = (p) => [p.Y, p.Cb * 1.5, p.Cr * 1.5], pts = prims.map(f), sorted = [...pts].sort((a, b) => a[0] - b[0]);
  let c = Array.from({ length: k }, (_, i) => [...sorted[Math.floor(((i + 0.5) / k) * sorted.length)]]);
  const lab = new Int32Array(pts.length);
  for (let it = 0; it < iters; it++) {
    pts.forEach((p, i) => { let best = 0, bd = Infinity; c.forEach((q, j) => { const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < bd) { bd = d; best = j; } }); lab[i] = best; });
    c = c.map((q, j) => { const m = [0, 0, 0]; let cnt = 0; pts.forEach((p, i) => { if (lab[i] === j) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; cnt++; } }); return cnt ? m.map((v) => v / cnt) : q; });
  }
  // order classes dark -> bright so ids are stable
  const order = c.map((q, j) => [q[0], j]).sort((a, b) => a[0] - b[0]).map((x) => x[1]), remap = new Int32Array(k); order.forEach((j, r) => { remap[j] = r; });
  return Int32Array.from(lab, (l) => remap[l]);
}
const lvl = (v, cuts, names) => names[cuts.findIndex((c) => v < c) === -1 ? names.length - 1 : cuts.findIndex((c) => v < c)];
/** Token for one block: built only from measured primitives (labels are measurement bins, not meanings). */
export function blockToken(p, cls) {
  const tex = p.textureByLayer.reduce((a, b) => a + b, 0);
  return `R${cls}.${lvl(tex, [20, 80], ['flat', 'grain', 'rough'])}.${p.edge.strength > 30 ? 'e' + p.edge.dir[0] : 'e0'}`;
}
/** Regions, relations (adjacency, contains, gradient, symmetry) as plain structured data. */
export function describe(an, prims, lab, k) {
  const { bx, by } = an, regions = [];
  for (let r = 0; r < k; r++) {
    let n = 0, sx = 0, sy = 0, x0 = bx, y0 = by, x1 = -1, y1 = -1, Ys = 0, Cbs = 0, Crs = 0, tex = 0, mir = 0;
    prims.forEach((p, i) => { if (lab[i] !== r) return; n++; sx += p.x; sy += p.y; Ys += p.Y; Cbs += p.Cb; Crs += p.Cr; tex += p.textureByLayer.reduce((a, b) => a + b, 0); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); if (lab[p.y * bx + (bx - 1 - p.x)] === r) mir++; });
    regions.push({ id: `R${r}`, blocks: n, share: +(n / prims.length).toFixed(4), centroid: { x: +(sx / n).toFixed(2), y: +(sy / n).toFixed(2) }, bbox: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }, meanY: +(Ys / n).toFixed(1), meanCb: +(Cbs / n).toFixed(1), meanCr: +(Crs / n).toFixed(1), meanTexture: +(tex / n).toFixed(1), mirrorSymmetry: +(mir / n).toFixed(3) });
  }
  const adj = new Map();
  for (let y = 0; y < by; y++) for (let x = 0; x < bx; x++) { const a = lab[y * bx + x]; for (const [dx, dy] of [[1, 0], [0, 1]]) { if (x + dx >= bx || y + dy >= by) continue; const b = lab[(y + dy) * bx + x + dx]; if (a === b) continue; const key = a < b ? `${a}|${b}` : `${b}|${a}`; adj.set(key, (adj.get(key) || 0) + 1); } }
  const relations = [];
  for (const [key, cnt] of adj) { const [a, b] = key.split('|').map(Number); relations.push({ subject: `R${a}`, predicate: 'adjacent', object: `R${b}`, confidence: +Math.min(1, cnt / 50).toFixed(3), sharedEdges: cnt }); }
  for (const A of regions) for (const B of regions) {
    if (A === B) continue; const a = A.bbox, b = B.bbox;
    if (a.x > b.x && a.y > b.y && a.x + a.width < b.x + b.width && a.y + a.height < b.y + b.height) relations.push({ subject: B.id, predicate: 'contains', object: A.id, confidence: 0.6 });
    if (adj.has([+A.id.slice(1), +B.id.slice(1)].sort().join('|')) && A.meanY - B.meanY > 20) relations.push({ subject: A.id, predicate: 'brighter_than', object: B.id, confidence: +Math.min(1, (A.meanY - B.meanY) / 100).toFixed(3) });
  }
  for (const R of regions) if (R.mirrorSymmetry > 0.5) relations.push({ subject: R.id, predicate: 'mirror_symmetric', object: R.id, confidence: R.mirrorSymmetry });
  return { regions, relations };
}
/** Row scans -> run-length token sequences ("sentences" of the image). */
export function rowSequences(an, tokens) { const seqs = []; for (let y = 0; y < an.by; y++) { const s = []; for (let x = 0; x < an.bx; x++) { const t = tokens[y * an.bx + x]; if (s[s.length - 1] !== t) s.push(t); } seqs.push(s); } return seqs; }

