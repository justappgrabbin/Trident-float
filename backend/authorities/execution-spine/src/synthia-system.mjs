import { validateCanonicalAddress, canonicalAddressKey } from './canonical-address.mjs';
import { SynthiaAutomata } from './pure-synthia/engine/synthia.js';
import { UniversalExecutionBridge } from './pure-synthia/integration/universal-execution-bridge.js';
import { StatePacket } from './pure-synthia/mesh/packet.js';
import { ExecutionAddressResolver } from './execution-address-resolver.mjs';

const safe = (value) => {
  try { return structuredClone(value); }
  catch { try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); } }
};

/**
 * Live Pure Synthia façade.
 *
 * This class exists specifically to prevent "present but unwired": chat,
 * learning/growth, the automata mesh, self-editor, execution bridge, and the
 * full canonical address all hang off one instantiated object.
 */
export class SynthiaSystem {
  constructor(options = {}) {
    this.engine = options.engine ?? new SynthiaAutomata();
    this.execution = options.executionBridge ?? new UniversalExecutionBridge({
      remember: options.remember ?? true,
      seed: options.seed ?? 18091999,
      runtimeAdapters: options.runtimeAdapters ?? [],
    });
    this.addressResolver = options.addressResolver ?? new ExecutionAddressResolver();
    this.sequence = 0;
    this.history = [];
    this.executionAddressRecords = []; // append-only first-run placement ledger
  }

  get mesh() { return this.engine.mesh; }
  get learning() { return this.engine.learning; }
  get editor() { return this.engine.editor; }
  get intent() { return this.engine.intent; }
  get detector() { return this.engine.detector; }
  get coordinator() { return this.engine.coordinator; }
  get channels() { return this.engine.channels; }
  get klein() { return this.engine.klein; }

  registerRuntimeAdapter(adapter) { this.execution.registerRuntime(adapter); return this; }
  listRuntimeAdapters() { return this.execution.listRuntimes(); }

  /**
   * Chat is not a disconnected formatter: it first enters the address-first
   * learning/growth front door, then runs the Klein contact loop, then shares a
   * compact learned state packet with every currently mounted automaton.
   */
  async chat(message, context = {}) {
    const text = String(message ?? '');
    const learned = await this.engine.request(text, context);
    const contact = this.engine.contact({
      text,
      grammarA: context.grammarA,
      grammarB: context.grammarB ?? context.peerGrammar,
      seed: context.seed ?? 1,
    }, context);
    const shared = this.shareKnowledge({
      kind: 'chat-learning',
      input: text,
      learned: safe(learned),
      kleinEvaluation: safe(contact.kleinEvaluation ?? null),
      learnedCapabilityCandidate: safe(contact.learnedCapabilityCandidate ?? null),
    }, { source: 'chat' });
    const utterance = contact?.stages?.chat?.utterance
      ?? learned?.output?.utterance
      ?? learned?.output
      ?? text;
    const record = this.#record('chat', { text, learned, contact, shared });
    return { ok: true, utterance, learned, contact, shared, recordId: record.id };
  }

  /**
   * Execute through the original Pure Synthia bridge. Registered native
   * runtimes get first refusal; otherwise the bridge probes, derives runtime
   * requirements, searches the state-space/capability mesh, AutoWrites a JS
   * realization, executes it, verifies by evidence when available, and learns
   * the realization for reuse.
   */
  async executeArtifact(artifact, context = {}) {
    // DESCEND FIRST: reduce the incoming artifact to deterministic bit/state
    // primitives before any execution path is selected.
    const decomposition = this.addressResolver.descend(artifact);

    // A creator-supplied canonical address is authoritative and preserved. It
    // is never silently shortened or replaced. When absent, first-run runtime
    // evidence resolves the placement after execution.
    let suppliedCanonicalAddress = null;
    if (context.canonicalAddress) {
      validateCanonicalAddress(context.canonicalAddress);
      suppliedCanonicalAddress = safe(context.canonicalAddress);
    }

    const result = await this.execution.execute(artifact, {
      ...context,
      canonicalAddress: suppliedCanonicalAddress,
      executionDecomposition: decomposition,
    });

    // ASCEND AFTER FIRST ATTEMPT: execution behavior + the original low-level
    // decomposition resolve a complete 13-field computational coordinate.
    const resolved = this.addressResolver.resolve({
      artifact,
      execution: result,
      decomposition,
    });
    const canonicalAddress = suppliedCanonicalAddress ?? safe(resolved.address);
    const addressBasis = suppliedCanonicalAddress ? 'creator-supplied' : resolved.derivation.basis;

    const outcome = {
      kind: 'execution-outcome',
      artifact: {
        name: artifact?.name ?? artifact?.originalName ?? null,
        type: artifact?.type ?? null,
      },
      path: result.path,
      ok: Boolean(result.ok),
      decomposition: safe(decomposition),
      canonicalAddress,
      canonicalAddressKey: canonicalAddressKey(canonicalAddress),
      addressBasis,
      executionDerivedAddress: safe(resolved.address),
      executionDerivedAddressKey: resolved.key,
      addressDerivation: safe(resolved.derivation),
      result: safe(result),
    };

    // Append-only placement record. Failure still gets an address because the
    // failed first attempt is runtime evidence about what the artifact is/needs.
    const placement = Object.freeze({
      id: `execution-address-${this.executionAddressRecords.length + 1}`,
      sequence: this.executionAddressRecords.length + 1,
      canonicalAddress: safe(canonicalAddress),
      canonicalAddressKey: canonicalAddressKey(canonicalAddress),
      addressBasis,
      executionDerivedAddress: safe(resolved.address),
      executionDerivedAddressKey: resolved.key,
      derivation: safe(resolved.derivation),
      outcome: safe({ ok: outcome.ok, path: outcome.path, kind: result.kind ?? artifact?.type ?? null }),
    });
    this.executionAddressRecords.push(placement);

    const shared = this.shareKnowledge(outcome, { source: 'execution' });

    // Failure is evidence, not a terminal "runtime unavailable" dead end.
    // Let the existing learning/grow path observe the capability gap as well.
    let learning = null;
    if (!result.ok && context.learnOnFailure !== false) {
      const kind = result.kind ?? artifact?.type ?? 'unknown';
      learning = await this.engine.request(`execute ${kind} artifact capability gap`, {
        ...context,
        canonicalAddress,
        executionOutcome: outcome,
      });
    }
    const record = this.#record('execution', { outcome, placement, shared, learning });
    return {
      ...result,
      decomposition,
      canonicalAddress,
      canonicalAddressKey: canonicalAddressKey(canonicalAddress),
      addressBasis,
      executionDerivedAddress: safe(resolved.address),
      executionDerivedAddressKey: resolved.key,
      addressDerivation: safe(resolved.derivation),
      placementRecordId: placement.id,
      shared,
      learning,
      recordId: record.id,
    };
  }

  /**
   * Share qualified state, not full memory copies. Every mounted automaton gets
   * a StatePacket delivery receipt plus a compact absorbExperience record.
   */
  shareKnowledge(payload, { source = 'system', kind = 'knowledge' } = {}) {
    const seq = ++this.sequence;
    const from = `synthia:${source}`;
    const deliveries = [];
    const summary = safe(payload);
    for (const automaton of this.mesh.automata.values()) {
      const packet = new StatePacket({
        id: `shared-${seq}-${automaton.id}`,
        from,
        to: automaton.id,
        kind,
        payload: summary,
        derivationId: null,
      });
      const receipt = this.mesh.route(packet);
      if (receipt.delivered && typeof automaton.absorbExperience === 'function') {
        automaton.absorbExperience({
          derivationId: null,
          intakeId: null,
          outputHash: `shared:${seq}`,
          seq,
          sharedFrom: from,
          sharedKind: kind,
        });
      }
      this.mesh.addEdge('knowledge', from, automaton.id, 'shared-with', { seq, kind });
      this.mesh.addEdge('temporal', `${from}:${seq - 1}`, `${from}:${seq}`, 'shares-next', { to: automaton.id });
      deliveries.push({ automatonId: automaton.id, ...receipt });
    }
    return Object.freeze({ seq, from, deliveries: Object.freeze(deliveries) });
  }

  /** Grow a real mesh-mounted automaton through the existing LearningOrchestrator. */
  growAgent(spec) {
    const grown = this.learning.grow(spec);
    this.shareKnowledge({ kind: 'agent-grown', toolId: grown.automaton.id }, { source: 'growth' });
    return grown;
  }

  /**
   * Versioned/reversible rewrite record targeted at a mounted agent. This uses
   * the existing SelfEditor rather than monkey-patching source code invisibly.
   */
  rewriteAgent(agentId, { pattern = {}, transform, evidence = [] } = {}) {
    const agent = this.mesh.get(agentId);
    if (!agent) throw new Error(`unknown mesh agent: ${agentId}`);
    const ruleId = this.editor.addRule({ agentId, ...safe(pattern) }, transform, safe(evidence));
    if (typeof agent.absorbExperience === 'function') {
      agent.absorbExperience({
        derivationId: null,
        intakeId: null,
        outputHash: `rewrite:${ruleId}`,
        seq: ++this.sequence,
        rewriteRuleId: ruleId,
      });
    }
    this.shareKnowledge({ kind: 'agent-rewrite', agentId, ruleId }, { source: 'rewrite' });
    return { ok: true, agentId, ruleId, editor: this.editor.summary() };
  }

  /** Machine-checkable wiring audit: existence is insufficient; paths are live. */
  wiringAudit() {
    const automata = [...this.mesh.automata.keys()];
    const klein = this.engine.klein?.audit?.() ?? { ok: false, missingOperators: ['klein-runtime-missing'], witnessedEvaluations: 0 };
    return Object.freeze({
      ok: Boolean(
        this.engine && this.execution && this.learning && this.editor &&
        this.intent && this.detector && this.coordinator && this.channels &&
        this.engine.klein && klein.ok &&
        automata.includes('conversation') && this.mesh.transportConnections.size >= this.engine.tools.length
      ),
      chat: automata.includes('conversation'),
      canonicalTools: this.engine.tools.length,
      mountedAutomata: automata.length,
      grownTools: this.engine.grownTools().length,
      meshConnections: this.mesh.connections.size,
      transportConnections: this.mesh.transportConnections.size,
      projections: safe(this.mesh.metrics().projections),
      learning: typeof this.learning.request === 'function',
      growth: typeof this.learning.grow === 'function',
      reversibleRewrite: typeof this.editor.addRule === 'function' && typeof this.editor.revert === 'function',
      executionBridge: typeof this.execution.execute === 'function',
      runtimeRegistry: typeof this.execution.registerRuntime === 'function',
      meshSharing: typeof this.shareKnowledge === 'function',
      executionAddressResolver: typeof this.addressResolver?.resolve === 'function',
      postExecutionPlacement: Array.isArray(this.executionAddressRecords),
      kleinContextRuntime: Boolean(this.engine.klein),
      kleinOperatorCoverage: klein.wrappedOperators ?? 0,
      kleinMissingOperators: safe(klein.missingOperators ?? []),
      kleinWitnessedEvaluations: klein.witnessedEvaluations ?? 0,
      kleinDeterministicAfterCollapse: Boolean(this.engine.klein?.collapsed instanceof Map),
    });
  }

  #record(type, data) {
    const record = Object.freeze({ id: `system-${this.history.length + 1}`, sequence: this.history.length + 1, type, data: safe(data) });
    this.history.push(record);
    return record;
  }
}

export default SynthiaSystem;

