/**
 * Opt-in strict semantic coordinate contract.
 * This module never fabricates missing address coordinates and never uses a
 * storage digest as a substitute for semantic meaning.
 * Legacy normalizeAddress remains unchanged for compatibility.
 */
export const COORDINATE_ORDER = Object.freeze([
  'planetary','dimension','gate','line','color','tone','base',
  'degree','minute','second','arcAxis','zodiac','house'
]);
export const DIMENSIONS = Object.freeze(['Movement','Evolution','Being','Design','Space']);
const discrete = Object.freeze({gate:[1,64],line:[1,6],color:[1,6],tone:[1,6],base:[1,5],house:[1,12]});
const has = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
const present = value => value !== null && value !== undefined && value !== '';
function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonicalValue(value[k])]));
  return value;
}
export function validateStrictAddress(raw, {requireComplete=true}={}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Address must be an object');
  const errors=[];
  const dimension=typeof raw.dimension === 'number' && Number.isInteger(raw.dimension)
    ? DIMENSIONS[raw.dimension-1] : raw.dimension;
  if (!DIMENSIONS.includes(dimension)) errors.push('dimension must be one of the five canonical dimensions');
  if (!present(raw.planetary)) errors.push('planetary must be supplied');
  for (const [field,[min,max]] of Object.entries(discrete)) {
    if (!present(raw[field])) {if(requireComplete) errors.push(field+' is unresolved');continue;}
    if (typeof raw[field] !== 'number' || !Number.isInteger(raw[field]) || raw[field]<min || raw[field]>max)
      errors.push(field+' must be an integer in '+min+'..'+max);
  }
  for (const field of ['degree','minute','second']) {
    if (!present(raw[field])) {if(requireComplete) errors.push(field+' is unresolved');continue;}
    if (typeof raw[field] !== 'number' || !Number.isFinite(raw[field]))
      errors.push(field+' must be a finite numeric measurement');
  }
  for (const field of ['minute','second'])
    if (present(raw[field]) && typeof raw[field] === 'number' && (raw[field]<0 || raw[field]>=60))
      errors.push(field+' must be in [0,60)');
  for (const field of ['arcAxis','zodiac']) if (requireComplete && !present(raw[field])) errors.push(field+' is unresolved');
  if (present(raw.arcAxis) && (typeof raw.arcAxis !== 'object' || Array.isArray(raw.arcAxis)))
    errors.push('arcAxis must be a structured object');
  if (errors.length) throw new TypeError('Invalid strict address: '+errors.join('; '));
  const coordinates=Object.fromEntries(COORDINATE_ORDER.map(field=>[field,field==='dimension'?dimension:(has(raw,field)?canonicalValue(raw[field]):null)]));
  const provenance=Object.fromEntries(COORDINATE_ORDER.map(field=>[field,{
    status:present(coordinates[field])?'supplied':'unresolved',
    source:present(coordinates[field])?(raw.source??null):null
  }]));
  return Object.freeze({coordinates:Object.freeze(coordinates),provenance:Object.freeze(provenance),complete:COORDINATE_ORDER.every(field=>present(coordinates[field]))});
}
export function semanticCoordinateKey(strictRecord) {
  const record=strictRecord?.coordinates ? strictRecord : validateStrictAddress(strictRecord);
  return JSON.stringify(COORDINATE_ORDER.map(field=>[field,canonicalValue(record.coordinates[field])]));
}

