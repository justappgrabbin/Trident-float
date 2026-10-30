import { evaluateIR } from './predicate-ir.mjs';

function evaluator(candidate) {
  if (typeof candidate === 'function') return candidate;
  return (state) => Boolean(evaluateIR(candidate, { state }));
}

export async function verifyPredicateFaithfulness({ states, reference, candidate, stopAfter = 20 }) {
  const ref = evaluator(reference);
  const cand = evaluator(candidate);
  const mismatches = [];
  let checked = 0;
  for (const state of states) {
    checked++;
    const expected = Boolean(await ref(state));
    const actual = Boolean(await cand(state));
    if (expected !== actual) {
      mismatches.push({ state: structuredClone(state), expected, actual });
      if (mismatches.length >= stopAfter) break;
    }
  }
  return { faithful: mismatches.length === 0, checked, mismatches };
}

export function verifyValue(expected, actual) {
  return { faithful: Object.is(expected, actual), expected, actual };
}

