// Pure Synthia Automata — tool-16: morph-mir (memory-graph automaton: ingest→analyze→remember→regenerate)
// Fidelity port of src/UPGRADES/vendor/morph-mir-system/lib/{morphMemoryEngine,mirAnalyzer,mirRenderer}.js,
// made synchronous + deterministic (counter-based ids/timestamps, no clocks). Brutally honest integrity:
// only byte-equal reconstruction is exact; morph_runtime reports integrity 0 BY DESIGN.
import { Automaton } from '../automaton.js';

export class MorphMirError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MorphMirError';
    this.code = code;
    this.details = details;
  }
}

// ========== MIR ANALYZER (contract + blueprint extraction) ==========
export class MirAnalyzer {
  analyze(artifact) {
    const content = artifact.originalContent;
    const fileType = this.detectFileType(artifact.originalName);
    const contract = {
      fileType,
      exports: this.extractExports(content),
      imports: this.extractImports(content),
      dependencies: this.extractDependencies(content),
      props: fileType === 'tsx' || fileType === 'jsx' ? this.extractProps(content) : undefined,
      behavior: this.extractBehavior(content),
      dataFlow: this.extractDataFlow(content),
      stateShape: this.extractStateShape(content),
      apiSurface: this.extractApiSurface(content),
    };
    const blueprint = this.extractBlueprint(content);
    return { contract, blueprint };
  }

  detectFileType(filename) {
    const ext = String(filename).split('.').pop().toLowerCase();
    return { tsx: 'tsx', ts: 'ts', js: 'js', jsx: 'jsx', py: 'py', json: 'json', css: 'css', md: 'md' }[ext] || 'unknown';
  }

  extractExports(content) {
    const exports = [];
    const defaultMatch = content.match(/export\s+default\s+(?:function|class|const)?\s*(\w+)/);
    if (defaultMatch) exports.push(`default:${defaultMatch[1]}`);
    for (const match of content.matchAll(/export\s+(?:function|class|const|type|interface)\s+(\w+)/g)) exports.push(match[1]);
    return exports;
  }

  extractImports(content) {
    return [...content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  }

  extractDependencies(content) {
    const deps = new Set();
    if (content.includes('react')) deps.add('react');
    if (content.includes('framer-motion')) deps.add('framer-motion');
    if (content.includes('useState') || content.includes('useEffect')) deps.add('react-hooks');
    if (content.includes('fetch') || content.includes('axios') || content.includes('http')) deps.add('http');
    if (content.includes('supabase')) deps.add('supabase');
    if (content.includes('tailwind')) deps.add('tailwind');
    if (content.includes('three')) deps.add('three.js');
    if (content.includes('tensorflow') || content.includes('tf.')) deps.add('tensorflow');
    return [...deps];
  }

  extractProps(content) {
    const props = [];
    const interfaceMatch = content.match(/interface\s+\w+Props\s*\{([^}]+)\}/);
    if (interfaceMatch) {
      for (const match of interfaceMatch[1].matchAll(/(\w+)(\?)?:\s*(\w+)/g)) {
        props.push({ name: match[1], type: match[3], required: !match[2] });
      }
    }
    return props;
  }

  extractBehavior(content) {
    const behavior = [];
    if (content.includes('onClick')) behavior.push('handles click events');
    if (content.includes('onChange')) behavior.push('handles input changes');
    if (content.includes('onSubmit')) behavior.push('handles form submission');
    if (content.includes('useState')) behavior.push('manages local state');
    if (content.includes('useEffect')) behavior.push('reacts to lifecycle changes');
    if (content.includes('useReducer')) behavior.push('complex state management');
    if (content.includes('fetch') || content.includes('axios')) behavior.push('makes API calls');
    if (content.includes('map(')) behavior.push('renders lists dynamically');
    if (content.includes('animate') || content.includes('motion')) behavior.push('has animations');
    return behavior;
  }

  extractDataFlow(content) {
    const flows = [];
    if (content.includes('useState')) flows.push({ from: 'user', to: 'state', type: 'state' });
    if (content.includes('onClick')) flows.push({ from: 'user', to: 'handler', type: 'event' });
    if (content.includes('onChange')) flows.push({ from: 'input', to: 'state', type: 'event', transform: 'sanitize' });
    if (content.includes('fetch') || content.includes('axios')) {
      flows.push({ from: 'api', to: 'component', type: 'api' });
      flows.push({ from: 'component', to: 'state', type: 'state', transform: 'parseJSON' });
    }
    if (content.includes('props')) flows.push({ from: 'parent', to: 'component', type: 'prop' });
    return flows;
  }

  extractStateShape(content) {
    const stateShape = {};
    for (const match of content.matchAll(/const\s+\[(\w+),\s*set(\w+)\]\s*=\s*useState(?:<([^>]+)>)?\(([^)]*)\)/g)) {
      stateShape[match[1]] = match[3] || 'any';
    }
    return Object.keys(stateShape).length > 0 ? stateShape : undefined;
  }

  extractApiSurface(content) {
    const endpoints = [];
    for (const match of content.matchAll(/fetch\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      endpoints.push({ method: 'GET', path: match[1] });
    }
    return endpoints.length > 0 ? endpoints : undefined;
  }

  extractBlueprint(content) {
    const imports = [...content.matchAll(/import\s+.*?\s+from\s+['"][^'"]+['"]/g)].map((m) => m[0]);
    const exports = [...content.matchAll(/export\s+(?:default\s+)?(?:function|const|class|interface|type)\s+\w+/g)].map((m) => m[0]);
    const functions = [...content.matchAll(/(?:function|const)\s+(\w+)/g)].map((m) => m[1]);
    const classes = [...content.matchAll(/class\s+(\w+)/g)].map((m) => m[1]);
    const hasJsx = content.includes('return (') && content.includes('<');
    let fileRole = 'utility';
    if (hasJsx) fileRole = 'component';
    else if (exports.some((e) => e.includes('default'))) fileRole = 'module';
    else if (classes.length > 0) fileRole = 'class';
    else if (functions.length > 0) fileRole = 'functions';
    return { imports, exports, functions, classes, hasJsx, fileRole, chunkCount: Math.ceil(content.length / 2000), totalLength: content.length };
  }
}

// ========== MIR RENDERER (equivalent + morph_runtime) ==========
export class MirRenderer {
  render(contract, blueprint, mode) {
    if (mode === 'equivalent') return this.renderEquivalent(contract, blueprint);
    return this.renderMorphRuntime(contract, blueprint);
  }

  renderEquivalent(contract, blueprint) {
    const lines = [];
    const specName = (blueprint.exports[0] || '').replace('default:', '') || 'MorphComponent';
    for (const imp of contract.imports.slice(0, 5)) {
      if (imp === 'react') lines.push('import React from "react"');
      else if (imp.includes('framer')) lines.push('import { motion } from "framer-motion"');
      else if (imp.includes('supabase')) lines.push('import { supabase } from "@/lib/supabase"');
      else lines.push(`import * as ${imp.replace(/[^a-zA-Z0-9]/g, '_').replace(/^[0-9]/, '_')} from "${imp}"`);
    }
    lines.push('');
    if (contract.props && contract.props.length > 0) {
      lines.push(`interface ${specName}Props {`);
      for (const prop of contract.props) lines.push(`  ${prop.name}${prop.required ? '' : '?'}: ${prop.type};`);
      lines.push('}', '');
    }
    if (blueprint.fileRole === 'component') {
      lines.push(`export const ${specName} = () => {`);
      for (const behavior of contract.behavior) lines.push(`  // TODO: ${behavior}`);
      lines.push('', '  return (', '    <div>', `      {/* ${specName} - equivalent reconstruction */}`, '    </div>', '  );', '};');
    } else {
      lines.push(`export function ${specName}() {`);
      for (const behavior of contract.behavior) lines.push(`  // TODO: ${behavior}`);
      lines.push('  return null;', '}');
    }
    if (blueprint.exports.some((e) => e.startsWith('default:'))) lines.push('', `export default ${specName};`);
    return lines.join('\n');
  }

  renderMorphRuntime(contract, blueprint) {
    const specName = (blueprint.exports[0] || '').replace('default:', '') || 'MorphComponent';
    return [
      '// Morph Runtime Equivalent',
      `// Original: ${blueprint.fileRole} (${contract.fileType})`,
      '// Confidence: ~0.78',
      `// This file: ${specName}.morph.ts (the spec)`,
      '',
      `export const ${specName}Spec = {`,
      `  type: "${blueprint.fileRole}",`,
      `  name: "${specName}",`,
      `  fileType: "${contract.fileType}",`,
      `  behavior: ${JSON.stringify(contract.behavior)},`,
      `  dependencies: ${JSON.stringify(contract.dependencies)},`,
      `  dataFlow: ${JSON.stringify(contract.dataFlow)},`,
      `  stateShape: ${JSON.stringify(contract.stateShape)},`,
      `  apiSurface: ${JSON.stringify(contract.apiSurface)}`,
      '};',
    ].join('\n');
  }
}

// ========== MORPH MEMORY ENGINE (GNN-style node graph + operations log) ==========
export class MorphMemoryEngine {
  constructor() {
    this.nodes = new Map();
    this.operations = [];
    this.artifacts = new Map();
    this.nodeCounter = 0;
    this.artifactCounter = 0;
    this.opCounter = 0;
    this.analyzer = new MirAnalyzer();
    this.renderer = new MirRenderer();
  }

  ingest({ name, content } = {}) {
    if (!name || typeof content !== 'string') {
      throw new MorphMirError('ARTIFACT_REQUIRED', 'ingest requires {name, content}');
    }
    const artifact = {
      id: `artifact_${++this.artifactCounter}`,
      originalName: name,
      originalContent: content,
      understanding: null,
      metadata: { status: 'ingested' },
    };
    this.artifacts.set(artifact.id, artifact);
    this.addOperation('ingest', artifact.id, `Ingested ${name} (${content.length} bytes)`);
    this.completeOperation('ingest', artifact.id, `Artifact ${artifact.id} stored`);
    return artifact;
  }

  analyze(artifactId) {
    const artifact = this.#artifact(artifactId);
    this.addOperation('analyze', artifact.id, `Analyzing ${artifact.originalName}...`);
    const content = artifact.originalContent;
    const { contract, blueprint } = this.analyzer.analyze(artifact);
    this.createSourceChunks(content, artifact.id);
    this.createNode('file_blueprint', JSON.stringify({ contract, blueprint }), artifact.id);
    for (const imp of blueprint.imports.slice(0, 10)) this.createNode('dependency', imp, artifact.id);

    const understanding = {
      intent: this.extractIntent(content),
      functionality: this.extractFunctionality(content),
      dependencies: this.extractDependencies(content),
      patterns: this.extractPatterns(content),
      complexity: this.calculateComplexity(content),
      keyInsights: [],
      reusableComponents: [],
    };
    understanding.keyInsights = this.extractKeyInsights(content, understanding.functionality);
    understanding.reusableComponents = this.extractReusableComponents(content);

    for (const func of understanding.functionality) this.createNode('functionality', func, artifact.id);
    for (const pattern of understanding.patterns) this.createNode('pattern', pattern, artifact.id);
    for (const insight of understanding.keyInsights) this.createNode('insight', insight, artifact.id);
    for (const comp of understanding.reusableComponents) this.createNode('reusable_component', comp, artifact.id);

    artifact.understanding = understanding;
    artifact.metadata = { ...artifact.metadata, status: 'understood' };
    this.completeOperation('analyze', artifact.id, `MIR contract + ${blueprint.chunkCount} source chunks stored. Blueprint: ${blueprint.fileRole}`);
    return { artifactId: artifact.id, understanding, blueprint, nodes: this.findArtifactNodes(artifact.id).length };
  }

  remember(artifactId) {
    const artifact = this.#artifact(artifactId);
    if (!artifact.understanding) throw new MorphMirError('ANALYSIS_REQUIRED', 'remember requires a prior analyze');
    this.addOperation('remember', artifact.id, `Committing ${artifact.originalName} to memory...`);
    this.strengthenConnections(artifact.id);
    const artifactNodes = this.findArtifactNodes(artifact.id);
    for (const node of artifactNodes) node.weight = Math.min(1, node.weight + 0.2);
    this.completeOperation('remember', artifact.id, `Committed ${artifactNodes.length} nodes to memory.`);
    return { artifactId: artifact.id, nodesCommitted: artifactNodes.length };
  }

  // BRUTAL: isExact = byte-identical. No lying with good posture.
  regenerate(artifactId, { mode = 'morph_runtime' } = {}) {
    const artifact = this.#artifact(artifactId);
    if (!artifact.understanding) throw new MorphMirError('ANALYSIS_REQUIRED', 'regenerate requires a prior analyze');
    this.addOperation('regenerate', artifact.id, `Regenerating ${artifact.originalName} (mode: ${mode})...`);

    const artifactNodes = this.findArtifactNodes(artifact.id);
    const blueprintNode = artifactNodes.find((n) => n.nodeType === 'file_blueprint');
    const reconstructed = this.reconstructFromChunks(artifact.id);
    const isIdentical = reconstructed === artifact.originalContent;
    const integrity = artifact.originalContent.length > 0 ? reconstructed.length / artifact.originalContent.length : 0;
    const chunkCount = artifactNodes.filter((n) => n.nodeType === 'source_chunk').length;
    const hasSourceChunks = chunkCount > 0;
    const base = {
      integrity, chunkCount,
      reconstructedLength: reconstructed.length,
      originalLength: artifact.originalContent.length,
    };

    let result;
    if (mode === 'exact') {
      if (hasSourceChunks && integrity > 0.7) {
        result = {
          ...base, code: reconstructed,
          confidence: isIdentical ? 0.98 : 0.92,
          modeUsed: 'exact',
          missing: isIdentical ? [] : ['minor whitespace/formatting differences'],
          isExact: isIdentical,
        };
      } else {
        result = {
          ...base, code: this.generateFromBlueprint(artifact.id, artifact.understanding),
          confidence: 0.65,
          modeUsed: 'exact',
          missing: [`Source integrity too low (${(integrity * 100).toFixed(1)}%). Reconstructed from blueprint.`],
          isExact: false,
        };
      }
    } else if (mode === 'equivalent') {
      const { contract, blueprint } = this.#contractAndBlueprint(blueprintNode, artifact);
      result = {
        ...base, code: this.renderer.render(contract, blueprint, 'equivalent'),
        confidence: 0.85,
        modeUsed: 'equivalent',
        missing: ['exact implementation details', 'original comments', 'precise formatting'],
        integrity: 0,
        isExact: false,
      };
    } else if (mode === 'morph_runtime') {
      const { contract, blueprint } = this.#contractAndBlueprint(blueprintNode, artifact);
      const morphCode = this.renderer.render(contract, blueprint, 'morph_runtime');
      result = {
        ...base, code: morphCode,
        confidence: 0.78,
        modeUsed: 'morph_runtime',
        missing: ['exact styles', 'custom animation timing', 'original variable names'],
        integrity: 0, // BY DESIGN: runtime-equivalent morph never claims source integrity
        isExact: false,
      };
      this.createNode('morph_runtime', JSON.stringify({ specName: `${artifact.originalName}.morph`, confidence: 0.78 }), artifact.id);
    } else {
      throw new MorphMirError('UNKNOWN_MODE', String(mode));
    }

    this.completeOperation('regenerate', artifact.id, `${mode} complete (${result.confidence} confidence, ${result.isExact ? 'EXACT' : 'approximate'})`);
    artifact.metadata = { ...artifact.metadata, status: 'regenerated' };
    return {
      artifactId: artifact.id,
      mode: result.modeUsed,
      code: result.code,
      confidence: result.confidence,
      integrity: result.integrity,
      isExact: result.isExact,
      missing: result.missing,
      chunkCount: result.chunkCount,
      reconstructedLength: result.reconstructedLength,
      originalLength: result.originalLength,
      gnnNodes: artifactNodes.map((n) => n.id),
    };
  }

  #contractAndBlueprint(blueprintNode, artifact) {
    if (blueprintNode) {
      try { return JSON.parse(blueprintNode.content); } catch { /* fall through */ }
    }
    return this.analyzer.analyze(artifact);
  }

  // ---------- source chunk system (explicit index; overlap-stitched reconstruction) ----------
  createSourceChunks(content, artifactId) {
    const chunkSize = 2000;
    const overlap = 200;
    for (let i = 0, index = 0; i < content.length; i += chunkSize - overlap, index++) {
      const payload = { index, chunk: content.slice(i, Math.min(i + chunkSize, content.length)), start: i, end: Math.min(i + chunkSize, content.length) };
      this.createNode('source_chunk', JSON.stringify(payload), artifactId);
    }
  }

  reconstructFromChunks(artifactId) {
    const chunks = this.findArtifactNodes(artifactId)
      .filter((n) => n.nodeType === 'source_chunk')
      .map((n) => { try { return JSON.parse(n.content); } catch { return null; } })
      .filter((p) => p !== null)
      .sort((a, b) => a.index - b.index);
    if (chunks.length === 0) return '';
    let result = chunks[0].chunk;
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1].chunk;
      const curr = chunks[i].chunk;
      let overlapLen = 0;
      const maxOverlap = Math.min(prev.length, curr.length, 500);
      for (let j = maxOverlap; j > 0; j--) {
        if (prev.slice(-j) === curr.slice(0, j)) { overlapLen = j; break; }
      }
      result += curr.slice(overlapLen);
    }
    return result;
  }

  generateFromBlueprint(artifactId, understanding) {
    const blueprintNode = this.findArtifactNodes(artifactId).find((n) => n.nodeType === 'file_blueprint');
    if (!blueprintNode) return `// Blueprint not found for ${artifactId}`;
    try {
      const { blueprint } = JSON.parse(blueprintNode.content);
      const lines = [
        '// Reconstructed from blueprint',
        `// Role: ${blueprint.fileRole}`,
        `// Functions: ${blueprint.functions.length}`,
        `// Classes: ${blueprint.classes.length}`,
        '',
        ...blueprint.imports,
        '',
        ...blueprint.exports,
        '',
        `// Original functionality: ${understanding.functionality.join(', ')}`,
        `// Patterns: ${understanding.patterns.join(', ')}`,
      ];
      return lines.join('\n');
    } catch {
      return '// Failed to parse blueprint';
    }
  }

  // ---------- semantic extraction ----------
  extractIntent(content) {
    const commentPatterns = [/\/\*\*\s*\n\s*\*\s*(.+?)\n/s, /\/\/\s*(.+?)(?:\n|$)/, /#\s*(.+?)(?:\n|$)/];
    for (const pattern of commentPatterns) {
      const match = content.match(pattern);
      if (match) return match[1].trim();
    }
    const classMatch = content.match(/class\s+(\w+)/);
    if (classMatch) return `Implements ${classMatch[1]} functionality`;
    const funcMatch = content.match(/function\s+(\w+)/);
    if (funcMatch) return `Provides ${funcMatch[1]} capability`;
    return 'Unknown functionality - requires analysis';
  }

  extractFunctionality(content) {
    const functions = [];
    for (const match of content.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g)) functions.push(`Export: ${match[1]}`);
    for (const match of content.matchAll(/(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g)) {
      if (!['if', 'while', 'for', 'switch', 'catch'].includes(match[1])) functions.push(`Method: ${match[1]}`);
    }
    const apiCount = [...content.matchAll(/(?:fetch|axios|http)\s*\(/g)].length;
    if (apiCount > 0) functions.push(`API integration (${apiCount} endpoints)`);
    if (content.includes('useState') || content.includes('useReducer')) functions.push('State management');
    if (content.includes('onClick') || content.includes('onChange') || content.includes('addEventListener')) functions.push('Event handling');
    return functions.length > 0 ? functions : ['Basic functionality'];
  }

  extractDependencies(content) {
    const deps = [];
    for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) deps.push(match[1]);
    for (const match of content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) deps.push(match[1]);
    if (content.includes('react')) deps.push('react');
    if (content.includes('framer-motion')) deps.push('framer-motion');
    if (content.includes('supabase')) deps.push('supabase');
    if (content.includes('tailwind')) deps.push('tailwind');
    if (content.includes('fetch') || content.includes('axios') || content.includes('http')) deps.push('http');
    return [...new Set(deps)];
  }

  extractPatterns(content) {
    const patterns = [];
    if (content.includes('class') && content.includes('extends')) patterns.push('Inheritance');
    if (content.includes('interface')) patterns.push('Interface segregation');
    if (content.includes('useEffect') || content.includes('useMemo')) patterns.push('React hooks');
    if (content.includes('create') || content.includes('factory')) patterns.push('Factory pattern');
    if (content.includes('observer') || content.includes('subscribe')) patterns.push('Observer pattern');
    if (content.includes('Map') || content.includes('Set')) patterns.push('Collection management');
    if (content.includes('async') || content.includes('await')) patterns.push('Async/await');
    if (content.includes('try') && content.includes('catch')) patterns.push('Error handling');
    if (content.includes('reduce') || content.includes('map')) patterns.push('Functional programming');
    return patterns.length > 0 ? patterns : ['Procedural'];
  }

  extractKeyInsights(content, functionality) {
    const insights = [];
    if (content.includes('graph') || content.includes('node') || content.includes('edge')) insights.push('Graph-based architecture suitable for network problems');
    if (content.includes('neural') || content.includes('tensor') || content.includes('layer')) insights.push('Neural network components - can be extended with ML capabilities');
    if (content.includes('stream') || content.includes('pipe')) insights.push('Streaming architecture - good for real-time data processing');
    if (content.includes('cache') || content.includes('memo')) insights.push('Caching strategy detected - performance optimization available');
    if (functionality.some((f) => f.includes('API'))) insights.push('API integration pattern - reusable for other service connections');
    if (functionality.some((f) => f.includes('State'))) insights.push('State management pattern - applicable to other UI components');
    return insights.length > 0 ? insights : ['General utility functionality'];
  }

  extractReusableComponents(content) {
    const components = [];
    for (const match of content.matchAll(/(?:export\s+)?(?:function|const)\s+(\w+(?:Util|Helper|Tool))/g)) components.push(`Utility: ${match[1]}`);
    if (content.includes('config') || content.includes('options') || content.includes('settings')) components.push('Configuration pattern');
    if (content.includes('validate') || content.includes('schema') || content.includes('check')) components.push('Validation logic');
    if (content.includes('transform') || content.includes('parse') || content.includes('format')) components.push('Data transformation utilities');
    return components.length > 0 ? components : ['Core functionality'];
  }

  calculateComplexity(content) {
    let score = 50;
    score += Math.min(content.split('\n').length / 10, 20);
    let maxDepth = 0;
    let currentDepth = 0;
    for (const char of content) {
      if (char === '{') { currentDepth++; maxDepth = Math.max(maxDepth, currentDepth); }
      else if (char === '}') currentDepth--;
    }
    score += maxDepth * 5;
    score += (content.match(/function/g) || []).length * 2;
    if (content.includes('async')) score += 10;
    if (content.includes('Promise')) score += 5;
    return Math.min(100, Math.round(score));
  }

  // ---------- node graph ----------
  createNode(nodeType, content, sourceArtifact) {
    this.nodeCounter++;
    const node = {
      id: `${nodeType}_${this.nodeCounter}`,
      nodeType,
      content,
      sourceArtifact,
      weight: 0.5,
      usageCount: 0,
      connections: [],
      createdSeq: this.nodeCounter,
    };
    this.nodes.set(node.id, node);
    return node;
  }

  findArtifactNodes(artifactId) {
    return [...this.nodes.values()].filter((n) => n.sourceArtifact === artifactId);
  }

  strengthenConnections(artifactId) {
    const artifactNodes = this.findArtifactNodes(artifactId);
    for (let i = 0; i < artifactNodes.length; i++) {
      for (let j = i + 1; j < artifactNodes.length; j++) {
        if (!artifactNodes[i].connections.includes(artifactNodes[j].id)) artifactNodes[i].connections.push(artifactNodes[j].id);
        if (!artifactNodes[j].connections.includes(artifactNodes[i].id)) artifactNodes[j].connections.push(artifactNodes[i].id);
      }
    }
  }

  addOperation(type, artifactId, message) {
    this.operations.push({ id: `op_${++this.opCounter}`, type, artifactId, status: 'pending', message });
  }

  completeOperation(type, artifactId, result) {
    const op = this.operations.filter((o) => o.type === type && o.artifactId === artifactId && o.status === 'pending').pop();
    if (op) { op.status = 'complete'; op.result = result; }
  }

  snapshot() {
    return Object.freeze({
      artifacts: Object.freeze([...this.artifacts.values()].map((a) => Object.freeze({
        id: a.id, originalName: a.originalName, status: a.metadata.status, length: a.originalContent.length,
      }))),
      nodes: this.nodes.size,
      operations: Object.freeze([...this.operations]),
    });
  }

  #artifact(id) {
    const artifact = this.artifacts.get(id);
    if (!artifact) throw new MorphMirError('ARTIFACT_NOT_FOUND', String(id));
    return artifact;
  }
}

const STATES = [
  { id: 'ingest', name: 'Ingest', initial: true },
  { id: 'analyze', name: 'Analyze' },
  { id: 'remember', name: 'Remember' },
  { id: 'regenerate', name: 'Regenerate', accepting: true },
];

// Named transitions per STATE_SPACE_SPEC §7.
const DELTA_TABLE = {
  'ingest|ingest': { to: 'analyze', transition: 'ignition' },
  'analyze|analyze': { to: 'remember', transition: 'core' },
  'remember|remember': { to: 'regenerate', transition: 'fusion' },
  'regenerate|regenerate': { to: 'regenerate', transition: 'reactivation' },
  'ingest|snapshot': { to: 'ingest', transition: 'core' },
};

const OP_PATHS = {
  ingest: [['ingest', 'ingest']],
  analyze: [['analyze', 'analyze']],
  remember: [['remember', 'remember']],
  regenerate: [['regenerate', 'regenerate']],
  snapshot: [['ingest', 'snapshot']],
};

const normalizeInput = (input) => {
  if (typeof input === 'string') {
    try { return JSON.parse(input); } catch { return { operation: input }; }
  }
  if (input && Array.isArray(input.args) && input.args.length && !input.operation) {
    const [op, ...rest] = input.args;
    const merged = { operation: op, packet: input.packet };
    if (rest.length === 1 && typeof rest[0] === 'string') {
      try { Object.assign(merged, JSON.parse(rest[0])); } catch { merged.value = rest[0]; }
    }
    return merged;
  }
  return input || {};
};

export class MorphMirAutomaton extends Automaton {
  static descriptor = {
    id: 'morph-mir',
    aliases: ['morph', 'mir', 'morph-memory'],
    gate: 24,
    channels: [],
    capabilities: ['ingest', 'analyze', 'remember', 'regenerate'],
    ports: {
      in: [{ id: 'artifact', type: 'artifact', schemaVersion: '1' }],
      out: [{ id: 'regeneration', type: 'artifact', schemaVersion: '1' }],
    },
    automatonForm: 'memory-graph automaton',
    dimension: 'Space',
    description: 'Morph MIR memory-graph: ingests artifacts into a GNN-style node map (blueprint, chunks, functionality, patterns, insights), remembers by strengthening connections (+0.2 cap 1.0), and regenerates in exact (byte-honest integrity), equivalent, or morph_runtime mode — the latter reporting integrity 0 by design with an explicit missing list.',
  };

  constructor(options = {}) {
    const memory = options.state || new MorphMemoryEngine();
    let dispatch;
    super({
      id: 'morph-mir',
      address: { mode: 'macro', gate: 24, line: 1, color: 1, tone: 1, base: 1, planetaryDimension: 'Space' },
      states: STATES,
      alphabet: ['ingest', 'analyze', 'remember', 'regenerate', 'snapshot'],
      delta: (state, symbol) => DELTA_TABLE[`${state}|${symbol}`] || { to: state, transition: 'flow' },
      q0: 'ingest',
      // Each public operation can finish independently at its resting state.
      // Valid ingest/analyze/snapshot results must not be marked rejected.
      finals: ['ingest', 'analyze', 'remember', 'regenerate'],
      ports: MorphMirAutomaton.descriptor.ports,
      capabilities: MorphMirAutomaton.descriptor.capabilities,
      dimension: 'Space',
      implementation: (input, context) => dispatch(input, context),
    });
    this.ownedState = memory;
    dispatch = (input, context) => this.#dispatch(input, context);
  }

  #dispatch(rawInput, context = {}) {
    const input = normalizeInput(rawInput);
    const op = input.operation;
    const path = OP_PATHS[op];
    if (!path) throw new MorphMirError('UNKNOWN_OPERATION', String(op));
    for (const [from, symbol] of path) this.step(from, symbol, { tool: this.id });
    const engine = this.ownedState;
    switch (op) {
      case 'ingest': {
        const artifact = engine.ingest(input);
        return { artifactId: artifact.id, name: artifact.originalName, length: artifact.originalContent.length };
      }
      case 'analyze': return engine.analyze(input.artifactId);
      case 'remember': return engine.remember(input.artifactId);
      case 'regenerate': return engine.regenerate(input.artifactId, { mode: input.mode || 'morph_runtime' });
      case 'snapshot': return engine.snapshot();
      default: throw new MorphMirError('UNKNOWN_OPERATION', String(op));
    }
  }
}

export default MorphMirAutomaton;


