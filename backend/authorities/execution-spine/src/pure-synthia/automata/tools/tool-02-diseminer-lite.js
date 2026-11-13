// Pure Synthia Automata — tool 02: diseminer-lite, narrative-sim FSM (receive→simulate→narrate)

import { Automaton } from '../automaton.js';

const tokenize = (text) => String(text).toLowerCase().match(/[a-z0-9_'-]+/g) || [];

function ingest(state, text, context = {}) {
  const tokens = tokenize(text);
  const document = {
    id: `doc-${++state.sequence}`,
    source: context.source ?? null,
    address: context.address ?? null,
    tokens,
  };
  state.documents.push(document);
  const windowSize = state.windowSize;
  for (let i = 0; i < tokens.length; i++) {
    const term = tokens[i];
    if (!state.vectors[term]) state.vectors[term] = {};
    const vector = state.vectors[term];
    for (let j = Math.max(0, i - windowSize); j <= Math.min(tokens.length - 1, i + windowSize); j++) {
      if (i === j) continue;
      const ctx = tokens[j];
      vector[ctx] = (vector[ctx] || 0) + 1; // symmetric co-occurrence window
    }
  }
  return { ok: true, document };
}

function similarity(state, a, b) {
  const x = state.vectors[String(a).toLowerCase()];
  const y = state.vectors[String(b).toLowerCase()];
  if (!x || !y) return 0;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  let dot = 0; let ax = 0; let by = 0;
  for (const key of keys) {
    const xv = x[key] || 0;
    const yv = y[key] || 0;
    dot += xv * yv; ax += xv * xv; by += yv * yv;
  }
  return ax && by ? dot / (Math.sqrt(ax) * Math.sqrt(by)) : 0;
}

function neighbors(state, term, { limit = 5 } = {}) {
  const key = String(term).toLowerCase();
  if (!state.vectors[key]) return { ok: true, term: key, neighbors: [] };
  const ranked = Object.keys(state.vectors)
    .filter((other) => other !== key)
    .map((other) => ({ term: other, similarity: similarity(state, key, other) }))
    .sort((a, b) => b.similarity - a.similarity || a.term.localeCompare(b.term))
    .slice(0, limit);
  return { ok: true, term: key, neighbors: ranked };
}

function infer(state, source, target, { minimum = 0 } = {}) {
  const viaList = neighbors(state, source, { limit: Object.keys(state.vectors).length }).neighbors
    .filter((item) => item.similarity >= minimum && similarity(state, item.term, target) > 0)
    .map((item) => ({ via: item.term, score: (item.similarity + similarity(state, item.term, target)) / 2 }))
    .sort((a, b) => b.score - a.score || a.via.localeCompare(b.via));
  return { ok: true, source, target, candidates: viaList };
}

function exportMemory(state) {
  return {
    ok: true,
    windowSize: state.windowSize,
    documents: state.documents.map((doc) => ({ ...doc, tokens: [...doc.tokens] })),
    vectors: Object.fromEntries(Object.keys(state.vectors).sort()
      .map((term) => [term, { ...state.vectors[term] }])),
  };
}

export class DiseminerLiteAutomaton extends Automaton {
  static registry = Object.freeze({
    id: 'diseminer-lite',
    aliases: ['diseminar-lite'],
    gate: 48,
    channels: ['16-48'],
    capabilities: ['ingest', 'neighbors', 'infer', 'export'],
    ports: Object.freeze({
      in: Object.freeze([Object.freeze({ id: 'input', type: 'json' })]),
      out: Object.freeze([Object.freeze({ id: 'output', type: 'json', guarantees: ['addressed'] })]),
    }),
    automatonForm: 'narrative-sim FSM',
    dimension: 'Evolution',
    description: "Klein's Diseminer, lite: persistent symmetric-window co-occurrence vectors; cosine neighbors and two-hop distributional inference.",
  });

  constructor() {
    const d = DiseminerLiteAutomaton.registry;
    super({
      id: d.id,
      address: { gate: d.gate, line: 1, color: 1, tone: 1, base: 1 },
      states: [
        { id: 'receive', initial: true },
        { id: 'simulate' },
        { id: 'narrate', accepting: true },
      ],
      alphabet: ['token', 'document', 'vector', 'term', 'context'],
      q0: 'receive',
      finals: ['narrate'],
      ports: d.ports,
      capabilities: d.capabilities,
      dimension: d.dimension,
      automatonForm: d.automatonForm,
      state: { windowSize: 2, vectors: {}, documents: [], sequence: 0 },
      implementation: (input = {}, { state, emit }) => {
        emit({ from: 'receive', to: 'simulate', input: input.operation || 'export', transition: 'flow' });
        const operation = input.operation;
        let output;
        if (operation === 'ingest') {
          emit({ from: 'simulate', to: 'simulate', input: 'co-occurrence', transition: 'fusion' });
          output = ingest(state, input.text, input.context || {});
        } else if (operation === 'neighbors') {
          output = neighbors(state, input.term, { limit: input.limit ?? 5 });
        } else if (operation === 'infer') {
          emit({ from: 'simulate', to: 'simulate', input: `${input.source}->${input.target}`, transition: 'recursion' });
          output = infer(state, input.source, input.target, input.options || {});
        } else if (operation === 'export') {
          output = exportMemory(state);
        } else {
          output = { ok: false, reason: 'UNKNOWN_OPERATION' };
        }
        // Narration = discourse composition of the simulated space (WEAVE, spec §7).
        emit({ from: 'simulate', to: 'narrate', input: null, transition: 'weave', note: operation || 'export' });
        return output;
      },
    });
  }
}

