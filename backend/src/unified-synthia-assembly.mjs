import {
  SynthiaSystem,
  ADDRESS_FIELDS as EXECUTION_ADDRESS_FIELDS,
} from '../authorities/execution-spine/src/index.mjs';
import { PureSynthiaLearningCore } from '../authorities/trainable-core/src/pure-synthia-learning-core.mjs';
import { ADDRESS_FIELDS as TRAINING_ADDRESS_FIELDS } from '../authorities/trainable-core/src/address.mjs';

const clone = (value) => {
  try { return structuredClone(value); }
  catch { try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); } }
};

const unique = (values) => [...new Set(values.filter(Boolean))];

/**
 * UnifiedSynthiaAssembly
 *
 * Root façade only. It does not collapse the two authorities into a rewritten
 * mega-engine:
 *   - execution-spine owns execution, automata/state-space, Klein, mesh, ATO
 *   - trainable-core owns registration, book fragments, scientist loop, journal
 *
 * The root connects their live event paths and keeps their address schemas
 * explicitly separate until an authoritative mapping exists.
 */
export class UnifiedSynthiaAssembly {
  constructor({ synthiaOptions = {}, extractors = {} } = {}) {
    this.synthia = new SynthiaSystem(synthiaOptions);
    this.sequence = 0;
    this.events = [];

    const liveExtractors = {
      autoling: (text) => this.#extractWithTool('autoling', {
        operation: 'pipeline',
        text,
      }),
      diseminer: (text) => this.#extractWithTool('diseminer', {
        operation: 'extract',
        text,
        source: 'book-ingest',
      }),
      ...extractors,
    };

    this.learningCore = new PureSynthiaLearningCore({ extractors: liveExtractors });
    this.liveExtractorIds = Object.freeze(
      ['autoling', 'diseminer'].filter((id) => typeof liveExtractors[id] === 'function'),
    );
  }

  get engine() { return this.synthia.engine; }
  get mesh() { return this.synthia.mesh; }
  get klein() { return this.synthia.klein; }
  get registry() { return this.learningCore.registry; }
  get books() { return this.learningCore.books; }
  get sentences() { return this.learningCore.sentences; }
  get scientist() { return this.learningCore.scientist; }
  get training() { return this.learningCore.training; }

  #extractWithTool(toolId, input) {
    const derivation = this.synthia.engine.invoke(toolId, input, {
      source: 'root-book-ingest',
    });
    return Object.freeze({
      output: clone(derivation.output),
      derivationId: derivation.id,
      intakeId: derivation.intakeId,
      kleinEvaluationId: derivation.kleinEvaluation?.evaluationId ?? null,
      kleinResult: clone(derivation.kleinEvaluation?.result ?? null),
    });
  }

  #stateSummary() {
    const audit = this.synthia.wiringAudit();
    return {
      mountedAutomata: audit.mountedAutomata,
      kleinWitnessedEvaluations: audit.kleinWitnessedEvaluations,
      rootEvents: this.events.length,
      trainingRecords: this.training.records.length,
      registryEntities: this.registry.entities.size,
    };
  }

  #recordRoot(type, payload) {
    const record = Object.freeze({
      id: `root-${String(++this.sequence).padStart(5, '0')}`,
      sequence: this.sequence,
      type,
      payload: clone(payload),
    });
    this.events.push(record);
    return record;
  }

  #recordTraining({ task, before, toolPath, interaction, after, expression, success, error = null, score = null, metadata = {} }) {
    return this.training.record({
      task,
      stateBefore: before,
      toolPath,
      interaction,
      stateAfter: after,
      observedExpression: expression,
      success,
      error,
      score,
      metadata,
    });
  }

  async chat(message, context = {}) {
    const before = this.#stateSummary();
    const result = await this.synthia.chat(message, context);
    const klein = result.contact?.kleinEvaluation ?? null;
    const root = this.#recordRoot('chat', {
      systemRecordId: result.recordId,
      kleinEvaluationId: klein?.evaluationId ?? null,
      contactMode: result.contact?.mode ?? null,
    });
    const after = this.#stateSummary();
    const training = this.#recordTraining({
      task: 'chat',
      before,
      toolPath: klein?.activeToolIds ?? [],
      interaction: {
        rootEventId: root.id,
        kleinEvaluation: clone(klein),
        transport: clone(result.contact?.transport ?? null),
      },
      after,
      expression: result.utterance,
      success: result.ok === true,
      metadata: {
        rootEventId: root.id,
        systemRecordId: result.recordId,
        kleinEvaluationId: klein?.evaluationId ?? null,
        kleinContextHash: klein?.contextHash ?? null,
      },
    });
    return { ...result, rootEventId: root.id, trainingRecordId: training.id };
  }

  call(input, context = {}) {
    const before = this.#stateSummary();
    const derivation = this.synthia.engine.call(input, context);
    const klein = derivation.kleinEvaluation ?? null;
    const root = this.#recordRoot('call', {
      derivationId: derivation.id,
      kleinEvaluationId: klein?.evaluationId ?? null,
    });
    const after = this.#stateSummary();
    const training = this.#recordTraining({
      task: 'tool-chain',
      before,
      toolPath: klein?.activeToolIds ?? derivation.primitives ?? [],
      interaction: { rootEventId: root.id, derivationId: derivation.id, kleinEvaluation: clone(klein) },
      after,
      expression: clone(derivation.output),
      success: derivation.evaluation?.accepted !== false,
      metadata: {
        rootEventId: root.id,
        derivationId: derivation.id,
        derivationHash: derivation.hash,
        kleinEvaluationId: klein?.evaluationId ?? null,
      },
    });
    return { derivation, rootEventId: root.id, trainingRecordId: training.id };
  }

  invoke(toolId, input, context = {}) {
    const before = this.#stateSummary();
    const derivation = this.synthia.engine.invoke(toolId, input, context);
    const klein = derivation.kleinEvaluation ?? null;
    const root = this.#recordRoot('invoke', {
      derivationId: derivation.id,
      toolId,
      kleinEvaluationId: klein?.evaluationId ?? null,
    });
    const after = this.#stateSummary();
    const training = this.#recordTraining({
      task: `invoke:${toolId}`,
      before,
      toolPath: klein?.activeToolIds ?? [toolId],
      interaction: { rootEventId: root.id, derivationId: derivation.id, kleinEvaluation: clone(klein) },
      after,
      expression: clone(derivation.output),
      success: derivation.evaluation?.accepted !== false,
      metadata: {
        rootEventId: root.id,
        derivationId: derivation.id,
        kleinEvaluationId: klein?.evaluationId ?? null,
      },
    });
    return { derivation, rootEventId: root.id, trainingRecordId: training.id };
  }

  async executeArtifact(artifact, context = {}) {
    const before = this.#stateSummary();
    const result = await this.synthia.executeArtifact(artifact, context);
    const learningKlein = result.learning?.derivation?.kleinEvaluation
      ?? result.learning?.kleinEvaluation
      ?? null;
    const root = this.#recordRoot('execution', {
      systemRecordId: result.recordId,
      ok: result.ok,
      placementRecordId: result.placementRecordId ?? null,
      learningKleinEvaluationId: learningKlein?.evaluationId ?? null,
    });
    const after = this.#stateSummary();
    const training = this.#recordTraining({
      task: `execute:${artifact?.type ?? artifact?.name ?? 'artifact'}`,
      before,
      toolPath: learningKlein?.activeToolIds ?? ['universal-execution-spine'],
      interaction: {
        rootEventId: root.id,
        placementRecordId: result.placementRecordId ?? null,
        learningKleinEvaluation: clone(learningKlein),
      },
      after,
      expression: clone(result.output ?? result.value ?? result.kind ?? null),
      success: result.ok === true,
      error: result.ok === true ? null : (result.error ?? result.reason ?? null),
      metadata: {
        rootEventId: root.id,
        systemRecordId: result.recordId,
        canonicalAddressKey: result.canonicalAddressKey ?? null,
      },
    });
    return { ...result, rootEventId: root.id, trainingRecordId: training.id };
  }

  /**
   * Book/source ingestion stays provenance-first in the Trainable Core. The
   * default extractors are the live mounted AutoLing/DISEMINER automata and
   * therefore pass through intake + Klein + provenance via engine.invoke().
   */
  ingestBook(spec) {
    const before = this.#stateSummary();
    const kleinBefore = this.klein.ledger().length;
    const fragments = this.books.ingest(spec);
    const newKlein = this.klein.ledger().slice(kleinBefore);
    const toolPath = unique(newKlein.flatMap((entry) => entry.activeToolIds ?? []));

    const shared = this.synthia.shareKnowledge({
      kind: 'book-ingest',
      sourceId: spec.sourceId,
      fragments: fragments.map((fragment) => ({
        fragmentId: fragment.fragmentId,
        sourceHash: fragment.sourceHash,
        dimension: fragment.dimension,
      })),
      kleinEvaluationIds: newKlein.map((entry) => entry.evaluationId),
    }, { source: 'book-ingest', kind: 'source-fragments' });

    const root = this.#recordRoot('book-ingest', {
      sourceId: spec.sourceId,
      fragmentCount: fragments.length,
      kleinEvaluationIds: newKlein.map((entry) => entry.evaluationId),
      sharedSequence: shared.seq,
    });
    const after = this.#stateSummary();
    const training = this.#recordTraining({
      task: 'book-ingest',
      before,
      toolPath,
      interaction: {
        rootEventId: root.id,
        sourceId: spec.sourceId,
        fragmentIds: fragments.map((fragment) => fragment.fragmentId),
        kleinEvaluations: clone(newKlein),
        shared: clone(shared),
      },
      after,
      expression: `${fragments.length} source fragment(s) registered`,
      success: true,
      metadata: { rootEventId: root.id, sourceId: spec.sourceId },
    });

    return { fragments, shared, kleinEvaluations: newKlein, rootEventId: root.id, trainingRecordId: training.id };
  }

  registerEntity(spec) {
    // No silent execution-address -> training-address conversion. Callers pass
    // the Trainable Core address explicitly until the address authorities are
    // reconciled by an authoritative mapping.
    return this.registry.register(spec);
  }

  question(raw, options = {}) { return this.scientist.question(raw, options); }
  evidence(questionId, evidence) { return this.scientist.evidence(questionId, evidence); }
  experiment(questionId, experiment) { return this.scientist.experiment(questionId, experiment); }

  wiringAudit() {
    const spine = this.synthia.wiringAudit();
    const organs = Object.freeze({
      registry: typeof this.registry.register === 'function' && typeof this.registry.transition === 'function',
      bookIngest: typeof this.books.ingest === 'function',
      sentenceMesh: typeof this.sentences.compose === 'function',
      scientist: typeof this.scientist.experiment === 'function',
      trainingJournal: typeof this.training.record === 'function',
      liveAutolingExtractor: this.liveExtractorIds.includes('autoling'),
      liveDiseminerExtractor: this.liveExtractorIds.includes('diseminer'),
    });
    const addressBoundary = Object.freeze({
      executionFields: Object.freeze([...EXECUTION_ADDRESS_FIELDS]),
      trainingFields: Object.freeze([...TRAINING_ADDRESS_FIELDS]),
      identical: JSON.stringify(EXECUTION_ADDRESS_FIELDS) === JSON.stringify(TRAINING_ADDRESS_FIELDS),
      policy: 'preserve-both-no-silent-conversion',
    });
    const allOrgans = Object.values(organs).every(Boolean);
    return Object.freeze({
      ok: spine.ok && allOrgans && spine.kleinContextRuntime === true && spine.kleinMissingOperators.length === 0,
      root: 'UnifiedSynthiaAssembly',
      spine,
      organs,
      addressBoundary,
      rootEvents: this.events.length,
      trainingRecords: this.training.records.length,
    });
  }

  snapshot() {
    return {
      root: this.wiringAudit(),
      trainable: this.learningCore.snapshot(),
      rootEvents: clone(this.events),
      kleinLedger: this.klein.ledger(),
    };
  }
}

export default UnifiedSynthiaAssembly;

