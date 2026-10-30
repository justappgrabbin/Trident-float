/**
 * Computer Automata Engine Gateway — Stage-4b/Amendment-C milestone mount.
 *
 * GATEWAY/ROUTER into the donor automata organism — NOT a rewrite.
 * Wraps the pure-synthia v0.4.0 baseline swarm (donors/Back-up-/vendor/pure-synthia-v0.4.0,
 * zero-deps, bootstrapCurrentSynthiaSwarm + MemoryCheckpointStore) behind the
 * Computer's execute/route contracts:
 *
 *   execute(capability, input, context)  -> swarm.submit() real execution record
 *   findCapability(capability)           -> swarm.find() real worker manifests
 *   snapshot()                           -> swarm.snapshot() (process count, groups)
 *
 * Donor processes stay sovereign: they keep their own state/lifecycle; this
 * gateway only routes tasks in and real outputs out. Failures surface as
 * 'service:provider-failure' / 'automata-gateway:failed' bus events.
 */

import { fileURLToPath } from 'node:url';

const DONOR_SWARM = fileURLToPath(new URL(
  '../donors/Back-up-/vendor/pure-synthia-v0.4.0/src/synthia/swarm/bootstrap.mjs',
  import.meta.url,
));
const DONOR_STORES = fileURLToPath(new URL(
  '../donors/Back-up-/vendor/pure-synthia-v0.4.0/src/synthia/swarm/checkpointStores.mjs',
  import.meta.url,
));

export const SWARM_PROVIDER_ID = 'back-up-:pure-synthia-v0.4.0-swarm';

export class AutomataEngineGateway {
  constructor({ bus = null, state = null } = {}) {
    this.bus = bus;
    this.state = state;
    this.providerId = SWARM_PROVIDER_ID;
    this._swarm = null;
    this._synthia = null;
  }

  /** Lazy donor bootstrap; failure surfaces as an event, never swallowed. */
  async _boot() {
    if (this._swarm) return this._swarm;
    try {
      const { bootstrapCurrentSynthiaSwarm } = await import(DONOR_SWARM);
      const { MemoryCheckpointStore } = await import(DONOR_STORES);
      const { swarm, synthia } = await bootstrapCurrentSynthiaSwarm({ store: new MemoryCheckpointStore() });
      this._swarm = swarm;
      this._synthia = synthia;
      this.bus?.emit('automata-gateway:booted', { provider: this.providerId, processCount: swarm.snapshot().processCount });
      return swarm;
    } catch (error) {
      const failure = { provider: this.providerId, path: DONOR_SWARM, error: String(error?.message ?? error) };
      this.bus?.emit('service:provider-failure', failure);
      const err = new Error(`automata gateway donor unavailable: ${failure.error}`);
      err.cause = error;
      err.providerFailure = failure;
      throw err;
    }
  }

  async snapshot() {
    const swarm = await this._boot();
    return { provider: this.providerId, ...swarm.snapshot() };
  }

  /** Real worker manifests advertising a capability (donor routing table). */
  async findCapability(capability) {
    const swarm = await this._boot();
    return swarm.find(capability);
  }

  /**
   * Contract: execute(request) — route ONE task to a REAL donor process and
   * return the honest execution record (status may be 'failed' with the
   * donor's error; pending tasks are reported, not faked).
   */
  async execute(capability, input = null, { taskId = null, meta = {} } = {}) {
    const swarm = await this._boot();
    const workers = swarm.find(capability);
    if (!workers.length) {
      const miss = { capability, status: 'unroutable', reason: 'no donor worker advertises this capability', provider: this.providerId };
      this.bus?.emit('automata-gateway:unroutable', miss);
      return miss;
    }
    this.bus?.emit('automata-gateway:submit', { capability, taskId, workerCandidates: workers.map((w) => w.id ?? w.workerId ?? null) });
    const batch = await swarm.submit([{ id: taskId ?? `computer-${Date.now()}`, capability, input, meta }]);
    const execution = batch.executions[0] ?? null;
    const record = {
      provider: this.providerId,
      capability,
      cycle: batch.cycle,
      taskId: execution?.taskId ?? null,
      workerId: execution?.workerId ?? null,
      status: execution?.status ?? (batch.pending.length ? 'pending' : 'unknown'),
      output: execution?.output ?? null,
      error: execution?.error ?? null,
      pending: batch.pending,
    };
    if (record.status === 'failed') this.bus?.emit('automata-gateway:failed', record);
    else this.bus?.emit('automata-gateway:complete', { capability, taskId: record.taskId, workerId: record.workerId, cycle: record.cycle });
    return record;
  }
}

export default AutomataEngineGateway;

