// Pure Synthia Automata — merged from integrated-tool-factory-v1_5_0/src/integrated-tool-factory.mjs (DimensionRouter)

import { DIMENSIONS, DIMENSION_META } from '../state-space/constants.js';

const words = value => String(value ?? '').toLowerCase().match(/[a-z0-9']+/g) || [];

/**
 * Dimension vocabularies. Core term lists are the contract's; each is extended
 * with ~10 apt terms harvested from the factory's seed vocab. Interrogative /
 * operation / seedGate come from state-space DIMENSION_META, resolving the
 * cross-source conflict in favor of the factory/SynthiaOS majority:
 * Movement=Where, Being=When.
 */
export const DIMENSION_VOCABULARIES = Object.freeze({
  Movement: Object.freeze([
    'move', 'go', 'where', 'transition', 'change', 'travel', 'path', 'shift',
    'begin', 'start', 'run', 'flow', 'journey', 'impulse', 'action',
    // factory seed extensions
    'energy', 'adventure', 'drive', 'initiative', 'desire', 'hope',
    'activity', 'vigor', 'persistence', 'endurance',
  ]),
  Evolution: Object.freeze([
    'what', 'evolve', 'grow', 'learn', 'adapt', 'memory', 'remember',
    'transform', 'become', 'develop', 'pattern', 'history', 'gravity',
    // factory seed extensions
    'love', 'growth', 'potential', 'capacity', 'understanding', 'gratitude',
    'acceptance', 'substance', 'ground', 'earth',
  ]),
  Being: Object.freeze([
    'when', 'be', 'exist', 'body', 'survive', 'present', 'now', 'witness',
    'is', 'am', 'matter', 'touch', 'alive',
    // factory seed extensions
    'joy', 'sadness', 'conflict', 'justice', 'peace', 'worry',
    'sleep', 'friction', 'dispute', 'litigation',
  ]),
  Design: Object.freeze([
    'why', 'design', 'structure', 'plan', 'build', 'shape', 'form',
    'architect', 'compose', 'arrange', 'smell', 'frame',
    // factory seed extensions
    'code', 'art', 'progress', 'wealth', 'possession', 'greatness',
    'abundance', 'power', 'owning', 'enterprise',
  ]),
  Space: Object.freeze([
    'who', 'integrate', 'space', 'person', 'relation', 'field', 'hear',
    'context', 'meaning', 'personality', 'network', 'whole',
    // factory seed extensions
    'connect', 'observe', 'view', 'study', 'contemplate', 'perception',
    'perspective', 'sight', 'behold', 'gaze',
  ]),
});

/**
 * Routes free text to one of the five dimensions by vocabulary match.
 * route(text) -> {status:'resolved', dimension, score, seedGate, interrogative, operation, tokens}
 *             | {status:'unresolved', reason:'NO_DIMENSION_MATCH', ranked}
 *             | {status:'ambiguous', reason:'DIMENSION_TIE', candidates}
 */
export class DimensionRouter {
  constructor(vocabularies = DIMENSION_VOCABULARIES) {
    this.spaces = new Map(DIMENSIONS.map(name => {
      const meta = DIMENSION_META[name];
      const terms = vocabularies[name] || [];
      return [name, { ...meta, counts: new Map(terms.map(t => [t, 1])) }];
    }));
  }

  /** Learn: fold additional text into a dimension's term counts. */
  ingest(dimension, text) {
    const space = this.spaces.get(dimension);
    if (!space) throw new Error(`UNKNOWN_DIMENSION: ${dimension}`);
    for (const term of words(text)) space.counts.set(term, (space.counts.get(term) || 0) + 1);
    return this;
  }

  route(text) {
    const tokens = words(text);
    const ranked = [...this.spaces]
      .map(([dimension, s]) => ({
        dimension,
        score: tokens.reduce((n, t) => n + (s.counts.get(t) || 0), 0),
        seedGate: s.seedGate,
        interrogative: s.interrogative,
        operation: s.operation,
      }))
      .sort((a, b) => b.score - a.score || a.dimension.localeCompare(b.dimension));
    if (!ranked[0] || !ranked[0].score) {
      return Object.freeze({ status: 'unresolved', reason: 'NO_DIMENSION_MATCH', ranked: Object.freeze(ranked) });
    }
    const top = ranked.filter(x => x.score === ranked[0].score);
    if (top.length > 1) {
      return Object.freeze({ status: 'ambiguous', reason: 'DIMENSION_TIE', candidates: Object.freeze(top) });
    }
    return Object.freeze({ status: 'resolved', ...ranked[0], tokens: Object.freeze(tokens) });
  }
}

export default DimensionRouter;

