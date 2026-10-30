// Pure Synthia Automata — tool-15: diseminer canonical (distributional narrative engine:
// receive→simulate→narrate→space→claims→influence)
// Fidelity port of src/UPGRADES/compiled/runtime/diseminer.js (DiseminerEngine, Klein/Lieman/Lindstrom
// 1968), made synchronous + deterministic: seeded PRNG sampling, counter-based ids, no clocks.
import { Automaton } from '../automaton.js';

export class DiseminerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DiseminerError';
    this.code = code;
    this.details = details;
  }
}

// Deterministic seeded PRNG (mulberry32) — local copy keeps this file zero-dependency.
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const fnv1a32 = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const VERB_AUX = ['is', 'are', 'was', 'were', 'has', 'have', 'had', 'does', 'do', 'did',
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must'];

export class DiseminerEngine {
  constructor() {
    this.distributionalSpace = new Map(); // word → { word, contexts, cooccurrence: Map }
    this.claims = new Map();
    this.narratives = new Map();
    this.simulationHistory = [];
    this.sequence = 0;
  }

  tokenize(text) {
    return String(text).toLowerCase().replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
  }

  // ---------- observe: distributional space update (window 5) + familiarity sense ----------
  observe(text) {
    const tokens = this.tokenize(text);
    const knownWords = tokens.filter((t) => this.distributionalSpace.has(t)).length;
    const exposures = tokens.map((t) => {
      const vector = this.distributionalSpace.get(t);
      return vector ? vector.contexts.length : 0;
    });
    for (let i = 0; i < tokens.length; i++) {
      const word = tokens[i];
      if (!this.distributionalSpace.has(word)) {
        this.distributionalSpace.set(word, { word, contexts: [], cooccurrence: new Map() });
      }
      const vector = this.distributionalSpace.get(word);
      const left = tokens.slice(Math.max(0, i - 5), i);
      const right = tokens.slice(i + 1, Math.min(tokens.length, i + 6));
      vector.contexts.push({ left, right, position: i });
      for (const contextWord of [...left, ...right]) {
        vector.cooccurrence.set(contextWord, (vector.cooccurrence.get(contextWord) || 0) + 1);
      }
    }
    const wordCount = tokens.length;
    const familiar = wordCount ? knownWords / wordCount : 0;
    const avgExposure = wordCount ? exposures.reduce((s, x) => s + x, 0) / wordCount : 0;
    return {
      sense: {
        alert: familiar < 0.5,
        familiar,
        wordCount,
        knownWords,
        avgExposure,
      },
      words: this.distributionalSpace.size,
    };
  }

  // ---------- claims: naive SVO extraction with modality cues ----------
  extractClaims(text, source = 'observation') {
    const sentences = String(text).split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 10);
    const extracted = [];
    for (const sentence of sentences) {
      const claim = this.extractClaimFromSentence(sentence, source);
      if (claim) {
        extracted.push(claim);
        this.claims.set(claim.id, claim);
      }
    }
    this.crossReferenceClaims(extracted);
    return extracted;
  }

  extractClaimFromSentence(sentence, source) {
    const tokens = this.tokenize(sentence);
    if (tokens.length < 3) return null;
    const subject = tokens[0];
    const predicate = tokens.find((t, i) => i > 0 && this.isVerb(t)) || tokens[1];
    const object = tokens.slice(tokens.indexOf(predicate) + 1).join(' ') || tokens[tokens.length - 1];
    const modality = this.inferModality(sentence);
    const evidence = this.findEvidence(subject, predicate, object);
    return {
      id: `claim_${++this.sequence}`,
      text: sentence,
      source,
      subject,
      predicate,
      object,
      confidence: evidence.reduce((sum, e) => sum + e.strength, 0) / (evidence.length || 1),
      evidence,
      contradictions: [],
      supports: [],
      modality,
    };
  }

  isVerb(word) {
    return VERB_AUX.includes(String(word).toLowerCase()) || /(ing|ed|en|s)$/.test(word);
  }

  inferModality(sentence) {
    const lower = sentence.toLowerCase();
    if (/\b(must|certainly|definitely|always|never|all)\b/.test(lower)) return 'certain';
    if (/\b(probably|likely|most|generally|usually)\b/.test(lower)) return 'probable';
    if (/\b(might|could|possibly|maybe|some)\b/.test(lower)) return 'possible';
    if (/\b(think|believe|suggest|hypothesize|speculate)\b/.test(lower)) return 'speculative';
    return 'probable';
  }

  findEvidence(subject, predicate, object) {
    const evidence = [];
    for (const [word, vector] of this.distributionalSpace) {
      if (word === subject || word === object) {
        for (const context of vector.contexts) {
          const contextText = [...context.left, word, ...context.right].join(' ');
          if (contextText.includes(predicate) || contextText.includes(object)) {
            evidence.push({ text: contextText, strength: 0.1 });
          }
        }
      }
    }
    return evidence.slice(0, 5);
  }

  crossReferenceClaims(claims) {
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const a = claims[i];
        const b = claims[j];
        if (a.subject === b.subject && a.predicate !== b.predicate) {
          const negationWords = ['not', 'no', 'never', 'none', 'without', 'against'];
          const aNegated = negationWords.some((w) => a.text.toLowerCase().includes(w));
          const bNegated = negationWords.some((w) => b.text.toLowerCase().includes(w));
          if (aNegated !== bNegated) { a.contradictions.push(b.id); b.contradictions.push(a.id); }
        }
        if (a.subject === b.subject && a.predicate === b.predicate) {
          a.supports.push(b.id);
          b.supports.push(a.id);
        }
      }
    }
  }

  // ---------- Monte Carlo simulation (seeded, deterministic) ----------
  runMonteCarlo(query, options = {}) {
    const iterations = options.iterations || 1000;
    const seed = options.seed !== undefined ? options.seed : fnv1a32(String(query));
    const random = mulberry32(seed);
    const hypotheses = this.generateHypotheses(query);
    const samples = [];
    let iteration = 0;
    let converged = false;
    while (iteration < iterations && !converged) {
      for (const hypothesis of hypotheses) {
        const prior = typeof options.prior === 'number' ? options.prior
          : options.prior instanceof Map ? (options.prior.get(hypothesis) || 1 / hypotheses.length)
          : 1 / hypotheses.length;
        // seeded sampling: jitter the evidence weight, then Bayes-like posterior update
        const jitter = 0.95 + random() * 0.1;
        const evidenceWeight = Math.min(this.calculateEvidenceWeight(hypothesis, query) * jitter, 1);
        const posterior = (prior * evidenceWeight) / (prior * evidenceWeight + (1 - prior) * (1 - evidenceWeight) + 0.001);
        samples.push({ hypothesis, probability: posterior, evidenceWeight, priorProbability: prior });
      }
      iteration += hypotheses.length;
      if (iteration >= 100) {
        const recent = samples.slice(-100);
        const mean = recent.reduce((s, x) => s + x.probability, 0) / recent.length;
        const variance = recent.reduce((s, x) => s + (x.probability - mean) ** 2, 0) / recent.length;
        converged = variance < 0.01;
      }
    }
    const best = samples.reduce((b, c) => (c.probability > b.probability ? c : b), samples[0]);
    const probabilities = samples.map((s) => s.probability).sort((a, b) => a - b);
    const ci = [
      probabilities[Math.floor(probabilities.length * 0.025)],
      probabilities[Math.min(Math.floor(probabilities.length * 0.975), probabilities.length - 1)],
    ];
    const simulation = {
      query,
      seed,
      iterations: iteration,
      hypotheses: hypotheses.length,
      bestHypothesis: best.hypothesis,
      bestProbability: best.probability,
      confidenceInterval: ci,
      doubtBypassed: best.probability > 0.7 && ci[0] > 0.5,
    };
    this.simulationHistory.push(simulation);
    return simulation;
  }

  generateHypotheses(query) {
    const tokens = this.tokenize(query);
    const hypotheses = [];
    for (const token of tokens) {
      const vector = this.distributionalSpace.get(token);
      if (vector) {
        for (const [target] of vector.cooccurrence) {
          hypotheses.push(`${token} associates with ${target}`);
        }
      }
    }
    hypotheses.push(`The answer to "${query}" is positive`);
    hypotheses.push(`The answer to "${query}" is negative`);
    hypotheses.push(`The answer to "${query}" requires more context`);
    return [...new Set(hypotheses)];
  }

  calculateEvidenceWeight(hypothesis, query) {
    const hypothesisTokens = this.tokenize(hypothesis);
    const queryTokens = this.tokenize(query);
    let weight = 0;
    for (const hToken of hypothesisTokens) {
      const vector = this.distributionalSpace.get(hToken);
      if (!vector) continue;
      for (const qToken of queryTokens) {
        weight += vector.cooccurrence.get(qToken) || 0;
      }
    }
    return Math.min(weight / 10, 1.0);
  }

  // ---------- narrative generation: 10 w-dimensions → deterministic narrative ----------
  generateNarrative(query, userContext = {}) {
    const simulation = this.runMonteCarlo(query, { iterations: 500 });
    const w = this.calculateWDimensions(query, userContext, simulation);
    const narrative = this.buildNarrative(query, simulation, w, userContext);
    this.narratives.set(narrative.id, narrative);
    return narrative;
  }

  calculateWDimensions(query, userContext, simulation) {
    const queryTokens = this.tokenize(query);
    const querySet = new Set(queryTokens);
    const intersects = (other) => {
      const otherSet = new Set(this.tokenize(other || ''));
      return new Set([...querySet].filter((x) => otherSet.has(x))).size;
    };
    return {
      w1_relevance: intersects(userContext.interests) / Math.max(querySet.size, new Set(this.tokenize(userContext.interests || '')).size, 1),
      w2_urgency: /\b(now|urgent|immediately|asap|deadline|critical|emergency)\b/i.test(query) ? 0.9 : 0.3,
      w3_emotionalResonance: Math.min(queryTokens.filter((t) => ['love', 'hate', 'fear', 'hope', 'dream', 'passion', 'purpose', 'meaning'].includes(t)).length / 2, 1.0),
      w4_cognitiveLoad: Math.min(queryTokens.length / 20, 1.0),
      w5_socialProof: simulation.iterations > 100 ? 0.7 : 0.3,
      w6_authority: /\b(research|study|expert|scientist|professor|doctor|evidence)\b/i.test(query) ? 0.8 : 0.5,
      w7_reciprocity: 0.5,
      w8_scarcity: /\b(only|limited|exclusive|rare|unique|special|once)\b/i.test(query) ? 0.8 : 0.2,
      w9_consistency: intersects(userContext.beliefs) / Math.max(querySet.size, 1),
      w10_liking: Number.isFinite(userContext.likingScore) ? userContext.likingScore : 0.5,
    };
  }

  buildNarrative(query, simulation, wDims, userContext) {
    const bestHypothesis = simulation.bestHypothesis;
    const values = Object.values(wDims);
    const influenceScore = values.reduce((s, v) => s + v, 0) / values.length;
    const seeker = userContext.name || 'the seeker';
    const scenes = [
      {
        setting: `The context of "${query}"`,
        characters: [seeker, 'the evidence'],
        action: `Exploring the question: ${query}`,
        emotionalTone: 'curious',
      },
      {
        setting: 'The simulation chamber',
        characters: ['Monte Carlo engine', 'distributional space'],
        action: `Running ${simulation.iterations} iterations to find the best hypothesis`,
        emotionalTone: 'analytical',
      },
      {
        setting: 'The resolution',
        characters: [seeker],
        action: `The evidence points to: ${bestHypothesis}`,
        emotionalTone: influenceScore > 0.7 ? 'confident' : 'cautious',
      },
    ];
    const story = scenes.map((s) => `Scene: ${s.setting}\nCharacters: ${s.characters.join(', ')}\nAction: ${s.action}\nTone: ${s.emotionalTone}\n`).join('\n---\n');
    return {
      id: `narrative_${++this.sequence}`,
      targetUser: userContext.name || 'anonymous',
      story,
      scenes,
      wDimensions: wDims,
      influenceScore,
      personalizationDepth: values.filter((v) => v > 0.5).length / values.length,
      doubtBypassed: simulation.doubtBypassed,
      evidenceAnchors: [simulation.bestHypothesis],
    };
  }

  getStats() {
    return {
      words: this.distributionalSpace.size,
      claims: this.claims.size,
      narratives: this.narratives.size,
      simulations: this.simulationHistory.length,
    };
  }
}

const STATES = [
  { id: 'receive', name: 'Receive', initial: true },
  { id: 'simulate', name: 'Simulate' },
  { id: 'narrate', name: 'Narrate' },
  { id: 'space', name: 'Space' },
  { id: 'claims', name: 'Claims' },
  { id: 'influence', name: 'Influence', accepting: true },
];

// Named transitions per STATE_SPACE_SPEC §7.
const DELTA_TABLE = {
  'receive|observe': { to: 'space', transition: 'ignition' },
  'space|observe': { to: 'space', transition: 'flow' },
  'receive|extract': { to: 'claims', transition: 'ignition' },
  'claims|extract': { to: 'claims', transition: 'core' },
  'receive|simulate': { to: 'simulate', transition: 'ignition' },
  'simulate|simulate': { to: 'simulate', transition: 'recursion' },
  'receive|narrate': { to: 'simulate', transition: 'ignition' },
  'simulate|narrate': { to: 'narrate', transition: 'recursion' },
  'narrate|narrate': { to: 'influence', transition: 'weave' },
  'influence|narrate': { to: 'influence', transition: 'becoming' },
  'receive|stats': { to: 'receive', transition: 'core' },
};

const OP_PATHS = {
  observe: [['receive', 'observe'], ['space', 'observe']],
  extract: [['receive', 'extract'], ['claims', 'extract']],
  simulate: [['receive', 'simulate'], ['simulate', 'simulate']],
  narrate: [['receive', 'narrate'], ['simulate', 'narrate'], ['narrate', 'narrate'], ['influence', 'narrate']],
  stats: [['receive', 'stats']],
};

const normalizeInput = (input) => {
  if (typeof input === 'string') return { operation: 'observe', text: input };
  if (input && Array.isArray(input.args) && input.args.length && !input.operation) {
    return { ...input, operation: 'observe', text: input.args.join(' ') };
  }
  if (input && input.text !== undefined && !input.operation) return { ...input, operation: 'observe' };
  return input || {};
};

export class DiseminerAutomaton extends Automaton {
  static descriptor = {
    id: 'diseminer',
    aliases: ['diseminer-canonical', 'dise', 'narrative-engine'],
    gate: 48,
    channels: ['16-48'],
    capabilities: ['observe', 'extract-claims', 'monte-carlo', 'narrative', 'stats'],
    ports: {
      in: [{ id: 'text', type: 'text', schemaVersion: '1' }],
      out: [{ id: 'narrative', type: 'narrative', schemaVersion: '1' }, { id: 'claims', type: 'claims', schemaVersion: '1' }],
    },
    automatonForm: 'distributional narrative engine',
    dimension: 'Evolution',
    description: 'Klein/Lieman/Lindstrom DISEMINER (1968), canonical enhanced: persistent window-5 distributional co-occurrence space, naive SVO claim extraction with modality cues, seeded Monte Carlo hypothesis sampling with 95% CI and doubt-bypass detection, and deterministic narrative generation scored over the 10 w-dimensions of influence.',
  };

  constructor(options = {}) {
    const memory = options.state || new DiseminerEngine();
    let dispatch;
    super({
      id: 'diseminer',
      address: { mode: 'macro', gate: 48, line: 1, color: 1, tone: 1, base: 1, planetaryDimension: 'Evolution' },
      states: STATES,
      alphabet: ['observe', 'extract', 'simulate', 'narrate', 'stats'],
      delta: (state, symbol) => DELTA_TABLE[`${state}|${symbol}`] || { to: state, transition: 'flow' },
      q0: 'receive',
      // Every op terminates at its natural resting state; all of them accept.
      // observe→space, extract→claims, simulate→simulate, narrate→influence,
      // stats→receive. (Previously only 'influence' accepted, so observe /
      // extract / simulate / stats runs were reported as rejected.)
      finals: ['receive', 'space', 'claims', 'simulate', 'influence'],
      ports: DiseminerAutomaton.descriptor.ports,
      capabilities: DiseminerAutomaton.descriptor.capabilities,
      dimension: 'Evolution',
      implementation: (input, context) => dispatch(input, context),
    });
    this.ownedState = memory;
    dispatch = (input, context) => this.#dispatch(input, context);
  }

  #dispatch(rawInput, ctx = {}) {
    // Base passes {automaton, state, emit, context}; unwrap the caller context.
    const context = (ctx && ctx.context) || ctx || {};
    const input = normalizeInput(rawInput);
    const op = input.operation || 'observe';
    const path = OP_PATHS[op];
    if (!path) throw new DiseminerError('UNKNOWN_OPERATION', String(op));
    for (const [from, symbol] of path) this.step(from, symbol, { tool: this.id });
    const engine = this.ownedState;
    switch (op) {
      case 'observe': {
        if (input.text === undefined) throw new DiseminerError('TEXT_REQUIRED', 'observe requires input.text');
        return engine.observe(input.text);
      }
      case 'extract': {
        if (input.text === undefined) throw new DiseminerError('TEXT_REQUIRED', 'extract requires input.text');
        return { claims: engine.extractClaims(input.text, input.source), stats: engine.getStats() };
      }
      case 'simulate': {
        if (input.query === undefined) throw new DiseminerError('QUERY_REQUIRED', 'simulate requires input.query');
        return engine.runMonteCarlo(input.query, input.options || {});
      }
      case 'narrate': {
        if (input.query === undefined) throw new DiseminerError('QUERY_REQUIRED', 'narrate requires input.query');
        return engine.generateNarrative(input.query, input.userContext || context.userContext || {});
      }
      case 'stats': return engine.getStats();
      default: throw new DiseminerError('UNKNOWN_OPERATION', String(op));
    }
  }
}

export default DiseminerAutomaton;

