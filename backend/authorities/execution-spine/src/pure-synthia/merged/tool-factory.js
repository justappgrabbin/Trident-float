// Pure Synthia Automata — merged from integrated-tool-factory-v1_5_0/src/integrated-tool-factory.mjs (TOOL_LEVELS, stableId, PurposePlanner, GeneratedTool runtimes)

import { DIMENSION_META } from '../state-space/constants.js';
import { DimensionRouter } from './dimension-router.js';

/** The 8 structural levels a generated tool can live at (with selection cue words). */
export const TOOL_LEVELS = Object.freeze([
  { level: 0, name: 'Base', kind: 'constant', cues: Object.freeze(['constant', 'seed', 'value', 'base']) },
  { level: 1, name: 'Tone', kind: 'classifier', cues: Object.freeze(['classify', 'boolean', 'tone', 'yin', 'yang']) },
  { level: 2, name: 'Color', kind: 'filter', cues: Object.freeze(['filter', 'select', 'color', 'predicate']) },
  { level: 3, name: 'Bigram', kind: 'matcher', cues: Object.freeze(['match', 'compare', 'pair', 'bigram']) },
  { level: 4, name: 'Trigram', kind: 'analyzer', cues: Object.freeze(['analyze', 'learn', 'trigram']) },
  { level: 5, name: 'Hexagram', kind: 'rule', cues: Object.freeze(['rule', 'grammar', 'hexagram']) },
  { level: 6, name: 'Channel', kind: 'connector', cues: Object.freeze(['connect', 'transmit', 'channel', 'event']) },
  { level: 7, name: 'Circuit', kind: 'system', cues: Object.freeze(['system', 'circuit', 'workflow', 'pipeline', 'orchestrate']) },
]);

/** Dimension operation -> default level when no explicit level and no cue words match. */
export const OPERATION_LEVEL_FALLBACK = Object.freeze({
  transition: 3, transform: 4, instantiate: 5, structure: 5, integrate: 7,
});

export class FactoryError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'FactoryError'; this.code = code; this.details = details; }
}

const words = value => String(value ?? '').toLowerCase().match(/[a-z0-9']+/g) || [];
const clone = value => (globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
const canonical = value => (value === null || typeof value !== 'object'
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`);

/**
 * Deterministic string hash -> 16 hex chars (verbatim from the factory:
 * dual MurmurHash-style accumulators, order-independent of platform).
 */
export function stableId(value) {
  const text = canonical(value);
  let a = 0xdeadbeef ^ text.length; let b = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 2654435761);
    b = Math.imul(b ^ text.charCodeAt(i), 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return `${(b >>> 0).toString(16).padStart(8, '0')}${(a >>> 0).toString(16).padStart(8, '0')}`;
}

/** Seeded PRNG derived from stableId (used only by the L7 Markov walk). */
function seeded(seed) {
  let x = parseInt(stableId(seed).slice(0, 8), 16) || 1;
  return () => ((x = Math.imul(x ^ (x >>> 15), 1 | x), x ^= x + Math.imul(x ^ (x >>> 7), 61 | x), (x ^ (x >>> 14)) >>> 0) / 4294967296);
}

function planLevel(request, route) {
  const explicit = request.level;
  if (Number.isInteger(explicit) && explicit >= 0 && explicit <= 7) return explicit;
  const tokens = new Set(words(`${request.purpose || ''} ${request.input || ''}`));
  const scores = TOOL_LEVELS.map(l => l.cues.reduce((n, cue) => n + (tokens.has(cue) ? 1 : 0), 0));
  const max = Math.max(...scores);
  if (max) return scores.lastIndexOf(max);
  return OPERATION_LEVEL_FALLBACK[route.operation] ?? 5;
}

function makePlan(request, route) {
  const level = planLevel(request, route);
  const gate = Number.isInteger(request.gate) ? request.gate : route.seedGate;
  if (gate < 1 || gate > 64) throw new FactoryError('INVALID_GATE', 'gate must be 1..64');
  const line = (level % 6) + 1;
  return Object.freeze({
    level,
    gate,
    targetGate: ((gate + level * 7 - 1) % 64) + 1,
    line,
    color: ((line - 1) % 6) + 1,
    tone: ((line - 1) % 6) + 1,
    base: ((line - 1) % 5) + 1,
    dimension: route.dimension,
    operation: route.operation,
    purpose: request.purpose || null,
  });
}

/** The eight level runtimes, exactly per the contract's level semantics. */
function makeRuntime(plan, id) {
  const random = seeded(id);
  const state = { seen: new Map(), rules: [], events: [] };
  const addressKey = `${plan.dimension}:G${plan.gate}.L${plan.line}.C${plan.color}.T${plan.tone}.B${plan.base}`;
  const implementations = [
    // L0 Base — echo the constant seed value back with the input
    async input => ({ address: addressKey, value: plan.base, input }),
    // L1 Tone — yin/yang classifier; attractor polarity from the gate's least-significant bit
    async input => {
      const value = Number(input);
      if (!Number.isFinite(value)) throw new FactoryError('EXPECTED_NUMBER', 'Tone requires a number');
      const attractor = (plan.gate & 1) ? 0.75 : 0.25;
      return { value, isYang: value > 0.5, isYin: value <= 0.5, tension: Math.abs(value - attractor) };
    },
    // L2 Color — filter items matching this tool's address fields
    async input => {
      const list = Array.isArray(input) ? input : [input];
      return list.filter(item => item?.color === plan.color || item?.tone === plan.tone || item?.gate === plan.gate);
    },
    // L3 Bigram — Jaccard matcher over word sets
    async input => {
      const [a, b] = Array.isArray(input) ? input : [input, input];
      const aa = words(a); const bb = words(b);
      const shared = [...new Set(aa.filter(x => bb.includes(x)))];
      return { match: shared.length / Math.max(1, new Set([...aa, ...bb]).size), shared, pattern: [plan.gate & 3, (plan.gate >> 2) & 3] };
    },
    // L4 Trigram — analyzer: occurrence counts + feature bundle
    async input => {
      const key = canonical(input);
      const occurrences = (state.seen.get(key) || 0) + 1;
      state.seen.set(key, occurrences);
      return { input, occurrences, features: { gate: plan.gate, line: plan.line, color: plan.color, tone: plan.tone, base: plan.base } };
    },
    // L5 Hexagram — rule accumulator {lhs: dimension, rhs: input, weight}
    async input => {
      const rule = { lhs: plan.dimension, rhs: input, weight: 1 + state.rules.length / 10 };
      state.rules.push(rule);
      return { rule, address: addressKey };
    },
    // L6 Channel — addressed event packets {sequence, from, to, signal, address}
    async input => {
      const packet = { sequence: state.events.length + 1, from: plan.gate, to: plan.targetGate, signal: input, address: addressKey };
      state.events.push(packet);
      return packet;
    },
    // L7 Circuit — seeded Markov text generation, at most 15 steps
    async input => {
      const tokens = words(input);
      const edges = [];
      for (let i = 0; i < tokens.length - 1; i++) edges.push({ from: tokens[i], to: tokens[i + 1] });
      const walk = [];
      if (tokens.length) {
        let cur = tokens[0];
        walk.push(cur);
        for (let i = 0; i < 15; i++) {
          const options = edges.filter(t => t.from === cur);
          if (!options.length) break;
          cur = options[Math.floor(random() * options.length)].to;
          walk.push(cur);
        }
      }
      return { output: walk.join(' '), nodes: [...new Set(tokens)], edges, address: addressKey };
    },
  ];
  return {
    execute: implementations[plan.level],
    exportState: () => ({ seen: [...state.seen], rules: clone(state.rules), events: clone(state.events) }),
  };
}

/**
 * Deterministic tool generator. Same request always yields the same tool id.
 * generate({purpose, input, dimension?, level?, gate?}) ->
 *   {status:'generated'|'existing', tool:{id, name, address:{gate,line,color,tone,base},
 *    addressKey, level, levelName, dimension, targetGate, execute(input), exportState()}}
 * or the router's {status:'unresolved'|'ambiguous', ...} when no dimension can be chosen.
 */
export class ToolFactory {
  constructor({ router = new DimensionRouter() } = {}) {
    this.router = router;
    this.tools = new Map();
  }

  generate(request = {}) {
    if (!request.purpose && !request.input) {
      throw new FactoryError('MISSING_PURPOSE', 'purpose or input is required');
    }
    const route = request.dimension
      ? Object.freeze({ status: 'resolved', dimension: request.dimension, ...DIMENSION_META[request.dimension] })
      : this.router.route(`${request.purpose || ''} ${request.input || ''}`);
    if (route.status !== 'resolved') return route;
    if (!DIMENSION_META[route.dimension]) throw new FactoryError('UNKNOWN_DIMENSION', route.dimension);
    const plan = makePlan(request, { ...DIMENSION_META[route.dimension], ...route });
    const identity = {
      version: 'pure-synthia-merged-tool-factory.v1',
      plan,
      request: { purpose: request.purpose || null, input: request.input || null },
    };
    const id = `tool-${stableId(identity)}`;
    if (this.tools.has(id)) return Object.freeze({ status: 'existing', tool: this.tools.get(id) });
    const runtime = makeRuntime(plan, id);
    const address = { gate: plan.gate, line: plan.line, color: plan.color, tone: plan.tone, base: plan.base };
    const addressKey = `${plan.dimension}:G${plan.gate}.L${plan.line}.C${plan.color}.T${plan.tone}.B${plan.base}`;
    const tool = {
      id,
      name: `${TOOL_LEVELS[plan.level].name}${plan.dimension}G${plan.gate}L${plan.line}`,
      address,
      addressKey,
      level: plan.level,
      levelName: TOOL_LEVELS[plan.level].name,
      dimension: plan.dimension,
      targetGate: plan.targetGate,
      purpose: plan.purpose,
      execute: (input, context = {}) => runtime.execute(input, context),
      exportState: runtime.exportState,
    };
    this.tools.set(id, tool);
    return Object.freeze({ status: 'generated', tool });
  }
}

export default ToolFactory;

