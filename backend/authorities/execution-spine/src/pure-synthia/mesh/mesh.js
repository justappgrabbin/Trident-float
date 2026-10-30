// Pure Synthia Automata — L8 shared mesh: automaton registry, typed-port routing, 5 graph projections

export const PROJECTIONS = ['knowledge', 'causal', 'phase', 'temporal', 'dependency'];

export class MeshError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MeshError';
    this.code = code;
    this.details = details;
  }
}

// Normalize an automaton's ports into ATO-style {id, direction, type} records.
// Accepts either an array of {id, direction, type?} or the registry shape
// {in:[...], out:[...]} whose entries may be strings (ids) or objects.
function normalizePorts(ports) {
  const norm = (entry, index, direction) => {
    const base = typeof entry === 'string' ? { id: entry } : { ...(entry || {}) };
    return {
      id: base.id || `${direction}-${index}`,
      direction: base.direction || direction,
      type: base.type || 'json',
      schemaVersion: base.schemaVersion || '1',
      requires: [...(base.requires || [])],
      guarantees: [...(base.guarantees || [])],
    };
  };
  if (Array.isArray(ports)) return ports.map((p, i) => norm(p, i, p && p.direction));
  const out = [];
  for (const [direction, list] of [['input', (ports && ports.in) || []], ['output', (ports && ports.out) || []]]) {
    list.forEach((entry, i) => out.push(norm(entry, i, direction)));
  }
  return out;
}

function portCompatibility(output, input) {
  const issues = [];
  if (output.type !== input.type) issues.push('TYPE_MISMATCH');
  if (output.schemaVersion !== input.schemaVersion) issues.push('SCHEMA_VERSION_MISMATCH');
  const missing = input.requires.filter((invariant) => !output.guarantees.includes(invariant));
  if (missing.length) issues.push('INVARIANT_MISMATCH');
  return { compatible: issues.length === 0, issues, missing };
}

export class AutomataMesh {
  constructor({ manifestVersion = 'ato.mesh.v1' } = {}) {
    this.manifestVersion = manifestVersion;
    this.automata = new Map();
    this.connections = new Map(); // edgeId -> typed-port connection record
    this.transportConnections = new Map(); // edgeId -> state-packet transport connection
    // 5 graph projections (spec §12): separate neighbor sets per state.
    this.projections = new Map(PROJECTIONS.map((name) => [name, new Map()]));
  }

  register(automaton) {
    if (!automaton || typeof automaton.id !== 'string' || !automaton.id) {
      throw new MeshError('INVALID_AUTOMATON', 'Mesh registers automata with a string id');
    }
    if (this.automata.has(automaton.id)) {
      throw new MeshError('DUPLICATE_AUTOMATON', `Duplicate automaton: ${automaton.id}`);
    }
    this.automata.set(automaton.id, automaton);
    return automaton;
  }

  get(id) { return this.automata.get(id); }

  /**
   * StatePacket transport is deliberately separate from semantic typed-port
   * compatibility. A tool may be unable to consume another tool's raw output
   * type directly while still being reachable on the mesh learning/contact
   * bus as a qualified StatePacket. This prevents incompatible application
   * ports from silently leaving the organism disconnected.
   */
  connectTransport(fromId, toId, { operator = 'state-packet' } = {}) {
    const from = this.automata.get(fromId);
    const to = this.automata.get(toId);
    if (!from || !to) throw new MeshError('UNKNOWN_AUTOMATON', 'Both automata must be registered before transport connect', { fromId, toId });
    const id = `transport:${fromId}->${toId}`;
    const edge = Object.freeze({ id, fromId, toId, operator, type: 'state-packet' });
    this.transportConnections.set(id, edge);
    return Object.freeze({ status: 'connected', edge });
  }

  transportNeighbors(fromId) {
    return Object.freeze([...this.transportConnections.values()].filter((edge) => edge.fromId === fromId));
  }

  connect(fromId, toId, { outputPort = 'output', inputPort = 'input', operator = 'transmit' } = {}) {
    const from = this.automata.get(fromId);
    const to = this.automata.get(toId);
    if (!from || !to) throw new MeshError('UNKNOWN_AUTOMATON', 'Both automata must be registered before connect', { fromId, toId });
    const outPorts = normalizePorts(from.ports).filter((p) => p.direction === 'output');
    const inPorts = normalizePorts(to.ports).filter((p) => p.direction === 'input');
    const output = outPorts.find((p) => p.id === outputPort) || outPorts[0];
    const input = inPorts.find((p) => p.id === inputPort) || inPorts[0];
    if (!output || !input) {
      return Object.freeze({ status: 'not-reachable', reason: 'PORT_NOT_FOUND', fromId, toId, outputPort, inputPort });
    }
    const check = portCompatibility(output, input);
    if (!check.compatible) {
      return Object.freeze({ status: 'not-reachable', reason: 'INCOMPATIBLE_CONTRACT', fromId, toId, issues: check.issues, missing: check.missing });
    }
    const id = `${fromId}.${output.id}->${toId}.${input.id}`;
    const edge = Object.freeze({
      id, fromId, toId,
      outputPort: output.id, inputPort: input.id,
      fromContract: Object.freeze({ type: output.type, schemaVersion: output.schemaVersion }),
      toContract: Object.freeze({ type: input.type, schemaVersion: input.schemaVersion }),
      operator,
    });
    this.connections.set(id, edge);
    return Object.freeze({ status: 'connected', edge });
  }

  route(packet) {
    if (!packet || typeof packet.to !== 'string') {
      throw new MeshError('INVALID_PACKET', 'route() requires a StatePacket with a `to` automaton id');
    }
    const target = this.automata.get(packet.to);
    if (!target) {
      return Object.freeze({ delivered: false, reason: 'UNKNOWN_AUTOMATON', to: packet.to, packetId: packet.id || null });
    }
    // Delivery = the packet is accepted at the target's input port. The target
    // is NOT executed here: the engine runs each chained call exactly once with
    // its own parsed args plus input.packet (contract hard rule 3). Running the
    // target on delivery too would double-fire stateful automata and feed them
    // arg-less inputs they cannot interpret.
    const receipt = Object.freeze({
      delivered: true,
      to: packet.to,
      packetId: packet.id || null,
      port: 'input',
      kind: packet.kind || 'data',
    });
    // Emergent channels: every packet delivery is a CROSSING from -> to. The
    // engine attaches an EmergentChannels instance as `mesh.channels`; repeated
    // crossings promote to persistent channels (see mesh/channels.js).
    if (this.channels && typeof this.channels.recordCrossing === 'function') {
      this.channels.recordCrossing(packet.from, packet.to, packet);
    }
    return receipt;
  }

  addEdge(projection, fromState, toState, relation, metadata = {}) {
    const graph = this.projections.get(projection);
    if (!graph) throw new MeshError('UNKNOWN_PROJECTION', `Projection must be one of: ${PROJECTIONS.join(', ')}`, { projection });
    if (!graph.has(fromState)) graph.set(fromState, []);
    const edge = Object.freeze({ from: fromState, to: toState, relation, metadata: Object.freeze({ ...metadata }) });
    graph.get(fromState).push(edge);
    return edge;
  }

  neighbors(stateId, projection) {
    const graph = this.projections.get(projection);
    if (!graph) throw new MeshError('UNKNOWN_PROJECTION', `Projection must be one of: ${PROJECTIONS.join(', ')}`, { projection });
    return Object.freeze([...(graph.get(stateId) || [])]);
  }

  metrics() {
    const per = {};
    for (const [name, graph] of this.projections) {
      let edges = 0;
      const nodes = new Set();
      for (const [from, list] of graph) {
        nodes.add(from);
        edges += list.length;
        for (const edge of list) nodes.add(edge.to);
      }
      per[name] = Object.freeze({
        nodes: nodes.size,
        edges,
        avgDegree: nodes.size ? edges / nodes.size : 0,
      });
    }
    return Object.freeze({
      automata: this.automata.size,
      connections: this.connections.size,
      transportConnections: this.transportConnections.size,
      projections: Object.freeze(per),
    });
  }

  snapshot() {
    const projections = {};
    for (const [name, graph] of this.projections) {
      const edges = [];
      for (const list of graph.values()) edges.push(...list);
      projections[name] = Object.freeze(edges);
    }
    return Object.freeze({
      manifestVersion: this.manifestVersion,
      automata: Object.freeze([...this.automata.values()]
        .map((a) => (typeof a.manifest === 'function' ? a.manifest() : { id: a.id }))
        .sort((a, b) => a.id.localeCompare(b.id))),
      connections: Object.freeze([...this.connections.values()].sort((a, b) => a.id.localeCompare(b.id))),
      transportConnections: Object.freeze([...this.transportConnections.values()].sort((a, b) => a.id.localeCompare(b.id))),
      projections: Object.freeze(projections),
    });
  }
}

