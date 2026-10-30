// Pure Synthia Automata — engine: semantic triples (tools made of triples, run provenance)

/**
 * Semantic triples — the user directive: "each of the client tools are made
 * of semantic triples". Every tool (automaton) decomposes into a set of
 * (subject, predicate, object) facts — its gate, dimension, automaton form,
 * capabilities, channels, internal states, named transitions and ports — and
 * every run appends provenance triples: the input hash was processedBy the
 * tool, the tool produced the output hash, and each trace step is a
 * (stateFrom, transition, stateTo) edge carrying the derivation id.
 *
 * Determinism: hashes are FNV-1a over canonical stableStringify (no clocks),
 * so a fresh engine that replays the same input history rebuilds the exact
 * same triple store.
 */

import { stableStringify, fnv1a32, hashObject } from './derivation.js';
import { TOOL_REGISTRY } from '../automata/registry.js';

/** Hash any JSON-like value; fall back to a string hash when not serializable. */
export function tripleValueHash(value) {
  try {
    return hashObject(value);
  } catch {
    return fnv1a32(String(value));
  }
}

export class Triple {
  constructor({ subject, predicate, object, provenance = null, derivationId = null, confidence = 1 } = {}) {
    if (subject === null || subject === undefined) {
      throw new TypeError('Triple requires a subject');
    }
    if (typeof predicate !== 'string' || !predicate) {
      throw new TypeError('Triple requires a string predicate');
    }
    if (object === null || object === undefined) {
      throw new TypeError('Triple requires an object');
    }
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.provenance = provenance;
    this.derivationId = derivationId;
    this.confidence = confidence;
    Object.freeze(this);
  }

  /** Identity key: subject + predicate + object (provenance is not identity). */
  key() {
    return stableStringify([this.subject, this.predicate, this.object]);
  }

  toJSON() {
    return {
      subject: this.subject,
      predicate: this.predicate,
      object: this.object,
      provenance: this.provenance,
      derivationId: this.derivationId,
      confidence: this.confidence,
    };
  }

  static fromJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    return new Triple(data);
  }
}

export class TripleStore {
  constructor() {
    this._byKey = new Map(); // key -> Triple (first assertion wins)
  }

  add(triple) {
    const t = triple instanceof Triple ? triple : new Triple(triple);
    const key = t.key();
    if (!this._byKey.has(key)) this._byKey.set(key, t);
    return this._byKey.get(key);
  }

  addAll(triples) {
    const out = [];
    for (const t of triples || []) out.push(this.add(t));
    return out;
  }

  /** Wildcard query: null/omitted fields match everything. */
  query({ subject = null, predicate = null, object = null } = {}) {
    const out = [];
    for (const t of this._byKey.values()) {
      if (subject !== null && t.subject !== subject) continue;
      if (predicate !== null && t.predicate !== predicate) continue;
      if (object !== null && t.object !== object) continue;
      out.push(t);
    }
    return out;
  }

  bySubject(subject) {
    return this.query({ subject });
  }

  predicates() {
    return [...new Set([...this._byKey.values()].map((t) => t.predicate))];
  }

  size() {
    return this._byKey.size;
  }

  export() {
    return [...this._byKey.values()].map((t) => t.toJSON());
  }

  import(data) {
    const list = typeof data === 'string' ? JSON.parse(data) : data;
    this.addAll((list || []).map((entry) => Triple.fromJSON(entry)));
    return this;
  }
}

// Normalize the registry ({in:[...], out:[...]}) or ATO-style array port shapes
// into flat {direction, id} records.
function portList(ports) {
  const out = [];
  const push = (entry, direction, index) => {
    const base = typeof entry === 'string' ? { id: entry } : { ...(entry || {}) };
    out.push({ direction: base.direction || direction, id: base.id || `${direction}-${index}` });
  };
  if (Array.isArray(ports)) {
    ports.forEach((p, i) => push(p, p && p.direction, i));
  } else if (ports && typeof ports === 'object') {
    (ports.in || []).forEach((p, i) => push(p, 'input', i));
    (ports.out || []).forEach((p, i) => push(p, 'output', i));
  }
  return out;
}

// Collect the named transitions a delta table/function can take, by probing
// every (state, alphabet symbol) pair. Tool delta functions in this codebase
// are pure DELTA_TABLE lookups; probing is side-effect free. Any throw is
// ignored — the ontology is additive metadata, never a run dependency.
function deltaTransitions(source, states) {
  const transitions = new Set();
  const delta = source && source.delta;
  if (!delta) return transitions;
  const alphabet = Array.isArray(source.alphabet) ? source.alphabet : [];
  if (typeof delta === 'function') {
    for (const state of states) {
      for (const symbol of alphabet) {
        try {
          const result = delta(state, symbol, {});
          if (result && typeof result.transition === 'string') transitions.add(result.transition);
        } catch { /* probing is best-effort */ }
      }
    }
  } else if (typeof delta === 'object') {
    for (const value of Object.values(delta)) {
      if (value && typeof value.transition === 'string') transitions.add(value.transition);
    }
  }
  return transitions;
}

/**
 * The semantic-triple decomposition of one tool. Accepts a registry
 * descriptor, a grown-tool record, or a live Automaton instance; registry
 * data fills in whatever the instance does not carry (e.g. channels).
 */
export function toolOntology(descriptorOrAutomaton) {
  const source = descriptorOrAutomaton || {};
  const id = source.id;
  if (typeof id !== 'string' || !id) {
    throw new TypeError('toolOntology requires a descriptor or automaton with an id');
  }
  const registryEntry = TOOL_REGISTRY.find((entry) => entry.id === id) || null;

  const gate = source.gate ?? (source.address && source.address.gate) ?? (registryEntry && registryEntry.gate) ?? null;
  const dimension = source.dimension ?? (registryEntry && registryEntry.dimension) ?? null;
  const form = source.automatonForm ?? (registryEntry && registryEntry.automatonForm) ?? null;
  const capabilities = source.capabilities || (registryEntry && registryEntry.capabilities) || [];
  const channels = source.channels || (registryEntry && registryEntry.channels) || [];
  const states = (Array.isArray(source.states) ? source.states : [])
    .map((s) => (typeof s === 'string' ? s : s && s.id))
    .filter(Boolean);

  const triples = [];
  const put = (predicate, object) => {
    if (object === null || object === undefined) return;
    triples.push(new Triple({ subject: id, predicate, object, provenance: 'tool-ontology' }));
  };

  put('isA', 'Automaton');
  put('hasGate', gate);
  put('hasDimension', dimension);
  put('hasForm', form);
  for (const capability of capabilities) put('hasCapability', capability);
  for (const channel of channels) put('hasChannel', channel);
  for (const state of states) put('hasState', state);
  for (const transition of [...deltaTransitions(source, states)].sort()) put('usesTransition', transition);
  for (const port of portList(source.ports || (registryEntry && registryEntry.ports))) {
    put('hasPort', `${port.direction}:${port.id}`);
  }
  return triples;
}

/**
 * The provenance triples of one run: (inputHash, processedBy, toolId),
 * (toolId, produced, outputHash), and one (stateFrom, transition, stateTo)
 * triple per trace step — every triple carrying the derivation id.
 */
export function runTriples({ toolId, input, output, derivationId = null, trace = [] } = {}) {
  const triples = [];
  const inputHash = tripleValueHash(input);
  const outputHash = tripleValueHash(output);
  triples.push(new Triple({
    subject: inputHash, predicate: 'processedBy', object: toolId, provenance: 'run', derivationId,
  }));
  triples.push(new Triple({
    subject: toolId, predicate: 'produced', object: outputHash, provenance: 'run', derivationId,
  }));
  for (const step of Array.isArray(trace) ? trace : []) {
    if (!step || step.from === null || step.from === undefined) continue;
    if (step.to === null || step.to === undefined) continue;
    triples.push(new Triple({
      subject: String(step.from),
      predicate: 'transition',
      object: String(step.to),
      provenance: step.transition || 'run',
      derivationId,
    }));
  }
  return triples;
}

export default TripleStore;

