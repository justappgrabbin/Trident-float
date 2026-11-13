import {
  DIMENSION_CHAINS, ORDINAL_PERSPECTIVES, THREE_CONDITIONS,
  CRYSTALS_AND_MONOPOLE, COLOR_TABLE, TONE_TABLE, BASE_TABLE,
} from '../../../../authorities/execution-spine/src/pure-synthia/state-space/chains.js';

const copy = value => structuredClone(value);
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const primitive = ['Movement', 'Evolution', 'Being', 'Design'];
const dimensions = [...primitive, 'Space'];
export const FIELD_VECTORS = freeze({ M: 'Evolution', E: 'Design', B: 'Being', I: 'Movement' });
const words = value => String(value).match(/[\p{L}\p{N}]+/gu) ?? [];
const lower = value => String(value).normalize('NFKC').toLowerCase();

export const STRUCTURAL_SOURCES = freeze({
  motivation: { tableSource: 'BOC-chart', perspectiveSource: 'user: motivation view, 2026-10-21' },
  movement: { tableSource: 'BB-p130', perspectiveSource: 'user: Movement view, 2026-10-21' },
  evolution: { tableSource: 'BB-p126', perspectiveSource: 'user: Evolution view, 2026-10-21' },
  being: { tableSource: 'BB-p127', perspectiveSource: 'user: Being / phase space view, 2026-10-21' },
  design: { tableSource: 'BB-p128', perspectiveSource: 'user: fourth-dimension view, 2026-10-21' },
  space: { tableSource: 'BB-p129', perspectiveSource: 'user: emergent Space clarification, 2026-10-21' },
});

// Reading directions are user statements, not automatically executable letter paths.
export const DIRECTIONAL_CLAIMS = freeze({
  Being: { description: 'across', status: 'user-stated', path: null },
  Movement: { description: 'up/down; its top can be our bottom', status: 'user-stated', path: null },
  Evolution: { description: 'dual; W-shaped flow; minor-side qualification', status: 'exact-path-unresolved', path: null },
  Design: { description: 'diagonal', status: 'provisional-per-user', path: null },
  Space: { description: 'emerges from interplay', status: 'user-stated', path: null },
});

// These are representations supplied by the author, not a derived acronym in the sources.
export const REPRESENTATION_CLUE = freeze([
  ['B', 'binary'], ['H', 'hexadecimal'], ['A', 'ASCII'], ['N', 'NATO'],
  ['T', 'transliteration'], ['U', 'Unicode'], ['G', 'geometry'], ['H', 'hash'],
].map(([letter, representation], index) => ({ letter, representation, index, status: 'user-supplied; traversal-unresolved' })));

function field(dimension, properties, source) {
  return { dimension, role: dimension === 'Space' ? 'emergent' : 'contributing', properties: copy(properties), source };
}

export function structuralView(view = 'being') {
  const key = lower(view);
  if (!Object.hasOwn(STRUCTURAL_SOURCES, key)) throw new RangeError(`Unknown structural view: ${view}`);
  const source = STRUCTURAL_SOURCES[key];
  let fields;
  if (key === 'movement') {
    fields = [];
    for (const claim of [CRYSTALS_AND_MONOPOLE.personalityCrystal, CRYSTALS_AND_MONOPOLE.designCrystal]) {
      for (const part of claim.value.binary) fields.push(field(part.chain, { group: claim.value.name, groupRole: claim.value.role, ...part }, claim.source));
    }
    const claim = CRYSTALS_AND_MONOPOLE.magneticMonopole;
    fields.push(field('Movement', { group: claim.value.name, groupRole: claim.value.role, ...claim.value.manifests }, claim.source));
  } else if (key === 'motivation') {
    fields = BASE_TABLE.entries.map(claim => field(claim.value.dimension, claim.value, claim.source));
  } else {
    const order = key === 'being' ? ORDINAL_PERSPECTIVES.Being.value : dimensions;
    fields = order.map(d => {
      const record = DIMENSION_CHAINS[d];
      if (key === 'being') return field(d, { identity: d, nature: record.macroChain[0].value }, source.tableSource);
      if (key === 'design') return field(d, {
        chain: record.macroChain.map(c => c.value),
        basicComponent: record.basicComponents?.fourDimensionChart?.value ?? null,
      }, source.tableSource);
      return field(d, { chain: record.macroChain.map(c => c.value), micro: record.micro.value }, source.tableSource);
    });
  }
  return freeze({
    view: key, label: key === 'being' ? 'Being / phase space' : key[0].toUpperCase() + key.slice(1),
    source, fields, order: fields.map(f => f.dimension),
    color: key === 'motivation' ? copy(COLOR_TABLE) : null,
    tone: key === 'motivation' ? copy(TONE_TABLE) : null,
    conditions: key === 'space' ? copy(THREE_CONDITIONS) : null,
    directions: copy(DIRECTIONAL_CLAIMS),
    spacePolicy: { primitive: false, contributors: [...primitive], rule: 'interaction-derived; no universal numeric formula established' },
    unresolved: ['nine-view transformation rules', 'minor-side orientation', 'directional letter traversal', 'context-specific Color/Tone/Base transformations'],
  });
}

export function applyStructuralFrame(sourceView, frame = {}) {
  const question = frame.question == null ? null : lower(frame.question);
  if (question && !['who', 'what', 'where', 'when', 'why'].includes(question)) throw new RangeError('unknown starting question');
  if (frame.governingField != null && !dimensions.includes(frame.governingField)) throw new RangeError('unknown governing field');
  const order = frame.order ?? sourceView.order;
  if (!Array.isArray(order) || order.length !== 5 || new Set(order).size !== 5 || order.some(d => !dimensions.includes(d))) throw new RangeError('frame order must contain all five dimensions exactly once');
  // No global when->Being or when->Movement mapping: the observer supplies the frame.
  // Further inferred transformations require a separately established rule.
  return { ...copy(sourceView), sourceOrder: [...sourceView.order], order: [...order],
    fields: order.map(d => ({ ...copy(sourceView.fields.find(f => f.dimension === d)), governing: d === frame.governingField,
      contextualRole: frame.fieldRoles?.[d] ?? null })),
    observer: { question, governingField: frame.governingField ?? null, individual: frame.individual ?? null,
      environment: frame.environment ?? null, basis: frame.basis ?? 'caller-specified frame',
      ordering: frame.order ? 'explicit-frame-order' : 'source-order-retained; transformed-order-unresolved' } };
}

function select(table, value, name) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1 || value > table.entries.length) throw new RangeError(`${name} must be an integer in 1..${table.entries.length}`);
  return copy(table.entries[value - 1]);
}

export function interpretCoordinates(address = {}, { view = 'being', environment = null, individual = null } = {}) {
  const projection = structuralView(view);
  const selected = { color: address.color ?? null, tone: address.tone ?? null, base: address.base ?? null };
  const meanings = projection.view === 'motivation' ? {
    color: select(COLOR_TABLE, selected.color, 'color'),
    tone: select(TONE_TABLE, selected.tone, 'tone'),
    base: select(BASE_TABLE, selected.base, 'base'),
  } : null;
  return { view: projection.view, environment: copy(environment), individual: copy(individual), selected, meanings,
    status: meanings ? 'source-table-projection' : 'coordinate-interpretation-unresolved-for-view',
    policy: 'missing-coordinates-stay-null; other-views-are-not-filled-from-motivation' };
}

/** Exact indexing of the discrete hierarchy. No population of the space is allocated. */
export class FractalAddressSpace {
  static fields = freeze([['gate', 64], ['line', 6], ['color', 6], ['tone', 6], ['base', 5]]);
  static branching = 69120n;
  constructor({ depth = 1 } = {}) {
    if (!Number.isInteger(depth) || depth < 1 || depth > 32) throw new RangeError('depth must be in 1..32');
    this.depth = depth;
  }
  get capacity() { return FractalAddressSpace.branching ** BigInt(this.depth); }
  at(index) {
    if (typeof index === 'number' && !Number.isSafeInteger(index)) throw new RangeError('use a BigInt or decimal string for large indexes');
    let remaining = BigInt(index);
    if (remaining < 0n || remaining >= this.capacity) throw new RangeError('index outside fractal address space');
    const path = [];
    for (let level = 0; level < this.depth; level++) {
      const cell = {};
      for (const [name, size] of [...FractalAddressSpace.fields].reverse()) { cell[name] = Number(remaining % BigInt(size)) + 1; remaining /= BigInt(size); }
      path.unshift(Object.fromEntries(FractalAddressSpace.fields.map(([name]) => [name, cell[name]])));
    }
    return { index: String(BigInt(index)), identity: `state://${path.map(c => FractalAddressSpace.fields.map(([k]) => c[k]).join('.')).join('/')}`, path };
  }
  indexOf(path) {
    if (!Array.isArray(path) || path.length !== this.depth) throw new RangeError('path must match depth');
    let result = 0n;
    for (const cell of path) for (const [name, size] of FractalAddressSpace.fields) {
      if (!Number.isInteger(cell[name]) || cell[name] < 1 || cell[name] > size) throw new RangeError(`invalid ${name}`);
      result = result * BigInt(size) + BigInt(cell[name] - 1);
    }
    return result;
  }
  snapshot() { return { depth: this.depth, branching: String(FractalAddressSpace.branching), capacity: String(this.capacity), allocation: 'lazy',
    interpretation: 'representational capacity of independent recursive slots; not a count of validated meanings',
    angularPolicy: 'degree/minute/second/arc are not multiplied as independent axes without established rules' }; }
}

// Only the visible labeled relations from the author's song example are encoded.
const SONG = freeze({
  source: 'user-supplied chart: When the 5 is a Song',
  nodes: [
    { id: 'Evolution', position: [-1, -1], labels: ['Mind', 'Love', 'Integration', 'Evolution'], origin: 'PW' },
    { id: 'Design', position: [1, -1], labels: ['Ego', 'Life', 'Continuity', 'Design'], origin: 'DW' },
    { id: 'Being', position: [-1, 1], labels: ['Body', 'Sex', 'Geometry', 'Being'], origin: 'DW' },
    { id: 'Movement', position: [1, 1], labels: ['Individuality', 'Landscape', 'Perspective', 'Movement'], origin: 'BG' },
  ],
  relations: [
    { id: 'speed', from: 'Evolution', to: 'Design', label: 'Tempo' },
    { id: 'force', from: 'Being', to: 'Movement', label: 'Appeal' },
    { id: 'material', from: 'Evolution', to: 'Being', label: 'Musician' },
    { id: 'position', from: 'Design', to: 'Movement', label: 'Audience' },
  ],
  expression: ['Song', 'Music', 'Rhythm'],
});

export const JUT_TOPOLOGY = freeze({
  source: 'user: explicit M/E/B/I + emergent P formalization, 2026-10-22',
  nodes: [
    { id: 'Evolution', vector: 'M', position: [-1, -1], labels: ['Mind', 'Evolution'] },
    { id: 'Design', vector: 'E', position: [1, -1], labels: ['Ego', 'Design'] },
    { id: 'Being', vector: 'B', position: [-1, 1], labels: ['Body', 'Being'] },
    { id: 'Movement', vector: 'I', position: [1, 1], labels: ['Individuality', 'Movement'] },
  ],
  relations: [
    { id: 'speed', from: 'Evolution', to: 'Design', label: 'Speed', kind: 'outer' },
    { id: 'material', from: 'Evolution', to: 'Being', label: 'Material', kind: 'outer' },
    { id: 'force', from: 'Being', to: 'Movement', label: 'Force', kind: 'outer' },
    { id: 'position', from: 'Design', to: 'Movement', label: 'Position', kind: 'outer' },
    { id: 'diagonal-MI', from: 'Evolution', to: 'Movement', label: 'M/I cross-coupling', kind: 'diagonal' },
    { id: 'diagonal-EB', from: 'Design', to: 'Being', label: 'E/B cross-coupling', kind: 'diagonal' },
  ],
  expression: null,
  layoutPolicy: 'reference layout from the supplied graph; other perspective transformations require explicit rules',
});

function fieldSelection(activeFields) {
  if (activeFields == null) return null;
  if (!Array.isArray(activeFields)) throw new TypeError('activeFields must be an array');
  const mapped = activeFields.map(f => FIELD_VECTORS[f] ?? f);
  if (mapped.some(f => !primitive.includes(f))) throw new RangeError('only M/E/B/I contributing fields may be activated; P/Space is emergent');
  return new Set(mapped);
}

function edgeSelection(openEdges, model) {
  if (openEdges == null) return null;
  if (!Array.isArray(openEdges) || openEdges.some(id => !model.relations.some(r => r.id === id))) throw new RangeError('unknown open edge');
  return new Set(openEdges);
}

function leaves(value, path = []) {
  if (typeof value === 'string') return [{ path, value }];
  if (value == null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => leaves(v, [...path, k]));
}

/** Word-to-field lookup tasks are created per input, not selected from a fixed swarm. */
export function analyzeStructure(subject, context = {}) {
  const view = applyStructuralFrame(structuralView(context.view ?? 'being'), context.frame);
  if (context.example != null && !['song', 'jut'].includes(context.example)) throw new RangeError('Unknown structural example');
  const input = subject?.input ?? subject ?? {};
  const text = typeof subject === 'string' ? subject : subject?.text ?? [input.title,input.question,input.query,input.text,input.page?.title,input.page?.text].filter(v=>typeof v==='string').join(' ');
  const tokens = words(text).map((value, index) => ({ value, index, initial: [...value][0], codePoints: [...value].map(c => c.codePointAt(0)) }));
  const observed = new Set(tokens.map(t => lower(t.value)));
  const model = context.example === 'song' ? copy(SONG) : copy(JUT_TOPOLOGY);
  const active = fieldSelection(context.activeFields);
  const open = edgeSelection(context.openEdges, model);
  const matches = [];
  for (const f of view.fields) {
    const aliases = model.nodes.find(n => n.id === f.dimension)?.labels.map((value, i) => ({ value, path: ['topology', String(i)], source: model.source })) ?? [];
    const values = context.example === 'song' ? aliases : [...leaves(f.properties), ...aliases];
    for (const item of values) for (const token of tokens) {
      if (!['is', 'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'i'].includes(lower(token.value)) && words(item.value).some(w => lower(w) === lower(token.value))) matches.push({ dimension: f.dimension, token: token.value, tokenIndex: token.index, propertyPath: item.path, sourceValue: item.value, source: item.source ?? f.source });
    }
  }
  // The reference graph is only an explicit example, never inferred recognition.
  const relations = (context.example ? model.relations : []).filter(r => (!open || open.has(r.id)) && (!active || [r.from, r.to].every(d => active.has(d))) && (
    observed.has(lower(r.label)) || [r.from, r.to].every(d => active ? active.has(d) : matches.some(m => m.dimension === d))));
  const contributors = [...new Set([...(active ?? []), ...matches.map(m => m.dimension), ...relations.flatMap(r => [r.from, r.to])])].filter(d => primitive.includes(d) && (!active || active.has(d)));
  const agents = contributors.map(dimension => ({
    id: `field:${dimension}`, operation: 'source-field-lookup', dimension,
    evidence: matches.filter(m => m.dimension === dimension),
    output: {field:copy(view.fields.find(f => f.dimension === dimension)), topology:copy(model.nodes.find(n => n.id === dimension))},
    status: 'executed',
  }));
  const recognition = copy(context.recognition ?? {status:'not-invoked',runs:[],issues:[],graph:{nodes:[],relations:[]}});
  const recognizedRelations = context.toolState?.graph?.relations ?? recognition.graph?.relations ?? [];
  const completeExample = Boolean(context.example) && contributors.length === 4 && relations.length === model.relations.length;
  const space = {
    role: 'emergent', contributors, interactions: context.example ? relations : recognizedRelations,
    expression: completeExample ? copy(model.expression) : null,
    status: completeExample ? 'complete-example-interplay' : relations.length ? 'partial-example-interplay' : recognizedRelations.length ? 'tool-recognized-relations' : 'interplay-rule-required',
    source: context.example ? model.source : 'live recognition tools',
    derivation: context.example ? 'explicit reference example; not a recognized relationship' : 'preserved tool relationships; no field coupling inferred from matching words',
  };
  if (relations.length) agents.push({ id: 'interplay:Space', operation: 'compose-explicit-relations', status: 'executed', evidence: copy(relations), output: copy(space) });
  for (const run of recognition.runs ?? []) agents.push({id:`recognition:${run.toolId}:${run.operation}`,operation:run.operation,status:run.status,derivationId:run.derivationId ?? null});
  return { view, tokens, matches, recognition, interpretations: (context.coordinates ?? context.addresses ?? []).map(a => interpretCoordinates(a, { ...context, view: view.view })),
    model, space, swarm: { kind: 'bounded-symbolic-field-workers', agents, count: agents.length },
    spaceCapacity: new FractalAddressSpace({ depth: context.depth ?? 1 }).snapshot(),
    unresolvedTokens: tokens.filter(t => !matches.some(m => m.tokenIndex === t.index) && !relations.some(r => lower(r.label) === lower(t.value))),
    unresolved: [...view.unresolved, 'general image synthesis and 3D geometry are not implemented by this structural slice'] };
}

/** Follow only caller-specified edges. No automatic BHANTUGH/LOVE path is invented. */
export function traceStructuralPath({ nodes, edges, path, orientation = { x: 1, y: 1 }, read = 'initial' } = {}) {
  if (!Array.isArray(nodes) || !Array.isArray(edges) || !Array.isArray(path) || !path.length || path.length > 1024) throw new TypeError('nodes, edges and a nonempty bounded path are required');
  if (!['initial', 'label'].includes(read) || ![1, -1].includes(orientation.x) || ![1, -1].includes(orientation.y)) throw new TypeError('invalid reading mode or orientation');
  const byId = new Map(nodes.map(n => [n.id, n]));
  if (byId.size !== nodes.length) throw new TypeError('node ids must be unique');
  const steps = path.map((id, i) => {
    const node = byId.get(id);
    if (!node || typeof node.label !== 'string' || !Array.isArray(node.position) || node.position.length !== 2 || !node.position.every(Number.isFinite)) throw new TypeError(`invalid path node: ${id}`);
    if (i && !edges.some(e => e.from === path[i - 1] && e.to === id || e.bidirectional === true && e.to === path[i - 1] && e.from === id)) throw new RangeError(`no permitted edge: ${path[i - 1]} -> ${id}`);
    return { id, label: node.label, worldPosition: [...node.position], viewPosition: [node.position[0] * orientation.x, node.position[1] * orientation.y],
      reading: read === 'label' ? node.label : [...node.label][0] ?? '' };
  });
  return { steps, reading: steps.map(s => s.reading).join(''), orientation: { ...orientation }, provenance: 'caller-specified path; case preserved' };
}

