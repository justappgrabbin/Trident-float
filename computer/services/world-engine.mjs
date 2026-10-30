/**
 * World Engine Gateway — Stage 4e.
 * GATEWAY into the recovered glowing-winner donor (EmbodiedWorldEngine.ts,
 * executed via esbuild .ported.mjs, NO logic changes). The donor stays
 * sovereign; this wrapper routes Computer grammar-v1 events into real donor
 * world actions and returns honest execution records.
 *
 * Donor capability mapping (real donor methods only):
 *   {spawn:{name,element}}   -> engine.createAgent (5W 'emergence' collapse)
 *   {intent:{agent,text}}    -> engine.processIntent (bond/chart/store/idle)
 *   {move:{agent,x,z}}       -> engine.moveAgent (sets target, walking)
 *   {tick_ms}                -> engine.start()/stop() real simulation ticks
 * Known donor limitations: Placement13 ephemeris is a PLACEHOLDER (documented);
 * movement integrates over real ticks (position approaches target over time).
 */

import { fileURLToPath } from 'node:url';

const WORLD_ENGINE = fileURLToPath(new URL('../donors/recovered/glowing-winner/EmbodiedWorldEngine.ported.mjs', import.meta.url));

export const WORLD_PROVIDER_ID = 'recovered:glowing-winner-world-engine';

export class WorldEngineGateway {
  constructor({ bus = null } = {}) {
    this.bus = bus;
    this.providerId = WORLD_PROVIDER_ID;
    this._module = null;
    this._engine = null;
  }

  async _load() {
    try {
      this._module ??= await import(WORLD_ENGINE);
      this._engine ??= new this._module.EmbodiedWorldEngine();
      return this._engine;
    } catch (error) {
      const failure = { provider: WORLD_PROVIDER_ID, path: WORLD_ENGINE, error: String(error?.message ?? error) };
      this.bus?.emit('service:provider-failure', failure);
      const err = new Error(`world-engine donor provider unavailable (${failure.error})`);
      err.cause = error;
      throw err;
    }
  }

  /** Reset (tests); does not mutate donor code. */
  reset() { this._engine = null; }

  /**
   * Route a grammar-v1-shaped event into the donor world. Returns an honest
   * record; failures surface (thrown + bus event), never swallowed.
   */
  async process(event = {}) {
    const engine = await this._load();
    const input = event.input ?? event;
    const record = { provider: WORLD_PROVIDER_ID, actions: [], events_5w_before: engine.getHistory().length };
    try {
      if (input.spawn) {
        const agent = engine.createAgent(input.spawn.name ?? event.actor_id ?? 'agent', input.spawn.element ?? 'void');
        record.actions.push({ action: 'createAgent', agent_id: agent.id, name: agent.name, address: agent.address });
        record.agent_id = agent.id;
      }
      if (input.intent) {
        const r = engine.processIntent(input.intent.agent ?? record.agent_id, input.intent.text);
        record.actions.push({ action: 'processIntent', mode: r.mode, target: r.target, confidence: r.confidence });
      }
      if (input.move) {
        engine.moveAgent(input.move.agent ?? record.agent_id, input.move.x, input.move.z);
        const a = engine.getAgent(input.move.agent ?? record.agent_id);
        record.actions.push({ action: 'moveAgent', target: { ...a.target }, animationState: a.animationState });
      }
      if (input.tick_ms) {
        engine.start();
        await new Promise((res) => setTimeout(res, input.tick_ms));
        engine.stop();
        record.actions.push({ action: 'ticks', tick_ms: input.tick_ms });
      }
      if (input.consolidate) {
        const a = engine.getAgent(input.consolidate.agent ?? record.agent_id);
        if (!a) throw new Error(`consolidate: agent not found ${input.consolidate.agent}`);
        engine.consolidateMemory(a); // real donor method (TS-private, runtime-callable)
        record.actions.push({ action: 'consolidateMemory', longTerm: a.memory.longTerm.size, shortTerm: a.memory.shortTerm.length });
      }
    } catch (error) {
      this.bus?.emit('world-engine:action-failed', { provider: WORLD_PROVIDER_ID, error: String(error?.message ?? error), input });
      throw error;
    }
    record.events_5w_after = engine.getHistory().length;
    record.snapshot = this.snapshot();
    this.bus?.emit('world-engine:processed', { provider: WORLD_PROVIDER_ID, actions: record.actions.length });
    return record;
  }

  /** Observe contract: honest world snapshot (positions, memory, 5W substrate). */
  snapshot() {
    if (!this._engine) return { agents: [], places: [], fiveW_history: 0 };
    const e = this._engine;
    return {
      agents: e.getAllAgents().map((a) => ({
        id: a.id, name: a.name, position: { ...a.position }, target: a.target ? { ...a.target } : null,
        animationState: a.animationState, memory: { shortTerm: a.memory.shortTerm.length, longTerm: a.memory.longTerm.size },
        connections: a.connections.size, address: a.address,
      })),
      places: e.getAllPlaces().map((p) => ({ id: p.id, name: p.name, type: p.type })),
      fiveW_history: e.getHistory().length,
    };
  }
}

export default WorldEngineGateway;

