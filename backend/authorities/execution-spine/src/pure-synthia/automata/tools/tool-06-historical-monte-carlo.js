// Pure Synthia Automata — tool 06: historical-monte-carlo, sampling automaton (hypothesize→sample→tally→conclude)

import { Automaton } from '../automaton.js';
import { mulberry32 } from '../../state-space/constants.js';

const normalize = (weights) => {
  const total = Object.values(weights).reduce((sum, n) => sum + n, 0) || 1;
  return Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v / total]));
};

export class HistoricalMonteCarloAutomaton extends Automaton {
  static registry = Object.freeze({
    id: 'historical-monte-carlo',
    aliases: ['monte-carlo'],
    gate: 32,
    channels: ['32-54'],
    capabilities: ['sample-histories'],
    ports: Object.freeze({
      in: Object.freeze([Object.freeze({ id: 'input', type: 'json' })]),
      out: Object.freeze([Object.freeze({ id: 'output', type: 'json', guarantees: ['addressed'] })]),
    }),
    automatonForm: 'sampling automaton',
    dimension: 'Evolution',
    description: "Klein's historical Monte Carlo: seeded multiplicative weight drift w *= max(0, 1+(rng()-0.5)*2*mutationScale), normalized per generation; reports dominant variant.",
  });

  constructor() {
    const d = HistoricalMonteCarloAutomaton.registry;
    super({
      id: d.id,
      address: { gate: d.gate, line: 1, color: 1, tone: 1, base: 1 },
      states: [
        { id: 'hypothesize', initial: true },
        { id: 'sample' },
        { id: 'tally' },
        { id: 'conclude', accepting: true },
      ],
      alphabet: ['variant', 'weight', 'generation', 'sample'],
      q0: 'hypothesize',
      finals: ['conclude'],
      ports: d.ports,
      capabilities: d.capabilities,
      dimension: d.dimension,
      automatonForm: d.automatonForm,
      state: null,
      implementation: (input = {}, { emit }) => {
        const variants = input.variants || {};
        const seed = input.seed ?? 7;
        const scale = input.mutationScale ?? 0.1;
        const generations = input.generations ?? 20;
        const rng = mulberry32(seed);
        emit({ from: 'hypothesize', to: 'sample', input: `variants=${Object.keys(variants).length}`, transition: 'flow' });
        let weights = { ...variants };
        const trajectory = [{ generation: 0, weights: normalize(weights) }];
        for (let generation = 1; generation <= generations; generation++) {
          weights = Object.fromEntries(Object.entries(weights)
            .map(([name, value]) => [name, Math.max(0, value * (1 + (rng() - 0.5) * 2 * scale))]));
          trajectory.push({ generation, weights: normalize(weights) });
        }
        // The sampling loop re-enters the sample state (RECURSION, spec §7).
        emit({ from: 'sample', to: 'tally', input: `generations=${generations}`, transition: 'recursion' });
        const finalWeights = normalize(weights);
        const dominantVariant = Object.entries(finalWeights)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
        emit({ from: 'tally', to: 'conclude', input: dominantVariant, transition: 'flow' });
        return { ok: true, finalWeights, dominantVariant, trajectory };
      },
    });
  }
}

