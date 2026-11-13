// Pure Synthia Automata — engine: the Learning Orchestrator ("if it doesn't know how, it learns")

/**
 * LearningOrchestrator — the request front door. Every request is intaken
 * FIRST (address-first law), then resolved in four deterministic modes:
 *
 *   known-call     the text parses as a tool-call sentence (grammar parser)
 *                  -> run engine.call directly.
 *   routed         capability match: keyword overlap between the request
 *                  tokens and each of the 16 canonical + previously grown
 *                  tools (id/alias/capability words weigh 2, description
 *                  words weigh 1); best score >= 0.2 -> run that automaton
 *                  with best-effort arg shaping.
 *   grown          no capability matches -> the tool factory GENERATES a new
 *                  tool, wrapped as a real Automaton on the mesh, with lineage
 *                  {parents:[], learnedFrom: intakeId, hypothesis:'H1-grown-tool',
 *                  evidence:'observed'}; it runs immediately on the request.
 *   learned-recall a second identical request resolves from the learning log
 *                  WITHOUT re-growing (same toolId, cached output snapshot).
 *
 * Every outcome appends to the learning log {seq, request, intakeId, mode,
 * toolId, score, cr, ledgerSnapshot} — timestamp-free, counter-derived.
 * cr = computational-reduction metrics C(X) = {operations, visitedStates,
 * materialized, peakStates, steps} mapped from the merged 7-tuple ledger:
 *   operations      <- operationsExecuted   (No)
 *   visitedStates   <- statesGenerated      (Ns)
 *   materialized    <- primitivesActivated  (Np)
 *   peakStates      <- activeAutomata       (Ac)
 *   steps           <- transitionCount      (Tc)
 */

import { parseChain } from '../grammar/parser.js';
import { TOOL_REGISTRY } from '../automata/registry.js';
import { Automaton } from '../automata/automaton.js';
import { StatePacket } from '../mesh/packet.js';
import { toolOntology, runTriples, tripleValueHash } from './triples.js';
import { MediaField, VideoTimeline, CodeWeaver, mediaHash, frameHash } from '../merged/media-field.js';
import { ArtifactWriter, encodeBMP, encodeGIF } from '../merged/artifacts.js';

const ROUTE_THRESHOLD = 0.2;

/** Composite-capability boost: a promoted channel outscores its single best member. */
const CHANNEL_BOOST = 1.25;

const wordsOf = (value) => String(value ?? '').toLowerCase().match(/[a-z0-9']+/g) || [];

/** Curated capability hints per tool (weight 2), from the request lexicon. */
const CAPABILITY_HINTS = Object.freeze({
  'media-field': ['video', 'image', 'frames', 'animation', 'animate', 'morph', 'media', 'render', 'picture', 'code', 'write', 'generate', 'module', 'program', 'weave'],
  'morph-mir': ['morph', 'media', 'artifact', 'code', 'function', 'file', 'regenerate', 'animate'],
  'computational-grammar-coder': ['code', 'coder', 'grammar', 'compile', 'syntax', 'parse', 'function', 'file'],
  'autoling': ['learn', 'grammar', 'rule', 'language', 'induce'],
  'autoling-lite': ['learn', 'grammar', 'rule', 'language', 'induce'],
  'research-browser': ['research', 'cite', 'source', 'browse', 'search', 'study'],
  'autonovel': ['story', 'novel', 'generate', 'narrative', 'chapter', 'write'],
  'messy': ['simulate', 'agents', 'simulation', 'crowd', 'society'],
  'diseminer': ['narrative', 'distribution', 'infer', 'claims', 'influence'],
  'diseminer-lite': ['narrative', 'distribution', 'infer', 'neighbors'],
  'conversation': ['talk', 'chat', 'converse', 'summarize', 'utter', 'say'],
  'klein-analogy': ['analogy', 'analogical', 'proportion', 'boolean'],
  'iching-grammar': ['hexagram', 'iching', 'cast', 'oracle', 'lines'],
  'language-contact': ['contact', 'borrow', 'language', 'generation'],
  'historical-monte-carlo': ['monte', 'carlo', 'sample', 'history', 'drift'],
  'success': ['purpose', 'success', 'goal', 'indicator', 'progress'],
  'browser-form': ['form', 'fill', 'browser', 'page', 'consent'],
});

/** A request token matches a keyword by equality or >=4-char prefix either way. */
function tokenMatches(token, keyword) {
  if (token === keyword) return true;
  if (token.length >= 4 && keyword.length >= 4) {
    return token.startsWith(keyword) || keyword.startsWith(token);
  }
  return false;
}

function safeClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

/** C(X): computational-reduction metrics mapped from the merged ledger. */
export function crFromLedger(ledger = {}) {
  return {
    operations: ledger.operationsExecuted || 0,
    visitedStates: ledger.statesGenerated || 0,
    materialized: ledger.primitivesActivated || 0,
    peakStates: ledger.activeAutomata || 0,
    steps: ledger.transitionCount || 0,
  };
}

export class LearningOrchestrator {
  constructor({ engine, intake, factory, router } = {}) {
    this.engine = engine;
    this.intake = intake;
    this.factory = factory;
    this.router = router;
    this.log = [];
    this.seq = 0;
    this.grown = []; // growth records (incl. lineage)
    this.grownById = new Map(); // toolId -> Automaton
    this.candidates = new Map(); // toolId -> Map(keyword -> weight)
    for (const entry of TOOL_REGISTRY) this.#indexCanonical(entry);
  }

  // ---------------- keyword index ----------------

  #indexCanonical(entry) {
    const keywords = new Map();
    const put = (word, weight) => {
      const w = String(word || '').toLowerCase();
      if (!w || w.length < 2) return;
      keywords.set(w, Math.max(keywords.get(w) || 0, weight));
    };
    for (const part of entry.id.split('-')) put(part, 2);
    for (const alias of entry.aliases || []) put(alias, 2);
    for (const cap of entry.capabilities || []) for (const part of cap.split('-')) put(part, 2);
    for (const hint of CAPABILITY_HINTS[entry.id] || []) put(hint, 2);
    for (const word of wordsOf(entry.description)) if (word.length > 3) put(word, 1);
    this.candidates.set(entry.id, keywords);
  }

  #indexGrown(toolId, { capabilities = [], hints = [], purpose = '' } = {}) {
    const keywords = new Map();
    const put = (word, weight) => {
      const w = String(word || '').toLowerCase();
      if (!w || w.length < 2) return;
      keywords.set(w, Math.max(keywords.get(w) || 0, weight));
    };
    for (const part of toolId.split('-')) put(part, 2);
    for (const cap of capabilities) for (const part of cap.split('-')) put(part, 2);
    for (const hint of hints) put(hint, 2);
    for (const word of wordsOf(purpose)) if (word.length > 3) put(word, 1);
    this.candidates.set(toolId, keywords);
  }

  /** Capability match: best {toolId, score} by weighted keyword overlap. */
  #match(text) {
    const tokens = new Set(wordsOf(text));
    let best = null;
    for (const [toolId, keywords] of [...this.candidates.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      let shared = 0;
      for (const [keyword, weight] of keywords) {
        for (const token of tokens) {
          if (tokenMatches(token, keyword)) { shared += weight; break; }
        }
      }
      const score = shared / Math.max(4, tokens.size);
      if (!best || score > best.score) best = { toolId, score };
    }
    return best;
  }

  /** Weighted keyword score of one tool against a token set. */
  #scoreFor(toolId, tokens) {
    const keywords = this.candidates.get(toolId);
    if (!keywords) return 0;
    let shared = 0;
    for (const [keyword, weight] of keywords) {
      for (const token of tokens) {
        if (tokenMatches(token, keyword)) { shared += weight; break; }
      }
    }
    return shared / Math.max(4, tokens.size);
  }

  /**
   * Emergent channels as composite capabilities: a promoted crossing counts
   * when BOTH member tools match the request; the channel score is the boosted
   * average of the member scores (the connection itself is the capability).
   */
  #matchEmergentChannel(text) {
    const engine = this.engine;
    if (!engine || typeof engine.emergentChannels !== 'function') return null;
    const tokens = new Set(wordsOf(text));
    let bestChannel = null;
    for (const crossing of engine.emergentChannels()) {
      const scoreA = this.#scoreFor(crossing.a, tokens);
      const scoreB = this.#scoreFor(crossing.b, tokens);
      if (scoreA <= 0 || scoreB <= 0) continue;
      const score = ((scoreA + scoreB) / 2) * CHANNEL_BOOST;
      if (!bestChannel || score > bestChannel.score) {
        bestChannel = { crossing, score, scoreA, scoreB };
      }
    }
    return bestChannel;
  }

  /**
   * Execute a promoted emergent channel as a composed two-call chain: A runs
   * on the request, its output crosses to B as a StatePacket (mesh.route
   * records the crossing again), B runs with the packet. Returns the
   * LearningResult, or null to fall through to routed/grown.
   */
  async #runEmergentChannel(channel, text, intakeId, context) {
    const { crossing } = channel;
    const automatonA = this.#automatonFor(crossing.a);
    const automatonB = this.#automatonFor(crossing.b);
    if (!automatonA || !automatonB) return null;
    try {
      const runA = automatonA.run({ args: [text], raw: text, flags: {}, address: null, packet: null }, context);
      const outputA = await Promise.resolve(runA.output);
      const packet = new StatePacket({
        id: `emergent-${crossing.a}~${crossing.b}-${crossing.uses + 1}`,
        from: crossing.a,
        to: crossing.b,
        kind: 'data',
        payload: outputA,
        derivationId: null,
      });
      if (this.engine && this.engine.mesh) this.engine.mesh.route(packet); // records the crossing
      const runB = automatonB.run({ args: [text], raw: text, flags: {}, address: null, packet }, context);
      const output = await Promise.resolve(runB.output);
      const ledger = {};
      for (const key of Object.keys(runA.ledger || {})) {
        ledger[key] = (runA.ledger[key] || 0) + ((runB.ledger || {})[key] || 0);
      }
      const cr = crFromLedger(ledger);
      const toolId = `${crossing.a} then ${crossing.b}`;
      const entry = this.#log({
        request: text, intakeId, mode: 'emergent-channel', toolId, score: channel.score,
        cr, ledgerSnapshot: { ...ledger }, output: safeClone(output),
      });
      this.#postRunFeedback(automatonA, { text, output: outputA, trace: runA.trace, intakeId, seq: entry.seq });
      this.#postRunFeedback(automatonB, { text, output, trace: runB.trace, intakeId, seq: entry.seq });
      return {
        mode: 'emergent-channel', toolId, score: channel.score, intakeId,
        output, cr, seq: entry.seq,
        channel: this.engine && typeof this.engine.channelCapability === 'function'
          ? this.engine.channelCapability(crossing.a, crossing.b) : null,
      };
    } catch {
      return null; // a member refused the shaped args: fall through to routed/grown
    }
  }

  /**
   * Post-run feedback for request-path runs (routed / grown / emergent):
   * assert run-provenance triples and absorb the experience record into the
   * participating automaton's owned state. `seq` is the learning-log seq —
   * counter-derived, never wall-clock.
   */
  #postRunFeedback(automaton, { text, output, trace, intakeId, seq }) {
    if (!automaton) return;
    if (this.engine && this.engine.tripleStore) {
      this.engine.tripleStore.addAll(runTriples({
        toolId: automaton.id,
        input: { args: [text], raw: text },
        output,
        derivationId: null,
        trace,
      }));
    }
    if (typeof automaton.absorbExperience === 'function') {
      automaton.absorbExperience({
        derivationId: null,
        intakeId,
        outputHash: tripleValueHash(output),
        seq,
      });
    }
  }

  #automatonFor(toolId) {
    return this.grownById.get(toolId) || (this.engine && this.engine.toolsById.get(toolId)) || null;
  }

  #log(entry) {
    const seq = ++this.seq;
    this.log.push({ seq, ...entry });
    return this.log[this.log.length - 1];
  }

  // ---------------- growth ----------------

  /**
   * The grow path: factory.generate -> wrap as a real Automaton ->
   * engine.mesh.register -> lineage record. Deterministic ids come from the
   * factory; `forcedId` gives a stable public name (boot tools).
   */
  grow({ purpose, input, dimension, gate, capabilities = [], hints = [], implementation = null, forcedId = null, learnedFrom = null }) {
    const generated = this.factory.generate({ purpose, input, dimension, gate });
    if (!generated || !generated.tool) {
      throw new Error(`ToolFactory could not generate (status: ${generated && generated.status})`);
    }
    const gen = generated.tool;
    const toolId = forcedId || gen.id;
    let automaton = this.grownById.get(toolId) || (this.engine && this.engine.mesh.get(toolId));
    if (!automaton) {
      automaton = new Automaton({
        id: toolId,
        address: { ...gen.address, planetaryDimension: gen.dimension },
        states: [{ id: 'sense', initial: true }, { id: 'respond', accepting: true }],
        alphabet: ['request'],
        q0: 'sense',
        finals: ['respond'],
        capabilities,
        dimension: gen.dimension,
        automatonForm: 'grown-tool',
        implementation: implementation || ((runInput) => gen.execute(
          runInput && typeof runInput === 'object' && 'raw' in runInput
            ? (runInput.raw ?? (runInput.args || []).join(' '))
            : runInput,
        )),
      });
      if (this.engine && this.engine.mesh) this.engine.mesh.register(automaton);
      this.grownById.set(toolId, automaton);
      const record = {
        toolId,
        generatedId: gen.id,
        name: gen.name,
        level: gen.level,
        levelName: gen.levelName,
        address: { ...gen.address },
        dimension: gen.dimension,
        capabilities: [...capabilities],
        lineage: {
          parents: [],
          learnedFrom: learnedFrom || null,
          hypothesis: 'H1-grown-tool',
          evidence: 'observed',
        },
      };
      this.grown.push(record);
      this.#indexGrown(toolId, { capabilities, hints, purpose });
      // Tools are made of semantic triples: a grown tool asserts its ontology
      // into the engine's triple store the moment it joins the mesh.
      if (this.engine && this.engine.tripleStore) {
        this.engine.tripleStore.addAll(toolOntology(automaton));
      }
    }
    return { automaton, generated: gen, record: this.grown.find((r) => r.toolId === toolId) };
  }

  /**
   * Boot growth: the 17th, grown-by-default tool 'media-field' — gate 25,
   * Space dimension, backed by a pure-JS MediaField + VideoTimeline +
   * CodeWeaver + ArtifactWriter. Three operations, dispatched by request
   * shape:
   *
   *   picture({gate})            one 64x64 render of the gate's field state
   *                              (state-pure: morphFrames(g, g, 1)) -> BMP
   *   video({from, to, steps=8, delayCs=8})
   *                              morphFrames(from, to, steps) -> animated GIF89a
   *   code({name, gates, purpose})  CodeWeaver module -> text/javascript artifact
   *
   * Every op returns {ok:true, ..., artifact:{id, kind, format, fileName,
   * mime, size, hash, bytes, ...}} where artifact.bytes is a PLAIN ARRAY of
   * byte values (not a Uint8Array) so the whole output is JSON-safe — it is
   * safeClone'd into the learning log. Synchronous.
   */
  growBootMediaField() {
    const addressed = this.intake.intake('media field: images, video frames, gate morphs, code weaving');
    const field = new MediaField({ width: 64, height: 64 });
    const timeline = new VideoTimeline({ width: 64, height: 64 });
    const weaver = new CodeWeaver();
    const writer = new ArtifactWriter();

    // JSON-safe artifact view: plain-array bytes (see docstring above).
    const jsonArtifact = ({ artifact }, format, extra = {}) => ({
      id: artifact.id,
      kind: artifact.kind,
      format,
      fileName: artifact.fileName,
      mime: artifact.mime,
      size: artifact.size,
      hash: artifact.hash,
      bytes: Array.from(artifact.bytes),
      ...(artifact.text != null ? { text: artifact.text } : {}),
      ...extra,
    });

    const opPicture = (gate) => {
      const g = gate ?? 24;
      // Render one frame of this gate's field state; morphFrames is pure with
      // respect to field state (capture/restore), so the boot field is never
      // disturbed and reruns are byte-identical.
      const frame = field.morphFrames(g, g, 1)[0];
      const record = writer.write('picture', {
        fileName: `gate-${g}-picture.bmp`,
        bytes: encodeBMP(field.width, field.height, frame),
        mime: 'image/bmp',
      });
      return {
        ok: true, kind: 'picture', gate: g,
        artifact: jsonArtifact(record, 'bmp', { width: field.width, height: field.height }),
      };
    };

    const opVideo = (from, to, steps, delayCs) => {
      const frames = field.morphFrames(from, to, steps);
      for (const frame of frames) timeline.addFrame(frame, 1);
      const exported = timeline.exportFrames().slice(-steps);
      const record = writer.write('video', {
        fileName: `morph-gate-${from}-to-${to}.gif`,
        bytes: encodeGIF(field.width, field.height,
          frames.map((rgba) => ({ rgba, delayCs })), { loop: true }),
        mime: 'image/gif',
      });
      return {
        ok: true, kind: 'video', from, to, steps, delayCs,
        frames: {
          count: frames.length,
          width: field.width,
          height: field.height,
          byteLength: frames.length ? frames[0].length : 0,
          delays: exported.map((f) => f.delay),
          hashes: frames.map(frameHash),
          changingLines: [...field.lastMorph.changingLines],
          changingLineCount: field.lastMorph.changingLineCount,
          changingMask: field.lastMorph.changingMask,
        },
        artifact: jsonArtifact(record, 'gif', { frames: frames.length }),
      };
    };

    const opCode = (name, gates, purpose) => {
      const record = weaver.weaveArtifact({ name, gates, purpose }, writer);
      const code = record.artifact.text;
      const analysis = /(function|=>|import|export)/.test(purpose) ? weaver.analyze(purpose) : null;
      return {
        ok: true, kind: 'code', name, gates,
        code, bytes: code.length, signature: mediaHash(code), analysis,
        artifact: jsonArtifact(record, 'js'),
      };
    };

    const implementation = (runInput) => {
      const text = String((runInput && (runInput.raw || (runInput.args || []).join(' '))) || '');
      const lower = text.toLowerCase();
      const tokens = wordsOf(text);
      const gates = [];
      for (let k = 0; k < tokens.length - 1; k++) {
        if (tokens[k] === 'gate' && /^\d+$/.test(tokens[k + 1])) {
          const g = Number(tokens[k + 1]);
          if (g >= 1 && g <= 64) gates.push(g);
        }
      }
      if (/\b(code|write|function|module|program|implement)\b/.test(lower)) {
        // code op — CodeWeaver emits a template module STRING (never executed)
        const stop = new Set(['code', 'write', 'make', 'function', 'module', 'program', 'implement', 'with', 'that', 'gate', 'please']);
        const name = tokens.filter((w) => w.length > 3 && !stop.has(w)).slice(0, 3).join('-') || 'woven-module';
        return opCode(name, gates, text);
      }
      const wantsPicture = /\b(picture|image|bmp|photo|still)\b/.test(lower);
      const wantsVideo = /\b(video|morph|animate|animation|frames|gif|movie)\b/.test(lower);
      if (wantsPicture && !wantsVideo) return opPicture(gates[0] ?? 24);
      // video op — MediaField morph between two gates, encoded as a real GIF
      const from = gates[0] ?? 24;
      const to = gates[1] ?? ((from % 64) + 1);
      const stepsMatch = lower.match(/(\d+)\s*frames?/);
      const steps = stepsMatch ? Math.min(32, Math.max(1, Number(stepsMatch[1]))) : 8;
      const delayMatch = lower.match(/(\d+)\s*(?:cs|centiseconds?)/);
      const delayCs = delayMatch ? Math.min(600, Math.max(1, Number(delayMatch[1]))) : 8;
      return opVideo(from, to, steps, delayCs);
    };
    return this.grow({
      purpose: 'media field: images, video frames, gate morphs, code weaving',
      input: 'media-field',
      dimension: 'Space',
      gate: 25,
      forcedId: 'media-field',
      capabilities: ['image', 'picture', 'video', 'morph', 'animation', 'frames', 'code', 'artifact'],
      hints: CAPABILITY_HINTS['media-field'],
      implementation,
      learnedFrom: addressed.id,
    });
  }

  // ---------------- the request front door ----------------

  /** request(text) -> LearningResult ({mode, toolId, score, intakeId, output, cr, seq}). */
  async request(text, context = {}) {
    const addressed = this.intake.intake(text, context); // address-first, always
    const intakeId = addressed.id;

    // 1. known tool-call sentence -> run through the engine directly
    let parsed = null;
    try { parsed = parseChain(text); } catch { parsed = null; }
    if (parsed) {
      const derivation = this.engine.call(text, context);
      const cr = crFromLedger(derivation.ledger);
      const toolId = derivation.primitives.join(' then ');
      const entry = this.#log({
        request: text, intakeId, mode: 'known-call', toolId, score: 1,
        cr, ledgerSnapshot: { ...derivation.ledger }, output: safeClone(derivation.output),
      });
      return {
        mode: 'known-call', toolId, score: 1, intakeId,
        output: derivation.output, derivationId: derivation.id, cr, seq: entry.seq,
      };
    }

    // 2. exact recall: a second identical request never re-grows
    const prior = this.log.find((e) => e.request === text);
    if (prior) {
      const entry = this.#log({
        request: text, intakeId, mode: 'learned-recall', toolId: prior.toolId,
        score: prior.score, cr: { ...prior.cr }, ledgerSnapshot: safeClone(prior.ledgerSnapshot),
        output: safeClone(prior.output),
      });
      return {
        mode: 'learned-recall', toolId: prior.toolId, score: prior.score, intakeId,
        output: safeClone(prior.output), cr: { ...prior.cr }, seq: entry.seq, recalledFrom: prior.seq,
      };
    }

    // 3. capability routing
    const route = this.router.route(text);
    const best = this.#match(text);

    // 3b. emergent-channel routing: a promoted crossing whose member tools both
    // match counts as a composite capability; it executes as a two-call chain.
    const emergent = this.#matchEmergentChannel(text);
    if (emergent && emergent.score >= ROUTE_THRESHOLD && (!best || emergent.score > best.score)) {
      const result = await this.#runEmergentChannel(emergent, text, intakeId, context);
      if (result) return result;
    }

    if (best && best.score >= ROUTE_THRESHOLD) {
      const automaton = this.#automatonFor(best.toolId);
      if (automaton) {
        try {
          const run = automaton.run({ args: [text], raw: text, flags: {}, address: null, packet: null }, context);
          const output = await Promise.resolve(run.output);
          const cr = crFromLedger(run.ledger);
          const entry = this.#log({
            request: text, intakeId, mode: 'routed', toolId: best.toolId, score: best.score,
            cr, ledgerSnapshot: { ...run.ledger }, output: safeClone(output),
          });
          this.#postRunFeedback(automaton, { text, output, trace: run.trace, intakeId, seq: entry.seq });
          return { mode: 'routed', toolId: best.toolId, score: best.score, intakeId, output, cr, seq: entry.seq };
        } catch {
          // routed tool refused the shaped args: fall through and GROW instead
        }
      }
    }

    // 4. GROW: the system doesn't know how -> it learns a new tool
    const dimension = (route.status === 'resolved' && route.dimension) || addressed.regime.dimension || 'Design';
    const { automaton } = this.grow({
      purpose: text, input: text, dimension, gate: addressed.address.gate, learnedFrom: intakeId,
    });
    const run = automaton.run({ args: [text], raw: text, flags: {}, address: null, packet: null }, context);
    const output = await Promise.resolve(run.output);
    const cr = crFromLedger(run.ledger);
    const entry = this.#log({
      request: text, intakeId, mode: 'grown', toolId: automaton.id, score: best ? best.score : 0,
      cr, ledgerSnapshot: { ...run.ledger }, output: safeClone(output),
    });
    this.#postRunFeedback(automaton, { text, output, trace: run.trace, intakeId, seq: entry.seq });
    return { mode: 'grown', toolId: automaton.id, score: entry.score, intakeId, output, cr, seq: entry.seq };
  }

  // ---------------- reports ----------------

  exportLog() {
    return this.log.map((entry) => ({
      seq: entry.seq,
      request: entry.request,
      intakeId: entry.intakeId,
      mode: entry.mode,
      toolId: entry.toolId,
      score: entry.score,
      cr: { ...entry.cr },
      ledgerSnapshot: safeClone(entry.ledgerSnapshot),
    }));
  }

  /** Computational-reduction summary across the whole learning log. */
  crReport() {
    const byMode = {};
    const totals = { operations: 0, visitedStates: 0, materialized: 0, peakStates: 0, steps: 0 };
    for (const entry of this.log) {
      byMode[entry.mode] = (byMode[entry.mode] || 0) + 1;
      for (const key of Object.keys(totals)) {
        if (key === 'peakStates') totals.peakStates = Math.max(totals.peakStates, entry.cr.peakStates || 0);
        else totals[key] += entry.cr[key] || 0;
      }
    }
    return {
      requests: this.log.length,
      byMode,
      totals,
      toolsGrown: this.grown.length,
      grownToolIds: this.grown.map((r) => r.toolId),
    };
  }

  grownTools() {
    return this.grown.map((record) => ({
      id: record.toolId,
      generatedId: record.generatedId,
      gate: record.address.gate,
      dimension: record.dimension,
      capabilities: [...record.capabilities],
      level: record.level,
      lineage: { ...record.lineage },
    }));
  }
}

export default LearningOrchestrator;

