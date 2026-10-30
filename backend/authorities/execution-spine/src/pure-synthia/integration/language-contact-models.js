// Pure-JS Klein contact wiring for Synthia.
// Two roles are deliberately kept separate:
//   1) PublicLanguageContactModel: contact between people/agents at the public address boundary (through Base only).
//   2) DeepLanguageContactModel: internal mesh loop that lets existing Klein tools exchange meaning, variation and learned grammar.

import { formatContactAddress } from './canonical-address-code.js';
import { mulberry32 } from '../state-space/constants.js';
import { StatePacket } from '../mesh/packet.js';

const asGrammar = (value) => {
  if (!value) return {};
  if (!Array.isArray(value)) return { ...value };
  const out = {};
  value.forEach((rule, i) => {
    const key = rule?.lhs || rule?.id || `R${i + 1}`;
    out[key] = rule?.rhs ?? rule?.template ?? rule?.targetPattern ?? rule;
  });
  return out;
};

const valueText = (v) => typeof v === 'string' ? v : JSON.stringify(v);

export class PublicLanguageContactModel {
  run({ partyA = {}, partyB = {}, grammarA = {}, grammarB = {}, contactRate = 0.15, generations = 10, seed = 1 } = {}) {
    // Only the public/contact address is allowed into the contact record.
    const addressA = formatContactAddress(partyA.canonicalAddress || partyA.address || partyA);
    const addressB = formatContactAddress(partyB.canonicalAddress || partyB.address || partyB);
    const rng = mulberry32(seed);
    let current = asGrammar(grammarA);
    const donor = asGrammar(grammarB);
    const trajectory = [{ generation: 0, grammar: { ...current } }];

    for (let generation = 1; generation <= generations; generation++) {
      const next = { ...current };
      for (const rule of Object.keys(donor).sort()) {
        if (rng() < contactRate) next[rule] = donor[rule];
      }
      current = next;
      trajectory.push({ generation, grammar: { ...current } });
    }

    const borrowed = Object.keys(donor).filter((rule) => current[rule] === donor[rule] && asGrammar(grammarA)[rule] !== donor[rule]);
    return Object.freeze({
      ok: true,
      mode: 'public-contact-through-base',
      parties: Object.freeze([addressA, addressB]),
      finalGrammar: current,
      borrowedRules: borrowed,
      borrowedCount: borrowed.length,
      trajectory,
      privacyBoundary: 'Base',
    });
  }
}

export class DeepLanguageContactModel {
  constructor({ engine }) {
    if (!engine) throw new Error('DeepLanguageContactModel requires the Synthia engine');
    this.engine = engine;
    this.transportPath = Object.freeze([
      ['diseminer', 'language-contact'],
      ['language-contact', 'historical-monte-carlo'],
      ['historical-monte-carlo', 'autoling'],
      ['autoling', 'computational-grammar-coder'],
      ['computational-grammar-coder', 'conversation'],
    ]);
    // The contact loop must be a real mesh path, not a list of direct method
    // calls that happen to live in the same package. StatePacket transport is
    // intentionally separate from typed application-port compatibility.
    for (const [from, to] of this.transportPath) {
      this.engine.mesh.connectTransport(from, to, { operator: 'klein-contact' });
    }
  }

  #tool(id) {
    const tool = this.engine.toolsById.get(id);
    if (!tool) throw new Error(`Klein contact loop missing registered tool: ${id}`);
    return tool;
  }

  #route(from, to, payload, address = null) {
    const packet = new StatePacket({
      id: `pkt-${String(++this.engine.runtime.packetCounter).padStart(4, '0')}`,
      from,
      to,
      kind: 'klein-contact',
      payload,
      address,
      derivationId: null,
    });
    return Object.freeze({ packet, receipt: this.engine.mesh.route(packet) });
  }

  run(input = {}, context = {}) {
    const text = String(input.text ?? input.message ?? '').trim();
    if (!text) throw new Error('Klein contact loop requires input.text');
    if (!this.engine.klein || typeof this.engine.klein.evaluate !== 'function') {
      throw new Error('Klein contact loop requires the live KleinContextRuntime');
    }

    const diseminer = this.#tool('diseminer');
    const contact = this.#tool('language-contact');
    const monte = this.#tool('historical-monte-carlo');
    const autoling = this.#tool('autoling');
    const coder = this.#tool('computational-grammar-coder');
    const conversation = this.#tool('conversation');

    const receipts = [];
    const invocations = [];

    // CHAT reaches into DISEMINER for meaning/evidence rather than inventing the meaning itself.
    const observeInput = { operation: 'observe', text };
    const extractInput = { operation: 'extract', text, source: input.source || 'chat' };
    invocations.push({ toolId: 'diseminer', input: observeInput }, { toolId: 'diseminer', input: extractInput });
    const observed = diseminer.run(observeInput, context).output;
    const extracted = diseminer.run(extractInput, context).output;
    const d2c = this.#route('diseminer', 'language-contact', { observed, extracted });
    receipts.push(d2c.receipt);

    // AUTOLING's persistent grammar is the host language. A peer grammar may come from another mesh participant.
    const statsInput = { operation: 'stats' };
    invocations.push({ toolId: 'autoling', input: statsInput });
    const autolingBefore = autoling.run(statsInput, context).output;
    const grammarA = asGrammar(input.grammarA || autolingBefore.rules || {});
    const grammarB = asGrammar(input.grammarB || input.peerGrammar || {});

    // Language Contact performs actual rule-system contact. No names or private sub-Base person data are required here.
    const contactInput = {
      grammarA,
      grammarB,
      contactRate: input.contactRate ?? 0.15,
      generations: input.contactGenerations ?? 10,
      seed: input.seed ?? 1,
      packet: d2c.packet,
    };
    invocations.push({ toolId: 'language-contact', input: contactInput });
    const contactResult = contact.run(contactInput, context).output;
    const c2m = this.#route('language-contact', 'historical-monte-carlo', contactResult);
    receipts.push(c2m.receipt);

    // Historical Monte Carlo explores the contacted grammar as a variant field.
    const contactedGrammar = asGrammar(contactResult.finalGrammar || grammarA);
    const variants = Object.fromEntries(Object.keys(contactedGrammar).map((key) => [key, 1]));
    const monteInput = {
      variants: Object.keys(variants).length ? variants : { unchanged: 1 },
      seed: (input.seed ?? 1) + 1,
      mutationScale: input.mutationScale ?? 0.1,
      generations: input.monteCarloGenerations ?? 20,
      packet: c2m.packet,
    };
    invocations.push({ toolId: 'historical-monte-carlo', input: monteInput });
    const monteResult = monte.run(monteInput, context).output;
    const m2a = this.#route('historical-monte-carlo', 'autoling', monteResult);
    receipts.push(m2a.receipt);

    // AUTOLING learns from the observed language and, when contact produced rules, induces a reusable contact rule.
    const pipelineInput = { operation: 'pipeline', text, packet: m2a.packet };
    invocations.push({ toolId: 'autoling', input: pipelineInput });
    const learned = autoling.run(pipelineInput, context).output;
    let induced = null;
    let induceInput = null;
    const contactExamples = Object.entries(contactedGrammar).map(([rule, value]) => ({
      input: { relations: ['language-contact'], constraints: [rule, 'contact'] },
      output: valueText(value),
    }));
    if (contactExamples.length) {
      induceInput = { operation: 'induce', examples: contactExamples };
      invocations.push({ toolId: 'autoling', input: induceInput });
      induced = autoling.run(induceInput, context).output;
    }
    const a2g = this.#route('autoling', 'computational-grammar-coder', { learned, induced });
    receipts.push(a2g.receipt);

    // Grammar coder realizes a computational/syntactic coding of the same meaning-bearing signal.
    const coderInput = { text, packet: a2g.packet };
    invocations.push({ toolId: 'computational-grammar-coder', input: coderInput });
    const coded = coder.run(coderInput, context).output;

    // Conversation participates in the same Klein context before the surface
    // utterance is enacted, so the Klein result can actually influence the
    // contribution it receives instead of being an after-the-fact dashboard.
    const preliminarySummary = `contact:${contactResult.borrowedCount ?? 0} borrowed; monte:${monteResult.dominantVariant ?? 'none'}; autoling:${induced?.rule?.status ?? 'observed'}`;
    const conversationProbeInput = { text, contributions: [preliminarySummary] };
    invocations.push({ toolId: 'conversation', input: conversationProbeInput });

    const kleinEvaluation = this.engine.klein.evaluate({
      nodeId: 'contact:deep-language',
      eventType: 'deep-language-contact',
      invocations,
      address: context?.canonicalAddress ?? context?.address ?? null,
      dimension: context?.dimension ?? null,
      meshState: context?.meshState ?? null,
      context: { source: 'deep-language-contact' },
    });

    const contactSummary = `${preliminarySummary}; klein:${kleinEvaluation.result.relation ?? 'no-relation'}; intensity:${kleinEvaluation.result.intensity.toFixed(4)}; direction:${kleinEvaluation.result.direction}`;
    const g2c = this.#route('computational-grammar-coder', 'conversation', {
      coded,
      kleinEvaluationId: kleinEvaluation.evaluationId,
      kleinResult: kleinEvaluation.result,
    });
    receipts.push(g2c.receipt);

    // CHAT is the surface again: it receives the actual joint Klein reading.
    const conversationInput = {
      text,
      contributions: [contactSummary],
      packet: g2c.packet,
      kleinEvaluation,
    };
    const chat = conversation.run(conversationInput, { ...context, kleinEvaluation }).output;

    return Object.freeze({
      ok: true,
      mode: 'deep-klein-contact-loop',
      kleinEvaluation,
      transport: Object.freeze({
        path: this.transportPath,
        receipts: Object.freeze(receipts),
        delivered: receipts.every((receipt) => receipt?.delivered === true),
      }),
      stages: Object.freeze({
        diseminer: Object.freeze({ observed, extracted }),
        languageContact: contactResult,
        historicalMonteCarlo: monteResult,
        autoling: Object.freeze({ learned, induced }),
        grammarCoder: coded,
        chat,
      }),
      learnedCapabilityCandidate: induced?.rule || null,
    });
  }
}

export class KleinContactLoop {
  constructor({ engine }) {
    this.public = new PublicLanguageContactModel();
    this.deep = new DeepLanguageContactModel({ engine });
  }

  run(input = {}, context = {}) {
    if (input.mode === 'public' || input.publicContact === true) return this.public.run(input);
    return this.deep.run(input, context);
  }
}

