// Pure Synthia Automata — state-space: dimension canon (handoff 06_DIMENSION_CANON.json)
//
// VERBATIM PORT of Synthia OS Canonical Integration Handoff /
// 06_DIMENSION_CANON.json ("handoff-v1"), with each entry claim-wrapped via
// claim-status.js. Policy from the source file: "Represent first; compare
// second; test third; canonize last." — the same rule stated in
// docs/SOURCE_MATRIX.md.
//
// Reconciliation rules (docs/HANDOFF_INTEGRATION.md):
//   - where the handoff canon AGREES with our constants (dimension names,
//     sense map) it is noted in CANON_AGREEMENTS;
//   - where it CONFLICTS (chain semantics vs DIMENSION_CHAINS, seedGate
//     attestation) a CONFLICT claim is recorded in CANON_CONFLICTS —
//     our constants in constants.js / dimensions.js are NOT overwritten.

import { claim, CLAIM_STATUS } from './claim-status.js';
import { DIMENSIONS, DIMENSION_META } from './constants.js';
import { DIMENSION_CHAINS } from './dimensions.js';
import { SENSE_DIMENSIONS } from './primitive-dimensions.js';

const CANON_SOURCE = 'Synthia_OS_Canonical_Integration_Handoff/06_DIMENSION_CANON.json (handoff-v1)';

// The five source chains, verbatim from 06_DIMENSION_CANON.json. These are the
// GGM crystal chains — the same chains cited per-row in SENSE_DIMENSIONS
// (primitive-dimensions.js) and in SOURCE_MATRIX.md row E1.
export const CANON_DIMENSION_CHAINS = deepFreeze({
  Movement: ['Energy', 'Creation', 'Seeing', 'Landscape', 'Environment'],
  Evolution: ['Gravity', 'Memory', 'Taste', 'Love', 'Light'],
  Being: ['Matter', 'Touch', 'Sex', 'Survival'],
  Design: ['Structure', 'Progress', 'Smell', 'Life', 'Art'],
  Space: ['Form', 'Illusion', 'Hearing', 'Music', 'Freedom'],
});

export const CANON_DIMENSION_SENSES = deepFreeze({
  Movement: 'Seeing',
  Evolution: 'Taste',
  Being: 'Touch',
  Design: 'Smell',
  Space: 'Hearing',
});

// Space keeps BOTH source/model interpretations (contract §5). Neither is
// canonized until the source canon / experiments select a model.
export const SPACE_ROLE_MODELS = deepFreeze({
  A: {
    id: 'space-first-class',
    status: 'SOURCE_MODEL',
    description: 'Space is represented as a named fifth perspective.',
  },
  B: {
    id: 'space-emergent',
    status: 'SOURCE_MODEL_CONFLICT',
    description: 'Space is treated as a condition/integration resulting from interaction of four fields.',
  },
});

// The handoff canon's dimension table, each entry claim-wrapped.
// Movement/Evolution/Being/Design: SOURCE_STATEMENT (chain + sense attested in
// GGM §1a/§1c — same warrant as SENSE_DIMENSIONS).
// Space: the JSON's raw source_status is SOURCE_STATEMENT_WITH_ROLE_CONFLICT;
// the claim carries CONFLICT (a source statement whose role the source itself
// disputes), with the raw status preserved on the value and both role models
// as evidence. resolveDimension never silently picks a Space role.
export const DIMENSION_CANON = deepFreeze({
  version: 'handoff-v1',
  policy: 'Represent first; compare second; test third; canonize last.',
  dimensions: {
    Movement: claim(
      { source_status: 'SOURCE_STATEMENT', chain: CANON_DIMENSION_CHAINS.Movement, sense: 'Seeing' },
      { status: CLAIM_STATUS.SOURCE_STATEMENT, source: `${CANON_SOURCE} dimensions.Movement (GGM §1a [L672-674] chain)` },
    ),
    Evolution: claim(
      { source_status: 'SOURCE_STATEMENT', chain: CANON_DIMENSION_CHAINS.Evolution, sense: 'Taste' },
      { status: CLAIM_STATUS.SOURCE_STATEMENT, source: `${CANON_SOURCE} dimensions.Evolution (GGM §1a [L643-645] chain)` },
    ),
    Being: claim(
      { source_status: 'SOURCE_STATEMENT', chain: CANON_DIMENSION_CHAINS.Being, sense: 'Touch' },
      { status: CLAIM_STATUS.SOURCE_STATEMENT, source: `${CANON_SOURCE} dimensions.Being (GGM §1a [L656-658] chain)` },
    ),
    Design: claim(
      { source_status: 'SOURCE_STATEMENT', chain: CANON_DIMENSION_CHAINS.Design, sense: 'Smell' },
      { status: CLAIM_STATUS.SOURCE_STATEMENT, source: `${CANON_SOURCE} dimensions.Design (GGM §1a [L659-661] chain)` },
    ),
    Space: claim(
      {
        source_status: 'SOURCE_STATEMENT_WITH_ROLE_CONFLICT',
        chain: CANON_DIMENSION_CHAINS.Space,
        sense: 'Hearing',
        role_models: [SPACE_ROLE_MODELS.A, SPACE_ROLE_MODELS.B],
      },
      {
        status: CLAIM_STATUS.CONFLICT,
        source: `${CANON_SOURCE} dimensions.Space (GGM §1a [L66-76] chain vs [L6-8, L103-106] emergent-condition passages; SOURCE_MATRIX.md C-M1)`,
        evidence: { roleModels: [SPACE_ROLE_MODELS.A, SPACE_ROLE_MODELS.B], conflictId: 'C-M1' },
      },
    ),
  },
  anchors: [
    claim(
      { subject: 'Progress', dimension: 'Design', status: 'SOURCE_STATEMENT', reason: 'Progress occurs in the Design chain.' },
      { status: CLAIM_STATUS.SOURCE_STATEMENT, source: `${CANON_SOURCE} anchors[0] (Design chain: Structure=Progress=Smell=Life=Art)` },
    ),
    claim(
      { subject: 'Z -> Progress', dimension: 'Design', status: 'USER_CONFIRMED_SOURCE_CLAIM', reason: 'Keep as a user-confirmed correspondence pending exact source-location capture.' },
      { status: CLAIM_STATUS.PROJECT_HYPOTHESIS, source: `${CANON_SOURCE} anchors[1]`, hypothesisId: 'H-canon-Z-progress', confidence: null, evidence: { rawStatus: 'USER_CONFIRMED_SOURCE_CLAIM', note: 'user-confirmed, exact source location not yet captured — held at hypothesis until anchored' } },
    ),
  ],
  candidate_hypotheses: [
    claim(
      {
        id: 'H-F4',
        status: 'PROJECT_HYPOTHESIS',
        mapping: { stop: 'Movement', fricative: 'Evolution', vowel: 'Being', nasal: 'Space', 'liquid/glide/affricate': 'Design' },
      },
      {
        status: CLAIM_STATUS.PROJECT_HYPOTHESIS,
        source: `${CANON_SOURCE} candidate_hypotheses[0]`,
        hypothesisId: 'H-F4',
        evidence: { matches: 'src/state-space/primitive-dimensions.js MANNER_DIMENSION (hypothesis H-F4) — agreement noted' },
      },
    ),
  ],
  controls: [
    claim({ id: 'alphabet-modulo', status: 'CONTROL_ONLY' }, { status: CLAIM_STATUS.CONTROL_ONLY, source: `${CANON_SOURCE} controls[0]` }),
    claim({ id: 'random-dimension-permutation', status: 'CONTROL_ONLY' }, { status: CLAIM_STATUS.CONTROL_ONLY, source: `${CANON_SOURCE} controls[1]` }),
    claim({ id: 'shuffled-dimension-mapping', status: 'CONTROL_ONLY' }, { status: CLAIM_STATUS.CONTROL_ONLY, source: `${CANON_SOURCE} controls[2]` }),
  ],
  promotion_rule: deepFreeze({
    from: 'PROJECT_HYPOTHESIS',
    to: 'EMPIRICALLY_SUPPORTED',
    requires: [
      'pre-registered mapping',
      'held-out test',
      'random/shuffled/modulo controls',
      'ablation',
      'reproducible derivations',
      'non-regression on canonical runtime',
    ],
  }),
});

/* ------------------------- reconciliation with our constants -------------------------
 * Agreements and conflicts are recorded, never merged destructively. */

const CANON_SENSE_KEYS = deepFreeze({ Seeing: 'see', Taste: 'taste', Touch: 'touch', Smell: 'smell', Hearing: 'hear' });

export const CANON_AGREEMENTS = deepFreeze([
  {
    topic: 'dimension vocabulary',
    note: 'canon dimension names === constants.js DIMENSIONS',
    holds: DIMENSIONS.every((d) => Object.hasOwn(DIMENSION_CANON.dimensions, d)),
  },
  {
    topic: 'sense <-> dimension map',
    note: 'canon senses (Seeing->Movement ... Hearing->Space) === SENSE_DIMENSIONS === engine/intake.js five mechanical senses',
    holds: Object.entries(CANON_DIMENSION_SENSES).every(
      ([dim, sense]) => SENSE_DIMENSIONS.senses[CANON_SENSE_KEYS[sense]]?.dimension === dim,
    ),
  },
  {
    topic: 'H-F4 phoneme->dimension mapping',
    note: 'canon candidate_hypotheses[0].mapping === MANNER_DIMENSION.map (primitive-dimensions.js), both PROJECT_HYPOTHESIS',
    holds: true, // verified by test/canon.test.mjs against MANNER_DIMENSION.map
  },
  {
    topic: 'Space role conflict',
    note: 'canon role_models A/B === SOURCE_MATRIX.md conflict C-M1 === questions.js OQ-3 (Space discrepancy); kept open everywhere',
    holds: true,
  },
]);

export const CANON_CONFLICTS = deepFreeze([
  claim(
    {
      id: 'CANON-CONFLICT-chains',
      topic: 'dimension "chain" semantics',
      positionA: { side: 'handoff canon', value: CANON_DIMENSION_CHAINS, warrant: 'GGM crystal chains (Energy=Creation=Seeing=...)' },
      positionB: { side: 'pure-synthia-automata', value: DIMENSION_CHAINS, warrant: 'IMPLEMENTATION_CONTRACT.md:101 behavioral micro-programs (wait/prepare/move/transition); corpus attestation not found (MAPPING_AUDIT.md §2.8)' },
      resolution: 'NONE — both preserved; the words "chain"/"ladder" denote different artifacts in the two codebases',
    },
    { status: CLAIM_STATUS.CONFLICT, source: '06_DIMENSION_CANON.json chains vs src/state-space/dimensions.js DIMENSION_CHAINS (MAPPING_AUDIT.md §2.8 row)', evidence: { auditRow: 'dimensions.js:7-13' } },
  ),
  claim(
    {
      id: 'CANON-CONFLICT-seedGates',
      topic: 'seed gates per dimension',
      positionA: { side: 'handoff canon', value: null, warrant: '06_DIMENSION_CANON.json is silent on gate->dimension seeding' },
      positionB: { side: 'pure-synthia-automata', value: { Movement: 1, Evolution: 2, Being: 6, Design: 14, Space: 20 }, warrant: 'DIMENSION_META.seedGate; only gate 1 -> Movement is corpus-attested (GGM [L3016-3017]); 2/6/14/20 unattested IMPLEMENTATION_CHOICE, exposed via dimension-router.js:81 (MAPPING_AUDIT.md §2.1 + §5.2 #7)' },
      resolution: 'NONE — canon silence does not attest our seedGates; gates 2/6/14/20 remain unattested, constants untouched',
    },
    { status: CLAIM_STATUS.CONFLICT, source: 'MAPPING_AUDIT.md §2.1 constants.js:19-23 + handoff canon (silent)', evidence: { auditRow: 'constants.js:19-23' } },
  ),
  claim(
    {
      id: 'CANON-CONFLICT-letter-addressing',
      topic: 'alphabet index -> gate/dimension modulo mapping',
      positionA: { side: 'handoff contract §1', value: 'any gate = index % 64 style rule is CONTROL_ONLY, never canonical ontology' },
      positionB: { side: 'pure-synthia-automata', value: 'letters.js:43-53 candidateAddressFor + planetaryDimension = DIMENSIONS[index % 5]', warrant: 'labeled PROJECT_HYPOTHESIS (H3) comment-only (MAPPING_AUDIT.md §3a); runtime value bare' },
      resolution: 'NONE — the handoff tag CONTROL_ONLY is STRICTER than our H3 label for the same code; recorded as an ingestion warning, code unchanged',
    },
    { status: CLAIM_STATUS.CONFLICT, source: '05_STATE_SPACE_REPAIR_CONTRACT.md §1 vs letters.js:43-53 (MAPPING_AUDIT.md §2.3/§3a)', evidence: { auditRow: 'letters.js:43-53' } },
  ),
]);

function deepFreeze(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    for (const v of Object.values(x)) deepFreeze(v);
    Object.freeze(x);
  }
  return x;
}

