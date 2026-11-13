// Pure Synthia Automata — the 26 grapheme states (L1) with candidate addresses, sounds, colors (spec §8)

import { DIMENSIONS } from './constants.js';
import { addressForArcSec, arcSecForAddress } from './addressing.js';
import { soundFor } from './sounds.js';
import { colorFor } from './colors.js';

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

// common English phoneme classes per grapheme (ids from features.js PHONEMES)
const LETTER_PHONEMES = {
  a: ['p.ei', 'p.ae', 'p.ah', 'p.schwa'],
  b: ['p.b'],
  c: ['p.k', 'p.s'],
  d: ['p.d'],
  e: ['p.i', 'p.eh', 'p.schwa'],
  f: ['p.f'],
  g: ['p.g', 'p.dzh'],
  h: ['p.h'],
  i: ['p.ai', 'p.ih', 'p.i'],
  j: ['p.dzh'],
  k: ['p.k'],
  l: ['p.l'],
  m: ['p.m'],
  n: ['p.n'],
  o: ['p.ou', 'p.ah', 'p.aw'],
  p: ['p.p'],
  q: ['p.k', 'p.w'],
  r: ['p.r'],
  s: ['p.s', 'p.z'],
  t: ['p.t'],
  u: ['p.u', 'p.uh', 'p.ooh'],
  v: ['p.v'],
  w: ['p.w'],
  x: ['p.k', 'p.s'],
  y: ['p.j', 'p.i', 'p.ai'],
  z: ['p.z'],
};

// Candidate address for alphabet index i (hypothesis-labeled, H3-controlled):
//   gate = (i mod 64)+1 · line = (i mod 6)+1 · color = ((i+1) mod 6)+1
//   tone = ((i+2) mod 6)+1 · base = (i mod 5)+1 · dimension = DIMENSIONS[i mod 5]
function candidateAddressFor(index) {
  const partial = {
    gate: (index % 64) + 1,
    line: (index % 6) + 1,
    color: ((index + 1) % 6) + 1,
    tone: ((index + 2) % 6) + 1,
    base: (index % 5) + 1,
  };
  const full = addressForArcSec(arcSecForAddress(partial));
  full.planetaryDimension = DIMENSIONS[index % 5];
  return full;
}

export const LETTERS = Object.freeze(
  'abcdefghijklmnopqrstuvwxyz'.split('').map((char, index) => {
    const candidateAddress = candidateAddressFor(index);
    return Object.freeze({
      char,
      index,
      kind: VOWELS.has(char) ? 'vowel' : 'consonant', // vowels = open states, consonants = gated states
      phonemes: LETTER_PHONEMES[char],
      candidateAddress,
      sound: soundFor(candidateAddress),
      color: colorFor(candidateAddress),
    });
  })
);

const BY_CHAR = new Map(LETTERS.map((l) => [l.char, l]));

// full grapheme state for a character (case-insensitive); null for non-letters
export function letterState(char) {
  return BY_CHAR.get(String(char).toLowerCase()) || null;
}

