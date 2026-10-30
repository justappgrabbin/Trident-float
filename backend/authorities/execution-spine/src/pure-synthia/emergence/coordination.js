// Pure Synthia Automata — emergence: MeshCoordinator (synchronized multi-automata runs with packet propagation)

/**
 * MeshCoordinator — ported from
 *   pure-synthia-pass4-step41-REPAIRED/src/emergence/multi-automata.js
 *
 * What the source's AutomataMesh had that OUR mesh (src/mesh/mesh.js) lacks:
 * a COORDINATED RUN pattern — one input is broadcast synchronously to every
 * automaton in the mesh, each produces its own trace, and every successful
 * step propagates a state packet across the automaton's mesh connections
 * (spec §10: an instance belongs simultaneously to multiple meshes,
 * propagating qualified state packets). Our mesh routes individual packets
 * between two automata but never runs the population together; that
 * coordination pattern is what this module ports.
 *
 * Adaptations to our interfaces:
 *   - automata are our Automaton class: run() drives `delta` over
 *     input.symbols (or the tool implementation) and returns
 *     {output, trace, ledger, accepted, finalState}; a throwing automaton
 *     fails ONLY its own trace entry — coordination continues (the source let
 *     one automaton's throw abort the whole mesh run).
 *   - packets are our StatePacket class routed through mesh.route(), so every
 *     coordinated delivery is recorded as a crossing by EmergentChannels —
 *     coordination feeds the channel-promotion stats.
 *   - determinism: packet ids are counter-derived (`coord-pkt-N`); automata
 *     and connections iterate in Map insertion order; no wall-clock (the
 *     source stamped Date.now() on connections).
 *
 * NOT ported (redundant or missing substrate — see docs/MERGE_NOTES.md):
 *   - AutomataMeshRegistry: a name -> mesh map; our engine owns exactly one
 *     AutomataMesh, which already IS the registry of automata.
 *   - collapse() (product-machine composition): the source's AutomataComposer
 *     has no counterpart in this codebase, and our channel promotion
 *     (mesh/channels.js) is the mechanism by which repeated composition
 *     becomes a first-class capability here.
 */

import { StatePacket } from '../mesh/packet.js';

const SOURCE = 'pure-synthia-pass4-step41-REPAIRED/src/emergence/multi-automata.js';

const provenance = (status, note) => Object.freeze({ status, source: SOURCE, note });

/** Provenance registry for every behavioral parameter of this module. */
export const COORDINATION_PROVENANCE = Object.freeze({
  broadcastRun: provenance('SOURCE_STATEMENT', 'one input symbol stream consumed by every automaton in parallel, multi-automata.js run()'),
  packetPerTransition: provenance('SOURCE_STATEMENT', 'each successful step propagates a packet along the automaton\'s connections, multi-automata.js run(); ADAPTED to mesh.route() so deliveries record crossings'),
  allAccepted: provenance('SOURCE_STATEMENT', 'verdict: every automaton ended in an accepting state, multi-automata.js run()'),
  defaultMaxPackets: provenance('IMPLEMENTATION_CHOICE', '100-packet propagation budget per coordinated run (source had maxSteps=100 on input consumption; the budget bounds the same explosion on our connection fan-out)'),
});

export class MeshCoordinator {
  constructor({ mesh } = {}) {
    if (!mesh || !(mesh.automata instanceof Map)) {
      throw new TypeError('MeshCoordinator requires a mesh with an automata Map');
    }
    this.mesh = mesh;
    this._packetSeq = 0;
  }

  /**
   * Run every automaton (or the `only` subset) on the same input,
   * synchronously and deterministically, then propagate each automaton's
   * output as StatePackets along its mesh connections.
   *
   * Returns {
   *   input, traces: [{automatonId, accepted, finalState, steps, output} |
   *                   {automatonId, error, accepted:false}],
   *   packets: [route receipts], packetCount, allAccepted
   * }
   */
  run(input, { only = null, maxPackets = 100, context = {} } = {}) {
    const symbols = Array.isArray(input) ? input
      : typeof input === 'string' ? [...input]
        : (input && Array.isArray(input.symbols) ? input.symbols : []);
    const onlySet = Array.isArray(only) ? new Set(only) : null;

    const traces = [];
    const packets = [];
    const connections = [...this.mesh.connections.values()];

    for (const [id, automaton] of this.mesh.automata) {
      if (onlySet && !onlySet.has(id)) continue;
      let trace;
      try {
        const run = automaton.run({
          args: [input],
          raw: typeof input === 'string' ? input : null,
          symbols,
          flags: {},
          address: null,
          packet: null,
        }, context);
        trace = {
          automatonId: id,
          accepted: run.accepted === true,
          finalState: run.finalState ?? null,
          steps: Array.isArray(run.trace) ? run.trace.length : 0,
          output: run.output ?? null,
        };
      } catch (error) {
        // One failing automaton must not abort the coordinated run.
        trace = { automatonId: id, accepted: false, finalState: null, steps: 0, output: null, error: String(error && error.message || error) };
      }
      traces.push(trace);

      // Propagate this automaton's output along its mesh connections
      // (SOURCE_STATEMENT: packet per successful step; ADAPTED: one packet per
      // connection carrying the run output, delivered via mesh.route so the
      // crossing is recorded by EmergentChannels).
      if (!trace.error) {
        for (const conn of connections) {
          if (conn.fromId !== id) continue;
          if (packets.length >= maxPackets) break;
          const packet = new StatePacket({
            id: `coord-pkt-${++this._packetSeq}`,
            from: id,
            to: conn.toId,
            kind: 'data',
            payload: trace.output,
            derivationId: null,
          });
          packets.push(this.mesh.route(packet));
        }
      }
    }

    return {
      input,
      traces,
      packets,
      packetCount: packets.length,
      // SOURCE_STATEMENT: allAccepted = every participant ended accepting.
      allAccepted: traces.length > 0 && traces.every((t) => t.accepted),
      provenance: COORDINATION_PROVENANCE.broadcastRun,
    };
  }
}

export default MeshCoordinator;

