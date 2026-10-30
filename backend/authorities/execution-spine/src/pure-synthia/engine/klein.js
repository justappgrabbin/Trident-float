// Pure Synthia Automata — engine: the Klein contextual operator K_i(C_t) = (relation, intensity, direction)

/**
 * The Klein contextual operator, first-class.
 *
 * The source document's formal definition: every tool i is a contextual
 * operator
 *
 *   K_i(C_t) = (relation, intensity, direction)
 *
 * mapping a context C_t = {input, address, dimension, meshState} to a frozen
 * triple:
 *
 *   relation    the tool's dominant named-transition id for that input class,
 *               deterministically derived: the tool is RUN on the context's
 *               input (state snapshot/restored, so K is side-effect free) and
 *               its trace is classified — the most frequent non-envelope
 *               transition (envelope = ignition/automatize, which every run
 *               emits), ties broken by first occurrence. Fallback when a run
 *               yields no internal steps: descriptor automatonForm.
 *   intensity   ∈ [0,1], from activation/ledger: statesGenerated normalized,
 *               s/(s + |states|); when context.meshState carries a numeric
 *               `activation` for the tool, the ledger measure is blended
 *               50/50 with it (clamped).
 *   direction   ∈ {'toward','away','neutral'}: 'toward' when the run ended
 *               accepting with internal work, 'away' when it ended
 *               non-accepting, 'neutral' when the run did no internal work
 *               (envelope only) or could not run at all.
 *
 * CHANNEL ≠ NEURAL NETWORK — a correction this module records explicitly.
 * In this system a "channel" is a native computational behavior of the mesh:
 * a temporary crossing that, used ≥ 3 times, promotes to a persistent
 * composite capability (src/mesh/channels.js). No weights are trained, no
 * gradient exists, no neurons are simulated. Any neural architecture is only
 * an ANALOGUE: the ARCHITECTURES table in ato-core is an analogy map between
 * channel behaviors and neural motifs, not an identity. Composition J below
 * is therefore defined directly on K-triples via the emergent-channel
 * compose — not on any neural composition operator.
 *
 * Determinism: no wall-clock, no randomness. K(C) is a pure function of the
 * context and the tool's (snapshotted) state: the run is bracketed by
 * exportState()/hydrate() plus lifecycle/calls restore, so evaluating K never
 * perturbs the tool or the engine's replay chain.
 */

const ENVELOPE_TRANSITIONS = new Set(['ignition', 'automatize']);
const DIRECTIONS = new Set(['toward', 'away', 'neutral']);

const clamp01 = (v) => Math.min(1, Math.max(0, v));

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Dominant non-envelope named transition of a trace (ties: first occurrence). */
function dominantTransition(trace) {
  const counts = new Map(); // transitionId -> {count, firstSeq}
  for (const step of Array.isArray(trace) ? trace : []) {
    const id = step && step.transition;
    if (!id || ENVELOPE_TRANSITIONS.has(id)) continue;
    const entry = counts.get(id) || { count: 0, firstSeq: step.seq ?? counts.size };
    entry.count += 1;
    counts.set(id, entry);
  }
  let best = null;
  for (const [id, entry] of counts) {
    if (!best || entry.count > best.entry.count
      || (entry.count === best.entry.count && entry.firstSeq < best.entry.firstSeq)) {
      best = { id, entry };
    }
  }
  return best ? best.id : null;
}

/**
 * kleinOperator(toolAutomaton) → K(context) — the tool as a contextual
 * operator. The returned closure also carries:
 *   K.toolId         the automaton id
 *   K.automatonForm  the descriptor automaton form (relation fallback)
 *   K.compose        (otherK, context) → J(K, otherK, context), see kleinCompose
 */
export function kleinOperator(toolAutomaton) {
  if (!toolAutomaton || typeof toolAutomaton.run !== 'function') {
    throw new TypeError('kleinOperator requires an Automaton (an object with run())');
  }
  const tool = toolAutomaton;

  const K = (context = {}) => {
    // Snapshot/restore: K is an observation, not an interaction. The tool's
    // persistent ownedState, call counter and lifecycle are restored after
    // the probe run, so K(C) twice is identical and replay chains are intact.
    const savedState = typeof tool.exportState === 'function' ? tool.exportState() : null;
    const savedCalls = tool.calls;
    const savedLifecycle = tool.lifecycle;

    let result = null;
    let runError = null;
    try {
      result = tool.run(context.input, {
        klein: true,
        stateSpace: context.stateSpace ?? null,
        address: context.address || null,
        dimension: context.dimension || tool.dimension || null,
        meshState: context.meshState || null,
      });
    } catch (error) {
      runError = error;
    } finally {
      if (typeof tool.hydrate === 'function') tool.hydrate(savedState);
      tool.calls = savedCalls;
      tool.lifecycle = savedLifecycle;
    }

    const trace = result && Array.isArray(result.trace) ? result.trace : [];
    const internalSteps = trace.filter((s) => s && !ENVELOPE_TRANSITIONS.has(s.transition));
    const relation = dominantTransition(trace)
      || tool.automatonForm
      || tool.constructor?.name
      || 'unknown';

    const statesGenerated = result && result.ledger ? result.ledger.statesGenerated || 0 : 0;
    const stateCount = Math.max(1, Array.isArray(tool.states) ? tool.states.length : 1);
    let intensity = statesGenerated / (statesGenerated + stateCount);
    const activation = context.meshState && typeof context.meshState.activation === 'number'
      ? clamp01(context.meshState.activation)
      : null;
    if (activation !== null) intensity = (intensity + activation) / 2;
    intensity = clamp01(intensity);

    let direction;
    if (runError || !result) direction = 'neutral';
    else if (result.accepted === false) direction = 'away';
    else if (internalSteps.length === 0) direction = 'neutral';
    else direction = 'toward';

    return Object.freeze({ relation, intensity, direction });
  };

  K.toolId = tool.id;
  K.automatonForm = tool.automatonForm || null;
  K.compose = (otherK, context = {}) => kleinCompose(K, otherK, context);
  return Object.freeze(K);
}

/**
 * J(K_i, K_j, C) — composition via the emergent-channel compose: two tools
 * whose crossing has become a channel behave as one contextual operator
 * (channel:a~b — see mesh/channels.js emergentCapability). The composed
 * triple is NOT the sum of the components:
 *   relation  = 'channel:<a>~<b>'   (a new relation, neither component's)
 *   intensity = geometric mean √(I_i · I_j)   (not I_i + I_j)
 *   direction = the DOWNSTREAM tool's direction (the channel flows a → b)
 */
export function kleinCompose(Ki, Kj, context = {}) {
  if (typeof Ki !== 'function' || typeof Kj !== 'function') {
    throw new TypeError('kleinCompose requires two Klein operators');
  }
  const ti = Ki(context);
  const tj = Kj(context);
  return Object.freeze({
    relation: `channel:${Ki.toolId}~${Kj.toolId}`,
    intensity: clamp01(Math.sqrt(ti.intensity * tj.intensity)),
    direction: tj.direction,
  });
}

/** The naive sum J is compared against: relation concatenation, intensity sum. */
function naiveSum(ti, tj) {
  return {
    relation: `${ti.relation}+${tj.relation}`,
    intensity: clamp01(ti.intensity + tj.intensity),
    direction: ti.direction === tj.direction ? ti.direction : 'neutral',
  };
}

/**
 * kleinInvariants(K, context, samples, {composeWith}) — self-test the operator:
 *   deterministic          K(C) === K(C) for an identical context (run twice,
 *                          deep-equal).
 *   contextDependent       at least two distinct sample contexts yield
 *                          different triples.
 *   compositionalEmergence J(K_i,K_j,C) ≠ K_i(C)+K_j(C), demonstrated by
 *                          composing with a second tool's operator via the
 *                          emergent-channel compose (kleinCompose) and noting
 *                          the composed triple is not the sum. Requires
 *                          `composeWith` (a second Klein operator).
 */
export function kleinInvariants(K, context, samples = [], { composeWith = null } = {}) {
  if (typeof K !== 'function') throw new TypeError('kleinInvariants requires a Klein operator');

  const first = K(context);
  const second = K(context);
  const deterministic = deepEqual(first, second);

  const triples = (Array.isArray(samples) ? samples : []).map((sample) => K(sample));
  const distinct = new Set(triples.map((t) => JSON.stringify(t)));
  const contextDependent = distinct.size >= 2;

  let compositionalEmergence = false;
  let composition = null;
  if (typeof composeWith === 'function') {
    const ti = K(context);
    const tj = composeWith(context);
    const composed = kleinCompose(K, composeWith, context);
    const sum = naiveSum(ti, tj);
    compositionalEmergence = composed.relation === `channel:${K.toolId}~${composeWith.toolId}`
      && composed.relation !== ti.relation
      && composed.relation !== tj.relation
      && !deepEqual(composed, sum);
    composition = Object.freeze({
      Ki: ti,
      Kj: tj,
      composed,
      naiveSum: sum,
      note: 'J(Ki,Kj,C) via the emergent-channel compose is not Ki(C)+Kj(C): '
        + 'relation becomes channel:a~b (a new relation), intensity is the '
        + 'geometric mean (not the sum), direction is the downstream tool\'s.',
    });
  }

  return Object.freeze({
    deterministic,
    contextDependent,
    compositionalEmergence,
    ...(composition ? { composition } : {}),
  });
}

export const KLEIN_DIRECTIONS = Object.freeze([...DIRECTIONS]);

export default kleinOperator;


