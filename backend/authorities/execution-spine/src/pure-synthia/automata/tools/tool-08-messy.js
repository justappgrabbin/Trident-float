// Pure Synthia Automata — tool 08: messy, probabilistic FSM (scatter→tolerate→express)

import { Automaton } from '../automaton.js';

const clone = (value) => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
};

export class MessyAutomaton extends Automaton {
  static registry = Object.freeze({
    id: 'messy',
    aliases: [],
    gate: 3,
    channels: ['3-60'],
    capabilities: ['simulate'],
    ports: Object.freeze({
      in: Object.freeze([Object.freeze({ id: 'input', type: 'json' })]),
      out: Object.freeze([Object.freeze({ id: 'output', type: 'json', guarantees: ['addressed'] })]),
    }),
    automatonForm: 'probabilistic FSM',
    dimension: 'Movement',
    description: "Klein's MESSY: per tick, the first rule whose when() matches an agent applies; full tick history retained.",
  });

  constructor() {
    const d = MessyAutomaton.registry;
    super({
      id: d.id,
      address: { gate: d.gate, line: 1, color: 1, tone: 1, base: 1 },
      states: [
        { id: 'scatter', initial: true },
        { id: 'tolerate' },
        { id: 'express', accepting: true },
      ],
      alphabet: ['agent', 'rule', 'tick', 'feature'],
      q0: 'scatter',
      finals: ['express'],
      ports: d.ports,
      capabilities: d.capabilities,
      dimension: d.dimension,
      automatonForm: d.automatonForm,
      state: null,
      implementation: (input = {}, { emit }) => {
        const { agents = [], rules = [], ticks = 5 } = input;
        emit({ from: 'scatter', to: 'tolerate', input: `agents=${agents.length}`, transition: 'flow' });
        let state = agents.map((a) => ({ id: a.id, features: { ...(a.features || {}) } }));
        const history = [{ tick: 0, state: clone(state) }];
        for (let tick = 1; tick <= ticks; tick++) {
          const previous = state;
          state = previous.map((agent) => {
            const world = { tick, agents: clone(previous) };
            const rule = rules.find((candidate) => candidate.when(agent, world));
            return rule ? rule.apply(clone(agent), world) : agent;
          });
          history.push({ tick, state: clone(state) });
        }
        // Tolerated partial rule matches accumulate per tick (RECURSION over ticks).
        emit({ from: 'tolerate', to: 'tolerate', input: `ticks=${ticks}`, transition: 'recursion' });
        emit({ from: 'tolerate', to: 'express', input: null, transition: 'flow' });
        return { ok: true, ticks, finalState: state, history };
      },
    });
  }
}

