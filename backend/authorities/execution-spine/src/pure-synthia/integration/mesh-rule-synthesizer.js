// Pure-JS mesh-derived capability synthesis.
// No capability lookup table: candidates are discovered from mesh nodes and
// learned capability records supplied by the active runtime.

import { gateBits, hamming } from '../state-space/addressing.js';

const words = (v) => String(v ?? '').toLowerCase().match(/[a-z0-9_.$-]+/g) || [];
const uniq = (xs) => [...new Set(xs)];
const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

function semanticTokens(value) {
  if (value == null) return [];
  if (typeof value === 'string') return words(value);
  if (Array.isArray(value)) return uniq(value.flatMap(semanticTokens));
  if (typeof value === 'function') return words(value.toString());
  if (typeof value === 'object') {
    return uniq(Object.entries(value).flatMap(([k,v]) => [k, ...semanticTokens(v)]));
  }
  return words(value);
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 1;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return hit / Math.max(1, new Set([...A, ...B]).size);
}

function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class CapabilityMesh {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
  }

  register(node = {}) {
    if (!node.id) throw new TypeError('CapabilityMesh.register requires node.id');
    const frozen = Object.freeze({
      id: String(node.id),
      gate: Number.isInteger(node.gate) && node.gate >= 1 && node.gate <= 64 ? node.gate : null,
      kind: node.kind || 'capability',
      labels: Object.freeze(uniq(semanticTokens(node.labels || node.description || node.id))),
      description: node.description || '',
      astPayload: node.astPayload ?? null,
      execute: typeof node.execute === 'function' ? node.execute : null,
      provenance: Object.freeze({ ...(node.provenance || {}) }),
      metadata: Object.freeze({ ...(node.metadata || {}) }),
    });
    this.nodes.set(frozen.id, frozen);
    return frozen;
  }

  connect(from, to, relation = 'related', weight = 1, metadata = {}) {
    const id = `${from}->${to}:${relation}`;
    const edge = Object.freeze({ id, from, to, relation, weight:Number(weight)||0, metadata:Object.freeze({...metadata}) });
    this.edges.set(id, edge);
    return edge;
  }

  allNodes() { return [...this.nodes.values()]; }
  getNode(id) { return this.nodes.get(id) || null; }
  neighbors(id) {
    return [...this.edges.values()].filter(e => e.from === id || e.to === id);
  }
}

function normalizeAstPayload(payload) {
  if (payload == null) return null;
  if (typeof payload === 'function') return { type:'function-source', source:payload.toString() };
  if (typeof payload === 'string') return { type:'source', source:payload };
  if (Array.isArray(payload)) return { type:'sequence', children:payload.map(normalizeAstPayload).filter(Boolean) };
  if (typeof payload === 'object') return structuredClone(payload);
  return null;
}

function candidateScore({ targetGate, queryTokens, node, relationBoost = 0 }) {
  const sem = jaccard(queryTokens, node.labels);
  let topological = 0;
  let distance = null;
  if (targetGate && node.gate) {
    distance = hamming(gateBits(targetGate), gateBits(node.gate));
    topological = 1 - distance / 6;
  }
  // Semantic evidence dominates when a node has no canonical gate yet.
  const score = sem * 0.62 + topological * 0.28 + clamp01(relationBoost) * 0.10;
  return { score, semantic:sem, topological, distance };
}

function sourceForNode(node) {
  const p = normalizeAstPayload(node.astPayload);
  if (p?.source) return p.source;
  if (node.execute) return node.execute.toString();
  return '';
}

function validateSourceShape(source) {
  if (typeof source !== 'string' || !source.trim()) return { ok:false, reason:'EMPTY_SOURCE' };
  let depth = 0;
  for (const c of source) {
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (depth < 0) return { ok:false, reason:'UNBALANCED_BRACES' };
  }
  return { ok:depth === 0, reason:depth === 0 ? null : 'UNBALANCED_BRACES' };
}

export class MeshRuleSynthesizer {
  constructor({ mesh = new CapabilityMesh(), seed = 18091999, maxNeighbors = 12, maxCandidates = 48 } = {}) {
    this.mesh = mesh;
    this.seed = seed;
    this.maxNeighbors = maxNeighbors;
    this.maxCandidates = maxCandidates;
    this.installed = new Map();
  }

  ingestRuntimeInventory({ operators = [], transitions = [], automata = [], learned = [] } = {}) {
    // Inventory is registered as mesh nodes. Search later walks these nodes;
    // there is no separate rule/capability lookup table.
    for (const op of operators) this.mesh.register({
      id:`operator:${op.id || op.name}`,
      gate:op.gate,
      kind:'operator',
      labels:[op.id, op.name, op.rule, op.accepts, op.invariants],
      description:op.rule || op.name,
      astPayload:op.transform || op.execute || null,
      execute:op.transform || op.execute || null,
      provenance:{ source:'runtime-inventory', family:'operator' },
    });
    for (const t of transitions) this.mesh.register({
      id:`transition:${t.id || t.name}`,
      gate:t.gate,
      kind:'transition',
      labels:[t.id,t.name,t.effect,t.symbol,t.operatorId],
      description:t.effect || t.name,
      astPayload:t.astPayload || null,
      execute:t.execute || null,
      provenance:{ source:'runtime-inventory', family:'transition' },
      metadata:{ operatorId:t.operatorId || null },
    });
    for (const a of automata) this.mesh.register({
      id:`automaton:${a.id || a.name}`,
      gate:a.gate || a.address?.gate,
      kind:'automaton',
      labels:[a.id,a.name,a.description,a.purpose,a.capabilities,a.addressKey],
      description:a.description || a.purpose || a.name || '',
      astPayload:a.astPayload || a.execute || null,
      execute:a.execute || null,
      provenance:{ source:'runtime-inventory', family:'automaton' },
    });
    for (const r of learned) this.registerLearned(r);
    return this.mesh.allNodes().length;
  }

  registerLearned(rule = {}) {
    const id = rule.id || rule.name || `learned:${this.installed.size + 1}`;
    const node = this.mesh.register({
      id:`learned:${id}`,
      gate:rule.gate || rule.gateAddress || rule.address?.gate,
      kind:'learned-rule',
      labels:[rule.name,rule.capability,rule.description,rule.requirements,rule.behavioralContract],
      description:rule.description || rule.capability || rule.name || '',
      astPayload:rule.astPayload || rule.rawBody || rule.javascript || rule.execute || null,
      execute:rule.execute || null,
      provenance:{ source:'autoling', ...(rule.provenance || {}) },
    });
    this.installed.set(id, node);
    return node;
  }

  query(gapContext = {}) {
    const targetGate = Number.isInteger(gapContext.targetGate)
      ? gapContext.targetGate
      : Number.isInteger(gapContext.canonicalAddress?.gate) ? gapContext.canonicalAddress.gate : null;
    const queryTokens = uniq(semanticTokens({
      requiredCapability:gapContext.requiredCapability,
      requirements:gapContext.requirements,
      evidence:gapContext.evidence,
      probe:gapContext.probe,
      behavioralContract:gapContext.behavioralContract,
      analysis:gapContext.analysis,
    }));

    const scored = this.mesh.allNodes().map(node => {
      const edgeWeight = this.mesh.neighbors(node.id).reduce((s,e)=>s+Math.max(0,e.weight||0),0);
      return { node, ...candidateScore({targetGate,queryTokens,node,relationBoost:Math.min(1,edgeWeight/4)}) };
    }).filter(x => sourceForNode(x.node)).sort((a,b)=>b.score-a.score || (a.distance ?? 99)-(b.distance ?? 99));

    // Prefer actual Hamming-1 anchors when present, then expand by semantic score.
    const h1 = scored.filter(x => x.distance === 1);
    const pool = uniq([...h1, ...scored].map(x => x.node.id))
      .map(id => scored.find(x => x.node.id === id))
      .filter(Boolean)
      .slice(0, this.maxNeighbors);
    return { targetGate, queryTokens, neighbors:pool };
  }

  deriveCandidates(gapContext = {}) {
    const q = this.query(gapContext);
    if (!q.neighbors.length) return { ...q, candidates:[] };
    const rng = seeded(this.seed + q.queryTokens.join('|').length + (q.targetGate || 0));
    const candidates = [];

    // Single-anchor candidates preserve the donor operation exactly.
    for (const entry of q.neighbors) {
      candidates.push({
        id:`single:${entry.node.id}`,
        donors:[entry.node.id],
        score:entry.score,
        mode:'single-anchor',
        javascript:sourceForNode(entry.node),
      });
    }

    // Stochastic syntactic splice candidates combine donor operations into an
    // ordered runtime composition. We compose callable functions, not raw text
    // pasted into arbitrary positions.
    while (candidates.length < this.maxCandidates && q.neighbors.length > 1) {
      const count = 2 + Math.floor(rng() * Math.min(3, q.neighbors.length - 1));
      const donors = [];
      for (let i=0;i<count;i++) {
        const pick = q.neighbors[Math.floor(rng()*q.neighbors.length)];
        if (pick && !donors.includes(pick.node.id)) donors.push(pick.node.id);
      }
      if (donors.length < 2) continue;
      const score = donors.reduce((s,id)=>s+(q.neighbors.find(x=>x.node.id===id)?.score||0),0)/donors.length;
      candidates.push({ id:`splice:${donors.join('+')}`, donors, score, mode:'ordered-splice', javascript:null });
    }
    return { ...q, candidates };
  }

  compileCandidate(candidate) {
    if (candidate.mode === 'single-anchor') {
      const donor = this.mesh.getNode(candidate.donors[0]);
      if (donor?.execute) return { ok:true, execute:donor.execute, rawBody:sourceForNode(donor), mode:candidate.mode };
      const src = candidate.javascript;
      const valid = validateSourceShape(src);
      if (!valid.ok) return { ok:false, reason:valid.reason };
      try {
        // Function-source compilation is a browser-local compiler path, not a
        // sandbox. Callers should execute candidates inside their existing
        // Worker/isolated probe boundary when one is available.
        const fn = (0,eval)(`(${src})`); // eslint-disable-line no-eval
        if (typeof fn !== 'function') return {ok:false,reason:'DONOR_NOT_CALLABLE'};
        return {ok:true,execute:fn,rawBody:src,mode:candidate.mode};
      } catch (error) { return {ok:false,reason:'COMPILE_ERROR',error:String(error?.message||error)}; }
    }

    const fns = candidate.donors.map(id => this.mesh.getNode(id)?.execute).filter(fn => typeof fn === 'function');
    if (fns.length !== candidate.donors.length) return {ok:false,reason:'NONCALLABLE_DONOR'};
    const execute = async (input, context = {}) => {
      let value = input;
      const trace = [];
      for (let i=0;i<fns.length;i++) {
        value = await fns[i](value, context);
        trace.push({ donor:candidate.donors[i], value });
      }
      return { value, trace };
    };
    return {ok:true,execute,rawBody:`/* mesh composition: ${candidate.donors.join(' -> ')} */`,mode:candidate.mode};
  }

  async synthesize(gapContext = {}, { probeCandidate } = {}) {
    const derived = this.deriveCandidates(gapContext);
    if (!derived.candidates.length) return {ok:false,reason:'NO_MESH_DONORS',...derived};
    const results=[];
    if(typeof probeCandidate!=='function') return {ok:false,reason:'PROBE_REQUIRED',...derived};
    for (const candidate of derived.candidates) {
      const compiled=this.compileCandidate(candidate);
      if(!compiled.ok){results.push({...candidate,compiled,fitness:-Infinity});continue;}
      let probe={ok:false,progress:0,behaviorMatch:0,newFailures:0};
      if(typeof probeCandidate==='function') {
        try { probe = await probeCandidate(compiled.execute,candidate) || probe; }
        catch(error){ probe={ok:false,progress:0,behaviorMatch:0,newFailures:1,error:String(error?.message||error)}; }
      }
      const fitness = (Number(probe.progress)||0)*4 + (Number(probe.behaviorMatch)||0)*5 - (Number(probe.newFailures)||0)*3 + candidate.score;
      results.push({...candidate,compiled,probe,fitness});
    }
    results.sort((a,b)=>b.fitness-a.fitness);
    const winner=results.find(r=>r.compiled?.ok && r.probe?.ok!==false) || results[0];
    if(!winner?.compiled?.ok) return {ok:false,reason:'NO_COMPILABLE_MESH_RULE',...derived,results};
    const capability = gapContext.requiredCapability || `mesh-capability-${this.installed.size+1}`;
    const installed = this.registerLearned({
      id:capability,
      name:capability,
      gate:derived.targetGate,
      requirements:gapContext.requirements,
      behavioralContract:gapContext.behavioralContract,
      execute:winner.compiled.execute,
      rawBody:winner.compiled.rawBody,
      provenance:{ donors:winner.donors, fitness:winner.fitness, mode:winner.mode },
    });
    return {ok:true,capability,installed,winner,results,targetGate:derived.targetGate,queryTokens:derived.queryTokens};
  }
}

export default MeshRuleSynthesizer;

