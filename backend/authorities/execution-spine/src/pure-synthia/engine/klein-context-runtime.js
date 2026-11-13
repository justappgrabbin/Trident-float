// Pure Synthia Automata — live Klein context runtime
// Connects the first-class Klein context law to real engine events.

import { kleinOperator } from './klein.js';
import { hashObject, stableStringify } from './derivation.js';

const ENVELOPE_TRANSITIONS = new Set(['ignition', 'automatize']);
const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

function deepEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function safeClone(value) {
  try { return structuredClone(value); }
  catch {
    try { return JSON.parse(JSON.stringify(value)); }
    catch { return String(value); }
  }
}

function dominantJointTransition(trace = []) {
  const counts = new Map();
  for (const step of trace) {
    const id = step && step.transition;
    if (!id || ENVELOPE_TRANSITIONS.has(id)) continue;
    const entry = counts.get(id) || { count: 0, first: step.jointSeq ?? counts.size };
    entry.count += 1;
    counts.set(id, entry);
  }
  let best = null;
  for (const [id, entry] of counts) {
    if (!best || entry.count > best.entry.count
      || (entry.count === best.entry.count && entry.first < best.entry.first)) {
      best = { id, entry };
    }
  }
  return best ? best.id : null;
}

/**
 * KleinContextRuntime
 *
 * A live context evaluator for the mounted automata. It keeps the existing
 * single-tool kleinOperator() intact, but adds the missing joint/witness layer:
 *
 *   context -> active mounted tools -> side-effect-free joint probe
 *           -> { relation, intensity, direction }
 *           -> append-only witnessed evaluation ledger
 *
 * The joint result is derived from the combined joint trace, not by summing or
 * averaging previously-evaluated Klein triples. All participating tools are
 * snapshotted and restored, so observation does not mutate the execution path.
 */
export class KleinContextRuntime {
  constructor({ engine }) {
    if (!engine) throw new TypeError('KleinContextRuntime requires the Synthia engine');
    this.engine = engine;
    this.operators = new Map();
    this.evaluations = [];
    this.collapsed = new Map(); // exact context hash -> fixed result
    this.counter = 0;
    this.syncOperators();
  }

  syncOperators() {
    for (const automaton of this.engine.mesh.automata.values()) {
      if (!this.operators.has(automaton.id)) {
        this.operators.set(automaton.id, kleinOperator(automaton));
      }
    }
    return this.operators.size;
  }

  operator(toolId) {
    this.syncOperators();
    return this.operators.get(toolId) || null;
  }

  audit() {
    this.syncOperators();
    const mounted = [...this.engine.mesh.automata.keys()].sort();
    const wrapped = [...this.operators.keys()].sort();
    const missing = mounted.filter((id) => !this.operators.has(id));
    return Object.freeze({
      ok: missing.length === 0 && this.evaluations.length > 0,
      mountedAutomata: mounted.length,
      wrappedOperators: wrapped.length,
      missingOperators: Object.freeze(missing),
      witnessedEvaluations: this.evaluations.length,
      collapsedContexts: this.collapsed.size,
      latestEvaluationId: this.evaluations.at(-1)?.evaluationId ?? null,
    });
  }

  ledger() {
    return Object.freeze(this.evaluations.map((entry) => safeClone(entry)));
  }

  last() {
    const last = this.evaluations.at(-1);
    return last ? safeClone(last) : null;
  }

  /**
   * Evaluate one context jointly.
   *
   * invocations is the exact ordered set of active tool calls at this node:
   *   [{ toolId, input }, ...]
   * Repeated tool ids are allowed because one tool can participate more than
   * once in the same context (e.g. DISEMINER observe + extract).
   */
  evaluate({
    nodeId = 'synthia',
    eventType = 'event',
    invocations = [],
    address = null,
    dimension = null,
    meshState = null,
    context = {},
    derivationId = null,
    recordMesh = true,
  } = {}) {
    this.syncOperators();
    if (!Array.isArray(invocations) || invocations.length === 0) {
      throw new TypeError('KleinContextRuntime.evaluate requires a non-empty invocations array');
    }

    const normalized = invocations.map((invocation, index) => {
      const toolId = invocation && invocation.toolId;
      if (typeof toolId !== 'string' || !toolId) {
        throw new TypeError(`Klein invocation ${index} requires toolId`);
      }
      const tool = this.engine.mesh.get(toolId);
      if (!tool) throw new Error(`Klein context missing mounted tool: ${toolId}`);
      return Object.freeze({ toolId, input: safeClone(invocation.input ?? null) });
    });

    // Shared tool state is part of the witnessed context, not hidden mutable input.
    if (context.stateSpace == null && typeof this.engine.sharedStateProvider === 'function') {
      context = { ...context, stateSpace: this.engine.sharedStateProvider() };
    }
    const activeToolIds = [...new Set(normalized.map((x) => x.toolId))];
    const contextPayload = {
      nodeId,
      eventType,
      activeToolIds,
      invocations: normalized,
      address: safeClone(address),
      dimension,
      meshState: safeClone(meshState),
      context: safeClone(context),
      derivationId,
    };
    const contextHash = hashObject(contextPayload);
    const evaluationId = `klein-eval-${String(++this.counter).padStart(4, '0')}`;

    const jointTrace = [];
    const perInvocation = [];
    let previousOutput = null;
    let anyRejected = false;
    let anySuccess = false;
    let jointStatesGenerated = 0;
    let totalStateCapacity = 0;

    for (let index = 0; index < normalized.length; index++) {
      const invocation = normalized[index];
      const tool = this.engine.mesh.get(invocation.toolId);
      const savedState = typeof tool.exportState === 'function' ? tool.exportState() : null;
      const savedCalls = tool.calls;
      const savedLifecycle = tool.lifecycle;
      totalStateCapacity += Math.max(1, Array.isArray(tool.states) ? tool.states.length : 1);

      let result = null;
      let error = null;
      try {
        result = tool.run(invocation.input, {
          ...context,
          klein: true,
          kleinJoint: true,
          kleinEvaluationId: evaluationId,
          kleinNodeId: nodeId,
          kleinEventType: eventType,
          activeToolIds,
          previousJointOutput: safeClone(previousOutput),
          address: address ?? context?.address ?? null,
          dimension: dimension ?? tool.dimension ?? null,
          meshState: meshState ?? null,
        });
        previousOutput = result?.output ?? null;
        anySuccess = true;
        if (result?.accepted === false) anyRejected = true;
        jointStatesGenerated += result?.ledger?.statesGenerated || 0;
        for (const step of result?.trace || []) {
          jointTrace.push(Object.freeze({
            jointSeq: jointTrace.length,
            invocationIndex: index,
            toolId: invocation.toolId,
            ...safeClone(step),
          }));
        }
      } catch (err) {
        error = err;
      } finally {
        if (typeof tool.hydrate === 'function') tool.hydrate(savedState);
        tool.calls = savedCalls;
        tool.lifecycle = savedLifecycle;
      }

      perInvocation.push(Object.freeze({
        invocationIndex: index,
        toolId: invocation.toolId,
        accepted: result?.accepted ?? null,
        finalState: result?.finalState ?? null,
        output: safeClone(result?.output ?? null),
        error: error ? String(error.message || error) : null,
        traceLength: Array.isArray(result?.trace) ? result.trace.length : 0,
      }));
    }

    const internalSteps = jointTrace.filter((step) => !ENVELOPE_TRANSITIONS.has(step.transition));
    const dominant = dominantJointTransition(jointTrace);
    const relation = dominant
      ? `joint:${activeToolIds.join('~')}:${dominant}`
      : null;

    let intensity = jointStatesGenerated / (jointStatesGenerated + Math.max(1, totalStateCapacity));
    if (meshState && typeof meshState.activation === 'number') {
      intensity = (intensity + clamp01(meshState.activation)) / 2;
    }
    intensity = clamp01(intensity);

    let direction = 'neutral';
    if (anyRejected) direction = 'away';
    else if (anySuccess && internalSteps.length > 0) direction = 'toward';

    const result = Object.freeze({
      relation,
      intensity,
      direction,
    });

    const collapsed = this.collapsed.get(contextHash);
    if (collapsed && !deepEqual(collapsed, result)) {
      throw new Error(`KLEIN_COLLAPSE_MISMATCH for context ${contextHash}`);
    }
    if (!collapsed) this.collapsed.set(contextHash, result);

    const record = Object.freeze({
      evaluationId,
      sequence: this.evaluations.length + 1,
      contextHash,
      nodeId,
      eventType,
      derivationId,
      activeToolIds: Object.freeze([...activeToolIds]),
      invocationCount: normalized.length,
      context: Object.freeze(safeClone(contextPayload)),
      result,
      relationStatus: relation === null ? 'evaluated-no-relation' : 'relation-produced',
      perInvocation: Object.freeze(perInvocation),
      jointTrace: Object.freeze(jointTrace),
      classification: null,
      witnessed: true,
      deterministicAfterCollapse: true,
    });
    this.evaluations.push(record);

    // Make the Klein event visible to the same live mesh and semantic store.
    if (recordMesh) {
      const witnessNode = `klein:${evaluationId}`;
      for (const toolId of activeToolIds) {
        this.engine.mesh.addEdge('knowledge', witnessNode, toolId, 'klein-context-participant', {
          evaluationId,
          contextHash,
          eventType,
        });
      }
      this.engine.mesh.addEdge('causal', nodeId, witnessNode, relation || 'evaluated-no-relation', {
        evaluationId,
        intensity,
        direction,
      });
    }

    if (this.engine.tripleStore && typeof this.engine.tripleStore.addAll === 'function') {
      const provenance = 'klein-context-runtime';
      this.engine.tripleStore.addAll([
        { subject: evaluationId, predicate: 'isA', object: 'KleinContextEvaluation', provenance, derivationId },
        { subject: evaluationId, predicate: 'hasContextHash', object: contextHash, provenance, derivationId },
        { subject: evaluationId, predicate: 'hasRelation', object: relation || 'evaluated-no-relation', provenance, derivationId },
        { subject: evaluationId, predicate: 'hasDirection', object: direction, provenance, derivationId },
        { subject: evaluationId, predicate: 'hasIntensity', object: intensity, provenance, derivationId },
        ...activeToolIds.map((toolId) => ({
          subject: evaluationId, predicate: 'witnessedTool', object: toolId, provenance, derivationId,
        })),
      ]);
    }

    return safeClone(record);
  }
}

export default KleinContextRuntime;


