// Pure Synthia Automata — complexity ledger: the 7-tuple cost record per execution (spec §12)

/**
 * ComplexityLedger — the complexity tuple (Np, Ns, Ne, No, Dr, Ac, Tc) from
 * spec §12, recorded on every automaton run and merged by the engine per call.
 *
 * Fields:
 *   primitivesActivated (Np) — primitive states touched
 *   statesGenerated     (Ns) — new states produced
 *   edgesTraversed      (Ne) — mesh edges crossed
 *   operationsExecuted  (No) — operator applications
 *   recursionDepth      (Dr) — maximum recursion depth observed (high-water mark)
 *   activeAutomata      (Ac) — automata active at peak (high-water mark)
 *   transitionCount     (Tc) — named transitions fired (spec §7)
 *
 * Merge semantics: count fields sum; Dr and Ac are high-water marks (max).
 */

const FIELDS = [
  'primitivesActivated',
  'statesGenerated',
  'edgesTraversed',
  'operationsExecuted',
  'recursionDepth',
  'activeAutomata',
  'transitionCount',
];

// High-water fields merge by max instead of sum.
const MAX_FIELDS = new Set(['recursionDepth', 'activeAutomata']);

export class ComplexityLedger {
  constructor() {
    this.primitivesActivated = 0;
    this.statesGenerated = 0;
    this.edgesTraversed = 0;
    this.operationsExecuted = 0;
    this.recursionDepth = 0;
    this.activeAutomata = 0;
    this.transitionCount = 0;
  }

  /**
   * Record a delta. Accepts a partial object with any of the 7 fields;
   * unknown fields are ignored. Returns this (chainable).
   */
  record(delta = {}) {
    for (const field of FIELDS) {
      const value = delta[field];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      if (MAX_FIELDS.has(field)) {
        if (value > this[field]) this[field] = value;
      } else {
        this[field] += value;
      }
    }
    return this;
  }

  /** Plain-object copy of the 7-tuple. */
  snapshot() {
    return {
      primitivesActivated: this.primitivesActivated,
      statesGenerated: this.statesGenerated,
      edgesTraversed: this.edgesTraversed,
      operationsExecuted: this.operationsExecuted,
      recursionDepth: this.recursionDepth,
      activeAutomata: this.activeAutomata,
      transitionCount: this.transitionCount,
    };
  }

  /**
   * Merge another ledger (or a plain ledger-shaped object, e.g. an
   * Automaton.run() result ledger) into this one. Returns this (chainable).
   */
  merge(other) {
    if (!other) return this;
    const source = other instanceof ComplexityLedger ? other.snapshot() : other;
    return this.record(source);
  }

  toJSON() {
    return this.snapshot();
  }
}

