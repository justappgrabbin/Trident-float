// Pure Synthia Automata — emergence: EmergenceDetector (§15 three-criteria emergence measurement, fed by mesh/channel stats)

/**
 * EmergenceDetector — ported from
 *   pure-synthia-pass4-step41-REPAIRED/src/emergence/detector.js
 *
 * Implements the §15 operational definition of emergence as a measurement
 * apparatus. A structure Y is emergent iff ALL three criteria hold:
 *   1. NOVELTY     Y ∉ StoredSolutions (not explicitly stored)
 *   2. GENERATION  Y = F(P, O, C) — complete derivation provenance
 *                  (built from registered primitives and operators)
 *   3. EVALUATION  Y independently satisfies the evaluation criteria
 *
 * Plus two adaptations that feed OUR mesh/channel stats:
 *   - testCrossScaleEmergence: operator behavior transfer to a new scale
 *     (source method; threshold 0.5 tagged IMPLEMENTATION_CHOICE);
 *   - testChannelEmergence: an EmergentChannels crossing record is emergent
 *     when it is novel (never registered as stored), generated (both endpoint
 *     automata are registered on the mesh) and PERSISTENT (promoted by
 *     repeated use — our channels.js promotion is the persistence criterion).
 *
 * Frame-reset provenance:
 *   - the 3-criteria test (stored / generated / evaluated): SOURCE_STATEMENT,
 *     detector.js testEmergence (§15 criterion; the source file self-describes
 *     as the Category B measurement apparatus for it).
 *   - cross-scale transfer threshold >= 0.5: IMPLEMENTATION_CHOICE
 *     (bare constant in detector.js testCrossScaleEmergence).
 *   - channel persistence = crossing.promoted: DERIVED_RESULT of our
 *     mesh/channels.js promotion rule (uses >= CHANNEL_PROMOTION_THRESHOLD),
 *     used here as the persistence criterion — IMPLEMENTATION_CHOICE mapping.
 *
 * Source defects NOT propagated (see docs/MERGE_NOTES.md):
 *   - _hashSolution used JSON.stringify(solution, Object.keys(solution).sort())
 *     — a replacer ARRAY, which silently drops every nested key not present at
 *     the top level, so solutions differing only in nested fields hash
 *     identically (false novelty verdicts). Replaced by hashObject
 *     (stableStringify + FNV-1a, recursive canonical key order).
 *   - Date.now() in emergence records -> counter-derived `seq`.
 *   - testCrossScaleEmergence assumed engine.operators.get + op.apply; our
 *     operator table exposes operatorById + transform — adapted.
 *
 * Determinism: no wall-clock, no randomness; hashObject is FNV-1a over the
 * canonical serialization.
 */

import { hashObject } from '../engine/derivation.js';
import { operatorById } from '../state-space/operators.js';

const SOURCE = 'pure-synthia-pass4-step41-REPAIRED/src/emergence/detector.js';

const provenance = (status, note) => Object.freeze({ status, source: SOURCE, note });

/** Provenance registry for every behavioral parameter of this module. */
export const DETECTOR_PROVENANCE = Object.freeze({
  threeCriteria: provenance('SOURCE_STATEMENT', '§15: not-stored AND generated-with-provenance AND independently-satisfies-criteria, detector.js testEmergence'),
  transferThreshold: provenance('IMPLEMENTATION_CHOICE', '0.5 cross-scale transfer rate, detector.js testCrossScaleEmergence'),
  channelPersistence: provenance('IMPLEMENTATION_CHOICE', 'persistence criterion mapped to EmergentChannels promotion (uses >= 3), an adaptation feeding our mesh/channel stats'),
});

export class EmergenceDetector {
  constructor({ engine = null, transferThreshold = 0.5 } = {}) {
    this.engine = engine;
    this.transferThreshold = transferThreshold; // IMPLEMENTATION_CHOICE (see DETECTOR_PROVENANCE)
    this.storedSolutions = new Set();
    this.emergenceLog = [];
    this._seq = 0;
  }

  /** Register a solution as explicitly stored (non-emergent by definition). */
  registerStored(solution) {
    const hash = this.#hashSolution(solution);
    this.storedSolutions.add(hash);
    return hash;
  }

  /** Test whether a derivation represents emergent structure per §15. */
  testEmergence(derivation, evaluationCriteria = null) {
    // ADAPTED: our Derivation carries `output` (the source used `result`).
    const result = derivation && (derivation.output !== undefined ? derivation.output : derivation.result);
    if (result === null || result === undefined) {
      return { derivationId: derivation && derivation.id, emergent: false, reason: 'no_result', criteria: { stored: null, generated: null, evaluated: null } };
    }

    // Criterion 1 (novelty): Y was not explicitly stored.
    const resultHash = this.#hashSolution(result);
    const wasStored = this.storedSolutions.has(resultHash);

    // Criterion 2 (generation): Y was generated from registered primitives and operators.
    const primitives = Array.isArray(derivation.primitives) ? derivation.primitives : [];
    const operators = Array.isArray(derivation.operators) ? derivation.operators : [];
    const generated = primitives.length > 0 && operators.length > 0;

    // Criterion 3 (evaluation): Y independently satisfies evaluation criteria.
    let satisfiesCriteria = true;
    let criteriaResults = null;
    if (evaluationCriteria) {
      criteriaResults = this.#evaluateCriteria(result, evaluationCriteria);
      satisfiesCriteria = criteriaResults.passed;
    }

    const emergent = !wasStored && generated && satisfiesCriteria;
    const record = {
      derivationId: derivation.id || null,
      emergent,
      wasStored,
      generated,
      satisfiesCriteria,
      criteriaResults,
      resultHash,
      primitiveCount: primitives.length,
      operatorCount: operators.length,
      seq: ++this._seq, // counter-derived; the source used Date.now()
      provenance: DETECTOR_PROVENANCE.threeCriteria,
    };
    this.emergenceLog.push(record);
    return record;
  }

  /** Batch test a set of derivations (SOURCE_STATEMENT: detector.js batchTest). */
  batchTest(derivations, criteria = null) {
    const results = (derivations || []).map((d) => this.testEmergence(d, criteria));
    const emergentCount = results.filter((r) => r.emergent).length;
    return {
      total: results.length,
      emergent: emergentCount,
      nonEmergent: results.length - emergentCount,
      rate: results.length > 0 ? emergentCount / results.length : 0,
      results,
    };
  }

  /**
   * Whether an operator's behavior at a new scale counts as emergent
   * (SOURCE_STATEMENT: detector.js testCrossScaleEmergence), ADAPTED to our
   * operator table (operatorById + transform; arity may be 'variadic').
   */
  testCrossScaleEmergence(operatorId, sourceScale, targetScale, testCases = []) {
    const storedKey = `operator:${operatorId}:scale:${targetScale}`;
    const wasStoredApplicable = this.storedSolutions.has(storedKey);

    const op = typeof operatorById === 'function' ? operatorById(operatorId) : null;
    if (!op) {
      return { operatorId, sourceScale, targetScale, emergent: false, reason: 'operator_not_found' };
    }

    let successCount = 0;
    for (const tc of testCases) {
      try {
        const adapted = (tc.operands || []).map((o) => (
          o && typeof o === 'object' ? { ...o, scale: targetScale } : o
        ));
        if (typeof op.transform === 'function') op.transform(adapted, tc.context || {});
        successCount++;
      } catch { /* rejected operands count as non-transfer */ }
    }

    const transferRate = testCases.length > 0 ? successCount / testCases.length : 0;
    const emergent = !wasStoredApplicable && transferRate >= this.transferThreshold;

    const record = {
      operatorId,
      sourceScale,
      targetScale,
      emergent,
      wasStoredApplicable,
      transferRate,
      successCount,
      totalTests: testCases.length,
      seq: ++this._seq,
      provenance: DETECTOR_PROVENANCE.transferThreshold,
    };
    this.emergenceLog.push({ ...record, derivationId: null });
    return record;
  }

  /**
   * ADAPTATION: emergence of a persistent channel from mesh crossing stats.
   *   novelty     — the crossing was never registered as a stored solution;
   *   generation  — both endpoint automata are registered on the mesh (when an
   *                 engine/mesh is wired; otherwise assumed);
   *   persistence — the crossing PROMOTED (repeated useful interaction,
   *                 mesh/channels.js: uses >= CHANNEL_PROMOTION_THRESHOLD).
   */
  testChannelEmergence(crossing) {
    if (!crossing || typeof crossing.a !== 'string' || typeof crossing.b !== 'string') {
      return { emergent: false, reason: 'invalid_crossing' };
    }
    const channelKey = `channel:${crossing.a}~${crossing.b}`;
    const novel = !this.storedSolutions.has(channelKey);
    const mesh = this.engine && this.engine.mesh;
    const generated = mesh && typeof mesh.get === 'function'
      ? Boolean(mesh.get(crossing.a)) && Boolean(mesh.get(crossing.b))
      : true;
    const persistent = crossing.promoted === true;
    const emergent = novel && generated && persistent;
    const record = {
      channel: channelKey,
      a: crossing.a,
      b: crossing.b,
      uses: crossing.uses || 0,
      emergent,
      novel,
      generated,
      persistent,
      seq: ++this._seq,
      provenance: DETECTOR_PROVENANCE.channelPersistence,
    };
    this.emergenceLog.push({ ...record, derivationId: null });
    return record;
  }

  summary() {
    const emergent = this.emergenceLog.filter((r) => r.emergent);
    return {
      totalTested: this.emergenceLog.length,
      emergentCount: emergent.length,
      rate: this.emergenceLog.length > 0 ? emergent.length / this.emergenceLog.length : 0,
    };
  }

  toJSON() {
    return {
      storedCount: this.storedSolutions.size,
      logSize: this.emergenceLog.length,
      summary: this.summary(),
      recent: this.emergenceLog.slice(-20),
    };
  }

  // Defect fix: canonical recursive serialization + FNV-1a (see header note).
  #hashSolution(solution) {
    try {
      return `sol:${hashObject(solution)}`;
    } catch {
      return `sol:${hashObject(String(solution))}`;
    }
  }

  // SOURCE_STATEMENT: detector.js _evaluateCriteria — every predicate must
  // return truthy; a throwing predicate counts as failed.
  #evaluateCriteria(result, criteria) {
    const checks = {};
    let passed = true;
    for (const [key, testFn] of Object.entries(criteria)) {
      try {
        checks[key] = Boolean(testFn(result));
        if (!checks[key]) passed = false;
      } catch {
        checks[key] = false;
        passed = false;
      }
    }
    return { passed, checks };
  }
}

export default EmergenceDetector;

