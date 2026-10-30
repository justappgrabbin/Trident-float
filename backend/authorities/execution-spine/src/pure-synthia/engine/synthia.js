// Pure Synthia Automata — engine: mesh-mounted SynthiaAutomata façade (spec §11–§12)

/**
 * SynthiaAutomata — the L8 façade over the shared mesh. Builds an
 * AutomataMesh, instantiates the 16 tool automata via the registry, mounts
 * them on the mesh, and wires a default ring (registry order, output→input
 * ports). call() parses the tool-call grammar, executes each call on its
 * automaton, forwards StatePackets along chains (two-call rule: B receives
 * A's packet as input.packet), merges complexity ledgers, and returns a
 * deterministic, hashable Derivation.
 *
 * Determinism rules honored here:
 *   - derivation/packet ids come from per-engine counters, never wall-clock;
 *   - Date.now() appears only in the Derivation `timestamp` field, which is
 *     excluded from the derivation hash (engine/derivation.js);
 *   - replay() re-runs on a fresh engine so counter-derived ids reproduce.
 */

import { AutomataMesh } from '../mesh/mesh.js';
import { StatePacket } from '../mesh/packet.js';
import { TOOL_REGISTRY, createAllTools } from '../automata/registry.js';
import { parseChain } from '../grammar/parser.js';
import { ComplexityLedger } from './ledger.js';
import { Derivation } from './derivation.js';
import { IntakeGate } from './intake.js';
import { LearningOrchestrator } from './learning.js';
import { ToolFactory } from '../merged/tool-factory.js';
import { DimensionRouter } from '../merged/dimension-router.js';
import { TripleStore, toolOntology, runTriples } from './triples.js';
import { EmergentChannels } from '../mesh/channels.js';
import { QuestionRegistry, OPEN_QUESTIONS } from './questions.js';
import { RelationalCapabilityExperiment } from '../experiments/relational-capability.js';
import { IntentEngine } from '../emergence/intent-engine.js';
import { SelfEditor } from '../emergence/self-editor.js';
import { EmergenceDetector } from '../emergence/detector.js';
import { MeshCoordinator } from '../emergence/coordination.js';
import { KleinContactLoop } from '../integration/language-contact-models.js';
import { KleinContextRuntime } from './klein-context-runtime.js';

export class SynthiaAutomata {
  constructor() {
    this.mesh = new AutomataMesh();
    this.tools = createAllTools();
    this.toolsById = new Map();

    for (const automaton of this.tools) {
      this.mesh.register(automaton);
      this.toolsById.set(automaton.id, automaton);
    }

    // Default ring: each tool's output port feeds the next tool's input port,
    // in registry order, last → first closing the ring.
    for (let k = 0; k < this.tools.length; k++) {
      const from = this.tools[k];
      const to = this.tools[(k + 1) % this.tools.length];
      const typed = this.mesh.connect(from.id, to.id, { outputPort: 'output', inputPort: 'input' });
      // Typed application ports are allowed to be incompatible; the organism
      // must still remain connected for qualified StatePacket learning/contact.
      if (typed.status !== 'connected') this.mesh.connectTransport(from.id, to.id);
      else this.mesh.connectTransport(from.id, to.id);
    }

    // Runtime state: counter-derived ids + derivation history (no wall-clock).
    this.runtime = {
      derivationCounter: 0,
      packetCounter: 0,
      callCount: 0,
      derivations: [],
    };

    // Semantic triple store (tools-made-of-triples + run provenance) and the
    // emergent-channel tracker. Created before the learning orchestrator so
    // the boot-grown media-field asserts its ontology through the grow path.
    this.tripleStore = new TripleStore();
    this.channels = new EmergentChannels({ mesh: this.mesh });
    this.mesh.channels = this.channels; // mesh.route() records every delivery as a crossing

    // Open Questions Registry: unresolved questions are preserved, not
    // papered over (OQ-1 orb/Delta/axon assignment, OQ-2 DMS assignment/H3,
    // OQ-3 Space discrepancy/H4). Resolution requires an evidence id.
    this.questions = new QuestionRegistry(OPEN_QUESTIONS);

    // The Sensory Adapter: every input is addressed BEFORE anything runs.
    // `engine.intake` is both the gate and the method: a callable that also
    // carries the IntakeGate instance (`engine.intake.gate`, `.exportHistory()`).
    const intakeGate = new IntakeGate({ engine: this });
    this.intakeGate = intakeGate;
    this.intake = Object.assign(
      (X, context = {}) => intakeGate.intake(X, context),
      {
        gate: intakeGate,
        exportHistory: () => intakeGate.exportHistory(),
        get history() { return intakeGate.history; },
      },
    );
    // The Learning Orchestrator: known-call -> routed -> grown -> learned-recall.
    this.learning = new LearningOrchestrator({
      engine: this,
      intake: intakeGate,
      factory: new ToolFactory(),
      router: new DimensionRouter(),
    });
    // The 17th automaton is GROWN, not registered: 'media-field' (gate 25,
    // Space) comes up through the learning grow path at boot, deterministic.
    this.learning.growBootMediaField();

    // Emergence layer (ported from pure-synthia-pass4-step41-REPAIRED/src/emergence/):
    //   engine.intent  — observes every derivation/learning result, records
    //                    capability gaps, emits confidence-weighted proposals;
    //   engine.editor  — versioned, reversible, derivation-hashed self-edit log;
    //   engine.detector— §15 three-criteria emergence measurement (novelty /
    //                    generation / evaluation), also fed by channel stats;
    //   engine.coordinator — synchronized multi-automata runs over the mesh.
    // All four are append-only observers/registries: they never mutate the
    // call path, so derivation hashes and replay are unaffected.
    this.editor = new SelfEditor({ engine: this });
    this.intent = new IntentEngine({ engine: this });
    this.detector = new EmergenceDetector({ engine: this });
    this.coordinator = new MeshCoordinator({ mesh: this.mesh });

    // First-class Klein context runtime. Every mounted automaton is wrapped as
    // a contextual K operator, but multi-tool output is produced by an actual
    // joint probe over the active context, not by summing isolated readings.
    // The runtime maintains an append-only witnessed-evaluation ledger and
    // enforces deterministic-after-collapse for an identical context hash.
    this.klein = new KleinContextRuntime({ engine: this });

    // Klein contact wiring. `contact()` is the cognitive/contact front door:
    // CHAT -> DISEMINER -> Language Contact -> Historical Monte Carlo -> AUTOLING
    // -> Computational Grammar Coder -> CHAT. `mode:'public'` uses the smaller
    // contact model and exposes person/agent addresses only through Base.
    this.contactLoop = new KleinContactLoop({ engine: this });

    // Semantic triples: every tool on the mesh (16 canonical + grown) is made
    // of triples — its gate, dimension, form, capabilities, channels, states,
    // named transitions and ports are asserted into the store at boot.
    for (const automaton of this.mesh.automata.values()) {
      this.tripleStore.addAll(toolOntology(automaton));
    }

    // A wiring audit must witness a real joint Klein evaluation, not merely
    // discover modules on disk. The probe is side-effect free because the
    // Klein runtime snapshots/restores every participant.
    this.kleinBootWitness = this.klein.evaluate({
      nodeId: 'boot:klein-connectivity',
      eventType: 'boot-connectivity',
      invocations: [
        { toolId: 'diseminer', input: { operation: 'observe', text: 'klein wiring probe' } },
        { toolId: 'conversation', input: { text: 'klein wiring probe', contributions: ['boot-connectivity'] } },
      ],
      context: { wiringProbe: true },
    });
  }

  /** The learning front door: request(text) -> LearningResult (async). */
  async request(text, context = {}) {
    const result = await this.learning.request(text, context);
    // Emergence observation (append-only): 'grown' results record an
    // 'unrouted' capability gap + proposal; 'known-call' is skipped because
    // engine.call already observed the underlying derivation.
    this.intent.observe(result, { source: 'request', request: text });
    return result;
  }

  /**
   * Klein contact front door.
   *   engine.contact({text, grammarB})          -> deep mesh learning/contact loop
   *   engine.contact({mode:'public', ...})     -> privacy-safe contact through Base
   */
  contact(input = {}, context = {}) {
    return this.contactLoop.run(input, context);
  }

  /** Tools grown at runtime (including the boot-grown 'media-field'). */
  grownTools() {
    return this.learning.grownTools();
  }

  /** Registry overview: id, gate, dimension, capabilities, automatonForm. */
  listTools() {
    return TOOL_REGISTRY.map((entry) => ({
      id: entry.id,
      gate: entry.gate,
      dimension: entry.dimension,
      capabilities: entry.capabilities,
      automatonForm: entry.automatonForm,
    }));
  }

  /** Per-projection mesh metrics { nodes, edges, avgDegree }. */
  meshMetrics() {
    return this.mesh.metrics();
  }

  /** Semantic-triple query passthrough: engine.triples({subject?, predicate?, object?}). */
  triples(query = {}) {
    return this.tripleStore.query(query);
  }

  /** All triples whose subject is the given tool id (its ontology + productions). */
  toolTriples(toolId) {
    return this.tripleStore.bySubject(toolId);
  }

  /** Persistent emergent channels: crossings promoted by repeated use (>= 3). */
  emergentChannels() {
    return this.channels.promoted();
  }

  /** The composite capability of a promoted channel, or null while temporary. */
  channelCapability(aId, bId) {
    return this.channels.emergentCapability(aId, bId);
  }

  /**
   * H10 — the decisive relational-capability experiment (pre-registered in
   * src/experiments/relational-capability.js): does the sequential packet
   * relation create a capability neither automaton possesses alone?
   * Returns the full report {hypothesis, results, transfer, interpretation, …}.
   */
  runRelationalExperiment() {
    return new RelationalCapabilityExperiment({ engine: this }).run();
  }

  /**
   * Direct structured invocation for internal organs/adapters that already know
   * the mounted tool id and need to pass an object rather than the text call
   * grammar. It still goes through intake, live Klein evaluation, semantic
   * provenance, experiential return, derivation history and emergence hooks.
   */
  invoke(toolId, input, context = {}) {
    const automaton = this.toolsById.get(toolId) || this.mesh.get(toolId);
    if (!automaton) throw new Error(`No automaton registered for tool '${toolId}'`);

    const addressed = this.intakeGate.intake({ toolId, input }, context);
    const derivationId = `drv-${String(++this.runtime.derivationCounter).padStart(4, '0')}`;
    this.runtime.callCount++;

    const kleinEvaluation = this.klein.evaluate({
      nodeId: `invoke:${derivationId}`,
      eventType: 'direct-tool-invoke',
      invocations: [{ toolId, input }],
      address: context?.canonicalAddress ?? automaton.address ?? null,
      dimension: context?.dimension ?? automaton.dimension ?? null,
      meshState: context?.meshState ?? null,
      context: { source: 'engine.invoke' },
      derivationId,
    });

    const result = automaton.run(input, { ...context, kleinEvaluation });
    const ledger = new ComplexityLedger();
    ledger.merge(result && result.ledger ? result.ledger : {});

    const asserted = this.tripleStore.addAll(runTriples({
      toolId,
      input,
      output: result.output,
      derivationId,
      trace: result.trace,
    }));
    const produced = asserted.find((t) => t.predicate === 'produced' && t.subject === toolId);
    automaton.absorbExperience({
      derivationId,
      intakeId: addressed.id,
      outputHash: produced ? produced.object : null,
      seq: this.runtime.callCount,
    });

    const transitions = [...new Set((result.trace || []).map((step) => step?.transition).filter(Boolean))];
    const derivation = new Derivation({
      id: derivationId,
      intakeId: addressed.id,
      input: { toolId, input },
      parse: { kind: 'direct-invoke', toolId },
      primitives: [toolId],
      operators: ['o_automaton'],
      relations: [{
        from: `klein:${kleinEvaluation.evaluationId}`,
        to: `invoke:${derivationId}`,
        relation: kleinEvaluation.result.relation ?? 'evaluated-no-relation',
        operator: 'klein-context',
        intensity: kleinEvaluation.result.intensity,
        direction: kleinEvaluation.result.direction,
      }],
      context,
      transforms: transitions,
      output: result.output,
      evaluation: {
        derivationIntegrity: 1,
        accepted: result.accepted !== false,
        kleinEvaluationId: kleinEvaluation.evaluationId,
        kleinContextHash: kleinEvaluation.contextHash,
      },
      ledger: ledger.toJSON(),
      kleinEvaluation,
      chainResults: [{
        tool: toolId,
        output: result.output,
        trace: result.trace,
        accepted: result.accepted,
        finalState: result.finalState,
      }],
      timestamp: Date.now(),
    });

    this.runtime.derivations.push(derivation);
    this.intent.observe(derivation, { source: 'invoke' });
    this.detector.testEmergence(derivation);
    return derivation;
  }

  /**
   * Execute a tool-call chain.
   *   call('klein-analogy "a:b::c:?" --depth=2 at 41.2 then morph-mir')
   * Returns a Derivation whose output is the last call's output.
   */
  call(input, context = {}) {
    // ADDRESS-FIRST: the Sensory Adapter intakes the raw input BEFORE parsing
    // or running anything; its derivation id is recorded into the main
    // Derivation as `intakeId`. Deterministic (counter-derived), so replay
    // reproduces it identically on a fresh engine.
    const addressed = this.intakeGate.intake(input, context);
    const parsed = parseChain(input);
    const ledger = new ComplexityLedger();

    const derivationId = `drv-${String(++this.runtime.derivationCounter).padStart(4, '0')}`;
    this.runtime.callCount++;

    // Mandatory Klein perception/translation pass for the exact active tool
    // chain. This happens before enactment and is then supplied to each actual
    // automaton run as shared context.
    const kleinEvaluation = this.klein.evaluate({
      nodeId: `call:${derivationId}`,
      eventType: 'tool-chain',
      invocations: parsed.calls.map((call) => ({
        toolId: call.tool,
        input: {
          args: call.args,
          address: call.address,
          flags: call.flags,
          raw: call.raw,
          packet: null,
        },
      })),
      address: parsed.calls[0]?.address ?? context?.canonicalAddress ?? null,
      dimension: context?.dimension ?? null,
      meshState: context?.meshState ?? null,
      context: { source: 'engine.call' },
      derivationId,
    });

    const chainResults = [];
    let previousPacket = null;

    for (let k = 0; k < parsed.calls.length; k++) {
      const call = parsed.calls[k];
      const next = parsed.calls[k + 1] || null;
      const automaton = this.toolsById.get(call.tool);
      if (!automaton) {
        // Defensive: parseChain already validated against lexicon ids.
        throw new Error(`No automaton registered for tool '${call.tool}'`);
      }

      const runInput = {
        args: call.args,
        address: call.address,
        flags: call.flags,
        raw: call.raw,
        packet: previousPacket,
      };

      const result = automaton.run(runInput, { ...context, kleinEvaluation });
      ledger.merge(result && result.ledger ? result.ledger : {});

      // Semantic triples: the run asserts its provenance — the input hash was
      // processedBy this tool, the tool produced the output hash, and every
      // trace step is a (stateFrom, transition, stateTo) triple carrying the
      // derivation id.
      const asserted = this.tripleStore.addAll(runTriples({
        toolId: call.tool,
        input: { args: call.args, flags: call.flags, address: call.address, raw: call.raw },
        output: result.output,
        derivationId,
        trace: result.trace,
      }));
      const produced = asserted.find((t) => t.predicate === 'produced' && t.subject === call.tool);

      // Experiential return: the result summary feeds back into the
      // participating automaton's owned state as an experience record
      // (counter-sequenced; no wall-clock).
      automaton.absorbExperience({
        derivationId,
        intakeId: addressed.id,
        outputHash: produced ? produced.object : null,
        seq: this.runtime.callCount,
      });

      // Two-call chaining: the next call receives this call's packet.
      // Packets only exist between calls — a terminal call (no `next`) has no
      // recipient, so no packet is created (packet.js rightfully rejects a
      // falsy `to`; a packet without a destination would be a dead letter).
      let packet = null;
      let receipt = null;
      if (next) {
        packet = new StatePacket({
          id: `pkt-${String(++this.runtime.packetCounter).padStart(4, '0')}`,
          from: call.tool,
          to: next.tool,
          kind: 'data',
          payload: result.output,
          address: call.address,
          derivationId,
        });
        receipt = this.mesh.route(packet);
      }

      chainResults.push({
        tool: call.tool,
        args: call.args,
        address: call.address,
        flags: call.flags,
        raw: call.raw,
        output: result.output,
        trace: result.trace,
        accepted: result.accepted,
        finalState: result.finalState,
        routed: next ? true : false,
        receipt,
      });

      previousPacket = packet;
    }

    const last = chainResults[chainResults.length - 1] || null;
    const transitions = [
      ...new Set(
        chainResults.flatMap((r) => (Array.isArray(r.trace) ? r.trace : []))
          .map((step) => step && step.transition)
          .filter(Boolean)
      ),
    ];

    const derivation = new Derivation({
      id: derivationId,
      intakeId: addressed.id, // the intake's own Derivation id (intake-N)
      input,
      parse: {
        chainLength: parsed.chainLength,
        calls: parsed.calls.map((c) => c.ast),
      },
      primitives: parsed.calls.map((c) => c.tool),
      operators: parsed.chainLength > 1 ? ['o_automaton', 'o_sequence'] : ['o_automaton'],
      relations: [
        ...chainResults.slice(0, -1).map((r, k) => ({
          from: r.tool,
          to: chainResults[k + 1].tool,
          relation: 'chain',
          operator: 'o_sequence',
        })),
        {
          from: `klein:${kleinEvaluation.evaluationId}`,
          to: `call:${derivationId}`,
          relation: kleinEvaluation.result.relation ?? 'evaluated-no-relation',
          operator: 'klein-context',
          intensity: kleinEvaluation.result.intensity,
          direction: kleinEvaluation.result.direction,
        },
      ],
      context,
      transforms: transitions,
      output: last ? last.output : null,
      evaluation: {
        derivationIntegrity: 1, // DI = 1 required (spec §12)
        chainLength: parsed.chainLength,
        accepted: chainResults.every((r) => r.accepted !== false),
        kleinEvaluationId: kleinEvaluation.evaluationId,
        kleinContextHash: kleinEvaluation.contextHash,
      },
      ledger: ledger.toJSON(),
      kleinEvaluation,
      chainResults,
      timestamp: Date.now(), // excluded from the derivation hash
    });

    this.runtime.derivations.push(derivation);

    // Emergence observation (cheap, append-only): the intent engine records
    // capability gaps + proposals for unsatisfied derivations; the detector
    // logs the §15 novelty/generation/evaluation verdict. Neither touches the
    // derivation, so hashes and replay are unaffected.
    this.intent.observe(derivation, { source: 'call' });
    this.detector.testEmergence(derivation);

    return derivation;
  }

  /**
   * Deterministic replay (spec §12): same (state, input, context,
   * grammarVersion, operatorVersion) → identical derivation hash.
   *
   * "Same state" is reconstructed, not assumed: when this engine recorded the
   * derivation, its full input history prefix is re-run on a fresh engine so
   * counter-derived ids and tool owned state evolve identically before the
   * replayed call fires. Foreign derivations (no recorded history here)
   * replay from genesis state.
   */
  replay(derivationJSON) {
    const original =
      typeof derivationJSON === 'string' ? JSON.parse(derivationJSON) : derivationJSON;
    const fresh = new SynthiaAutomata();
    const historyIndex = this.runtime.derivations.findIndex((d) => d.id === original.id);
    let replayed;
    if (historyIndex >= 0) {
      for (let k = 0; k <= historyIndex; k++) {
        const prior = this.runtime.derivations[k];
        replayed = fresh.call(prior.input, prior.context || {});
      }
    } else {
      replayed = fresh.call(original.input, original.context || {});
    }
    const hashMatch = replayed.hash === original.hash;
    return {
      status: hashMatch ? 'REPRODUCED' : 'MISMATCH',
      hashMatch,
      original: original.hash,
      replayed: replayed.hash,
    };
  }
}

