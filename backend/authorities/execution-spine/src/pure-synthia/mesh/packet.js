// Pure Synthia Automata — qualified state packet exchanged between automata on the mesh

let PACKET_SEQUENCE = 0;

/**
 * StatePacket — the only thing automata exchange on the mesh (proposal §10:
 * qualified state packets, never memory copies).
 */
export class StatePacket {
  constructor({ id, from, to, kind = 'data', payload, address = null, activation = 1, derivationId = null } = {}) {
    if (typeof from !== 'string' || !from) throw new TypeError('StatePacket requires a `from` automaton id');
    if (typeof to !== 'string' || !to) throw new TypeError('StatePacket requires a `to` automaton id');
    this.id = id || `packet-${++PACKET_SEQUENCE}`;
    this.from = from;
    this.to = to;
    this.kind = kind;
    this.payload = payload;
    this.address = address;
    this.activation = activation;
    this.derivationId = derivationId;
  }

  toJSON() {
    return {
      id: this.id,
      from: this.from,
      to: this.to,
      kind: this.kind,
      payload: this.payload,
      address: this.address,
      activation: this.activation,
      derivationId: this.derivationId,
    };
  }

  static fromJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    return new StatePacket(data);
  }
}

