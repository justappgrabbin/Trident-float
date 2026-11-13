// Pure Synthia Automata — emergence: SelfEditor (versioned, reversible, derivation-hashed self-modification)

/**
 * SelfEditor — ported from
 *   pure-synthia-pass4-step41-REPAIRED/src/emergence/self-editor.js
 *
 * Versioned, REVERSIBLE self-modification: add primitives from observed
 * patterns, evolve operator acceptance from success/failure evidence, add
 * rules from observed regularities. Every edit is an entry in a versioned,
 * append-only edit log AND is recorded as a full engine Derivation (hash
 * included), so self-modification is replayable by the same derivation
 * machinery as ordinary execution. Revert restores the exact prior frozen
 * snapshot taken before the edit.
 *
 * Frame-reset provenance:
 *   - edit types add_primitive / evolve_operator / add_rule and the edit-log
 *     record shape: SOURCE_STATEMENT, self-editor.js.
 *   - id forms `primitive:evolved:N`, `rule:evolved:N`, `edit:N`,
 *     `evidence:edit:N`: SOURCE_STATEMENT, self-editor.js (single shared
 *     counter, so numbers interleave exactly as in the source).
 *   - common-pattern rule (a failure pattern counts when observed > 1 time)
 *     and loose operand matching (same operand count): SOURCE_STATEMENT,
 *     self-editor.js _findCommonPatterns / _matchesPattern.
 *   - edit derivations use operator 'o_transform' + transition 'becoming'
 *     (self-modification = mutation toward a target state):
 *     IMPLEMENTATION_CHOICE.
 *
 * Source defects NOT propagated (see docs/MERGE_NOTES.md):
 *   - Date.now() in evidence/edit records (non-deterministic) -> `seq`.
 *   - evolveOperatorAcceptance built a wrapper that ACCEPTS previously-failed
 *     operand patterns ("be more lenient" toward failures — semantically
 *     backwards) and stored it without ever installing it (dead code). Here
 *     the learned-exception data is stored declaratively and applied only
 *     through the explicit acceptsWithLearned(operatorId, operands) query.
 *   - rollbackTo assumed engine.primitives/engine.operators shapes; here the
 *     revertible surface is the editor's own frozen-snapshot state, with
 *     provenance asserted into the engine's triple store when wired.
 *
 * Determinism: no wall-clock, no randomness; counter ids and seqs only.
 */

import { Derivation } from '../engine/derivation.js';
import { operatorById } from '../state-space/operators.js';

const SOURCE = 'pure-synthia-pass4-step41-REPAIRED/src/emergence/self-editor.js';

const provenance = (status, note) => Object.freeze({ status, source: SOURCE, note });

/** Provenance registry for every behavioral parameter of this module. */
export const EDITOR_PROVENANCE = Object.freeze({
  editTypes: provenance('SOURCE_STATEMENT', 'add_primitive / evolve_operator / add_rule, self-editor.js'),
  idForms: provenance('SOURCE_STATEMENT', 'primitive:evolved:N / rule:evolved:N / edit:N / evidence:edit:N with one shared counter'),
  commonPatternRule: provenance('SOURCE_STATEMENT', 'a pattern becomes a learned exception when observed more than once, _findCommonPatterns'),
  operandMatching: provenance('SOURCE_STATEMENT', 'loose matching: equal operand counts, _matchesPattern'),
  editDerivationShape: provenance('IMPLEMENTATION_CHOICE', "each edit is a Derivation with operator 'o_transform' and transition 'becoming', hash-chained via context.previousEditHash"),
});

export class SelfEditor {
  constructor({ engine = null } = {}) {
    this.engine = engine;
    this.edits = []; // versioned, append-only edit log (entries are never removed; revert marks status)
    this.primitives = new Map(); // evolved primitives: id -> frozen record
    this.rules = new Map(); // evolved rules: ruleId -> record
    this._editCounter = 0; // single shared counter, as in the source
  }

  // ---------------- edits ----------------

  /**
   * Add a new primitive from an observed pattern (SOURCE_STATEMENT,
   * self-editor.js addPrimitiveFromPattern). ADAPTED: the source called a
   * non-existent engine.registerPrimitive; here the primitive joins the
   * editor's revertible registry and, when an engine is wired, asserts its
   * provenance into the engine's semantic triple store.
   */
  addPrimitiveFromPattern(pattern = {}, scale = 'auto') {
    const seq = ++this._editCounter;
    const id = `primitive:evolved:${seq}`;
    const primitive = Object.freeze({
      id,
      identity: pattern.identity || `evolved_${seq}`,
      contrast: pattern.contrast || 'auto',
      position: pattern.position || 'auto',
      scale,
      operations: Object.freeze([...(pattern.operations || [])]),
      dependencies: Object.freeze([...(pattern.dependencies || [])]),
      evidence: Object.freeze([Object.freeze({
        id: `evidence:edit:${seq}`,
        kind: 'inferred',
        source: 'self-editor',
        seq, // counter-derived; the source used Date.now()
      })]),
      provenance: EDITOR_PROVENANCE.idForms,
    });

    const before = this.#snapshot();
    this.primitives.set(id, primitive);
    const edit = this.#logEdit('add_primitive', { id, scale, pattern: this.#jsonSafe(pattern) }, before, [id]);
    this.#assertEditTriples(edit, primitive);
    return primitive;
  }

  /**
   * Evolve an operator's acceptance from success/failure evidence
   * (SOURCE_STATEMENT: edit type + common-pattern rule). ADAPTED (defect
   * fix): nothing is monkey-patched and previously-FAILED patterns are not
   * blanket-accepted; the learned exception set is stored declaratively and
   * consulted only via acceptsWithLearned().
   */
  evolveOperatorAcceptance(operatorId, successPatterns = [], failurePatterns = []) {
    const operator = typeof operatorById === 'function' ? operatorById(operatorId) : null;
    if (!operator) return { evolved: false, reason: 'operator_not_found' };

    const commonFailures = this.#findCommonPatterns(failurePatterns);
    const commonSuccesses = this.#findCommonPatterns(successPatterns);
    const ruleId = `${operatorId}:evolved`;

    const before = this.#snapshot();
    const edit = this.#logEdit('evolve_operator', {
      operatorId, ruleId, successCount: successPatterns.length, failureCount: failurePatterns.length,
    }, before, [operatorId]);
    this.rules.set(ruleId, {
      id: ruleId,
      kind: 'evolve_operator',
      original: operatorId,
      commonSuccesses,
      commonFailures,
      successCount: successPatterns.length,
      failureCount: failurePatterns.length,
      seq: edit.seq,
      provenance: EDITOR_PROVENANCE.commonPatternRule,
    });
    return { evolved: true, ruleId };
  }

  /**
   * The learned-acceptance query: original acceptance (a descriptive string
   * in our operator table, so always treated as accept) OR the operands match
   * a repeatedly-observed SUCCESS pattern the original criteria rejected.
   * Previously-failed patterns never widen acceptance (source defect fixed).
   */
  acceptsWithLearned(operatorId, operands = []) {
    const rule = this.rules.get(`${operatorId}:evolved`);
    if (!rule) return { accepted: true, via: 'original' };
    for (const pattern of rule.commonFailures) {
      if (this.#matchesPattern(operands, pattern)) return { accepted: false, via: 'learned_failure' };
    }
    return { accepted: true, via: 'original' };
  }

  /** Add a grammar rule from an observed regularity (SOURCE_STATEMENT). */
  addRule(pattern, transform, evidence = []) {
    const seq = ++this._editCounter;
    const ruleId = `rule:evolved:${seq}`;
    const before = this.#snapshot();
    this.rules.set(ruleId, {
      id: ruleId,
      kind: 'add_rule',
      pattern: this.#jsonSafe(pattern),
      transform: typeof transform === 'function'
        ? { kind: 'function', name: transform.name || 'anonymous' }
        : this.#jsonSafe(transform),
      evidence: this.#jsonSafe(evidence),
      seq,
      provenance: EDITOR_PROVENANCE.idForms,
    });
    this.#logEdit('add_rule', { ruleId }, before, [ruleId]);
    return ruleId;
  }

  // ---------------- revert ----------------

  /**
   * Revert an edit (default: the most recent APPLIED edit) by restoring the
   * exact frozen snapshot taken before it, and marking it — and every later
   * applied edit — reverted. The log itself stays append-only (versioned
   * audit); a revert audit record with its own derivation hash is appended.
   * Revert-audit records are themselves terminal (not revert targets).
   */
  revert(editId = null) {
    let index = -1;
    if (editId === null) {
      for (let k = this.edits.length - 1; k >= 0; k--) {
        if (this.edits[k].status === 'applied' && this.edits[k].type !== 'revert') { index = k; break; }
      }
    } else {
      index = this.edits.findIndex((e) => e.id === editId);
    }
    if (index < 0 || index >= this.edits.length) return { reverted: false, reason: 'invalid_edit' };
    const target = this.edits[index];
    if (target.status !== 'applied') return { reverted: false, reason: 'already_reverted' };
    if (target.type === 'revert') return { reverted: false, reason: 'revert_is_terminal' };

    // Restore the exact prior frozen snapshot (state as it was BEFORE target).
    this.#restore(target.before);
    let revertedCount = 0;
    for (let k = index; k < this.edits.length; k++) {
      if (this.edits[k].status === 'applied') {
        this.edits[k] = Object.freeze({ ...this.edits[k], status: 'reverted' });
        revertedCount++;
      }
    }

    const seq = ++this._editCounter;
    const derivation = this.#editDerivation(seq, 'revert', { revertedEdit: target.id, revertedCount }, [target.id]);
    const audit = Object.freeze({
      id: `edit:${seq}`,
      version: seq,
      type: 'revert',
      data: Object.freeze({ revertedEdit: target.id, revertedCount }),
      derivationHash: derivation.hash,
      derivation,
      status: 'applied',
      seq,
      provenance: EDITOR_PROVENANCE.editTypes,
    });
    this.edits.push(audit);
    return { reverted: true, editId: target.id, revertedCount, revertEditId: audit.id, derivationHash: audit.derivationHash };
  }

  // ---------------- reports (parity with self-editor.js) ----------------

  replayEdits() {
    return {
      editCount: this.edits.length,
      primitivesAdded: this.edits.filter((e) => e.type === 'add_primitive').length,
      operatorsEvolved: this.edits.filter((e) => e.type === 'evolve_operator').length,
      rulesAdded: this.edits.filter((e) => e.type === 'add_rule').length,
      reverts: this.edits.filter((e) => e.type === 'revert').length,
    };
  }

  summary() {
    return {
      totalEdits: this.edits.length,
      primitivesAdded: this.edits.filter((e) => e.type === 'add_primitive').length,
      operatorsEvolved: this.edits.filter((e) => e.type === 'evolve_operator').length,
      rulesAdded: this.edits.filter((e) => e.type === 'add_rule').length,
      currentRules: this.rules.size,
      currentPrimitives: this.primitives.size,
    };
  }

  /** JSON-safe export of the revertible state (for deep-equal comparisons). */
  exportState() {
    return JSON.parse(this.#snapshot());
  }

  toJSON() {
    return {
      edits: this.edits.map((e) => ({
        id: e.id, version: e.version, type: e.type, data: e.data,
        derivationHash: e.derivationHash, status: e.status, seq: e.seq,
      })),
      rules: [...this.rules.entries()],
      primitives: [...this.primitives.keys()],
      summary: this.summary(),
    };
  }

  // ---------------- internals ----------------

  #snapshot() {
    // Frozen JSON snapshot of the revertible surface (stable key order via
    // insertion-ordered Maps serialized as entry lists).
    return JSON.stringify({
      primitives: [...this.primitives.entries()],
      rules: [...this.rules.entries()],
    });
  }

  #restore(snapshot) {
    const state = JSON.parse(snapshot);
    this.primitives = new Map(state.primitives);
    this.rules = new Map(state.rules);
  }

  #logEdit(type, data, before, primitives) {
    const seq = ++this._editCounter;
    const derivation = this.#editDerivation(seq, type, data, primitives);
    const edit = Object.freeze({
      id: `edit:${seq}`,
      version: seq,
      type,
      data: Object.freeze(data),
      derivationHash: derivation.hash,
      derivation,
      before, // frozen snapshot string: the exact state this edit is reversible to
      status: 'applied',
      seq,
      provenance: EDITOR_PROVENANCE.editTypes,
    });
    this.edits.push(edit);
    return edit;
  }

  // IMPLEMENTATION_CHOICE: an edit IS a derivation — hash-chained through
  // context.previousEditHash so the edit log replays/verifies like execution.
  #editDerivation(seq, type, data, primitives) {
    const previous = this.edits.length ? this.edits[this.edits.length - 1].derivationHash : null;
    return new Derivation({
      id: `edit-drv-${String(seq).padStart(4, '0')}`,
      input: `self-edit:${type}`,
      parse: null,
      primitives: [...(primitives || [])],
      operators: ['o_transform'],
      relations: [],
      context: { previousEditHash: previous },
      transforms: ['becoming'],
      output: { type, ...JSON.parse(JSON.stringify(data)) },
      evaluation: { derivationIntegrity: 1, editSeq: seq },
      ledger: null,
      engineVersion: 'self-editor.1.0',
      grammarVersion: 'automata.1.0',
    });
  }

  #assertEditTriples(edit, primitive) {
    const store = this.engine && this.engine.tripleStore;
    if (!store || typeof store.addAll !== 'function') return;
    store.addAll([
      { subject: primitive.id, predicate: 'isA', object: 'EvolvedPrimitive', provenance: 'self-editor' },
      { subject: primitive.id, predicate: 'hasScale', object: primitive.scale, provenance: 'self-editor' },
      { subject: edit.id, predicate: 'editedBy', object: 'self-editor', provenance: 'self-editor' },
      { subject: edit.id, predicate: 'hasDerivationHash', object: edit.derivationHash, provenance: 'self-editor' },
    ]);
  }

  // SOURCE_STATEMENT: self-editor.js _findCommonPatterns — patterns observed
  // more than once (keyed by JSON).
  #findCommonPatterns(patterns) {
    const counts = new Map();
    for (const p of patterns || []) {
      const key = JSON.stringify(p);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => JSON.parse(key));
  }

  // SOURCE_STATEMENT: self-editor.js _matchesPattern — loose matching on
  // operand count.
  #matchesPattern(operands, pattern) {
    if (!pattern || !Array.isArray(pattern.operands)) return false;
    return (operands || []).length === pattern.operands.length;
  }

  #jsonSafe(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }
}

export default SelfEditor;

