// Synthia canonical address codec.
// Canonical identity is compact; display names belong in metadata, never in the key.
// Person/contact visibility stops at Base. D/M/S/A/Z/H remain private/internal.

export const CANONICAL_FIELD_ORDER = Object.freeze([
  'planetary','dimension','gate','line','color','tone','base',
  'degree','minute','second','arcAxis','zodiac','house',
]);

const clean = (v) => String(v ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');

export function formatCanonicalAddress(address = {}) {
  return [
    `P${clean(address.planetary)}`,
    `DIM${Number(address.dimension)}`,
    `G${Number(address.gate)}`,
    `L${Number(address.line)}`,
    `C${Number(address.color)}`,
    `T${Number(address.tone)}`,
    `B${Number(address.base)}`,
    `D${clean(address.degree)}`,
    `M${clean(address.minute)}`,
    `S${clean(address.second)}`,
    `A${clean(address.arcAxis)}`,
    `Z${clean(address.zodiac)}`,
    `H${clean(address.house)}`,
  ].join('.');
}

// Privacy/contact boundary for people: never expose below Base.
export function formatContactAddress(address = {}) {
  return [
    `P${clean(address.planetary)}`,
    `DIM${Number(address.dimension)}`,
    `G${Number(address.gate)}`,
    `L${Number(address.line)}`,
    `C${Number(address.color)}`,
    `T${Number(address.tone)}`,
    `B${Number(address.base)}`,
  ].join('.');
}

export function contactView(addressOrRecord = {}) {
  const address = addressOrRecord.canonicalAddress || addressOrRecord;
  return Object.freeze({
    code: formatContactAddress(address),
    planetary: address.planetary,
    dimension: address.dimension,
    gate: address.gate,
    line: address.line,
    color: address.color,
    tone: address.tone,
    base: address.base,
  });
}

