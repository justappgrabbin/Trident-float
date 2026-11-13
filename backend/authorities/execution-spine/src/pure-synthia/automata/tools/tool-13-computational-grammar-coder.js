// Pure Synthia Automata — tool-13: computational-grammar-coder (compiler PDA: parse→lower→emit→verify)
// Fidelity port of src/UPGRADES/vendor/ato-core/src/computational-grammar-coder.mjs
// (Klein & Simmons 1963 per-word syntactic code tests + context-frame disambiguation).
import { Automaton } from '../automaton.js';

export class GrammarCoderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'GrammarCoderError';
    this.code = code;
    this.details = details;
  }
}

const ALL = Object.freeze(['ADJ', 'ADV', 'NOUN', 'VERB']);

const FUNCTION_WORDS = Object.freeze({
  a: ['ART'], an: ['ART'], the: ['ART'],
  and: ['CONJC'], or: ['CONJC'], nor: ['CONJC'], but: ['CONJR'],
  is: ['VERB_IS'], was: ['VERB_IS'], be: ['VERB_IS'], are: ['VERB_IS'], am: ['VERB_IS'],
  to: ['PREP_1'], of: ['PREP_OF'],
  i: ['PN_S'], we: ['PN_S'], he: ['PN_S'], she: ['PN_S'], they: ['PN_S'],
  me: ['PN_O'], us: ['PN_O'], him: ['PN_O'], them: ['PN_O'],
  my: ['PN_POS'], our: ['PN_POS'], his: ['PN_POS'], their: ['PN_POS'],
  this: ['PN_DEM'], those: ['PN_DEM'], that: ['PN_REL'],
  who: ['PN_RCN'], which: ['PN_RCN'],
  where: ['PN_IND'], anywhere: ['PN_IND'], somewhere: ['PN_IND'],
});

const SUFFIX_RULES = Object.freeze([
  { suffix: 'ing', codes: ['/ING/'] },
  { suffix: 'ed', codes: ['/ED/'] },
  { suffix: 'ity', codes: ['NOUN'] },
  { suffix: 'ness', codes: ['NOUN'] },
  { suffix: 'ment', codes: ['NOUN'] },
  { suffix: 'tion', codes: ['NOUN'] },
  { suffix: 'ous', codes: ['ADJ'] },
  { suffix: 'ful', codes: ['ADJ'] },
  { suffix: 'ly', codes: ['ADV'] },
  { suffix: 'ize', codes: ['VERB'] },
  { suffix: 'ise', codes: ['VERB'] },
  { suffix: 's', codes: ['NOUN', 'VERB'] },
]);

const intersect = (sets) => sets.reduce((a, b) => a.filter((x) => b.includes(x)));

export class ComputationalGrammarCoder {
  constructor({ dictionary = {}, contextFrames = [] } = {}) {
    this.dictionary = new Map(
      Object.entries({ ...FUNCTION_WORDS, ...dictionary }).map(([k, v]) => [k.toLowerCase(), Object.freeze([...v])]),
    );
    this.contextFrames = contextFrames.map((frame) => Object.freeze([...frame]));
    this.stats = { sentencesCoded: 0, wordsCoded: 0 };
  }

  candidates(word, { sentenceInitial = false } = {}) {
    const raw = String(word);
    const lower = raw.toLowerCase();
    const tests = [];
    if (/^[.,;:!?]$/.test(raw)) tests.push([raw === '.' ? '.TYPE' : ',TYPE']);
    if (/^\d+$/.test(raw)) tests.push(['ADJ']);
    if (!sentenceInitial && /^[A-Z]/.test(raw)) tests.push(['NOUN', 'ADJ']);
    const dictionary = this.dictionary.get(lower);
    if (dictionary) tests.push([...dictionary]);
    const suffix = SUFFIX_RULES.find((rule) => lower.endsWith(rule.suffix));
    if (suffix) tests.push([...suffix.codes]);
    if (!tests.length) tests.push([...ALL]);
    const common = intersect(tests);
    const codes = common.length ? common : [...new Set(tests.flat())];
    return Object.freeze({
      word: raw,
      tests: Object.freeze(tests.map((x) => Object.freeze(x))),
      codes: Object.freeze(codes),
      ambiguous: codes.length > 1,
    });
  }

  code(sentence) {
    const words = String(sentence).match(/[A-Za-z0-9'-]+|[.,;:!?]/g) || [];
    // Mutable working copies: context-frame disambiguation narrows codes in place.
    const items = words.map((word, index) => {
      const c = this.candidates(word, { sentenceInitial: index === 0 });
      return { word: c.word, tests: c.tests, codes: [...c.codes], ambiguous: c.ambiguous };
    });
    this.#applyFrames(items);
    this.stats.sentencesCoded += 1;
    this.stats.wordsCoded += items.length;
    return Object.freeze({
      sentence: String(sentence),
      words: Object.freeze(items.map((item) => Object.freeze({
        word: item.word,
        tests: item.tests,
        codes: Object.freeze([...item.codes]),
        ambiguous: item.codes.length > 1,
      }))),
      ambiguous: Object.freeze(items.filter((item) => item.codes.length > 1).map((item) => item.word)),
    });
  }

  // Context-frame disambiguation: unambiguous pairs bracketing 1–3 ambiguous words
  // constrain the middle codes via registered frames.
  #applyFrames(items) {
    for (let left = 0; left < items.length; left++) {
      if (items[left].codes.length !== 1) continue;
      for (let right = left + 1; right < items.length; right++) {
        if (items[right].codes.length !== 1) continue;
        const middle = items.slice(left + 1, right);
        if (!middle.length || middle.length > 3 || middle.every((x) => x.codes.length === 1)) continue;
        const frames = this.contextFrames.filter((frame) => (
          frame.length === items.length
            ? true
            : frame.length === middle.length + 2
              && frame[0] === items[left].codes[0]
              && frame.at(-1) === items[right].codes[0]
        ));
        for (let i = 0; i < middle.length; i++) {
          const allowed = [...new Set(frames.flatMap((frame) => frame[i + 1] || []))];
          if (allowed.length) {
            const reduced = middle[i].codes.filter((code) => allowed.includes(code));
            if (reduced.length) middle[i].codes = reduced;
          }
        }
        break;
      }
    }
  }
}

const STATES = [
  { id: 'parse', name: 'Parse', initial: true },
  { id: 'lower', name: 'Lower' },
  { id: 'emit', name: 'Emit' },
  { id: 'verify', name: 'Verify', accepting: true },
];

// Named transitions per STATE_SPACE_SPEC §7.
const DELTA_TABLE = {
  'parse|code': { to: 'lower', transition: 'ignition' },
  'lower|code': { to: 'emit', transition: 'flow' },
  'emit|code': { to: 'verify', transition: 'chain' },
  'verify|code': { to: 'verify', transition: 'core' },
};

const CODE_PATH = [['parse', 'code'], ['lower', 'code'], ['emit', 'code'], ['verify', 'code']];

const normalizeInput = (input) => {
  if (typeof input === 'string') return { text: input };
  if (input && Array.isArray(input.args) && input.args.length && input.text === undefined) {
    return { ...input, text: input.args.join(' ') };
  }
  return input || {};
};

export class ComputationalGrammarCoderAutomaton extends Automaton {
  static descriptor = {
    id: 'computational-grammar-coder',
    aliases: ['coder', 'grammar-coder', 'klein-simmons'],
    gate: 62,
    channels: ['17-62'],
    capabilities: ['code', 'disambiguate', 'dictionary'],
    ports: {
      in: [{ id: 'text', type: 'text', schemaVersion: '1' }],
      out: [{ id: 'codes', type: 'grammar-codes', schemaVersion: '1' }],
    },
    automatonForm: 'compiler PDA',
    dimension: 'Evolution',
    description: 'Klein & Simmons 1963 computational grammar coder: per-word tests (punctuation, digits, capitalization, function-word dictionary, suffix rules), code intersection with union fallback, and context-frame disambiguation of 1–3 bracketed ambiguous words.',
  };

  constructor(options = {}) {
    const memory = options.state || new ComputationalGrammarCoder(options.coder || {});
    let dispatch;
    super({
      id: 'computational-grammar-coder',
      address: { mode: 'macro', gate: 62, line: 1, color: 1, tone: 1, base: 1, planetaryDimension: 'Evolution' },
      states: STATES,
      alphabet: ['code'],
      delta: (state, symbol) => DELTA_TABLE[`${state}|${symbol}`] || { to: state, transition: 'flow' },
      q0: 'parse',
      finals: ['verify'],
      ports: ComputationalGrammarCoderAutomaton.descriptor.ports,
      capabilities: ComputationalGrammarCoderAutomaton.descriptor.capabilities,
      dimension: 'Evolution',
      implementation: (input, context) => dispatch(input, context),
    });
    this.ownedState = memory;
    dispatch = (input, context) => this.#dispatch(input, context);
  }

  #dispatch(rawInput, context = {}) {
    const input = normalizeInput(rawInput);
    const text = input.text !== undefined ? input.text : input.sentence;
    if (text === undefined || text === null || String(text).trim() === '') {
      throw new GrammarCoderError('TEXT_REQUIRED', 'Coding requires a sentence (input.text)');
    }
    for (const [from, symbol] of CODE_PATH) this.step(from, symbol, { tool: this.id });
    // Per-call frame extension (deterministic; persistent dictionary stays untouched).
    if (Array.isArray(input.contextFrames) && input.contextFrames.length) {
      const coder = new ComputationalGrammarCoder({ contextFrames: input.contextFrames });
      coder.stats = this.ownedState.stats;
      const coded = coder.code(text);
      this.ownedState.contextFrames.push(...input.contextFrames.map((f) => Object.freeze([...f])));
      return coded;
    }
    return this.ownedState.code(text);
  }
}

export default ComputationalGrammarCoderAutomaton;

