// Feeds the visual primitives to Alexis's Klein tools (vendored byte-exact, unchanged) and does a grammar-level transform.
// Import her modules directly (dist/index.js runs her demo pipeline on import).
import kmesh from '../vendor/kmge_v5_fixed/dist/klein-mesh-game-engine.js';
import ksense from '../vendor/kmge_v5_fixed/dist/sensory-adapter.js';
import { analyze, synthesize } from '../../generative-reconstruction/src/layers.mjs';
import { blockPrimitives, segment, blockToken, describe, rowSequences } from './primitives.mjs';
export const { CompGramCoder, DiseMinerEngine, AutolingGrammar } = kmesh;
export const { SensoryInputAdapter } = ksense;

/** `an` may come from GenerativeImageStore.load(address) so the read runs on her addressed layers. */
export function readImage(img, { k = 4, an: given = null } = {}) {
  const an = given ?? analyze(img), prims = blockPrimitives(an), lab = segment(prims, k), tokens = prims.map((p, i) => blockToken(p, lab[i]));
  const { regions, relations } = describe(an, prims, lab, k), rows = rowSequences(an, tokens);
  // 1) CompGramCoder: classify every distinct token with left/right context, then learnFromSequence.
  const cgc = new CompGramCoder(), distinct = [...new Set(tokens)], codes = {};
  for (const t of distinct) codes[t] = cgc.classify(t).codes;
  for (const r of rows) cgc.learnFromSequence(r.map((t) => cgc.classify(t)));
  // 2) SensoryInputAdapter.sightFromVisualData -> DiseMinerEngine.ingestObservation (her intended path).
  const sense = new SensoryInputAdapter();
  const obs = sense.sightFromVisualData({ frameIndex: 0, pixels: img.data, objects: regions.map((R) => ({ id: R.id, x: R.centroid.x, y: R.centroid.y, width: R.bbox.width, height: R.bbox.height, embedding: [R.meanY / 255, R.meanCb / 128, R.meanCr / 128, R.meanTexture / 255], confidence: 0.8 })), relations });
  const dm = new DiseMinerEngine(); dm.ingestObservation(obs, 'image:photo');
  // 3) AutolingGrammar learns the image's row grammar.
  const ag = new AutolingGrammar('image:photo'); const log = console.log; let parsedOk = 0; console.log = (m) => { if (String(m).includes('PARSED OK')) parsedOk++; };
  try { for (const r of rows) ag.learnFromSequence(r); } finally { console.log = log; }
  return {
    an, prims, lab, tokens, regions, relations, rows,
    compGramCoder: { distinctTokens: distinct.length, codes, allMisc: Object.values(codes).every((c) => c.length === 1 && c[0] === 'MISC'), triads: cgc.getTriadCount() },
    diseminer: { stems: dm.exportStems().map((s) => s.stem), links: dm.exportDirectLinks(), reachable: Object.fromEntries(regions.map((R) => [R.id, dm.getReachable(R.id)])) },
    autoling: { stats: ag.getStats(), rules: ag.getRules().length, rowsAlreadyParsable: parsedOk, firstRowParses: ag.canYouSay(rows[0]), ag },
  };
}
/** Grammar-level rewrite: every token of region class `cls` -> recoloured variant. Only that class's chroma DC changes; texture/edges and every other block untouched. */
export function recolorClass(read, cls, { degrees = 120 } = {}) {
  const { an, lab } = read, th = (degrees * Math.PI) / 180, [, Cb, Cr] = an.coefs;
  const out = { ...an, coefs: an.coefs.map((c) => Float64Array.from(c)) }, rule = { lhs: `R${cls}.*`, rhs: `R${cls}'.* (chroma DC rotated ${degrees}°)` };
  let changed = 0;
  for (let b = 0; b < lab.length; b++) if (lab[b] === cls) { const o = b * 64, u = Cb[o], v = Cr[o]; out.coefs[1][o] = u * Math.cos(th) - v * Math.sin(th); out.coefs[2][o] = u * Math.sin(th) + v * Math.cos(th); changed++; }
  return { rule, changedBlocks: changed, image: synthesize(out), baseline: synthesize(an) };
}
/** Readable learned structure (JSON-safe). */
export function learnedStructure(read) {
  return { regions: read.regions, relations: read.relations, rowGrammarSample: read.rows.slice(0, 3),
    compGramCoder: read.compGramCoder, diseminer: read.diseminer,
    autoling: { stats: read.autoling.stats, rules: read.autoling.rules, rowsAlreadyParsable: read.autoling.rowsAlreadyParsable, firstRules: read.autoling.ag.getRules().slice(0, 3) } };
}
/** Max channel diff outside / inside class `cls` between two RGBA images (block grid of `read`). */
export function regionDiff(read, a, b, cls) {
  const W = a.width, bx = read.an.bx; let outside = 0, inside = 0;
  for (let i = 0; i < W * a.height; i++) { const blk = ((((i / W) | 0) >> 3) * bx) + ((i % W) >> 3); for (let c = 0; c < 3; c++) { const d = Math.abs(a.data[i * 4 + c] - b.data[i * 4 + c]); if (read.lab[blk] === cls) inside = Math.max(inside, d); else outside = Math.max(outside, d); } }
  return { maxDiffOutside: outside, maxDiffInside: inside };
}
import { featureBits, decodeFeatureBits, analogy } from './ato.mjs';
/** Region feature state (binary array) from the read. */
export function regionState(read, cls) {
  const R = read.regions[cls]; let v = 0, n = 0; read.prims.forEach((p, i) => { if (read.lab[i] === cls) { n++; if (p.edge.dir === 'vertical') v++; } });
  return featureBits({ Y: R.meanY, Cb: R.meanCb, Cr: R.meanCr, texture: R.meanTexture, vertical: v / n > 0.5 });
}
/** Visual ATO analogy A:B::C:?  — new feature state, rendered onto region C's blocks (others untouched). */
export function visualAnalogy(read, a, b, c) { return renderFeatureState(read, a, b, c); }
/** Render feature state Q (default: the ATO answer) onto region c. */
export function renderFeatureState(read, a, b, c, Qin = null) {
  const A = regionState(read, a), B = regionState(read, b), C = regionState(read, c), Q = Qin ?? analogy(A, B, C), tgt = decodeFeatureBits(Q), src = decodeFeatureBits(C);
  const out = { ...read.an, coefs: read.an.coefs.map((x) => Float64Array.from(x)) }, R = read.regions[c], acScale = tgt.texture / src.texture;
  for (let blk = 0; blk < read.lab.length; blk++) if (read.lab[blk] === c) {
    const o = blk * 64; out.coefs[0][o] += (tgt.Y - R.meanY) * 8; // shift DC by the analogy's brightness change, keep the block's own variation
    out.coefs[1][o] = tgt.cbSign * Math.abs(out.coefs[1][o]); out.coefs[2][o] = tgt.crSign * Math.abs(out.coefs[2][o]);
    for (let k = 1; k < 64; k++) out.coefs[0][o + k] *= acScale;
  }
  return { A, B, C, result: Q, decoded: tgt, image: synthesize(out), baseline: synthesize(read.an) };
}

