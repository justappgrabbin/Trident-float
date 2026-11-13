// Pure Synthia Automata — state-space: Black Book dimension chains, Three
// Conditions, Crystals & Monopole, Book of Colors COLOR/TONE/BASE tables.
//
// VERBATIM PORT of docs/corpus/black-book-chains-colors.md (Turn-10 uploads,
// transcribed from page photographs). Source ids:
//   BB-p126  Macrocosmic/Microcosmic chart (five dimensions)
//   BB-p127  numbered list "One.–Five."
//   BB-p128  Four Dimension chart + pre-Big-Bang paragraph + appended Space row
//   BB-p129  "We have three conditions"
//   BB-p130  The Crystals and the Monopole
//   BOC-chart  Book of Colors, last page: COLOR/TONE/BASE tables
//
// TRANSCRIPTION RULE (author directive, Turn 10): strings are stored EXACTLY
// as printed. No words added, none removed, none "corrected." Printed spellings
// (`Smelt`, `UNCERTENTY`, `MEDITION`, `ACCEPTENCE`) are preserved verbatim;
// normalized forms, where useful for keys, live ONLY in separate `normalized`
// fields and are never substituted into the verbatim string.
//
// STRUCTURAL RULE (author directive, Turn 10): the chain printed under a
// dimension is NOT "how the chain goes" absolutely — it is how that dimension
// SEES the chain in relation to the others. Chains and orderings are
// per-dimension PERSPECTIVES. Where a perspective is not attested for a
// dimension, the value is `null` — never guessed (ORDINAL_PERSPECTIVES).
//
// PROVENANCE: every entry is carried as a claim-shaped record
// `{ value, status, source, ... }` (status from claim-status.js CLAIM_STATUS;
// isClaim() recognizes these records). SOURCE_STATEMENT records always cite
// their page. CONFLICT records keep BOTH attestations; nothing is resolved
// silently.
//
// AGREEMENTS recorded (not merged):
//   - BASE_TABLE senses (Seeing→Movement, Taste→Evolution, Touching→Being,
//     Smell→Design, Hearing→Space) AGREE with SENSE_DIMENSIONS
//     (primitive-dimensions.js) and engine/intake.js — noted, not re-merged.
//   - COLOR 6 response INNOCENCE AGREES with the generative-grammar example
//     `Gate:Innocence°` (docs/corpus/generative-grammar-master.md).
//   - TONE_TABLE departments (Smell, Taste, Outer Vision, Inner Vision,
//     Feeling, Touch) are the HD TONE architecture keyed to tone NUMBER 1–6 —
//     a SEPARATE architecture from SENSE_DIMENSIONS (sense↔dimension). Both
//     are recorded as distinct SOURCE_STATEMENTs; DO NOT merge them.
//
// Pure JS ESM, zero deps, Node + browser, deterministic (no clock, no random).

import { CLAIM_STATUS } from './claim-status.js';
import { CanonRegistry } from '../engine/canon-registry.js';

const deepFreeze = (x) => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    for (const v of Object.values(x)) deepFreeze(v);
    Object.freeze(x);
  }
  return x;
};

// Claim-shaped provenance record (shape consistent with claim-status.js;
// `fields` may add entry-specific data such as blankCell / attestations).
const prov = (value, status, source, fields = {}) => deepFreeze({ value, status, source, ...fields });
const src = (value, source, fields = {}) => prov(value, CLAIM_STATUS.SOURCE_STATEMENT, source, fields);

/* ============================ 1. DIMENSION_CHAINS (BB-p126/128/130) ============================
 *
 * Per dimension: { macroChain, micro, symbol, basicComponents, sourceRefs }.
 * macroChain = the verbatim "X is Y" sentences as printed on BB-p126, one
 * claim record per sentence. Being's chain contains the printed BLANK CELL
 * "Matter is" (conflict C17) — stored as the verbatim string with
 * `blankCell: true`; the predicate is NEVER filled. (BB-p126 also prints
 * "Matter is Touch" twice, one struck through in print; the struck duplicate
 * is a print artifact and is not part of the chain.)
 *
 * NOTE (verbatim, not a registered conflict): BB-p126 prints the Being micro
 * keynote as "I am" (lowercase) while BB-p130 and BOC-chart Base 3 print
 * "I Am". Both are stored verbatim at their own attestations.
 */
export const DIMENSION_CHAINS = deepFreeze({
  Movement: {
    macroChain: [
      src('Movement is Energy', 'BB-p126'),
      src('Energy is Creation', 'BB-p126'),
      src('Creation is Seeing', 'BB-p126'),
      src('Seeing is Landscape', 'BB-p126'),
      src('Landscape is Environment', 'BB-p126'),
    ],
    micro: src({
      name: 'Individuality',
      nature: ['Activity', 'Reaction', 'Limitation', 'Perspective', 'Relation'],
      keynote: { label: 'Uniqueness', phrase: 'I Define' },
    }, 'BB-p126'),
    symbol: src('Ǝ', 'BB-p128'),
    basicComponents: {
      fourDimensionChart: src('Magnetic Monopole', 'BB-p128'),
      threeConditions: {
        singularity: src('Magnetic Monopole', 'BB-p129'),
        postBigBang: src('Magnetic Monopole', 'BB-p129'),
      },
    },
    sourceRefs: ['BB-p126', 'BB-p128', 'BB-p129', 'BB-p130'],
  },
  Evolution: {
    macroChain: [
      src('Evolution is Gravity', 'BB-p126'),
      src('Gravity is Memory', 'BB-p126'),
      src('Memory is Taste', 'BB-p126'),
      src('Taste is Love', 'BB-p126'),
      src('Love is Light', 'BB-p126'),
    ],
    micro: src({
      name: 'The Mind',
      nature: ['Character', 'Separation', 'Nature', 'Integration', 'Spirit'],
      keynote: { label: 'Role', phrase: 'I Remember' },
    }, 'BB-p126'),
    symbol: src('E', 'BB-p128'),
    basicComponents: {
      fourDimensionChart: src('Personality Crystal', 'BB-p128'),
      threeConditions: {
        singularity: src('Personality Crystal', 'BB-p129'),
        postBigBang: src('Personality Crystal', 'BB-p129'),
      },
    },
    sourceRefs: ['BB-p126', 'BB-p128', 'BB-p129', 'BB-p130'],
  },
  Being: {
    macroChain: [
      src('Being is Matter', 'BB-p126'),
      // The known blank cell (conflict C17): predicate cell EMPTY in print.
      // Second attestation: BB-p130 Body chain "Matter is." — never filled.
      src('Matter is', 'BB-p126', { blankCell: true, conflictId: 'C17' }),
      src('Matter is Touch', 'BB-p126'),
      src('Touch is Sex', 'BB-p126'),
      src('Sex is Survival', 'BB-p126'),
    ],
    micro: src({
      name: 'The Body',
      nature: ['Biology', 'Chemistry', 'Objectivity', 'Geometry', 'Trajectory'],
      keynote: { label: 'Genetics', phrase: 'I am' }, // lowercase as printed on BB-p126
    }, 'BB-p126'),
    symbol: src('M', 'BB-p128'),
    basicComponents: {
      fourDimensionChart: src('The Atom', 'BB-p128'),
      threeConditions: {
        singularity: src('Quarks', 'BB-p129'),
        postBigBang: src('Atomic', 'BB-p129'),
      },
    },
    sourceRefs: ['BB-p126', 'BB-p127', 'BB-p128', 'BB-p129', 'BB-p130'],
  },
  Design: {
    macroChain: [
      src('Design is Structure', 'BB-p126'),
      src('Structure is Progress', 'BB-p126'),
      src('Progress is Smelt', 'BB-p126'), // printed `Smelt` — preserved verbatim
      src('Smelling is Life', 'BB-p126'),
      src('Life is Art', 'BB-p126'),
    ],
    micro: src({
      name: 'The Ego',
      nature: ['Homo Sapiens', 'Growth', 'Decay', 'Continuity', 'Manifestation'],
      keynote: { label: 'Self', phrase: 'I Design' },
    }, 'BB-p126'),
    symbol: src('◆', 'BB-p128'),
    basicComponents: {
      fourDimensionChart: src('Design Crystal', 'BB-p128'),
      threeConditions: {
        singularity: src('Design Crystal', 'BB-p129'),
        postBigBang: src('Design Crystal', 'BB-p129'),
      },
    },
    sourceRefs: ['BB-p126', 'BB-p128', 'BB-p129', 'BB-p130'],
  },
  Space: {
    macroChain: [
      src('Space is Form', 'BB-p126'),
      src('Form is Illusion', 'BB-p126'),
      src('Illusion is Hearing', 'BB-p126'),
      src('Hearing is Music', 'BB-p126'),
      src('Music is Freedom', 'BB-p126'),
    ],
    micro: src({
      name: 'Personality',
      nature: ['Type', 'Fantasy', 'Subjectivity', 'Rhythm', 'Timing'],
      keynote: { label: 'Presence', phrase: 'I Think' },
    }, 'BB-p126'),
    // Space is ABSENT from the "Four Dimension" chart on BB-p128 (it appears
    // only in the appended bottom row, which prints no symbol column) and has
    // no row in either Three-Conditions table on BB-p129 -> symbol and
    // three-conditions components are null: unattested, never guessed.
    symbol: null,
    basicComponents: {
      fourDimensionChart: src('Personality Crystal', 'BB-p128', { note: 'appended bottom row, continuation of the Four Dimension chart' }),
      threeConditions: {
        singularity: null,
        postBigBang: null,
      },
    },
    sourceRefs: ['BB-p126', 'BB-p128', 'BB-p130'],
  },
});

/* ============================ 2. ORDINAL_PERSPECTIVES (BB-p127) ============================
 *
 * The numbered list One.–Five. on BB-p127:
 *   One. Being / Two. Movement / Three. Space / Four. Design / Five. Evolution
 * Per the author (Turn 10): chains and orderings are PER-DIMENSION
 * PERSPECTIVES — this ordering is how Being sees itself in relation to the
 * whole (Being "punctuates" the sequence). Equivalent ordinal perspectives
 * for Movement / Evolution / Design / Space are NOT ATTESTED in the provided
 * pages -> `null`, never guessed.
 */
export const ORDINAL_PERSPECTIVES = deepFreeze({
  Being: src(['Being', 'Movement', 'Space', 'Design', 'Evolution'], 'BB-p127', {
    printedRows: [
      'One.    Being      Being is Matter',
      'Two.    Movement   Movement is Energy',
      'Three.  Space      Space is Form',
      'Four.   Design     Design is Structure',
      'Five.   Evolution  Evolution is Gravity',
    ],
    perspective: "how Being sees itself in relation to the whole (author Turn-10)",
  }),
  Movement: null,
  Evolution: null,
  Design: null,
  Space: null,
});

/* ============================ 3. THREE_CONDITIONS (BB-p129, verbatim) ============================
 *
 * "We have three conditions:" — formulas and glyphs exactly as printed:
 *   Ǝ (reversed E) = Energy; M = Matter; E = Gravity; ◆ (diamond) = Structure;
 *   `<` with superscript `²` in the relativity formula and `z` (italics)
 *   before Progress are printed glyphs — their identification with C /
 *   speed-of-light is an interpretation, NOT transcription.
 * Rows carry { glyph, concept, dimension, component } (pre-Big-Bang poles are
 * not dimensions: dimension/component null, the printed gloss kept verbatim).
 */
export const THREE_CONDITIONS = deepFreeze({
  preBigBang: src({
    heading: 'The pre-Big-Bang state. The void',
    formula: 'Ǝ ⟶ M',
    rows: [
      { glyph: 'Ǝ', concept: 'The Yang', dimension: null, component: null, gloss: 'the Energy to Evolve Form' },
      { glyph: 'M', concept: 'The Yin', dimension: null, component: null, gloss: 'the Structure of Matter' },
    ],
  }, 'BB-p129'),
  singularity: src({
    heading: 'Singularity. Contact. The Four Dimensions',
    formula: 'Ǝ = ME◆',
    rows: [
      { glyph: 'Ǝ', concept: 'Energy', dimension: 'Movement', component: 'Magnetic Monopole' },
      { glyph: 'M', concept: 'Matter', dimension: 'Being', component: 'Quarks' },
      { glyph: 'E', concept: 'Gravity', dimension: 'Evolution', component: 'Personality Crystal' },
      { glyph: '◆', concept: 'Structure', dimension: 'Design', component: 'Design Crystal' },
    ],
  }, 'BB-p129'),
  postBigBang: src({
    heading: 'The post-Big-Bang state. Five-dimensional Relativity',
    formula: 'Ǝ = M <²',
    rows: [
      { glyph: 'Ǝ', concept: 'Energy', dimension: 'Movement', component: 'Magnetic Monopole' },
      { glyph: 'M', concept: 'Matter', dimension: 'Being', component: 'Atomic' },
      { glyph: '<', concept: 'Light', dimension: 'Evolution', component: 'Personality Crystal' },
      { glyph: 'z', concept: 'Progress', dimension: 'Design', component: 'Design Crystal' },
    ],
  }, 'BB-p129'),
  // Dimensional count per condition (BB-p129): pre = 2 poles (Yang/Yin),
  // singularity = 4 dimensions, post = 5.
  dimensionalCount: src({ pre: 2, singularity: 4, post: 5 }, 'BB-p129'),
  // SPACE-EMERGENCE NOTE (SOURCE_STATEMENT, supports SpaceModel.B /
  // SOURCE_MATRIX.md C-M1 position 2): Space is absent from the "Four
  // Dimension" chart (BB-p128) and appears only in an appended row; on
  // BB-p129 Space exists ONLY in the post-Big-Bang state (count 5) — and even
  // there no Space row is printed (only Ǝ/M/</z). SpaceModel.A (Space as
  // first-class fifth dimension, full chain on BB-p126) remains equally
  // represented in DIMENSION_CHAINS.Space. No editorial resolution.
  spaceEmergenceNote: src(
    'Space exists only in the post-Big-Bang state (BB-p129); Space is absent from the Four Dimension chart and appears in an appended row (BB-p128).',
    'BB-p128; BB-p129',
    { supports: 'SpaceModel.B', alsoRepresented: 'SpaceModel.A', conflictId: 'C-M1' },
  ),
});

/* ============================ 4. CRYSTALS_AND_MONOPOLE (BB-p130, verbatim) ============================ */
export const CRYSTALS_AND_MONOPOLE = deepFreeze({
  personalityCrystal: src({
    name: 'The Personality Crystal',
    role: 'The Witness',
    description: 'Who you think you are.',
    location: 'Head Center',
    binary: [
      {
        name: 'The Personality',
        chain: 'Space',
        chainText: 'It is Space. Space is Form. Form is Illusion. Illusion is Hearing. Hearing is Music. Music is Freedom.',
        keynote: 'I Communicate',
      },
      {
        name: 'The Mind',
        chain: 'Evolution',
        chainText: 'It is Evolution. Evolution is Gravity. Gravity is Memory. Memory is Taste. Taste is Love. Love is Light.',
        keynote: 'I Remember',
      },
    ],
  }, 'BB-p130'),
  designCrystal: src({
    name: 'The Design Crystal',
    role: 'The Vehicle',
    description: 'What you say and think and do.',
    location: 'Ajna Center',
    binary: [
      {
        name: 'The Body',
        chain: 'Being',
        // "Matter is." — blank cell C17 attested a second time, verbatim.
        chainText: 'It is Being. Being is Matter. Matter is. Matter is Touch. Touch is Sex. Sex is Survival.',
        keynote: 'I Am',
      },
      {
        name: 'The Ego',
        chain: 'Design',
        chainText: 'It is Design. Design is Structure. Structure is Progress. Progress is Smelt. Smelling is Life. Life is Art.',
        keynote: 'I Design',
      },
    ],
  }, 'BB-p130'),
  magneticMonopole: src({
    name: 'The Magnetic Monopole',
    role: 'The Attractor',
    description: 'Your Uniqueness.',
    location: 'G Center',
    manifests: {
      name: 'Individuality',
      chain: 'Movement',
      chainText: 'It is Movement. Movement is Energy. Energy is Creation. Creation is Seeing. Seeing is Landscape. Landscape is Environment.',
      keynote: 'I Create',
    },
  }, 'BB-p130'),
});

/* ============================ 5. COLOR_TABLE (BOC-chart, verbatim) ============================
 *
 * Author's framing (Turn 10): COLORS ARE MOTIVATION; the color system is
 * RECURSIVE — HD substructure recursion Line → Color (motivation) → Tone →
 * Base. Every entry carries role: 'motivation'.
 * BINARY: rows 1–2 Splenic, 3–4 Ajna, 5–6 Solar Plexus (row 5 printed split
 * "Solar"/"Plexus" on the chart).
 * AGREEMENT: Color 6 response INNOCENCE matches the author's
 * generative-grammar example `Gate:Innocence°` (generative-grammar-master.md).
 */
export const COLOR_TABLE = deepFreeze({
  source: 'BOC-chart',
  role: 'motivation',
  recursion: src('Line → Color → Tone → Base', 'BOC-chart', {
    note: 'the level below the line is the motivation (Color), the next section after the arc is the Color, and the other side is the Tone (sound) — author Turn-10',
  }),
  entries: [
    src({ n: 1, response: 'FEAR', mode: ['Communalist', 'Separatist'], binary: 'Splenic', role: 'motivation' }, 'BOC-chart'),
    src({ n: 2, response: 'HOPE', mode: ['Theist', 'Anti-theist'], binary: 'Splenic', role: 'motivation' }, 'BOC-chart'),
    src({ n: 3, response: 'DESIRE', mode: ['Leader', 'Follower'], binary: 'Ajna', role: 'motivation' }, 'BOC-chart'),
    src({ n: 4, response: 'NEED', mode: ['Master', 'Novice'], binary: 'Ajna', role: 'motivation' }, 'BOC-chart'),
    src({ n: 5, response: 'GUILT', mode: ['Conditioner', 'Conditioned'], binary: 'Solar Plexus', role: 'motivation', printedNote: 'BINARY printed split "Solar"/"Plexus" across rows 5–6' }, 'BOC-chart'),
    src({ n: 6, response: 'INNOCENCE', mode: ['Observer', 'Observed'], binary: 'Solar Plexus', role: 'motivation', agreement: 'matches generative-grammar example Gate:Innocence° (docs/corpus/generative-grammar-master.md)' }, 'BOC-chart'),
  ],
});

/* ============================ 6. TONE_TABLE (BOC-chart, verbatim) ============================
 *
 * Columns: TONE | THEME | DEPARTMENT | BINARY; side label: SOUND.
 * Printed THEME spellings preserved verbatim with [sic]: UNCERTENTY,
 * MEDITION, ACCEPTENCE — normalized forms (UNCERTAINTY, MEDITATION,
 * ACCEPTANCE) live ONLY in `theme.normalized`, never substituted.
 * BINARY printed split across rows: SPLENIC (1–2), AJNA (3–4), SOLAR (5),
 * PLEXUS (6) — kept as printed.
 * SEPARATE ARCHITECTURE: tone departments are keyed to tone NUMBER 1–6 (HD
 * tone architecture). This is a DIFFERENT mapping from SENSE_DIMENSIONS
 * (sense↔dimension) — both recorded as SOURCE_STATEMENTs, no merging.
 */
export const TONE_TABLE = deepFreeze({
  source: 'BOC-chart',
  sideLabel: 'SOUND',
  entries: [
    src({ n: 1, theme: { printed: 'SECURITY', normalized: null }, department: 'Smell', binary: 'SPLENIC', sideLabel: 'SOUND' }, 'BOC-chart'),
    src({ n: 2, theme: { printed: 'UNCERTENTY', normalized: 'UNCERTAINTY', sic: true }, department: 'Taste', binary: 'SPLENIC', sideLabel: 'SOUND' }, 'BOC-chart'),
    src({ n: 3, theme: { printed: 'ACTION', normalized: null }, department: 'Outer Vision', binary: 'AJNA', sideLabel: 'SOUND' }, 'BOC-chart'),
    src({ n: 4, theme: { printed: 'MEDITION', normalized: 'MEDITATION', sic: true }, department: 'Inner Vision', binary: 'AJNA', sideLabel: 'SOUND' }, 'BOC-chart'),
    src({ n: 5, theme: { printed: 'JUDGEMENT', normalized: null }, department: 'Feeling', binary: 'SOLAR', sideLabel: 'SOUND' }, 'BOC-chart'),
    src({ n: 6, theme: { printed: 'ACCEPTENCE', normalized: 'ACCEPTANCE', sic: true }, department: 'Touch', binary: 'PLEXUS', sideLabel: 'SOUND' }, 'BOC-chart'),
  ],
  architectureNote: 'tone departments keyed to tone number 1–6 — a separate architecture from SENSE_DIMENSIONS (sense↔dimension); do NOT merge',
});

/* ============================ 7. BASE_TABLE (BOC-chart, verbatim) ============================
 *
 * Five bases exactly as printed on the chart. `dimension` is normalized to
 * the project dimension vocabulary (Base 3 prints "(Being)"; the others print
 * MOVEMENT/EVOLUTION/DESIGN/SPACE) — the printed form is preserved in
 * `printedDimension`. Keynote lines keep printed quoting verbatim (Base 5
 * prints single quotes: 'I Think').
 * AGREEMENT: the Base table's sense assignments (Seeing→Movement,
 * Taste→Evolution, Touching→Being, Smell→Design, Hearing→Space) agree with
 * SENSE_DIMENSIONS / engine/intake.js and the author's master doc.
 */
export const BASE_TABLE = deepFreeze({
  source: 'BOC-chart',
  entries: [
    src({
      n: 1, name: 'INDIVIDUALITY', polarity: 'Yang/Yang', mode: 'Reactive',
      question: 'Where?', sense: 'Seeing', function: 'Location',
      keynoteLine: 'Uniqueness: "I Define"', descriptor: 'to measure, to name',
      dimension: 'Movement', printedDimension: 'MOVEMENT',
    }, 'BOC-chart'),
    src({
      n: 2, name: 'MIND', polarity: 'Yang/Yin', mode: 'Integrative',
      question: 'What?', sense: 'Taste', function: 'Identification',
      keynoteLine: 'Role: "I Remember"', descriptor: 'transgenerational consciousness',
      dimension: 'Evolution', printedDimension: 'EVOLUTION',
    }, 'BOC-chart'),
    src({
      n: 3, name: 'BODY', polarity: 'Yin/Yin', mode: 'Objective',
      question: 'When?', sense: 'Touching', function: 'Collaboration',
      keynoteLine: 'Genetics: "I Am"', descriptor: 'Matter is Being',
      dimension: 'Being', printedDimension: '(Being)',
    }, 'BOC-chart'),
    src({
      n: 4, name: 'EGO', polarity: 'Yin/Yang', mode: 'Progressive',
      question: 'Why?', sense: 'Smell', function: 'Manifestation',
      keynoteLine: 'Self: "I Design"', descriptor: 'information feed',
      dimension: 'Design', printedDimension: 'DESIGN',
    }, 'BOC-chart'),
    src({
      n: 5, name: 'PERSONALITY', polarity: 'SPACE/ILLUSION', mode: 'Subjective',
      question: 'Who?', sense: 'Hearing', function: 'Mutation',
      keynoteLine: "Presence: 'I Think'", descriptor: 'Communication',
      dimension: 'Space', printedDimension: 'SPACE',
    }, 'BOC-chart'),
  ],
  senseAgreement: 'senses (Seeing→Movement, Taste→Evolution, Touching→Being, Smell→Design, Hearing→Space) agree with SENSE_DIMENSIONS / intake.js — noted, not merged',
});

/* ============================ 8. KEYNOTE_CONFLICTS (C13, C14) ============================
 *
 * Double-attested keynotes — kept as CONFLICT records with BOTH attestations;
 * never resolved silently. These are the BB/BOC attestations of
 * SOURCE_MATRIX.md conflicts C-M2 (Movement keynote) and C-M3 (Space keynote).
 */
export const KEYNOTE_CONFLICTS = deepFreeze([
  prov({
    id: 'C13',
    topic: 'Movement / Individuality keynote',
    attestations: [
      { keynote: 'I Define', sources: ['BB-p126', 'BOC-chart'], context: 'Macrocosmic/Microcosmic chart micro keynote (Individuality — Uniqueness); BOC-chart Base 1 keynote line' },
      { keynote: 'I Create', sources: ['BB-p130'], context: 'Magnetic Monopole — Individuality' },
    ],
    resolution: null,
    resolutionNote: 'NONE — both attested; preserved as CONFLICT (SOURCE_MATRIX.md C-M2)',
  }, CLAIM_STATUS.CONFLICT, 'BB-p126 + BOC-chart vs BB-p130'),
  prov({
    id: 'C14',
    topic: 'Space / Personality keynote',
    attestations: [
      { keynote: 'I Think', sources: ['BB-p126', 'BOC-chart'], context: 'Macrocosmic/Microcosmic chart micro keynote (Personality — Presence); BOC-chart Base 5 keynote line' },
      { keynote: 'I Communicate', sources: ['BB-p130'], context: 'Personality Crystal — The Personality' },
    ],
    resolution: null,
    resolutionNote: 'NONE — both attested; preserved as CONFLICT (SOURCE_MATRIX.md C-M3)',
  }, CLAIM_STATUS.CONFLICT, 'BB-p126 + BOC-chart vs BB-p130'),
]);

/* ============================ 9. seeded registry (canon-registry idiom) ============================
 *
 * seedChainsColorsCanon(registry) registers the Turn-10 BB/BOC entries into a
 * CanonRegistry (engine/canon-registry.js) WITHOUT editing that module — the
 * orchestrator wires this seed into the shared registry. Concepts are
 * namespaced (`BB:`/`BOC:`) so they can never collide with the dimension-canon
 * seeds. Conflicts C13/C14 are registered as first-class CONFLICT entries.
 */
export function seedChainsColorsCanon(registry = new CanonRegistry()) {
  for (const [dimension, chain] of Object.entries(DIMENSION_CHAINS)) {
    registry.register({
      concept: `BB:chain:${dimension}`,
      canonicalWording: chain.macroChain.map((s) => s.value).join(' / '),
      sourceLocation: 'BB-p126 (docs/corpus/black-book-chains-colors.md §1)',
      dimension,
      coordinateLevel: 'dimension',
      status: CLAIM_STATUS.SOURCE_STATEMENT,
      computationalInterpretation: 'per-dimension PERSPECTIVE chain (author Turn-10): how this dimension sees the chain in relation to the others — not an absolute ordering',
      conflicts: dimension === 'Being'
        ? [{ kind: 'blank-cell', conflictId: 'C17', note: '"Matter is" printed with empty predicate cell (BB-p126); second attestation BB-p130 "Matter is." — never filled' }]
        : [],
    });
  }
  registry.register({
    concept: 'BB:ordinal-perspective:Being',
    canonicalWording: 'One. Being / Two. Movement / Three. Space / Four. Design / Five. Evolution',
    sourceLocation: 'BB-p127 (corpus doc §2)',
    dimension: 'Being',
    coordinateLevel: 'dimension',
    status: CLAIM_STATUS.SOURCE_STATEMENT,
    computationalInterpretation: "how Being sees itself in relation to the whole; other dimensions' ordinal perspectives unattested (null, never guessed)",
  });
  for (const [condition, condClaim] of Object.entries({
    preBigBang: THREE_CONDITIONS.preBigBang,
    singularity: THREE_CONDITIONS.singularity,
    postBigBang: THREE_CONDITIONS.postBigBang,
  })) {
    registry.register({
      concept: `BB:three-conditions:${condition}`,
      canonicalWording: `${condClaim.value.heading}  ${condClaim.value.formula}`,
      sourceLocation: 'BB-p129 (corpus doc §4)',
      coordinateLevel: 'condition',
      status: CLAIM_STATUS.SOURCE_STATEMENT,
      computationalInterpretation: `dimensional count: ${JSON.stringify(THREE_CONDITIONS.dimensionalCount.value)} (pre=2, singularity=4, post=5); Space exists only post-Big-Bang (supports SpaceModel.B; SpaceModel.A remains represented)`,
    });
  }
  for (const [key, crystal] of Object.entries(CRYSTALS_AND_MONOPOLE)) {
    registry.register({
      concept: `BB:${key}`,
      canonicalWording: `${crystal.value.name} — ${crystal.value.role}. "${crystal.value.description}" ${crystal.value.location}`,
      sourceLocation: 'BB-p130 (corpus doc §5)',
      coordinateLevel: 'crystal',
      status: CLAIM_STATUS.SOURCE_STATEMENT,
      computationalInterpretation: 'crystal/monopole layer: binary manifestations carry chain keynotes (I Communicate / I Remember / I Am / I Design / I Create) — see KEYNOTE_CONFLICTS C13/C14',
    });
  }
  for (const entry of COLOR_TABLE.entries) {
    registry.register({
      concept: `BOC:color:${entry.value.n}`,
      canonicalWording: `COLOR ${entry.value.n} ${entry.value.response} (${entry.value.mode.join(' / ')}) — ${entry.value.binary}`,
      sourceLocation: 'BOC-chart COLOR table (corpus doc §6)',
      coordinateLevel: 'color',
      status: CLAIM_STATUS.SOURCE_STATEMENT,
      computationalInterpretation: 'colors are motivation (author Turn-10); recursion Line → Color → Tone → Base',
    });
  }
  for (const entry of TONE_TABLE.entries) {
    registry.register({
      concept: `BOC:tone:${entry.value.n}`,
      canonicalWording: `TONE ${entry.value.n} ${entry.value.theme.printed} — ${entry.value.department} — ${entry.value.binary}`,
      sourceLocation: 'BOC-chart TONE table (corpus doc §6)',
      coordinateLevel: 'tone',
      status: CLAIM_STATUS.SOURCE_STATEMENT,
      computationalInterpretation: 'tone = sound substructure (side label SOUND); departments keyed to tone number — separate architecture from SENSE_DIMENSIONS, no merging',
    });
  }
  for (const entry of BASE_TABLE.entries) {
    registry.register({
      concept: `BOC:base:${entry.value.n}`,
      canonicalWording: `Base ${entry.value.n} ${entry.value.name} — ${entry.value.keynoteLine}`,
      sourceLocation: 'BOC-chart BASE table (corpus doc §6)',
      dimension: entry.value.dimension,
      coordinateLevel: 'base',
      status: CLAIM_STATUS.SOURCE_STATEMENT,
      computationalInterpretation: 'base senses agree with SENSE_DIMENSIONS / intake.js — agreement noted, not merged',
    });
  }
  for (const conflict of KEYNOTE_CONFLICTS) {
    registry.register({
      concept: `BB:${conflict.value.id}`,
      canonicalWording: conflict.value.topic,
      sourceLocation: conflict.source,
      status: CLAIM_STATUS.CONFLICT,
      conflicts: conflict.value.attestations.map((a) => ({
        kind: 'double-attested-keynote',
        keynote: a.keynote,
        sources: a.sources,
        context: a.context,
      })),
      computationalInterpretation: conflict.value.resolutionNote,
    });
  }
  return registry;
}

/** A ready-seeded registry of the Turn-10 BB/BOC entries (5 chains + 1 ordinal + 3 conditions + 3 crystals + 6 colors + 6 tones + 5 bases + 2 conflicts = 31). */
export const CHAINS_COLORS_REGISTRY = seedChainsColorsCanon();

