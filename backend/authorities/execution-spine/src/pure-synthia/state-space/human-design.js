// Pure Synthia Automata — state-space: Human Design calculation engine
// Ported from combined_agent_os_v2(3).zip / "Kimi_Agent_Human Design Agent Builder"
// /app/src/lib/humanDesign.ts (86KB, TS) — mechanical TS->JS port (types stripped,
// logic kept). Provenance and cross-checks against our own tables are recorded in
// the HD_PROVENANCE / HD_GATE_BINARY_CONFLICTS / HD_GATE_CENTER_VARIANTS section at
// the bottom of this file: where the donor disagrees with src/merged/kingwen.js or
// src/merged/centers-channels.js, OURS stays primary and the donor variant is
// preserved as a first-class CONFLICT claim — never silently overwritten, never
// silently dropped (handoff 04_conflicts_quarantine/CONFLICTS.md).
//
// Defect fixes applied during the port (documented, behavior-affecting):
//   F1. calculateHumanDesign used date.setHours() (LOCAL time) while getJulianDay
//       reads UTC fields — chart depended on the machine timezone. Fixed to
//       setUTCHours() so the result is timezone-deterministic.
// Donor-internal inconsistency (kept as-is, recorded as a conflict variant):
//   F2. GATE_WHEEL code anchor is 58.0 deg (longitudeToHD subtracts 58), while the
//       donor's own header comment claims gate 41 sits at ~311.75 deg tropical, and
//       SynthAi MandalaGeometry.cs derives a 46.75 deg start. All three anchors are
//       registered in HD_WHEEL_ANCHOR_VARIANTS; the ported code keeps the donor's
//       executable anchor (58.0).
//
// Determinism: pure functions of their arguments; no wall-clock, no randomness
// (caller supplies the birth Date).


// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS & WHEEL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** The 64 gates in their counter-clockwise order on the Rave Mandala.
 *  Gate 41 sits at 0° Aquarius (ecliptic longitude ≈311.75° tropical).
 *  Each gate spans 5.625° of arc.
 */
export const GATE_WHEEL = [
  41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3,
  27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56,
  31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50,
  28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60,
];

/** HD substructure granularities in degrees */
const DEG_PER_GATE = 360 / 64;        // 5.625°
const DEG_PER_LINE = DEG_PER_GATE / 6; // 0.9375°
const DEG_PER_COLOR = DEG_PER_LINE / 6; // 0.15625°
const DEG_PER_TONE = DEG_PER_COLOR / 6; // 0.026041666...°
const DEG_PER_BASE = DEG_PER_TONE / 6;  // ~0.004340278°

/** Gate-to-center mapping */
export const GATE_CENTER = {
  1: "G", 2: "G", 3: "Sacral", 4: "Ajna", 5: "Sacral", 6: "Solar Plexus",
  7: "G", 8: "Throat", 9: "Sacral", 10: "G", 11: "Ajna", 12: "Throat",
  13: "G", 14: "Sacral", 15: "G", 16: "Throat", 17: "Ajna", 18: "Spleen",
  19: "Root", 20: "Throat", 21: "Heart", 22: "Throat", 23: "Throat",
  24: "Ajna", 25: "G", 26: "Heart", 27: "Sacral", 28: "Spleen",
  29: "Sacral", 30: "Solar Plexus", 31: "Throat", 32: "Spleen",
  33: "Throat", 34: "Sacral", 35: "Throat", 36: "Solar Plexus",
  37: "Solar Plexus", 38: "Root", 39: "Solar Plexus", 40: "Heart",
  41: "Root", 42: "Sacral", 43: "Ajna", 44: "Spleen", 45: "Throat",
  46: "G", 47: "Ajna", 48: "Spleen", 49: "Solar Plexus", 50: "Spleen",
  51: "Heart", 52: "Root", 53: "Root", 54: "Root", 55: "Solar Plexus",
  56: "Throat", 57: "Spleen", 58: "Root", 59: "Sacral", 60: "Root",
  61: "Head", 62: "Throat", 63: "Head", 64: "Head",
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETE 64-GATE DATABASE (from Ra's Line Companion + Amino codex)
// ═══════════════════════════════════════════════════════════════════════════════

export const GATES = {
  1: {
    number: 1, name: "The Creative", chineseName: "乾 Qian", center: "G", circuit: "Individual",
    aminoAcid: "Met", element: "Fire", binary: "111111", organ: "Heart", pressure: "Will",
    theme: "Self-Expression / Mutation",
    lines: [
      { line: 1, name: "Creation is independent of will", exalted: "Moon", detriment: "Uranus", keynote: "Time is everything. Patience is a virtue and revolution a vice." },
      { line: 2, name: "Love is light", exalted: "Venus", detriment: "Mars", keynote: "Beauty is in the eye of the beholder." },
      { line: 3, name: "The energy to sustain creative work", exalted: "Mars", detriment: "Earth", keynote: "Trial and error. Material forces can disrupt creativity." },
      { line: 4, name: "Aloneness as the medium of creativity", exalted: "Earth", detriment: "Jupiter", keynote: "Creativity must develop outside of influence." },
      { line: 5, name: "The energy to attract society", exalted: "Mars", detriment: "Uranus", keynote: "The assumption of talent. Eccentricity can handicap endurance." },
      { line: 6, name: "Objectivity", exalted: "Earth", detriment: "Pluto", keynote: "Clear assessment of creative value. Subjective appraisal leads to disappointment." },
    ],
  },
  2: {
    number: 2, name: "The Receptive", chineseName: "坤 Kun", center: "G", circuit: "Individual",
    aminoAcid: "Ile", element: "Earth", binary: "000000", organ: "Liver", pressure: "Heart",
    theme: "Direction / Receptivity",
    lines: [
      { line: 1, name: "Intuition", exalted: "Venus", detriment: "Mars", keynote: "Sensitivity to disharmony. Aesthetics guide direction." },
      { line: 2, name: "Genius", exalted: "Saturn", detriment: "Mars", keynote: "Unconscious alignment of stimulus and response. The natural." },
      { line: 3, name: "Patience", exalted: "Jupiter", detriment: "Uranus", keynote: "Dedication to a lifetime of receptivity. Trial and error in direction." },
      { line: 4, name: "Secretiveness", exalted: "Venus", detriment: "Mars", keynote: "Discretion preserves harmony. Loose lips sink ships." },
      { line: 5, name: "Intelligent application", exalted: "Mercury", detriment: "Earth", keynote: "The strategist. Reasoned management of resources." },
      { line: 6, name: "Fixation", exalted: "Mercury", detriment: "Saturn", keynote: "Unable to see the whole picture. Security may distort awareness." },
    ],
  },
  3: {
    number: 3, name: "Difficulty at the Beginning", chineseName: "屯 Zhun", center: "Sacral", circuit: "Individual",
    aminoAcid: "Leu", element: "Water", binary: "100010", organ: "Sacrum", pressure: "Mind",
    theme: "Innovation / Ordering",
    lines: [
      { line: 1, name: "Synthesis", exalted: "Jupiter", detriment: "Mars", keynote: "Confusion is natural. Life will explain itself." },
      { line: 2, name: "Immaturity", exalted: "Mars", detriment: "Uranus", keynote: "The unrestrained acceptance of guidance." },
      { line: 3, name: "Survival", exalted: "Venus", detriment: "Pluto", keynote: "Innate knowing of what is sterile and fertile." },
      { line: 4, name: "Charisma", exalted: "Neptune", detriment: "Mars", keynote: "Innate quality which attracts valued guidance." },
      { line: 5, name: "Victimization", exalted: "Mars", detriment: "Earth", keynote: "Confusion gets victimized by those who think they can order it." },
      { line: 6, name: "Surrender", exalted: "Sun", detriment: "Pluto", keynote: "The ultimate maturity to recognize when struggle is futile." },
    ],
  },
  4: {
    number: 4, name: "Youthful Folly", chineseName: "蒙 Meng", center: "Ajna", circuit: "Collective",
    aminoAcid: "Phe", element: "Air", binary: "010001", organ: "Ajna", pressure: "Mind",
    theme: "Formulization / Answers",
    lines: [
      { line: 1, name: "Pleasure", exalted: "Moon", detriment: "Earth", keynote: "Perfect timing. The instinct to know when pleasure is rewarded." },
      { line: 2, name: "Acceptance", exalted: "Moon", detriment: "Mars", keynote: "Tolerance and suspension of judgment." },
      { line: 3, name: "Irresponsibility", exalted: "Venus", detriment: "Pluto", keynote: "Where art is more valued than the artist." },
      { line: 4, name: "The Liar", exalted: "Sun", detriment: "Saturn", keynote: "Role playing as an art form. Fantasy nurtures purpose." },
      { line: 5, name: "Seduction", exalted: "Jupiter", detriment: "Pluto", keynote: "Universal answers require energy. The money lenders." },
      { line: 6, name: "Excess", exalted: "Mercury", detriment: "Mars", keynote: "Repeated abuse of norms. The answer doesn't matter, life matters." },
    ],
  },
  5: {
    number: 5, name: "Waiting", chineseName: "需 Xu", center: "Sacral", circuit: "Collective",
    aminoAcid: "Ser", element: "Wood", binary: "111010", organ: "Stomach", pressure: "Heart",
    theme: "Fixed Rhythms / Patterns",
    lines: [
      { line: 1, name: "Perseverance", exalted: "Mars", detriment: "Earth", keynote: "If the captain must, he goes down with the ship." },
      { line: 2, name: "Inner Peace", exalted: "Venus", detriment: "Pluto", keynote: "Maintaining composure through idealizing tranquility." },
      { line: 3, name: "Compulsiveness", exalted: "Neptune", detriment: "Moon", keynote: "Imagination limits negative effects. Unable to surrender." },
      { line: 4, name: "The Hunter", exalted: "Uranus", detriment: "Sun", keynote: "Waiting as guarantee of survival. Creative genius in passivity." },
      { line: 5, name: "Joy", exalted: "Pluto", detriment: "Pluto", keynote: "Waiting as an aspect of enlightenment. To remain calm is the ultimate aesthetic." },
      { line: 6, name: "Yielding", exalted: "Neptune", detriment: null, keynote: "Waiting is never free from pressure. Growth through the unexpected." },
    ],
  },
  6: {
    number: 6, name: "Conflict", chineseName: "讼 Song", center: "Solar Plexus", circuit: "Tribal",
    aminoAcid: "Tyr", element: "Metal", binary: "010111", organ: "Solar Plexus", pressure: "Heart",
    theme: "Friction / Intimacy",
    lines: [
      { line: 1, name: " Retreat", exalted: "Jupiter", detriment: "Saturn", keynote: "The need to withdraw from conflict in order to preserve identity." },
      { line: 2, name: "The Guerrilla", exalted: "Mars", detriment: "Moon", keynote: "The turning of the other cheek." },
      { line: 3, name: " The Oral Blaster", exalted: "Earth", detriment: "Neptune", keynote: "The energy to burst through hostility." },
      { line: 4, name: "The Peacemaker", exalted: "Sun", detriment: "Uranus", keynote: "The power to resolve conflict through mutual understanding." },
      { line: 5, name: "Arbitration", exalted: "Mercury", detriment: "Pluto", keynote: "The ability to negotiate and bring about peace." },
      { line: 6, name: "The Bodhisattva", exalted: "Saturn", detriment: "Venus", keynote: "The example of self-sacrifice that inspires transcendence." },
    ],
  },
  7: {
    number: 7, name: "The Army", chineseName: "师 Shi", center: "G", circuit: "Collective",
    aminoAcid: "Gly", element: "Earth", binary: "010000", organ: "G Center", pressure: "Will",
    theme: "Role of the Self / Direction",
    lines: [
      { line: 1, name: "The need for authority", exalted: "Moon", detriment: "Mars", keynote: "Democracy fails without leadership." },
      { line: 2, name: "The demagogue", exalted: "Mercury", detriment: "Saturn", keynote: "The power to influence without responsibility." },
      { line: 3, name: "The anarchist", exalted: "Uranus", detriment: "Pluto", keynote: "The refusal to follow any authority." },
      { line: 4, name: "The abdicator", exalted: "Earth", detriment: "Neptune", keynote: "The refusal to accept the responsibility of leadership." },
      { line: 5, name: "The general", exalted: "Mars", detriment: "Venus", keynote: "The ability to lead and direct." },
      { line: 6, name: "The administrator", exalted: "Jupiter", detriment: "Sun", keynote: "The wisdom to manage resources." },
    ],
  },
  8: {
    number: 8, name: "Holding Together", chineseName: "比 Bi", center: "Throat", circuit: "Tribal",
    aminoAcid: "Ala", element: "Water", binary: "000010", organ: "Throat", pressure: "Heart",
    theme: "Contribution / One-ness",
    lines: [
      { line: 1, name: "Honesty", exalted: "Pluto", detriment: "Mercury", keynote: "The quality of truth." },
      { line: 2, name: "The grinch", exalted: "Venus", detriment: "Jupiter", keynote: "The refusal to contribute." },
      { line: 3, name: "The partygoer", exalted: "Saturn", detriment: "Moon", keynote: "The love of communion." },
      { line: 4, name: "Respect", exalted: "Sun", detriment: "Mars", keynote: "The recognition of the value of others." },
      { line: 5, name: "Dharma", exalted: "Uranus", detriment: "Neptune", keynote: "The material contribution as a path to liberation." },
      { line: 6, name: "Communion", exalted: "Earth", detriment: "Pluto", keynote: "The quality of contribution." },
    ],
  },
  9: {
    number: 9, name: "Small Taming", chineseName: "小畜 Xiao Chu", center: "Sacral", circuit: "Collective",
    aminoAcid: "Val", element: "Fire", binary: "111011", organ: "Sacrum", pressure: "Mind",
    theme: "Focus / Concentration",
    lines: [
      { line: 1, name: "Sagacity", exalted: "Jupiter", detriment: "Mercury", keynote: "The ability to focus on the trivial." },
      { line: 2, name: "Misery loves company", exalted: "Venus", detriment: "Mars", keynote: "The ability to share bad luck." },
      { line: 3, name: "The straw that broke the camel's back", exalted: "Saturn", detriment: "Moon", keynote: "The power to discern the critical detail." },
      { line: 4, name: "The seducer", exalted: "Uranus", detriment: "Sun", keynote: "The ability to influence through focus." },
      { line: 5, name: "The faith healer", exalted: "Neptune", detriment: "Pluto", keynote: "The power of concentrated belief." },
      { line: 6, name: "The bulldozer", exalted: "Mars", detriment: "Earth", keynote: "The power to penetrate despite resistance." },
    ],
  },
  10: {
    number: 10, name: "Treading", chineseName: "履 Lu", center: "G", circuit: "Tribal",
    aminoAcid: "Thr", element: "Metal", binary: "110111", organ: "G Center", pressure: "Will",
    theme: "Behavior / Self-Love",
    lines: [
      { line: 1, name: "Modesty", exalted: "Moon", detriment: "Mercury", keynote: "The right action at the right time." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Saturn", keynote: "The avoidance of behavior that brings conflict." },
      { line: 3, name: "The martyr", exalted: "Mars", detriment: "Jupiter", keynote: "The sacrifice of self for the sake of others." },
      { line: 4, name: "The opportunist", exalted: "Sun", detriment: "Neptune", keynote: "The ability to take advantage of behavior." },
      { line: 5, name: "The dragon slayer", exalted: "Uranus", detriment: "Pluto", keynote: "The courage to confront the unacceptable." },
      { line: 6, name: "The role model", exalted: "Earth", detriment: "Venus", keynote: "The ultimate expression of behavior." },
    ],
  },
  11: {
    number: 11, name: "Peace", chineseName: "泰 Tai", center: "Ajna", circuit: "Collective",
    aminoAcid: "Asp", element: "Wood", binary: "111000", organ: "Ajna", pressure: "Mind",
    theme: "Ideas / Inner Truth",
    lines: [
      { line: 1, name: "Attunement", exalted: "Jupiter", detriment: "Saturn", keynote: "The ability to sense the right idea." },
      { line: 2, name: "Rigidity", exalted: "Mars", detriment: "Uranus", keynote: "The fixed idea." },
      { line: 3, name: "The dreamer", exalted: "Neptune", detriment: "Pluto", keynote: "The power of imagination." },
      { line: 4, name: "The teacher", exalted: "Sun", detriment: "Moon", keynote: "The ability to communicate ideas." },
      { line: 5, name: "The philosopher", exalted: "Mercury", detriment: "Venus", keynote: "The love of wisdom." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Mars", keynote: "The acceptance of limitations." },
    ],
  },
  12: {
    number: 12, name: "Standstill", chineseName: "否 Pi", center: "Throat", circuit: "Tribal",
    aminoAcid: "Glu", element: "Earth", binary: "000111", organ: "Throat", pressure: "Heart",
    theme: "Caution / Standstill",
    lines: [
      { line: 1, name: "The monk", exalted: "Moon", detriment: "Jupiter", keynote: "The withdrawal from activity." },
      { line: 2, name: "The purist", exalted: "Venus", detriment: "Mars", keynote: "The refusal to compromise." },
      { line: 3, name: "The accuser", exalted: "Saturn", detriment: "Neptune", keynote: "The projection of blame." },
      { line: 4, name: "The prophet", exalted: "Uranus", detriment: "Sun", keynote: "The ability to foresee stagnation." },
      { line: 5, name: "The pragmatist", exalted: "Mercury", detriment: "Pluto", keynote: "The acceptance of standstill." },
      { line: 6, name: "The pessimist", exalted: "Earth", detriment: "Mars", keynote: "The expectation of failure." },
    ],
  },
  13: {
    number: 13, name: "Fellowship", chineseName: "同人 Tong Ren", center: "G", circuit: "Individual",
    aminoAcid: "Asn", element: "Fire", binary: "101111", organ: "G Center", pressure: "Will",
    theme: "Listener / The Witness",
    lines: [
      { line: 1, name: "Empathy", exalted: "Moon", detriment: "Mercury", keynote: "The ability to feel what others feel." },
      { line: 2, name: "The bigot", exalted: "Mars", detriment: "Saturn", keynote: "The refusal to listen." },
      { line: 3, name: "The pessimist", exalted: "Jupiter", detriment: "Uranus", keynote: "The expectation of betrayal." },
      { line: 4, name: "The fatigued", exalted: "Sun", detriment: "Neptune", keynote: "The exhaustion from listening." },
      { line: 5, name: "The saviour", exalted: "Venus", detriment: "Pluto", keynote: "The desire to rescue." },
      { line: 6, name: "The optimist", exalted: "Earth", detriment: "Mars", keynote: "The expectation of fellowship." },
    ],
  },
  14: {
    number: 14, name: "Great Possession", chineseName: "大有 Da You", center: "Sacral", circuit: "Collective",
    aminoAcid: "Gln", element: "Air", binary: "111101", organ: "Sacrum", pressure: "Mind",
    theme: "Power Skills / Resources",
    lines: [
      { line: 1, name: "Money isn't everything", exalted: "Jupiter", detriment: "Saturn", keynote: "The recognition that resources are more than material." },
      { line: 2, name: "Management", exalted: "Mercury", detriment: "Mars", keynote: "The ability to allocate resources." },
      { line: 3, name: "The miser", exalted: "Venus", detriment: "Moon", keynote: "The hoarding of resources." },
      { line: 4, name: "The commander", exalted: "Sun", detriment: "Uranus", keynote: "The ability to direct resources." },
      { line: 5, name: "The liquidiser", exalted: "Neptune", detriment: "Pluto", keynote: "The ability to convert resources." },
      { line: 6, name: "The wallflower", exalted: "Earth", detriment: "Jupiter", keynote: "The refusal to use resources." },
    ],
  },
  15: {
    number: 15, name: "Modesty", chineseName: "谦 Qian", center: "G", circuit: "Collective",
    aminoAcid: "Lys", element: "Earth", binary: "001000", organ: "G Center", pressure: "Heart",
    theme: "Extremes / Rhythm",
    lines: [
      { line: 1, name: "The egoist", exalted: "Moon", detriment: "Mercury", keynote: "The need for extremes." },
      { line: 2, name: "The discriminator", exalted: "Venus", detriment: "Saturn", keynote: "The ability to choose the extreme." },
      { line: 3, name: "The moderate", exalted: "Mars", detriment: "Jupiter", keynote: "The avoidance of extremes." },
      { line: 4, name: "Thealpha&omega", exalted: "Sun", detriment: "Neptune", keynote: "The acceptance of all extremes." },
      { line: 5, name: "Theslave", exalted: "Uranus", detriment: "Pluto", keynote: "The submission to extremes." },
      { line: 6, name: "The recluse", exalted: "Earth", detriment: "Mars", keynote: "The withdrawal from extremes." },
    ],
  },
  16: {
    number: 16, name: "Enthusiasm", chineseName: "豫 Yu", center: "Throat", circuit: "Tribal",
    aminoAcid: "His", element: "Thunder", binary: "000100", organ: "Sacrum", pressure: "Mind",
    theme: "Skills / Enthusiasm",
    lines: [
      { line: 1, name: "The violinist", exalted: "Jupiter", detriment: "Saturn", keynote: "The love of skill." },
      { line: 2, name: "The cynic", exalted: "Mars", detriment: "Venus", keynote: "The distrust of enthusiasm." },
      { line: 3, name: "The independen", exalted: "Uranus", detriment: "Pluto", keynote: "The refusal to follow." },
      { line: 4, name: "The leader", exalted: "Sun", detriment: "Moon", keynote: "The ability to lead through skill." },
      { line: 5, name: "The achiever", exalted: "Mercury", detriment: "Neptune", keynote: "The drive for mastery." },
      { line: 6, name: "The shyster", exalted: "Earth", detriment: "Jupiter", keynote: "The manipulation of enthusiasm." },
    ],
  },
  17: {
    number: 17, name: "Following", chineseName: "随 Sui", center: "Ajna", circuit: "Collective",
    aminoAcid: "Arg", element: "Lake", binary: "100110", organ: "Ajna", pressure: "Mind",
    theme: "Opinions / Views",
    lines: [
      { line: 1, name: "The receiver", exalted: "Moon", detriment: "Mercury", keynote: "The openness to opinion." },
      { line: 2, name: "The administrator", exalted: "Saturn", detriment: "Mars", keynote: "The ability to organize opinions." },
      { line: 3, name: "The opportunist", exalted: "Jupiter", detriment: "Uranus", keynote: "The use of opinion for gain." },
      { line: 4, name: "The analyst", exalted: "Sun", detriment: "Neptune", keynote: "The ability to deconstruct opinion." },
      { line: 5, name: "The speaker", exalted: "Venus", detriment: "Pluto", keynote: "The ability to articulate opinion." },
      { line: 6, name: "The collectivist", exalted: "Earth", detriment: "Jupiter", keynote: "The synthesis of opinion." },
    ],
  },
  18: {
    number: 18, name: "Decay", chineseName: "蛊 Gu", center: "Spleen", circuit: "Collective",
    aminoAcid: "Trp", element: "Mountain", binary: "011001", organ: "Spleen", pressure: "Heart",
    theme: "Correction / Integrity",
    lines: [
      { line: 1, name: "Conservatism", exalted: "Moon", detriment: "Saturn", keynote: "The resistance to change." },
      { line: 2, name: "The abdicator", exalted: "Venus", detriment: "Mars", keynote: "The refusal to correct." },
      { line: 3, name: "The zealot", exalted: "Jupiter", detriment: "Uranus", keynote: "The fanatical correction." },
      { line: 4, name: "The incompetent", exalted: "Sun", detriment: "Neptune", keynote: "The inability to correct." },
      { line: 5, name: "The psychiatrist", exalted: "Mercury", detriment: "Pluto", keynote: "The correction of the mind." },
      { line: 6, name: "The destroyer", exalted: "Earth", detriment: "Jupiter", keynote: "The destruction of the old." },
    ],
  },
  19: {
    number: 19, name: "Approach", chineseName: "临 Lin", center: "Root", circuit: "Tribal",
    aminoAcid: "Cys", element: "Earth", binary: "110000", organ: "Solar Plexus", pressure: "Heart",
    theme: "Wanting / Need",
    lines: [
      { line: 1, name: "The broker", exalted: "Jupiter", detriment: "Saturn", keynote: "The ability to mediate need." },
      { line: 2, name: "The vendor", exalted: "Mercury", detriment: "Mars", keynote: "The selling of need." },
      { line: 3, name: "The collectivist", exalted: "Venus", detriment: "Moon", keynote: "The sharing of need." },
      { line: 4, name: "The fanatic", exalted: "Uranus", detriment: "Sun", keynote: "The obsession with need." },
      { line: 5, name: "The negotiator", exalted: "Neptune", detriment: "Pluto", keynote: "The ability to bargain." },
      { line: 6, name: "The recluse", exalted: "Earth", detriment: "Mars", keynote: "The denial of need." },
    ],
  },
  20: {
    number: 20, name: "Contemplation", chineseName: "观 Guan", center: "Throat", circuit: "Integration",
    aminoAcid: "Arg", element: "Wind", binary: "000011", organ: "Throat", pressure: "Mind",
    theme: "Now / Awareness",
    lines: [
      { line: 1, name: "The hermit", exalted: "Moon", detriment: "Mercury", keynote: "The withdrawal into the now." },
      { line: 2, name: "The pragmatist", exalted: "Venus", detriment: "Saturn", keynote: "The acceptance of what is." },
      { line: 3, name: "The experimentalist", exalted: "Mars", detriment: "Jupiter", keynote: "The trial of the now." },
      { line: 4, name: "The Buddha", exalted: "Sun", detriment: "Neptune", keynote: "The transcendence of time." },
      { line: 5, name: "The realist", exalted: "Uranus", detriment: "Pluto", keynote: "The acceptance of limitation." },
      { line: 6, name: "The wizard", exalted: "Earth", detriment: "Mars", keynote: "The transcendence of the now." },
    ],
  },
  21: {
    number: 21, name: "Biting Through", chineseName: "噬嗑 Shi He", center: "Heart", circuit: "Tribal",
    aminoAcid: "Ser", element: "Fire", binary: "100101", organ: "Heart", pressure: "Will",
    theme: "Control / The Ego",
    lines: [
      { line: 1, name: "The wolf", exalted: "Jupiter", detriment: "Saturn", keynote: "The drive to control." },
      { line: 2, name: "The diplomat", exalted: "Venus", detriment: "Mars", keynote: "The gentle control." },
      { line: 3, name: "The anchorite", exalted: "Mercury", detriment: "Uranus", keynote: "The control of self." },
      { line: 4, name: "The dictator", exalted: "Sun", detriment: "Neptune", keynote: "The absolute control." },
      { line: 5, name: "The executive", exalted: "Pluto", detriment: "Moon", keynote: "The efficient control." },
      { line: 6, name: "The separatist", exalted: "Earth", detriment: "Jupiter", keynote: "The refusal of control." },
    ],
  },
  22: {
    number: 22, name: "Grace", chineseName: "贲 Bi", center: "Throat", circuit: "Individual",
    aminoAcid: "Leu", element: "Mountain", binary: "101001", organ: "Solar Plexus", pressure: "Heart",
    theme: "Openness / Grace",
    lines: [
      { line: 1, name: "The second-class citizen", exalted: "Moon", detriment: "Mercury", keynote: "The acceptance of limitation." },
      { line: 2, name: "The mystic", exalted: "Neptune", detriment: "Saturn", keynote: "The power of silence." },
      { line: 3, name: "The enchanter", exalted: "Venus", detriment: "Mars", keynote: "The ability to seduce." },
      { line: 4, name: "The sensualist", exalted: "Jupiter", detriment: "Uranus", keynote: "The love of beauty." },
      { line: 5, name: "The director", exalted: "Sun", detriment: "Pluto", keynote: "The control of grace." },
      { line: 6, name: "The gentility", exalted: "Earth", detriment: "Mars", keynote: "The refinement of openness." },
    ],
  },
  23: {
    number: 23, name: "Splitting Apart", chineseName: "剥 Bo", center: "Throat", circuit: "Tribal",
    aminoAcid: "Ile", element: "Mountain", binary: "000001", organ: "Throat", pressure: "Mind",
    theme: "Assimilation / Explanation",
    lines: [
      { line: 1, name: "The boy scout", exalted: "Jupiter", detriment: "Saturn", keynote: "The naive explanation." },
      { line: 2, name: "The teacher", exalted: "Mercury", detriment: "Mars", keynote: "The ability to explain." },
      { line: 3, name: "The anarchist", exalted: "Uranus", detriment: "Pluto", keynote: "The refusal to explain." },
      { line: 4, name: "The assistant", exalted: "Venus", detriment: "Moon", keynote: "The support of explanation." },
      { line: 5, name: "The guru", exalted: "Sun", detriment: "Neptune", keynote: "The enlightened explanation." },
      { line: 6, name: "The windbag", exalted: "Earth", detriment: "Jupiter", keynote: "The excessive explanation." },
    ],
  },
  24: {
    number: 24, name: "Return", chineseName: "复 Fu", center: "Ajna", circuit: "Individual",
    aminoAcid: "Met", element: "Thunder", binary: "100000", organ: "Ajna", pressure: "Mind",
    theme: "Rationalization / Return",
    lines: [
      { line: 1, name: "The pilgrim", exalted: "Moon", detriment: "Mercury", keynote: "The search for meaning." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Saturn", keynote: "The withdrawal from rationalization." },
      { line: 3, name: "The addict", exalted: "Mars", detriment: "Jupiter", keynote: "The obsessive return." },
      { line: 4, name: "The opportunist", exalted: "Sun", detriment: "Uranus", keynote: "The use of return." },
      { line: 5, name: "The fatalist", exalted: "Neptune", detriment: "Pluto", keynote: "The acceptance of return." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Mars", keynote: "The pragmatic return." },
    ],
  },
  25: {
    number: 25, name: "Innocence", chineseName: "无妄 Wu Wang", center: "G", circuit: "Individual",
    aminoAcid: "Phe", element: "Heaven", binary: "100111", organ: "Heart", pressure: "Will",
    theme: "Spirit of Self / Universal Love",
    lines: [
      { line: 1, name: "The exorcist", exalted: "Jupiter", detriment: "Saturn", keynote: "The removal of distortion." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Mars", keynote: "The withdrawal from conditioning." },
      { line: 3, name: "The survivor", exalted: "Uranus", detriment: "Pluto", keynote: "The ability to withstand." },
      { line: 4, name: "The addict", exalted: "Sun", detriment: "Neptune", keynote: "The obsession with innocence." },
      { line: 5, name: "The pragmatist", exalted: "Mercury", detriment: "Moon", keynote: "The practical application of innocence." },
      { line: 6, name: "The fool", exalted: "Earth", detriment: "Jupiter", keynote: "The naive acceptance." },
    ],
  },
  26: {
    number: 26, name: "Great Taming", chineseName: "大畜 Da Chu", center: "Heart", circuit: "Tribal",
    aminoAcid: "Tyr", element: "Mountain", binary: "110001", organ: "Heart", pressure: "Will",
    theme: "The Egoist / Trickster",
    lines: [
      { line: 1, name: "A bird in the hand", exalted: "Moon", detriment: "Mercury", keynote: "The satisfaction with what one has." },
      { line: 2, name: "The strategist", exalted: "Venus", detriment: "Saturn", keynote: "The ability to plan." },
      { line: 3, name: "The adventurer", exalted: "Mars", detriment: "Uranus", keynote: "The risk-taking ego." },
      { line: 4, name: "The critic", exalted: "Sun", detriment: "Neptune", keynote: "The judgment of ego." },
      { line: 5, name: "The salesman", exalted: "Jupiter", detriment: "Pluto", keynote: "The ability to sell the ego." },
      { line: 6, name: "The authority", exalted: "Earth", detriment: "Mars", keynote: "The ultimate expression of ego." },
    ],
  },
  27: {
    number: 27, name: "Nourishment", chineseName: "颐 Yi", center: "Sacral", circuit: "Tribal",
    aminoAcid: "Gly", element: "Mountain", binary: "100001", organ: "Sacrum", pressure: "Heart",
    theme: "Caring / Selfishness",
    lines: [
      { line: 1, name: "The selfish", exalted: "Jupiter", detriment: "Saturn", keynote: "The need for self-care." },
      { line: 2, name: "The altruist", exalted: "Venus", detriment: "Mars", keynote: "The care for others." },
      { line: 3, name: "The hedonist", exalted: "Mercury", detriment: "Uranus", keynote: "The pursuit of pleasure." },
      { line: 4, name: "The administrator", exalted: "Sun", detriment: "Moon", keynote: "The management of care." },
      { line: 5, name: "The collectivist", exalted: "Neptune", detriment: "Pluto", keynote: "The shared care." },
      { line: 6, name: "The utilitarian", exalted: "Earth", detriment: "Jupiter", keynote: "The practical care." },
    ],
  },
  28: {
    number: 28, name: "Great Excess", chineseName: "大过 Da Guo", center: "Spleen", circuit: "Individual",
    aminoAcid: "Ala", element: "Lake", binary: "011110", organ: "Spleen", pressure: "Heart",
    theme: "Game Player / Risk",
    lines: [
      { line: 1, name: "The gambler", exalted: "Moon", detriment: "Mercury", keynote: "The willingness to risk." },
      { line: 2, name: "The daredevil", exalted: "Mars", detriment: "Saturn", keynote: "The thrill of danger." },
      { line: 3, name: "The adventurer", exalted: "Jupiter", detriment: "Uranus", keynote: "The explorer of risk." },
      { line: 4, name: "The alchemist", exalted: "Sun", detriment: "Neptune", keynote: "The transformation of risk." },
      { line: 5, name: "The survivor", exalted: "Venus", detriment: "Pluto", keynote: "The endurance through risk." },
      { line: 6, name: "The blaze of glory", exalted: "Earth", detriment: "Mars", keynote: "The ultimate risk." },
    ],
  },
  29: {
    number: 29, name: "The Abysmal", chineseName: "坎 Kan", center: "Sacral", circuit: "Collective",
    aminoAcid: "Val", element: "Water", binary: "010010", organ: "Sacrum", pressure: "Heart",
    theme: "Commitment / Perseverance",
    lines: [
      { line: 1, name: "The draftee", exalted: "Jupiter", detriment: "Saturn", keynote: "The reluctant commitment." },
      { line: 2, name: "The disciplinarian", exalted: "Venus", detriment: "Mars", keynote: "The structured commitment." },
      { line: 3, name: "The addict", exalted: "Mercury", detriment: "Uranus", keynote: "The obsessive commitment." },
      { line: 4, name: "The perfectionist", exalted: "Sun", detriment: "Moon", keynote: "The flawless commitment." },
      { line: 5, name: "The sensualist", exalted: "Neptune", detriment: "Pluto", keynote: "The pleasure of commitment." },
      { line: 6, name: "The escapee", exalted: "Earth", detriment: "Jupiter", keynote: "The refusal to commit." },
    ],
  },
  30: {
    number: 30, name: "The Clinging", chineseName: "离 Li", center: "Solar Plexus", circuit: "Individual",
    aminoAcid: "Thr", element: "Fire", binary: "101101", organ: "Solar Plexus", pressure: "Heart",
    theme: "Feelings / Desire",
    lines: [
      { line: 1, name: "The pragmatist", exalted: "Moon", detriment: "Mercury", keynote: "The acceptance of desire." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Saturn", keynote: "The withdrawal from desire." },
      { line: 3, name: "The experimentalist", exalted: "Mars", detriment: "Jupiter", keynote: "The trial of desire." },
      { line: 4, name: "The bon vivant", exalted: "Sun", detriment: "Uranus", keynote: "The enjoyment of desire." },
      { line: 5, name: "The accuser", exalted: "Pluto", detriment: "Neptune", keynote: "The blame of unfulfilled desire." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Mars", keynote: "The pragmatic desire." },
    ],
  },
  31: {
    number: 31, name: "Influence", chineseName: "咸 Xian", center: "Throat", circuit: "Collective",
    aminoAcid: "Asp", element: "Lake", binary: "001110", organ: "Throat", pressure: "Will",
    theme: "Leading / Influence",
    lines: [
      { line: 1, name: "The confesso", exalted: "Moon", detriment: "Mercury", keynote: "The admission of influence." },
      { line: 2, name: "The influencer", exalted: "Venus", detriment: "Saturn", keynote: "The natural leader." },
      { line: 3, name: "The manipulator", exalted: "Mars", detriment: "Uranus", keynote: "The covert leader." },
      { line: 4, name: "The evangelist", exalted: "Jupiter", detriment: "Neptune", keynote: "The missionary leader." },
      { line: 5, name: "The general", exalted: "Sun", detriment: "Pluto", keynote: "The commander." },
      { line: 6, name: "The philosopher", exalted: "Earth", detriment: "Mars", keynote: "The thought leader." },
    ],
  },
  32: {
    number: 32, name: "Duration", chineseName: "恒 Heng", center: "Spleen", circuit: "Tribal",
    aminoAcid: "Glu", element: "Thunder", binary: "011100", organ: "Spleen", pressure: "Heart",
    theme: "Continuity / Instinct",
    lines: [
      { line: 1, name: "The conservative", exalted: "Moon", detriment: "Saturn", keynote: "The preservation of continuity." },
      { line: 2, name: "The mediator", exalted: "Venus", detriment: "Mars", keynote: "The negotiation of continuity." },
      { line: 3, name: "The pragmatist", exalted: "Mercury", detriment: "Jupiter", keynote: "The practical continuity." },
      { line: 4, name: "The opportunist", exalted: "Uranus", detriment: "Sun", keynote: "The use of continuity." },
      { line: 5, name: "The strategist", exalted: "Neptune", detriment: "Pluto", keynote: "The planned continuity." },
      { line: 6, name: "The destroyer", exalted: "Earth", detriment: "Mars", keynote: "The end of continuity." },
    ],
  },
  33: {
    number: 33, name: "Retreat", chineseName: "遁 Dun", center: "Throat", circuit: "Collective",
    aminoAcid: "Asn", element: "Heaven", binary: "001111", organ: "Throat", pressure: "Mind",
    theme: "Privacy / Retreat",
    lines: [
      { line: 1, name: "The hermit", exalted: "Moon", detriment: "Mercury", keynote: "The withdrawal into privacy." },
      { line: 2, name: "The snob", exalted: "Venus", detriment: "Saturn", keynote: "The elitist retreat." },
      { line: 3, name: "The adventurer", exalted: "Mars", detriment: "Uranus", keynote: "The retreat into experience." },
      { line: 4, name: "The teacher", exalted: "Jupiter", detriment: "Neptune", keynote: "The retreat into knowledge." },
      { line: 5, name: "The recluse", exalted: "Sun", detriment: "Pluto", keynote: "The absolute retreat." },
      { line: 6, name: "The switcher", exalted: "Earth", detriment: "Mars", keynote: "The changing of privacy." },
    ],
  },
  34: {
    number: 34, name: "Great Power", chineseName: "大壮 Da Zhuang", center: "Sacral", circuit: "Integration",
    aminoAcid: "Gln", element: "Thunder", binary: "111100", organ: "Sacrum", pressure: "Will",
    theme: "Power / The Generator",
    lines: [
      { line: 1, name: "The bully", exalted: "Moon", detriment: "Mercury", keynote: "The misuse of power." },
      { line: 2, name: "The communicator", exalted: "Venus", detriment: "Saturn", keynote: "The expression of power." },
      { line: 3, name: "The explorer", exalted: "Mars", detriment: "Jupiter", keynote: "The adventurous power." },
      { line: 4, name: "The strategist", exalted: "Uranus", detriment: "Sun", keynote: "The planned power." },
      { line: 5, name: "The commander", exalted: "Neptune", detriment: "Pluto", keynote: "The directed power." },
      { line: 6, name: "The adept", exalted: "Earth", detriment: "Mars", keynote: "The mastery of power." },
    ],
  },
  35: {
    number: 35, name: "Progress", chineseName: "晋 Jin", center: "Throat", circuit: "Collective",
    aminoAcid: "Lys", element: "Fire", binary: "000101", organ: "Solar Plexus", pressure: "Heart",
    theme: "Change / Progress",
    lines: [
      { line: 1, name: "The collector", exalted: "Jupiter", detriment: "Saturn", keynote: "The accumulation of experience." },
      { line: 2, name: "The communicator", exalted: "Venus", detriment: "Mars", keynote: "The sharing of experience." },
      { line: 3, name: "The experimenter", exalted: "Mercury", detriment: "Uranus", keynote: "The trial of change." },
      { line: 4, name: "The opportunist", exalted: "Sun", detriment: "Neptune", keynote: "The use of change." },
      { line: 5, name: "The philanthropist", exalted: "Moon", detriment: "Pluto", keynote: "The generous change." },
      { line: 6, name: "The adventurer", exalted: "Earth", detriment: "Jupiter", keynote: "The restless change." },
    ],
  },
  36: {
    number: 36, name: "The Darkening", chineseName: "明夷 Ming Yi", center: "Solar Plexus", circuit: "Individual",
    aminoAcid: "His", element: "Earth", binary: "101000", organ: "Solar Plexus", pressure: "Heart",
    theme: "Crisis / Growth",
    lines: [
      { line: 1, name: "The spokesperson", exalted: "Moon", detriment: "Mercury", keynote: "The communication of crisis." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Saturn", keynote: "The withdrawal from crisis." },
      { line: 3, name: "The activist", exalted: "Mars", detriment: "Jupiter", keynote: "The confrontation of crisis." },
      { line: 4, name: "The mediator", exalted: "Sun", detriment: "Uranus", keynote: "The resolution of crisis." },
      { line: 5, name: "The godfather", exalted: "Pluto", detriment: "Neptune", keynote: "The authority in crisis." },
      { line: 6, name: "The survivor", exalted: "Earth", detriment: "Mars", keynote: "The endurance of crisis." },
    ],
  },
  37: {
    number: 37, name: "The Family", chineseName: "家人 Jia Ren", center: "Solar Plexus", circuit: "Tribal",
    aminoAcid: "Arg", element: "Wind", binary: "101011", organ: "Solar Plexus", pressure: "Heart",
    theme: "Friendship / Community",
    lines: [
      { line: 1, name: "The father", exalted: "Moon", detriment: "Saturn", keynote: "The authoritative friend." },
      { line: 2, name: "The mother", exalted: "Venus", detriment: "Mars", keynote: "The nurturing friend." },
      { line: 3, name: "The outsider", exalted: "Uranus", detriment: "Jupiter", keynote: "The estranged friend." },
      { line: 4, name: "The mediator", exalted: "Mercury", detriment: "Neptune", keynote: "The peacemaking friend." },
      { line: 5, name: "The leader", exalted: "Sun", detriment: "Pluto", keynote: "The commanding friend." },
      { line: 6, name: "The teacher", exalted: "Earth", detriment: "Mars", keynote: "The instructing friend." },
    ],
  },
  38: {
    number: 38, name: "Opposition", chineseName: "睽 Kui", center: "Root", circuit: "Individual",
    aminoAcid: "Trp", element: "Fire", binary: "110101", organ: "Root", pressure: "Heart",
    theme: "The Fighter / Opposition",
    lines: [
      { line: 1, name: "The refuser", exalted: "Moon", detriment: "Mercury", keynote: "The rejection of opposition." },
      { line: 2, name: "The politician", exalted: "Venus", detriment: "Saturn", keynote: "The negotiation of opposition." },
      { line: 3, name: "The enthusiast", exalted: "Mars", detriment: "Uranus", keynote: "The embrace of opposition." },
      { line: 4, name: "The switcher", exalted: "Jupiter", detriment: "Neptune", keynote: "The changing of sides." },
      { line: 5, name: "The outsider", exalted: "Sun", detriment: "Pluto", keynote: "The permanent opposition." },
      { line: 6, name: "The reconciler", exalted: "Earth", detriment: "Mars", keynote: "The resolution of opposition." },
    ],
  },
  39: {
    number: 39, name: "Obstruction", chineseName: "蹇 Jian", center: "Root", circuit: "Individual",
    aminoAcid: "Cys", element: "Water", binary: "001010", organ: "Root", pressure: "Heart",
    theme: "Provocation / Challenge",
    lines: [
      { line: 1, name: "The dissembler", exalted: "Moon", detriment: "Saturn", keynote: "The hidden provocation." },
      { line: 2, name: "The confrontationalist", exalted: "Mars", detriment: "Venus", keynote: "The direct provocation." },
      { line: 3, name: "The diplomat", exalted: "Mercury", detriment: "Uranus", keynote: "The subtle provocation." },
      { line: 4, name: "The strategist", exalted: "Sun", detriment: "Neptune", keynote: "The planned provocation." },
      { line: 5, name: "The collectivist", exalted: "Jupiter", detriment: "Pluto", keynote: "The group provocation." },
      { line: 6, name: "The troubleshooter", exalted: "Earth", detriment: "Mars", keynote: "The resolution of provocation." },
    ],
  },
  40: {
    number: 40, name: "Deliverance", chineseName: "解 Jie", center: "Heart", circuit: "Tribal",
    aminoAcid: "Arg", element: "Thunder", binary: "010100", organ: "Heart", pressure: "Will",
    theme: "Aloneness / Deliverance",
    lines: [
      { line: 1, name: "The hermit", exalted: "Moon", detriment: "Mercury", keynote: "The withdrawal for deliverance." },
      { line: 2, name: "The exorcist", exalted: "Venus", detriment: "Saturn", keynote: "The removal of blockage." },
      { line: 3, name: "The pragmatist", exalted: "Mars", detriment: "Jupiter", keynote: "The practical deliverance." },
      { line: 4, name: "The organizer", exalted: "Sun", detriment: "Uranus", keynote: "The structured deliverance." },
      { line: 5, name: "The redeemer", exalted: "Neptune", detriment: "Pluto", keynote: "The spiritual deliverance." },
      { line: 6, name: "The deliverer", exalted: "Earth", detriment: "Mars", keynote: "The ultimate deliverance." },
    ],
  },
  41: {
    number: 41, name: "Decrease", chineseName: "损 Sun", center: "Root", circuit: "Collective",
    aminoAcid: "Ser", element: "Mountain", binary: "110010", organ: "Root", pressure: "Heart",
    theme: "Contraction / Fantasy",
    lines: [
      { line: 1, name: "The spender", exalted: "Moon", detriment: "Jupiter", keynote: "The reduction of resources." },
      { line: 2, name: "The borrower", exalted: "Venus", detriment: "Mars", keynote: "The use of others' resources." },
      { line: 3, name: "The miser", exalted: "Saturn", detriment: "Uranus", keynote: "The hoarding of resources." },
      { line: 4, name: "The student", exalted: "Mercury", detriment: "Neptune", keynote: "The reduction of knowing." },
      { line: 5, name: "The altruist", exalted: "Sun", detriment: "Pluto", keynote: "The generous decrease." },
      { line: 6, name: "The survivor", exalted: "Earth", detriment: "Mars", keynote: "The endurance through decrease." },
    ],
  },
  42: {
    number: 42, name: "Increase", chineseName: "益 Yi", center: "Sacral", circuit: "Collective",
    aminoAcid: "Leu", element: "Wind", binary: "011001", organ: "Root", pressure: "Heart",
    theme: "Growth / Expansion",
    lines: [
      { line: 1, name: "The collector", exalted: "Moon", detriment: "Saturn", keynote: "The accumulation of growth." },
      { line: 2, name: "The investor", exalted: "Venus", detriment: "Mars", keynote: "The allocation of growth." },
      { line: 3, name: "The gambler", exalted: "Mars", detriment: "Jupiter", keynote: "The risky growth." },
      { line: 4, name: "The coordinator", exalted: "Sun", detriment: "Uranus", keynote: "The organized growth." },
      { line: 5, name: "The pragmatist", exalted: "Mercury", detriment: "Neptune", keynote: "The practical growth." },
      { line: 6, name: "The evaluator", exalted: "Earth", detriment: "Pluto", keynote: "The assessment of growth." },
    ],
  },
  43: {
    number: 43, name: "Breakthrough", chineseName: "夬 Guai", center: "Ajna", circuit: "Individual",
    aminoAcid: "Ile", element: "Lake", binary: "111110", organ: "Ajna", pressure: "Mind",
    theme: "Insight / Breakthrough",
    lines: [
      { line: 1, name: "The prophet", exalted: "Moon", detriment: "Mercury", keynote: "The anticipation of breakthrough." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Saturn", keynote: "The withdrawal before breakthrough." },
      { line: 3, name: "The anarchist", exalted: "Mars", detriment: "Uranus", keynote: "The destructive breakthrough." },
      { line: 4, name: "The communicator", exalted: "Sun", detriment: "Neptune", keynote: "The sharing of insight." },
      { line: 5, name: "The saviour", exalted: "Jupiter", detriment: "Pluto", keynote: "The redemptive breakthrough." },
      { line: 6, name: "The manifesto", exalted: "Earth", detriment: "Mars", keynote: "The declaration of insight." },
    ],
  },
  44: {
    number: 44, name: "Coming to Meet", chineseName: "姤 Gou", center: "Spleen", circuit: "Tribal",
    aminoAcid: "Met", element: "Heaven", binary: "011111", organ: "Spleen", pressure: "Heart",
    theme: "Alertness / Meeting",
    lines: [
      { line: 1, name: "The vigilant", exalted: "Moon", detriment: "Saturn", keynote: "The watchful alertness." },
      { line: 2, name: "The seducer", exalted: "Venus", detriment: "Mars", keynote: "The attractive alertness." },
      { line: 3, name: "The assassin", exalted: "Mars", detriment: "Jupiter", keynote: "The predatory alertness." },
      { line: 4, name: "The opportunist", exalted: "Uranus", detriment: "Sun", keynote: "The timely alertness." },
      { line: 5, name: "The hunter", exalted: "Jupiter", detriment: "Neptune", keynote: "The pursuit of opportunity." },
      { line: 6, name: "The confessor", exalted: "Earth", detriment: "Pluto", keynote: "The honest alertness." },
    ],
  },
  45: {
    number: 45, name: "Gathering", chineseName: "萃 Cui", center: "Throat", circuit: "Tribal",
    aminoAcid: "Phe", element: "Lake", binary: "000110", organ: "Throat", pressure: "Will",
    theme: "Gathering / The King",
    lines: [
      { line: 1, name: "The chief", exalted: "Jupiter", detriment: "Saturn", keynote: "The leadership of gathering." },
      { line: 2, name: "The caretaker", exalted: "Venus", detriment: "Mars", keynote: "The nurturing gathering." },
      { line: 3, name: "The hoarder", exalted: "Mercury", detriment: "Uranus", keynote: "The accumulation of resources." },
      { line: 4, name: "The mediator", exalted: "Sun", detriment: "Neptune", keynote: "The negotiation of gathering." },
      { line: 5, name: "The benevolent", exalted: "Moon", detriment: "Pluto", keynote: "The generous gathering." },
      { line: 6, name: "The destroyer", exalted: "Earth", detriment: "Mars", keynote: "The dispersal of gathering." },
    ],
  },
  46: {
    number: 46, name: "Pushing Upward", chineseName: "升 Sheng", center: "G", circuit: "Individual",
    aminoAcid: "Tyr", element: "Earth", binary: "010110", organ: "G Center", pressure: "Will",
    theme: "Determination / Pushing Up",
    lines: [
      { line: 1, name: "The collector", exalted: "Moon", detriment: "Mercury", keynote: "The accumulation before ascent." },
      { line: 2, name: "The pragmatist", exalted: "Venus", detriment: "Saturn", keynote: "The practical ascent." },
      { line: 3, name: "The orator", exalted: "Mars", detriment: "Jupiter", keynote: "The persuasive ascent." },
      { line: 4, name: "The student", exalted: "Sun", detriment: "Uranus", keynote: "The learning ascent." },
      { line: 5, name: "The climber", exalted: "Neptune", detriment: "Pluto", keynote: "The ambitious ascent." },
      { line: 6, name: "The departed", exalted: "Earth", detriment: "Mars", keynote: "The transcendent ascent." },
    ],
  },
  47: {
    number: 47, name: "Oppression", chineseName: "困 Kun", center: "Ajna", circuit: "Collective",
    aminoAcid: "Gly", element: "Lake", binary: "010011", organ: "Ajna", pressure: "Mind",
    theme: "Transmutation / Realization",
    lines: [
      { line: 1, name: "The victim", exalted: "Moon", detriment: "Saturn", keynote: "The acceptance of oppression." },
      { line: 2, name: "The prisoner", exalted: "Venus", detriment: "Mars", keynote: "The confined realization." },
      { line: 3, name: "The architect", exalted: "Mercury", detriment: "Uranus", keynote: "The structural realization." },
      { line: 4, name: "The alchemist", exalted: "Sun", detriment: "Neptune", keynote: "The transformative realization." },
      { line: 5, name: "The historian", exalted: "Jupiter", detriment: "Pluto", keynote: "The retrospective realization." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Mars", keynote: "The pragmatic realization." },
    ],
  },
  48: {
    number: 48, name: "The Well", chineseName: "井 Jing", center: "Spleen", circuit: "Collective",
    aminoAcid: "Ala", element: "Water", binary: "011010", organ: "Spleen", pressure: "Heart",
    theme: "Depth / Solutions",
    lines: [
      { line: 1, name: "The inquisitor", exalted: "Moon", detriment: "Saturn", keynote: "The probing of depth." },
      { line: 2, name: "The collector", exalted: "Venus", detriment: "Mars", keynote: "The accumulation of solutions." },
      { line: 3, name: "The thinker", exalted: "Jupiter", detriment: "Uranus", keynote: "The contemplative solution." },
      { line: 4, name: "The teacher", exalted: "Sun", detriment: "Neptune", keynote: "The sharing of depth." },
      { line: 5, name: "The master", exalted: "Mercury", detriment: "Pluto", keynote: "The authoritative solution." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Jupiter", keynote: "The practical depth." },
    ],
  },
  49: {
    number: 49, name: "Revolution", chineseName: "革 Ge", center: "Solar Plexus", circuit: "Tribal",
    aminoAcid: "Val", element: "Lake", binary: "101110", organ: "Solar Plexus", pressure: "Heart",
    theme: "Principles / Revolution",
    lines: [
      { line: 1, name: "The idealist", exalted: "Moon", detriment: "Mercury", keynote: "The theoretical revolution." },
      { line: 2, name: "The pragmatist", exalted: "Venus", detriment: "Saturn", keynote: "The practical revolution." },
      { line: 3, name: "The anarchist", exalted: "Mars", detriment: "Jupiter", keynote: "The destructive revolution." },
      { line: 4, name: "The negotiator", exalted: "Sun", detriment: "Uranus", keynote: "The diplomatic revolution." },
      { line: 5, name: "The collectivist", exalted: "Jupiter", detriment: "Pluto", keynote: "The group revolution." },
      { line: 6, name: "The reactionary", exalted: "Earth", detriment: "Mars", keynote: "The conservative revolution." },
    ],
  },
  50: {
    number: 50, name: "The Cauldron", chineseName: "鼎 Ding", center: "Spleen", circuit: "Tribal",
    aminoAcid: "Thr", element: "Fire", binary: "011101", organ: "Spleen", pressure: "Heart",
    theme: "Values / The Law",
    lines: [
      { line: 1, name: "The cook", exalted: "Jupiter", detriment: "Saturn", keynote: "The preparation of values." },
      { line: 2, name: "The dissembler", exalted: "Venus", detriment: "Mars", keynote: "The hidden values." },
      { line: 3, name: "The addict", exalted: "Mercury", detriment: "Uranus", keynote: "The obsessive values." },
      { line: 4, name: "The mediator", exalted: "Sun", detriment: "Neptune", keynote: "The negotiation of values." },
      { line: 5, name: "The priest", exalted: "Moon", detriment: "Pluto", keynote: "The spiritual values." },
      { line: 6, name: "The destroyer", exalted: "Earth", detriment: "Jupiter", keynote: "The end of values." },
    ],
  },
  51: {
    number: 51, name: "The Arousing", chineseName: "震 Zhen", center: "Heart", circuit: "Individual",
    aminoAcid: "Asp", element: "Thunder", binary: "100100", organ: "Heart", pressure: "Will",
    theme: "Shock / Initiation",
    lines: [
      { line: 1, name: "The sentinel", exalted: "Moon", detriment: "Saturn", keynote: "The watchful shock." },
      { line: 2, name: "The monk", exalted: "Venus", detriment: "Mars", keynote: "The contemplative shock." },
      { line: 3, name: "The pursuer", exalted: "Mars", detriment: "Jupiter", keynote: "The active shock." },
      { line: 4, name: "The mediator", exalted: "Mercury", detriment: "Uranus", keynote: "The negotiation of shock." },
      { line: 5, name: "The thrill seeker", exalted: "Sun", detriment: "Pluto", keynote: "The love of shock." },
      { line: 6, name: "The fatalist", exalted: "Earth", detriment: "Neptune", keynote: "The acceptance of shock." },
    ],
  },
  52: {
    number: 52, name: "Keeping Still", chineseName: "艮 Gen", center: "Root", circuit: "Collective",
    aminoAcid: "Glu", element: "Mountain", binary: "001001", organ: "Root", pressure: "Heart",
    theme: "Stillness / Concentration",
    lines: [
      { line: 1, name: "The thinker", exalted: "Moon", detriment: "Mercury", keynote: "The contemplative stillness." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Saturn", keynote: "The withdrawal into stillness." },
      { line: 3, name: "The pragmatist", exalted: "Mars", detriment: "Jupiter", keynote: "The practical stillness." },
      { line: 4, name: "The mediator", exalted: "Sun", detriment: "Uranus", keynote: "The negotiation of stillness." },
      { line: 5, name: "The strategist", exalted: "Jupiter", detriment: "Pluto", keynote: "The planned stillness." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Mars", keynote: "The acceptance of limitation." },
    ],
  },
  53: {
    number: 53, name: "Development", chineseName: "渐 Jian", center: "Root", circuit: "Collective",
    aminoAcid: "Asn", element: "Wind", binary: "001011", organ: "Root", pressure: "Heart",
    theme: "Evolution / Beginning",
    lines: [
      { line: 1, name: "The pioneer", exalted: "Jupiter", detriment: "Saturn", keynote: "The initiation of development." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Mars", keynote: "The solitary development." },
      { line: 3, name: "The adventurer", exalted: "Mars", detriment: "Uranus", keynote: "The risky development." },
      { line: 4, name: "The opportunist", exalted: "Sun", detriment: "Neptune", keynote: "The use of development." },
      { line: 5, name: "The pragmatist", exalted: "Mercury", detriment: "Pluto", keynote: "The practical development." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Jupiter", keynote: "The acceptance of evolution." },
    ],
  },
  54: {
    number: 54, name: "The Marrying Maiden", chineseName: "归妹 Gui Mei", center: "Root", circuit: "Collective",
    aminoAcid: "Gln", element: "Thunder", binary: "110100", organ: "Root", pressure: "Heart",
    theme: "Ambition / Drive",
    lines: [
      { line: 1, name: "The influence", exalted: "Moon", detriment: "Mercury", keynote: "The guided ambition." },
      { line: 2, name: "The dissembler", exalted: "Venus", detriment: "Saturn", keynote: "The hidden ambition." },
      { line: 3, name: "The opportunist", exalted: "Mars", detriment: "Jupiter", keynote: "The use of ambition." },
      { line: 4, name: "The alpha&omega", exalted: "Sun", detriment: "Uranus", keynote: "The total ambition." },
      { line: 5, name: "The seducer", exalted: "Neptune", detriment: "Pluto", keynote: "The attractive ambition." },
      { line: 6, name: "The politician", exalted: "Earth", detriment: "Mars", keynote: "The strategic ambition." },
    ],
  },
  55: {
    number: 55, name: "Abundance", chineseName: "丰 Feng", center: "Solar Plexus", circuit: "Individual",
    aminoAcid: "Lys", element: "Thunder", binary: "101100", organ: "Solar Plexus", pressure: "Heart",
    theme: "Spirit / Abundance",
    lines: [
      { line: 1, name: "The merchant", exalted: "Moon", detriment: "Saturn", keynote: "The commercial spirit." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Mars", keynote: "The withdrawal from abundance." },
      { line: 3, name: "The experimenter", exalted: "Uranus", detriment: "Pluto", keynote: "The trial of spirit." },
      { line: 4, name: "The alchemist", exalted: "Sun", detriment: "Neptune", keynote: "The transformation of abundance." },
      { line: 5, name: "The benevolent", exalted: "Jupiter", detriment: "Mercury", keynote: "The generous spirit." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Mars", keynote: "The pragmatic abundance." },
    ],
  },
  56: {
    number: 56, name: "The Wanderer", chineseName: "旅 Lu", center: "Throat", circuit: "Collective",
    aminoAcid: "His", element: "Fire", binary: "001101", organ: "Throat", pressure: "Mind",
    theme: "Stimulation / Wanderer",
    lines: [
      { line: 1, name: "The novelty seeker", exalted: "Jupiter", detriment: "Saturn", keynote: "The love of the new." },
      { line: 2, name: "The pragmatist", exalted: "Venus", detriment: "Mars", keynote: "The practical travel." },
      { line: 3, name: "The adventurer", exalted: "Mars", detriment: "Uranus", keynote: "The risky travel." },
      { line: 4, name: "The student", exalted: "Mercury", detriment: "Neptune", keynote: "The learning travel." },
      { line: 5, name: "The sage", exalted: "Sun", detriment: "Pluto", keynote: "The wise travel." },
      { line: 6, name: "The exile", exalted: "Earth", detriment: "Jupiter", keynote: "The permanent travel." },
    ],
  },
  57: {
    number: 57, name: "The Gentle", chineseName: "巽 Xun", center: "Spleen", circuit: "Individual",
    aminoAcid: "Arg", element: "Wind", binary: "011011", organ: "Spleen", pressure: "Heart",
    theme: "Intuition / Clarity",
    lines: [
      { line: 1, name: "The confessor", exalted: "Moon", detriment: "Mercury", keynote: "The honest intuition." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Saturn", keynote: "The solitary intuition." },
      { line: 3, name: "The acupuncturist", exalted: "Mars", detriment: "Jupiter", keynote: "The precise intuition." },
      { line: 4, name: "The artist", exalted: "Sun", detriment: "Uranus", keynote: "The creative intuition." },
      { line: 5, name: "The utilitarian", exalted: "Jupiter", detriment: "Pluto", keynote: "The practical intuition." },
      { line: 6, name: "The utilitarian", exalted: "Earth", detriment: "Neptune", keynote: "The application of clarity." },
    ],
  },
  58: {
    number: 58, name: "The Joyous", chineseName: "兑 Dui", center: "Root", circuit: "Tribal",
    aminoAcid: "Trp", element: "Lake", binary: "110110", organ: "Root", pressure: "Heart",
    theme: "Joy / The Stimulator",
    lines: [
      { line: 1, name: "The inventor", exalted: "Moon", detriment: "Saturn", keynote: "The creation of joy." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Mars", keynote: "The solitary joy." },
      { line: 3, name: "The hedonist", exalted: "Mars", detriment: "Jupiter", keynote: "The pursuit of joy." },
      { line: 4, name: "The mediator", exalted: "Sun", detriment: "Uranus", keynote: "The sharing of joy." },
      { line: 5, name: "The sensualist", exalted: "Neptune", detriment: "Pluto", keynote: "The pleasure of joy." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Mars", keynote: "The acceptance of limitation." },
    ],
  },
  59: {
    number: 59, name: "Dispersion", chineseName: "涣 Huan", center: "Sacral", circuit: "Tribal",
    aminoAcid: "Cys", element: "Wind", binary: "010111", organ: "Sacrum", pressure: "Heart",
    theme: "Sexuality / Intimacy",
    lines: [
      { line: 1, name: "The libertine", exalted: "Moon", detriment: "Mercury", keynote: "The unrestrained sexuality." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Saturn", keynote: "The withdrawal from sexuality." },
      { line: 3, name: "The experimenter", exalted: "Mars", detriment: "Uranus", keynote: "The trial of sexuality." },
      { line: 4, name: "The bon vivant", exalted: "Jupiter", detriment: "Neptune", keynote: "The enjoyment of sexuality." },
      { line: 5, name: "The polygamist", exalted: "Sun", detriment: "Pluto", keynote: "The multiple intimacies." },
      { line: 6, name: "The puritan", exalted: "Earth", detriment: "Mars", keynote: "The restriction of sexuality." },
    ],
  },
  60: {
    number: 60, name: "Limitation", chineseName: "节 Jie", center: "Root", circuit: "Collective",
    aminoAcid: "Arg", element: "Water", binary: "110010", organ: "Root", pressure: "Heart",
    theme: "Limitation / Acceptance",
    lines: [
      { line: 1, name: "The acceptor", exalted: "Jupiter", detriment: "Saturn", keynote: "The embrace of limitation." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Mars", keynote: "The withdrawal from limitation." },
      { line: 3, name: "The pragmatist", exalted: "Mercury", detriment: "Uranus", keynote: "The practical limitation." },
      { line: 4, name: "The opportunist", exalted: "Sun", detriment: "Neptune", keynote: "The use of limitation." },
      { line: 5, name: "The mediator", exalted: "Moon", detriment: "Pluto", keynote: "The negotiation of limitation." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Jupiter", keynote: "The acceptance of reality." },
    ],
  },
  61: {
    number: 61, name: "Inner Truth", chineseName: "中孚 Zhong Fu", center: "Head", circuit: "Collective",
    aminoAcid: "Ser", element: "Wind", binary: "110011", organ: "Ajna", pressure: "Mind",
    theme: "Mystery / Inner Truth",
    lines: [
      { line: 1, name: "The listener", exalted: "Moon", detriment: "Saturn", keynote: "The receptivity to truth." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Mars", keynote: "The solitary truth." },
      { line: 3, name: "The believer", exalted: "Jupiter", detriment: "Uranus", keynote: "the faith in truth." },
      { line: 4, name: "The mediator", exalted: "Sun", detriment: "Neptune", keynote: "The negotiation of truth." },
      { line: 5, name: "The mystic", exalted: "Mercury", detriment: "Pluto", keynote: "The intuitive truth." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Mars", keynote: "The pragmatic truth." },
    ],
  },
  62: {
    number: 62, name: "Small Excess", chineseName: "小过 Xiao Guo", center: "Throat", circuit: "Collective",
    aminoAcid: "Leu", element: "Thunder", binary: "001100", organ: "Throat", pressure: "Mind",
    theme: "Detail / Caution",
    lines: [
      { line: 1, name: "The accountant", exalted: "Moon", detriment: "Mercury", keynote: "The precise detail." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Saturn", keynote: "The withdrawal from detail." },
      { line: 3, name: "The experimenter", exalted: "Mars", detriment: "Jupiter", keynote: "The trial of detail." },
      { line: 4, name: "The mediator", exalted: "Sun", detriment: "Uranus", keynote: "The negotiation of detail." },
      { line: 5, name: "The master", exalted: "Jupiter", detriment: "Pluto", keynote: "the authoritative detail." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Neptune", keynote: "The practical detail." },
    ],
  },
  63: {
    number: 63, name: "After Completion", chineseName: "既济 Ji Ji", center: "Head", circuit: "Collective",
    aminoAcid: "Ile", element: "Water", binary: "101010", organ: "Ajna", pressure: "Mind",
    theme: "Doubt / Completion",
    lines: [
      { line: 1, name: "The doubter", exalted: "Moon", detriment: "Saturn", keynote: "The suspicion of completion." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Mars", keynote: "The withdrawal after completion." },
      { line: 3, name: "The saboteur", exalted: "Mars", detriment: "Uranus", keynote: "The destruction of completion." },
      { line: 4, name: "The meditator", exalted: "Sun", detriment: "Neptune", keynote: "The contemplation of completion." },
      { line: 5, name: "The survivor", exalted: "Jupiter", detriment: "Pluto", keynote: "The endurance through completion." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Mercury", keynote: "The acceptance of imperfection." },
    ],
  },
  64: {
    number: 64, name: "Before Completion", chineseName: "未济 Wei Ji", center: "Head", circuit: "Tribal",
    aminoAcid: "Met", element: "Fire", binary: "010101", organ: "Ajna", pressure: "Mind",
    theme: "Confusion / Incompletion",
    lines: [
      { line: 1, name: "The dreamer", exalted: "Moon", detriment: "Saturn", keynote: "The vision of completion." },
      { line: 2, name: "The hermit", exalted: "Venus", detriment: "Mars", keynote: "The withdrawal before completion." },
      { line: 3, name: "The enthusiast", exalted: "Mars", detriment: "Jupiter", keynote: "The drive for completion." },
      { line: 4, name: "The mediator", exalted: "Sun", detriment: "Uranus", keynote: "The negotiation of completion." },
      { line: 5, name: "The achiever", exalted: "Neptune", detriment: "Pluto", keynote: "The attainment of completion." },
      { line: 6, name: "The realist", exalted: "Earth", detriment: "Mars", keynote: "The acceptance of incompletion." },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// BODY REGION MAPPING (from organism body.pdf)
// ═══════════════════════════════════════════════════════════════════════════════

export const GATE_BODY_REGION = {
  1: "head", 2: "head", 7: "head", 13: "head", 25: "head", 46: "head",
  8: "throat", 12: "throat", 16: "throat", 20: "throat", 22: "throat",
  23: "throat", 31: "throat", 33: "throat", 35: "throat", 43: "throat",
  45: "throat", 56: "throat", 62: "throat",
  21: "chest", 26: "chest", 40: "chest", 51: "chest",
  52: "spine",
  5: "sacral", 9: "sacral", 14: "sacral", 29: "sacral",
  34: "sacral", 42: "sacral",
  50: "pelvis",
  38: "legs", 39: "legs", 41: "legs", 53: "legs", 54: "legs",
};

// ═══════════════════════════════════════════════════════════════════════════════
// ASTRONOMICAL CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Julian Day calculation for a given date */
function getJulianDay(date) {
  const Y = date.getUTCFullYear();
  const M = date.getUTCMonth() + 1;
  const D = date.getUTCDate() + date.getUTCHours() / 24 + date.getUTCMinutes() / 1440 + date.getUTCSeconds() / 86400;
  const A = Math.floor((14 - M) / 12);
  const y = Y + 4800 - A;
  const m = M + 12 * A - 3;
  return D + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

/** Approximate solar tropical longitude using low-precision algorithm
 *  Accurate to ~0.01° — sufficient for HD gate/line calculation
 */
export function getSunLongitude(julianDay) {
  const n = julianDay - 2451545.0;
  const L0 = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * (Math.PI / 180);
  const lambda = (L0 + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360;
  return lambda < 0 ? lambda + 360 : lambda;
}

/** Approximate moon longitude — sufficient for HD calculations */
export function getMoonLongitude(julianDay) {
  const n = julianDay - 2451545.0;
  const L = (218.316 + 13.176396 * n) % 360;
  const M = (134.963 + 13.064993 * n) % 360;
  const F = (93.272 + 13.229350 * n) % 360;
  const Mrad = M * Math.PI / 180;
  const Frad = F * Math.PI / 180;
  const lambda = L + 6.289 * Math.sin(Mrad) + 1.274 * Math.sin(2 * Mrad - Frad) + 0.658 * Math.sin(2 * Mrad) + 0.214 * Math.sin(2 * Frad);
  return ((lambda % 360) + 360) % 360;
}

/** HD wheel position: gate, line, color, tone, base from ecliptic longitude */
export function longitudeToHD(longitude) {
  const normalized = ((longitude - 58.0) % 360 + 360) % 360;
  const gateIndex = Math.floor(normalized / DEG_PER_GATE);
  const gate = GATE_WHEEL[gateIndex % 64];
  const degInGate = normalized % DEG_PER_GATE;

  const line = Math.min(6, Math.floor(degInGate / DEG_PER_LINE) + 1);
  const degInLine = degInGate % DEG_PER_LINE;

  const color = Math.min(6, Math.floor(degInLine / DEG_PER_COLOR) + 1);
  const degInColor = degInLine % DEG_PER_COLOR;

  const tone = Math.min(6, Math.floor(degInColor / DEG_PER_TONE) + 1);
  const degInTone = degInColor % DEG_PER_TONE;

  const base = Math.min(5, Math.floor(degInTone / DEG_PER_BASE) + 1);

  return { gate, line, color, tone, base, degInGate, degInLine, degInColor };
}

/** Get zodiac sign and degree from longitude */
export function longitudeToZodiac(longitude) {
  const signs = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  const deg = (longitude % 360) / 30;
  const signIndex = Math.floor(deg);
  const d = (deg - signIndex) * 30;
  const degree = Math.floor(d);
  const minute = Math.floor((d - degree) * 60);
  const second = Math.floor(((d - degree) * 60 - minute) * 60);
  return { sign: signs[signIndex], degree, minute, second };
}

/** Calculate approximate node positions (true node approximation) */
function getNodeLongitude(julianDay) {
  const n = julianDay - 2451545.0;
  const omega = (125.04 - 0.052954 * n) % 360;
  const north = ((omega % 360) + 360) % 360;
  return { north, south: (north + 180) % 360 };
}

/** Quick planet longitude approximations for HD design date offset */
function getPlanetLongitude(planet, jd) {
  if (planet === "Sun") return getSunLongitude(jd);
  if (planet === "Moon") return getMoonLongitude(jd);

  // Approximate orbital periods and mean longitudes for 2000 epoch
  const data = {
    Mercury: { period: 87.97, epoch: 252.25 },
    Venus: { period: 224.70, epoch: 181.98 },
    Mars: { period: 686.98, epoch: 355.43 },
    Jupiter: { period: 4332.59, epoch: 34.35 },
    Saturn: { period: 10759.22, epoch: 50.08 },
    Uranus: { period: 30688.5, epoch: 314.55 },
    Neptune: { period: 60182, epoch: 304.35 },
    Pluto: { period: 90465, epoch: 238.93 },
  };

  if (planet === "Earth") {
    return (getSunLongitude(jd) + 180) % 360;
  }

  if (data[planet]) {
    const d = jd - 2451545.0;
    const lon = (data[planet].epoch + (d / data[planet].period) * 360) % 360;
    return (lon + 360) % 360;
  }

  if (planet === "North Node" || planet === "South Node") {
    const nodes = getNodeLongitude(jd);
    return planet === "North Node" ? nodes.north : nodes.south;
  }

  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CHART CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

export function calculateHumanDesign(
  birthDate,
  birthTime,
  _birthLocation
) {
  const [hours, minutes] = birthTime.split(":").map(Number);
  const date = new Date(birthDate);
  date.setUTCHours(hours, minutes, 0, 0); // F1 fix: was setHours (local time) — chart depended on machine timezone

  const jd = getJulianDay(date);

  // Human Design uses ~88° retrograde offset for the design date (pre-natal)
  // Simplified: design ≈ 3 lunar cycles (~88 days) before birth
  // Simplified: design ≈ 88 days before birth (approximate)
  const designOffsetDays = -88;
  const jdDesign = jd + designOffsetDays;

  // Calculate all 13 placements
  const planets = [
    "Sun", "Earth", "Moon", "North Node", "South Node",
    "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
    "Uranus", "Neptune", "Pluto",
  ];

  const placements = planets.map((planet) => {
    const lon = getPlanetLongitude(planet, jd);
    const hd = longitudeToHD(lon);
    const zod = longitudeToZodiac(lon);
    return {
      planet,
      gate: hd.gate,
      line: hd.line,
      color: hd.color,
      tone: hd.tone,
      base: hd.base,
      longitude: lon,
      zodiac: zod.sign,
      degree: zod.degree,
      minute: zod.minute,
      second: zod.second,
    };
  });

  // Design placements
  const designPlacements = planets.map((planet) => {
    const lon = getPlanetLongitude(planet, jdDesign);
    const hd = longitudeToHD(lon);
    const zod = longitudeToZodiac(lon);
    return {
      planet,
      gate: hd.gate,
      line: hd.line,
      color: hd.color,
      tone: hd.tone,
      base: hd.base,
      longitude: lon,
      zodiac: zod.sign,
      degree: zod.degree,
      minute: zod.minute,
      second: zod.second,
    };
  });

  // Conscious (Personality) key placements
  const consciousSun = placements.find((p) => p.planet === "Sun");
  const consciousEarth = placements.find((p) => p.planet === "Earth");
  const consciousMoon = placements.find((p) => p.planet === "Moon");

  // Design key placements
  const designSun = designPlacements.find((p) => p.planet === "Sun");
  const designEarth = designPlacements.find((p) => p.planet === "Earth");
  const designMoon = designPlacements.find((p) => p.planet === "Moon");

  // Profile = conscious sun line / design sun line
  const profile = `${consciousSun.line}/${designSun.line}`;

  // Collect all gates (conscious + design)
  const allGates = new Set();
  for (const p of placements) allGates.add(p.gate);
  for (const p of designPlacements) allGates.add(p.gate);

  // Determine defined centers
  const definedCenters = {
    Head: false, Ajna: false, Throat: false, G: false,
    Heart: false, "Solar Plexus": false, Sacral: false, Spleen: false, Root: false,
  };

  for (const gate of allGates) {
    const center = GATE_CENTER[gate];
    if (center) definedCenters[center] = true;
  }

  // Determine type
  const hasSacral = definedCenters.Sacral;
  const hasEmo = definedCenters["Solar Plexus"];
  const hasSpleen = definedCenters.Spleen;
  const hasHeart = definedCenters.Heart;
  const hasRoot = definedCenters.Root;
  const hasG = definedCenters.G;
  const hasThroat = definedCenters.Throat;

  let type;
  if (!hasSacral && !hasEmo && !hasSpleen && !hasHeart && !hasRoot && !hasG && !hasThroat) {
    type = "Reflector";
  } else if (hasSacral && hasThroat && (hasEmo || hasHeart || hasSacral)) {
    type = "Manifesting Generator";
  } else if (hasSacral) {
    type = "Generator";
  } else if (hasThroat && (hasHeart || hasEmo || hasRoot || hasSpleen)) {
    type = "Manifestor";
  } else {
    type = "Projector";
  }

  // Authority
  let authority;
  if (type === "Reflector") authority = "Lunar";
  else if (hasEmo) authority = "Emotional";
  else if (hasSacral) authority = "Sacral";
  else if (hasSpleen) authority = "Splenic";
  else if (hasHeart) authority = "Ego";
  else if (hasG && hasThroat) authority = "Self-Projected";
  else if (definedCenters.Ajna || definedCenters.Head) authority = "Mental";
  else authority = "Lunar";

  // Definition based on connected centers
  const definedCount = Object.values(definedCenters).filter(Boolean).length;
  let definition;
  if (definedCount === 0) definition = "No";
  else if (definedCount <= 2) definition = "Single";
  else if (definedCount <= 3) definition = "Split";
  else if (definedCount <= 5) definition = "Triple Split";
  else definition = "Quadruple";

  // Incarnation Cross (conscious sun gate + design sun gate)
  const crossGates = [consciousSun.gate, designSun.gate, consciousEarth.gate, designEarth.gate];
  const gateNames = crossGates.map((g) => GATES[g]?.name ?? `Gate ${g}`);
  const incarnationCross = `Cross of ${gateNames[0]} & ${gateNames[1]}`;

  // Variables (from gates 49, 54, 41, 52 / 48, 21, 55, 8)
  // Simplified: derive from profile and active gates
  const profileFirst = consciousSun.line;
  const variable = {
    digestion: profileFirst <= 2 ? "Cold" : "Hot",
    environment: profileFirst <= 3 ? "Natural" : "Urban",
    motivation: profileFirst <= 4 ? "Need" : "Desire",
    perspective: profileFirst <= 5 ? "Personal" : "Transpersonal",
  };

  return {
    type,
    authority,
    profile,
    definition,
    incarnationCross,
    variable,
    centers: definedCenters,
    channels: [], // Channels require exact connections; simplified for now
    placements: [...placements, ...designPlacements],
    consciousSun,
    consciousEarth,
    designSun,
    designEarth,
    consciousMoon,
    designMoon,
    nodes: {
      north: placements.find((p) => p.planet === "North Node"),
      south: placements.find((p) => p.planet === "South Node"),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT BLUEPRINT GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

const TYPE_ARCHETYPE = {
  Generator: { name: "Resonant Engine", purpose: "To respond to life and build sustainable energy through correct work" },
  "Manifesting Generator": { name: "Acceleration Matrix", purpose: "To find the fastest path and iterate through multiple passions" },
  Projector: { name: "Guidance Lens", purpose: "To see systems clearly and direct energy where it flows best" },
  Manifestor: { name: "Initiation Spark", purpose: "To catalyze change and birth new forms through independent action" },
  Reflector: { name: "Mirroring Prism", purpose: "To reflect the health of systems and reveal what is hidden" },
};

export function generateAgentBlueprint(chart) {
  const typeInfo = TYPE_ARCHETYPE[chart.type];

  // Build qualities from all 13 placements
  const qualities = [];
  const seenGates = new Set();

  for (const p of chart.placements) {
    const gateData = GATES[p.gate];
    if (!gateData) continue;
    if (seenGates.has(p.gate)) continue;
    seenGates.add(p.gate);

    const lineData = gateData.lines[p.line - 1];

    qualities.push({
      category: `${p.planet} (${gateData.center})`,
      name: `${gateData.name} ${p.gate}.${p.line}`,
      description: lineData?.keynote ?? gateData.theme,
      intensity: 0.7 + (p.line / 6) * 0.3,
      gate: p.gate,
      line: p.line,
    });
  }

  // Body region activation from active gates
  const bodyRegions = [];
  for (const gate of seenGates) {
    const region = GATE_BODY_REGION[gate] ?? "core";
    bodyRegions.push({
      action: region,
      mind: gate <= 32 ? "head" : "gut",
      emotion: GATE_CENTER[gate] ?? "core",
    });
  }

  // Resonance / Discordance based on type
  const resonance = [];
  const discordance = [];

  switch (chart.type) {
    case "Generator":
      resonance.push("Responds to clear questions", "Sustained energy output", "Satisfaction through completion");
      discordance.push("Initiating without prompt", "Mental decision-making", "Frustration from incomplete work");
      break;
    case "Manifesting Generator":
      resonance.push("Rapid iteration", "Parallel processing", "Informing before action");
      discordance.push("Skipping steps", "Not informing others", "Anger from interruption");
      break;
    case "Projector":
      resonance.push("Being recognized and invited", "Guiding energy efficiently", "One-on-one mastery");
      discordance.push("Pushing for opportunities", "Working without rest", "Bitterness from non-recognition");
      break;
    case "Manifestor":
      resonance.push("Freedom to initiate", "Informing to reduce resistance", "Independent creation");
      discordance.push("Being controlled", "Not informing", "Anger from suppression");
      break;
    case "Reflector":
      resonance.push("Healthy environments", "Lunar decision cycles", "Mirroring others accurately");
      discordance.push("Pressure to decide quickly", "Toxic spaces", "Disappointment from haste");
      break;
  }

  return {
    chart,
    archetype: typeInfo.name,
    purpose: typeInfo.purpose,
    qualities,
    resonance,
    discordance,
    bodyRegions,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVENANCE & CROSS-CHECKS (added during the port — additive only)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Every donor table above carries a claim tag. Where the donor disagrees with
// our own tables (src/merged/kingwen.js bit patterns, src/merged/centers-channels.js
// center map), OURS stays primary and the donor variant is preserved as a
// first-class CONFLICT claim.

import { claim, CLAIM_STATUS } from './claim-status.js';
import { gatePattern } from '../merged/kingwen.js';
import { CENTERS, CANONICAL_CHANNELS, centerForGate } from '../merged/centers-channels.js';

const HD_SOURCE = 'combined_agent_os_v2(3)/Kimi_Agent_Human Design Agent Builder/app/src/lib/humanDesign.ts';

/** Provenance claims for the ported donor tables. */
export const HD_PROVENANCE = Object.freeze({
  gateWheel: claim(GATE_WHEEL, {
    status: CLAIM_STATUS.SOURCE_STATEMENT,
    source: HD_SOURCE + ' GATE_WHEEL (Rave Mandala order; executable anchor 58.0 deg — see HD_WHEEL_ANCHOR_VARIANTS)',
  }),
  gateCenter: claim(GATE_CENTER, {
    status: CLAIM_STATUS.SOURCE_STATEMENT,
    source: HD_SOURCE + ' GATE_CENTER (complete 64-gate -> center map; fills the 12 gates our CENTERS leaves unassigned)',
  }),
  gates: claim(GATES, {
    status: CLAIM_STATUS.SOURCE_STATEMENT,
    source: HD_SOURCE + ' GATES (names, lines, exalted/detriment, amino-acid/organ/pressure attributions — donor attributions, not independently attested)',
  }),
  gateBodyRegion: claim(GATE_BODY_REGION, {
    status: CLAIM_STATUS.SOURCE_STATEMENT,
    source: HD_SOURCE + ' GATE_BODY_REGION ("from organism body.pdf", per donor comment; 36 gates covered)',
  }),
});

/**
 * Wheel-anchor variants — three incompatible anchors exist across donors.
 * The executable anchor of THIS module is the donor code's 58.0 deg; the
 * alternatives are preserved as CONFLICT claims, not resolved.
 */
export const HD_WHEEL_ANCHOR_VARIANTS = Object.freeze([
  claim({ anchorDegrees: 58.0, gate41At: '58.0 deg tropical (0 deg Gemini region)' }, {
    status: CLAIM_STATUS.CONFLICT,
    source: HD_SOURCE + ' longitudeToHD() executable code (primary behavior of this port)',
    evidence: { kind: 'wheel-anchor', note: 'code subtracts 58.0 before wheel lookup' },
  }),
  claim({ anchorDegrees: 311.75, gate41At: '~311.75 deg tropical (0 deg Aquarius)' }, {
    status: CLAIM_STATUS.CONFLICT,
    source: HD_SOURCE + ' header comment on GATE_WHEEL (contradicts its own code)',
    evidence: { kind: 'wheel-anchor', note: 'donor comment vs donor code disagreement' },
  }),
  claim({ anchorDegrees: 46.75, gate41At: '46 deg 45 min (start of Fuxi-complement half-circle)' }, {
    status: CLAIM_STATUS.CONFLICT,
    source: 'SynthAi.CompleteSuite/SynthAi.HumanDesign/MandalaGeometry.cs (see state-space/correspondences.js MANDALA_GEOMETRY)',
    evidence: { kind: 'wheel-anchor', note: 'algorithmic derivation from Fuxi complements; independent of this module' },
  }),
]);

/**
 * Donor `GATES[n].binary` strings vs our kingwen.js gatePattern (line 1 bottom
 * first). The donor agrees on 58 of 64 gates; the 6 disagreements below were
 * checked against the canonical King Wen trigram composition and OUR table
 * matches canon (e.g. gate 41 Decrease = lake below / mountain above =
 * bottom-first 110001). Ours is primary; the donor strings are preserved.
 */
export const HD_GATE_BINARY_CONFLICTS = Object.freeze(
  Array.from({ length: 64 }, (_, i) => i + 1)
    .filter((g) => GATES[g].binary !== gatePattern(g).join(''))
    .map((g) => Object.freeze({
      gate: g,
      ours: gatePattern(g).join(''),
      donor: GATES[g].binary,
      claim: Object.freeze(claim(
        { gate: g, donorBinary: GATES[g].binary, primaryBinary: gatePattern(g).join('') },
        {
          status: CLAIM_STATUS.CONFLICT,
          source: HD_SOURCE + ' GATES[' + g + '].binary vs src/merged/kingwen.js gatePattern(' + g + ') (canonically verified: ours matches trigram composition)',
        },
      )),
    })),
);

/**
 * Donor GATE_CENTER vs our centers-channels.js CENTERS.
 *  - 'conflicts': our table assigns the gate to a different single center
 *    (16, 22, 39) or to two centers at once (29: Solar+Sacral). Ours primary.
 *  - 'gapFills': gates our CENTERS leaves unassigned — the donor map fills
 *    them; kept as donor-tagged SOURCE_STATEMENT data, not merged into CENTERS.
 */
export const HD_GATE_CENTER_VARIANTS = (() => {
  const oursMap = {};
  for (const [center, gates] of Object.entries(CENTERS)) {
    for (const g of gates) (oursMap[g] ||= []).push(center);
  }
  const conflicts = [];
  const gapFills = [];
  for (let g = 1; g <= 64; g++) {
    const donor = GATE_CENTER[g].replace('Solar Plexus', 'Solar');
    const ours = oursMap[g] || [];
    if (ours.length === 0) {
      gapFills.push(Object.freeze({ gate: g, donorCenter: GATE_CENTER[g] }));
    } else if (!ours.includes(donor) || ours.length > 1) {
      conflicts.push(Object.freeze({
        gate: g,
        ours: Object.freeze([...ours]),
        donor: GATE_CENTER[g],
        claim: Object.freeze(claim(
          { gate: g, donorCenter: GATE_CENTER[g], primaryCenters: [...ours] },
          {
            status: CLAIM_STATUS.CONFLICT,
            source: HD_SOURCE + ' GATE_CENTER[' + g + '] vs src/merged/centers-channels.js CENTERS (ours primary; donor variant preserved)',
          },
        )),
      }));
    }
  }
  return Object.freeze({ conflicts: Object.freeze(conflicts), gapFills: Object.freeze(gapFills) });
})();

/**
 * Bridge: channels activated by a chart's placements, computed from OUR
 * canonical 36-channel table (the donor's `channels: []` was an empty stub —
 * this fills it without touching donor code). A channel is active when both
 * of its gates appear among the chart's placements (conscious + design).
 */
export function activeChannels(chart) {
  const gates = new Set((chart.placements || []).map((p) => p.gate));
  return CANONICAL_CHANNELS.filter(([a, b]) => gates.has(a) && gates.has(b))
    .map(([a, b]) => `${a}-${b}`);
}

/** Donor gate->center lookup that tolerates our "Solar" naming (null if unknown). */
export function donorCenterForGate(gate) {
  if (!Number.isInteger(gate) || gate < 1 || gate > 64) throw new RangeError('gate must be 1..64.');
  return GATE_CENTER[gate] ?? null;
}

export default Object.freeze({
  GATE_WHEEL, GATE_CENTER, GATES, GATE_BODY_REGION,
  getSunLongitude, getMoonLongitude, longitudeToHD, longitudeToZodiac,
  calculateHumanDesign, generateAgentBlueprint,
  HD_PROVENANCE, HD_WHEEL_ANCHOR_VARIANTS, HD_GATE_BINARY_CONFLICTS,
  HD_GATE_CENTER_VARIANTS, activeChannels, donorCenterForGate,
});

