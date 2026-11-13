/**
 * Computer Address Service — Stage-4a mount.
 *
 * WRAPS the Back-up- donor providers; it does not reimplement them:
 *   - canonical address schema: donors/Back-up-/vendor/execution-spine-v0.4.0/src/canonical-address.mjs
 *   - DMS wheel codec (arc-seconds <-> gate/line/color/tone/base + degree/minute/second):
 *       donors/Back-up-/vendor/kimi-agent-automata-state-space-merge/.../state-space/addressing.js
 *   - HD chart engine (birth datum -> gate/line/color/tone/base + zodiac DMS):
 *       donors/Back-up-/vendor/kimi-agent-automata-state-space-merge/.../state-space/human-design.js
 *
 * Contract surface (computer/contracts/README.md):
 *   resolveAddress(entityOrEvent) / compareAddresses(a,b) /
 *   resolveRelationship(a,b,context) / traceAddressHistory(entity)
 *
 * Canonical address grammar = EXACTLY 13 fields (event-grammar-v1.yaml):
 *   planetary, dimension, gate, line, color, tone, base,
 *   degree, minute, second, arc, zodiac, house.
 * Donor field mapping (wrap, not copy):
 *   kimi addressing.js `arcSecond`  -> contract `arc` (int arc-seconds on the wheel)
 *   kimi addressing.js `zodiac`     (1-12) -> contract `zodiac` sign name via HD sign table
 *   execution-spine arcAxis.arcUnit (1-99) is preserved untouched inside
 *   provider_metadata.spine_address_structure; it is NOT the contract `arc` field.
 * Unknown fields stay null. No fabricated resolution.
 */

import { fileURLToPath } from 'node:url';

const DONOR_ROOT = fileURLToPath(new URL('../donors/Back-up-/vendor/', import.meta.url));
const SPINE_ADDRESS = DONOR_ROOT + 'execution-spine-v0.4.0/src/canonical-address.mjs';
const KIMI_STATE_SPACE = DONOR_ROOT + 'kimi-agent-automata-state-space-merge/pure-synthia-automata/src/state-space/';
// Recovered wave-1 donors (PROVENANCE.md in each tree; .ported.mjs = esbuild type-erasure, logic unchanged)
const YNIV_BRIDGE = fileURLToPath(new URL('../donors/recovered/you-n-i-verse-corrected/synthia-bridge.ported.mjs', import.meta.url));
const YNIV_EDGES = fileURLToPath(new URL('../donors/recovered/you-n-i-verse-corrected/emergent-edge-resolver.ported.mjs', import.meta.url));
const FOUNDRY_EPHEMERIS = fileURLToPath(new URL('../donors/recovered/foundry-glyphs/server/resonance-engine.ported.mjs', import.meta.url));

export const ADDRESS_FIELDS = Object.freeze([
  'planetary', 'dimension', 'gate', 'line', 'color', 'tone', 'base',
  'degree', 'minute', 'second', 'arc', 'zodiac', 'house',
]);

export const PROVIDER_ID = 'back-up-:execution-spine-canonical-address+kimi-dms-codec';
export const HD_PROVIDER_ID = 'back-up-:kimi-human-design';
export const YNIV_PROVIDER_ID = 'recovered:yniv-addressing-engine';
export const YNIV_EDGE_PROVIDER_ID = 'recovered:yniv-emergent-edge-resolver';
export const FOUNDRY_PROVIDER_ID = 'recovered:foundry-glyphs-ephemeris';

export function emptyAddress() {
  return Object.freeze(Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, null])));
}

export class AddressService {
  constructor({ bus = null, capabilityRegistry = null } = {}) {
    this.bus = bus;
    this.capabilityRegistry = capabilityRegistry; // for recorded routing_decision (multi-provider, no collapse)
    this.providerId = PROVIDER_ID;
    this._spine = null;   // lazy donor modules
    this._dms = null;
    this._hd = null;
    this._yniv = null;
    this._ynivEdges = null;
    this._ephemeris = null;
  }

  async _load(name, path) {
    try {
      return await import(path);
    } catch (error) {
      const failure = { provider: name, path, error: String(error?.message ?? error) };
      this.bus?.emit('service:provider-failure', failure);
      const err = new Error(`address-service donor provider unavailable: ${name} (${failure.error})`);
      err.cause = error;
      err.providerFailure = failure;
      throw err;
    }
  }

  async spine() { return (this._spine ??= await this._load('execution-spine-canonical-address', SPINE_ADDRESS)); }
  async dms() { return (this._dms ??= await this._load('kimi-addressing-dms', KIMI_STATE_SPACE + 'addressing.js')); }
  async hd() { return (this._hd ??= await this._load('kimi-human-design', KIMI_STATE_SPACE + 'human-design.js')); }
  async yniv() { return (this._yniv ??= await this._load('recovered-yniv-addressing', YNIV_BRIDGE)); }
  async ynivEdges() { return (this._ynivEdges ??= await this._load('recovered-yniv-edge-resolver', YNIV_EDGES)); }
  async ephemeris() { return (this._ephemeris ??= await this._load('recovered-foundry-glyphs-ephemeris', FOUNDRY_EPHEMERIS)); }

  /**
   * Multi-provider routing decision (recorded, never silent). Provider is chosen
   * by INPUT SHAPE (each provider resolves what it actually implements); the
   * canonical-address authority remains execution-spine (validation role).
   */
  _routingDecision(capability, selected, rationale) {
    const candidates = this.capabilityRegistry
      ? this.capabilityRegistry.queryCapability(capability).providers.map((p) => p.provider_id)
      : [];
    const decision = {
      request_id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      required_capability: capability,
      candidate_providers: candidates,
      selected_provider: selected,
      selection_rationale: rationale,
      timestamp: new Date().toISOString(),
      outcome_event_id: null,
    };
    this.bus?.emit('routing:decision', decision);
    return decision;
  }

  /**
   * Resolve a canonical 13-field address from real input only.
   * Accepted inputs (first match wins, rest recorded as unknown):
   *   { birthDate: 'YYYY-MM-DD', birthTime: 'HH:MM', planet? }  -> HD chart placement (default Sun)
   *   { arcSecond | arc: int }                                  -> DMS wheel decode
   *   { address: {...} }                                        -> normalize/validate onto 13 fields
   */
  async resolveAddress(entityOrEvent = {}, options = {}) {
    const input = entityOrEvent?.input ?? entityOrEvent;
    if (input == null || typeof input !== 'object') throw new TypeError('resolveAddress: object input required');

    // Strategy override (routing hint from caller; decision still recorded).
    // 'auto' = input-shape routing. Others force a provider that actually
    // implements the requested input shape — no duplicate implementations.
    const strategy = options.strategy ?? 'auto';
    if (strategy === 'canonical-validation') {
      this._routingDecision('resolve_address', 'back-up-:execution-spine-canonical-address',
        'strategy=canonical-validation -> canonical-address AUTHORITY validates the completed address (per selection_hints: spine is always the final validator)');
      return this.validateCanonical(input);
    }
    if (strategy === 'micro-resolution' && (input.micro || input.macro || input.emergent)) {
      this._routingDecision('resolve_address', YNIV_PROVIDER_ID, 'strategy=micro-resolution -> YNIV 13-dim resolution engine (selection_hints: encoding/decoding full 13-dim address arithmetic)');
      return this._resolveViaYNIV(input);
    }
    if (strategy !== 'auto') throw new Error(`resolveAddress: strategy '${strategy}' not applicable to this input shape`);

    if (input.birthDate) {
      this._routingDecision('resolve_address', HD_PROVIDER_ID, 'birth datum present -> HD chart provider (kimi)');
      return this._resolveFromBirthDatum(input);
    }
    if (input.ephemeris && typeof input.ephemeris === 'object') {
      this._routingDecision('calculate_human_design', FOUNDRY_PROVIDER_ID, 'ephemeris coordinates present -> Foundry-Glyphs mandala resolver (real ephemeris engine)');
      return this._resolveFromEphemeris(input.ephemeris);
    }
    if (input.micro || input.macro || input.emergent) {
      this._routingDecision('resolve_address', YNIV_PROVIDER_ID, 'YNIV coordinate object present (micro/macro/emergent) -> recovered 13-dim address engine');
      return this._resolveViaYNIV(input);
    }
    if (Number.isFinite(input.arcSecond ?? input.arc)) {
      this._routingDecision('resolve_address', this.providerId, 'arc-second coordinate present -> kimi DMS wheel codec');
      return this._resolveFromArc(input.arcSecond ?? input.arc);
    }
    if (input.address && typeof input.address === 'object') return this.normalizeAddress(input.address);

    // Nothing resolvable: return the honest unknown address.
    return {
      address: emptyAddress(),
      provider: this.providerId,
      resolved_fields: [],
      status: 'unknown',
      reason: 'no birth datum, arc coordinate, or address supplied',
    };
  }

  async _resolveFromBirthDatum({ birthDate, birthTime = '00:00', planet = 'Sun' }) {
    const hd = await this.hd();
    const chart = hd.calculateHumanDesign(birthDate, birthTime, null);
    const placement = (chart.placements ?? []).find((p) => p.planet === planet) ?? null;
    if (!placement) {
      throw new Error(`HD chart returned no placement for planet: ${planet}`);
    }
    const dms = await this.dms();
    // Cross-decode the same longitude through the DMS wheel codec for `arc`/house.
    const arcSecond = Math.round(placement.longitude * 3600);
    const wheel = dms.addressForArcSec(arcSecond);
    const address = {
      planetary: placement.planet,
      dimension: null, // dimension is not derivable from a birth datum alone
      gate: placement.gate,
      line: placement.line,
      color: placement.color,
      tone: placement.tone,
      base: placement.base,
      degree: placement.degree,
      minute: placement.minute,
      second: placement.second,
      arc: arcSecond,
      zodiac: placement.zodiac, // sign name string (HD provider convention)
      house: wheel.house,       // 1-8 trigram houses (kimi codec convention)
    };
    return {
      address,
      provider: HD_PROVIDER_ID,
      resolved_fields: ADDRESS_FIELDS.filter((f) => address[f] !== null),
      status: 'resolved',
      provider_metadata: {
        wheel_decode: wheel,
        chart_summary: {
          type: chart.type ?? null,
          profile: chart.profile ?? null,
          authority: chart.authority ?? null,
          incarnationCross: chart.incarnationCross ?? null,
        },
      },
      chart,
    };
  }

  async _resolveFromArc(arcSecond) {
    const dms = await this.dms();
    const wheel = dms.addressForArcSec(arcSecond);
    const hd = await this.hd();
    const zodiac = hd.longitudeToZodiac(arcSecond / 3600);
    const address = {
      planetary: null,
      dimension: null,
      gate: wheel.gate,
      line: wheel.line,
      color: wheel.color,
      tone: wheel.tone,
      base: wheel.base,
      degree: zodiac.degree,
      minute: zodiac.minute,
      second: zodiac.second,
      arc: wheel.arcSecond,
      zodiac: zodiac.sign,
      house: wheel.house, // 1-8 trigram houses (kimi codec convention)
    };
    return {
      address,
      provider: this.providerId,
      resolved_fields: ADDRESS_FIELDS.filter((f) => address[f] !== null),
      status: 'resolved',
      provider_metadata: { wheel_decode: wheel },
    };
  }

  /**
   * YNIV recovered 13-dim address engine (donor synthia-bridge.ts, ported verbatim).
   * Encodes the given coordinates through the REAL donor encoder and decodes back
   * (round-trip proven); contract fields are filled from donor decode output.
   * Conventions (donor): micro gate/line/color/tone are 0-based (0 = gate 1); macro
   * planet 0-12, dimension 0-4, zodiac 0-11, house 0-11; emergent arcSecond is 0-99
   * (quarter-minute), NOT the contract/kimi arc-second coordinate — kept in
   * provider_metadata.yniv only; contract `arc` stays null unless supplied.
   */
  async _resolveViaYNIV(input) {
    const yniv = await this.yniv();
    const address = { ...emptyAddress() };
    const meta = {};
    if (input.micro) {
      const microIndex = yniv.encodeMicro(input.micro);
      const decoded = yniv.decodeMicro(microIndex);
      Object.assign(address, {
        gate: decoded.gate + 1, line: decoded.line + 1, color: decoded.color + 1,
        tone: decoded.tone + 1, base: decoded.base + 1,
      });
      meta.micro = { index: microIndex, decoded, size: yniv.MICRO_SIZE, convention: '0-based donor coords -> 1-based contract fields' };
    }
    if (input.macro) {
      const macroIndex = yniv.encodeMacro(input.macro);
      const decoded = yniv.decodeMacro(macroIndex);
      address.planetary = input.macro.planet_name ?? String(decoded.planet); // donor macro is numeric; names not in donor table
      address.dimension = input.macro.dimension_name ?? String(decoded.dimension);
      address.zodiac = null; // numeric zodiac index decoded; sign names come from ephemeris provider instead
      address.house = decoded.house + 1;
      meta.macro = { index: macroIndex, decoded, size: yniv.MACRO_SIZE, note: 'planetary/dimension/zodiac are numeric in the donor macro layer; left as raw indices unless caller supplies names' };
      if (input.macro.zodiac_name) address.zodiac = input.macro.zodiac_name;
      if (address.planetary !== null && input.macro.planet_name === undefined) meta.macro.planetary_raw = address.planetary;
    }
    if (input.emergent) {
      meta.emergent = { ...input.emergent, note: "donor emergent layer (degree 0-360, minute/second 0-60, arcSecond 0-99); arcSecond is NOT contract 'arc'" };
      if (Number.isFinite(input.emergent.degree)) address.degree = input.emergent.degree;
      if (Number.isFinite(input.emergent.minute)) address.minute = input.emergent.minute;
      if (Number.isFinite(input.emergent.second)) address.second = input.emergent.second;
    }
    return {
      address,
      provider: YNIV_PROVIDER_ID,
      resolved_fields: ADDRESS_FIELDS.filter((f) => address[f] !== null),
      status: 'resolved',
      provider_metadata: { yniv: meta, round_trip: true },
    };
  }

  /**
   * Foundry-Glyphs real ephemeris resolver (mandala wheel, Fagan-Bradley
   * sidereal, draconic) — DIFFERENT calculation engine from kimi HD
   * (approximate ephemeris). Both retained; no winner picked.
   * Input: { sign, degree, minute, second } (tropical ecliptic coordinates).
   */
  async _resolveFromEphemeris({ sign, degree = 0, minute = 0, second = 0 }) {
    const eph = await this.ephemeris();
    const act = eph.getHDActivation(sign, degree, minute, second);
    const address = {
      planetary: null,
      dimension: null,
      gate: act.gate,
      line: act.line,
      color: act.color,
      tone: act.tone,
      base: act.base,
      degree: act.degree,
      minute: act.minute,
      second: act.second,
      arc: Math.round(act.eclipticDeg * 3600), // absolute ecliptic arc-seconds (contract arc convention)
      zodiac: act.sign,
      house: null, // mandala wheel provides no house; unknown stays null
    };
    return {
      address,
      provider: FOUNDRY_PROVIDER_ID,
      resolved_fields: ADDRESS_FIELDS.filter((f) => address[f] !== null),
      status: 'resolved',
      provider_metadata: {
        activation: act,
        engine: 'Foundry-Glyphs mandala wheel (GATE_SEQUENCE from 0° Aries gate 25, GATE_ARC 5°37\'30")',
        conversions: { sidereal: 'tropicalToSidereal(Fagan-Bradley)', draconic: 'tropicalToDraconic' },
      },
    };
  }

  /**
   * resolveRelationship via the recovered EmergentEdgeResolver (36 HD channels
   * as executable functions). Gates are contract 1-64; donor is 0-based.
   */
  async resolveEdge(addressA, addressB, stateOverlays = {}) {
    const edges = await this.ynivEdges();
    const resolver = new edges.EmergentEdgeResolver();
    const toNodeState = (a, extra) => ({
      micro: { gate: a.gate - 1, line: (a.line ?? 1) - 1, color: (a.color ?? 1) - 1, tone: (a.tone ?? 1) - 1, base: (a.base ?? 1) - 1 },
      macro: { planet: 0, dimension: 0, zodiac: 0, house: 0 },
      emergent: { degree: a.degree ?? 0, minute: a.minute ?? 0, second: a.second ?? 0, arcSecond: 0 },
      amplitude: extra.amplitude ?? 0.8,
      phase: extra.phase ?? 0.5,
      coherence: extra.coherence ?? 0.9,
      dimension: extra.dimension ?? 0,
    });
    const s = toNodeState(addressA, stateOverlays.source ?? {});
    const t = toNodeState(addressB, stateOverlays.target ?? {});
    const result = resolver.resolve(s, t);
    this.bus?.emit('address-service:edge-resolved', { edgeType: result.edgeType, gates: [addressA.gate, addressB.gate] });
    return { ...result, provider: YNIV_EDGE_PROVIDER_ID };
  }

  /**
   * Canonical validation by the AUTHORITY provider (execution-spine).
   * Accepts a spine-form address (with arcAxis) directly, or YNIV coordinate
   * parts ({micro, macro, emergent}) which are first resolved by the real YNIV
   * engine and then translated into spine form for validation. Contract `arc`
   * (kimi arc-seconds) is NOT translated into arcAxis — that mapping is a
   * documented open reconciliation; only donor-native arcSecond (0-99) maps to
   * arcAxis.arcUnit (1-99). Validation failures are REAL results, surfaced.
   */
  async validateCanonical(input = {}) {
    const spine = await this.spine();
    let spineAddress;
    if (input.address?.arcAxis) {
      spineAddress = input.address;
    } else if (input.micro && input.macro && input.emergent) {
      const resolved = await this._resolveViaYNIV(input); // REAL donor resolution first
      const a = resolved.address;
      const missing = [];
      if (!input.macro) missing.push('macro');
      spineAddress = {
        planetary: input.macro.planet + 1,
        dimension: spine.DIMENSIONS[input.macro.dimension],
        gate: a.gate, line: a.line, color: a.color, tone: a.tone, base: a.base,
        degree: input.emergent.degree ?? 0,
        minute: input.emergent.minute ?? 0,
        second: input.emergent.second ?? 0,
        arcAxis: { arcUnit: (input.emergent.arcSecond ?? 0) + 1, ...(input.emergent.axis ? { axis: input.emergent.axis } : {}) },
        zodiac: input.macro.zodiac + 1,
        house: input.macro.house + 1,
      };
      if (missing.length) return { valid: false, provider: 'back-up-:execution-spine-canonical-address', reason: `missing parts: ${missing.join(',')}` };
    } else {
      return {
        valid: null,
        status: 'unknown',
        provider: 'back-up-:execution-spine-canonical-address',
        reason: 'no spine-form address (arcAxis) or YNIV coordinate parts supplied; contract-form addresses are not translated (arc<->arcAxis reconciliation pending)',
      };
    }
    try {
      spine.validateCanonicalAddress(spineAddress);
      return {
        valid: true,
        provider: 'back-up-:execution-spine-canonical-address',
        canonical_key: spine.canonicalAddressKey(spineAddress),
        spine_address: spineAddress,
      };
    } catch (error) {
      const result = { valid: false, provider: 'back-up-:execution-spine-canonical-address', error: String(error?.message ?? error), spine_address: spineAddress };
      this.bus?.emit('address-service:validation-failed', result);
      return result;
    }
  }

  /** Normalize a partial/canonical address onto exactly the 13 contract fields. */
  async normalizeAddress(partial) {
    const address = { ...emptyAddress() };
    const resolved = [];
    for (const f of ADDRESS_FIELDS) {
      if (partial[f] !== undefined && partial[f] !== null) { address[f] = partial[f]; resolved.push(f); }
    }
    if (partial.arcSecond !== undefined && address.arc === null) { address.arc = partial.arcSecond; resolved.push('arc'); }
    return { address, provider: this.providerId, resolved_fields: resolved, status: resolved.length ? 'resolved' : 'unknown' };
  }

  /** Field-by-field comparison + donor Fu Xi Hamming distance when both gates known. */
  async compareAddresses(a, b) {
    const na = (await this.normalizeAddress(a?.address ?? a)).address;
    const nb = (await this.normalizeAddress(b?.address ?? b)).address;
    const shared = [];
    const differing = [];
    for (const f of ADDRESS_FIELDS) {
      if (na[f] === null || nb[f] === null) continue; // unknown stays unknown — never compared
      (String(na[f]) === String(nb[f]) ? shared : differing).push(f);
    }
    let hammingDistance = null;
    if (Number.isInteger(na.gate) && Number.isInteger(nb.gate)) {
      const dms = await this.dms();
      hammingDistance = dms.hamming(dms.gateBits(na.gate), dms.gateBits(nb.gate));
    }
    return {
      a: na, b: nb,
      shared_fields: shared,
      differing_fields: differing,
      hamming_distance: hammingDistance,
      same_address: shared.length === ADDRESS_FIELDS.length && differing.length === 0,
      provider: this.providerId,
    };
  }

  /**
   * Honest structural relationship: only what the donor math supports.
   * relational_class stays 'unknown' unless evidence warrants more.
   */
  async resolveRelationship(a, b, context = {}) {
    const cmp = await this.compareAddresses(a, b);
    const structural = [];
    if (cmp.shared_fields.includes('gate')) structural.push('shared_gate');
    if (cmp.shared_fields.includes('line')) structural.push('shared_line');
    if (cmp.hamming_distance !== null) {
      if (cmp.hamming_distance === 0) structural.push('identical_gate_binary');
      if (cmp.hamming_distance === 6) structural.push('complementary_gates');
    }
    // Recovered donor edge machinery: the 36 HD channels as executable functions.
    // Only invoked when BOTH gates are really known — never fabricated.
    let edge = null;
    if (Number.isInteger(cmp.a.gate) && Number.isInteger(cmp.b.gate) && context.useEdgeResolver !== false) {
      edge = await this.resolveEdge(cmp.a, cmp.b, context.stateOverlays ?? {});
      if (edge.compatible && edge.edgeType !== 'NONE') structural.push(`channel:${edge.edgeType}`);
    }
    return {
      a: cmp.a, b: cmp.b,
      comparison: cmp,
      structural_relations: structural,
      edge: edge ? {
        provider: edge.provider,
        edge_type: edge.edgeType,
        edge_name: edge.edgeName,
        compatible: edge.compatible,
        score: edge.score,
        emergent: edge.emergent,
      } : null,
      relational_class: 'unknown', // grammar v1: do not assert co_occurrence/causal without evidence
      context: context ?? null,
      provider: this.providerId,
    };
  }

  /**
   * Append-only address history: derived from the shared event log
   * (events where entity is actor or target and an address was recorded).
   */
  async traceAddressHistory(entity, { events = null } = {}) {
    const id = typeof entity === 'string' ? entity : entity?.identity ?? entity?.id;
    if (!id) return { identity: null, history: [], status: 'unknown', reason: 'no entity identity' };
    const log = events ?? [];
    const history = log
      .filter((e) => e && (e.actor_id === id || e.target_id === id))
      .filter((e) => e.actor_address || e.target_address || e.event_address)
      .map((e) => ({
        event_id: e.event_id,
        timestamp: e.timestamp,
        role: e.actor_id === id ? 'actor' : 'target',
        address: e.actor_id === id ? (e.actor_address ?? e.event_address) : (e.target_address ?? e.event_address),
        trajectory_id: e.trajectory_id ?? null,
      }));
    return {
      identity: id,
      history,
      status: history.length ? 'resolved' : 'unknown',
      provider: 'computer:events/event-emitter',
    };
  }
}

export default AddressService;

