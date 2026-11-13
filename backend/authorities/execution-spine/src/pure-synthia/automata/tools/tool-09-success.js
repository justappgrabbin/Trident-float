// Pure Synthia Automata — tool-09: success (reward hill-climber automaton: attempt→score→reinforce)
// Fidelity port of src/UPGRADES/vendor/ato-core/src/success.mjs (SuccessLedger) onto the shared mesh.
import { Automaton } from '../automaton.js';

export class SuccessError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SuccessError';
    this.code = code;
    this.details = details;
  }
}

// Least-squares slope over the given values (index = x).
const trend = (values) => {
  if (values.length < 2) return 0;
  const n = values.length;
  const sumX = values.reduce((sum, _, index) => sum + index, 0);
  const sumY = values.reduce((sum, value) => sum + value, 0);
  const sumXY = values.reduce((sum, value, index) => sum + index * value, 0);
  const sumX2 = values.reduce((sum, _, index) => sum + index * index, 0);
  const denominator = n * sumX2 - sumX * sumX;
  return denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
};

// Persistent owned state: people map + frozen event log. Deterministic (sequence counters only).
export class SuccessMemory {
  constructor() {
    this.sequence = 0;
    this.people = new Map();
    this.events = [];
  }

  define(personId, { statement, indicators = [], address = null } = {}) {
    if (!personId || !statement || !String(statement).trim()) {
      throw new SuccessError('INVALID_PURPOSE', 'Person and purpose statement are required');
    }
    const purpose = Object.freeze({
      personId,
      statement: String(statement).trim(),
      address,
      revision: 1,
      indicators: Object.freeze(indicators.map((indicator, index) => Object.freeze({
        id: indicator.id || `indicator-${index + 1}`,
        name: indicator.name,
        measure: indicator.measure || null,
        direction: indicator.direction || 'increase',
        weight: Number.isFinite(indicator.weight) ? indicator.weight : 1,
      }))),
    });
    this.people.set(personId, { purpose, observations: new Map(), proposals: [] });
    this.#record('purpose-defined', { personId, purpose });
    return purpose;
  }

  observe(personId, indicatorId, value, { context = null, address = null, source = 'person' } = {}) {
    const person = this.people.get(personId);
    if (!person) throw new SuccessError('PURPOSE_NOT_FOUND', String(personId));
    const indicator = person.purpose.indicators.find((item) => item.id === indicatorId);
    if (!indicator) throw new SuccessError('INDICATOR_NOT_FOUND', String(indicatorId));
    if (!Number.isFinite(value)) throw new SuccessError('INVALID_OBSERVATION', 'Progress observation must be numeric');
    const history = person.observations.get(indicatorId) || [];
    const observation = Object.freeze({ sequence: ++this.sequence, value, context, address, source });
    history.push(observation);
    person.observations.set(indicatorId, history);
    const progress = this.progress(personId, indicatorId);
    this.events.push(Object.freeze({ sequence: this.sequence, type: 'progress-observed', payload: { personId, indicatorId, observation, progress } }));
    return progress;
  }

  progress(personId, indicatorId) {
    const person = this.people.get(personId);
    if (!person) throw new SuccessError('PURPOSE_NOT_FOUND', String(personId));
    const indicator = person.purpose.indicators.find((item) => item.id === indicatorId);
    if (!indicator) throw new SuccessError('INDICATOR_NOT_FOUND', String(indicatorId));
    const history = person.observations.get(indicatorId) || [];
    const values = history.slice(-5).map((item) => item.value);
    const rate = trend(values);
    let direction = 'unknown';
    if (values.length >= 2) {
      if (indicator.direction === 'increase') direction = rate > 0 ? 'toward' : rate < 0 ? 'away' : 'neutral';
      if (indicator.direction === 'decrease') direction = rate < 0 ? 'toward' : rate > 0 ? 'away' : 'neutral';
      if (indicator.direction === 'maintain') direction = Math.abs(rate) <= 0.1 ? 'toward' : 'away';
    }
    return Object.freeze({
      personId, indicatorId, direction,
      rate: Math.abs(rate), signedRate: rate,
      values: Object.freeze(values), evidenceCount: history.length,
    });
  }

  propose(personId, indicatorId, { message, behaviors = [], role = 'companion', address = null } = {}) {
    const person = this.people.get(personId);
    if (!person) throw new SuccessError('PURPOSE_NOT_FOUND', String(personId));
    const resolvedIndicator = indicatorId || (person.purpose.indicators[0] && person.purpose.indicators[0].id) || null;
    const progress = resolvedIndicator ? this.progress(personId, resolvedIndicator) : null;
    const proposal = Object.freeze({
      id: `success-${personId}-${++this.sequence}`,
      personId,
      indicatorId: resolvedIndicator,
      progress,
      role,
      message,
      behaviors: Object.freeze([...behaviors]),
      address,
      status: 'proposed',
    });
    person.proposals.push(proposal);
    this.events.push(Object.freeze({ sequence: this.sequence, type: 'success-proposal', payload: proposal }));
    return proposal;
  }

  summary(personId) {
    const person = this.people.get(personId);
    if (!person) return null;
    return Object.freeze({
      purpose: person.purpose,
      progress: Object.freeze(person.purpose.indicators.map((item) => this.progress(personId, item.id))),
      proposals: Object.freeze([...person.proposals]),
    });
  }

  #record(type, payload) {
    this.events.push(Object.freeze({ sequence: ++this.sequence, type, payload }));
  }

  replay() {
    return Object.freeze([...this.events]);
  }
}

const STATES = [
  { id: 'attempt', name: 'Attempt', initial: true },
  { id: 'score', name: 'Score' },
  { id: 'reinforce', name: 'Reinforce', accepting: true },
];

// Named transitions per STATE_SPACE_SPEC §7. Hill-climb loop: reinforce →(recursion)→ attempt.
const DELTA_TABLE = {
  'attempt|define': { to: 'score', transition: 'ignition' },
  'score|define': { to: 'reinforce', transition: 'flow' },
  'attempt|observe': { to: 'score', transition: 'flow' },
  'score|observe': { to: 'reinforce', transition: 'becoming' },
  'reinforce|propose': { to: 'attempt', transition: 'recursion' },
  'reinforce|summary': { to: 'score', transition: 'core' },
  'attempt|replay': { to: 'reinforce', transition: 'reactivation' },
};

const OP_PATHS = {
  define: [['attempt', 'define'], ['score', 'define']],
  observe: [['attempt', 'observe'], ['score', 'observe']],
  propose: [['reinforce', 'propose']],
  summary: [['reinforce', 'summary']],
  replay: [['attempt', 'replay']],
};

const normalizeInput = (input) => {
  if (typeof input === 'string') {
    try { return JSON.parse(input); } catch { return { operation: 'summary', text: input }; }
  }
  if (input && Array.isArray(input.args) && input.args.length && !input.operation && !input.type) {
    const first = input.args[0];
    if (typeof first === 'string') {
      try {
        const parsed = JSON.parse(first);
        if (parsed && typeof parsed === 'object') return { ...parsed, packet: input.packet };
      } catch { /* fall through */ }
    }
  }
  return input || {};
};

export class SuccessAutomaton extends Automaton {
  static descriptor = {
    id: 'success',
    aliases: ['success-ledger', 'success-tray', 'purpose'],
    gate: 14,
    channels: ['2-14'],
    capabilities: ['define', 'observe', 'propose', 'summary', 'replay'],
    ports: {
      in: [{ id: 'purpose', type: 'success', schemaVersion: '1' }],
      out: [{ id: 'expression', type: 'success', schemaVersion: '1' }],
    },
    automatonForm: 'reward hill-climber',
    dimension: 'Being',
    description: 'Direction-not-destination success ledger: purposes with weighted indicators, least-squares progress scoring over the last 5 observations, proposals, and a frozen replayable event log.',
  };

  constructor(options = {}) {
    const memory = options.state || new SuccessMemory();
    let dispatch;
    super({
      id: 'success',
      address: { mode: 'macro', gate: 14, line: 1, color: 1, tone: 1, base: 1, planetaryDimension: 'Being' },
      states: STATES,
      alphabet: ['define', 'observe', 'propose', 'summary', 'replay'],
      delta: (state, symbol) => DELTA_TABLE[`${state}|${symbol}`] || { to: state, transition: 'flow' },
      q0: 'attempt',
      // Public operations accept at their own resting states; domain validation still applies.
      finals: ['attempt', 'score', 'reinforce'],
      ports: SuccessAutomaton.descriptor.ports,
      capabilities: SuccessAutomaton.descriptor.capabilities,
      dimension: 'Being',
      implementation: (input, context) => dispatch(input, context),
    });
    this.ownedState = memory;
    dispatch = (input, context) => this.#dispatch(input, context);
  }

  #walk(path) {
    for (const [from, symbol] of path) this.step(from, symbol, { tool: this.id });
  }

  #dispatch(rawInput, context = {}) {
    const input = normalizeInput(rawInput);
    const op = input.operation || input.type;
    const path = OP_PATHS[op];
    if (!path) throw new SuccessError('UNKNOWN_SUCCESS_OPERATION', String(op));
    this.#walk(path);
    const state = this.ownedState;
    switch (op) {
      case 'define': return state.define(input.personId, input.purpose || {});
      case 'observe': return state.observe(input.personId, input.indicatorId, input.value, input.context || {});
      case 'propose': return state.propose(input.personId, input.indicatorId, input.proposal || {});
      case 'summary': return state.summary(input.personId);
      case 'replay': return state.replay();
      default: throw new SuccessError('UNKNOWN_SUCCESS_OPERATION', String(op));
    }
  }
}

export default SuccessAutomaton;


