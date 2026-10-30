// Pure Synthia Automata — tool-14: autoling canonical (enhanced rule-induction pipeline:
// listen→abstract→coin-rule→test→distribute→induce→grammar)
// Fidelity port of src/UPGRADES/compiled/runtime/autoling.js (AutolingEngine, Klein 1968 UWCS TR #43),
// made synchronous + deterministic (no clocks/console) with the induceRule facade.
import { Automaton } from '../automaton.js';

export class AutolingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AutolingError';
    this.code = code;
    this.details = details;
  }
}

// Klein's Boolean feature vectors (distributional morphology).
const extractFeatures = (segment) => ({
  '1st_person': /^(I|me|my|we|us|our)$/i.test(segment),
  '2nd_person': /^(you|your|yours)$/i.test(segment),
  '3rd_person': /^(he|she|it|they|him|her|them|his|its|their)$/i.test(segment),
  singular: /^(I|you|he|she|it|me|him|her)$/i.test(segment),
  plural: /^(we|they|us|them)$/i.test(segment),
  present: /^(eat|run|walk|talk|is|are|am)$/i.test(segment),
  past: /^(ate|ran|walked|talked|was|were)$/i.test(segment),
  animate: /^(I|you|he|she|we|they|man|woman|dog|cat)$/i.test(segment),
  human: /^(I|you|he|she|we|they|man|woman|person)$/i.test(segment),
  noun: /^(man|woman|dog|cat|fish|book|table|car|house|tree)$/i.test(segment),
  verb: /^(eat|run|walk|talk|read|write|sleep|think|love|hate|is|are|am|was|were)$/i.test(segment),
  determiner: /^(the|a|an|this|that|these|those)$/i.test(segment),
  adjective: /^(big|small|red|blue|happy|sad|good|bad|old|new)$/i.test(segment),
  adverb: /^(quickly|slowly|happily|sadly|very|quite|rather)$/i.test(segment),
  preposition: /^(in|on|at|by|with|from|to|for|of|about)$/i.test(segment),
});

export class AutolingEngine {
  constructor() {
    this.grammar = [];
    this.transformations = [];
    this.frame = 0;
    this.illegalSet = [];
    this.heuristicCounters = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0 };
  }

  // ---------- ① Morphology (Klein §2.0) ----------
  analyzeMorphology(input) {
    const segments = String(input).split(/\s+/).filter(Boolean);
    const morphemes = [];
    for (const segment of segments) {
      const features = extractFeatures(segment);
      const isPrimary = ['1st_person', '2nd_person', '3rd_person'].some((f) => features[f]);
      morphemes.push({
        segment,
        gloss: this.generateGloss(features),
        features,
        isAllomorph: this.detectAllomorph(features, morphemes),
        primaryGloss: isPrimary,
        secondaryGloss: !isPrimary,
      });
    }
    const totalFeatures = morphemes.reduce((sum, m) => sum + Object.values(m.features).filter(Boolean).length, 0);
    return {
      morphemes,
      segmentationAlgorithm: `distributional-cut(${segments.length}-segments)`,
      confidence: morphemes.length ? Math.min(totalFeatures / (morphemes.length * 5), 1.0) : 0,
    };
  }

  generateGloss(features) {
    return Object.entries(features).filter(([, v]) => v).map(([k]) => k).join(', ');
  }

  detectAllomorph(features, existing) {
    return existing.some((m) => {
      const overlap = Object.keys(features).filter((k) => features[k] && m.features[k]);
      return overlap.length > 2; // significant feature overlap
    });
  }

  // ---------- ② Phrase-structure heuristic learning (Klein §3.0) ----------
  learnPhraseStructure(sentence) {
    this.frame++;
    const tokens = String(sentence).split(/\s+/).filter(Boolean);
    const parse = this.attemptParse(tokens);
    if (parse.complete) return { grammar: this.grammar, newRules: [], tests: [] };
    const newRules = this.applyHeuristics(tokens);
    const tests = newRules.map((rule) => this.testRule(rule));
    return { grammar: this.grammar, newRules, tests };
  }

  attemptParse(tokens) {
    for (const rule of this.grammar) {
      if (rule.isSentenceRule && rule.rhs.join(' ') === tokens.join(' ')) {
        return { complete: true };
      }
    }
    return { complete: false };
  }

  applyHeuristics(tokens) {
    // H1: closure of parse — coin an S_n sentence rule covering the token string.
    if (this.grammar.length === 0) {
      this.heuristicCounters.h1++;
      const rule = {
        lhs: `S_${this.heuristicCounters.h1}`,
        rhs: [...tokens],
        isSentenceRule: true,
        isContextSensitive: false,
        testHistory: [],
        confidence: 0.5,
      };
      this.grammar.push(rule);
      return [rule];
    }
    // H2: two morphemes in identical environments → same Class_n.
    const rules = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const env1 = tokens.slice(0, i).concat(tokens.slice(i + 1));
        const env2 = tokens.slice(0, j).concat(tokens.slice(j + 1));
        if (JSON.stringify(env1) === JSON.stringify(env2)) {
          this.heuristicCounters.h2++;
          const rule = {
            lhs: `Class_${this.heuristicCounters.h2}`,
            rhs: [tokens[i], tokens[j]],
            isSentenceRule: false,
            isContextSensitive: false,
            testHistory: [],
            confidence: 0.6,
          };
          this.grammar.push(rule);
          rules.push(rule);
        }
      }
    }
    return rules;
  }

  testRule(rule) {
    // Klein's substitution test: every coined rule generates a 'CAN YOU SAY: ...' sentence.
    const sentenceRules = this.grammar.filter((r) => r.isSentenceRule);
    const testSentence = (sentenceRules.length ? sentenceRules[0] : rule).rhs.join(' ');
    const accepted = this.validateTestSentence(testSentence);
    rule.testHistory.push({ accepted, frame: this.frame });
    if (!accepted) this.illegalSet.push(testSentence);
    rule.confidence = rule.testHistory.filter((h) => h.accepted).length / rule.testHistory.length;
    return { prompt: `CAN YOU SAY: ${testSentence}`, rule: rule.lhs, accepted };
  }

  validateTestSentence(sentence) {
    const tokens = String(sentence).split(/\s+/).filter(Boolean);
    const features = tokens.map((t) => extractFeatures(t));
    for (let i = 0; i < features.length - 1; i++) {
      if (features[i].singular && features[i + 1].plural && features[i + 1].verb) return false;
    }
    return true;
  }

  // ---------- ③ Semantic parse (modern extension) ----------
  parseSemantic(input, morphology) {
    const tokens = String(input).split(/\s+/).filter(Boolean);
    const nodes = new Map();
    const edges = [];
    for (let i = 0; i < tokens.length; i++) {
      const node = {
        id: `t_${i}`,
        surface: tokens[i],
        lemma: tokens[i].toLowerCase(),
        pos: this.inferPOS(tokens[i]),
        features: extractFeatures(tokens[i]),
        gloss: morphology.morphemes[i] ? morphology.morphemes[i].gloss : '',
        confidence: morphology.morphemes[i] ? 0.8 : 0.5,
        depth: 0,
        children: [],
        parent: null,
      };
      nodes.set(node.id, node);
      if (i > 0) edges.push({ from: `t_${i - 1}`, to: `t_${i}`, label: 'next' });
    }
    this.buildHierarchy(nodes);
    return { root: 'SENT', nodes, edges, frame: this.frame };
  }

  inferPOS(token) {
    const features = extractFeatures(token);
    if (features.noun) return 'NOUN';
    if (features.verb) return 'VERB';
    if (features.determiner) return 'DET';
    if (features.adjective) return 'ADJ';
    if (features.adverb) return 'ADV';
    if (features.preposition) return 'PREP';
    return 'UNKNOWN';
  }

  buildHierarchy(nodes) {
    const tokens = [...nodes.values()].filter((n) => n.id.startsWith('t_'));
    let i = 0;
    while (i < tokens.length) {
      if (tokens[i].pos === 'DET') {
        const npStart = i;
        i++;
        while (i < tokens.length && (tokens[i].pos === 'ADJ' || tokens[i].pos === 'NOUN')) i++;
        if (i > npStart + 1) {
          const npId = `NP_${npStart}`;
          nodes.set(npId, {
            id: npId,
            surface: tokens.slice(npStart, i).map((t) => t.surface).join(' '),
            lemma: 'NP',
            pos: 'NP',
            features: {},
            gloss: 'noun phrase',
            confidence: 0.7,
            depth: 1,
            children: tokens.slice(npStart, i).map((t) => t.id),
            parent: null,
          });
          for (let j = npStart; j < i; j++) {
            tokens[j].parent = npId;
            tokens[j].depth = 2;
          }
        }
      } else {
        i++;
      }
    }
  }

  // ---------- ④ Bidirectional feature propagation ----------
  propagateFeatures(tree) {
    const nodes = [...tree.nodes.values()];
    for (const node of nodes) { // bottom-up: children → parent
      for (const childId of node.children || []) {
        const child = tree.nodes.get(childId);
        if (!child) continue;
        for (const [key, value] of Object.entries(child.features)) {
          if (value && !node.features[key]) node.features[key] = true;
        }
      }
    }
    for (const node of nodes) { // top-down: parent → children
      if (!node.parent) continue;
      const parent = tree.nodes.get(node.parent);
      if (!parent) continue;
      for (const [key, value] of Object.entries(parent.features)) {
        if (value && !node.features[key]) node.features[key] = true;
      }
    }
  }

  overallConfidence(tree) {
    const nodes = [...tree.nodes.values()];
    if (!nodes.length) return 0;
    return nodes.reduce((sum, n) => sum + n.confidence, 0) / nodes.length;
  }

  // ---------- Full pipeline ----------
  runPipeline(input) {
    const morphology = this.analyzeMorphology(input);
    const phraseStructure = this.learnPhraseStructure(input);
    const parseTree = this.parseSemantic(input, morphology);
    this.propagateFeatures(parseTree);
    const confidence = this.overallConfidence(parseTree);
    return {
      morphology,
      phraseStructure: {
        frame: this.frame,
        newRules: phraseStructure.newRules,
        tests: phraseStructure.tests, // 'CAN YOU SAY: ...' prompts; rejected → illegalSet
      },
      parseTree: {
        root: parseTree.root,
        nodes: [...parseTree.nodes.values()],
        edges: parseTree.edges,
        frame: parseTree.frame,
      },
      frame: this.frame,
      confidence,
    };
  }

  // ---------- Transformation learning (Klein §4.0, deterministic subset) ----------
  learnTransformation(sourceTokens, targetString) {
    const targetTokens = new Set(String(targetString).split(/\s+/).filter(Boolean));
    const common = sourceTokens.filter((t) => targetTokens.has(t));
    const rule = {
      id: `T_${this.transformations.length + 1}`,
      sourcePattern: sourceTokens.join(' '),
      targetPattern: targetString,
      isMonolingual: true,
      generality: common.length,
      testHistory: [{ sentence: targetString, accepted: true, frame: this.frame }],
      status: 'provisional',
    };
    rule.status = rule.testHistory.every((h) => h.accepted) ? 'confirmed' : 'provisional';
    this.transformations.push(rule);
    return rule;
  }

  // ---------- induceRule facade ----------
  // examples: [{ input: { relations: [], constraints: [] }, output }]
  // anchor = most frequent constraint; digits → N templates; confidence = support/examples;
  // status: validated ≥ 0.8, provisional ≥ 0.5, else candidate.
  induceRule(examples = []) {
    if (!Array.isArray(examples) || examples.length === 0) {
      throw new AutolingError('EXAMPLES_REQUIRED', 'induceRule needs at least one example');
    }
    const constraintCounts = new Map();
    for (const example of examples) {
      for (const constraint of (example.input && example.input.constraints) || []) {
        constraintCounts.set(constraint, (constraintCounts.get(constraint) || 0) + 1);
      }
    }
    let anchor = null;
    let anchorCount = 0;
    for (const [constraint, count] of constraintCounts) {
      if (count > anchorCount) { anchor = constraint; anchorCount = count; }
    }
    const templateFor = (output) => String(output).replace(/\d+/g, 'N');
    const templated = examples.map((e) => ({
      template: templateFor(e.output),
      anchored: anchor ? ((e.input && e.input.constraints) || []).includes(anchor) : true,
    }));
    const templateCounts = new Map();
    for (const { template } of templated) templateCounts.set(template, (templateCounts.get(template) || 0) + 1);
    let bestTemplate = templated[0] ? templated[0].template : '';
    let bestCount = 0;
    for (const [template, count] of templateCounts) {
      if (count > bestCount) { bestTemplate = template; bestCount = count; }
    }
    const support = templated.filter((t) => t.anchored && t.template === bestTemplate).length;
    const confidence = support / examples.length;
    const status = confidence >= 0.8 ? 'validated' : confidence >= 0.5 ? 'provisional' : 'candidate';
    const rule = {
      id: `R_${this.transformations.length + 1}`,
      anchor,
      template: bestTemplate,
      support,
      examples: examples.length,
      confidence,
      status,
    };
    this.transformations.push({ ...rule, isMonolingual: true, testHistory: [], generality: support });
    return rule;
  }

  getStats() {
    return {
      frames: this.frame,
      grammarRules: this.grammar.length,
      transformations: this.transformations.length,
      illegals: this.illegalSet.length,
      heuristics: { ...this.heuristicCounters },
    };
  }
}

const STATES = [
  { id: 'listen', name: 'Listen', initial: true },
  { id: 'abstract', name: 'Abstract' },
  { id: 'coin-rule', name: 'Coin rule' },
  { id: 'test', name: 'Test' },
  { id: 'distribute', name: 'Distribute' },
  { id: 'induce', name: 'Induce' },
  { id: 'grammar', name: 'Grammar', accepting: true },
];

// Named transitions per STATE_SPACE_SPEC §7.
const DELTA_TABLE = {
  'listen|pipeline': { to: 'abstract', transition: 'ignition' },
  'abstract|pipeline': { to: 'coin-rule', transition: 'flow' },
  'coin-rule|pipeline': { to: 'test', transition: 'fusion' },
  'test|pipeline': { to: 'distribute', transition: 'core' },
  'distribute|pipeline': { to: 'induce', transition: 'weave' },
  'induce|pipeline': { to: 'grammar', transition: 'becoming' },
  'grammar|pipeline': { to: 'grammar', transition: 'automatize' },
  'listen|induce': { to: 'induce', transition: 'ignition' },
  'induce|induce': { to: 'grammar', transition: 'becoming' },
  'grammar|induce': { to: 'grammar', transition: 'automatize' },
  'listen|transform': { to: 'coin-rule', transition: 'ignition' },
  'coin-rule|transform': { to: 'grammar', transition: 'chain' },
  'listen|stats': { to: 'listen', transition: 'core' },
};

const OP_PATHS = {
  pipeline: [['listen', 'pipeline'], ['abstract', 'pipeline'], ['coin-rule', 'pipeline'], ['test', 'pipeline'], ['distribute', 'pipeline'], ['induce', 'pipeline'], ['grammar', 'pipeline']],
  induce: [['listen', 'induce'], ['induce', 'induce'], ['grammar', 'induce']],
  transform: [['listen', 'transform'], ['coin-rule', 'transform']],
  stats: [['listen', 'stats']],
};

const normalizeInput = (input) => {
  if (typeof input === 'string') return { operation: 'pipeline', text: input };
  if (input && Array.isArray(input.args) && input.args.length && !input.operation) {
    return { ...input, operation: 'pipeline', text: input.args.join(' ') };
  }
  if (input && input.text !== undefined && !input.operation) return { ...input, operation: 'pipeline' };
  return input || {};
};

export class AutolingAutomaton extends Automaton {
  static descriptor = {
    id: 'autoling',
    aliases: ['auto-ling', 'autoling-canonical', 'klein-autoling'],
    gate: 17,
    channels: ['17-62'],
    capabilities: ['pipeline', 'morphology', 'phrase-structure', 'semantic-parse', 'induce', 'transform', 'stats'],
    ports: {
      in: [{ id: 'corpus', type: 'text', schemaVersion: '1' }],
      out: [{ id: 'grammar', type: 'grammar', schemaVersion: '1' }],
    },
    automatonForm: 'enhanced rule-induction pipeline',
    dimension: 'Design',
    description: 'Sheldon Klein AUTOLING (1968), canonical enhanced: distributional morphology with Boolean feature vectors and allomorph detection, phrase-structure heuristics H1/H2 with CAN-YOU-SAY rule testing and an illegal set, semantic token graph with bidirectional feature propagation, plus an induceRule facade over input/output examples.',
  };

  constructor(options = {}) {
    const memory = options.state || new AutolingEngine();
    let dispatch;
    super({
      id: 'autoling',
      address: { mode: 'macro', gate: 17, line: 1, color: 1, tone: 1, base: 1, planetaryDimension: 'Design' },
      states: STATES,
      alphabet: ['pipeline', 'induce', 'transform', 'stats'],
      delta: (state, symbol) => DELTA_TABLE[`${state}|${symbol}`] || { to: state, transition: 'flow' },
      q0: 'listen',
      // Public operations accept at their own resting states; domain validation still applies.
      finals: ['listen', 'grammar'],
      ports: AutolingAutomaton.descriptor.ports,
      capabilities: AutolingAutomaton.descriptor.capabilities,
      dimension: 'Design',
      implementation: (input, context) => dispatch(input, context),
    });
    this.ownedState = memory;
    dispatch = (input, context) => this.#dispatch(input, context);
  }

  #dispatch(rawInput, context = {}) {
    const input = normalizeInput(rawInput);
    const op = input.operation || 'pipeline';
    const path = OP_PATHS[op];
    if (!path) throw new AutolingError('UNKNOWN_OPERATION', String(op));
    for (const [from, symbol] of path) this.step(from, symbol, { tool: this.id });
    const engine = this.ownedState;
    switch (op) {
      case 'pipeline': {
        if (input.text === undefined) throw new AutolingError('TEXT_REQUIRED', 'Pipeline requires input.text');
        const pipeline = engine.runPipeline(input.text);
        return { pipeline, rules: [...engine.grammar], stats: engine.getStats() };
      }
      case 'induce': {
        const rule = engine.induceRule(input.examples || []);
        return { rule, rules: [...engine.grammar], stats: engine.getStats() };
      }
      case 'transform': {
        const source = Array.isArray(input.sourceTokens) ? input.sourceTokens : String(input.text || '').split(/\s+/).filter(Boolean);
        const rule = engine.learnTransformation(source, input.target || '');
        return { rule, stats: engine.getStats() };
      }
      case 'stats': return { stats: engine.getStats(), rules: [...engine.grammar] };
      default: throw new AutolingError('UNKNOWN_OPERATION', String(op));
    }
  }
}

export default AutolingAutomaton;


