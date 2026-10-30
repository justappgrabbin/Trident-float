// Pure Synthia Automata — tool 05: language-contact, dual-tape transducer (borrow→adapt→nativize)

import { Automaton } from '../automaton.js';
import { mulberry32 } from '../../state-space/constants.js';

export class LanguageContactAutomaton extends Automaton {
  static registry = Object.freeze({
    id: 'language-contact',
    aliases: ['contact'],
    gate: 12,
    channels: ['12-22'],
    capabilities: ['simulate-contact'],
    ports: Object.freeze({
      in: Object.freeze([Object.freeze({ id: 'input', type: 'json' })]),
      out: Object.freeze([Object.freeze({ id: 'output', type: 'json', guarantees: ['addressed'] })]),
    }),
    automatonForm: 'dual-tape transducer',
    dimension: 'Movement',
    description: 'Seeded contact simulation: per generation, each sorted grammarB rule replaces the matching grammarA rule when rng() < contactRate.',
  });

  constructor() {
    const d = LanguageContactAutomaton.registry;
    super({
      id: d.id,
      address: { gate: d.gate, line: 1, color: 1, tone: 1, base: 1 },
      states: [
        { id: 'borrow', initial: true },
        { id: 'adapt' },
        { id: 'nativize', accepting: true },
      ],
      alphabet: ['rule', 'grammar', 'generation', 'contact-event'],
      q0: 'borrow',
      finals: ['nativize'],
      ports: d.ports,
      capabilities: d.capabilities,
      dimension: d.dimension,
      automatonForm: d.automatonForm,
      state: null,
      implementation: (input = {}, { emit }) => {
        const { grammarA = {}, grammarB = {} } = input;
        const seed = input.seed ?? 1;
        const rate = input.contactRate ?? 0.15;
        const generations = input.generations ?? 10;
        const rng = mulberry32(seed);
        let grammar = { ...grammarA };
        const trajectory = [{ generation: 0, grammar: { ...grammar } }];
        emit({ from: 'borrow', to: 'adapt', input: `seed=${seed}`, transition: 'flow' });
        for (let generation = 1; generation <= generations; generation++) {
          const next = { ...grammar };
          for (const rule of Object.keys(grammarB).sort()) {
            if (rng() < rate) next[rule] = grammarB[rule];
          }
          grammar = next;
          trajectory.push({ generation, grammar: { ...grammar } });
        }
        // Borrowed rules fuse into the host grammar (FUSION, spec §7).
        emit({ from: 'adapt', to: 'nativize', input: `generations=${generations}`, transition: 'fusion' });
        return { ok: true, finalGrammar: grammar, trajectory };
      },
    });
  }
}

