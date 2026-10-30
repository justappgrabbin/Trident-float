// Pure Synthia Automata — I Ching fragment algebra (FRAGMENT_ALGEBRA_SPEC §1/§4/§5; tables T1-T8, T17, T18, T19)

import { gateBits, gateFromBits, hamming, KING_WEN_TO_FUXI_DECIMAL } from './addressing.js';

const deepFreeze = (x) => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    for (const v of Object.values(x)) deepFreeze(v);
    Object.freeze(x);
  }
  return x;
};

const requireBits = (bits, who) => {
  if (!Array.isArray(bits) || bits.length !== 6 || bits.some((b) => b !== 0 && b !== 1)) {
    throw new RangeError(`${who} expects a 6-bit array (line 1 = bottom = bit 0, constants.js convention)`);
  }
  return bits;
};

/* ---------------------------------------------------------------- T2 — lines */

export const LINES = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md T2 (Hatcher vol.1 p.43; Adler pp.30-31; Rutt p.156)',
  generativeRule: 'casting sums of 2s and 3s give 6/7/8/9; pure sums (6,9) move, mixed sums (7,8) rest',
  byValue: {
    6: { value: 6, name: 'old yin (moving yin)', glyph: '- - x', parity: 'yin', stability: 'moving', changesTo: 'yang', bit: 0, moving: true, composition: '2+2+2 (pure yin)', mark: 'X (jiao, crossed)' },
    7: { value: 7, name: 'young yang (stable)', glyph: '---', parity: 'yang', stability: 'stable', changesTo: null, bit: 1, moving: false, composition: '2+2+3 (mixed)', mark: 'none (dan, single)' },
    8: { value: 8, name: 'young yin (stable)', glyph: '- -', parity: 'yin', stability: 'stable', changesTo: null, bit: 0, moving: false, composition: '2+3+3 (mixed)', mark: 'none (zhe, broken)' },
    9: { value: 9, name: 'old yang (moving yang)', glyph: '--- o', parity: 'yang', stability: 'moving', changesTo: 'yin', bit: 1, moving: true, composition: '3+3+3 (pure yang)', mark: 'O (chong, double)' },
  },
});

/* ------------------------------------------------------- T3 — si xiang (bigrams) */

export const SI_XIANG = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md T3 (Hatcher vol.1 pp.455-461; Wen Table 5-4; Adler Table 1.4 p.25); dimension via H-F6',
  note: 'Being is NOT represented among the four emblems: it is the pivot/center (earth = balance) from which the four generate - structural feature, not a gap',
  rows: [
    { bits: [0, 0], emblem: 'tai yin (greater yin)', castingNumber: 6, season: 'winter', direction: 'north',
      timeOfDay: 'night (midnight-dawn)', element: 'Water', materialState: 'liquid',
      sagelyWay: 'oracles & prediction', omen: 'pitfalls (xiong)', siDe: 'zhen (persistence/resolve)',
      hetuNumbers: [6, 1], primaryDimension: 'Space', dimensionRule: 'H-F6: emblem -> element (Water) -> dimension (H-F3)' },
    { bits: [1, 0], emblem: 'shao yang (lesser yang)', castingNumber: 7, season: 'spring', direction: 'east',
      timeOfDay: 'morning (dawn-noon)', element: 'Wood', materialState: 'solid',
      sagelyWay: 'preparation & imagination', omen: 'regret (hui)', siDe: 'yuan (origination)',
      hetuNumbers: [8, 3], primaryDimension: 'Movement', dimensionRule: 'H-F6: emblem -> element (Wood) -> dimension (H-F3)' },
    { bits: [0, 1], emblem: 'shao yin (lesser yin)', castingNumber: 8, season: 'autumn', direction: 'west',
      timeOfDay: 'evening (sunset-midnight)', element: 'Metal', materialState: 'gas',
      sagelyWay: 'speech & message', omen: 'embarrassment (lin)', siDe: 'li (advantage/harvest)',
      hetuNumbers: [9, 4], primaryDimension: 'Design', dimensionRule: 'H-F6: emblem -> element (Metal) -> dimension (H-F3)' },
    { bits: [1, 1], emblem: 'tai yang (greater yang)', castingNumber: 9, season: 'summer', direction: 'south',
      timeOfDay: 'afternoon (noon-sunset)', element: 'Fire', materialState: 'plasma',
      sagelyWay: 'movement & change', omen: 'promise (ji)', siDe: 'heng (fulfillment/success)',
      hetuNumbers: [7, 2], primaryDimension: 'Evolution', dimensionRule: 'H-F6: emblem -> element (Fire) -> dimension (H-F3)' },
  ],
});

/* ------------------------------------------- T4 — trigram master attribute matrix */

// Ordered by value_code (constants.js convention: bottom line = LSB). `dimension` is
// parsed from the spec strings: primary = class rule (T15), secondary via H-F3.
export const TRIGRAM_MATRIX = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md T4 (Hatcher / Govinda / Moore / Adler / Wen / Rutt; oldest-majority wins, Conflicts §8)',
  convention: 'bits bottom-to-top, yang=1; xiantian = Earlier Heaven (Fu Xi), houtian = Later Heaven (King Wen compass)',
  trigrams: [
    { id: 'kun', zh: '坤', pinyin: 'Kun1', names: { hatcher: 'Accepting', wilhelm: 'The Receptive', adlerVirtue: 'compliant' },
      bits: [0, 0, 0], valueCode: 0, valueHatcher: 0, fuxiOrdinal: 8, luoshu: 2,
      natureImage: 'Earth', quality: 'yielding, compliant, receptive', family: 'mother',
      direction: { xiantian: 'N', houtian: 'SW' }, wuxing: 'Earth', seasonHoutian: 'late summer (6th lunar month)',
      hour: { govinda: '15h', wen: '13-17' },
      color: { shuogua: 'black (black earth)', wuxingFill: 'yellow (Earth)', reifler: 'black (agrees)' },
      animal: 'ox/cattle', body: 'belly/abdomen',
      soundWen: 'silence; night sounds, crickets', toneWuxing: 'gong 宮 (Earth)', planetWen: 'Saturn',
      dimension: { primary: 'Being', secondary: 'Being', secondaryElement: 'Earth', rule: 'primary: class rule (T15); secondary: H-F3 (Earth)' },
      sources: ['Hatcher vol.1 pp.462-464', 'Govinda pp.45-47', 'Adler pp.26,52-56', 'Moore pp.17-18,200', 'Wen ~pp.222-225'] },
    { id: 'zhen', zh: '震', pinyin: 'Zhen4', names: { hatcher: 'Arousal', wilhelm: 'The Arousing', adlerVirtue: 'active' },
      bits: [1, 0, 0], valueCode: 1, valueHatcher: 4, fuxiOrdinal: 4, luoshu: 3,
      natureImage: 'Thunder', quality: 'moving, arousing, impetus', family: 'eldest son',
      direction: { xiantian: 'NE', houtian: 'E' }, wuxing: 'Wood', seasonHoutian: 'spring (2nd lunar month)',
      hour: { govinda: '6h', wen: '5-7' },
      color: { shuogua: 'blue-black + golden yellow (xuan huang)', wuxingFill: 'green/blue-green (Wood)', reifler: 'orange (conflict C1)' },
      animal: 'dragon', animalNote: 'Hatcher emends sg.8 to horse - not adopted, Conflicts C2', body: 'foot',
      soundWen: 'clamorous, boisterous', toneWuxing: 'jue 角 (Wood)', planetWen: 'Jupiter',
      dimension: { primary: 'Being', secondary: 'Movement', secondaryElement: 'Wood', rule: 'primary: class rule (T15); secondary: H-F3 (Wood)' },
      sources: ['Hatcher vol.1 pp.472-474', 'Govinda pp.45-47', 'Adler pp.26,52-56', 'Moore pp.17-18,200', 'Wen ~pp.196-200'] },
    { id: 'kan', zh: '坎', pinyin: 'Kan3', names: { hatcher: 'Exposure', wilhelm: 'The Abysmal', adlerVirtue: 'sinking (danger)' },
      bits: [0, 1, 0], valueCode: 2, valueHatcher: 2, fuxiOrdinal: 6, luoshu: 1,
      natureImage: 'Water (moving water, abyss)', quality: 'danger, sinking', family: 'middle son',
      direction: { xiantian: 'W', houtian: 'N' }, wuxing: 'Water', seasonHoutian: 'mid-winter (11th lunar month, inferred - Moore p.64 omits)',
      hour: { govinda: '24h', wen: '23-1' },
      color: { shuogua: 'red (blood, red)', wuxingFill: 'black/blue-black (Water)', reifler: 'red (agrees)' },
      animal: 'pig', body: 'ear',
      soundWen: 'mantras, minor keys, lamentations, nocturnes', toneWuxing: 'yu 羽 (Water)', planetWen: 'Mercury',
      dimension: { primary: 'Being', secondary: 'Space', secondaryElement: 'Water', rule: 'primary: class rule (T15); secondary: H-F3 (Water)' },
      sources: ['Hatcher vol.1 pp.468-470', 'Govinda pp.45-47', 'Adler pp.26,52-56', 'Moore pp.17-18,200', 'Wen ~pp.207-212'] },
    { id: 'dui', zh: '兌', pinyin: 'Dui4', names: { hatcher: 'Satisfaction', wilhelm: 'The Joyous', adlerVirtue: 'pleasing' },
      bits: [1, 1, 0], valueCode: 3, valueHatcher: 6, fuxiOrdinal: 2, luoshu: 7,
      natureImage: 'Lake/Marsh (still water, mist)', quality: 'pleasing, joy, satisfaction', family: 'youngest daughter',
      direction: { xiantian: 'SE', houtian: 'W' }, wuxing: 'Metal', seasonHoutian: 'mid-autumn (8th lunar month)',
      hour: { govinda: '18h', wen: '17-19' },
      color: { shuogua: 'not attested', wuxingFill: 'white (Metal) - H-F5', reifler: 'blue (conflict C1)' },
      animal: 'sheep/goat', body: 'mouth',
      soundWen: 'chimes, bells, clanging', toneWuxing: 'shang 商 (Metal)', planetWen: 'Venus',
      dimension: { primary: 'Being', secondary: 'Design', secondaryElement: 'Metal', rule: 'primary: class rule (T15); secondary: H-F3 (Metal)' },
      sources: ['Hatcher vol.1 pp.477-480', 'Govinda pp.45-47', 'Adler pp.26,52-56', 'Moore pp.17-18,200', 'Wen ~pp.183-189'] },
    { id: 'gen', zh: '艮', pinyin: 'Gen4', names: { hatcher: 'Stillness', wilhelm: 'Keeping Still', adlerVirtue: 'stopping (stable)' },
      bits: [0, 0, 1], valueCode: 4, valueHatcher: 1, fuxiOrdinal: 7, luoshu: 8,
      natureImage: 'Mountain', quality: 'stopping, stillness, stable', family: 'youngest son',
      direction: { xiantian: 'NW', houtian: 'NE' }, wuxing: 'Earth', seasonHoutian: 'late winter/early spring (12th lunar month)',
      hour: { govinda: '3h', wen: '1-5' },
      color: { shuogua: 'not attested', wuxingFill: 'yellow (Earth) - H-F5', reifler: 'green (conflict C1)' },
      animal: 'dog', body: 'hand',
      soundWen: 'dark rounded timbres, precise pitches', toneWuxing: 'gong 宮 (Earth)', planetWen: 'Saturn',
      dimension: { primary: 'Being', secondary: 'Being', secondaryElement: 'Earth', rule: 'primary: class rule (T15); secondary: H-F3 (Earth)' },
      sources: ['Hatcher vol.1 pp.465-467', 'Govinda pp.45-47', 'Adler pp.26,52-56', 'Moore pp.17-18,200', 'Wen ~pp.213-218'] },
    { id: 'li', zh: '離', pinyin: 'Li2', names: { hatcher: 'Arising', wilhelm: 'The Clinging', adlerVirtue: 'clinging (bright)' },
      bits: [1, 0, 1], valueCode: 5, valueHatcher: 5, fuxiOrdinal: 3, luoshu: 9,
      natureImage: 'Fire (brightness, lightning, sun)', quality: 'clinging, bright, clear', family: 'middle daughter',
      direction: { xiantian: 'E', houtian: 'S' }, wuxing: 'Fire', seasonHoutian: 'summer (5th lunar month)',
      hour: { govinda: '12h', wen: '11-13' },
      color: { shuogua: 'not attested', wuxingFill: 'red (Fire) - H-F5', reifler: 'yellow (conflict C1)' },
      animal: 'pheasant', body: 'eye',
      soundWen: 'fast tempo, higher-pitched', toneWuxing: 'zhi 徵 (Fire)', planetWen: 'Mars',
      dimension: { primary: 'Being', secondary: 'Evolution', secondaryElement: 'Fire', rule: 'primary: class rule (T15); secondary: H-F3 (Fire)' },
      sources: ['Hatcher vol.1 pp.474-477', 'Govinda pp.45-47', 'Adler pp.26,52-56', 'Moore pp.17-18,200', 'Wen ~pp.190-195'] },
    { id: 'xun', zh: '巽', pinyin: 'Xun4', names: { hatcher: 'Adaptation', wilhelm: 'The Gentle', adlerVirtue: 'entering' },
      bits: [0, 1, 1], valueCode: 6, valueHatcher: 3, fuxiOrdinal: 5, luoshu: 4,
      natureImage: 'Wind/Wood', quality: 'penetrating, entering', family: 'eldest daughter',
      direction: { xiantian: 'SW', houtian: 'SE' }, wuxing: 'Wood', seasonHoutian: 'late spring (4th lunar month)',
      hour: { govinda: '9h', wen: '7-11' },
      color: { shuogua: 'white', wuxingFill: 'green/blue-green (Wood)', reifler: 'white (agrees)' },
      animal: 'fowl/cock', body: 'thighs',
      soundWen: 'arias, chamber music, birdsong', toneWuxing: 'jue 角 (Wood)', planetWen: 'Jupiter',
      dimension: { primary: 'Being', secondary: 'Movement', secondaryElement: 'Wood', rule: 'primary: class rule (T15); secondary: H-F3 (Wood)' },
      sources: ['Hatcher vol.1 pp.470-472', 'Govinda pp.45-47', 'Adler pp.26,52-56', 'Moore pp.17-18,200', 'Wen ~pp.201-206'] },
    { id: 'qian', zh: '乾', pinyin: 'Qian2', names: { hatcher: 'Creating', wilhelm: 'The Creative', adlerVirtue: 'strong' },
      bits: [1, 1, 1], valueCode: 7, valueHatcher: 7, fuxiOrdinal: 1, luoshu: 6,
      natureImage: 'Heaven/Sky', quality: 'strong, active, creative', family: 'father',
      direction: { xiantian: 'S', houtian: 'NW' }, wuxing: 'Metal', seasonHoutian: 'late autumn (10th lunar month)',
      hour: { govinda: '21h', wen: '19-23' },
      color: { shuogua: 'deep red (da chi)', wuxingFill: 'white (Metal)', reifler: 'purple (conflict C1)' },
      animal: 'horse', animalNote: 'Hatcher emends sg.8 to dragon (horse<->dragon swap with Zhen) - not adopted, Conflicts C2', body: 'head',
      soundWen: 'steady slow drumbeat', toneWuxing: 'shang 商 (Metal)', planetWen: 'Venus',
      dimension: { primary: 'Being', secondary: 'Design', secondaryElement: 'Metal', rule: 'primary: class rule (T15); secondary: H-F3 (Metal)' },
      sources: ['Hatcher vol.1 pp.481-485', 'Govinda pp.45-47', 'Adler pp.26,52-56', 'Moore pp.17-18,200', 'Wen ~pp.172-177'] },
  ],
});

export const TRIGRAM_BY_ID = Object.freeze(
  Object.fromEntries(TRIGRAM_MATRIX.trigrams.map((t) => [t.id, t]))
);

/* ------------------------------------------- T5 — nuclear trigrams (hu ti / hu gua) */

// Lower nuclear trigram = lines 2,3,4; upper = lines 3,4,5. Line 1 = bottom = bit 0
// (constants.js convention, consistent with addressing.js gateBits).
export function nuclearTrigrams(bits) {
  const b = requireBits(bits, 'nuclearTrigrams');
  return { lower: [b[1], b[2], b[3]], upper: [b[2], b[3], b[4]] };
}

// hu gua: nuclear hexagram bits (lower nuclear below, upper nuclear above)
export function nuclearHexagramBits(bits) {
  const { lower, upper } = nuclearTrigrams(bits);
  return [...lower, ...upper];
}

// hu gua as King Wen gate number
export function nuclearHexagram(bits) {
  return gateFromBits(nuclearHexagramBits(bits));
}

// T5 closure: only 16 hexagrams can be nuclei; each is nucleus of exactly 4 others;
// gates 1 and 2 are their own nuclei. Key = nucleus gate, value = its 4 members.
// CORRECTIONS vs the spec's transcription (spec itself flags "transcription slightly
// uncertain in brief"): (1) T5 lists 19 under nucleus 27, but 19's computed nucleus is
// 24 (and it is already listed there); the missing fourth member of 27 is 29 —
// corrected to [29,59,60,61], verified against the computed operator. (2) T5's
// second-order nuclei "{1,2,24,43}" computes to {1,2,63,64} — the four classical
// fixed points of repeated nuclear extraction (Qian/Kun/Ji Ji/Wei Ji) — corrected.
export const NUCLEAR_CLOSURE = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md T5 (Hatcher vol.2 pp.18-19); two transcription errors corrected against the computed operator (see comment above)',
  nuclei: {
    2: [2, 23, 24, 27], 23: [8, 20, 3, 42], 39: [16, 35, 51, 21], 53: [45, 12, 17, 25],
    40: [15, 52, 36, 22], 64: [39, 53, 63, 37], 28: [62, 56, 55, 30], 44: [31, 33, 49, 13],
    24: [7, 4, 19, 41], 27: [29, 59, 60, 61], 63: [40, 64, 54, 38], 37: [47, 6, 58, 10],
    54: [46, 18, 11, 26], 38: [48, 57, 5, 9], 43: [32, 50, 34, 14], 1: [28, 44, 43, 1],
  },
  secondOrderNuclei: [1, 2, 63, 64],
  semantics: 'latent idea or matrix, a potential or tendency, like a seed within a fruit',
});

export const NUCLEUS_GATES = Object.freeze(
  Object.keys(NUCLEAR_CLOSURE.nuclei).map(Number).sort((a, b) => a - b)
);

export const isNucleus = (gate) => NUCLEUS_GATES.includes(gate);

/* ------------------------------------------------------- T6 — hexagram level */

export const HEXAGRAMS = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md T6 (Adler pp.3,9,40,81; Hatcher vol.2 pp.15-16,25-29; Moore pp.189-191)',
  count: 64,
  generativeRule: '2^6 six-line figures = 8x8 grid of (lower trigram x upper trigram) = xiantian ba gong; built bottom-to-top',
  lowerUpperSemantics: {
    lowerZhen: 'inner, subjective, the Who, coming-to (past arriving at presence)',
    upperHui: 'outer, objective, the How, going-through (present arriving at the new)',
  },
  specialSets: {
    chongGuaDoubled: [1, 2, 29, 30, 51, 52, 57, 58],
    selfInverse: [1, 2, 27, 28, 29, 30, 61, 62],
    pureHexagramsEightPalaceHeads: [1, 2, 29, 30, 51, 52, 57, 58],
    fullyDangCorrect: [63],
    fullyBuDang: [64],
  },
});

export const lowerTrigram = (bits) => requireBits(bits, 'lowerTrigram').slice(0, 3); // zhen, inner
export const upperTrigram = (bits) => requireBits(bits, 'upperTrigram').slice(3, 6); // hui, outer
export const isPureHexagram = (gate) => HEXAGRAMS.specialSets.pureHexagramsEightPalaceHeads.includes(gate);
export const isSelfInverse = (gate) => HEXAGRAMS.specialSets.selfInverse.includes(gate);

/* ------------------------------------------------------- T7 — pair structures */

// --- bit-level operators (all involutions) ---

// pang tong: all six lines flipped (existing o_inverse semantics)
export const complementBits = (bits) => requireBits(bits, 'complementBits').map((b) => 1 - b);

// qian gua: line order reversed, figure upside-down (existing o_reverse semantics)
export const reverseBits = (bits) => [...requireBits(bits, 'reverseBits')].reverse();

// jiao gua — NEW OPERATOR o_swap (spec P4c / Conflicts C4): upper<->lower trigram
// exchange, [b1..b6] -> [b4,b5,b6,b1,b2,b3]. NOT the antipode (o_converse =
// reverse+inverse); they coincide only for special gates.
export const swapTrigrams = (bits) => {
  const b = requireBits(bits, 'swapTrigrams');
  return [b[3], b[4], b[5], b[0], b[1], b[2]];
};

// --- gate-level partners (King Wen numbers) ---
export const complementOf = (gate) => gateFromBits(complementBits(gateBits(gate)));
export const reverseOf = (gate) => gateFromBits(reverseBits(gateBits(gate)));
export const swapOf = (gate) => gateFromBits(swapTrigrams(gateBits(gate)));

export const PAIR_STRUCTURES = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md T7 (Hatcher vol.2 pp.13-18)',
  kingWenPairs: {
    rule: 'received sequence: second of each pair = inversion of first, except self-invertible figures which pair by complement (R-H9)',
    pairSequence: [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32], [33, 34], [35, 36], [37, 38], [39, 40], [41, 42], [43, 44], [45, 46], [47, 48], [49, 50], [51, 52], [53, 54], [55, 56], [57, 58], [59, 60], [61, 62], [63, 64]],
    complementPairs: [[1, 2], [27, 28], [29, 30], [61, 62]],
    bothInverseAndComplement: [[11, 12], [17, 18], [53, 54], [63, 64]],
    inversionPairsCount: 28,
  },
  pangTongGua: {
    operator: 'o_inverse (all six lines flipped; xiantian binary complements sum to 63)', count: 32,
    pairs: [[2, 1], [23, 43], [8, 14], [20, 34], [16, 9], [35, 5], [45, 26], [12, 11], [15, 10], [52, 58], [39, 38], [53, 54], [62, 61], [56, 60], [31, 41], [33, 19], [7, 13], [4, 49], [29, 30], [59, 55], [40, 37], [64, 63], [47, 22], [6, 36], [46, 25], [18, 17], [48, 21], [57, 51], [32, 42], [50, 3], [28, 27], [44, 24]],
  },
  qianGua: {
    operator: 'o_reverse (line order reversed; figure upside-down)', count: '28 pairs + 8 self-inverse',
    pairs: [[23, 24], [8, 7], [20, 19], [16, 15], [35, 36], [45, 46], [12, 11], [52, 51], [39, 40], [53, 54], [56, 55], [31, 32], [33, 34], [4, 3], [59, 60], [64, 63], [47, 48], [6, 5], [18, 17], [57, 58], [50, 49], [44, 43], [42, 41], [21, 22], [25, 26], [37, 38], [13, 14], [10, 9]],
    selfInverse: [1, 2, 27, 28, 29, 30, 61, 62],
  },
  jiaoGua: {
    operator: 'o_swap (upper<->lower trigram exchange) - NEW, see Conflicts C4; distinct from o_converse (antipode)',
    count: '28 pairs + 8 self-swap (chong gua)',
    pairs: [[23, 15], [8, 7], [20, 46], [16, 24], [35, 36], [45, 19], [12, 11], [39, 4], [53, 18], [62, 27], [56, 22], [31, 41], [33, 26], [59, 48], [40, 3], [64, 63], [47, 60], [6, 5], [32, 42], [50, 37], [28, 61], [44, 9], [21, 55], [17, 54], [25, 34], [49, 38], [13, 14], [10, 43]],
    selfSwap: [1, 2, 29, 30, 51, 52, 57, 58],
    semantics: 'converse of subject and predicate: inner experience externalized / objective experience internalized (Hatcher vol.2 p.18)',
  },
  fanYao: {
    operator: 'shadow line: reciprocal zhi-gua relation - A.line-i changes to B and B.line-j changes to A',
    count: 50,
    examples: [
      [{ gate: 1, line: 6 }, { gate: 43, line: 6 }],
      [{ gate: 2, line: 3 }, { gate: 15, line: 3 }],
      [{ gate: 3, line: 3 }, { gate: 63, line: 3 }],
      [{ gate: 5, line: 3 }, { gate: 60, line: 3 }],
      [{ gate: 56, line: 6 }, { gate: 62, line: 6 }],
    ],
    note: 'full 50-pair list at Hatcher vol.2 p.13 (not fully transcribed in brief)',
  },
});

// King Wen received-sequence partner (T7 pair_sequence lookup).
const KW_PARTNER = new Map();
for (const [a, b] of PAIR_STRUCTURES.kingWenPairs.pairSequence) {
  KW_PARTNER.set(a, b);
  KW_PARTNER.set(b, a);
}
export function kingWenPartnerOf(gate) {
  const p = KW_PARTNER.get(gate);
  if (p === undefined) throw new RangeError(`kingWenPartnerOf: gate must be 1-64, got ${gate}`);
  return p;
}

/* ------------------------------------------------------- T8 — arrangements */

export const ARRANGEMENTS = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md T8 (Hatcher vol.2 pp.14-16,20; Adler pp.52,78,81-82,99-103; Moore pp.62-65,90-93,112-113,185-198)',
  xiantian: {
    name: 'Earlier Heaven / Fu Xi / Shao Yong binary', kind: 'a priori',
    rule: 'binary doubling 1->2->4->8->64; pairs of complements face each other (each pair totals 3 yang + 3 yin)',
    geometry: 'axial/polar, timeless; 8x8 ba gong grid is the master coordinate system',
    trigramPositions: { qian: 'S', dui: 'SE', li: 'E', zhen: 'NE', xun: 'SW', kan: 'W', gen: 'NW', kun: 'N' },
  },
  houtian: {
    name: 'Later Heaven / King Wen compass', kind: 'a posteriori',
    rule: 'clockwise circulation from Zhen in the East (Shuogua 5); cardinal = the four zheng, diagonal = the four men (gates)',
    geometry: 'peripheral/temporal; seasonal and daily cycle; 45 days per trigram = 360-day year',
    circulation: [
      { trigram: 'zhen', direction: 'E' }, { trigram: 'xun', direction: 'SE' },
      { trigram: 'li', direction: 'S' }, { trigram: 'kun', direction: 'SW' },
      { trigram: 'dui', direction: 'W' }, { trigram: 'qian', direction: 'NW' },
      { trigram: 'kan', direction: 'N' }, { trigram: 'gen', direction: 'NE' },
    ],
  },
  mawangdui: {
    name: 'Mawangdui familial order (168 BCE tomb)', kind: 'manuscript',
    rule: '8 groups of 8 by UPPER trigram in family order (male: Qian, Gen, Kan, Zhen; female: Kun, Dui, Li, Xun); lower trigram cycles; each group opens with its doubled trigram',
    upperOrder: ['qian', 'gen', 'kan', 'zhen', 'kun', 'dui', 'li', 'xun'],
    lowerCycle: ['qian', 'kun', 'gen', 'dui', 'kan', 'li', 'zhen', 'xun'],
  },
  eightPalaces: {
    rule: 'each pure hexagram heads a palace; 5 generations by bottom-up single-line flips, then roaming soul (flip line 4 of 5th gen) and returning soul (lower trigram returns) -> 8x8 = 64',
  },
  twelveSovereignGua: {
    rule: 'waxing/waning cycle, one per lunar month; yang grows bottom-up then yin returns',
    cycle: [24, 19, 11, 34, 43, 1, 44, 33, 12, 20, 23, 2],
  },
});

// xiantian binary index: King Wen gate -> Fu Xi decimal (0-63), the Earlier-Heaven
// binary coordinate (delegates to the verified bijection in addressing.js).
export const xiantianIndex = (gate) => KING_WEN_TO_FUXI_DECIMAL[gate];

/* ------------------------------------------- T17 — Zhu Xi 8-case evaluation */

export const ZHU_XI_EVALUATION = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md T17 (Adler pp.70-71; Hatcher vol.2 pp.33-34; Rutt p.100 & p.137)',
  inputs: 'cast = {benGua: gate, changingLines: [positions 1-6], zhiGua: gate}',
  cases: [
    { k: 0, layer: 'judgement', answer: 'Tuan (Judgement) of the original hexagram; inner trigram = zhen (question), outer = hui (prognostication)' },
    { k: 1, layer: 'line', answer: "the changing line's own statement (yaoci) of the original hexagram" },
    { k: 2, layer: 'lines-upper-rules', answer: 'both changing-line statements of the original hexagram; the UPPER one rules' },
    { k: 3, layer: 'judgement-both', answer: "Tuan of BOTH original and resulting hexagrams; original = zhen, resulting = hui; 'for the first ten hexagrams zhen rules; for the latter ten hui rules'" },
    { k: 4, layer: 'lines-resulting-lower-rules', answer: 'the two UNCHANGED line statements of the RESULTING hexagram; the LOWER one rules' },
    { k: 5, layer: 'line-resulting', answer: 'the one unchanged line statement of the RESULTING hexagram' },
    { k: 6, layer: 'yong-or-judgement-resulting', answer: "if Qian or Kun: the 'Using all' (yong) text; otherwise the Tuan of the RESULTING hexagram" },
    { k: 'special', layer: 'yong', answer: 'Qian all-nines and Kun all-sixes ALWAYS read their yong texts regardless of other rules' },
  ],
  positioning: "Zhu Xi = the complete procedural standard (Adler p.69); Hatcher's R-H10 situational overlay recorded, not part of the deterministic core",
});

// The deterministic decision table: given a cast, which text layer answers.
// changingLines: positions 1-6 (bottom=1). Returns {k, layer, lines, ruling, description}.
export function evaluateReading({ benGua = null, zhiGua = null, changingLines = [] } = {}) {
  const moving = [...new Set(changingLines)].filter((p) => Number.isInteger(p) && p >= 1 && p <= 6).sort((a, b) => a - b);
  const k = moving.length;
  const unchanged = [1, 2, 3, 4, 5, 6].filter((p) => !moving.includes(p));
  const base = { k, benGua, zhiGua };
  switch (k) {
    case 0:
      return { ...base, layer: 'judgement', lines: [], ruling: null, description: ZHU_XI_EVALUATION.cases[0].answer };
    case 1:
      return { ...base, layer: 'line', lines: moving, ruling: moving[0], description: ZHU_XI_EVALUATION.cases[1].answer };
    case 2:
      return { ...base, layer: 'lines-upper-rules', lines: moving, ruling: moving[1], description: ZHU_XI_EVALUATION.cases[2].answer };
    case 3:
      return { ...base, layer: 'judgement-both', lines: [], ruling: 'first-ten zhen / latter-ten hui (Adler p.70)', description: ZHU_XI_EVALUATION.cases[3].answer };
    case 4:
      return { ...base, layer: 'lines-resulting-lower-rules', lines: unchanged, ruling: unchanged[0], description: ZHU_XI_EVALUATION.cases[4].answer };
    case 5:
      return { ...base, layer: 'line-resulting', lines: unchanged, ruling: unchanged[0], description: ZHU_XI_EVALUATION.cases[5].answer };
    case 6: {
      const isYong = benGua === 1 || benGua === 2;
      return {
        ...base,
        layer: isYong ? 'yong' : 'judgement-resulting',
        lines: moving,
        ruling: null,
        description: isYong
          ? "Qian all-nines / Kun all-sixes: the 'Using all' (yong) text (Rutt p.137)"
          : ZHU_XI_EVALUATION.cases[6].answer,
      };
    }
    default:
      throw new RangeError(`evaluateReading: changingLines must have 0-6 distinct positions, got ${k}`);
  }
}

/* ------------------------------------------- T18 + T10 — output grammar & valuation */

export const FOUR_SLOT_STATEMENT = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md T18 (Rutt pp.123,131-4,205-6,221)',
  register: "paratactic ('grammar of telegrams'); only nai and ze mark sequence; no explicit subjects, tenses, moods",
  canonicalOrder: ['oracle', 'indication', 'prognostic', 'observation'],
  note: 'typed bag with a canonical order: any element may be missing; in line statements the order of prognostic and oracle is not fixed',
  slots: {
    oracle: { slot: 1, name: 'oracle (shici 繇辭)', function: 'omen-image: a snapshot of world-state (weather, animals, stars, events)', dimension: 'Being', secondary: 'Space', optional: true, example: "'A dragon appearing in the fields' (1.2)" },
    indication: { slot: 2, name: 'indication (gaoci 告辭)', function: 'directed action domain: fording, traveling, meeting, besieging', dimension: 'Movement', secondary: null, optional: true, example: "'Favourable for crossing the great river' (li she da chuan, 12x)" },
    prognostic: { slot: 3, name: 'prognostic (duanci 斷辭)', function: 'valuation of the state: ji / li / jiu / xiong (+ wujiu neutralizer)', dimension: 'Being.valence', secondary: null, optional: true, example: "'Auspicious' (ji, 147x)" },
    observation: { slot: 4, name: 'observation (yanci 驗辭)', function: 'temporal modulation: how the state unfolds or resolves', dimension: 'Evolution', secondary: null, optional: true, example: "'troubles disappear' (hui wang, 19x) / 'trouble in the end' (zhong lin)" },
  },
  openingFormulae: { yuanheng: 'supreme receipt: the offering is accepted (grand sacrifice)', lizhen: 'favourable augury: beneficial to divine' },
  lineCitationProtocol: "zhi nomenclature: 'A zhi B' = line of A whose change yields B; destination built into the name (Hatcher vol.2 pp.12-13; Conflicts C9)",
});

// T10: valuation folds into Being as Being.valence (no sixth dimension).
export const VALUATION = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md T10 (Rutt pp.133-4)',
  decision: 'valuation folds into Being as Being.valence; no sixth dimension',
  terms: {
    ji: { term: 'ji 吉', gloss: 'auspicious', frequency: 147, valence: '+', properties: 'never negated; yuanji (12x), zhongji (10x) qualifiers' },
    wujiu: { term: 'wujiu 無咎', gloss: 'no misfortune / no blame', frequency: '100 (93x negated)', valence: '0+', properties: 'effectively the second most favourable prediction; neutralized bad' },
    li: { term: 'li 危/厲', gloss: 'dangerous', frequency: 27, valence: '-(avoidable)', properties: 'threat that may be avoided with circumspection' },
    xiong: { term: 'xiong 凶', gloss: 'disastrous', frequency: 88, valence: '--', properties: 'worst prognostic; never negated' },
    ta: { term: 'ta 他', gloss: 'unexpected calamity', frequency: 3, valence: '-', properties: 'rare; not in the major four' },
  },
  // NOT valence: temporal modulators -> observation slot -> Evolution (Rutt pp.133-4)
  observationTerms: {
    hui: { term: 'hui 悔', gloss: 'trouble (objective)', frequency: 34, slot: 'observation', dimension: 'Evolution' },
    lin: { term: 'lin 吝', gloss: 'distress', frequency: 20, slot: 'observation', dimension: 'Evolution' },
  },
});

/* ------------------------------------------------------- §5/T19 — casting */

// P5: coin per line = 3 throws, heads=3/tails=2, sum -> 6/7/8/9 -> P(6)=P(9)=1/8, P(7)=P(8)=3/8.
// Yarrow (4-pile remainder procedure, Rutt pp.166-9): P(6)=1/16, P(7)=5/16, P(8)=7/16, P(9)=3/16.
export const CASTING = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md §5 T19-B1 + T16-P5 (Rutt pp.156,166-9; Adler pp.29-30; Moore p.85)',
  note: 'the two procedures are NOT interchangeable: coin flattens moving-line odds relative to yarrow (Adler R-D2); the method used must be recorded per cast',
  methods: ['coin', 'yarrow'],
  coinLineDistribution: { 6: 1 / 8, 7: 3 / 8, 8: 3 / 8, 9: 1 / 8 },
  yarrowLineDistribution: { 6: 1 / 16, 7: 5 / 16, 8: 7 / 16, 9: 3 / 16 },
  // yarrow empirical hexagram-level moving-line distribution (Rutt Table 18 pp.166-169)
  yarrowEmpiricalHexagramDistribution: { noMovingLines: 0.18, exactlyOneMoving: 0.36, oneOrTwoMoving: 0.66, threeOrMoreMoving: 0.17 },
});

// Line-value distribution for a casting method ('coin' | 'yarrow'). Pure data lookup.
export function castingDistribution(method) {
  if (method === 'coin') return { ...CASTING.coinLineDistribution };
  if (method === 'yarrow') return { ...CASTING.yarrowLineDistribution };
  throw new RangeError(`castingDistribution: unknown method ${method} (expected 'coin' or 'yarrow')`);
}

// Sample one line value (6/7/8/9) from the method's distribution.
// rng must be a caller-supplied seeded PRNG () => [0,1) — no module-level randomness.
export function castLine(method, rng) {
  if (typeof rng !== 'function') throw new TypeError('castLine: rng must be a seeded PRNG function () => [0,1)');
  const dist = castingDistribution(method);
  const r = rng();
  let acc = 0;
  for (const value of [6, 7, 8, 9]) {
    acc += dist[value];
    if (r < acc) return value;
  }
  return 9; // floating-point tail guard
}

// Full cast: 6 lines bottom-to-top. Method is recorded (P5 mandate). Returns
// {method, lines, bits, benGua, movingLines, zhiGua} — all deterministic given rng.
export function castHexagram(method, rng) {
  const lines = [1, 2, 3, 4, 5, 6].map(() => castLine(method, rng));
  const bits = lines.map((v) => LINES.byValue[v].bit);
  const benGua = gateFromBits(bits);
  const movingLines = lines.map((v, i) => (LINES.byValue[v].moving ? i + 1 : 0)).filter(Boolean);
  const zhiBits = lines.map((v) => {
    const line = LINES.byValue[v];
    return line.moving ? 1 - line.bit : line.bit;
  });
  return { method, lines, bits, benGua, movingLines, zhiGua: gateFromBits(zhiBits) };
}

// Hamming re-export for pair-structure consumers (flipped/opposite pairs: hamming === 6).
export { hamming };

