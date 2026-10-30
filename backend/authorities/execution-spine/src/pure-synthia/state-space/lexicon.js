// Pure Synthia Automata — seed lexicon for the tool-call grammar (spec §9-§10)

// The exact 16 registered tool ids, in registry order (spec §11)
export const TOOL_IDS = Object.freeze([
  'autoling-lite',
  'diseminer-lite',
  'klein-analogy',
  'iching-grammar',
  'language-contact',
  'historical-monte-carlo',
  'autonovel',
  'messy',
  'success',
  'conversation',
  'browser-form',
  'research-browser',
  'computational-grammar-coder',
  'autoling',
  'diseminer',
  'morph-mir',
]);

export const TOOL_ALIASES = Object.freeze({
  'auto-ling': 'autoling',
  'iching': 'iching-grammar',
  'monte-carlo': 'historical-monte-carlo',
  'coder': 'computational-grammar-coder',
  'morph': 'morph-mir',
  'novel': 'autonovel',
  'research': 'research-browser',
  'form': 'browser-form',
  'analogy': 'klein-analogy',
  'contact': 'language-contact',
  'grammar-coder': 'computational-grammar-coder',
});

export const KEYWORDS = Object.freeze({
  chain: ['then'],
  addressMarker: ['at'],
  flagPrefix: '--',
});

// Seed words for the parser's POS tagging (spec §9).
// Closed classes DET/PREP/CONJ/PRON/AUX are exhaustive lookups; open classes are common seeds.
export const SEED_WORDS = Object.freeze([
  // determiners (7)
  { word:'the', pos:'DET' }, { word:'a', pos:'DET' }, { word:'an', pos:'DET' },
  { word:'this', pos:'DET' }, { word:'that', pos:'DET' },
  { word:'these', pos:'DET' }, { word:'those', pos:'DET' },
  // prepositions (10)
  { word:'in', pos:'PREP' }, { word:'on', pos:'PREP' }, { word:'at', pos:'PREP' },
  { word:'of', pos:'PREP' }, { word:'to', pos:'PREP' }, { word:'for', pos:'PREP' },
  { word:'with', pos:'PREP' }, { word:'from', pos:'PREP' }, { word:'by', pos:'PREP' },
  { word:'about', pos:'PREP' },
  // conjunctions (4)
  { word:'and', pos:'CONJ' }, { word:'or', pos:'CONJ' }, { word:'but', pos:'CONJ' }, { word:'if', pos:'CONJ' },
  // pronouns (7)
  { word:'i', pos:'PRON' }, { word:'you', pos:'PRON' }, { word:'he', pos:'PRON' },
  { word:'she', pos:'PRON' }, { word:'it', pos:'PRON' }, { word:'we', pos:'PRON' }, { word:'they', pos:'PRON' },
  // auxiliaries / copulas / modals (19)
  { word:'is', pos:'AUX' }, { word:'are', pos:'AUX' }, { word:'was', pos:'AUX' }, { word:'were', pos:'AUX' },
  { word:'be', pos:'AUX' }, { word:'been', pos:'AUX' }, { word:'have', pos:'AUX' }, { word:'has', pos:'AUX' },
  { word:'do', pos:'AUX' }, { word:'does', pos:'AUX' }, { word:'will', pos:'AUX' }, { word:'would', pos:'AUX' },
  { word:'can', pos:'AUX' }, { word:'could', pos:'AUX' }, { word:'shall', pos:'AUX' }, { word:'should', pos:'AUX' },
  { word:'may', pos:'AUX' }, { word:'might', pos:'AUX' }, { word:'must', pos:'AUX' },
  // open-class seeds — state-space vocabulary (20)
  { word:'gate', pos:'NOUN' }, { word:'state', pos:'NOUN' }, { word:'tool', pos:'NOUN' },
  { word:'mesh', pos:'NOUN' }, { word:'automaton', pos:'NOUN' }, { word:'rule', pos:'NOUN' },
  { word:'word', pos:'NOUN' }, { word:'letter', pos:'NOUN' }, { word:'sound', pos:'NOUN' },
  { word:'color', pos:'NOUN' },
  { word:'make', pos:'VERB' }, { word:'run', pos:'VERB' }, { word:'parse', pos:'VERB' },
  { word:'call', pos:'VERB' }, { word:'weave', pos:'VERB' }, { word:'bind', pos:'VERB' },
  { word:'active', pos:'ADJ' }, { word:'dormant', pos:'ADJ' }, { word:'bright', pos:'ADJ' },
  { word:'now', pos:'ADV' },
]);

const CLOSED_CLASS = new Map(SEED_WORDS.map(({ word, pos }) => [word, pos]));

// POS guess: closed-class lookup first, then suffix heuristics, else NOUN.
export function posGuess(word) {
  const w = String(word).toLowerCase();
  const closed = CLOSED_CLASS.get(w);
  if (closed) return closed;
  if (/(ing|ed)$/.test(w)) return 'VERB';
  if (/ly$/.test(w)) return 'ADV';
  if (/(tion|ness|ment|ity)$/.test(w)) return 'NOUN';
  if (/(able|ible|ful|ous)$/.test(w)) return 'ADJ';
  return 'NOUN';
}

