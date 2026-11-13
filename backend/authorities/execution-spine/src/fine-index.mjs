/**
 * Exact local fine-index encoding proven by the uploaded test:
 * Gate × Line × Color × Tone × Base × ArcUnit.
 *
 * This is intentionally NOT the complete canonical address.
 */
export const TOTAL_FINE_UNITS = 64 * 6 * 6 * 6 * 5 * 99; // 6,842,880

const RADICES = Object.freeze({
  gate: 64,
  line: 6,
  color: 6,
  tone: 6,
  base: 5,
  arcUnit: 99,
});

function check(name, value, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RangeError(`${name} out of range: expected 1..${max}, got ${value}`);
  }
}

export function fineIndexForAddress(address) {
  check('gate', address.gate, RADICES.gate);
  check('line', address.line, RADICES.line);
  check('color', address.color, RADICES.color);
  check('tone', address.tone, RADICES.tone);
  check('base', address.base, RADICES.base);
  check('arcUnit', address.arcUnit, RADICES.arcUnit);

  let n = address.gate - 1;
  n = n * RADICES.line + (address.line - 1);
  n = n * RADICES.color + (address.color - 1);
  n = n * RADICES.tone + (address.tone - 1);
  n = n * RADICES.base + (address.base - 1);
  n = n * RADICES.arcUnit + (address.arcUnit - 1);
  return n;
}

export function addressForFineIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= TOTAL_FINE_UNITS) {
    throw new RangeError(`fine index out of range: expected 0..${TOTAL_FINE_UNITS - 1}, got ${index}`);
  }

  let n = index;
  const arcUnit = (n % RADICES.arcUnit) + 1; n = Math.floor(n / RADICES.arcUnit);
  const base = (n % RADICES.base) + 1; n = Math.floor(n / RADICES.base);
  const tone = (n % RADICES.tone) + 1; n = Math.floor(n / RADICES.tone);
  const color = (n % RADICES.color) + 1; n = Math.floor(n / RADICES.color);
  const line = (n % RADICES.line) + 1; n = Math.floor(n / RADICES.line);
  const gate = n + 1;

  return { gate, line, color, tone, base, arcUnit };
}

