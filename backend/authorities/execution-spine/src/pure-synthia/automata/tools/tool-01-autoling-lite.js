// Pure Synthia Automata — tool 01: autoling-lite, rule-induction FSM (listen→abstract→coin-rule→test)

import { Automaton } from '../automaton.js';

const tokenize = (text) => String(text).toLowerCase().match(/[a-z0-9_'-]+/g) || [];

function seedRules(state) {
  learn(state, { id: 'has-property.v1', relation: 'HAS_PROPERTY', pattern: ['$object', 'is', '$property'], template: '$object is $property' });
  learn(state, { id: 'part-of.v1', relation: 'PART_OF', pattern: ['$part', 'belongs', 'to', '$whole'], template: '$part belongs to $whole' });
}

function learn(state, { id, relation, pattern, template, arity = null, provenance = null } = {}) {
  if (!relation || !Array.isArray(pattern) || !pattern.length || typeof template !== 'string') {
    return { ok: false, reason: 'INVALID_GRAMMAR_RULE' };
  }
  const ruleId = id || `rule-${++state.sequence}`;
  const variables = [...new Set(pattern.filter((token) => typeof token === 'string' && token.startsWith('$')))];
  const rule = {
    id: ruleId,
    relation,
    pattern: [...pattern],
    template,
    arity: arity ?? variables.length,
    variables,
    provenance,
    revision: 1,
  };
  state.rules[ruleId] = rule;
  return { ok: true, rule };
}

function recognize(state, text) {
  const tokens = tokenize(text);
  const matches = [];
  for (const ruleId of Object.keys(state.rules).sort()) {
    const rule = state.rules[ruleId];
    if (tokens.length !== rule.pattern.length) continue;
    const bindings = {};
    let valid = true;
    for (let i = 0; i < tokens.length; i++) {
      const expected = String(rule.pattern[i]).toLowerCase();
      if (expected.startsWith('$')) {
        const prior = bindings[expected];
        if (prior && prior !== tokens[i]) { valid = false; break; }
        bindings[expected] = tokens[i];
      } else if (expected !== tokens[i]) { valid = false; break; }
    }
    if (valid) {
      matches.push({
        ruleId: rule.id,
        relation: rule.relation,
        bindings,
        structure: rule.variables.map((v) => bindings[v]),
      });
    }
  }
  return { ok: matches.length > 0, text: String(text), matches };
}

function generate(state, relation, args = []) {
  const rules = Object.keys(state.rules).sort()
    .map((id) => state.rules[id])
    .filter((rule) => rule.relation === relation);
  if (!rules.length) return { ok: false, reason: 'RULE_NOT_FOUND', relation };
  const rule = rules[0];
  if (args.length !== rule.arity) {
    return { ok: false, reason: 'ARITY_MISMATCH', expected: rule.arity, received: args.length };
  }
  let surface = rule.template;
  rule.variables.forEach((variable, index) => {
    surface = surface.replaceAll(variable, args[index]);
  });
  return { ok: true, relation, ruleId: rule.id, surface };
}

export class AutolingLiteAutomaton extends Automaton {
  static registry = Object.freeze({
    id: 'autoling-lite',
    aliases: ['auto-ling-lite'],
    gate: 17,
    channels: ['17-62'],
    capabilities: ['learn', 'recognize', 'generate', 'export'],
    ports: Object.freeze({
      in: Object.freeze([Object.freeze({ id: 'input', type: 'json' })]),
      out: Object.freeze([Object.freeze({ id: 'output', type: 'json', guarantees: ['addressed'] })]),
    }),
    automatonForm: 'rule-induction FSM',
    dimension: 'Design',
    description: "Klein's AutoLing, lite: induces token-pattern grammar rules with $variables, recognizes utterances by exact-length binding-consistent match, generates surfaces from templates.",
  });

  constructor() {
    const d = AutolingLiteAutomaton.registry;
    const memory = { rules: {}, sequence: 0 };
    seedRules(memory);
    super({
      id: d.id,
      address: { gate: d.gate, line: 1, color: 1, tone: 1, base: 1 },
      states: [
        { id: 'listen', initial: true },
        { id: 'abstract' },
        { id: 'coin-rule' },
        { id: 'test', accepting: true },
      ],
      alphabet: ['token', '$variable', 'pattern', 'template', 'relation'],
      q0: 'listen',
      finals: ['test'],
      ports: d.ports,
      capabilities: d.capabilities,
      dimension: d.dimension,
      automatonForm: d.automatonForm,
      state: memory,
      implementation: (input = {}, { state, emit }) => {
        if (!state.rules) { state.rules = {}; state.sequence = state.sequence || 0; seedRules(state); }
        emit({ from: 'listen', to: 'abstract', input: input.operation || 'export', transition: 'flow' });
        const operation = input.operation;
        let current = 'abstract';
        let output;
        if (operation === 'learn') {
          emit({ from: 'abstract', to: 'coin-rule', input: 'rule', transition: 'fusion' });
          current = 'coin-rule';
          output = learn(state, input.rule || {});
        } else if (operation === 'recognize') {
          output = recognize(state, input.text);
        } else if (operation === 'generate') {
          emit({ from: 'abstract', to: 'coin-rule', input: input.relation || null, transition: 'flow' });
          current = 'coin-rule';
          output = generate(state, input.relation, input.args || []);
        } else if (operation === 'export') {
          output = { ok: true, rules: Object.keys(state.rules).sort().map((id) => ({ ...state.rules[id] })) };
        } else {
          output = { ok: false, reason: 'UNKNOWN_OPERATION' };
        }
        emit({ from: current, to: 'test', input: null, transition: 'flow', note: operation || 'export' });
        return output;
      },
    });
  }
}

