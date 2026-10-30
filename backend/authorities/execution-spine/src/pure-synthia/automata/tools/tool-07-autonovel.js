// Pure Synthia Automata — tool 07: autonovel, generative stack machine (premise→weave→chapter→bind)

import { Automaton } from '../automaton.js';

const clone = (value) => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
};

function register(state, domain) {
  if (!domain?.id || !Array.isArray(domain.primitives) || !Array.isArray(domain.combinators)) {
    return { ok: false, reason: 'INVALID_DOMAIN' };
  }
  state.domains[domain.id] = {
    ...domain,
    primitives: domain.primitives.map((x) => ({ ...x })),
    combinators: domain.combinators.map((x) => ({ ...x })),
  };
  return { ok: true, domain: state.domains[domain.id] };
}

function generate(state, { domain: domainId, seeds = [], maxDepth = 8 } = {}) {
  const domain = state.domains[domainId];
  if (!domain) return { ok: false, reason: 'DOMAIN_NOT_FOUND', domain: domainId ?? null };
  let nodes = seeds.map((seed, index) => ({
    id: `node-${index + 1}`,
    type: seed.type,
    value: seed.value ?? seed.type,
    features: { ...(seed.features || {}) },
  }));
  const relations = [];
  const used = new Set();
  for (let depth = 0; depth < maxDepth; depth++) {
    const possible = [];
    for (const combinator of domain.combinators) {
      const left = nodes.find((n) => n.type === combinator.inputs?.[0]);
      const right = nodes.find((n) => n.type === combinator.inputs?.[1] && n.id !== left?.id);
      if (left && right) {
        const key = `${combinator.id}:${left.id}:${right.id}`;
        if (!used.has(key)) possible.push({ combinator, left, right, key });
      }
    }
    if (!possible.length) break;
    // Lexicographically-first unused applicable combinator.
    possible.sort((a, b) => a.combinator.id.localeCompare(b.combinator.id) || a.key.localeCompare(b.key));
    const chosen = possible[0];
    used.add(chosen.key);
    const created = {
      id: `node-${nodes.length + 1}`,
      type: chosen.combinator.output,
      value: chosen.combinator.apply
        ? chosen.combinator.apply(chosen.left.value, chosen.right.value)
        : [chosen.left.value, chosen.right.value],
      features: { ...(chosen.left.features || {}), ...(chosen.right.features || {}) },
    };
    nodes = [...nodes, created];
    relations.push({
      type: chosen.combinator.type || 'combine',
      source: [chosen.left.id, chosen.right.id],
      target: created.id,
      combinator: chosen.combinator.id,
    });
  }
  return {
    ok: true,
    id: `structure-${++state.sequence}`,
    domain: domainId,
    nodes,
    relations,
    lineage: relations.map((r) => r.combinator),
    generationDepth: relations.length,
  };
}

export class AutonovelAutomaton extends Automaton {
  static registry = Object.freeze({
    id: 'autonovel',
    aliases: ['novel'],
    gate: 56,
    channels: ['11-56'],
    capabilities: ['register', 'learn', 'generate'],
    ports: Object.freeze({
      in: Object.freeze([Object.freeze({ id: 'input', type: 'json' })]),
      out: Object.freeze([Object.freeze({ id: 'output', type: 'json', guarantees: ['addressed'] })]),
    }),
    automatonForm: 'generative stack machine',
    dimension: 'Design',
    description: "Klein's AutoNovel: persistent combinator domains; generate grows structures by the lexicographically-first unused applicable combinator.",
  });

  constructor() {
    const d = AutonovelAutomaton.registry;
    super({
      id: d.id,
      address: { gate: d.gate, line: 1, color: 1, tone: 1, base: 1 },
      states: [
        { id: 'premise', initial: true },
        { id: 'weave' },
        { id: 'chapter' },
        { id: 'bind', accepting: true },
      ],
      alphabet: ['primitive', 'combinator', 'node', 'relation', 'structure'],
      q0: 'premise',
      finals: ['bind'],
      ports: d.ports,
      capabilities: d.capabilities,
      dimension: d.dimension,
      automatonForm: d.automatonForm,
      state: { domains: {}, examples: [], sequence: 0 },
      implementation: (input = {}, { state, emit }) => {
        const operation = input.operation;
        emit({ from: 'premise', to: 'weave', input: operation || null, transition: 'flow' });
        let output;
        if (operation === 'register') {
          output = register(state, input.domain);
        } else if (operation === 'learn') {
          state.examples.push(clone(input.structure ?? null));
          output = { ok: true, stored: state.examples.length };
        } else if (operation === 'generate') {
          // Combining primitives into chapters (FUSION), woven into discourse (WEAVE).
          emit({ from: 'weave', to: 'chapter', input: input.spec?.domain || null, transition: 'fusion' });
          output = generate(state, input.spec || {});
          emit({ from: 'chapter', to: 'bind', input: output.id || null, transition: 'chain' });
          return output;
        } else {
          output = { ok: false, reason: 'UNKNOWN_OPERATION' };
        }
        emit({ from: 'weave', to: 'chapter', input: null, transition: 'weave', note: operation });
        emit({ from: 'chapter', to: 'bind', input: null, transition: 'chain' });
        return output;
      },
    });
  }
}

