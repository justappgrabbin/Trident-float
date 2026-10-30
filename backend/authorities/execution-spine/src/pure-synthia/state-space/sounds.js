// Pure Synthia Automata — deterministic structure→sound map (harmonic syntax, spec §5)

import { DIMENSION_META, ZODIAC_ARCSECONDS } from './constants.js';
import { transitionById } from './transitions.js';

export const BASE_FREQUENCY = 432; // A4 = 432 Hz
export const SCALEGRAM = [0, 2, 5, 7, 9, 10]; // hexagram scale degrees for lines 1-6
export const TIMBRES = ['sine', 'triangle', 'square', 'sawtooth', 'pulse', 'noise']; // color 1-6
export const DURATIONS = [0.25, 0.5, 1, 1.5, 2, 4]; // beats, tone 1-6 (staccato 1/16 … legato whole)
export const VELOCITIES = [0.4, 0.55, 0.7, 0.85, 1.0]; // base 1-5

// Full sound state for a canonical address.
// zodiac(1-12) → pitchClass = zodiac-1 (A♭=0 … G=11)
// cents = arcSecWithinSign / 108000 * 100 (micro-detune within the sign)
// f(state) = 432 * 2^((octave*12 + pitchClass + scaleDegree + cents/100 - 57)/12)   (spec §5 formula)
export function soundFor(address) {
  const dim = address.planetaryDimension || 'Being';
  const octave = (DIMENSION_META[dim] || DIMENSION_META.Being).octave;
  const pitchClass = (address.zodiac || 1) - 1;
  const arcSec = address.arcSecond ?? 0;
  const arcSecWithinSign = ((arcSec % ZODIAC_ARCSECONDS) + ZODIAC_ARCSECONDS) % ZODIAC_ARCSECONDS;
  const cents = (arcSecWithinSign / ZODIAC_ARCSECONDS) * 100;
  const scaleDegree = SCALEGRAM[(address.line || 1) - 1];
  const freq = BASE_FREQUENCY * Math.pow(2, (octave * 12 + pitchClass + scaleDegree + cents / 100 - 57) / 12);
  return {
    freq,
    cents,
    octave,
    pitchClass,
    scaleDegree,
    timbre: TIMBRES[(address.color || 1) - 1],
    duration: DURATIONS[(address.tone || 1) - 1],
    velocity: VELOCITIES[(address.base || 1) - 1],
    rhythmicSlot: (address.house || 1) - 1, // 0-7 slot in the 8-beat cycle
  };
}

// soundFor(address) modified by a named transition's soundEffect (transitions.js).
// Numeric modulators (gliss, transpose, octaveShift, velocityScale) retune the
// sound deterministically; symbolic modulators (chord, loop, rest, …) are carried
// through as annotations for the renderer.
export function transitionSound(transitionId, address) {
  const sound = soundFor(address);
  const t = transitionById(transitionId);
  if (!t) return { ...sound, transition: null };
  const fx = t.soundEffect || {};
  const out = { ...sound, transition: t.id };
  if (typeof fx.gliss === 'number') {
    out.gliss = fx.gliss;
    out.targetFreq = out.freq * Math.pow(2, fx.gliss / 12); // rising/falling glide target
  }
  if (typeof fx.transpose === 'number') {
    out.transpose = fx.transpose;
    out.freq *= Math.pow(2, fx.transpose / 12);
  }
  if (typeof fx.octaveShift === 'number') {
    out.octave += fx.octaveShift;
    out.freq *= Math.pow(2, fx.octaveShift);
  }
  if (typeof fx.velocityScale === 'number') {
    out.velocity = Math.min(1, Math.max(0, out.velocity * fx.velocityScale));
  }
  if (typeof fx.duration === 'number') out.duration = fx.duration;
  if (fx.rest === true) { out.duration = 0; out.velocity = 0; }
  for (const [k, v] of Object.entries(fx)) {
    if (!(k in out) && !['gliss', 'transpose', 'octaveShift', 'velocityScale'].includes(k)) out[k] = v;
  }
  return out;
}

