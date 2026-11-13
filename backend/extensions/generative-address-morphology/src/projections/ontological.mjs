/**
 * Explicit experimental, address-driven projection.
 * This does not claim empirically established color/sound correspondences.
 * No storage IDs or cryptographic digests influence the projection.
 */
import {validateStrictAddress,semanticCoordinateKey} from '../core/strict-address.mjs';
const wrap=(n,period)=>((n%period)+period)%period;
const round=(n)=>Number(n.toFixed(4));
const dimensions=['Movement','Evolution','Being','Design','Space'];
export function projectAddressedStructure(addresses,{leadingDimension=null}={}){
  if(!Array.isArray(addresses)||addresses.length===0) throw new TypeError('At least one canonical address is required');
  const records=addresses.map(a=>validateStrictAddress(a));
  const coords=records.map(r=>r.coordinates);
  const leader=leadingDimension??coords[0].dimension;
  if(!dimensions.includes(leader)) throw new TypeError('Invalid leading dimension');
  const d=dimensions.indexOf(leader);
  // An explicit experimental coordinate mapping, NOT an asserted natural law.
  const hue=wrap(coords.reduce((s,a)=>s+(a.gate-1)*360/64+(a.color-1)*360/(64*6),0)/coords.length+d*72,360);
  const orientation=wrap(coords.reduce((s,a)=>s+(a.line-1)*60+(a.tone-1)*10+(a.base-1)*2,0)/coords.length,360);
  const frequency=110+coords.reduce((s,a)=>s+(a.gate-1)*660/63+(a.base-1)*12,0)/coords.length;
  return Object.freeze({
    evidenceStatus:'experimental',
    mappingVersion:'address-projection-v0.1',
    leadingDimension:leader,
    semanticKeys:records.map(semanticCoordinateKey),
    geometry:{kind:'address-assembly',orientationDegrees:round(orientation),memberCount:coords.length},
    color:{space:'HSL',h:round(hue),s:70,l:50},
    sound:{frequencyHz:round(frequency)},
    reconstructionClass:'procedural-projection-not-image-reconstruction'
  });
}

