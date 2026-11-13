// Pure Synthia Automata — dimensional perspectives and projection T_{i→j} (spec §3)

import { DIMENSIONS, DIMENSION_META } from './constants.js';

// Per-dimension behavioral chains (contract): the four-step micro-program each
// perspective runs on a state. Design's chain has five steps per contract.
export const DIMENSION_CHAINS = Object.freeze({
  Movement:  ['wait', 'prepare', 'move', 'transition'],
  Evolution: ['retain', 'notice-change', 'adapt', 'transform'],
  Being:     ['remain-self', 'notice-other', 'relate', 'negotiate-relation'],
  Design:    ['sense', 'classify', 'build', 'test', 'mount'],
  Space:     ['witness', 'integrate', 'express', 'complete'],
});

// T_{i→j}: re-tag a state into another dimensional perspective.
// Identity is preserved; the representation is re-derived (Representation(X|Di) ≠
// Representation(X|Dj), hypothesis H4 — measured, never asserted).
export function projectDimension(state, fromDim, toDim) {
  if (!DIMENSIONS.includes(toDim)) {
    throw new RangeError(`unknown target dimension ${toDim}; expected one of ${DIMENSIONS.join(', ')}`);
  }
  const from = fromDim ?? state?.dimension ?? state?.planetaryDimension ?? null;
  const meta = DIMENSION_META[toDim];
  const identity = state?.identity ?? state?.id ?? state?.char ?? state?.value ?? state;
  return {
    identity,
    dimension: toDim,
    representation: {
      perspective: toDim,
      interrogative: meta.interrogative,
      operation: meta.operation,
      seedGate: meta.seedGate,
      octave: meta.octave,
      chain: DIMENSION_CHAINS[toDim],
      prior: state?.representation ?? state ?? null,
      projectedFrom: from,
    },
    transition: `T_{${from || '?'}→${toDim}}`,
  };
}

