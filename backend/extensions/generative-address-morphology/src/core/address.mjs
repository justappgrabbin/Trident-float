import {createHash} from 'node:crypto';

export const ADDRESS_ORDER = Object.freeze([
  'planetary','dimension','gate','line','color','tone','base','degree','minute','second','arcAxis','zodiac','house'
]);

const DIMENSIONS = new Set(['Movement','Evolution','Being','Design','Space']);
const within = (v,a,b) => Number.isFinite(Number(v)) && Number(v) >= a && Number(v) <= b;
const freezeTree = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeTree(child); Object.freeze(value); }
  return value;
};
const stable = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v).sort().map(k=>`${k}:${stable(v[k])}`).join(',')}}`;
};

/**
 * Morphology addresses consume the integrated v0.4.2 canonical address without
 * rewriting it. Aliases exist only for older donor packets.
 */
export function normalizeAddress(raw={}){
  const a = {
    id: raw.id ?? null,
    planetary: raw.planetary ?? raw.planetaryFilter ?? raw.planet ?? null,
    dimension: typeof raw.dimension === 'number'
      ? ['Movement','Evolution','Being','Design','Space'][raw.dimension - 1]
      : String(raw.dimension ?? '').trim(),
    gate: Number(raw.gate),
    line: Number(raw.line ?? 1),
    color: Number(raw.color ?? 1),
    tone: Number(raw.tone ?? 1),
    base: Number(raw.base ?? 1),
    degree: raw.degree ?? null,
    minute: Number(raw.minute ?? 0),
    second: Number(raw.second ?? 0),
    arcAxis: raw.arcAxis ?? (raw.axis ? {axis: raw.axis, arcUnit: raw.arcUnit ?? 1} : null),
    zodiac: raw.zodiac ?? null,
    house: Number(raw.house ?? 1),
    awareness: raw.awareness ?? null,
    phase: Number(raw.phase ?? 0),
    amplitude: Number(raw.amplitude ?? 1),
    coherence: Number(raw.coherence ?? 1),
    active: raw.active !== false,
    timing: raw.timing ?? null,
    context: raw.context ?? {},
    source: raw.source ?? null,
    canonicalAddress: raw.canonicalAddress ?? null,
    semantic: raw.semantic ? freezeTree(structuredClone(raw.semantic)) : null,
  };
  validateAddress(a);
  if(!a.id) a.id = `addr-${digestAddress(a).slice(0,16)}`;
  return Object.freeze(a);
}

export function validateAddress(a){
  const errs=[];
  if(!DIMENSIONS.has(a.dimension)) errs.push(`dimension must be one of ${[...DIMENSIONS].join(', ')}`);
  if(a.planetary === null || a.planetary === undefined || a.planetary === '') errs.push('planetary is required');
  if(!within(a.gate,1,64)) errs.push('gate must be 1..64');
  if(!within(a.line,1,6)) errs.push('line must be 1..6');
  if(!within(a.color,1,6)) errs.push('color must be 1..6');
  if(!within(a.tone,1,6)) errs.push('tone must be 1..6');
  // The current integrated root is authoritative here: Base is 1..5.
  if(!within(a.base,1,5)) errs.push('base must be 1..5');
  if(!within(a.minute,0,59.999999)) errs.push('minute must be 0..<60');
  if(!within(a.second,0,59.999999)) errs.push('second must be 0..<60');
  if(!within(a.house,1,12)) errs.push('house must be 1..12');
  if(!Number.isFinite(a.phase)||!Number.isFinite(a.amplitude)||!Number.isFinite(a.coherence)) errs.push('phase/amplitude/coherence must be numeric');
  if(errs.length) throw new TypeError(`Invalid address: ${errs.join('; ')}`);
  return true;
}

export function addressKey(a){
  const coordinates = ADDRESS_ORDER.map(k=>`${k}=${stable(a[k])}`).join('|');
  return a.semantic ? `${coordinates}|semantic=${stable({schema:a.semantic.schema,vector:a.semantic.vector})}` : coordinates;
}
export function digestAddress(a){return createHash('sha256').update(addressKey(a)).digest('hex');}
export function pairKey(a,b){return [a.id,b.id].sort().join('::');}


