/**
 * Computer State Resolver — Stage-4a mount.
 *
 * resolveState(entity, event, context) -> {
 *   identity, address, current_state, context, relationships,
 *   active_structures, trajectory, confidence, source_provider
 * }
 *
 * Backed by REAL donor providers (wrap, never reimplement):
 *   - five-level StateSpace: donors/Back-up-/vendor/kimi-agent-automata-state-space-merge/...
 *       state-space/mesh-state-space.js (Movement/Evolution/Being/Design/Space x 64 gates)
 *   - HD chart: state-space/human-design.js (only when a birth datum is supplied)
 *   - addresses: computer/services/address-service.mjs (donor DMS + execution-spine schema)
 *
 * Missing data -> null / 'unknown'. Nothing is fabricated.
 */

import { fileURLToPath } from 'node:url';
import { AddressService, emptyAddress } from './address-service.mjs';

const DONOR_STATE_SPACE = fileURLToPath(new URL(
  '../donors/Back-up-/vendor/kimi-agent-automata-state-space-merge/pure-synthia-automata/src/state-space/mesh-state-space.js',
  import.meta.url,
));

export const STATE_PROVIDER_ID = 'back-up-:kimi-mesh-state-space+kimi-human-design';

export class StateResolver {
  constructor({ bus = null, addressService = null, eventLog = null } = {}) {
    this.bus = bus;
    this.addressService = addressService ?? new AddressService({ bus });
    this.eventLog = eventLog; // async () => [events], wired to the emitter
    this.providerId = STATE_PROVIDER_ID;
    this._stateSpaceModule = null;
    this._stateSpace = null;
  }

  async _loadStateSpace() {
    if (this._stateSpace) return this._stateSpace;
    try {
      this._stateSpaceModule = await import(DONOR_STATE_SPACE);
      this._stateSpace = new this._stateSpaceModule.StateSpace(); // buildGateTable() from canonical addressing.js
      return this._stateSpace;
    } catch (error) {
      const failure = { provider: 'kimi-mesh-state-space', path: DONOR_STATE_SPACE, error: String(error?.message ?? error) };
      this.bus?.emit('service:provider-failure', failure);
      const err = new Error(`state-resolver donor provider unavailable: kimi-mesh-state-space (${failure.error})`);
      err.cause = error;
      err.providerFailure = failure;
      throw err;
    }
  }

  async resolveState(entity = {}, event = null, context = {}) {
    const identity = typeof entity === 'string'
      ? entity
      : entity?.identity ?? entity?.id ?? event?.actor_id ?? null;

    // ADDRESS RESOLUTION — only from real input (birth datum, arc, or given address).
    const addressInput = {
      birthDate: entity?.birthDate ?? event?.input?.birthDate,
      birthTime: entity?.birthTime ?? event?.input?.birthTime,
      arcSecond: entity?.arcSecond ?? entity?.arc ?? event?.input?.arcSecond,
      address: entity?.address ?? event?.actor_address,
      ephemeris: entity?.ephemeris ?? event?.input?.ephemeris,
      micro: entity?.micro, macro: entity?.macro, emergent: entity?.emergent,
    };
    const resolved = await this.addressService.resolveAddress(addressInput);
    const address = resolved.address;

    // HD CHART — only when a real birth datum exists.
    let chart = resolved.chart ?? null;

    // FIVE-LEVEL STATE-SPACE — real mesh nodes for the resolved gate.
    let activeStructures = null;
    if (Number.isInteger(address.gate)) {
      const space = await this._loadStateSpace();
      const cross = space.address(address.gate);
      activeStructures = {
        five_level_state_space: {
          provider: 'back-up-:kimi-mesh-state-space',
          gate: address.gate,
          dimensions: Object.fromEntries(Object.entries(cross).map(([name, node]) => [name, {
            gate: node?.gate ?? null,
            binary: node?.binary ?? null,
            trigrams: node?.trigrams ?? null,
            content_words: node?.content?.words?.length ?? 0,
            dimension_claim_status: space.dimensions[name]?.claim?.status ?? 'unknown',
          }])),
        },
        human_design: chart ? {
          provider: 'back-up-:kimi-human-design',
          type: chart.type ?? null,
          profile: chart.profile ?? null,
          authority: chart.authority ?? null,
          definition: chart.definition ?? null,
          incarnationCross: chart.incarnationCross ?? null,
          centers: chart.centers ?? null,
        } : null,
        ephemeris: resolved.provider === 'recovered:foundry-glyphs-ephemeris'
          ? { provider: resolved.provider, activation: resolved.provider_metadata?.activation ?? null, engine: resolved.provider_metadata?.engine ?? null }
          : null,
      };
    } else if (chart) {
      activeStructures = {
        five_level_state_space: null,
        human_design: {
          provider: 'back-up-:kimi-human-design',
          type: chart.type ?? null, profile: chart.profile ?? null, authority: chart.authority ?? null,
        },
      };
    }

    // TRAJECTORY — append-only history from the shared event log.
    const events = this.eventLog ? await this.eventLog() : [];
    const trace = await this.addressService.traceAddressHistory(identity ?? {}, { events });

    const currentState = {
      gate: address.gate,
      line: address.line,
      zodiac: address.zodiac,
      arc: address.arc,
      event_type: event?.event_type ?? null,
      post_state: event?.post_state ?? null,
    };

    // Confidence: fraction of the 13 canonical fields actually resolved.
    const resolvedCount = Object.values(address).filter((v) => v !== null).length;
    const confidence = resolvedCount === 0
      ? { level: 'unknown', resolved_fields: 0, of: 13 }
      : { level: resolvedCount >= 10 ? 'high' : 'partial', resolved_fields: resolvedCount, of: 13 };

    return {
      identity,
      address,
      current_state: currentState,
      context: context ?? null,
      relationships: [], // populated by callers via addressService.resolveRelationship; never fabricated here
      active_structures: activeStructures,
      trajectory: trace.history,
      confidence,
      source_provider: `${this.providerId} (address via ${resolved.provider})`,
    };
  }
}

export { emptyAddress };
export default StateResolver;

