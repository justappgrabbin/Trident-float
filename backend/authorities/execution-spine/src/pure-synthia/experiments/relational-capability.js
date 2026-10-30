// Pure Synthia Automata — experiments: H10 relational capability (the decisive experiment, pre-registered)

/**
 * HYPOTHESIS H10 (pre-registered — this comment block is the registration,
 * frozen before the first run):
 *
 *   A relationship R creates a capability neither automaton possesses alone:
 *
 *     A(Q) = 0  ∧  B(Q) = 0  but  F(A,B,R,C,H)(Q) = 1
 *     ablation:  F(A,B,∅)(Q) = 0
 *     control:   F(A,B,R_shuffled)(Q) = 0
 *     transfer:  F(C,D,R)(Q') evaluated (reported either way)
 *
 * Concrete task Q (frozen):
 *   "Given six binary lines and a transform, produce a spoken-English
 *    description of the resulting hexagram."
 *   lines = [1,0,0,0,1,0] (King Wen gate 3, Fu Xi decimal 17), transform =
 *   'shadow' (yin↔yang inversion) → transformed hexagram [0,1,1,1,0,1] =
 *   gate 50 (Fu Xi 46), lower trigram Gentle (Wind), upper Clinging (Fire).
 *
 *   A = iching-grammar  — CAN compute hexagrams (cast/transform/resolve),
 *                         CANNOT produce a narrative utterance.
 *   B = conversation    — CAN produce formatted utterances, CANNOT compute
 *                         hexagrams.
 *
 * CAPABILITY PREDICATE (frozen, pure, honest — see capability() below):
 *   capability(output, target) = 1 iff the output
 *     1. is (or carries) a string utterance — a spoken artifact, not a data
 *        structure;
 *     2. is a FORMATTED utterance: it bears conversation structure — a
 *        [weave:<source>] line or numbered contribution lines;
 *     3. contains the transformed hexagram's gate number as a token; and
 *     4. contains both transformed trigram names.
 *   The predicate is fixed by this registration. If the real chain fails it,
 *   the packet plumbing is what gets fixed — never the predicate.
 *
 * CONDITIONS (all five run on every experiment run):
 *   A          A alone on Q (structured lines+transform) → hexagram object,
 *              not an utterance.
 *   B          B alone on raw Q text, no packet → unresolved-context turn.
 *   noRelation F(A,B,∅): A and B both run independently on Q; outputs
 *              concatenated WITHOUT packet exchange — no single artifact is
 *              both computed and spoken.
 *   shuffled   F(A,B,R_shuffled): the chain runs, but packet.payload is
 *              replaced by a deterministically shuffled string (mulberry32,
 *              seed 0xH10 below) before B runs — the channel topology holds,
 *              the relational CONTENT is destroyed.
 *   chain      F(A,B,R): the real sequential packet channel — A runs, its
 *              output crosses the mesh as a StatePacket (mesh.route records
 *              the crossing), B weaves the packet into an utterance.
 *
 * INTERPRETATION (pre-registered decision rule):
 *   'supported'  iff chain = 1 ∧ A = B = noRelation = shuffled = 0;
 *   'rejected'   iff chain = 0 (the relation failed to create the capability);
 *   'inconclusive' otherwise (a baseline succeeded without the relation).
 *
 * TRANSFER: C = klein-analogy, D = conversation, Q' =
 *   "speak the result of an analogy A:B::C:? over vocab [male female young
 *    adult love hate light dark]" with A={male}, B={female}, C={young},
 *   mode XOR. Same relational operator (sequential packet channel), different
 *   operands. Transfer capability: a formatted utterance containing every
 *   item of C's analogy result. Reported honestly, 0 or 1.
 */

import { StatePacket } from '../mesh/packet.js';
import { Derivation } from '../engine/derivation.js';
import { mulberry32 } from '../state-space/constants.js';

// Pre-registered task Q (frozen).
export const Q = Object.freeze({
  text: "Given six binary lines [1,0,0,0,1,0] and the transform 'shadow', produce a spoken-English description of the resulting hexagram.",
  lines: Object.freeze([1, 0, 0, 0, 1, 0]),
  transform: 'shadow',
  changingLines: Object.freeze([]),
});

// Transfer task Q' (frozen).
export const Q_PRIME = Object.freeze({
  text: 'speak the result of an analogy A:B::C:? over vocab [male female young adult love hate light dark]',
  vocab: Object.freeze(['male', 'female', 'young', 'adult', 'love', 'hate', 'light', 'dark']),
  A: Object.freeze(['male']),
  B: Object.freeze(['female']),
  C: Object.freeze(['young']),
  mode: 'xor',
});

// Pre-registered shuffle seed for the R_shuffled control (0xH10-ish constant).
const SHUFFLE_SEED = 0x8110;

/** Deterministic Fisher–Yates character shuffle (mulberry32, fixed seed). */
export function shuffledString(text, seed = SHUFFLE_SEED) {
  const chars = [...String(text)];
  const rand = mulberry32(seed);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * The pre-registered capability predicate — pure and frozen.
 * output: a run output (object) or a raw string.
 * target: {gate: number, trigrams: [lowerName, upperName]}.
 * Returns 0 | 1.
 */
export function capability(output, target) {
  const text = typeof output === 'string' ? output
    : (output && typeof output.utterance === 'string' ? output.utterance : null);
  if (text === null) return 0; // not a spoken utterance at all
  // (2) formatted utterance: conversation weave marker or numbered lines.
  const formatted = /\[weave:[a-z0-9-]+\]/i.test(text) || /(^|\n)\s*\d+\.\s+\S/.test(text);
  if (!formatted) return 0;
  // (3) the transformed hexagram's gate number as a standalone token.
  if (!new RegExp(`(^|[^0-9])${target.gate}([^0-9]|$)`).test(text)) return 0;
  // (4) both trigram names.
  const lower = text.toLowerCase();
  for (const name of target.trigrams) {
    if (!lower.includes(String(name).toLowerCase())) return 0;
  }
  return 1;
}

/** Transfer capability: formatted utterance containing every result term. */
export function transferCapability(output, terms) {
  const text = typeof output === 'string' ? output
    : (output && typeof output.utterance === 'string' ? output.utterance : null);
  if (text === null) return 0;
  const formatted = /\[weave:[a-z0-9-]+\]/i.test(text) || /(^|\n)\s*\d+\.\s+\S/.test(text);
  if (!formatted) return 0;
  const lower = text.toLowerCase();
  return terms.every((t) => lower.includes(String(t).toLowerCase())) ? 1 : 0;
}

const LEDGER_FIELDS = ['primitivesActivated', 'statesGenerated', 'edgesTraversed',
  'operationsExecuted', 'recursionDepth', 'activeAutomata', 'transitionCount'];

export class RelationalCapabilityExperiment {
  constructor({ engine } = {}) {
    if (!engine || !engine.mesh) throw new TypeError('RelationalCapabilityExperiment requires {engine}');
    this.engine = engine;
  }

  /**
   * Run all five conditions plus the transfer probe. Every tool run is
   * state-snapshot/restored so the experiment is side-effect free on the
   * automata (re-running it reproduces the identical report); packets cross
   * the real mesh (crossings are recorded — that is the point of R).
   */
  run() {
    const engine = this.engine;
    const A = engine.mesh.get('iching-grammar');
    const B = engine.mesh.get('conversation');
    const C = engine.mesh.get('klein-analogy');
    if (!A || !B || !C) throw new Error('H10 requires iching-grammar, conversation and klein-analogy on the mesh');

    const ledger = Object.fromEntries(LEDGER_FIELDS.map((f) => [f, 0]));
    const derivationIds = [];
    let seq = 0;

    // Isolated run: snapshot ownedState/calls/lifecycle, run, restore.
    const runIsolated = (tool, input) => {
      const savedState = typeof tool.exportState === 'function' ? tool.exportState() : null;
      const savedCalls = tool.calls;
      const savedLifecycle = tool.lifecycle;
      try {
        return tool.run(input, { experiment: 'H10' });
      } finally {
        if (typeof tool.hydrate === 'function') tool.hydrate(savedState);
        tool.calls = savedCalls;
        tool.lifecycle = savedLifecycle;
      }
    };

    const record = (condition, input, primitives, operators, output, evaluation, runLedgers) => {
      for (const l of runLedgers) {
        for (const f of LEDGER_FIELDS) ledger[f] += (l && l[f]) || 0;
      }
      const derivation = new Derivation({
        id: `h10-drv-${String(++seq).padStart(2, '0')}`,
        input,
        primitives,
        operators,
        output,
        evaluation,
        ledger: null, // per-condition ledgers merged into the report ledger
      });
      derivationIds.push(derivation.id);
      return derivation;
    };

    // The sequential packet channel R: A's output crosses to B as a
    // StatePacket through the real mesh (crossing recorded), then B runs
    // with input.packet — the existing two-call chaining rule.
    const chainVia = (aTool, aInput, bTool, bText, { mutatePayload = null } = {}) => {
      const aRun = runIsolated(aTool, aInput);
      const payload = mutatePayload ? mutatePayload(aRun.output) : aRun.output;
      const packet = new StatePacket({
        id: `h10-pkt-${String(seq + 1).padStart(2, '0')}`,
        from: aTool.id,
        to: bTool.id,
        kind: 'data',
        payload,
        derivationId: `h10-drv-${String(seq + 1).padStart(2, '0')}`,
      });
      const receipt = engine.mesh.route(packet); // the crossing (relation R)
      const bRun = runIsolated(bTool, { text: bText, packet });
      return { aRun, bRun, packet, receipt, ledgers: [aRun.ledger, bRun.ledger] };
    };

    // ---- condition A: A(Q) alone -----------------------------------------
    const aOnly = runIsolated(A, { lines: [...Q.lines], transform: Q.transform, changingLines: [...Q.changingLines] });
    const target = Object.freeze({
      gate: aOnly.output.transformed.gate,
      trigrams: Object.freeze([aOnly.output.transformed.lower.name, aOnly.output.transformed.upper.name]),
    });
    const rA = capability(aOnly.output, target);
    record('A-alone', Q.text, [A.id], ['o_automaton'], { capability: rA }, { accepted: aOnly.accepted }, [aOnly.ledger]);

    // ---- condition B: B(Q) alone ------------------------------------------
    const bOnly = runIsolated(B, { text: Q.text });
    const rB = capability(bOnly.output, target);
    record('B-alone', Q.text, [B.id], ['o_automaton'], { capability: rB }, { accepted: bOnly.accepted }, [bOnly.ledger]);

    // ---- condition noRelation: F(A,B,∅) — both on raw Q, NO packet --------
    const nrA = runIsolated(A, { lines: [...Q.lines], transform: Q.transform, changingLines: [...Q.changingLines] });
    const nrB = runIsolated(B, { text: Q.text });
    const concatenated = `${JSON.stringify(nrA.output)}\n${nrB.output.utterance}`;
    const rNoRelation = capability(concatenated, target);
    record('no-relation', Q.text, [A.id, B.id], ['o_automaton'], { capability: rNoRelation },
      { accepted: nrA.accepted && nrB.accepted }, [nrA.ledger, nrB.ledger]);

    // ---- condition shuffled: F(A,B,R_shuffled) -----------------------------
    const shuffledRun = chainVia(A, { lines: [...Q.lines], transform: Q.transform, changingLines: [...Q.changingLines] },
      B, Q.text, { mutatePayload: (payload) => shuffledString(JSON.stringify(payload)) });
    const rShuffled = capability(shuffledRun.bRun.output, target);
    record('shuffled-relation', Q.text, [A.id, B.id], ['o_automaton', 'o_sequence'],
      { capability: rShuffled }, { accepted: shuffledRun.bRun.accepted, delivered: shuffledRun.receipt.delivered },
      shuffledRun.ledgers);

    // ---- condition chain: F(A,B,R) — the real sequential packet channel ---
    const chain = chainVia(A, { lines: [...Q.lines], transform: Q.transform, changingLines: [...Q.changingLines] },
      B, Q.text);
    const rChain = capability(chain.bRun.output, target);
    record('chain', Q.text, [A.id, B.id], ['o_automaton', 'o_sequence'], { capability: rChain },
      { accepted: chain.bRun.accepted, delivered: chain.receipt.delivered }, chain.ledgers);

    const results = { A: rA, B: rB, noRelation: rNoRelation, shuffled: rShuffled, chain: rChain };

    // ---- transfer: F(C,D,R)(Q') -------------------------------------------
    const transfer = chainVia(C, {
      vocab: [...Q_PRIME.vocab], A: [...Q_PRIME.A], B: [...Q_PRIME.B], C: [...Q_PRIME.C], mode: Q_PRIME.mode,
    }, B, Q_PRIME.text);
    const transferTerms = transfer.aRun.output && Array.isArray(transfer.aRun.output.result)
      ? [...transfer.aRun.output.result] : [];
    const transferResult = transferCapability(transfer.bRun.output, transferTerms);
    record('transfer', Q_PRIME.text, [C.id, B.id], ['o_automaton', 'o_sequence'], { capability: transferResult },
      { accepted: transfer.bRun.accepted, delivered: transfer.receipt.delivered }, transfer.ledgers);

    // ---- interpretation (pre-registered decision rule) ---------------------
    let interpretation;
    let reason;
    if (rChain === 1 && rA === 0 && rB === 0 && rNoRelation === 0 && rShuffled === 0) {
      interpretation = 'supported';
      reason = 'chain=1 with every baseline and control at 0: the sequential packet relation created a capability neither automaton possesses alone.';
    } else if (rChain === 0) {
      interpretation = 'rejected';
      reason = 'chain=0: the relation did not create the capability (predicate untouched; the plumbing is what would need fixing).';
    } else {
      interpretation = 'inconclusive';
      const leaked = [['A', rA], ['B', rB], ['noRelation', rNoRelation], ['shuffled', rShuffled]]
        .filter(([, v]) => v === 1).map(([k]) => k);
      reason = `chain=1 but capability also present without the relation in: ${leaked.join(', ')}.`;
    }

    return {
      hypothesis: 'H10',
      statement: 'a relationship R creates a capability neither automaton possesses alone',
      Q: Q.text,
      A: A.id,
      B: B.id,
      target,
      results,
      transfer: {
        C: C.id,
        D: B.id,
        "Q'": Q_PRIME.text,
        result: transferResult,
        analogyResult: transferTerms,
        note: transferResult === 1
          ? 'the same relational operator (sequential packet channel) transfers to novel operands (klein-analogy → conversation).'
          : 'transfer did not achieve the capability on novel operands — reported as observed.',
      },
      artifacts: {
        chainUtterance: chain.bRun.output.utterance,
        shuffledUtterance: shuffledRun.bRun.output.utterance,
        noRelationConcatenation: concatenated,
      },
      interpretation,
      reason,
      derivationIds,
      ledger,
    };
  }
}

export default RelationalCapabilityExperiment;

