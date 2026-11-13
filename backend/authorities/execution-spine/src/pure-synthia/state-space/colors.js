// Pure Synthia Automata — deterministic structure→color map (visual syntax, spec §6)

import { WHEEL_ARCSECONDS } from './constants.js';
import { arcSecForAddress } from './addressing.js';
import { transitionById } from './transitions.js';

// 6 HD Colors — named low-saturation warm palette anchors (spec §6)
export const COLOR_ANCHORS = Object.freeze({
  1: '#8C4A2F', // Appetite (earth-red)
  2: '#C28E3C', // Taste (ochre)
  3: '#3C6E8C', // Thirst (water-blue)
  4: '#6E8C3C', // Touch (moss)
  5: '#7A5A8C', // Sound (violet-ash)
  6: '#D9C98C', // Light (pale gold)
});

// dimension → rendering layer (spec §6)
export const DIMENSION_LAYERS = Object.freeze({
  Movement: 'stroke', Evolution: 'fill', Being: 'glow', Design: 'frame', Space: 'ground',
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// hue = totalArcSec / 1296000 * 360 (the wheel IS the spectrum)
// sat = 30 + line*10 (line 6 = 90%) · light = 25 + tone*7 · layer from dimension
export function colorFor(address) {
  const arcSec = address.arcSecond ?? arcSecForAddress(address);
  const hue = (((arcSec % WHEEL_ARCSECONDS) + WHEEL_ARCSECONDS) % WHEEL_ARCSECONDS) / WHEEL_ARCSECONDS * 360;
  const sat = 30 + (address.line || 1) * 10;
  const light = 25 + (address.tone || 1) * 7;
  const dim = address.planetaryDimension || 'Being';
  return {
    hue,
    sat,
    light,
    hex: hslToHex(hue, sat, light),
    layer: DIMENSION_LAYERS[dim] || 'glow',
  };
}

// colorFor(address) modified by a named transition's colorEffect (transitions.js).
// hueShift/satShift/lightShift/satSet retune the color and re-render hex;
// symbolic effects (hueHold, valueInvert, frame, …) annotate for the renderer.
export function transitionColor(transitionId, address) {
  const color = colorFor(address);
  const t = transitionById(transitionId);
  if (!t) return { ...color, transition: null };
  const fx = t.colorEffect || {};
  const out = { ...color, transition: t.id };
  let changed = false;
  if (typeof fx.hueShift === 'number') { out.hue = ((out.hue + fx.hueShift) % 360 + 360) % 360; changed = true; }
  if (typeof fx.hueWalk === 'number') { out.hue = ((out.hue + fx.hueWalk) % 360 + 360) % 360; changed = true; }
  if (typeof fx.satShift === 'number') { out.sat = clamp(out.sat + fx.satShift, 0, 100); changed = true; }
  if (typeof fx.lightShift === 'number') { out.light = clamp(out.light + fx.lightShift, 0, 100); changed = true; }
  if (typeof fx.satSet === 'number') { out.sat = clamp(fx.satSet, 0, 100); changed = true; }
  if (fx.valueInvert === true) { out.light = 100 - out.light; changed = true; }
  if (changed) out.hex = hslToHex(out.hue, out.sat, out.light);
  for (const [k, v] of Object.entries(fx)) {
    if (!(k in out) && !['hueShift', 'hueWalk', 'satShift', 'lightShift', 'satSet', 'valueInvert'].includes(k)) out[k] = v;
  }
  return out;
}

// standard HSL (h 0-360, s/l 0-100) → #RRGGBB
export function hslToHex(h, s, l) {
  const H = (((h % 360) + 360) % 360) / 360;
  const S = clamp(s, 0, 100) / 100;
  const L = clamp(l, 0, 100) / 100;
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
  const p = 2 * L - q;
  const chan = (t0) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const to2 = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${to2(chan(H + 1 / 3))}${to2(chan(H))}${to2(chan(H - 1 / 3))}`;
}

