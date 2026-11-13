import { Automaton } from '../authorities/execution-spine/src/pure-synthia/automata/automaton.js';
import GenerativeAddressMorphologyEngine from '../extensions/generative-address-morphology/src/engine.mjs';

const safeClone = (value) => {
  try { return structuredClone(value); }
  catch { try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); } }
};

function summarize(snapshot = {}) {
  const energies = snapshot?.ecology?.energies ?? [];
  const dominant = energies[0] ?? null;
  return Object.freeze({
    addressCount: snapshot?.addresses?.length ?? 0,
    generationStatus: snapshot?.generation?.status ?? 'explicit-addresses',
    structuralView: snapshot?.structure?.view?.view ?? null,
    recognitionStatus: snapshot?.structure?.recognition?.status ?? 'not-invoked',
    recognizedRelationshipCount: snapshot?.structure?.recognition?.graph?.relations?.length ?? 0,
    recognitionToolIds: Object.freeze([...new Set((snapshot?.structure?.recognition?.runs ?? []).filter(r=>r.status==='executed').map(r=>r.toolId))]),
    symbolicWorkers: snapshot?.structure?.swarm?.count ?? 0,
    observer: safeClone(snapshot?.structure?.view?.observer ?? null),
    spaceStatus: snapshot?.structure?.space?.status ?? null,
    activeGraphCount: snapshot?.graphs?.length ?? 0,
    connectionCount: snapshot?.connections?.length ?? 0,
    dominantEnergy: snapshot?.ecology?.dominantEnergy ?? null,
    dominantStrength: Number(dominant?.dominance ?? 0),
    graphIds: Object.freeze((snapshot?.graphs ?? []).map(g => g.id)),
    pods: Object.freeze(safeClone(snapshot?.ecology?.pods ?? [])),
    projections: Object.freeze(safeClone(snapshot?.projections ?? {})),
  });
}

/**
 * Mounted Synthia organ for addressed connection formation, graph ecology,
 * dominant-energy measurement and multimodal morphology projection.
 *
 * It does not replace any existing Synthia automaton. It joins the live mesh.
 */
export class GenerativeMorphologyAutomaton extends Automaton {
  static descriptor = Object.freeze({
    id: 'generative-address-morphology',
    aliases: Object.freeze(['address-morphology', 'morphology-engine', 'graph-ecology']),
    capabilities: Object.freeze([
      'compile-addresses', 'form-connections', 'instantiate-graphs', 'graph-ecology',
      'dominant-energy', 'project-morphology', 'chat-read', 'chat-write',
      'internet-read', 'internet-write', 'status', 'structure',
    ]),
    ports: Object.freeze({
      in: Object.freeze([{ id: 'addressed-state', type: 'json', schemaVersion: '1' }]),
      out: Object.freeze([{ id: 'morphology-state', type: 'json', schemaVersion: '1' }]),
    }),
    automatonForm: 'generative addressed graph-morphology organ',
    dimension: null,
    description: 'Compiles fully addressed active structures into lawful connections, conditional graphs, graph ecology, dominant energy and multimodal projections. Used by chat and internet surfaces without replacing them.',
  });

  constructor(options = {}) {
    let dispatch;
    super({
      id: GenerativeMorphologyAutomaton.descriptor.id,
      // No fabricated gate is assigned to the organ. Its run-time subjects carry
      // the actual addressed gates. arcSecond keeps transition rendering valid.
      address: { line: 1, color: 1, tone: 1, base: 1, zodiac: 1, house: 1, arcSecond: 0 },
      states: [{ id: 'ready', initial: true, accepting: true }],
      alphabet: [],
      q0: 'ready',
      finals: ['ready'],
      ports: GenerativeMorphologyAutomaton.descriptor.ports,
      capabilities: GenerativeMorphologyAutomaton.descriptor.capabilities,
      dimension: null,
      automatonForm: GenerativeMorphologyAutomaton.descriptor.automatonForm,
      state: { runs: 0, lastSummary: null },
      implementation: (input, ctx) => dispatch(input, ctx),
    });
    this.morphology = options.engine ?? new GenerativeAddressMorphologyEngine(options.engineOptions ?? {});
    dispatch = (input, ctx) => this.#dispatch(input, ctx);
  }

  #engineFor(context = {}) {
    // Klein's witness probes must not mutate/persist graph state. A fresh
    // ephemeral engine gives Klein a real run shape while preserving the live
    // organism until enactment.
    if (context?.klein === true || context?.kleinJoint === true) {
      return this.morphology.fork();
    }
    return this.morphology;
  }

  #dispatch(raw = {}, wrapper = {}) {
    const input = raw && typeof raw === 'object' ? raw : { subject: raw };
    const operation = input.operation ?? 'compile';
    const addresses = Array.isArray(input.addresses) ? input.addresses : [];
    const context = wrapper?.context ?? {};
    const engine = this.#engineFor(context);

    if (operation === 'status') {
      const snapshot = engine.snapshot();
      return Object.freeze({ ok: true, operation, summary: summarize(snapshot), snapshot: safeClone(snapshot) });
    }

    const snapshot = engine.run(addresses, {
      ...(input.context ?? {}),
      ...(operation === 'structure' ? {addressMode:'structural'} : {}),
      surface: input.surface ?? operation,
      subject: safeClone(input.subject ?? null),
    });
    const summary = summarize(snapshot);

    if (!(context?.klein === true || context?.kleinJoint === true)) {
      this.ownedState.runs += 1;
      this.ownedState.lastSummary = safeClone(summary);
    }

    return Object.freeze({
      ok: true,
      operation,
      surface: input.surface ?? null,
      subject: safeClone(input.subject ?? null),
      summary,
      snapshot: safeClone(snapshot),
      expressionEnvelope: Object.freeze({
        dominantEnergy: summary.dominantEnergy,
        dominantStrength: summary.dominantStrength,
        projections: summary.projections,
        // Exact language transformation remains source-decoding work. The
        // envelope is live now without inventing personality prose.
        languagePolicy: 'preserve-base-utterance-until-addressed-language-rule-is-source-supported',
      }),
    });
  }
}

export { summarize as summarizeMorphology };
export default GenerativeMorphologyAutomaton;


