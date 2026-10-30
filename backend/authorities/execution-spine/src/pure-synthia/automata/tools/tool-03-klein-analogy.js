// Pure Synthia Automata — tool 03: klein-analogy, analogy transducer (source→map→target→check)

import { Automaton } from '../automaton.js';

const xorBits = (a, b) => a.map((bit, i) => bit ^ b[i]);
const xnorBits = (a, b) => a.map((bit, i) => Number(bit === b[i]));
const applyOperator = (a, b, mode) => (mode === 'equivalence' ? xnorBits(a, b) : xorBits(a, b));

export class KleinAnalogyAutomaton extends Automaton {
  static registry = Object.freeze({
    id: 'klein-analogy',
    aliases: ['analogy'],
    gate: 4,
    channels: ['4-63'],
    capabilities: ['solve-analogy'],
    ports: Object.freeze({
      in: Object.freeze([Object.freeze({ id: 'input', type: 'json' })]),
      out: Object.freeze([Object.freeze({ id: 'output', type: 'json', guarantees: ['addressed'] })]),
    }),
    automatonForm: 'analogy transducer',
    dimension: 'Design',
    description: "Klein's Boolean ATO analogy: A:B::C:? solved as membership bit vectors; relation = XOR or XNOR(A,B) applied to C (both operators involutive). Stateless.",
  });

  constructor() {
    const d = KleinAnalogyAutomaton.registry;
    super({
      id: d.id,
      address: { gate: d.gate, line: 1, color: 1, tone: 1, base: 1 },
      states: [
        { id: 'source', initial: true },
        { id: 'map' },
        { id: 'target' },
        { id: 'check', accepting: true },
      ],
      alphabet: ['feature', 'bit', 'vector', 'relation'],
      q0: 'source',
      finals: ['check'],
      ports: d.ports,
      capabilities: d.capabilities,
      dimension: d.dimension,
      automatonForm: d.automatonForm,
      state: null,
      implementation: (input = {}, { emit }) => {
        const { vocab = [], A = [], B = [], C = [], mode = 'xor' } = input;
        if (mode !== 'xor' && mode !== 'equivalence') {
          return { ok: false, reason: 'UNKNOWN_MODE', mode };
        }
        const universe = [...new Set(vocab)];
        const bits = (items) => universe.map((feature) => (items.includes(feature) ? 1 : 0));
        emit({ from: 'source', to: 'map', input: `${A.length}:${B.length}`, transition: 'flow' });
        const relation = applyOperator(bits(A), bits(B), mode);
        emit({ from: 'map', to: 'target', input: relation.join(''), transition: 'mirror', note: mode });
        const resultBits = applyOperator(bits(C), relation, mode);
        const result = universe.filter((_, i) => resultBits[i] === 1);
        emit({ from: 'target', to: 'check', input: null, transition: 'flow' });
        return { ok: true, relation: relation.join(''), result };
      },
    });
  }
}

