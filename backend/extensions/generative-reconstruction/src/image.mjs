// Image helpers: decode any supported bytes, color transforms, metrics, resize.
import { decodePng, encodePng, isPng } from './png.mjs';
import { decodeJpeg, isJpeg } from './jpeg.mjs';
export function decodeImage(bytes) { if (isPng(bytes)) return decodePng(bytes); if (isJpeg(bytes)) return decodeJpeg(bytes); throw new Error('unsupported image format (PNG and baseline JPEG supported)'); }
export { encodePng };
export function toYCbCr({ width, height, data }) {
  const n = width * height, Y = new Float64Array(n), Cb = new Float64Array(n), Cr = new Float64Array(n);
  for (let i = 0; i < n; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; Y[i] = 0.299 * r + 0.587 * g + 0.114 * b; Cb[i] = -0.168736 * r - 0.331264 * g + 0.5 * b + 128; Cr[i] = 0.5 * r - 0.418688 * g - 0.081312 * b + 128; }
  return [Y, Cb, Cr];
}
export function fromYCbCr([Y, Cb, Cr], width, height) {
  const out = new Uint8Array(width * height * 4), cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  for (let i = 0; i < width * height; i++) { const y = Y[i], cb = Cb[i] - 128, cr = Cr[i] - 128; out[i * 4] = cl(y + 1.402 * cr); out[i * 4 + 1] = cl(y - 0.344136 * cb - 0.714136 * cr); out[i * 4 + 2] = cl(y + 1.772 * cb); out[i * 4 + 3] = 255; }
  return { width, height, data: out };
}
/** PSNR over RGB (alpha ignored) and max absolute channel error. */
export function psnr(a, b) {
  let se = 0, max = 0, n = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) { const d = a.data[i + c] - b.data[i + c]; se += d * d; n++; if (Math.abs(d) > max) max = Math.abs(d); }
  const mse = se / n; return { psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse), mse, maxError: max };
}
/** Box downscale by an integer factor. */
export function downscale(img, f) {
  const w = Math.floor(img.width / f), h = Math.floor(img.height / f), out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) { let s = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += img.data[((y * f + j) * img.width + x * f + i) * 4 + c]; out[(y * w + x) * 4 + c] = Math.round(s / (f * f)); }
  return { width: w, height: h, data: out };
}

