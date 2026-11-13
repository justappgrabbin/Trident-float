// Pure Synthia Automata — engine: the Sensory Adapter (address-first intake gate)

/**
 * IntakeGate — for ANY input X entering the system, the FIRST thing that
 * happens is the production of Q_t = (P_t, A_t, N_t, Φ_t, H_t), before any
 * tool runs:
 *
 *   P_t  decomposition   — tokens (grammar/tokens), letters (state-space/
 *                          letters), L0 features; code/objects get a
 *                          morph-mir-style structural sniff; anything else is
 *                          wrapped as an opaque payload.
 *   A_t  address         — deterministic: fnv1a32(stableStringify(normalized))
 *                          mod 1,296,000 -> arcSec -> addressing.addressForArcSec
 *                          -> canonical address, with soundFor/colorFor attached.
 *                          Labeled addressBasis:'hash-candidate' (H3 stays a
 *                          hypothesis — the address is a candidate, measured).
 *   N_t  neighborhood    — mesh neighbors of related existing states plus
 *                          resonance ρ against the gate's own intake history:
 *                          ρ = (gate*5 + line*3 + color*2 + tone*2 + base*1)/15,
 *                          top-3 reported.
 *   Φ_t  regime          — dimension-router route for text; code -> Design;
 *                          data -> Evolution (fallback Being when unresolved).
 *   H_t  derivation      — the intake gets its own Derivation (id `intake-N`);
 *                          its ledger delta is recorded in the gate's ledger.
 *
 * Plus the FIVE MECHANICAL SENSES — deterministic sensory signatures, the
 * "mechanically smell" requirement, mapped to the dimension-sense table:
 *
 *   see(X)   Movement  — where the input is heading
 *   taste(X) Evolution — how much of it has been tasted before
 *   touch(X) Being     — its texture and pressure (it is what it is)
 *   smell(X) Design    — its 6-component scent (structure of the form)
 *   hear(X)  Space     — which channels it resonates through
 *
 * Everything is pure JS, counter-derived (no wall-clock in hashed payloads),
 * and deterministic: same (history, input) -> same AddressedInput.
 */

import { tokenize } from '../grammar/tokens.js';
import { letterState } from '../state-space/letters.js';
import { posGuess, TOOL_IDS, TOOL_ALIASES } from '../state-space/lexicon.js';
import { WHEEL_ARCSECONDS, DIMENSION_META } from '../state-space/constants.js';
import { addressForArcSec, addrKey } from '../state-space/addressing.js';
import { soundFor } from '../state-space/sounds.js';
import { colorFor } from '../state-space/colors.js';
import { channelsForGate } from '../merged/centers-channels.js';
import { DimensionRouter } from '../merged/dimension-router.js';
import { PROJECTIONS } from '../mesh/mesh.js';
import { stableStringify, fnv1a32, Derivation } from './derivation.js';
import { ComplexityLedger } from './ledger.js';

const CLOSED_POS = new Set(['DET', 'PREP', 'CONJ', 'PRON', 'AUX']);
const CODE_MARKERS = /\b(import|export|function|class|const|let|var|=>|return)\b/;
const STRUCTURAL_CHARS = new Set(['{', '}', '[', ']', '(', ')', ':', ';', ',', '=']);
const OPEN_BRACKETS = new Set(['(', '[', '{']);
const CLOSE_BRACKETS = new Set([')', ']', '}']);
const QUOTES = new Set(['\'', '"', '`']);

const wordsOf = (value) => String(value ?? '').toLowerCase().match(/[a-z0-9']+/g) || [];

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Canonical normalization of any input into a hashable string. */
function normalizeInput(X) {
  if (typeof X === 'string') return X.trim().replace(/\s+/g, ' ');
  if (typeof X === 'number' || typeof X === 'boolean' || X == null) return String(X);
  try {
    return stableStringify(X);
  } catch {
    return String(X); // circular or exotic payload: opaque repr
  }
}

/** morph-mir-style structural sniff over source-ish text. */
function structuralSniff(source) {
  const src = String(source);
  return {
    imports: [...src.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]),
    exports: [...src.matchAll(/export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
    functions: [...src.matchAll(/(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/g)]
      .map((m) => m[1] || m[2]),
    keywords: ['import', 'export', 'function', 'class', 'return', 'async', 'await', 'if', 'for', 'while']
      .filter((kw) => new RegExp(`\\b${kw}\\b`).test(src)),
  };
}

export class IntakeGate {
  constructor({ engine } = {}) {
    this.engine = engine || null;
    this.router = new DimensionRouter();
    this.ledger = new ComplexityLedger();
    this.history = []; // AddressedInput summaries, in intake order
    this.derivations = []; // one Derivation per intake (id intake-N)
    this.tokenMemory = new Set(); // every token ever intaken (for taste)
    this.counter = 0;
  }

  /**
   * The address-first gate. intake(X) -> AddressedInput:
   * {id, input:X, P, address, sound, color, neighborhood, regime,
   *  senses:{see,taste,touch,smell,hear},
   *  analysis:{purpose,behavior,relationships,concepts},
   *  derivationId, ledgerDelta, addressBasis:'hash-candidate'}
   */
  intake(X, context = {}) {
    const n = ++this.counter;
    const id = `intake-${n}`;
    const normalized = normalizeInput(X);

    // ---------- P_t: decomposition ----------
    const decomposition = this.#decompose(X, normalized);
    const tokens = decomposition.wordTokens; // lowercase word list (all kinds)

    // ---------- Φ_t: regime (needed before sound/color: dimension -> octave/layer) ----------
    const regime = this.#regime(decomposition, normalized);

    // ---------- A_t: deterministic hash-candidate address ----------
    const hash = fnv1a32(stableStringify(normalized));
    const arcSec = parseInt(hash, 16) % WHEEL_ARCSECONDS;
    const address = addressForArcSec(arcSec);
    address.planetaryDimension = regime.dimension;
    const sound = soundFor(address);
    const color = colorFor(address);

    // ---------- N_t: neighborhood (mesh + resonance vs history) ----------
    const neighborhood = this.#neighborhood(address);

    // ---------- the five mechanical senses ----------
    const senses = {
      see: this.#see(hash, tokens),
      taste: this.#taste(tokens),
      touch: this.#touch(normalized, tokens),
      smell: null, // needs color/sound: filled just below
      hear: this.#hear(address, neighborhood),
    };
    senses.smell = this.#smell(normalized, tokens, address, color, senses.touch);

    // ---------- semantic analysis ----------
    const analysis = this.#analyze(tokens, regime);

    // ---------- H_t: the intake's own Derivation + ledger delta ----------
    const ledgerDelta = {
      primitivesActivated: tokens.length + decomposition.letters.length,
      statesGenerated: 1, // the addressed candidate state
      edgesTraversed: neighborhood.meshNeighbors.length,
      operationsExecuted: 5, // the five senses
      recursionDepth: 0,
      activeAutomata: 0, // no tool has run yet — intake precedes execution
      transitionCount: 0,
    };
    this.ledger.record(ledgerDelta);
    const derivation = new Derivation({
      id,
      input: normalized,
      parse: {
        kind: decomposition.kind,
        tokens: decomposition.wordTokens.slice(0, 16),
        structure: decomposition.structure || null,
      },
      primitives: decomposition.wordTokens.slice(0, 16),
      operators: ['o_bundle'],
      relations: analysis.relationships,
      context: { intake: true, basis: 'hash-candidate' },
      transforms: [],
      output: { addressKey: addrKey(address), gate: address.gate, regime: regime.dimension },
      evaluation: { addressBasis: 'hash-candidate', hypothesis: 'H3' },
      ledger: ledgerDelta,
    });
    this.derivations.push(derivation);

    const addressed = {
      id,
      input: X,
      P: {
        kind: decomposition.kind,
        tokens: decomposition.tokens,
        letters: decomposition.letters,
        features: decomposition.features,
        structure: decomposition.structure || null,
      },
      address,
      addressBasis: 'hash-candidate',
      sound,
      color,
      neighborhood,
      regime,
      senses,
      analysis,
      derivationId: derivation.id,
      ledgerDelta,
    };

    // history + token memory update AFTER resonance/taste were computed
    this.history.push({
      id,
      kind: decomposition.kind,
      address,
      addressKey: addrKey(address),
      tokens,
      regime: regime.dimension,
      concepts: analysis.concepts,
    });
    for (const token of tokens) this.tokenMemory.add(token);

    return addressed;
  }

  /** P_t: kind-specific decomposition. */
  #decompose(X, normalized) {
    const isString = typeof X === 'string';
    const looksLikeCode = isString && CODE_MARKERS.test(X) && /[;{}()=]/.test(X);
    const kind = isString ? (looksLikeCode ? 'code' : 'text')
      : (X !== null && typeof X === 'object') ? 'data' : 'opaque';
    const sourceText = isString ? X : normalized;

    let tokens = [];
    if (kind !== 'opaque') {
      try {
        tokens = tokenize(sourceText).slice(0, 64)
          .map((t) => ({ type: t.type, value: typeof t.value === 'object' ? stableStringify(t.value) : String(t.value) }));
      } catch {
        tokens = wordsOf(sourceText).slice(0, 64).map((w) => ({ type: 'word', value: w }));
      }
    }
    const letters = [...normalized.toLowerCase()]
      .filter((ch) => ch >= 'a' && ch <= 'z')
      .slice(0, 32)
      .map((ch) => {
        const state = letterState(ch);
        return { char: ch, kind: state.kind, gate: state.candidateAddress.gate };
      });
    const features = {
      vowels: letters.filter((l) => l.kind === 'vowel').length,
      consonants: letters.filter((l) => l.kind === 'consonant').length,
      digits: (normalized.match(/[0-9]/g) || []).length,
      spaces: (normalized.match(/\s/g) || []).length,
      punctuation: (normalized.match(/[.,;:!?'"-]/g) || []).length,
    };
    const structure = (kind === 'code' || kind === 'data') ? structuralSniff(sourceText) : null;
    return {
      kind,
      tokens,
      letters,
      features,
      structure,
      wordTokens: wordsOf(normalized).slice(0, 128),
    };
  }

  /** Φ_t: dimension regime for the input. */
  #regime(decomposition, normalized) {
    if (decomposition.kind === 'code') {
      return { dimension: 'Design', interrogative: 'Why', operation: 'structure', status: 'code-default' };
    }
    if (decomposition.kind === 'data') {
      return { dimension: 'Evolution', interrogative: 'What', operation: 'transform', status: 'data-default' };
    }
    if (decomposition.kind === 'opaque') {
      return { dimension: 'Being', interrogative: 'When', operation: 'instantiate', status: 'opaque-default' };
    }
    const route = this.router.route(normalized);
    if (route.status === 'resolved') {
      return {
        dimension: route.dimension,
        interrogative: route.interrogative,
        operation: route.operation,
        status: 'resolved',
        score: route.score,
      };
    }
    if (route.status === 'ambiguous') {
      const first = route.candidates[0];
      return {
        dimension: first.dimension,
        interrogative: first.interrogative,
        operation: first.operation,
        status: 'ambiguous-resolved-first',
        score: first.score,
      };
    }
    return { dimension: 'Being', interrogative: 'When', operation: 'instantiate', status: 'fallback' };
  }

  /** N_t: mesh neighbors of related states + resonance ρ vs intake history. */
  #neighborhood(address) {
    const key = addrKey(address);
    const meshNeighbors = [];
    const mesh = this.engine && this.engine.mesh;
    if (mesh) {
      for (const projection of PROJECTIONS) {
        for (const stateId of [key, `gate-${address.gate}`, `G${address.gate}`]) {
          for (const edge of mesh.neighbors(stateId, projection)) {
            meshNeighbors.push({ projection, from: edge.from, to: edge.to, relation: edge.relation });
          }
        }
      }
    }
    const resonance = this.history
      .map((prior) => {
        const a = prior.address;
        const rho = (
          (a.gate === address.gate ? 5 : 0) +
          (a.line === address.line ? 3 : 0) +
          (a.color === address.color ? 2 : 0) +
          (a.tone === address.tone ? 2 : 0) +
          (a.base === address.base ? 1 : 0)
        ) / 15;
        return { id: prior.id, addressKey: prior.addressKey, rho };
      })
      .filter((r) => r.rho > 0)
      .sort((a, b) => b.rho - a.rho || a.id.localeCompare(b.id))
      .slice(0, 3);
    return { addressKey: key, meshNeighbors, resonance };
  }

  /** see(X) — Movement signature: hash-derived direction + token momentum. */
  #see(hash, tokens) {
    const h = parseInt(hash, 16);
    return {
      dimension: 'Movement',
      transitionVector: {
        angle: h % 360, // hash-derived heading on the wheel, in degrees
        dx: ((h & 0xffff) / 0xffff) * 2 - 1,
        dy: (((h >>> 16) & 0xffff) / 0xffff) * 2 - 1,
      },
      momentum: tokens.length / 64, // tokenCount / normalizer(64): an L5 sentence rarely exceeds 64 words
    };
  }

  /** taste(X) — Evolution signature: what fraction has been tasted before. */
  #taste(tokens) {
    const seen = tokens.filter((t) => this.tokenMemory.has(t)).length;
    const familiarity = tokens.length ? seen / tokens.length : 0;
    return {
      dimension: 'Evolution',
      familiarity,
      novelty: 1 - familiarity,
    };
  }

  /** touch(X) — Being signature: texture (length/nesting/entropy) + pressure. */
  #touch(normalized, tokens) {
    // nestingDepth: deepest simultaneous open-bracket depth plus 1 while inside quotes
    let depth = 0;
    let maxDepth = 0;
    let inQuote = null;
    let maxQuoteBonus = 0;
    for (const ch of normalized) {
      if (inQuote) {
        if (ch === inQuote) inQuote = null;
        continue;
      }
      if (QUOTES.has(ch)) { inQuote = ch; maxQuoteBonus = 1; continue; }
      if (OPEN_BRACKETS.has(ch)) { depth += 1; maxDepth = Math.max(maxDepth, depth); continue; }
      if (CLOSE_BRACKETS.has(ch)) depth = Math.max(0, depth - 1);
    }
    // Shannon entropy over characters (bits per char)
    const counts = new Map();
    for (const ch of normalized) counts.set(ch, (counts.get(ch) || 0) + 1);
    let entropy = 0;
    for (const count of counts.values()) {
      const p = count / normalized.length;
      entropy -= p * Math.log2(p);
    }
    if (!normalized.length) entropy = 0;
    return {
      dimension: 'Being',
      texture: {
        length: normalized.length,
        nestingDepth: maxDepth + maxQuoteBonus,
        entropy,
      },
      pressure: tokens.length ? new Set(tokens).size / tokens.length : 0, // uniqueTokens/totalTokens
    };
  }

  /**
   * smell(X) — Design signature: the 6-component scent vector. Derivations
   * (each component is deterministic from content shape):
   *   structure  = 0.5*clamp01(nestingDepth/6) + 0.5*(structural chars / length)
   *                — how much visible scaffolding the form carries;
   *   rhythm     = coefficient of variation (stdev/mean) of token lengths,
   *                clamped — regular lengths smell smooth, jagged ones sharp;
   *   density    = tokens per 6 characters, clamped — semantic packing;
   *   polarity   = yang lines of the candidate address gate / 6 — the
   *                yin<->yang charge of the form's own address;
   *   recursion  = 1 - pressure (repeated tokens = the form referencing itself);
   *   warmth     = 0.5 + 0.5*cos((hue - 30°)) — closeness of the address hue
   *                to the warm anchor (~30° ochre/red side of the wheel).
   */
  #smell(normalized, tokens, address, color, touch) {
    const structuralCount = [...normalized].filter((ch) => STRUCTURAL_CHARS.has(ch)).length;
    const lengths = tokens.map((t) => t.length);
    const mean = lengths.length ? lengths.reduce((s, n) => s + n, 0) / lengths.length : 0;
    const stdev = lengths.length
      ? Math.sqrt(lengths.reduce((s, n) => s + (n - mean) ** 2, 0) / lengths.length)
      : 0;
    const yangLines = ((d) => { let n = 0; for (let i = 0; i < 6; i++) n += (d >> i) & 1; return n; })(
      // address.gate -> King Wen -> Fu Xi decimal via bits of (gate-1) is NOT the
      // gate pattern; the scent only needs a deterministic 6-bit charge, so use
      // the gate's own binary representation (gate-1) as the polarity pattern.
      address.gate - 1,
    );
    const scent = [
      clamp01(0.5 * clamp01(touch.texture.nestingDepth / 6) + 0.5 * (normalized.length ? structuralCount / normalized.length : 0)),
      clamp01(mean ? stdev / mean : 0),
      clamp01(tokens.length / Math.max(1, normalized.length / 6)),
      yangLines / 6,
      clamp01(1 - touch.pressure),
      clamp01(0.5 + 0.5 * Math.cos(((color.hue - 30) * Math.PI) / 180)),
    ];
    return {
      dimension: 'Design',
      scent,
      components: ['structure', 'rhythm', 'density', 'polarity', 'recursion', 'warmth'],
    };
  }

  /** hear(X) — Space signature: canonical channels of the gate + top-3 resonance. */
  #hear(address, neighborhood) {
    return {
      dimension: 'Space',
      channels: channelsForGate(address.gate).map(([a, b]) => [a, b]),
      resonantAddresses: neighborhood.resonance.map((r) => ({
        id: r.id, addressKey: r.addressKey, rho: r.rho,
      })),
    };
  }

  /** Purpose / behavior / relationships / concepts — the semantic read. */
  #analyze(tokens, regime) {
    const tagged = tokens.map((word) => ({ word, pos: posGuess(word) }));
    // purpose: first verb phrase — the first VERB plus up to 3 following content words
    let purpose = null;
    const verbIndex = tagged.findIndex((t) => t.pos === 'VERB');
    if (verbIndex >= 0) {
      const phrase = [tagged[verbIndex].word];
      for (let k = verbIndex + 1; k < tagged.length && phrase.length < 4; k++) {
        if (!CLOSED_POS.has(tagged[k].pos)) phrase.push(tagged[k].word);
      }
      purpose = phrase.join(' ');
    } else {
      const content = tagged.filter((t) => !CLOSED_POS.has(t.pos)).slice(0, 4).map((t) => t.word);
      purpose = content.length ? content.join(' ') : null;
    }
    // behavior: routed operation + POS profile
    const posProfile = {};
    for (const t of tagged) posProfile[t.pos] = (posProfile[t.pos] || 0) + 1;
    // relationships: co-occurring known tool ids / aliases / gate addresses
    const tokenSet = new Set(tokens);
    const tools = [
      ...TOOL_IDS.filter((toolId) => tokenSet.has(toolId)),
      ...Object.keys(TOOL_ALIASES).filter((alias) => tokenSet.has(alias)),
    ];
    const gateRefs = [];
    for (let k = 0; k < tokens.length - 1; k++) {
      if (tokens[k] === 'gate' && /^\d+$/.test(tokens[k + 1])) {
        const g = Number(tokens[k + 1]);
        if (g >= 1 && g <= 64) gateRefs.push({ gate: g });
      }
    }
    // concepts: content words (len>3, open class), deduped, top 8 by frequency
    const freq = new Map();
    for (const t of tagged) {
      if (t.word.length > 3 && !CLOSED_POS.has(t.pos)) freq.set(t.word, (freq.get(t.word) || 0) + 1);
    }
    const concepts = [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || tokens.indexOf(a[0]) - tokens.indexOf(b[0]))
      .slice(0, 8)
      .map(([word]) => word);
    return {
      purpose,
      behavior: { operation: regime.operation, dimension: regime.dimension, posProfile },
      relationships: { tools, gates: gateRefs },
      concepts,
    };
  }

  /** Compact, JSON-safe history export. */
  exportHistory() {
    return this.history.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      addressKey: entry.addressKey,
      gate: entry.address.gate,
      regime: entry.regime,
      concepts: [...entry.concepts],
    }));
  }
}

export default IntakeGate;

