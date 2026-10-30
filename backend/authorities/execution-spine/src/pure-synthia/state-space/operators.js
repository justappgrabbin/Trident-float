// Pure Synthia Automata — the 12 cross-scale operators O (spec §4); metadata + pure transforms

import { SCALES } from './constants.js';
import { gateFromBits } from './addressing.js';
import { projectDimension } from './dimensions.js';

const asList = (operands) => (Array.isArray(operands) ? operands : [operands]);

const requireBits = (bits, opId) => {
  if (!Array.isArray(bits) || bits.length !== 6 || bits.some((b) => b !== 0 && b !== 1)) {
    throw new TypeError(`${opId} expects a 6-bit array (line 1 first)`);
  }
  return bits;
};

// next rung up the scale ladder (spec §1), capped at 'mesh'
function promoteScale(scale) {
  const i = SCALES.indexOf(scale);
  return i < 0 ? 'mesh' : SCALES[Math.min(i + 1, SCALES.length - 1)];
}

const commonScale = (members) => {
  const scales = new Set(members.map((m) => m && m.scale).filter(Boolean));
  return scales.size === 1 ? [...scales][0] : null;
};

export const OPERATORS = Object.freeze([
  {
    id:'o_bundle', arity:'variadic', name:'Fusion',
    rule:'simultaneous composition under shared slot; unordered',
    accepts:'any states', positionalRule:'unordered; E(A,B) === E(B,A) as sets',
    invariants:['constituent-identity-preserved', 'order-insensitive'],
    inverseId:null, scalesObserved:['feature','phoneme','grapheme'],
    transform(operands) {
      const members = asList(operands).map((m, i) => ({ slot: i, member: m })); // identity kept per member
      return { kind:'bundle', operator:'o_bundle', scale: commonScale(members.map((s) => s.member)) || 'mixed',
               unordered:true, members };
    },
  },
  {
    id:'o_sequence', arity:'variadic', name:'Chain',
    rule:'ordered composition; E(A,B) ≠ E(B,A); positional indexes are state',
    accepts:'any states', positionalRule:'position i is part of composite state',
    invariants:['order-sensitive', 'length-preserving'],
    inverseId:null, scalesObserved:['grapheme','morpheme','word','phrase'],
    transform(operands) {
      const members = asList(operands);
      const base = commonScale(members);
      return { kind:'sequence', operator:'o_sequence', id:`composite_${members.length}`,
               positional:true, scale: base ? promoteScale(base) : 'mixed',
               members: members.map((m, i) => ({ position: i, member: m })) };
    },
  },
  {
    id:'o_project', arity:1, name:'Perspective',
    rule:'dimensional re-representation T_{i→j}',
    accepts:'a state + context {from, to}', positionalRule:'unary',
    invariants:['identity-preserved-across-dimensions', 'representation-not-preserved (H4, measured)'],
    inverseId:null, scalesObserved:['word','sentence','automaton'],
    transform(operand, context = {}) {
      const from = context.from ?? operand.dimension ?? null;
      const to = context.to;
      if (!to) throw new TypeError('o_project requires context.to (target dimension)');
      return projectDimension(operand, from, to);
    },
  },
  {
    id:'o_recurse', arity:1, name:'Recursion',
    rule:'output re-enters as operand; depth logged in ledger',
    accepts:'a state + context {operator, depth=1, maxDepth=8}', positionalRule:'unary',
    invariants:['depth-limited', 'depth-logged'],
    inverseId:null, scalesObserved:['sentence','discourse','automaton'],
    transform(operand, context = {}) {
      const { operator, depth = 1, maxDepth = 8 } = context;
      if (typeof operator !== 'function') throw new TypeError('o_recurse requires context.operator (function)');
      const d = Math.min(Math.max(0, depth | 0), maxDepth);
      let value = operand;
      const trace = [];
      for (let i = 0; i < d; i++) { value = operator(value); trace.push(value); }
      return { kind:'recursion', operator:'o_recurse', depth: d, maxDepth, input: operand, output: value, trace,
               ledger: { recursionDepth: d } };
    },
  },
  {
    id:'o_transform', arity:2, name:'Mutation',
    rule:'applies a named transition rule to a state',
    accepts:'(state, rule: transition-id string | (state)=>state | {apply})', positionalRule:'(state, rule)',
    invariants:['rule-must-be-named-or-pure', 'state-identity-logged'],
    inverseId:null, scalesObserved:['word','phrase','sentence'],
    transform(operands, context = {}) {
      const [state, rule = context.rule] = asList(operands);
      if (typeof rule === 'string') {
        return { kind:'mutation', operator:'o_transform', transition: rule, input: state,
                 output: { ...(state && typeof state === 'object' ? state : { value: state }), transitionApplied: rule } };
      }
      const fn = typeof rule === 'function' ? rule : rule && rule.apply;
      if (typeof fn !== 'function') throw new TypeError('o_transform requires a named transition id or a pure rule function');
      return { kind:'mutation', operator:'o_transform', transition: rule.name || 'anonymous', input: state, output: fn(state) };
    },
  },
  {
    id:'o_automaton', arity:'variadic', name:'Automatization',
    rule:'wraps states+transitions into an executable automaton',
    accepts:'a descriptor {states, transitions} (or state list + context.transitions)', positionalRule:'descriptor-first',
    invariants:['q0-is-first-state-unless-marked-initial', 'finals-are-accepting-states'],
    inverseId:null, scalesObserved:['automaton'],
    transform(operands, context = {}) {
      const list = asList(operands);
      const desc = (list.length === 1 && list[0] && list[0].states) ? list[0]
        : { states: list, transitions: context.transitions || [] };
      const states = desc.states || [];
      const q0 = (states.find((s) => s && s.initial) || states[0] || {}).id ?? null;
      return { kind:'automaton', operator:'o_automaton', scale:'automaton',
               id: desc.id || `automaton_${states.length}`, states, transitions: desc.transitions || [],
               q0, finals: states.filter((s) => s && s.accepting).map((s) => s.id) };
    },
  },
  {
    id:'o_discourse', arity:'variadic', name:'Weave',
    rule:'composes L5 units into L6 with coherence pressure',
    accepts:'ordered sentence/phrase units', positionalRule:'ordered; coherence links adjacent units',
    invariants:['order-sensitive', 'promotes-to-discourse'],
    inverseId:null, scalesObserved:['sentence','discourse'],
    transform(operands) {
      const units = asList(operands);
      return { kind:'discourse', operator:'o_discourse', id:`discourse_${units.length}`,
               scale:'discourse', coherencePressure: units.length > 1 ? 1 / units.length : 0,
               units: units.map((u, i) => ({ position: i, unit: u })) };
    },
  },
  {
    id:'o_reverse', arity:1, name:'Mirror',
    rule:'Fu Xi reverse variation (bit order reversed)',
    accepts:'6-bit array (line 1 first)', positionalRule:'unary',
    invariants:['involution: o_reverse∘o_reverse = id'],
    inverseId:'o_reverse', scalesObserved:['grapheme','automaton'],
    transform(bits) { const b = requireBits(Array.isArray(bits) ? bits : [bits], 'o_reverse'); return [...b].reverse(); },
  },
  {
    id:'o_inverse', arity:1, name:'Shadow',
    rule:'yin↔yang line inversion (each bit flipped)',
    accepts:'6-bit array (line 1 first)', positionalRule:'unary',
    invariants:['involution: o_inverse∘o_inverse = id'],
    inverseId:'o_inverse', scalesObserved:['grapheme','automaton'],
    transform(bits) { const b = requireBits(Array.isArray(bits) ? bits : [bits], 'o_inverse'); return b.map((x) => 1 - x); },
  },
  {
    id:'o_converse', arity:1, name:'Rotation',
    rule:'180° wheel rotation — CHOICE: reverse + inverse (o_inverse∘o_reverse); the trigram-swap reading of spec §4 is the same operation on the Fu Xi circle, since swapping lower/upper trigrams and complementing all lines maps each hexagram to its antipode',
    accepts:'6-bit array (line 1 first)', positionalRule:'unary',
    invariants:['involution: o_converse∘o_converse = id'],
    inverseId:'o_converse', scalesObserved:['grapheme','automaton'],
    transform(bits) {
      const b = requireBits(Array.isArray(bits) ? bits : [bits], 'o_converse');
      return [...b].reverse().map((x) => 1 - x);
    },
  },
  {
    id:'o_nuclear', arity:1, name:'Core',
    rule:'extract nuclear hexagram: lower trigram = lines 2-3-4 (bits[1,2,3]), upper trigram = lines 3-4-5 (bits[2,3,4])',
    accepts:'6-bit array (line 1 first)', positionalRule:'unary',
    invariants:['interior-lines-only', 'deterministic'],
    inverseId:null, scalesObserved:['automaton'],
    transform(bits) {
      const b = requireBits(Array.isArray(bits) ? bits : [bits], 'o_nuclear');
      const lower = [b[1], b[2], b[3]];
      const upper = [b[2], b[3], b[4]];
      const nuclearBits = [...lower, ...upper];
      return { kind:'nuclear', operator:'o_nuclear', lower, upper, bits: nuclearBits, gate: gateFromBits(nuclearBits) };
    },
  },
  {
    id:'o_change', arity:2, name:'Becoming',
    rule:'moving lines → target state (hexagram → hexagram): xor bits with changing-lines mask',
    accepts:'(6-bit array, mask: 6-bit array | changing line numbers 1-6)', positionalRule:'(bits, mask)',
    invariants:['xor-exact', 'mask-of-zero-is-identity'],
    inverseId:null, scalesObserved:['automaton'],
    transform(operands, context = {}) {
      const [rawBits, mask = context.mask] = asList(operands);
      const b = requireBits(Array.isArray(rawBits) ? rawBits : [rawBits], 'o_change');
      if (!Array.isArray(mask)) throw new TypeError('o_change requires a mask (6-bit array or line numbers 1-6)');
      const maskBits = (mask.length === 6 && mask.every((x) => x === 0 || x === 1))
        ? mask
        : [0, 0, 0, 0, 0, 0].map((_, i) => (mask.includes(i + 1) ? 1 : 0)); // changing line numbers
      const targetBits = b.map((x, i) => x ^ maskBits[i]);
      return { kind:'becoming', operator:'o_change', mask: maskBits, bits: targetBits, gate: gateFromBits(targetBits) };
    },
  },
]);

const BY_ID = new Map(OPERATORS.map((o) => [o.id, o]));

export function operatorById(id) {
  return BY_ID.get(id) || null;
}

