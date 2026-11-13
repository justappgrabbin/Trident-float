// Appositional Transformation Operators, as defined in Klein et al. (~1981, "Revolt in Flatland").
// Same operator as Alexis's klein-iching-ato-mesh.ts `ato` (bitwise XNOR, vendored in vendor/klein-final-engines/),
// re-expressed over arbitrary-length bit arrays (hers is limited to <=31-bit integers). Test checks they agree.
// States are arrays of 0/1, or '-' ("does not apply") for the paper's 3-valued variant.
/** *ab — strong equivalence (00->1, 01->0, 10->0, 11->1). 3-valued: '-' on either side -> '-'. */
export function ato(a, b) {
  if (a.length !== b.length) throw new Error('ATO needs equal-length states');
  return a.map((x, i) => (x === '-' || b[i] === '-' ? '-' : x === b[i] ? 1 : 0));
}
/** X:Y::Z:?  ->  ? = *Z(*XY) */
export const analogy = (X, Y, Z) => ato(Z, ato(X, Y));
/** ((X::Y)::(Z::W))::(P::?)  ->  ? = *P(*(*XY)(*ZW)) */
export const complexAnalogy = (X, Y, Z, W, P) => ato(P, ato(ato(X, Y), ato(Z, W)));
/** Patterns behind patterns: level 0 = states, level n+1 = ATOs between consecutive items of level n. */
export function atoTree(states, depth = 2) { const levels = [states]; for (let d = 0; d < depth && levels[d].length > 1; d++) levels.push(levels[d].slice(1).map((s, i) => ato(levels[d][i], s))); return levels; }
/** Planning: reach E instead of D without changing ATOs: A,B,C -> *A(*DE), *B(*DE), *C(*DE). */
export const replan = (states, D, E) => { const k = ato(D, E); return states.map((s) => ato(s, k)); };
export const bits = (s) => [...s].map((c) => (c === '-' ? '-' : +c));
export const str = (a) => a.join('');

// ---- visual feature arrays (no words): 8 bits per region/block from measured primitives ----
// bits: Y bin (3 bits, 0..7 of 32 levels), Cb>0, Cr>0, texture bin (2 bits), vertical-edge-dominant.
const TEX_CUTS = [100, 250, 400];
export function featureBits({ Y, Cb, Cr, texture, vertical }) {
  const y = Math.max(0, Math.min(7, Math.floor(Y / 32))), t = TEX_CUTS.findIndex((c) => texture < c), tb = t === -1 ? 3 : t;
  return [(y >> 2) & 1, (y >> 1) & 1, y & 1, Cb > 0 ? 1 : 0, Cr > 0 ? 1 : 0, (tb >> 1) & 1, tb & 1, vertical ? 1 : 0];
}
export function decodeFeatureBits(f) { const y = f[0] * 4 + f[1] * 2 + f[2], tb = f[5] * 2 + f[6]; return { Y: y * 32 + 16, cbSign: f[3] ? 1 : -1, crSign: f[4] ? 1 : -1, texture: [50, 175, 325, 500][tb], vertical: !!f[7] }; }

