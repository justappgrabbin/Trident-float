import { AutolingEngine } from '../../../../authorities/execution-spine/src/pure-synthia/automata/tools/tool-14-autoling.js';
import { completeAnalogy } from '../../../../authorities/execution-spine/src/pure-synthia/engine/boolean-ato.js';
import { GATES } from '../../../../authorities/execution-spine/src/pure-synthia/state-space/human-design.js';
import { CANON_DIMENSION_CHAINS } from '../../../../authorities/execution-spine/src/pure-synthia/state-space/dimension-canon.js';
import { normalizeAddress } from './address.mjs';

const STOP = new Set('a an the and or of to in on at by for from with as is are be it this that i you we they my your our its'.split(' '));
const IRREGULAR = { ran: 'run', ate: 'eat', written: 'write', wrote: 'write', was: 'be', were: 'be' };
const tokens = text => String(text).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const sorted = vector => Object.fromEntries(Object.entries(vector).filter(([, v]) => v > 0).sort(([a], [b]) => a.localeCompare(b)));
const signature = vector => JSON.stringify(sorted(vector));

export function cosine(a = {}, b = {}) {
  const dot = Object.entries(a).reduce((s, [k, v]) => s + v * (b[k] ?? 0), 0);
  const norm = v => Math.sqrt(Object.values(v).reduce((s, x) => s + x * x, 0));
  return Math.max(0, Math.min(1, dot / (norm(a) * norm(b) || 1)));
}

function checkedFeatures(features) {
  if (!features || Array.isArray(features) || typeof features !== 'object') throw new TypeError('features must be a named numeric feature object');
  for (const [name, value] of Object.entries(features)) {
    if (!name || typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError('feature weights must be finite nonnegative numbers');
  }
  return sorted(features);
}

/** Interpretable prototype model, not a trained general-language model.
 * Its feature axes are words in the existing gate/dimension source vocabulary.
 * New lexical meanings can be taught explicitly, without pre-creating addresses.
 */
export class SemanticFeatureModel {
  constructor() {
    this.version = 'source-prototypes-v1';
    this.concepts = new Map();
    this.vocabulary = new Set();
    const descriptions = Object.values(GATES).flatMap(g => [g.name, g.theme, ...g.lines.map(l => `${l.name} ${l.keynote}`)]);
    descriptions.push(...Object.entries(CANON_DIMENSION_CHAINS).map(([d, chain]) => [d, ...chain].join(' ')));
    for (const text of descriptions) for (const word of tokens(text)) if (!STOP.has(word)) this.vocabulary.add(word);
    this.gates = Object.values(GATES).map(g => ({ gate: g.number, text: `${g.name} ${g.theme}`, vector: this.features(`${g.name} ${g.theme}`).vector, lines: g.lines }));
    this.dimensions = Object.entries(CANON_DIMENSION_CHAINS).map(([dimension, chain]) => ({ dimension, vector: this.features([dimension, ...chain].join(' ')).vector }));
  }

  lemma(word) {
    if (IRREGULAR[word]) return IRREGULAR[word];
    const candidates = [];
    if (word.endsWith('ies')) candidates.push(word.slice(0, -3) + 'y');
    if (word.endsWith('ing')) {
      const root = word.slice(0, -3);
      candidates.push(root, root + 'e', /([a-z])\1$/.test(root) ? root.slice(0, -1) : root);
    }
    if (word.endsWith('ed')) candidates.push(word.slice(0, -2), word.slice(0, -1));
    if (word.endsWith('es')) candidates.push(word.slice(0, -2));
    if (word.endsWith('s') && !word.endsWith('ss')) candidates.push(word.slice(0, -1));
    return candidates.find(x => this.vocabulary.has(x) || this.concepts.has(x)) ?? word;
  }

  teach(word, features) {
    const parts = tokens(word);
    if (parts.length !== 1) throw new TypeError('teach requires one lexical token');
    const vector = checkedFeatures(features);
    const axes = new Set([...this.vocabulary].map(w => `meaning:${this.lemma(w)}`));
    if (!Object.keys(vector).length || Object.keys(vector).some(k => !axes.has(k))) throw new TypeError('teach requires nonempty features from the model meaning vocabulary');
    this.concepts.set(parts[0], vector);
    return this;
  }

  fork() {
    const copy = new SemanticFeatureModel();
    copy.concepts = new Map(structuredClone([...this.concepts]));
    return copy;
  }

  features(text) {
    const words = tokens(text);
    const vector = Object.create(null), unknown = [], morphemes = [];
    // Reuse the included Klein AUTOLING Boolean morphology on normalized tokens.
    const autoling = new AutolingEngine().analyzeMorphology(words.join(' '));
    for (const [index, word] of words.entries()) {
      if (STOP.has(word)) continue;
      const lemma = this.lemma(word);
      const learned = this.concepts.get(word) ?? this.concepts.get(lemma);
      const semantic = learned ?? (this.vocabulary.has(lemma) ? { [`meaning:${lemma}`]: 1 } : {});
      for (const [key, value] of Object.entries(semantic)) vector[key] = (vector[key] ?? 0) + value;
      if (!Object.keys(semantic).length) unknown.push(word);
      morphemes.push({ surface: word, lemma, features: autoling.morphemes[index]?.features ?? {}, semantic: sorted(semantic) });
    }
    return { vector: sorted(vector), morphemes, unknown: [...new Set(unknown)], morphology: autoling, tokenCount: words.filter(w => !STOP.has(w)).length };
  }
}

function subjectText(subject) {
  if (typeof subject === 'string') return subject;
  if (!subject || typeof subject !== 'object') return '';
  if (typeof subject.text === 'string') return subject.text;
  // Browser/research subjects carry an input object; metadata and URLs are not prose.
  const input = subject.input ?? subject;
  return [input.title, input.question, input.query, input.text, input.page?.title, input.page?.text].filter(x => typeof x === 'string').join(' ');
}

export class SemanticAddressGenerator {
  constructor({ model = new SemanticFeatureModel(), limit = 4, minimumSimilarity = 0.1 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 64) throw new TypeError('limit must be an integer in 1..64');
    if (!Number.isFinite(minimumSimilarity) || minimumSimilarity <= 0 || minimumSimilarity > 1) throw new TypeError('minimumSimilarity must be in (0,1]');
    this.model = model; this.limit = limit; this.minimumSimilarity = minimumSimilarity;
    this.registry = new Map();
  }

  fork() { return new SemanticAddressGenerator({ model: this.model.fork(), limit: this.limit, minimumSimilarity: this.minimumSimilarity }); }

  generate(subject, context = {}) {
    const analysis = this.model.features(subjectText(subject));
    let vector = subject?.features === undefined ? analysis.vector : checkedFeatures(subject.features);
    let analogy = null;
    if (subject?.analogy) {
      const { a, b, c, mode = 'xor' } = subject.analogy;
      const sources = [a, b, c].map(item => typeof item === 'string' ? this.model.features(item).vector : checkedFeatures(item));
      if (sources.some(v => !Object.keys(v).length)) throw new TypeError('ATO analogy requires three nonempty semantic feature vectors');
      const axes = [...new Set(sources.flatMap(v => Object.keys(v)))].sort();
      // A:B::C:D is computed in a shared, named feature space, never in hash bits.
      const result = completeAnalogy(...sources.map(v => axes.map(k => Number((v[k] ?? 0) > 0))), mode);
      vector = sorted(Object.fromEntries(axes.map((k, i) => [k, Number(result.result[i])])));
      analogy = { axes, sources, mode, relation: [...result.relation], result: [...result.result] };
    }
    const rank = prototypes => prototypes.map(p => ({ ...p, score: cosine(vector, p.vector) })).sort((a, b) => b.score - a.score);
    const gates = rank(this.model.gates).filter(g => g.score >= this.minimumSimilarity).slice(0, this.limit);
    const dimensions = rank(this.model.dimensions);
    const selectedDimension = context.dimension ?? (dimensions[0]?.score > 0 ? dimensions[0].dimension : 'Design');
    const defaults = { planetary: 'semantic', color: 1, tone: 1, base: 1, house: 1 };
    const addresses = gates.map(g => {
      const lines = g.lines.map(l => ({ line: l.line, score: cosine(vector, this.model.features(`${l.name} ${l.keynote}`).vector) })).sort((a, b) => b.score - a.score || a.line - b.line);
      const semantic = {
        schema: this.model.version, vector, signature: signature(vector),
        evidenceStatus: 'experimental', similarity: g.score,
        derivation: { method: 'named-feature-cosine', gatePrototype: g.text, matchedFeatures: Object.keys(vector).filter(k => g.vector[k] > 0),
          dimensionMethod: context.dimension ? 'explicit-context' : dimensions[0]?.score > 0 ? 'source-chain-cosine' : 'default-Design',
          lineMethod: lines[0]?.score > 0 ? 'source-line-cosine' : 'default-1',
          defaults, analogy, morphemes: analysis.morphemes, unknown: analysis.unknown },
      };
      const address = normalizeAddress({ ...defaults, dimension: selectedDimension, gate: g.gate, line: lines[0]?.line ?? 1,
        coherence: g.score, source: 'semantic-address-generator', semantic });
      // Validation and construction precede lookup; novelty never rejects a candidate.
      this.registry.set(address.id, address);
      return address;
    });
    return { addresses, analysis, vector, analogy, status: addresses.length ? 'generated' : 'unresolved', model: this.model.version,
      reason: addresses.length ? null : 'No supported gate prototype matched the semantic features.' };
  }
}

