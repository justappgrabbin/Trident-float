// Pure Synthia Automata — merged from Synthia_Progressive_Upgrade_v0_6/runtime/SynthiaSubstrate.ts (36 canonical channels, 9 centers; Sacral/Spleen gate-57 duplication fixed per contract)

/**
 * The 36 canonical channel pairs (Human Design bodygraph wiring), exactly per
 * contract. Note the source listed [20,10]/[60,3]/[61,24]/[63,4] duplicates in
 * place of the [10,34]/[10,57]/[20,34]/[20,57] pairs; the contract list is
 * authoritative and used verbatim here.
 */
export const CANONICAL_CHANNELS = Object.freeze([
  [1, 8], [2, 14], [3, 60], [4, 63], [5, 15], [6, 59],
  [7, 31], [9, 52], [10, 20], [10, 34], [10, 57], [11, 56],
  [12, 22], [13, 33], [16, 48], [17, 62], [18, 58], [19, 49],
  [20, 34], [20, 57], [21, 45], [23, 43], [24, 61], [25, 51],
  [26, 44], [27, 50], [28, 38], [29, 46], [30, 41], [32, 54],
  [34, 57], [35, 36], [37, 40], [39, 55], [42, 53], [47, 64],
].map(pair => Object.freeze(pair)));

/**
 * The 9 centers and their gate sets, per contract. Conflict resolved:
 * gate 57 belongs to the Spleen ONLY — the source's Sacral list
 * [5,14,29,34,57,59] had a duplicated 57; Sacral is [5,14,29,34,59] here.
 */
export const CENTERS = Object.freeze({
  Head: Object.freeze([64, 61, 63]),
  Ajna: Object.freeze([47, 24, 4, 11]),
  Throat: Object.freeze([62, 23, 56, 35, 12, 45, 33, 20]),
  G: Object.freeze([1, 13, 25, 46, 2, 15, 10]),
  Heart: Object.freeze([40, 26, 51, 21]),
  Solar: Object.freeze([29, 30, 36, 6, 55, 37, 22]),
  Spleen: Object.freeze([48, 16, 44, 57, 50, 32, 18, 28]),
  Sacral: Object.freeze([5, 14, 29, 34, 59]),
  Root: Object.freeze([58, 38, 54, 19, 39, 41, 53]),
});

export const CENTER_NAMES = Object.freeze(Object.keys(CENTERS));

function checkGate(g) {
  if (!Number.isInteger(g) || g < 1 || g > 64) throw new RangeError('gate must be 1..64');
}

/** All canonical channel pairs touching gate g (each as a frozen [a,b] pair). */
export function channelsForGate(g) {
  checkGate(g);
  return CANONICAL_CHANNELS.filter(([a, b]) => a === g || b === g);
}

/** The center that owns gate g, or null if the gate is unassigned. */
export function centerForGate(g) {
  checkGate(g);
  for (const [name, gates] of Object.entries(CENTERS)) {
    if (gates.includes(g)) return name;
  }
  return null;
}

/** Gates at the other end of every channel touching g. */
export function channelPartners(g) {
  return channelsForGate(g).map(([a, b]) => (a === g ? b : a));
}

export default Object.freeze({ CANONICAL_CHANNELS, CENTERS, CENTER_NAMES, channelsForGate, centerForGate, channelPartners });

