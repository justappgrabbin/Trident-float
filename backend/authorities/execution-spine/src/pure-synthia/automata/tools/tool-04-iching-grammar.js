// Pure Synthia Automata — tool 04: iching-grammar, hexagram pushdown automaton (cast→read-lines→transform→resolve)

import { Automaton } from '../automaton.js';
import { TRIGRAMS } from '../../state-space/constants.js';
import { operatorById } from '../../state-space/operators.js';
import { gateFromBits } from '../../state-space/addressing.js';

const trigramFor = (bits3) => {
  const key = bits3.join('');
  const found = TRIGRAMS.find((t) => t.bits.join('') === key);
  return found ? { id: found.id, name: found.name, element: found.element, bits: [...bits3] } : { id: null, bits: [...bits3] };
};

const binaryValueOf = (lines) => Number.parseInt([...lines].reverse().join(''), 2);

// Spec §4 named bit transforms (local fallbacks mirroring state-space operators.js exactly).
const LOCAL_TRANSFORMS = {
  mirror: (lines) => [...lines].reverse(), // o_reverse: Fu Xi reverse variation
  shadow: (lines) => lines.map((b) => 1 - b), // o_inverse: yin<->yang inversion
  rotation: (lines) => [...lines].reverse().map((b) => 1 - b), // o_converse: 180° wheel rotation (reverse+inverse)
  core: (lines) => [lines[1], lines[2], lines[3], lines[2], lines[3], lines[4]], // o_nuclear: lines 2-3-4 / 3-4-5
  becoming: (lines, changingLines = []) => { // o_change: xor moving-lines mask
    const out = [...lines];
    for (const line of changingLines) {
      const index = line - 1; // changing lines are 1-based
      if (index >= 0 && index < 6) out[index] = 1 - out[index];
    }
    return out;
  },
};

const OPERATOR_IDS = {
  mirror: 'o_reverse',
  shadow: 'o_inverse',
  rotation: 'o_converse',
  core: 'o_nuclear',
  becoming: 'o_change',
};

// Prefer the shared state-space operator when its transform yields a usable 6-bit
// pattern; fall back to the local spec-§4 definition otherwise (deterministic either way).
// Call shapes per operators.js: unary ops take the 6-bit array directly; o_change takes
// (bits, changingLineNumbers) as a positional pair.
function applyNamedTransform(name, lines, changingLines) {
  try {
    const op = operatorById(OPERATOR_IDS[name]);
    if (op && typeof op.transform === 'function') {
      const out = name === 'becoming'
        ? op.transform([[...lines], changingLines || []])
        : op.transform([...lines]);
      const arr = Array.isArray(out) ? out
        : (out && Array.isArray(out.bits) ? out.bits : null);
      if (arr && arr.length === 6 && arr.every((b) => b === 0 || b === 1)) return [...arr];
    }
  } catch { /* shared operator shape not yet compatible — local transform below */ }
  return LOCAL_TRANSFORMS[name](lines, changingLines);
}

const validLines = (lines) => Array.isArray(lines) && lines.length === 6 && lines.every((x) => x === 0 || x === 1);

export class IchingGrammarAutomaton extends Automaton {
  static registry = Object.freeze({
    id: 'iching-grammar',
    aliases: ['iching'],
    gate: 61,
    channels: ['24-61'],
    capabilities: ['cast', 'transform'],
    ports: Object.freeze({
      in: Object.freeze([Object.freeze({ id: 'input', type: 'json' })]),
      out: Object.freeze([Object.freeze({ id: 'output', type: 'json', guarantees: ['addressed'] })]),
    }),
    automatonForm: 'hexagram pushdown automaton',
    dimension: 'Being',
    description: "Klein's I Ching grammar: 6 binary lines -> lower/upper trigrams + binary value; named transforms mirror/shadow/rotation/core/becoming via the state-space operators.",
  });

  constructor() {
    const d = IchingGrammarAutomaton.registry;
    super({
      id: d.id,
      address: { gate: d.gate, line: 1, color: 1, tone: 1, base: 1 },
      states: [
        { id: 'cast', initial: true },
        { id: 'read-lines' },
        { id: 'transform' },
        { id: 'resolve', accepting: true },
      ],
      alphabet: ['yin', 'yang', 'trigram', 'hexagram', 'changing-line'],
      q0: 'cast',
      finals: ['resolve'],
      ports: d.ports,
      capabilities: d.capabilities,
      dimension: d.dimension,
      automatonForm: d.automatonForm,
      state: null,
      implementation: (input = {}, { emit }) => {
        emit({ from: 'cast', to: 'read-lines', input: 'lines', transition: 'flow' });
        if (!validLines(input.lines)) {
          emit({ from: 'read-lines', to: 'resolve', input: null, transition: 'weakening' });
          return { ok: false, reason: 'SIX_BINARY_LINES_REQUIRED' };
        }
        const lines = [...input.lines];
        const base = {
          ok: true,
          lines,
          // King Wen gate number of the cast hexagram (state-space table:
          // lines are line-1-first bits = Fu Xi decimal, mapped via
          // gateFromBits). A hexagram grammar names its hexagrams; this is
          // what lets a downstream tool SPEAK the gate (H10 experiment).
          gate: gateFromBits(lines),
          lower: trigramFor(lines.slice(0, 3)),
          upper: trigramFor(lines.slice(3, 6)),
          binaryValue: binaryValueOf(lines),
        };
        const name = input.transform;
        if (!name) {
          emit({ from: 'read-lines', to: 'resolve', input: null, transition: 'flow' });
          return base;
        }
        if (!LOCAL_TRANSFORMS[name]) {
          emit({ from: 'read-lines', to: 'resolve', input: null, transition: 'weakening' });
          return { ok: false, reason: 'UNKNOWN_TRANSFORM', transform: name };
        }
        emit({ from: 'read-lines', to: 'transform', input: name, transition: name });
        const transformed = applyNamedTransform(name, lines, input.changingLines || []);
        emit({ from: 'transform', to: 'resolve', input: null, transition: 'becoming' });
        return {
          ...base,
          transform: name,
          transformed: {
            lines: transformed,
            gate: gateFromBits(transformed),
            lower: trigramFor(transformed.slice(0, 3)),
            upper: trigramFor(transformed.slice(3, 6)),
            binaryValue: binaryValueOf(transformed),
          },
        };
      },
    });
  }
}

