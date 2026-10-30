/**
 * Experiment Loop Service — Acceptance 7 (handoff §37).
 * WRAPS the Back-up- donor HypothesisRegistry (vendor/kimi-agent-automata-
 * state-space-merge/.../experiments/hypothesis-registry.js — formal hypothesis
 * lifecycle H=(claim,nullHypothesis,metric,test,threshold,evidence,status)).
 * The donor rule is kept verbatim: execution NEVER classifies evidence;
 * Hypothesis.evaluate(result) is a SEPARATE explicit step. A successful
 * program execution stays an OBSERVATION unless the explicit classification
 * step (with replication) promotes it.
 *
 * Grammar classification mapping (event-grammar evidence classes):
 *   hypothesized -> hypothesis | observed(observation, no replication) -> observation
 *   supported -> supported_result | rejected -> rejected_result | else -> unknown
 */

import { fileURLToPath } from 'node:url';

const DONOR_REGISTRY = fileURLToPath(new URL('../donors/Back-up-/vendor/kimi-agent-automata-state-space-merge/pure-synthia-automata/src/experiments/hypothesis-registry.js', import.meta.url));

export const EXPERIMENT_PROVIDER_ID = 'back-up-:kimi-hypothesis-registry';

export class ExperimentLoop {
  constructor({ bus = null } = {}) {
    this.bus = bus;
    this.providerId = EXPERIMENT_PROVIDER_ID;
    this._donor = null;
    this.registry = null;
    this.experiments = new Map();
  }

  async _load() {
    try {
      this._donor ??= await import(DONOR_REGISTRY);
      this.registry ??= new this._donor.HypothesisRegistry({ seedCore: false });
      return this.registry;
    } catch (error) {
      const failure = { provider: EXPERIMENT_PROVIDER_ID, path: DONOR_REGISTRY, error: String(error?.message ?? error) };
      this.bus?.emit('service:provider-failure', failure);
      throw Object.assign(new Error(`experiment donor unavailable (${failure.error})`), { cause: error });
    }
  }

  /** Step 1: hypothesis creation (donor Hypothesis registered). */
  async createHypothesis({ id, claim, nullHypothesis, metric, test, threshold }) {
    const registry = await this._load();
    const h = new this._donor.Hypothesis({ id, claim, nullHypothesis, metric, test, threshold });
    registry.register(h);
    this.bus?.emit('experiment:hypothesis-created', { id, claim });
    return h.toJSON();
  }

  /** Step 2: experiment creation with conditions/variables bound to a real method. */
  async createExperiment({ hypothesisId, conditions = {}, variables = {}, method }) {
    const registry = await this._load();
    if (!registry.hypotheses.has(hypothesisId)) throw new Error(`unknown hypothesis ${hypothesisId}`);
    const exp = {
      id: `exp-${this.experiments.size + 1}-${hypothesisId}`,
      hypothesisId, conditions, variables, method,
      runs: [], classification: 'unknown', status: 'created', createdAt: new Date().toISOString(),
    };
    this.experiments.set(exp.id, exp);
    this.bus?.emit('experiment:created', { id: exp.id, hypothesisId });
    return exp;
  }

  /**
   * Step 3-5: event/input -> REAL execution via the supplied real executor ->
   * observation recorded. Returns the raw observation. NO classification here.
   */
  async run(experimentId, executor, input) {
    const exp = this.experiments.get(experimentId);
    if (!exp) throw new Error(`unknown experiment ${experimentId}`);
    const output = await executor(input); // real provider execution (e.g. runtime.resolveAddress)
    const observation = { run: exp.runs.length + 1, input, output, at: new Date().toISOString() };
    exp.runs.push(observation);
    exp.status = 'observed';
    this.bus?.emit('experiment:observation', { experiment: experimentId, run: observation.run });
    return observation;
  }

  /**
   * Step 6: EVIDENCE CLASSIFICATION — separate, explicit step.
   * Only with >= 2 consistent runs (replication) does the donor evaluate()
   * promote/demote the hypothesis. Otherwise the evidence stays 'observation'.
   */
  async classify(experimentId, { measure }) {
    const registry = await this._load();
    const exp = this.experiments.get(experimentId);
    if (!exp) throw new Error(`unknown experiment ${experimentId}`);
    const h = registry.hypotheses.get(exp.hypothesisId);
    const replicated = exp.runs.length >= 2
      && measure(exp.runs[0].output) === measure(exp.runs[1].output);
    if (!replicated) {
      // explicit non-promotion: execution success does NOT auto-upgrade
      exp.classification = 'observation';
      this.bus?.emit('experiment:classified', { experiment: experimentId, classification: 'observation', reason: 'no replication' });
      return { classification: 'observation', hypothesis_status: h.status, replicated: false };
    }
    const value = Number(measure(exp.runs[1].output));
    h.addEvidence(exp.id, true);
    const verdict = h.evaluate(value); // REAL donor evaluation (threshold verdict)
    exp.classification = verdict === 'supported' ? 'supported_result' : verdict === 'rejected' ? 'rejected_result' : 'observation';
    exp.status = 'classified';
    this.bus?.emit('experiment:classified', { experiment: experimentId, classification: exp.classification, verdict });
    return { classification: exp.classification, hypothesis_status: h.status, replicated: true, measured: value, threshold: h.threshold };
  }

  async hypothesis(id) {
    const registry = await this._load();
    return registry.hypotheses.get(id)?.toJSON() ?? null;
  }

  experiment(id) { return this.experiments.get(id) ?? null; }
}

export default ExperimentLoop;

