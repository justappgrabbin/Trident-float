// Pure Synthia Automata — engine: Open Questions Registry (unresolved questions preserved, not papered over)

/**
 * The Open Questions Registry — the source document preserves unresolved
 * questions rather than pretending completion. Each question is a frozen
 * record {id, name, statement, status, candidateTests?, linkedHypothesis?};
 * resolution requires an evidence id (a derivation / experiment / artifact id)
 * so a question is never closed by assertion alone.
 *
 * Determinism: counter-sequenced (addedSeq/resolvedSeq), no wall-clock.
 */

export const OPEN_QUESTIONS = Object.freeze([
  Object.freeze({
    id: 'OQ-1',
    name: 'orb/Delta/axon assignment',
    statement: 'how the source document\'s orb/Delta/axon assignments should map onto the automaton mesh\'s states, transitions, and ports — the correspondence is asserted in the source but no unique mechanical assignment has been derived',
    status: 'open',
    candidateTests: Object.freeze([
      'derive each candidate assignment from the state-space constants and compare transition-trace signatures across all 16 tools',
      'ablation: re-key the mesh ports by each candidate assignment and measure whether derivation hashes and routing receipts change',
    ]),
  }),
  Object.freeze({
    id: 'OQ-2',
    name: 'DMS assignment',
    statement: 'whether the DMS arc-second assignment of addresses carries predictive structure beyond the hash-candidate baseline',
    status: 'open',
    linkedHypothesis: 'H3',
  }),
  Object.freeze({
    id: 'OQ-3',
    name: 'Space discrepancy',
    statement: 'the Being/Movement interrogative conflict (GateLocus vs factory/SynthiaOS) resolved to majority mapping; whether Space participates in transformation formulae remains open',
    status: 'open',
    linkedHypothesis: 'H4',
  }),
]);

export class QuestionRegistry {
  constructor(questions = OPEN_QUESTIONS) {
    this._questions = new Map(); // id -> frozen question record
    this._seq = 0;
    for (const q of questions || []) this.add(q);
  }

  /**
   * Register a question. id defaults to the next OQ-N. Unknown extra fields
   * are preserved; status defaults to 'open'.
   */
  add(question = {}) {
    if (typeof question !== 'object' || question === null) {
      throw new TypeError('QuestionRegistry.add requires a question object');
    }
    const id = question.id || `OQ-${this._questions.size + 1}`;
    if (this._questions.has(id)) {
      throw new Error(`Duplicate question id: ${id}`);
    }
    if (typeof question.name !== 'string' || !question.name) {
      throw new TypeError('Question requires a name');
    }
    if (typeof question.statement !== 'string' || !question.statement) {
      throw new TypeError('Question requires a statement');
    }
    const record = Object.freeze({
      id,
      name: question.name,
      statement: question.statement,
      status: question.status || 'open',
      ...(question.candidateTests ? { candidateTests: Object.freeze([...question.candidateTests]) } : {}),
      ...(question.linkedHypothesis ? { linkedHypothesis: question.linkedHypothesis } : {}),
      addedSeq: ++this._seq,
    });
    this._questions.set(id, record);
    return record;
  }

  get(id) {
    return this._questions.get(id) || null;
  }

  /**
   * Resolve a question — evidence is mandatory: a question is closed by a
   * derivation/experiment/artifact id, never by declaration.
   */
  resolve(id, evidenceId) {
    if (evidenceId === null || evidenceId === undefined || evidenceId === '') {
      throw new TypeError('QuestionRegistry.resolve requires an evidenceId (derivation/experiment/artifact id)');
    }
    const record = this._questions.get(id);
    if (!record) throw new Error(`Unknown question id: ${id}`);
    if (record.status === 'resolved') {
      throw new Error(`Question ${id} is already resolved (evidence: ${record.evidenceId})`);
    }
    const resolved = Object.freeze({
      ...record,
      status: 'resolved',
      evidenceId,
      resolvedSeq: ++this._seq,
    });
    this._questions.set(id, resolved);
    return resolved;
  }

  /** All questions, or only those with the given status ({status:'open'}). */
  list({ status = null } = {}) {
    const all = [...this._questions.values()];
    return status ? all.filter((q) => q.status === status) : all;
  }

  /** JSON-safe snapshot: questions plus open/resolved counts. */
  export() {
    const all = this.list();
    return {
      questions: all.map((q) => ({ ...q })),
      open: all.filter((q) => q.status === 'open').length,
      resolved: all.filter((q) => q.status === 'resolved').length,
    };
  }
}

export default QuestionRegistry;

