import crypto from 'node:crypto';
import { normalizeAddress, addressKey } from './address.mjs';

const clone = v => structuredClone(v);
const now = () => new Date().toISOString();
const id = (prefix, payload) => `${prefix}_${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0,16)}`;

export class StateRegistry {
  constructor() {
    this.entities = new Map();
    this.events = [];
  }

  register({entityId, entityType='automaton', nativeAddress, currentAddress=nativeAddress, source={}, sayings={}, state={}}) {
    if (!entityId) throw new Error('entityId required');
    const native = normalizeAddress(nativeAddress);
    const current = normalizeAddress(currentAddress);
    const record = {
      entityId, entityType,
      nativeAddress: native,
      nativeAddressKey: addressKey(native),
      currentAddress: current,
      currentAddressKey: addressKey(current),
      source: clone(source),
      sayings: clone(sayings),
      state: clone(state),
      registeredAt: now(),
      updatedAt: now(),
      revision: 0,
      history: []
    };
    this.entities.set(entityId, record);
    return clone(record);
  }

  transition(entityId, {toAddress, cause='transition', statePatch={}, activeSayings=null, actor=null, relation=null}={}) {
    const rec = this.entities.get(entityId);
    if (!rec) throw new Error(`unknown entity: ${entityId}`);
    const before = {address: rec.currentAddress, addressKey: rec.currentAddressKey, state: rec.state, sayings: rec.sayings};
    const nextAddress = normalizeAddress(toAddress ?? rec.currentAddress);
    rec.currentAddress = nextAddress;
    rec.currentAddressKey = addressKey(nextAddress);
    rec.state = {...rec.state, ...clone(statePatch)};
    if (activeSayings) rec.sayings = {...rec.sayings, ...clone(activeSayings)};
    rec.revision += 1;
    rec.updatedAt = now();
    const eventPayload = {entityId, actor, relation, cause, before, after:{address:rec.currentAddress,addressKey:rec.currentAddressKey,state:rec.state,sayings:rec.sayings}, revision:rec.revision};
    const event = {eventId:id('evt',eventPayload), ...clone(eventPayload), timestamp:now()};
    rec.history.push(event.eventId);
    this.events.push(event);
    return clone(event);
  }

  contact(aId,bId,{relation='contacts',cause='contact',metadata={}}={}) {
    const a=this.entities.get(aId), b=this.entities.get(bId);
    if(!a||!b) throw new Error('both entities must be registered');
    const payload={a:{id:aId,address:a.currentAddress,addressKey:a.currentAddressKey},b:{id:bId,address:b.currentAddress,addressKey:b.currentAddressKey},relation,cause,metadata};
    const event={eventId:id('contact',payload),...clone(payload),timestamp:now()};
    this.events.push(event);
    return clone(event);
  }

  get(entityId){ const r=this.entities.get(entityId); return r?clone(r):null; }
  snapshot(){ return {entities:[...this.entities.values()].map(clone), events:clone(this.events)}; }
}

