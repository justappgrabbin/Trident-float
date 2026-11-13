// Pure Synthia Automata — primitive × dimension attribution: which letters, marks, sounds, colors, fragments belong to what Dimension (FRAGMENT_ALGEBRA_SPEC §2/§3; tables T9-T15)

import { PHONEME_BY_ID } from './features.js';
import { LETTERS } from './letters.js';
import { TRIGRAM_MATRIX, SI_XIANG } from './fragments.js';

const deepFreeze = (x) => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    for (const v of Object.values(x)) deepFreeze(v);
    Object.freeze(x);
  }
  return x;
};

/* ------------------------------- the load-bearing bridge (T14 R-C2, H-F3) --------------- */

export const WUXING_DIMENSION = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md §3d R-C2 / hypothesis H-F3 (Adler Table 1.3 p.24 + Table 1.4 p.25 phase row, anchored balance->Being)',
  hypothesis: 'H-F3',
  map: { Wood: 'Movement', Fire: 'Evolution', Earth: 'Being', Metal: 'Design', Water: 'Space' },
});

/* ------------------------------------------- §3a / T11 — letters (26) */

// R-L3 manner -> primary dimension (H-F4: synthesis; R-L1/R-L2/R-L4 are mechanical).
export const MANNER_DIMENSION = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md §3a T11 manner_dimension (hypothesis H-F4)',
  hypothesis: 'H-F4',
  map: { stop: 'Movement', fricative: 'Evolution', vowel: 'Being', nasal: 'Space', liquid: 'Design', glide: 'Design', affricate: 'Design' },
});

// R-L2: manner class from a phoneme's feature bundle (features.js) — the first
// f.manner.* in the bundle; two manner features (affricates tʃ/dʒ) -> 'affricate'.
export function mannerOfPhoneme(phonemeId) {
  const phoneme = PHONEME_BY_ID.get(phonemeId);
  if (!phoneme) throw new RangeError(`mannerOfPhoneme: unknown phoneme ${phonemeId}`);
  const manners = phoneme.bundle
    .filter((f) => f.startsWith('f.manner.'))
    .map((f) => f.slice('f.manner.'.length));
  if (manners.length === 0) return null;
  if (manners.length >= 2) return 'affricate';
  return manners[0];
}

// R-L4: secondary dimension from the voice axis (Hatcher E1, vol.1 pp.449-452):
// f.voice present -> Evolution (Gang = temporal/feedforward); f.voiceless -> Space
// (Rou = spatial/feedback). Vowels and sonorants (nasal/liquid/glide) are inherently
// voiced even though their bundles carry no explicit f.voice feature.
const INHERENTLY_VOICED_MANNERS = new Set(['vowel', 'nasal', 'liquid', 'glide']);
export function voiceSecondaryOfPhoneme(phonemeId) {
  const phoneme = PHONEME_BY_ID.get(phonemeId);
  if (!phoneme) throw new RangeError(`voiceSecondaryOfPhoneme: unknown phoneme ${phonemeId}`);
  if (phoneme.bundle.includes('f.voiceless')) return 'Space';
  if (phoneme.bundle.includes('f.voice')) return 'Evolution';
  const manner = mannerOfPhoneme(phonemeId);
  if (manner && INHERENTLY_VOICED_MANNERS.has(manner)) return 'Evolution';
  return null;
}

// The full mechanical attribution rule (R-L1..R-L4) as a function:
// letter -> primary phoneme (letters.js [0]) -> manner (features.js) -> primary
// dimension (MANNER_DIMENSION); voice axis -> secondary dimension.
export function letterAttribution(char) {
  const letter = LETTERS.find((l) => l.char === String(char).toLowerCase());
  if (!letter) return null;
  const primaryPhoneme = letter.phonemes[0]; // R-L1: first-listed = cardinal reading
  const manner = mannerOfPhoneme(primaryPhoneme); // R-L2
  const primary = MANNER_DIMENSION.map[manner] || null; // R-L3 (H-F4)
  const secondary = voiceSecondaryOfPhoneme(primaryPhoneme); // R-L4
  return {
    char: letter.char,
    primaryPhoneme,
    manner,
    voice: secondary === 'Evolution' ? '+' : '-',
    primary,
    secondary,
  };
}

// Materialized table: the rule applied to all 26 letters. Re-derivable at any time
// via letterAttribution — the test asserts table === rule reapplied.
// NOTE (spec T11 distribution_note): Space is thin (m, n) because English writes
// nasals with two letters; this is what the mechanical rule yields — reported, not
// patched. The mod-5 assignment in letters.js candidateAddress remains for
// addressing only (Conflicts C7); THIS table is the semantic attribution.
export const LETTERS_DIMENSIONS = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md §3a T11 (rule H-F4 over letters.js + features.js)',
  hypothesis: 'H-F4',
  rule: {
    'R-L1': 'primary phoneme = letter.phonemes[0] (letters.js; first-listed = cardinal reading)',
    'R-L2': 'manner = first f.manner.* in bundle; two manner features -> affricate',
    'R-L3': 'MANNER_DIMENSION map (H-F4)',
    'R-L4': 'secondary: voiced -> Evolution, voiceless -> Space (Hatcher E1, vol.1 pp.449-452)',
  },
  letters: Object.fromEntries(LETTERS.map((l) => [l.char, letterAttribution(l.char)])),
  distribution: {
    Movement: ['b', 'c', 'd', 'g', 'k', 'p', 'q', 't', 'x'],
    Evolution: ['f', 'h', 's', 'v', 'z'],
    Being: ['a', 'e', 'i', 'o', 'u'],
    Design: ['j', 'l', 'r', 'w', 'y'],
    Space: ['m', 'n'],
  },
  distributionNote: 'Space is thin (m, n) because English writes nasals with two letters; reported, not patched',
});

/* ---------------------------------- §3b / T12 — Unified Syntax Field (19 marks) */

// CANON (author's master document, GGM §3a [L135-178]; supersedes H-F1).
// The source does NOT attribute marks to dimensions -> `dimension: null` is canonical.
// `hF1b` is the separate tentative action-constrained attribution (hypothesis H-F1b);
// canon vs hypothesis stay in distinct fields.
export const UNIFIED_SYNTAX_FIELD = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md §3b T12 (GGM §3a [L135-178], §3b [L111-133], §3c [L5493-5590])',
  status: 'CANON (supersedes hypothesized 14-mark alphabet H-F1)',
  dimensionAttribution: 'NOT STATED in source (GGM §3a note [L150]; GGM §8) -> deferred to H-F1b, constrained by ontological_action',
  marks: [
    { n: 1, mark: '•', name: 'Singularity', metaphysicalRole: 'Singularity', linguisticEquivalent: 'a / one / this potential', ontologicalAction: 'Pre-collapse seed; infinite potential', lineRef: 'L142', dimension: null, hF1b: 'Being' },
    { n: 2, mark: '.', name: 'Transitioner', metaphysicalRole: 'Transitioner', linguisticEquivalent: 'then / so / thus', ontologicalAction: 'Step inward; descent into next chamber of sequence', lineRef: 'L144', coordinateRole: 'hierarchical/nested-resolution operator inside Gate.Line.Color.Tone.Base - NOT sentence end [L5507-5517, L5866]', dimension: null, hF1b: 'Movement' },
    { n: 3, mark: '°', name: 'Collapse', metaphysicalRole: 'Collapse', linguisticEquivalent: 'at / in / to', ontologicalAction: 'Anchors potential into coordinate; fixes a phase or state', lineRef: 'L146', coordinateRole: 'DMS degree: motivational vector, where the field points (orientation) [L5519, L5557-5583]', dimension: null, hF1b: 'Being' },
    { n: 4, mark: ':', name: 'Portal', metaphysicalRole: 'Portal', linguisticEquivalent: 'as / into / through', ontologicalAction: 'Opens a threshold; passes between chambers or modes', lineRef: 'L148', dimension: null, hF1b: 'Movement' },
    { n: 5, mark: ';', name: 'Fork', metaphysicalRole: 'Fork', linguisticEquivalent: 'or / while / meanwhile', ontologicalAction: 'Divides into divergent streams; creates parallel threads', lineRef: 'L150', dimension: null, hF1b: 'Movement' },
    { n: 6, mark: ',', name: 'Breath', metaphysicalRole: 'Breath', linguisticEquivalent: 'and / with', ontologicalAction: 'Pause for collection; gathers fragments before continuation', lineRef: 'L152', coordinateRole: "after Center = origin vector / reference field; 'a breath, not a break' [L5505]", dimension: null, hF1b: 'Space' },
    { n: 7, mark: '–', name: 'Current', metaphysicalRole: 'Current', linguisticEquivalent: 'is / are / be', ontologicalAction: 'Span of continuity; hum of existence; steady-state being', lineRef: 'L154', verbField: "Continuity ('is') - Verb-Field Triad [L187]", dimension: null, hF1b: 'Being' },
    { n: 8, mark: '′', name: 'Pulse', metaphysicalRole: 'Pulse', linguisticEquivalent: 'by / per', ontologicalAction: 'Rhythmic tick; marks tempo and cadence of events', lineRef: 'L156', coordinateRole: "DMS arcminute: sensory sub-vector, 'minutes of touch' (sensation) [L120, L5557-5583]", dimension: null, hF1b: 'Evolution' },
    { n: 9, mark: '″', name: 'Flicker', metaphysicalRole: 'Flicker', linguisticEquivalent: 'just / yet', ontologicalAction: 'Micro-shift or instant transition; shimmer of awareness', lineRef: 'L158', coordinateRole: 'DMS arcsecond: environmental micro-vector (environment) [L121, L5557-5583]', dimension: null, hF1b: 'Movement' },
    { n: 10, mark: '“ ”', name: 'Container', metaphysicalRole: 'Container', linguisticEquivalent: 'the name of / known as', ontologicalAction: 'Sacred seal of identity; holds a defined essence', lineRef: 'L160', dimension: null, hF1b: 'Space' },
    { n: 11, mark: '( )', name: 'Cocoon', metaphysicalRole: 'Cocoon', linguisticEquivalent: 'within / becoming / under', ontologicalAction: 'Incubation bubble; protects metamorphosis', lineRef: 'L162', dimension: null, hF1b: 'Evolution' },
    { n: 12, mark: '[ ]', name: 'Index Gate', metaphysicalRole: 'Index Gate', linguisticEquivalent: 'from / where / that which', ontologicalAction: 'Lookup key; recalls memory or source reference', lineRef: 'L164', dimension: null, hF1b: 'Design' },
    { n: 13, mark: '{ }', name: 'Domain', metaphysicalRole: 'Domain', linguisticEquivalent: 'of / about / regarding', ontologicalAction: 'Field scope; defines local laws or logic boundaries', lineRef: 'L166', dimension: null, hF1b: 'Design' },
    { n: 14, mark: '/', name: 'Blade', metaphysicalRole: 'Blade', linguisticEquivalent: 'or else / versus / divide', ontologicalAction: 'Cut, separation, or decisive differentiation', lineRef: 'L168', dimension: null, hF1b: 'Movement' },
    { n: 15, mark: '\\', name: 'Escape', metaphysicalRole: 'Escape', linguisticEquivalent: 'except / beyond / aside from', ontologicalAction: 'Sideways exit from a pattern; loophole in structure', lineRef: 'L170', dimension: null, hF1b: 'Movement' },
    { n: 16, mark: '*', name: 'Starburst', metaphysicalRole: 'Starburst', linguisticEquivalent: 'and also / plus / each', ontologicalAction: 'Expansion, multiplication; radiating potential', lineRef: 'L172', dimension: null, hF1b: 'Evolution' },
    { n: 17, mark: '…', name: 'Continuation', metaphysicalRole: 'Continuation', linguisticEquivalent: 'and then / still / to be continued', ontologicalAction: 'Unfinished wave; temporal openness', lineRef: 'L174', dimension: null, hF1b: 'Evolution' },
    { n: 18, mark: '=', name: 'Mirror', metaphysicalRole: 'Mirror', linguisticEquivalent: 'the / this / that same', ontologicalAction: 'Reflective unification; collapse of two into one known instance', lineRef: 'L176', verbField: "Recognition ('the') - Verb-Field Triad [L185]", coordinateRole: 'collapses duals (state unification) [L5524]', dimension: null, hF1b: 'Being' },
    { n: 19, mark: '→', name: 'Vector', metaphysicalRole: 'Vector', linguisticEquivalent: 'becomes / leads to / creates', ontologicalAction: 'Direction of transformation; flow of creation', lineRef: 'L178', verbField: "Transformation ('is becoming') - Verb-Field Triad [L189]", coordinateRole: 'vector / causal flow [L5522]', dimension: null, hF1b: 'Movement' },
  ],
  usageNote: 'marks are sentence-level (L5) primitives AND address-syntax operators; they slot the output grammar of T18, the generative grammar of §4.5, and the coordinate string of the address system',
});

/* ------------------------------------------- §3c / T13 — sounds */

export const SOUND_DIMENSIONS = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md §3c T13 (sounds.js; Adler Table 1.3 p.24; Moore pp.23,141; Wen C1 ~pp.172-225)',
  rules: {
    'R-S1': 'a sound parameter inherits the dimension of the address field that selects it (octave<-dimension, timbre<-color, duration<-tone, velocity<-base, rhythmicSlot<-house); the semantic dimension below is the corpus-argued one',
    'R-S2': '(H-F2) five tones -> five dimensions via wuxing (jue=Wood, zhi=Fire, gong=Earth, shang=Metal, yu=Water), then H-F3',
    'R-S3': '(H-F2 chain) SCALEGRAM [0,2,5,7,9,10] assigns lines 1-5 the five pentatonic degrees mapped in order to gong/shang/jue/zhi/yu; line 6 (degree 10, outside the classical five) = return/change tone -> Evolution',
  },
  parameters: [
    { id: 'base_frequency', primitive: 'base_frequency (432 Hz, A4)', selects: 'system-wide reference', primary: 'Being', secondary: null, rule: 'tonic = gong = Earth = center -> Being (R-S2 chain); the reference state against which all pitch is measured', hypothesis: 'H-F2' },
    { id: 'pitch_class', primitive: 'pitch_class (12 semitones from zodiac)', selects: 'zodiac field of address', primary: 'Evolution', secondary: null, rule: 'zodiac position is calendrical - a when (12 branches <-> months, double-hours)' },
    { id: 'cents', primitive: 'cents (micro-detune within sign)', selects: 'arc-second offset within sign', primary: 'Evolution', secondary: null, rule: 'sub-sign temporal offset of the same calendrical field' },
    { id: 'scale_degree_1', primitive: 'scale_degree line1 (0)', selects: 'line 1', primary: 'Being', secondary: null, rule: 'R-S3: degree 1 = gong 宮 (Earth) -> Being', hypothesis: 'H-F2' },
    { id: 'scale_degree_2', primitive: 'scale_degree line2 (2)', selects: 'line 2', primary: 'Design', secondary: null, rule: 'R-S3: degree 2 = shang 商 (Metal) -> Design', hypothesis: 'H-F2' },
    { id: 'scale_degree_3', primitive: 'scale_degree line3 (5)', selects: 'line 3', primary: 'Movement', secondary: null, rule: 'R-S3: degree 3 = jue 角 (Wood) -> Movement', hypothesis: 'H-F2' },
    { id: 'scale_degree_4', primitive: 'scale_degree line4 (7)', selects: 'line 4', primary: 'Evolution', secondary: null, rule: 'R-S3: degree 4 = zhi 徵 (Fire) -> Evolution', hypothesis: 'H-F2' },
    { id: 'scale_degree_5', primitive: 'scale_degree line5 (9)', selects: 'line 5', primary: 'Space', secondary: null, rule: 'R-S3: degree 5 = yu 羽 (Water) -> Space', hypothesis: 'H-F2' },
    { id: 'scale_degree_6', primitive: 'scale_degree line6 (10)', selects: 'line 6', primary: 'Evolution', secondary: null, rule: 'R-S3: sixth tone = return/change tone; line 6 = completion turning (Moore p.141)', hypothesis: 'H-F2' },
    { id: 'octave', primitive: 'octave (2-6)', selects: 'dimension field of address', primary: 'self', secondary: null, rule: 'R-S1: octave is the dimension channel itself; D1=2 ... D5=6, Being=4 middle' },
    { id: 'timbre', primitive: 'timbre (6 waveforms)', selects: 'color slot 1-6', primary: 'Design', secondary: null, rule: "waveform = the sound's structure/form (semantic); mechanically inherits the address dimension", hypothesis: 'H-F5' },
    { id: 'duration', primitive: 'duration (6 articulations)', selects: 'tone slot 1-6', primary: 'Evolution', secondary: null, rule: 'duration = time-extent of the event (staccato->legato = growing temporal span)' },
    { id: 'velocity', primitive: 'velocity (5 levels)', selects: 'base slot 1-5', primary: 'Movement', secondary: null, rule: 'velocity = attack force = impulse magnitude', hypothesis: 'H-F5' },
    { id: 'rhythmic_slot', primitive: 'rhythmic_slot (8-beat cycle)', selects: 'house slot 1-8', primary: 'Design', secondary: null, rule: 'meter position = temporal structure; house = trigram house (45° arc)' },
  ],
  fiveTones: [
    { tone: 'gong 宮', wuxing: 'Earth', dimension: 'Being', degreeInScalegram: 1, hypothesis: 'H-F2' },
    { tone: 'shang 商', wuxing: 'Metal', dimension: 'Design', degreeInScalegram: 2, hypothesis: 'H-F2' },
    { tone: 'jue 角', wuxing: 'Wood', dimension: 'Movement', degreeInScalegram: 3, hypothesis: 'H-F2' },
    { tone: 'zhi 徵', wuxing: 'Fire', dimension: 'Evolution', degreeInScalegram: 4, hypothesis: 'H-F2' },
    { tone: 'yu 羽', wuxing: 'Water', dimension: 'Space', degreeInScalegram: 5, hypothesis: 'H-F2' },
  ],
  trigramSoundsWen: [
    { trigram: 'qian', sound: 'steady slow drumbeat', dimension: 'Design', via: 'wuxing Metal, H-F3' },
    { trigram: 'dui', sound: 'chimes, bells, clanging', dimension: 'Design', via: 'wuxing Metal, H-F3' },
    { trigram: 'li', sound: 'fast tempo, higher-pitched', dimension: 'Evolution', via: 'wuxing Fire, H-F3' },
    { trigram: 'zhen', sound: 'clamorous, boisterous', dimension: 'Movement', via: 'wuxing Wood, H-F3' },
    { trigram: 'xun', sound: 'arias, chamber music, birdsong', dimension: 'Movement', via: 'wuxing Wood, H-F3' },
    { trigram: 'kan', sound: 'mantras, minor keys, lamentations, nocturnes', dimension: 'Space', via: 'wuxing Water, H-F3' },
    { trigram: 'gen', sound: 'dark rounded timbres, precise pitches', dimension: 'Being', via: 'wuxing Earth, H-F3' },
    { trigram: 'kun', sound: 'silence; night sounds, crickets', dimension: 'Being', via: 'wuxing Earth, H-F3' },
  ],
  shaoYongPrinciple: 'pitch of cosmic movement expressible through mathematical ratios (Wen ch.4 ~p.162) - warrants deterministic structure-derived pitch; no ratio table survives (negative result)',
});

/* ------------------------------------------- §3d / T14 — colors */

export const COLOR_DIMENSIONS = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md §3d T14 (colors.js; Adler Table 1.3 p.24; Govinda p.57; Moore pp.20-22; Wen C5 ~pp.318-338; Hatcher vol.1 pp.462-485)',
  rules: {
    'R-C1': 'channel semantics (H-F5): hue->Movement, saturation->Being, lightness->Evolution, rendering layer = address dimension (existing code)',
    'R-C2': 'wuxing->dimension via yin-yang phase row, anchor balance->Being (H-F3)',
  },
  channels: [
    { id: 'hue', primitive: 'hue (gateArcSec/1296000*360)', primary: 'Movement', secondary: null, rule: 'R-C1: hue is position on the wheel = where', hypothesis: 'H-F5' },
    { id: 'saturation', primitive: 'saturation (30+line*10)', primary: 'Being', secondary: null, rule: 'R-C1: line intensity = how much state is present', hypothesis: 'H-F5' },
    { id: 'lightness', primitive: 'lightness (25+tone*7)', primary: 'Evolution', secondary: null, rule: 'R-C1: tone slot = temporal articulation in sound map -> time-value', hypothesis: 'H-F5' },
    { id: 'layer', primitive: 'rendering layer (stroke/fill/glow/frame/ground)', primary: 'self', secondary: null, rule: 'existing code: DIMENSION_LAYERS Movement=stroke, Evolution=fill, Being=glow, Design=frame, Space=ground' },
  ],
  wuxingColors: [
    { color: 'green/blue-green (qing 青)', wuxing: 'Wood', primary: 'Movement', rule: 'R-C2', hypothesis: 'H-F3' },
    { color: 'red', wuxing: 'Fire', primary: 'Evolution', rule: 'R-C2', hypothesis: 'H-F3' },
    { color: 'yellow', wuxing: 'Earth', primary: 'Being', rule: 'R-C2', hypothesis: 'H-F3' },
    { color: 'white', wuxing: 'Metal', primary: 'Design', rule: 'R-C2', hypothesis: 'H-F3' },
    { color: 'black/blue-black (xuan 玄)', wuxing: 'Water', primary: 'Space', rule: 'R-C2', hypothesis: 'H-F3' },
  ],
  trigramColors: [
    { trigram: 'qian', color: 'deep red (da chi 大赤)', attestation: 'Shuogua 11', primary: 'Design', via: 'trigram secondary, T4' },
    { trigram: 'kun', color: 'black (black earth)', attestation: 'Shuogua 11', primary: 'Being' },
    { trigram: 'zhen', color: 'blue-black + golden yellow (xuan huang 玄黃)', attestation: 'Shuogua 11', primary: 'Movement' },
    { trigram: 'xun', color: 'white', attestation: 'Shuogua 11', primary: 'Movement' },
    { trigram: 'kan', color: 'red (blood)', attestation: 'Shuogua 11', primary: 'Space' },
    { trigram: 'li', color: 'red (Fire, wuxing fill)', attestation: 'H-F5 extension - not in Shuogua', primary: 'Evolution', hypothesis: 'H-F5' },
    { trigram: 'gen', color: 'yellow (Earth, wuxing fill)', attestation: 'H-F5 extension - not in Shuogua', primary: 'Being', hypothesis: 'H-F5' },
    { trigram: 'dui', color: 'white (Metal, wuxing fill)', attestation: 'H-F5 extension - not in Shuogua', primary: 'Design', hypothesis: 'H-F5' },
  ],
  anchorsHd6: [
    { slot: 1, name: 'Appetite', hex: '#8C4A2F', primary: 'Being', rule: 'sense bridge (H-F5): appetite approximated to taste -> Earth -> Being (Wen C5)', hypothesis: 'H-F5' },
    { slot: 2, name: 'Taste', hex: '#C28E3C', primary: 'Being', rule: 'taste = Earth (Wen C5) -> Being', hypothesis: 'H-F5' },
    { slot: 3, name: 'Thirst', hex: '#3C6E8C', primary: 'Space', rule: 'thirst = water-craving -> Water -> Space (approximated)', hypothesis: 'H-F5' },
    { slot: 4, name: 'Touch', hex: '#6E8C3C', primary: 'Evolution', rule: 'touch = Fire (Wen C5) -> Evolution', hypothesis: 'H-F5' },
    { slot: 5, name: 'Sound', hex: '#7A5A8C', primary: 'Space', rule: 'hearing = Water (Wen C5) -> Space', hypothesis: 'H-F5' },
    { slot: 6, name: 'Light', hex: '#D9C98C', primary: 'Movement', rule: 'sight = Wood (Wen C5) -> Movement', hypothesis: 'H-F5' },
  ],
  note: 'smell (= Metal -> Design, Wen C5) has no anchor slot; the 6-anchor palette is HD-derived, not wuxing-derived - the bridge is H-F5',
});

/* ---------------------------------- §3e / T15 — I Ching fragment class rules */

export const FRAGMENT_DIMENSIONS = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md §3e T15 (class-level rules; per-item secondaries via H-F3 or Hatcher E1)',
  rows: [
    { id: 'line', fragmentClass: 'line glyph (0/1 bit)', primary: 'Being', secondary: 'polarity semantics: yang -> Evolution, yin -> Space', rule: 'the bare glyph is a state primitive (Being); its polarity field splits per Hatcher E1 (Gang temporal -> Evolution; Rou spatial -> Space)' },
    { id: 'stable-line', fragmentClass: 'stable line (7/8)', primary: 'Being', secondary: null, rule: 'mixed-sum lines rest (Adler pp.30-31) = instantiated state' },
    { id: 'moving-line', fragmentClass: 'moving line (6/9)', primary: 'Evolution', secondary: 'Movement', rule: 'pure-sum lines are transitions in progress (op = transform); the zhi citation names a line by its destination (Movement)' },
    { id: 'casting-number', fragmentClass: 'casting number (6/7/8/9 as sums)', primary: 'Design', secondary: 'Evolution', rule: 'pure/mixed parity is arithmetic form; maturity is the phase consequence' },
    { id: 'bigram', fragmentClass: 'bigram (si xiang)', primary: 'Evolution', secondary: 'Being (material states solid/liquid/gas/plasma)', rule: 'the four emblems are explicitly phases; per-emblem dimension via H-F6 (T3)' },
    { id: 'trigram', fragmentClass: 'trigram (nature image, family, body, animal)', primary: 'Being', secondary: 'per-trigram via wuxing H-F3 (T4); direction -> Movement; season/hour -> Evolution; xiantian position -> Design', rule: 'the attribute vocabulary is state/quality vocabulary; class-level = Being' },
    { id: 'nuclear', fragmentClass: 'nuclear trigram / hu gua', primary: 'Design', secondary: 'Space', rule: "latent sub-structure operator; also the contextual matrix/container 'within which the change occurs'" },
    { id: 'hexagram', fragmentClass: 'hexagram (as situation-pattern)', primary: 'Being', secondary: 'Movement', rule: "'a pattern or type of situation' (Adler p.3) = state; 'a representation of the present situation and its direction of change, like a vector' (Adler p.32) = Movement secondary" },
    { id: 'pairs', fragmentClass: 'hexagram pairs (inversion/complement/swap/fan yao)', primary: 'Design', secondary: 'Evolution (inverse pairs) / Space (opposite pairs)', rule: "pair axes are structural symmetries - Hatcher calls them 'dimensional axes' (vol.2 p.11)" },
    { id: 'arrangement-xiantian', fragmentClass: 'arrangement: xiantian (Fu Xi binary)', primary: 'Design', secondary: 'Space', rule: 'a priori form (Adler p.106); axial/polar timeless container' },
    { id: 'arrangement-houtian', fragmentClass: 'arrangement: houtian (King Wen compass)', primary: 'Evolution', secondary: 'Movement', rule: 'a posteriori succession in time (Adler p.106); clockwise circulation of directions' },
    { id: 'arrangement-mawangdui', fragmentClass: 'arrangement: Mawangdui familial', primary: 'Design', secondary: 'Being', rule: 'a sequence-generation rule over family groups; family semantics = Being vocabulary' },
    { id: 'oracle-slot', fragmentClass: 'oracle slot (shici, omen image)', primary: 'Being', secondary: 'Space', rule: 'state snapshot (weather, animals, stars, events); images are resonant containers keyed to domains' },
    { id: 'indication-slot', fragmentClass: 'indication slot (gaoci, action domain)', primary: 'Movement', secondary: null, rule: 'the recurrent templates are all directed actions: fording, traveling, meeting' },
    { id: 'prognostic-slot', fragmentClass: 'prognostic slot (duanci, ji/li/jiu/xiong)', primary: 'Being.valence', secondary: null, rule: 'T10 resolution: syntactically absolute predicate on the state' },
    { id: 'observation-slot', fragmentClass: 'observation slot (yanci, hui/lin)', primary: 'Evolution', secondary: null, rule: "temporal modulation - how the state unfolds or resolves ('troubles disappear', 'trouble in the end')" },
    { id: 'tag', fragmentClass: 'tag (guaming, hexagram name)', primary: 'Being', secondary: 'Design', rule: "name/identity of the fragment cluster; functionally an index/label (Adler p.30 'tags')" },
    { id: 'wuxing', fragmentClass: 'wuxing phases + cycles', primary: 'Evolution', secondary: 'Being (as qualities/colors/tastes)', rule: "'phases... temporary stages in the continuous change and transformation of qi' (Adler p.23); cycles are transformation rules" },
    { id: 'numbers', fragmentClass: 'numbers (hetu/luoshu, stems/branches)', primary: 'Design', secondary: 'Space (directional grid) / Evolution (calendrical time)', rule: 'number-form and grid structure; Wen: He Tu = innate flow (Space), Lo Shu = applied control (Design)' },
    { id: 'synchronicity', fragmentClass: 'synchronicity / resonance principle', primary: 'Space', secondary: null, rule: 'container/resonance coupling of microcosm and world' },
  ],
});

/* --------------------------- §2.1 — senses (MECHANISM, author-canon) ----------- */

// AUTHOR-CANON sense<->dimension bindings (GGM §1a/§1c; T9_sense_dimension_addendum).
// VERIFIED against src/engine/intake.js: the five mechanical senses there map
// see->Movement, taste->Evolution, touch->Being, smell->Design, hear->Space
// (IntakeGate #see/#taste/#touch/#smell/#hear) — EXACT AGREEMENT, no mismatch.
export const SENSE_DIMENSIONS = deepFreeze({
  source: 'FRAGMENT_ALGEBRA_SPEC.md §2.1 T9_sense_dimension_addendum (GGM §1a, §2 [L636-674]) — matches src/engine/intake.js one-for-one',
  status: 'MECHANISM (author-canon; supersedes H-F5 sense bridge where in conflict)',
  senses: {
    see: { sense: 'Seeing', dimension: 'Movement', chainEvidence: "'Creation is Seeing' [L23-24]; crystal chain Movement=Energy=Creation=Seeing=Landscape=Environment [L672-674]" },
    taste: { sense: 'Taste', dimension: 'Evolution', chainEvidence: "'Memory is Taste' [L38]; crystal chain Evolution=Gravity=Memory=Taste=Love=Light [L643-645]" },
    touch: { sense: 'Touch', dimension: 'Being', chainEvidence: "'Matter is Touch' [L48]; crystal chain Being=Matter=Touch=Sex=Survival [L656-658]" },
    smell: { sense: 'Smell', dimension: 'Design', chainEvidence: "'Progress is Smell' [L59-60]; crystal chain Design=Structure=Progress=Smell=Life=Art [L659-661]" },
    hear: { sense: 'Hearing', dimension: 'Space', chainEvidence: "'Illusion is Hearing' [L70-71]; crystal chain Space=Form=Illusion=Hearing=Music=Freedom [L636-638]" },
  },
  conflicts: 'tone-level sense attributions are inconsistent in the source (Taste at Tone 3 vs Tone 5, Conflicts C15); the dimension-level mapping above is canonical',
});

/* ------------------------------------------- unified lookup: dimensionOf */

// dimensionOf(primitiveKind, id) -> {primary, secondary, basis, hypothesisId?} | null.
// basis: 'canon' (source-attested) | 'rule' (mechanical over existing code) |
// 'hypothesis' (ledger H-F<n>); hypothesisId carries the ledger entry when relevant.
export function dimensionOf(primitiveKind, id) {
  switch (primitiveKind) {
    case 'letter': {
      const a = LETTERS_DIMENSIONS.letters[String(id).toLowerCase()];
      return a ? { primary: a.primary, secondary: a.secondary, basis: 'rule', hypothesisId: 'H-F4' } : null;
    }
    case 'mark': {
      const m = UNIFIED_SYNTAX_FIELD.marks.find((x) => x.mark === id || x.name.toLowerCase() === String(id).toLowerCase());
      return m ? { primary: null, secondary: null, basis: 'canon', hypothesisId: 'H-F1b', tentative: { primary: m.hF1b, basis: 'hypothesis' } } : null;
    }
    case 'sense': {
      const s = SENSE_DIMENSIONS.senses[String(id).toLowerCase()];
      return s ? { primary: s.dimension, secondary: null, basis: 'canon' } : null;
    }
    case 'sound': {
      const p = SOUND_DIMENSIONS.parameters.find((x) => x.id === id);
      if (!p) return null;
      return { primary: p.primary, secondary: p.secondary, basis: p.hypothesis ? 'hypothesis' : 'rule', ...(p.hypothesis ? { hypothesisId: p.hypothesis } : {}) };
    }
    case 'tone': {
      const t = SOUND_DIMENSIONS.fiveTones.find((x) => x.tone.startsWith(id));
      return t ? { primary: t.dimension, secondary: null, basis: 'hypothesis', hypothesisId: 'H-F2' } : null;
    }
    case 'color': {
      const c = COLOR_DIMENSIONS.channels.find((x) => x.id === id);
      if (!c) return null;
      return { primary: c.primary, secondary: c.secondary, basis: c.hypothesis ? 'hypothesis' : 'rule', ...(c.hypothesis ? { hypothesisId: c.hypothesis } : {}) };
    }
    case 'wuxing': {
      const w = COLOR_DIMENSIONS.wuxingColors.find((x) => x.wuxing === id);
      return w ? { primary: w.primary, secondary: null, basis: 'hypothesis', hypothesisId: 'H-F3' } : null;
    }
    case 'trigram': {
      const t = TRIGRAM_MATRIX.trigrams.find((x) => x.id === id);
      return t ? { primary: t.dimension.primary, secondary: t.dimension.secondary, basis: 'rule', hypothesisId: 'H-F3' } : null;
    }
    case 'bigram': {
      const b = SI_XIANG.rows.find((x) => x.emblem.startsWith(id) || x.bits.join(',') === String(id));
      return b ? { primary: b.primaryDimension, secondary: null, basis: 'hypothesis', hypothesisId: 'H-F6' } : null;
    }
    case 'fragment': {
      const f = FRAGMENT_DIMENSIONS.rows.find((x) => x.id === id);
      return f ? { primary: f.primary, secondary: f.secondary, basis: 'rule' } : null;
    }
    default:
      return null;
  }
}

// Note: every attributed primary/secondary above is one of DIMENSIONS
// (constants.js) or the explicit non-dimension markers null / 'self' /
// 'Being.valence' (T10: valence is a sub-axis of Being, not a sixth dimension).

