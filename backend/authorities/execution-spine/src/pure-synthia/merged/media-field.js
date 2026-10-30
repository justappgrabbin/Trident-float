// Pure Synthia Automata — merged: pure-JS media core (SRMF port: recursive media field, morph frames, video timeline, code weaver)

/**
 * Port of the computational heart of synthia-recursive-media-field-v1.9
 * (RecursiveAutomatonNode / RecurrentField / RecursiveMediaField injectFuXi/tick
 * dynamics) with ALL DOM/canvas/clock dependencies removed:
 *
 *   - no Date.now() anywhere: node seeding uses FNV-1a of a counter-derived id
 *     (SRMF used AddressRegistry ids + Date.now(); here ids are `mf-locus-N`);
 *   - no structuredClone of class instances: state is plain numbers;
 *   - rendering is a pure function frameRGBA() -> Uint8ClampedArray. The
 *     browser layer (sovereign UI) may putImageData/encode it; this core never
 *     touches canvas, MediaRecorder, or the network.
 *
 * Local hashing/canonicalization helpers are duplicated from
 * engine/derivation.js on purpose: the merged layer must not import from
 * engine/ (implementation contract, hard rule 6).
 */

import { colorFor } from '../state-space/colors.js';
import { gateToFuXiDecimal } from './kingwen.js';
import { ArtifactWriter } from './artifacts.js';

const NODE_COUNT = 64;
const STATE_BITS = 6;
const FULL_MASK = 63;
const DIMENSION_KEYS = ['movement', 'evolution', 'being', 'design', 'space'];
const TICK_MS = 40; // deterministic frame timing unit (25 fps equivalent)

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number(v) || 0));

/** Numeric FNV-1a (32-bit) — local copy; engine/derivation.js is off-limits here. */
function fnv1aNum(text) {
  let hash = 0x811c9dc5;
  const str = String(text);
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Hex FNV-1a over UTF-16 code units (deterministic across platforms). */
export function mediaHash(value) {
  return fnv1aNum(typeof value === 'string' ? value : canonical(value))
    .toString(16).padStart(8, '0');
}

/** Canonical serialization (sorted keys) — local copy of stableStringify. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

/** Hash a frame's bytes to an 8-char hex signature. */
export function frameHash(rgba) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < rgba.length; i++) {
    hash ^= rgba[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** popcount over the low 6 bits — the "changing lines" count of a xor mask. */
export function popcount6(value) {
  let v = value & FULL_MASK;
  let n = 0;
  while (v) { n += v & 1; v >>>= 1; }
  return n;
}

/** Deterministic unit seed in [0,1) from a 32-bit integer (SRMF seededUnit). */
function seededUnit(seed) {
  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 0xffffffff;
}

function hamming6(a, b) {
  return popcount6((a ^ b) & FULL_MASK);
}

/** '#RRGGBB' -> [r,g,b] (0-255). */
function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * One locus of the media field — the RecursiveAutomatonNode analogue.
 * Owns its gate (1-64), its Fu Xi decimal (0-63, via merged/kingwen), a
 * five-dimension state + energy/tension, and a small activation history ring.
 * Seeded deterministically from its counter-derived id (no clocks).
 */
export class MediaLocus {
  constructor(gate) {
    if (!Number.isInteger(gate) || gate < 1 || gate > NODE_COUNT) {
      throw new RangeError('gate must be 1..64');
    }
    this.gate = gate;
    this.fuxi = gateToFuXiDecimal(gate); // 0..63, canonical King Wen -> Fu Xi
    this.id = `mf-locus-${String(gate).padStart(2, '0')}`;
    const seed = fnv1aNum(this.id);
    this.state = {
      movement: seededUnit(seed ^ 0x01),
      evolution: seededUnit(seed ^ 0x02),
      being: seededUnit(seed ^ 0x04),
      design: seededUnit(seed ^ 0x08),
      space: seededUnit(seed ^ 0x10),
      energy: 0.5,
      tension: 0,
    };
    this.activationHistory = [];
  }

  activation() {
    return DIMENSION_KEYS.reduce((s, k) => s + this.state[k], 0) / DIMENSION_KEYS.length;
  }

  recordActivation(value) {
    this.activationHistory.push(value);
    if (this.activationHistory.length > 64) this.activationHistory.shift();
  }

  update(next) {
    for (const key of [...DIMENSION_KEYS, 'energy', 'tension']) {
      if (Number.isFinite(next[key])) this.state[key] = clamp(next[key]);
    }
  }
}

/**
 * The recursive media field: 64 loci on the Fu Xi hypercube with a recurrent
 * weight topology (self 0.15 · Hamming-1 neighbors 0.08 · Hamming-2 0.025),
 * SRMF's injectFuXi/tick dynamics, and deterministic RGBA rendering where each
 * locus contributes the state-space color of its gate address modulated by
 * activation (brightness), energy (tone->lightness) and tension (darkening).
 */
export class MediaField {
  constructor({ width = 64, height = 64 } = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError('width/height must be positive integers');
    }
    this.width = width;
    this.height = height;
    this.loci = Array.from({ length: NODE_COUNT }, (_, i) => new MediaLocus(i + 1));
    // Recurrent topology over Fu Xi decimals (SRMF RecurrentField.initializeTopology).
    this.weights = Array.from({ length: NODE_COUNT }, (_, from) => {
      const row = new Float64Array(NODE_COUNT);
      for (let to = 0; to < NODE_COUNT; to++) {
        if (from === to) { row[to] = 0.15; continue; }
        const d = hamming6(this.loci[from].fuxi, this.loci[to].fuxi);
        row[to] = d === 1 ? 0.08 : d === 2 ? 0.025 : 0;
      }
      return row;
    });
    this.learningRate = 0.025;
    this.decay = 0.999;
    this.tickCount = 0;
    this.lastMorph = null;
  }

  #activationVector() {
    return this.loci.map((l) => l.activation());
  }

  #influence(activations, target) {
    let sum = 0;
    for (let source = 0; source < NODE_COUNT; source++) {
      sum += activations[source] * this.weights[source][target];
    }
    return Math.tanh(sum);
  }

  /**
   * Inject a Fu Xi pattern (decimal 0..63) into the field: every locus gains
   * energy proportional to its Hamming resonance with the injected pattern.
   */
  injectFuXi(fuxiValue, strength = 1) {
    if (!Number.isInteger(fuxiValue) || fuxiValue < 0 || fuxiValue > FULL_MASK) {
      throw new RangeError('Fu Xi value must be 0..63');
    }
    for (const locus of this.loci) {
      const distance = hamming6(locus.fuxi, fuxiValue);
      const resonance = Math.max(0, 1 - distance / STATE_BITS) * clamp(strength);
      locus.state.energy = clamp(locus.state.energy * 0.8 + resonance * 0.2);
      locus.state.tension = clamp(
        locus.state.tension * 0.85 + Math.abs(resonance - locus.state.being) * 0.15,
      );
    }
    return this;
  }

  /**
   * Advance the field one tick (SRMF dynamics, verbatim coefficients).
   * externalState: null, a Fu Xi decimal 0..63, or { fuxi } — the addressed
   * pattern feeds each locus as (1 - hamming/6).
   */
  tick(externalState = null) {
    const externalFuxi = externalState == null ? null
      : Number.isInteger(externalState) ? externalState
        : Number.isInteger(externalState.fuxi) ? externalState.fuxi : null;
    const previous = this.#activationVector();
    const nextActivations = new Array(NODE_COUNT);
    for (let index = 0; index < NODE_COUNT; index++) {
      const locus = this.loci[index];
      const recurrent = this.#influence(previous, index);
      const external = externalFuxi == null ? 0 : 1 - hamming6(locus.fuxi, externalFuxi) / STATE_BITS;
      const movement = clamp(0.64 * locus.state.movement + 0.18 * recurrent + 0.18 * external);
      const evolution = clamp(0.72 * locus.state.evolution + 0.18 * Math.abs(recurrent) + 0.10 * locus.state.tension);
      const being = clamp(0.70 * locus.state.being + 0.20 * locus.state.energy + 0.10 * recurrent);
      const design = clamp(0.76 * locus.state.design + 0.14 * movement + 0.10 * evolution);
      const space = clamp(0.74 * locus.state.space + 0.16 * recurrent + 0.10 * design);
      locus.update({
        movement, evolution, being, design, space,
        energy: clamp(locus.state.energy * 0.992 + external * 0.008),
        tension: clamp(locus.state.tension * 0.95 + Math.abs(recurrent - being) * 0.05),
      });
      nextActivations[index] = locus.activation();
      locus.recordActivation(nextActivations[index]);
    }
    // Hebbian-style recurrent learning with decay (SRMF RecurrentField.learn).
    for (let source = 0; source < NODE_COUNT; source++) {
      for (let target = 0; target < NODE_COUNT; target++) {
        const oldWeight = this.weights[source][target] * this.decay;
        const delta = this.learningRate * previous[source] * nextActivations[target];
        this.weights[source][target] = Math.min(1, Math.max(-1, oldWeight + delta));
      }
    }
    this.tickCount += 1;
    return this.snapshot();
  }

  /**
   * Deterministic render: 64 loci tiled as an 8x8 block grid over the
   * width x height frame. Each locus color = state-space colorFor of its gate
   * address, with line driven by activation (saturation), tone by energy
   * (lightness), color field by design; brightness scales with activation and
   * darkens with tension. A small deterministic positional grain (+/- 8%)
   * keeps blocks from being flat. Read-only: does not mutate field state.
   */
  frameRGBA() {
    const frame = new Uint8ClampedArray(this.width * this.height * 4);
    const nodeColors = this.loci.map((locus) => {
      const activation = locus.activation();
      const line = 1 + Math.min(5, Math.floor(activation * 6));
      const tone = 1 + Math.min(5, Math.floor(locus.state.energy * 6));
      const colorField = 1 + Math.min(5, Math.floor(locus.state.design * 6));
      const color = colorFor({ gate: locus.gate, line, color: colorField, tone, base: 1 });
      const brightness = (0.25 + 0.75 * activation) * (1 - 0.3 * locus.state.tension);
      const [r, g, b] = hexToRgb(color.hex);
      return [r * brightness, g * brightness, b * brightness, locus.gate];
    });
    for (let y = 0; y < this.height; y++) {
      const by = Math.min(7, Math.floor((y * 8) / this.height));
      for (let x = 0; x < this.width; x++) {
        const bx = Math.min(7, Math.floor((x * 8) / this.width));
        const [r, g, b, gate] = nodeColors[by * 8 + bx];
        const grain = 0.92 + 0.08 * (((x * 31 + y * 17 + gate) % 8) / 7);
        const offset = (y * this.width + x) * 4;
        frame[offset] = Math.min(255, Math.round(r * grain));
        frame[offset + 1] = Math.min(255, Math.round(g * grain));
        frame[offset + 2] = Math.min(255, Math.round(b * grain));
        frame[offset + 3] = 255;
      }
    }
    return frame;
  }

  #capture() {
    return {
      states: this.loci.map((l) => ({ ...l.state })),
      weights: this.weights.map((row) => row.slice()),
      histories: this.loci.map((l) => [...l.activationHistory]),
      tickCount: this.tickCount,
    };
  }

  #restore(saved) {
    this.loci.forEach((locus, i) => {
      locus.state = { ...saved.states[i] };
      locus.activationHistory = [...saved.histories[i]];
    });
    saved.weights.forEach((row, i) => this.weights[i].set(row));
    this.tickCount = saved.tickCount;
  }

  /**
   * Interpolated morph between two gates. The changing lines — the set bits of
   * (fuxi(from) XOR fuxi(to)) — drive the morph: the source pattern is
   * injected with strength (1-t), the target with t, and the field ticks under
   * the dominant pattern of each phase. PURE with respect to field state:
   * captures and restores, so two calls on one field are byte-identical.
   * Returns [Uint8ClampedArray, ...] and records this.lastMorph metadata.
   */
  morphFrames(fromGate, toGate, steps = 8) {
    for (const g of [fromGate, toGate]) {
      if (!Number.isInteger(g) || g < 1 || g > 64) throw new RangeError('gates must be 1..64');
    }
    if (!Number.isInteger(steps) || steps < 1) throw new RangeError('steps must be >= 1');
    const fromF = gateToFuXiDecimal(fromGate);
    const toF = gateToFuXiDecimal(toGate);
    const changingMask = (fromF ^ toF) & FULL_MASK;
    const changingLines = [];
    for (let bit = 0; bit < STATE_BITS; bit++) {
      if (changingMask & (1 << bit)) changingLines.push(bit + 1); // lines are 1-indexed
    }
    const saved = this.#capture();
    const frames = [];
    try {
      for (let k = 0; k < steps; k++) {
        const t = steps === 1 ? 1 : k / (steps - 1);
        this.injectFuXi(fromF, 1 - t);
        this.injectFuXi(toF, t);
        this.tick(t < 0.5 ? fromF : toF);
        frames.push(this.frameRGBA());
      }
    } finally {
      this.#restore(saved);
    }
    this.lastMorph = Object.freeze({
      fromGate, toGate, steps,
      fromFuXi: fromF, toFuXi: toF,
      changingMask,
      changingLines: Object.freeze(changingLines),
      changingLineCount: changingLines.length, // popcount(xor)
    });
    return frames;
  }

  snapshot() {
    return {
      type: 'media-field',
      tick: this.tickCount,
      width: this.width,
      height: this.height,
      loci: this.loci.map((l) => ({
        gate: l.gate,
        fuxi: l.fuxi,
        activation: l.activation(),
        energy: l.state.energy,
        tension: l.state.tension,
      })),
    };
  }
}

/**
 * A deterministic frame sequence. The core never encodes video containers;
 * exportFrames() hands {rgba, width, height, delay} records to the browser
 * layer, which may encode via canvas/MediaRecorder there (and only there).
 */
export class VideoTimeline {
  constructor({ width = 64, height = 64 } = {}) {
    this.width = width;
    this.height = height;
    this.frames = [];
  }

  addFrame(rgba, durationTicks = 1) {
    const expected = this.width * this.height * 4;
    if (!rgba || rgba.length !== expected) {
      throw new RangeError(`frame must be ${expected} bytes (${this.width}x${this.height} RGBA)`);
    }
    if (!Number.isInteger(durationTicks) || durationTicks < 1) {
      throw new RangeError('durationTicks must be a positive integer');
    }
    this.frames.push({ rgba, durationTicks });
    return this;
  }

  /** -> [{rgba, width, height, delay(ms)}], delay = durationTicks * 40ms. */
  exportFrames() {
    return this.frames.map(({ rgba, durationTicks }) => ({
      rgba,
      width: this.width,
      height: this.height,
      delay: durationTicks * TICK_MS,
    }));
  }

  get frameCount() { return this.frames.length; }
}

const JS_KEYWORDS = Object.freeze([
  'function', 'return', 'const', 'let', 'var', 'class', 'extends', 'import',
  'export', 'default', 'async', 'await', 'new', 'if', 'else', 'for', 'while',
  'switch', 'try', 'catch', 'throw', 'typeof', 'instanceof', 'yield', 'static',
]);

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/;

function sanitizeIdentifier(name, fallback = 'wovenModule') {
  const parts = String(name || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const camel = parts.map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join('');
  const candidate = camel || fallback;
  return IDENTIFIER.test(candidate) && !/^[0-9]/.test(candidate) ? candidate : fallback;
}

/**
 * Pure code capability: analyze/weave/diff JavaScript source as data.
 * weave() emits a template-based module STRING artifact — the core never
 * evaluates it (no eval, no new Function, no dynamic import).
 */
export class CodeWeaver {
  /** morph-mir-style structural sniff of a source string. */
  analyze(source) {
    const src = String(source ?? '');
    const functions = [];
    for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) functions.push(m[1]);
    for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) functions.push(m[1]);
    const classes = [...src.matchAll(/class\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    const imports = [...src.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const exports = [...src.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type)?\s*([A-Za-z_$][\w$]*)?/g)]
      .map((m) => (m[0].includes('default') ? `default:${m[1] || ''}` : m[1])).filter(Boolean);
    const keywords = JS_KEYWORDS.filter((kw) => new RegExp(`\\b${kw}\\b`).test(src));
    return {
      functions: [...new Set(functions)],
      classes: [...new Set(classes)],
      imports: [...new Set(imports)],
      exports: [...new Set(exports)],
      keywords,
      lines: src === '' ? 0 : src.split('\n').length,
      bytes: src.length,
      signature: mediaHash(src),
    };
  }

  /**
   * Generate a small deterministic JS module string from
   * {name, gates:[], purpose}. Template-based; the artifact is data.
   */
  weave(spec = {}) {
    const name = sanitizeIdentifier(spec.name);
    const constantName = name.replace(/([A-Z])/g, '_$1').toUpperCase();
    const gates = [...new Set((Array.isArray(spec.gates) ? spec.gates : [])
      .map(Number).filter((g) => Number.isInteger(g) && g >= 1 && g <= 64))].sort((a, b) => a - b);
    const purpose = String(spec.purpose || 'woven module').replace(/[\r\n*]/g, ' ').trim();
    const signature = mediaHash({ name, gates, purpose });
    return [
      `// Pure Synthia Automata — woven module: ${name}`,
      `// purpose: ${purpose}`,
      `// weave signature: ${signature} (template artifact — data, never executed by the core)`,
      '',
      `export const ${constantName}_GATES = Object.freeze([${gates.join(', ')}]);`,
      `export const ${constantName}_SIGNATURE = '${signature}';`,
      '',
      `export function ${name}Resonance(gate) {`,
      `  const gates = ${constantName}_GATES;`,
      '  if (!gates.length) return 0;',
      '  const index = ((Number(gate) - 1) % gates.length + gates.length) % gates.length;',
      '  const partner = gates[index];',
      '  let mask = (Number(gate) - 1) ^ (partner - 1);',
      '  let changing = 0;',
      '  while (mask) { changing += mask & 1; mask >>>= 1; }',
      '  return changing / 6; // hamming tension over the 6-bit line pattern',
      '}',
      '',
      `export default Object.freeze({ name: '${name}', gates: ${constantName}_GATES, purpose: '${purpose.replace(/'/g, '')}', signature: ${constantName}_SIGNATURE });`,
      '',
    ].join('\n');
  }

  /**
   * weave() + ArtifactWriter: generate the module string and register it as a
   * real code artifact {kind:'code', fileName:'<name>.js', mime:
   * 'text/javascript', text}. Returns the writer's {artifact} record.
   */
  weaveArtifact(spec = {}, writer = new ArtifactWriter()) {
    const name = sanitizeIdentifier(spec.name);
    const text = this.weave(spec);
    return writer.write('code', { fileName: `${name}.js`, text, mime: 'text/javascript' });
  }

  /** Line-set diff summary between two source strings (deterministic). */
  diffSummary(a, b) {
    const linesA = String(a ?? '').split('\n');
    const linesB = String(b ?? '').split('\n');
    const setA = new Set(linesA);
    const setB = new Set(linesB);
    const added = [...new Set(linesB.filter((l) => !setA.has(l)))];
    const removed = [...new Set(linesA.filter((l) => !setB.has(l)))];
    const unchanged = linesB.filter((l) => setA.has(l)).length;
    return {
      added,
      removed,
      addedCount: added.length,
      removedCount: removed.length,
      unchangedCount: unchanged,
      identical: added.length === 0 && removed.length === 0 && linesA.length === linesB.length,
      signature: mediaHash(`${mediaHash(String(a ?? ''))}:${mediaHash(String(b ?? ''))}`),
    };
  }
}

export default MediaField;

