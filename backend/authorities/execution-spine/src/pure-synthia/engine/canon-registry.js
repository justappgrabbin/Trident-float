// Pure Synthia Automata — engine: source-canon registry
// (handoff contract §17-equivalent: canonical wording preserved per concept,
// conflicts first-class and never silently resolved)

/**
 * CanonRegistry — the source-canon registry. Each entry is a frozen record:
 *
 *   { concept, canonicalWording, sourceLocation, dimension, coordinateLevel,
 *     conflicts, aliases, computationalInterpretation, status, seq }
 *
 * Operating rules (handoff 04_conflicts_quarantine/CONFLICTS.md):
 *   - conflicts are preserved as first-class entry data, never resolved silently;
 *   - registering a concept twice does not overwrite — the later registration
 *     is recorded as a conflict on the existing entry;
 *   - status uses CLAIM_STATUS vocabulary (state-space/claim-status.js);
 *     CONTROL_ONLY entries are stored for reference but never resolve canon
 *     questions (resolveDimension in claim-status.js enforces this).
 *
 * Deterministic: counter-sequenced (seq), no wall-clock.
 */

import { CLAIM_STATUS, isClaimStatus, isClaim } from '../state-space/claim-status.js';
import { DIMENSION_CANON, CANON_CONFLICTS } from '../state-space/dimension-canon.js';

export class CanonRegistry {
  constructor() {
    this._entries = new Map(); // concept -> frozen entry
    this._aliases = new Map(); // alias -> concept
    this._seq = 0;
  }

  /**
   * Register a canon entry. Unknown extra fields are preserved.
   * `status` defaults to SOURCE_STATEMENT; `conflicts` defaults to [].
   * Re-registering an existing concept NEVER overwrites: the new wording is
   * appended to the existing entry's conflicts list and the entry is
   * re-frozen with status CONFLICT (unless it already was).
   */
  register(entry = {}) {
    if (typeof entry !== 'object' || entry === null) {
      throw new TypeError('CanonRegistry.register requires an entry object');
    }
    if (typeof entry.concept !== 'string' || !entry.concept) {
      throw new TypeError('CanonRegistry entry requires a concept string');
    }
    if (entry.status !== undefined && !isClaimStatus(entry.status)) {
      throw new RangeError(`CanonRegistry entry status must be a CLAIM_STATUS (got ${JSON.stringify(entry.status)})`);
    }
    const existing = this._entries.get(entry.concept);
    if (existing) {
      // Conflict is first-class: keep the original, record the challenger.
      const conflict = {
        seq: ++this._seq,
        kind: 're-registration',
        canonicalWording: entry.canonicalWording ?? null,
        sourceLocation: entry.sourceLocation ?? null,
        note: 'second registration for the same concept; neither wins silently',
      };
      const merged = Object.freeze({
        ...existing,
        conflicts: Object.freeze([...existing.conflicts, Object.freeze(conflict)]),
        status: CLAIM_STATUS.CONFLICT,
      });
      this._entries.set(entry.concept, merged);
      return merged;
    }
    const record = Object.freeze({
      concept: entry.concept,
      canonicalWording: entry.canonicalWording ?? null,
      sourceLocation: entry.sourceLocation ?? null,
      dimension: entry.dimension ?? null,
      coordinateLevel: entry.coordinateLevel ?? null,
      conflicts: Object.freeze((entry.conflicts || []).map((c) => Object.freeze({ ...c }))),
      aliases: Object.freeze([...(entry.aliases || [])]),
      computationalInterpretation: entry.computationalInterpretation ?? null,
      status: entry.status || CLAIM_STATUS.SOURCE_STATEMENT,
      seq: ++this._seq,
    });
    this._entries.set(record.concept, record);
    for (const alias of record.aliases) this._aliases.set(alias, record.concept);
    return record;
  }

  /** Lookup by concept or alias; returns the frozen entry or null. */
  lookup(conceptOrAlias) {
    const direct = this._entries.get(conceptOrAlias);
    if (direct) return direct;
    const target = this._aliases.get(conceptOrAlias);
    return target ? this._entries.get(target) : null;
  }

  /**
   * Entries whose conflicts are preserved: anything with a non-empty
   * conflicts list or CONFLICT status. Pass {dimension} to scope to one
   * dimension. Conflicts are reported, never resolved.
   */
  conflictsFor({ dimension = null } = {}) {
    return [...this._entries.values()].filter(
      (e) => (e.status === CLAIM_STATUS.CONFLICT || e.conflicts.length > 0)
        && (dimension === null || e.dimension === dimension),
    );
  }

  list() {
    return [...this._entries.values()];
  }

  /** JSON-safe snapshot: entries (in registration order) + counts. */
  export() {
    const entries = this.list().map((e) => ({ ...e, conflicts: e.conflicts.map((c) => ({ ...c })), aliases: [...e.aliases] }));
    return {
      entries,
      count: entries.length,
      conflicts: entries.filter((e) => e.status === CLAIM_STATUS.CONFLICT || e.conflicts.length > 0).length,
    };
  }
}

/* --------------------------- seeding from the handoff canon ---------------------------
 * Seeds the 5 dimensions (with their source chains as canonicalWording and
 * per-rung concept entries — coordinateLevel = rung index), the canon's
 * anchors, the H-F4 candidate hypothesis, the CONTROL_ONLY controls, and the
 * recorded CANON_CONFLICTS (Space role conflict rides on the Space entry).
 */
export function seedFromDimensionCanon(registry = new CanonRegistry(), canon = DIMENSION_CANON) {
  for (const [dimension, dimClaim] of Object.entries(canon.dimensions)) {
    const { chain, sense } = dimClaim.value;
    registry.register({
      concept: dimension,
      canonicalWording: `${dimension} = ${chain.join(' = ')}`,
      sourceLocation: '06_DIMENSION_CANON.json dimensions.' + dimension,
      dimension,
      coordinateLevel: 'dimension',
      aliases: [sense],
      computationalInterpretation: `five-dimensional state-space perspective; sense channel ${sense}`,
      status: dimClaim.status,
      conflicts: dimClaim.status === CLAIM_STATUS.CONFLICT
        ? (dimClaim.evidence?.roleModels || []).map((m) => ({
          kind: 'role-model',
          id: m.id,
          status: m.status,
          description: m.description,
          conflictId: dimClaim.evidence?.conflictId ?? null,
        }))
        : [],
    });
    chain.forEach((rung, i) => {
      registry.register({
        concept: rung,
        canonicalWording: `${dimension} chain rung ${i + 1}: ${rung}`,
        sourceLocation: `06_DIMENSION_CANON.json dimensions.${dimension}.chain[${i}]`,
        dimension,
        coordinateLevel: i,
        computationalInterpretation: `chain rung of ${dimension} (GGM crystal chain; distinct from DIMENSION_CHAINS behavioral micro-programs — see CANON-CONFLICT-chains)`,
        status: dimClaim.status === CLAIM_STATUS.CONFLICT ? CLAIM_STATUS.SOURCE_STATEMENT : dimClaim.status,
      });
    });
  }
  for (const anchor of canon.anchors) {
    registry.register({
      concept: `anchor:${anchor.value.subject}`,
      canonicalWording: `${anchor.value.subject} -> ${anchor.value.dimension}`,
      sourceLocation: `06_DIMENSION_CANON.json anchors (${anchor.value.reason})`,
      dimension: anchor.value.dimension,
      status: anchor.status,
      conflicts: anchor.status === CLAIM_STATUS.PROJECT_HYPOTHESIS
        ? [{ kind: 'attestation-gap', note: anchor.value.reason }]
        : [],
    });
  }
  for (const hypothesis of canon.candidate_hypotheses) {
    registry.register({
      concept: hypothesis.value.id,
      canonicalWording: Object.entries(hypothesis.value.mapping).map(([k, v]) => `${k}->${v}`).join(', '),
      sourceLocation: '06_DIMENSION_CANON.json candidate_hypotheses',
      status: CLAIM_STATUS.PROJECT_HYPOTHESIS,
      computationalInterpretation: 'phoneme-manner -> dimension mapping (MANNER_DIMENSION in primitive-dimensions.js); PROJECT_HYPOTHESIS until PROMOTION_GATE clears it',
      conflicts: [],
    });
  }
  for (const control of canon.controls) {
    registry.register({
      concept: control.value.id,
      canonicalWording: control.value.id,
      sourceLocation: '06_DIMENSION_CANON.json controls',
      status: CLAIM_STATUS.CONTROL_ONLY,
      computationalInterpretation: 'control condition only — never canonical ontology (contract §1); must be beaten, not believed',
    });
  }
  // Preserve the recorded canon-vs-codebase conflicts as registry entries.
  for (const conflictClaim of CANON_CONFLICTS) {
    if (!isClaim(conflictClaim)) continue;
    registry.register({
      concept: conflictClaim.value.id,
      canonicalWording: conflictClaim.value.topic,
      sourceLocation: conflictClaim.source,
      status: CLAIM_STATUS.CONFLICT,
      conflicts: [{
        kind: 'canon-vs-codebase',
        positionA: conflictClaim.value.positionA,
        positionB: conflictClaim.value.positionB,
        resolution: conflictClaim.value.resolution,
      }],
      computationalInterpretation: 'conflict preserved, not resolved (CONFLICTS.md rule 4: neither wins silently)',
    });
  }
  return registry;
}

/** A ready-seeded registry (the 5 dimensions + chains + anchors + hypotheses + controls + conflicts). */
export const CANON_REGISTRY = seedFromDimensionCanon();

export default CanonRegistry;

