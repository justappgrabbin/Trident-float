// Pure Synthia Automata — tool-11: browser-form (DOM-walker FSM: see→fill→submit→confirm)
// Fidelity port of src/UPGRADES/vendor/ato-core/src/browser-form.mjs (BrowserFormState): consent-gated,
// deterministic (sequence counters only, no clocks).
import { Automaton } from '../automaton.js';

export class BrowserFormError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BrowserFormError';
    this.code = code;
    this.details = details;
  }
}

// Auto-flag 'high' sensitivity for well-known credential/identity/financial/medical field names.
const SENSITIVE_PATTERN = /ssn|social[-_ ]?security|password|passcode|\bpin\b|bank|routing|medical|immigration|credit[-_ ]?card|card[-_ ]?number|\bcvv\b/i;

export class BrowserFormMemory {
  constructor() {
    this.page = null;
    this.forms = new Map();
    this.drafts = new Map();
    this.approvals = new Map();
    this.events = [];
    this.sequence = 0;
  }

  inspectPage({ url, title = null, forms = [] } = {}) {
    if (!url) throw new BrowserFormError('URL_REQUIRED', 'Page inspection requires URL');
    this.page = Object.freeze({ url, title, forms: Object.freeze(forms.map((f) => f.id)) });
    for (const form of forms) this.inspectForm(form);
    this.#event('page-inspected', this.page);
    return this.snapshot();
  }

  inspectForm({ id, action, method = 'POST', fields = [], official = false } = {}) {
    if (!id) throw new BrowserFormError('FORM_ID_REQUIRED', 'Form requires id');
    const form = Object.freeze({
      id, action, method, official,
      fields: Object.freeze(fields.map((field, index) => {
        const name = field.name || field.id;
        return Object.freeze({
          id: field.id || field.name || `field-${index + 1}`,
          name,
          label: field.label || name,
          type: field.type || 'text',
          required: Boolean(field.required),
          sensitivity: field.sensitivity || (name && SENSITIVE_PATTERN.test(name) ? 'high' : 'normal'),
          options: Object.freeze([...(field.options || [])]),
          value: field.value ?? null,
        });
      })),
    });
    this.forms.set(id, form);
    this.#event('form-inspected', form);
    return form;
  }

  createDraft(formId, values = {}, { sources = {} } = {}) {
    const form = this.forms.get(formId);
    if (!form) throw new BrowserFormError('FORM_NOT_FOUND', String(formId));
    const entries = form.fields.map((field) => {
      const provided = Object.prototype.hasOwnProperty.call(values, field.name);
      const source = sources[field.name] || null;
      return Object.freeze({
        fieldId: field.id,
        name: field.name,
        label: field.label,
        value: provided ? values[field.name] : null,
        status: provided ? (source && source.kind === 'inferred' ? 'inferred' : 'resolved') : 'unresolved',
        sensitivity: field.sensitivity,
        provenance: source ? Object.freeze({ ...source }) : null,
        approved: false,
      });
    });
    const id = `draft-${++this.sequence}-${formId}`;
    const draft = Object.freeze({ id, formId, destination: form.action, entries: Object.freeze(entries), status: 'draft' });
    this.drafts.set(id, draft);
    this.events.push(Object.freeze({ sequence: this.sequence, type: 'draft-created', payload: draft }));
    return draft;
  }

  approveFields(draftId, names, { scope = 'once' } = {}) {
    const draft = this.#draft(draftId);
    const set = new Set(names);
    const missing = names.filter((name) => !draft.entries.some((entry) => entry.name === name));
    if (missing.length) throw new BrowserFormError('FIELD_NOT_FOUND', 'Unknown draft fields', { missing });
    const updated = Object.freeze({
      ...draft,
      entries: Object.freeze(draft.entries.map((entry) => (set.has(entry.name) ? Object.freeze({ ...entry, approved: true }) : entry))),
      status: 'fields-approved',
    });
    this.drafts.set(draftId, updated);
    this.approvals.set(`fields:${draftId}`, Object.freeze({ draftId, names: Object.freeze([...set]), scope }));
    this.#event('fields-approved', { draftId, names: [...set] });
    return updated;
  }

  confirmInferred(draftId, names) {
    const draft = this.#draft(draftId);
    const set = new Set(names);
    const updated = Object.freeze({
      ...draft,
      entries: Object.freeze(draft.entries.map((entry) => (
        set.has(entry.name) && entry.status === 'inferred'
          ? Object.freeze({ ...entry, status: 'resolved', approved: true, provenance: Object.freeze({ ...(entry.provenance || {}), confirmed: true }) })
          : entry
      ))),
    });
    this.drafts.set(draftId, updated);
    this.#event('inferred-confirmed', { draftId, names: [...set] });
    return updated;
  }

  fill(draftId) {
    const draft = this.#draft(draftId);
    const unapproved = draft.entries.filter((entry) => entry.value !== null && !entry.approved);
    if (unapproved.length) {
      throw new BrowserFormError('FIELD_APPROVAL_REQUIRED', 'Every populated value requires approval', { fields: unapproved.map((x) => x.name) });
    }
    const inferred = draft.entries.filter((entry) => entry.status === 'inferred');
    if (inferred.length) {
      throw new BrowserFormError('INFERRED_VALUE_CONFIRMATION_REQUIRED', 'Inferred values must be confirmed', { fields: inferred.map((x) => x.name) });
    }
    const updated = Object.freeze({ ...draft, status: 'filled' });
    this.drafts.set(draftId, updated);
    this.#event('form-filled', { draftId });
    return updated;
  }

  validate(draftId) {
    const draft = this.#draft(draftId);
    const form = this.forms.get(draft.formId);
    const missing = form.fields
      .filter((field) => field.required && !draft.entries.some((entry) => entry.name === field.name && entry.value !== null && entry.value !== ''))
      .map((field) => field.name);
    const result = Object.freeze({ valid: missing.length === 0, missing: Object.freeze(missing), draftId });
    this.#event('form-validated', result);
    return result;
  }

  requestSubmission(draftId) {
    const draft = this.#draft(draftId);
    if (draft.status !== 'filled') throw new BrowserFormError('FORM_NOT_FILLED', 'Submission requires filled draft');
    const validation = this.validate(draftId);
    if (!validation.valid) throw new BrowserFormError('VALIDATION_FAILED', 'Required fields unresolved', { missing: validation.missing });
    const request = Object.freeze({
      id: `submit-${++this.sequence}-${draftId}`,
      draftId,
      destination: draft.destination,
      fields: Object.freeze(draft.entries.filter((e) => e.value !== null).map((e) => Object.freeze({ name: e.name, value: e.value, sensitivity: e.sensitivity, provenance: e.provenance }))),
      status: 'awaiting-confirmation',
    });
    this.approvals.set(request.id, request);
    this.events.push(Object.freeze({ sequence: this.sequence, type: 'submission-requested', payload: request }));
    return request;
  }

  confirmSubmission(requestId) {
    const request = this.approvals.get(requestId);
    if (!request || request.status !== 'awaiting-confirmation') throw new BrowserFormError('SUBMISSION_REQUEST_NOT_FOUND', String(requestId));
    const confirmed = Object.freeze({ ...request, status: 'confirmed' });
    this.approvals.set(requestId, confirmed);
    this.#event('submission-confirmed', { requestId });
    return confirmed;
  }

  submit(requestId, executor) {
    const request = this.approvals.get(requestId);
    if (!request || request.status !== 'confirmed') throw new BrowserFormError('SUBMISSION_CONFIRMATION_REQUIRED', 'External submission needs final confirmation');
    if (typeof executor !== 'function') throw new BrowserFormError('BROWSER_EXECUTOR_REQUIRED', 'Submission requires mounted browser executor');
    this.#event('submission-dispatched', { requestId, destination: request.destination });
    return executor(request);
  }

  #draft(id) {
    const draft = this.drafts.get(id);
    if (!draft) throw new BrowserFormError('DRAFT_NOT_FOUND', String(id));
    return draft;
  }

  #event(type, payload) {
    const event = Object.freeze({ sequence: ++this.sequence, type, payload });
    this.events.push(event);
    return event;
  }

  snapshot() {
    return Object.freeze({
      page: this.page,
      forms: Object.freeze([...this.forms.values()]),
      drafts: Object.freeze([...this.drafts.values()]),
      events: Object.freeze([...this.events]),
    });
  }
}

const STATES = [
  { id: 'see', name: 'See', initial: true },
  { id: 'fill', name: 'Fill' },
  { id: 'submit', name: 'Submit' },
  { id: 'confirm', name: 'Confirm', accepting: true },
];

// Named transitions per STATE_SPACE_SPEC §7.
const DELTA_TABLE = {
  'see|inspect-page': { to: 'see', transition: 'ignition' },
  'see|draft': { to: 'fill', transition: 'flow' },
  'fill|approve-fields': { to: 'fill', transition: 'flow' },
  'fill|confirm-inferred': { to: 'fill', transition: 'becoming' },
  'fill|fill': { to: 'fill', transition: 'chain' },
  'fill|validate': { to: 'fill', transition: 'core' },
  'fill|request-submission': { to: 'submit', transition: 'chain' },
  'submit|confirm-submission': { to: 'confirm', transition: 'becoming' },
  'confirm|submit': { to: 'confirm', transition: 'automatize' },
  'see|snapshot': { to: 'see', transition: 'core' },
};

const OP_FROM_STATE = {
  'inspect-page': 'see',
  draft: 'see',
  'approve-fields': 'fill',
  'confirm-inferred': 'fill',
  fill: 'fill',
  validate: 'fill',
  'request-submission': 'fill',
  'confirm-submission': 'submit',
  submit: 'confirm',
  snapshot: 'see',
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

export class BrowserFormAutomaton extends Automaton {
  static descriptor = {
    id: 'browser-form',
    aliases: ['form', 'dom-form', 'forms'],
    gate: 20,
    channels: ['10-20', '20-34', '20-57'],
    capabilities: ['inspect-page', 'draft', 'approve-fields', 'confirm-inferred', 'fill', 'validate', 'request-submission', 'confirm-submission', 'submit', 'snapshot'],
    ports: {
      in: [{ id: 'request', type: 'browser-form', schemaVersion: '1' }],
      out: [{ id: 'state', type: 'browser-form', schemaVersion: '1' }],
    },
    automatonForm: 'DOM-walker FSM',
    dimension: 'Being',
    description: 'Consent-gated DOM-walker: inspects pages/forms, drafts values with provenance, requires per-field approval and inferred-value confirmation before fill, and only submits through an explicit two-step confirmed request to a mounted executor.',
  };

  constructor(options = {}) {
    const memory = options.state || new BrowserFormMemory();
    let dispatch;
    super({
      id: 'browser-form',
      address: { mode: 'macro', gate: 20, line: 1, color: 1, tone: 1, base: 1, planetaryDimension: 'Being' },
      states: STATES,
      alphabet: ['inspect-page', 'draft', 'approve-fields', 'confirm-inferred', 'fill', 'validate', 'request-submission', 'confirm-submission', 'submit', 'snapshot'],
      delta: (state, symbol) => DELTA_TABLE[`${state}|${symbol}`] || { to: state, transition: 'flow' },
      q0: 'see',
      // Public operations accept at their own resting states; domain validation still applies.
      finals: ['see', 'fill', 'submit', 'confirm'],
      ports: BrowserFormAutomaton.descriptor.ports,
      capabilities: BrowserFormAutomaton.descriptor.capabilities,
      dimension: 'Being',
      implementation: (input, context) => dispatch(input, context),
    });
    this.ownedState = memory;
    dispatch = (input, context) => this.#dispatch(input, context);
  }

  #dispatch(rawInput, ctx = {}) {
    // Base passes {automaton, state, emit, context}; unwrap the caller context.
    const context = (ctx && ctx.context) || ctx || {};
    const input = normalizeInput(rawInput);
    const op = input.operation;
    const from = OP_FROM_STATE[op];
    if (!from) throw new BrowserFormError('UNKNOWN_OPERATION', String(op));
    this.step(from, op, { tool: this.id });
    const state = this.ownedState;
    switch (op) {
      case 'inspect-page': return state.inspectPage(input.page || input);
      case 'draft': return state.createDraft(input.formId, input.values || {}, input.context || {});
      case 'approve-fields': return state.approveFields(input.draftId, input.names || [], input.context || {});
      case 'confirm-inferred': return state.confirmInferred(input.draftId, input.names || []);
      case 'fill': return state.fill(input.draftId);
      case 'validate': return state.validate(input.draftId);
      case 'request-submission': return state.requestSubmission(input.draftId);
      case 'confirm-submission': return state.confirmSubmission(input.requestId);
      case 'submit': return state.submit(input.requestId, input.executor || context.executor);
      case 'snapshot': return state.snapshot();
      default: throw new BrowserFormError('UNKNOWN_OPERATION', String(op));
    }
  }
}

export default BrowserFormAutomaton;


