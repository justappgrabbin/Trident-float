// Pure Synthia Automata — Automaton base class: states + named transitions + trace/ledger lifecycle

import { NAMED_TRANSITIONS, transitionById } from '../state-space/transitions.js';
import { transitionSound } from '../state-space/sounds.js';
import { transitionColor } from '../state-space/colors.js';

export class AutomatonError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AutomatonError';
    this.code = code;
    this.details = details;
  }
}

// Deep clone that preserves functions by reference (tool combinators/rules may carry
// deterministic function values; structuredClone would reject them), keeps Map/Set
// instances as Map/Set (several tools hold Map-based ownedState), and preserves the
// prototype of class instances so hydrated memory objects keep their methods
// (private methods live on the prototype; only own enumerable fields are copied).
function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Map) {
    return new Map([...value.entries()].map(([k, v]) => [deepClone(k), deepClone(v)]));
  }
  if (value instanceof Set) return new Set([...value].map(deepClone));
  if (Array.isArray(value)) return value.map(deepClone);
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = deepClone(entry);
    return out;
  }
  // Class instance (tool memory classes): rebuild via the constructor so
  // private-method brands are installed (Object.create alone fails brand
  // checks), then overwrite every own field with its cloned value.
  let out;
  try {
    out = new value.constructor();
  } catch {
    out = Object.create(proto); // constructor requires args: prototype-only fallback
  }
  for (const [key, entry] of Object.entries(value)) out[key] = deepClone(entry);
  return out;
}

const KNOWN_TRANSITION_IDS = new Set(
  (NAMED_TRANSITIONS || []).map((t) => t && t.id).filter(Boolean),
);

function assertNamedTransition(id) {
  let known = KNOWN_TRANSITION_IDS.size ? KNOWN_TRANSITION_IDS.has(id) : true;
  if (!known && typeof transitionById === 'function') known = Boolean(transitionById(id));
  if (!known) {
    throw new AutomatonError('UNKNOWN_TRANSITION', `Trace steps must use a named transition from the lexicon (spec §7); got: ${id}`, { transition: id });
  }
}

// Derive missing address components from the gate's arc-second offset so that
// soundFor/colorFor always receive a complete-enough address (spec §2).
function normalizeAddress(address = {}, dimension = null) {
  const addr = { line: 1, color: 1, tone: 1, base: 1, ...address };
  if (addr.planetaryDimension == null && dimension) addr.planetaryDimension = dimension;
  if (typeof addr.gate === 'number' && addr.gate >= 1 && addr.gate <= 64) {
    const gateArcSec = (addr.gate - 1) * 20250 + (addr.line - 1) * 3375;
    if (addr.zodiac == null) addr.zodiac = Math.min(12, Math.floor(gateArcSec / 108000) + 1);
    if (addr.house == null) addr.house = Math.min(8, Math.floor(gateArcSec / 162000) + 1);
    if (addr.arcSecond == null) addr.arcSecond = gateArcSec;
  }
  return addr;
}

function addrKeyOf(address = {}) {
  return `G${address.gate ?? 0}.L${address.line ?? 0}.C${address.color ?? 0}.T${address.tone ?? 0}.B${address.base ?? 0}`;
}

export class Automaton {
  constructor({
    id,
    address,
    states = [],
    alphabet = [],
    delta = null,
    q0 = null,
    finals = [],
    ports = { in: [{ id: 'input', type: 'json' }], out: [{ id: 'output', type: 'json' }] },
    capabilities = [],
    dimension = null,
    implementation = null,
    state = null,
    automatonForm = null,
  } = {}) {
    if (typeof id !== 'string' || !id) throw new AutomatonError('MISSING_ID', 'Automaton requires an id');
    this.id = id;
    this.dimension = dimension;
    this.address = normalizeAddress(address, dimension);
    this.addressKey = addrKeyOf(this.address);
    this.states = states.map((s) => (typeof s === 'string' ? { id: s } : { ...s }));
    this.alphabet = [...alphabet];
    this.delta = delta;
    this.q0 = q0 || (this.states.find((s) => s.initial) || this.states[0] || {}).id || null;
    this.finals = finals.length ? [...finals] : this.states.filter((s) => s.accepting).map((s) => s.id);
    this.ports = ports;
    this.capabilities = [...capabilities];
    this.implementation = implementation;
    this.automatonForm = automatonForm;
    this.ownedState = state; // persistent memory (contract hard rule 7)
    this.lifecycle = 'ready';
    this.calls = 0;
    this.runObservers = new Set();
    this.contextProviders = new Set();
    this._trace = null; // run-scoped trace buffer
    this._ledger = null; // run-scoped ledger buffer
  }

  // Record one trace step carrying named transition id + sound + color (contract hard rule 1).
  _recordStep({ from, to, input = null, transition = 'flow', note = null }) {
    assertNamedTransition(transition);
    const entry = Object.freeze({
      seq: this._trace ? this._trace.length : 0,
      from,
      input,
      transition,
      to,
      sound: transitionSound(transition, this.address),
      color: transitionColor(transition, this.address),
      ...(note ? { note } : {}),
    });
    if (this._trace) {
      this._trace.push(entry);
      this._ledger.transitionCount += 1; // per step
      this._ledger.edgesTraversed += 1; // one named transition edge per step
      this._ledger.statesGenerated += 1; // per internal state visit (the `to`)
    }
    return entry;
  }

  step(stateId, symbol, ctx = {}) {
    if (typeof this.delta !== 'function') {
      throw new AutomatonError('MISSING_DELTA', `Automaton ${this.id} has no transition function`);
    }
    const result = this.delta(stateId, symbol, ctx) || {};
    const to = result.to ?? stateId;
    this._recordStep({ from: stateId, to, input: symbol, transition: result.transition || 'flow' });
    return { ...result, to };
  }

  observeRuns(listener) {
    if (typeof listener !== 'function') throw new TypeError('run observer must be a function');
    this.runObservers.add(listener);
    return () => this.runObservers.delete(listener);
  }

  provideContext(provider) {
    if (typeof provider !== 'function') throw new TypeError('context provider must be a function');
    this.contextProviders.add(provider);
    return () => this.contextProviders.delete(provider);
  }

  run(input, context = {}) {
    const probe = context.klein === true || context.kleinJoint === true;
    for (const provider of this.contextProviders) context = { ...context, ...provider(input, context) };
    this.lifecycle = 'active';
    this.calls += 1;
    const trace = [];
    const ledger = {
      primitivesActivated: 0,
      statesGenerated: 0,
      edgesTraversed: 0,
      operationsExecuted: 0,
      recursionDepth: 0,
      activeAutomata: 1,
      transitionCount: 0,
    };
    this._trace = trace;
    this._ledger = ledger;
    const emit = (step) => this._recordStep(step);
    try {
      // IGNITION: dormant -> active entry state (spec §7).
      emit({ from: 'dormant', to: this.q0, input: null, transition: 'ignition' });
      let output;
      let finalState = this.q0;
      if (typeof this.implementation === 'function') {
        ledger.operationsExecuted += 1; // per operation
        output = this.implementation(input, {
          automaton: this,
          state: this.ownedState,
          emit,
          context,
        });
        if (trace.length > 1) finalState = trace[trace.length - 1].to;
      } else {
        // Drive delta over input symbols.
        const symbols = Array.isArray(input) ? input
          : typeof input === 'string' ? [...input]
            : (input && Array.isArray(input.symbols) ? input.symbols : []);
        ledger.primitivesActivated = symbols.length;
        const outputs = [];
        let current = this.q0;
        for (const symbol of symbols) {
          const result = this.step(current, symbol, { automaton: this, context });
          current = result.to;
          if (result.output !== undefined) outputs.push(result.output);
        }
        finalState = current;
        output = outputs.length <= 1 ? (outputs[0] ?? null) : outputs;
      }
      // AUTOMATIZE: completion — the run folds back into the machine (spec §7).
      emit({ from: finalState, to: finalState, input: null, transition: 'automatize' });
      const reachedFinal = this.finals.length === 0 || this.finals.includes(finalState);
      const accepted = reachedFinal && !(output && typeof output === 'object' && output.ok === false);
      this.lifecycle = 'ready';
      const result = { output, trace, ledger, accepted, finalState };
      if (!probe) for (const observer of this.runObservers) observer(input, result, context);
      return result;
    } catch (error) {
      this.lifecycle = 'error';
      if (!probe) for (const observer of this.runObservers) observer(input, { accepted: false, error: String(error.message ?? error), trace, ledger }, context);
      throw error;
    } finally {
      this._trace = null;
      this._ledger = null;
    }
  }

  /**
   * Experiential return: after a run, the engine feeds the result summary back
   * into the automaton's owned state as an experience record
   * {derivationId, intakeId, outputHash, seq} — timestamp-free, counter-
   * sequenced, so exportState/hydrate round-trip it and replay reproduces it.
   * Tools that declared no persistent memory (state: null) gain an
   * { experiences: [] } log; Map-rooted state keeps the log under the
   * 'experiences' key (deepClone preserves both shapes).
   */
  absorbExperience(record = {}) {
    const entry = Object.freeze({ ...record });
    if (this.ownedState instanceof Map) {
      const list = this.ownedState.get('experiences');
      const next = Array.isArray(list) ? [...list, entry] : [entry];
      this.ownedState.set('experiences', next);
      return next.length;
    }
    if (this.ownedState == null || typeof this.ownedState !== 'object') this.ownedState = {};
    if (!Array.isArray(this.ownedState.experiences)) this.ownedState.experiences = [];
    this.ownedState.experiences.push(entry);
    return this.ownedState.experiences.length;
  }

  exportState() {
    return this.ownedState == null ? null : deepClone(this.ownedState);
  }

  hydrate(state) {
    this.ownedState = state == null ? null : deepClone(state);
    return this;
  }

  manifest() {
    return Object.freeze({
      manifestVersion: 'ato.automaton.v1',
      id: this.id,
      address: Object.freeze({ ...this.address }),
      addressKey: this.addressKey,
      automatonForm: this.automatonForm,
      dimension: this.dimension,
      states: Object.freeze(this.states.map((s) => Object.freeze({ ...s }))),
      alphabet: Object.freeze([...this.alphabet]),
      q0: this.q0,
      finals: Object.freeze([...this.finals]),
      ports: deepClone(this.ports),
      capabilities: Object.freeze([...this.capabilities]),
      lifecycle: this.lifecycle,
      calls: this.calls,
    });
  }
}


