// Pure Synthia Automata — tool-12: research-browser (crawl automaton: query→fetch→extract→cite)
// Fidelity port of src/UPGRADES/vendor/ato-core/src/research-browser.mjs (ResearchWorkspace) with
// referential integrity enforced across sources→claims→notes→hypotheses→experiments→drafts.
import { Automaton } from '../automaton.js';

export class ResearchError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ResearchError';
    this.code = code;
    this.details = details;
  }
}

export class ResearchWorkspace {
  constructor() {
    this.projects = new Map();
    this.sequence = 0;
  }

  create({ id, title, question, scope = null } = {}) {
    const project = {
      id: id || `research-${++this.sequence}`,
      title,
      question,
      scope,
      sources: new Map(),
      claims: new Map(),
      notes: [],
      hypotheses: new Map(),
      experiments: new Map(),
      drafts: [],
      status: 'researching',
    };
    this.projects.set(project.id, project);
    return this.snapshot(project.id);
  }

  source(projectId, { id, url, title, excerpt = null, author = null, published = null, capturedBy = 'browser' } = {}) {
    const p = this.#project(projectId);
    const record = Object.freeze({ id: id || `source-${++this.sequence}`, url, title, excerpt, author, published, capturedBy, kind: 'source' });
    p.sources.set(record.id, record);
    return record;
  }

  claim(projectId, { id, text, sourceIds = [], kind = 'source-claim', confidence = null } = {}) {
    const p = this.#project(projectId);
    for (const sourceId of sourceIds) {
      if (!p.sources.has(sourceId)) throw new ResearchError('SOURCE_NOT_FOUND', String(sourceId));
    }
    const record = Object.freeze({ id: id || `claim-${++this.sequence}`, text, sourceIds: Object.freeze([...sourceIds]), kind, confidence });
    p.claims.set(record.id, record);
    return record;
  }

  note(projectId, { text, sourceIds = [], claimIds = [] } = {}) {
    const p = this.#project(projectId);
    for (const sourceId of sourceIds) {
      if (!p.sources.has(sourceId)) throw new ResearchError('SOURCE_NOT_FOUND', String(sourceId));
    }
    for (const claimId of claimIds) {
      if (!p.claims.has(claimId)) throw new ResearchError('CLAIM_NOT_FOUND', String(claimId));
    }
    const record = Object.freeze({ id: `note-${++this.sequence}`, text, sourceIds: Object.freeze([...sourceIds]), claimIds: Object.freeze([...claimIds]) });
    p.notes.push(record);
    return record;
  }

  hypothesis(projectId, { id, statement, evidenceClaimIds = [] } = {}) {
    const p = this.#project(projectId);
    for (const claimId of evidenceClaimIds) {
      if (!p.claims.has(claimId)) throw new ResearchError('CLAIM_NOT_FOUND', String(claimId));
    }
    const record = Object.freeze({ id: id || `hypothesis-${++this.sequence}`, statement, evidenceClaimIds: Object.freeze([...evidenceClaimIds]), status: 'proposed' });
    p.hypotheses.set(record.id, record);
    return record;
  }

  experiment(projectId, { id, hypothesisId, protocol, executor = 'local', effects = [] } = {}) {
    const p = this.#project(projectId);
    if (!p.hypotheses.has(hypothesisId)) throw new ResearchError('HYPOTHESIS_NOT_FOUND', String(hypothesisId));
    const record = {
      id: id || `experiment-${++this.sequence}`,
      hypothesisId,
      protocol,
      executor,
      effects: Object.freeze([...effects]),
      runs: [],
      status: 'designed',
    };
    p.experiments.set(record.id, record);
    return this.#experimentView(record);
  }

  draft(projectId, { title, sections = [] } = {}) {
    const p = this.#project(projectId);
    const unresolved = [];
    const rendered = sections.map((section) => {
      const claims = (section.claimIds || []).map((id) => {
        const claim = p.claims.get(id);
        if (!claim) {
          unresolved.push(id);
          return `[UNRESOLVED CLAIM ${id}]`;
        }
        const cites = claim.sourceIds.map((sourceId) => `[${sourceId}]`).join('');
        return `${claim.text}${cites}`;
      });
      return Object.freeze({ heading: section.heading, content: Object.freeze(claims) });
    });
    const bibliography = Object.freeze([...p.sources.values()].map((source) => Object.freeze({
      id: source.id, title: source.title, url: source.url, author: source.author, published: source.published,
    })));
    const draft = Object.freeze({
      id: `draft-${++this.sequence}`,
      title,
      sections: Object.freeze(rendered),
      bibliography,
      unresolved: Object.freeze(unresolved),
      kind: 'research-draft',
    });
    p.drafts.push(draft);
    return draft;
  }

  snapshot(projectId) {
    const p = this.#project(projectId);
    return Object.freeze({
      id: p.id,
      title: p.title,
      question: p.question,
      scope: p.scope,
      status: p.status,
      sources: Object.freeze([...p.sources.values()]),
      claims: Object.freeze([...p.claims.values()]),
      notes: Object.freeze([...p.notes]),
      hypotheses: Object.freeze([...p.hypotheses.values()]),
      experiments: Object.freeze([...p.experiments.values()].map((x) => this.#experimentView(x))),
      drafts: Object.freeze([...p.drafts]),
    });
  }

  #experimentView(x) {
    return Object.freeze({
      id: x.id, hypothesisId: x.hypothesisId, protocol: x.protocol, executor: x.executor,
      effects: x.effects, runs: Object.freeze([...x.runs]), status: x.status,
    });
  }

  #project(id) {
    const p = this.projects.get(id);
    if (!p) throw new ResearchError('PROJECT_NOT_FOUND', String(id));
    return p;
  }
}

const STATES = [
  { id: 'query', name: 'Query', initial: true },
  { id: 'fetch', name: 'Fetch' },
  { id: 'extract', name: 'Extract' },
  { id: 'cite', name: 'Cite', accepting: true },
];

// Named transitions per STATE_SPACE_SPEC §7.
const DELTA_TABLE = {
  'query|create': { to: 'query', transition: 'ignition' },
  'query|source': { to: 'fetch', transition: 'flow' },
  'fetch|claim': { to: 'extract', transition: 'core' },
  'extract|note': { to: 'extract', transition: 'flow' },
  'extract|hypothesis': { to: 'extract', transition: 'fusion' },
  'extract|experiment': { to: 'extract', transition: 'automatize' },
  'extract|draft': { to: 'cite', transition: 'weave' },
  'query|snapshot': { to: 'query', transition: 'core' },
};

const OP_FROM_STATE = {
  create: 'query',
  source: 'query',
  claim: 'fetch',
  note: 'extract',
  hypothesis: 'extract',
  experiment: 'extract',
  draft: 'extract',
  snapshot: 'query',
};

const normalizeInput = (input) => {
  if (typeof input === 'string') {
    try { return JSON.parse(input); } catch { return { operation: input }; }
  }
  if (input && Array.isArray(input.args) && input.args.length && !input.operation) {
    const [op, ...rest] = input.args;
    const merged = { operation: op, packet: input.packet };
    if (rest.length === 1 && typeof rest[0] === 'string') {
      try { Object.assign(merged, JSON.parse(rest[0])); } catch { merged.value = rest[0]; }
    }
    return merged;
  }
  return input || {};
};

export class ResearchBrowserAutomaton extends Automaton {
  static descriptor = {
    id: 'research-browser',
    aliases: ['research', 'research-workspace', 'crawler'],
    gate: 11,
    channels: ['11-56'],
    capabilities: ['create', 'source', 'claim', 'note', 'hypothesis', 'experiment', 'draft', 'snapshot'],
    ports: {
      in: [{ id: 'research-request', type: 'research', schemaVersion: '1' }],
      out: [{ id: 'research-record', type: 'research', schemaVersion: '1' }],
    },
    automatonForm: 'crawl automaton',
    dimension: 'Space',
    description: 'Persistent research workspace: sources→claims→notes→hypotheses→experiments→drafts with full referential integrity; drafts render claim text with [sourceId] citations, a bibliography, and [UNRESOLVED CLAIM id] placeholders.',
  };

  constructor(options = {}) {
    const memory = options.state || new ResearchWorkspace();
    let dispatch;
    super({
      id: 'research-browser',
      address: { mode: 'macro', gate: 11, line: 1, color: 1, tone: 1, base: 1, planetaryDimension: 'Space' },
      states: STATES,
      alphabet: ['create', 'source', 'claim', 'note', 'hypothesis', 'experiment', 'draft', 'snapshot'],
      delta: (state, symbol) => DELTA_TABLE[`${state}|${symbol}`] || { to: state, transition: 'flow' },
      q0: 'query',
      // Public operations accept at their own resting states; domain validation still applies.
      finals: ['query', 'fetch', 'extract', 'cite'],
      ports: ResearchBrowserAutomaton.descriptor.ports,
      capabilities: ResearchBrowserAutomaton.descriptor.capabilities,
      dimension: 'Space',
      implementation: (input, context) => dispatch(input, context),
    });
    this.ownedState = memory;
    dispatch = (input, context) => this.#dispatch(input, context);
  }

  #dispatch(rawInput, context = {}) {
    const input = normalizeInput(rawInput);
    const op = input.operation;
    const from = OP_FROM_STATE[op];
    if (!from) throw new ResearchError('UNKNOWN_OPERATION', String(op));
    this.step(from, op, { tool: this.id });
    const state = this.ownedState;
    switch (op) {
      case 'create': return state.create(input.project || input);
      case 'source': return state.source(input.projectId, input.source || {});
      case 'claim': return state.claim(input.projectId, input.claim || {});
      case 'note': return state.note(input.projectId, input.note || {});
      case 'hypothesis': return state.hypothesis(input.projectId, input.hypothesis || {});
      case 'experiment': return state.experiment(input.projectId, input.experiment || {});
      case 'draft': return state.draft(input.projectId, input.draft || {});
      case 'snapshot': return state.snapshot(input.projectId);
      default: throw new ResearchError('UNKNOWN_OPERATION', String(op));
    }
  }
}

export default ResearchBrowserAutomaton;


