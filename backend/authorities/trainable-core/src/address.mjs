export const ADDRESS_FIELDS = [
  'planetary','dimension','gate','line','color','tone','base','degree','minute','second','arc','zodiac','house'
];

export function normalizeAddress(input = {}) {
  const out = {};
  for (const field of ADDRESS_FIELDS) out[field] = input[field] ?? null;
  return Object.freeze(out);
}

export function addressKey(address = {}) {
  const a = normalizeAddress(address);
  return `synthia://${ADDRESS_FIELDS.map(k => a[k] ?? '_').join('/')}`;
}

export function sameAddress(a,b) {
  return ADDRESS_FIELDS.every(k => (a?.[k] ?? null) === (b?.[k] ?? null));
}

