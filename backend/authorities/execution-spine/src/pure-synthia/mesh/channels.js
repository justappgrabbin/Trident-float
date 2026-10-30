// Pure Synthia Automata — mesh: emergent channels (temporary crossings promote to persistent channels)

/**
 * EmergentChannels — the self-cultivation principle made mechanical. When two
 * automata connect and a packet crosses from one to the other, the connection
 * itself is recorded as a CROSSING. A crossing used once is temporary; a
 * crossing used repeatedly (>= CHANNEL_PROMOTION_THRESHOLD) is promoted to a
 * persistent CHANNEL — functionality neither automaton contains independently:
 * the channel becomes a composite capability {tools:[a,b], compose:
 * 'sequential'} that the learning orchestrator can route requests through.
 *
 * Determinism: no wall-clock; `createdSeq`/`promotedSeq` come from an internal
 * monotone counter, so replaying the same packet history reproduces the same
 * crossings and promotions.
 */

export const CHANNEL_PROMOTION_THRESHOLD = 3;

export class CrossingRecord {
  constructor({ a, b, uses = 0, packetKeys = [], promoted = false, createdSeq = 0, promotedSeq = null } = {}) {
    if (typeof a !== 'string' || !a || typeof b !== 'string' || !b) {
      throw new TypeError('CrossingRecord requires automaton ids a and b');
    }
    this.a = a;
    this.b = b;
    this.uses = uses;
    this.packetKeys = [...packetKeys];
    this.promoted = promoted;
    this.createdSeq = createdSeq;
    this.promotedSeq = promotedSeq;
  }

  key() {
    return `${this.a}~${this.b}`;
  }

  toJSON() {
    return {
      a: this.a,
      b: this.b,
      uses: this.uses,
      packetKeys: [...this.packetKeys],
      promoted: this.promoted,
      createdSeq: this.createdSeq,
      promotedSeq: this.promotedSeq,
    };
  }
}

export class EmergentChannels {
  constructor({ mesh = null, threshold = CHANNEL_PROMOTION_THRESHOLD } = {}) {
    this.mesh = mesh;
    this.threshold = threshold;
    this._crossings = new Map(); // "a~b" -> CrossingRecord
    this._seq = 0; // internal monotone counter (no wall-clock)
  }

  /**
   * Record one packet crossing from aId to bId. Repeated useful interaction
   * (uses >= threshold) promotes the temporary crossing to a persistent
   * channel exactly once.
   */
  recordCrossing(aId, bId, packet = null) {
    const record = new CrossingRecord({ a: aId, b: bId });
    const key = record.key();
    let existing = this._crossings.get(key);
    if (!existing) {
      record.createdSeq = ++this._seq;
      this._crossings.set(key, record);
      existing = record;
    }
    existing.uses += 1;
    const packetKey = packet && (packet.id ?? packet.derivationId);
    if (packetKey !== null && packetKey !== undefined) existing.packetKeys.push(packetKey);
    if (!existing.promoted && existing.uses >= this.threshold) {
      existing.promoted = true;
      existing.promotedSeq = ++this._seq;
    }
    return Object.freeze(existing.toJSON());
  }

  get(aId, bId) {
    const record = this._crossings.get(`${aId}~${bId}`);
    return record ? Object.freeze(record.toJSON()) : null;
  }

  crossings() {
    return [...this._crossings.values()].map((r) => Object.freeze(r.toJSON()));
  }

  /** Persistent channels only — the promoted crossings. */
  promoted() {
    return this.crossings().filter((c) => c.promoted);
  }

  /**
   * When (and only when) the crossing a→b has promoted, the channel is itself
   * a capability: a sequential composition of the two member tools.
   */
  emergentCapability(aId, bId) {
    const record = this._crossings.get(`${aId}~${bId}`);
    if (!record || !record.promoted) return null;
    return Object.freeze({
      id: `channel:${aId}~${bId}`,
      kind: 'emergent-channel',
      compose: 'sequential',
      tools: [aId, bId],
      uses: record.uses,
      promotedSeq: record.promotedSeq,
      description: `Emergent channel ${aId} -> ${bId}: a crossing used ${record.uses} times became a persistent channel; the connection itself composes the two tools sequentially.`,
    });
  }
}

export default EmergentChannels;

