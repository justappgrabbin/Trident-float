// Orthonormal 8x8 DCT-II / DCT-III and zigzag order.
export const ZIGZAG = [0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63];
export const C = new Float64Array(64); // C[u*8+x]
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) C[u * 8 + x] = (u === 0 ? Math.sqrt(1 / 8) : Math.sqrt(2 / 8)) * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
const tmp = new Float64Array(64);
/** f: 64 spatial (row-major) -> out: 64 natural-order coefficients */
export function fdct(f, out) {
  for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += C[u * 8 + x] * f[y * 8 + x]; tmp[y * 8 + u] = s; }
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let y = 0; y < 8; y++) s += C[v * 8 + y] * tmp[y * 8 + u]; out[v * 8 + u] = s; }
  return out;
}
export function idct(F, out) {
  for (let v = 0; v < 8; v++) for (let x = 0; x < 8; x++) { let s = 0; for (let u = 0; u < 8; u++) s += C[u * 8 + x] * F[v * 8 + u]; tmp[v * 8 + x] = s; }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let s = 0; for (let v = 0; v < 8; v++) s += C[v * 8 + y] * tmp[v * 8 + x]; out[y * 8 + x] = s; }
  return out;
}
/** Basis image for zigzag index k (64 values, row-major). */
export function basis(k) { const n = ZIGZAG[k], v = n >> 3, u = n & 7, b = new Float64Array(64); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) b[y * 8 + x] = C[v * 8 + y] * C[u * 8 + x]; return b; }

