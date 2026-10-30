// Pure Synthia Automata — emergence: IntentEngine (observes derivations, records capability gaps, proposes primitives/operators/rules)

/**
 * IntentEngine — ported from
 *   pure-synthia-pass4-step41-REPAIRED/src/emergence/intent.js
 *
 * The self-teaching observer: every derivation (engine.call path) and every
 * learning result (engine.request path) is observed; the engine infers what
 * the system was trying to do, checks whether the intent was satisfied, and
 * on failure records an explicit capability GAP plus a PROPOSAL object
 * {id, kind:'primitive'|'operator'|'rule', spec, confidence,
 *  evidenceDerivationIds, provenance}.
 *
 * Unique vs engine/learning.js: the orchestrator already routes/grows/recalls,
 * but it keeps no explicit gap records and emits no confidence-weighted
 * proposal objects — that gap/proposal layer is what this port adds.
 *
 * Frame-reset provenance:
 *   - intent-type inference table (o_bundle+o_sequence -> compose_structure,
 *     o_automaton -> compute, o_discourse -> communicate, o_project -> reframe,
 *     o_transform -> modify, error -> resolve_error): SOURCE_STATEMENT,
 *     intent.js _inferIntent.
 *   - satisfaction rule (no result / error result / uncomposed primitive set
 *     -> unsatisfied): SOURCE_STATEMENT, intent.js _checkSatisfaction,
 *     ADAPTED to our Derivation shape (output / evaluation.accepted instead of
 *     result.type).
 *   - gap types operator_failure / no_composition / computation_failure:
 *     SOURCE_STATEMENT, intent.js _identifyGap. The 'unrouted' gap (request
 *     path had to GROW because no capability matched) is an ADAPTATION to our
 *     learning modes: IMPLEMENTATION_CHOICE.
 *   - proposal confidences 0.5 / 0.6 / 0.7 and confidenceThreshold 0.7,
 *     learningRate 0.1: bare constants in the source — IMPLEMENTATION_CHOICE.
 *
 * Source defects NOT propagated (see docs/MERGE_NOTES.md):
 *   - Date.now() in intent/gap records and in `primitive:auto:${Date.now()}`
 *     proposal-application ids (non-deterministic) -> counter-derived seqs/ids.
 *   - applyProposal assumed engine.derivations is a Map and called a
 *     non-existent engine.registerPrimitive -> application is delegated to the
 *     wired SelfEditor (engine.editor).
 *
 * Determinism: no wall-clock, no randomness. All ids are per-engine counters;
 * records carry `seq` instead of timestamps.
 */

const SOURCE = 'pure-synthia-pass4-step41-REPAIRED/src/emergence/intent.js';

const provenance = (status, note) => Object.freeze({ status, source: SOURCE, note });

/** Provenance registry for every behavioral parameter of this module. */
export const INTENT_PROVENANCE = Object.freeze({
  intentInference: provenance('SOURCE_STATEMENT', 'operator-pattern -> intent-type table, intent.js _inferIntent'),
  satisfactionRule: provenance('SOURCE_STATEMENT', 'intent.js _checkSatisfaction, adapted to Derivation.output / evaluation.accepted'),
  gapTypes: provenance('SOURCE_STATEMENT', 'operator_failure / no_composition / computation_failure, intent.js _identifyGap'),
  unroutedGap: provenance('IMPLEMENTATION_CHOICE', "adaptation: learning mode 'grown' means no registered capability matched the request"),
  proposalConfidences: provenance('IMPLEMENTATION_CHOICE', 'bare constants 0.5/0.6/0.7 in intent.js _proposeSolution'),
  confidenceThreshold: provenance('IMPLEMENTATION_CHOICE', '0.7 gate on applyProposal, intent.js constructor'),
  learningRate: provenance('IMPLEMENTATION_CHOICE', '0.1, intent.js constructor (parity field; not consumed by the source either)'),
});

export class IntentEngine {
  constructor({ engine = null, confidenceThreshold = 0.7, learningRate = 0.1 } = {}) {
    this.engine = engine;
    this.confidenceThreshold = confidenceThreshold; // IMPLEMENTATION_CHOICE (see INTENT_PROVENANCE)
    this.learningRate = learningRate; // IMPLEMENTATION_CHOICE (parity with source)
    this.intents = []; // observed intents
    this.gaps = []; // explicit capability-gap records
    this.proposals = []; // confidence-weighted growth proposals
    this._intentSeq = 0;
    this._gapSeq = 0;
    this._proposalSeq = 0;
  }

  /**
   * Observe one execution record. Accepts either:
   *   - a Derivation (engine.call path): has `operators`/`primitives` arrays;
   *   - a LearningResult (engine.request path): has a `mode` field
   *     ('known-call' | 'learned-recall' | 'routed' | 'emergent-channel' |
   *     'grown'). 'known-call' results are skipped here because engine.call
   *     already observed the underlying Derivation (no double counting).
   * Returns { intent, satisfied, gap, proposal } (gap/proposal null when satisfied).
   */
  observe(record, context = {}) {
    if (!record || typeof record !== 'object') {
      return { intent: null, satisfied: true, gap: null, proposal: null, skipped: 'empty_record' };
    }
    if (record.mode === 'known-call') {
      return { intent: null, satisfied: true, gap: null, proposal: null, skipped: 'already_observed_via_call' };
    }
    return record.mode ? this.#observeLearning(record, context) : this.#observeDerivation(record, context);
  }

  // ---------------- derivation path (engine.call) ----------------

  #observeDerivation(derivation, context) {
    const intent = this.#inferIntent(derivation, context);
    this.intents.push(intent);
    const satisfied = this.#checkSatisfaction(derivation);
    if (satisfied) return { intent, satisfied, gap: null, proposal: null };

    const gap = this.#identifyGap(intent, derivation);
    this.gaps.push(gap);
    const proposal = this.#proposeSolution(gap, [derivation.id].filter(Boolean));
    if (proposal) this.proposals.push(proposal);
    return { intent, satisfied, gap, proposal };
  }

  // SOURCE_STATEMENT: intent.js _inferIntent — operator-pattern table,
  // ADAPTED: error detection reads our Derivation (evaluation.accepted /
  // output.ok) since our derivations have no result.type === 'error'.
  #inferIntent(derivation, context) {
    const operators = Array.isArray(derivation.operators) ? derivation.operators : [];
    const primitives = Array.isArray(derivation.primitives) ? derivation.primitives : [];
    const failed = derivation.evaluation && derivation.evaluation.accepted === false;

    let intentType = 'unknown';
    if (operators.includes('o_bundle') && operators.includes('o_sequence')) {
      intentType = 'compose_structure';
    } else if (operators.includes('o_automaton')) {
      intentType = 'compute';
    } else if (operators.includes('o_discourse')) {
      intentType = 'communicate';
    } else if (operators.includes('o_project')) {
      intentType = 'reframe';
    } else if (operators.includes('o_transform')) {
      intentType = 'modify';
    } else if (failed) {
      intentType = 'resolve_error';
    }

    return {
      id: `intent-${++this._intentSeq}`,
      type: intentType,
      operators: [...operators],
      primitiveCount: primitives.length,
      outputOk: derivation.output && typeof derivation.output === 'object' ? derivation.output.ok !== false : derivation.output != null,
      context: { ...context },
      seq: this._intentSeq, // counter-derived; the source used Date.now()
    };
  }

  // SOURCE_STATEMENT: intent.js _checkSatisfaction, ADAPTED to our shape:
  // unsatisfied when there is no output, when the chain was not accepted, or
  // when the output is an explicit failure record ({ok:false}).
  #checkSatisfaction(derivation) {
    if (derivation.output === null || derivation.output === undefined) return false;
    if (derivation.evaluation && derivation.evaluation.accepted === false) return false;
    if (derivation.output && typeof derivation.output === 'object' && derivation.output.ok === false) return false;
    return true;
  }

  // SOURCE_STATEMENT: intent.js _identifyGap (gap types), ADAPTED: `missing`
  // carries the failing tool ids from chainResults (or all primitives when the
  // failure is not attributable to one call).
  #identifyGap(intent, derivation) {
    const failedCalls = (Array.isArray(derivation.chainResults) ? derivation.chainResults : [])
      .filter((r) => r && r.accepted === false)
      .map((r) => r.tool);
    const missing = failedCalls.length ? failedCalls : [...(derivation.primitives || [])];
    return {
      id: `gap-${++this._gapSeq}`,
      intentType: intent.type,
      gapType: 'operator_failure',
      missing,
      derivationId: derivation.id || null,
      seq: this._gapSeq,
      provenance: INTENT_PROVENANCE.gapTypes,
    };
  }

  // SOURCE_STATEMENT: intent.js _proposeSolution (proposal shapes);
  // confidences are IMPLEMENTATION_CHOICE (bare constants in the source).
  #proposeSolution(gap, evidenceDerivationIds) {
    const base = {
      id: `proposal-${++this._proposalSeq}`,
      evidenceDerivationIds: [...evidenceDerivationIds],
      gapId: gap.id,
      seq: this._proposalSeq,
      applied: null,
    };
    if (gap.gapType === 'operator_failure') {
      return {
        ...base,
        kind: 'operator',
        spec: {
          target: gap.missing[0] || null,
          adjust: 'acceptance',
          description: `Relax acceptance criteria for ${gap.missing[0] || 'unknown'}`,
        },
        confidence: 0.5,
        provenance: INTENT_PROVENANCE.proposalConfidences,
      };
    }
    if (gap.gapType === 'no_composition') {
      return {
        ...base,
        kind: 'primitive',
        spec: { description: 'Create composite primitive from uncomposed set' },
        confidence: 0.6,
        provenance: INTENT_PROVENANCE.proposalConfidences,
      };
    }
    if (gap.gapType === 'computation_failure') {
      return {
        ...base,
        kind: 'operator',
        spec: { description: 'Add missing transition to FSM' },
        confidence: 0.7,
        provenance: INTENT_PROVENANCE.proposalConfidences,
      };
    }
    if (gap.gapType === 'unrouted') {
      return {
        ...base,
        kind: 'primitive',
        spec: {
          description: 'Consolidate the grown tool as a reusable primitive',
          purpose: gap.request || null,
          grownToolId: gap.missing[0] || null,
        },
        confidence: 0.6,
        provenance: INTENT_PROVENANCE.unroutedGap,
      };
    }
    return null;
  }

  // ---------------- learning-result path (engine.request) ----------------

  // ADAPTATION (IMPLEMENTATION_CHOICE): our learning modes carry the gap
  // signal. 'grown' means no canonical/grown/emergent capability matched —
  // an 'unrouted' capability gap; routed/recall/emergent modes are satisfied
  // intents. 'learned-recall' additionally confirms a prior growth.
  #observeLearning(result, context) {
    const satisfied = result.mode !== 'grown';
    const intent = {
      id: `intent-${++this._intentSeq}`,
      type: result.mode === 'grown' ? 'unknown' : 'compute',
      operators: [],
      primitiveCount: result.toolId ? 1 : 0,
      mode: result.mode,
      toolId: result.toolId || null,
      score: typeof result.score === 'number' ? result.score : null,
      context: { ...context },
      seq: this._intentSeq,
    };
    this.intents.push(intent);
    if (satisfied) return { intent, satisfied, gap: null, proposal: null };

    const gap = {
      id: `gap-${++this._gapSeq}`,
      intentType: intent.type,
      gapType: 'unrouted',
      missing: [result.toolId || 'capability'],
      request: result.request ?? context.request ?? null,
      derivationId: result.derivationId || null,
      intakeId: result.intakeId || null,
      seq: this._gapSeq,
      provenance: INTENT_PROVENANCE.unroutedGap,
    };
    this.gaps.push(gap);
    const proposal = this.#proposeSolution(gap, [result.derivationId, result.intakeId].filter(Boolean));
    if (proposal) this.proposals.push(proposal);
    return { intent, satisfied, gap, proposal };
  }

  // ---------------- proposal application ----------------

  /**
   * Apply a proposal (by id or index) when its confidence clears the
   * threshold (0.7 — IMPLEMENTATION_CHOICE, intent.js applyProposal).
   * ADAPTED: the source called a non-existent engine.registerPrimitive; here
   * 'primitive' proposals are delegated to the wired SelfEditor so the
   * application is itself a versioned, derivation-hashed, reversible edit.
   */
  applyProposal(idOrIndex) {
    const proposal = typeof idOrIndex === 'number'
      ? this.proposals[idOrIndex]
      : this.proposals.find((p) => p.id === idOrIndex);
    if (!proposal) return { applied: false, reason: 'proposal_not_found' };
    if (proposal.confidence < this.confidenceThreshold) {
      return { applied: false, reason: 'insufficient_confidence' };
    }
    if (proposal.kind === 'primitive') {
      const editor = this.engine && this.engine.editor;
      if (!editor || typeof editor.addPrimitiveFromPattern !== 'function') {
        return { applied: false, reason: 'editor_not_wired' };
      }
      const primitive = editor.addPrimitiveFromPattern({
        identity: `proposal_${proposal.id}`,
        contrast: 'proposed',
        position: 'emergence',
        dependencies: [...proposal.evidenceDerivationIds],
        proposalId: proposal.id,
      });
      proposal.applied = primitive.id;
      return { applied: true, created: primitive.id, editSeq: this.engine.editor.edits.length };
    }
    return { applied: false, reason: 'unhandled_proposal_kind' };
  }

  // ---------------- reports (parity with intent.js summary/toJSON) ----------------

  summary() {
    return {
      intents: this.intents.length,
      gaps: this.gaps.length,
      proposals: this.proposals.length,
      satisfactionRate: this.intents.length > 0
        ? (this.intents.length - this.gaps.length) / this.intents.length
        : 0,
      topIntents: this.#top(this.intents, (i) => i.type),
      topGaps: this.#top(this.gaps, (g) => g.gapType),
    };
  }

  #top(list, keyOf) {
    const counts = {};
    for (const item of list) {
      const key = keyOf(item);
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }

  toJSON() {
    return {
      intents: this.intents.length,
      gaps: this.gaps.length,
      proposals: this.proposals.length,
      summary: this.summary(),
    };
  }
}

export default IntentEngine;

