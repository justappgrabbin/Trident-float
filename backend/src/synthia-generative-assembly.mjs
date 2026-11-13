import { createSwarmMorphingRuntime } from './swarm-morph-runtime.mjs';
import { TOOL_REGISTRY } from '../authorities/execution-spine/src/pure-synthia/automata/registry.js';
import { SOURCE_TOOL_CLASSES } from './klein-source-tools.mjs';
import { KleinToolState } from './klein-tool-state.mjs';
import { UnifiedSynthiaAssembly } from './unified-synthia-assembly.mjs';
import { recognizeStructure, RECOGNITION_TOOLS } from './structural-recognition.mjs';
import { toolOntology } from '../authorities/execution-spine/src/pure-synthia/engine/triples.js';
import { GenerativeMorphologyAutomaton } from './generative-morphology-automaton.mjs';

const clone = (value) => {
  try { return structuredClone(value); }
  catch { try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); } }
};

function pickAddresses(context = {}, input = null, fallback = []) {
  const candidates = [
    input?.addresses,
    context.morphologyAddresses,
    context.addresses,
    context.canonicalAddresses,
  ];
  for (const value of candidates) if (Array.isArray(value) && value.length) return clone(value);
  if (context.canonicalAddress && typeof context.canonicalAddress === 'object') return [clone(context.canonicalAddress)];
  return clone(fallback);
}

function mergeMeshState(existing, morphologyOutput) {
  const summary = morphologyOutput?.summary ?? {};
  return {
    ...(existing && typeof existing === 'object' ? clone(existing) : {}),
    activation: Number(summary.dominantStrength ?? existing?.activation ?? 0),
    generativeMorphology: clone(summary),
    structuralMorphology: clone(morphologyOutput?.snapshot?.structure ? {
      observer: morphologyOutput.snapshot.structure.view.observer,
      sourceView: morphologyOutput.snapshot.structure.view.view,
      matches: morphologyOutput.snapshot.structure.matches,
      recognition: morphologyOutput.snapshot.structure.recognition,
      toolState: morphologyOutput.snapshot.toolState,
      space: morphologyOutput.snapshot.structure.space,
    } : null),
  };
}

/**
 * Pure Synthia v0.4.2 + additive Generative Address & Morphology organ.
 *
 * Existing authorities are not rewritten. The new organ mounts onto their
 * live AutomataMesh and uses the same intake, Klein, provenance and training
 * paths as every other invoked organ.
 */
export class SynthiaGenerativeAssembly extends UnifiedSynthiaAssembly {
  constructor(options = {}) {
    super(options);
    this.activeMorphologyAddresses = clone(options.morphologyAddresses ?? []);
    this.morphologyAutomaton = new GenerativeMorphologyAutomaton(options.morphology ?? {});
    for (const Tool of SOURCE_TOOL_CLASSES) {
      const tool = new Tool();
      this.engine.mesh.register(tool);this.engine.tools.push(tool);this.engine.toolsById.set(tool.id,tool);
      this.engine.tripleStore.addAll(toolOntology(tool));
    }
    this.kleinToolCatalog = Object.freeze([...TOOL_REGISTRY,...SOURCE_TOOL_CLASSES.map(T=>T.descriptor)]);
    this.toolState = new KleinToolState(this.kleinToolCatalog);
    this.engine.sharedStateProvider = () => this.toolState.snapshot();
    this.#mountMorphology();
    this.generativeMorphology.sharedToolState = this.toolState;
    this.toolSubscriptions = new Map();
    for (const descriptor of this.kleinToolCatalog) {
      const tool=this.engine.mesh.get(descriptor.id);
      const stopContext=tool.provideContext((input,context)=>({stateSpace:context.stateSpace ?? this.toolState.snapshot()}));
      const stopResults=tool.observeRuns((input,result,context)=>this.toolState.record(tool.id,input,result,context));
      this.toolSubscriptions.set(tool.id,{stopContext,stopResults});
    }
  }

  createSwarmRuntime(options = {}) {
    return createSwarmMorphingRuntime({ assembly: this, ...options });
  }

  get generativeMorphology() { return this.morphologyAutomaton.morphology; }

  #mountMorphology() {
    const a = this.morphologyAutomaton;
    this.engine.mesh.register(a);
    this.engine.tools.push(a);
    this.engine.toolsById.set(a.id, a);
    this.engine.tripleStore.addAll(toolOntology(a));

    const links = [
      ['diseminer', a.id, 'meaning-to-morphology'],
      ['autoling', a.id, 'language-to-morphology'],
      ['computational-grammar-coder', a.id, 'grammar-to-morphology'],
      ['klein-analogy', a.id, 'analogy-to-morphology'],
      ['morph-mir', a.id, 'artifact-morphology-contact'],
      ['research-browser', a.id, 'internet-to-morphology'],
      ['browser-form', a.id, 'browser-state-to-morphology'],
      [a.id, 'conversation', 'morphology-to-expression'],
      [a.id, 'research-browser', 'morphology-to-research'],
      [a.id, 'browser-form', 'morphology-to-browser-action'],
    ];
    if (this.engine.mesh.get('media-field')) {
      links.push(['media-field', a.id, 'media-to-morphology'], [a.id, 'media-field', 'morphology-to-media']);
    }
    for (const descriptor of this.kleinToolCatalog) {
      if (!links.some(([from,to])=>from===descriptor.id&&to===a.id)) links.push([descriptor.id,a.id,'tool-result-to-state']);
      links.push([a.id,descriptor.id,'state-context-to-tool']);
    }
    for (const [from, to, operator] of links) this.engine.mesh.connectTransport(from, to, { operator });
    this.engine.klein.syncOperators();
  }

  setMorphologyAddresses(addresses = []) {
    if (!Array.isArray(addresses)) throw new TypeError('addresses must be an array');
    this.activeMorphologyAddresses = clone(addresses);
    return this.activeMorphologyAddresses.length;
  }

  runToolTask(steps = [], context = {}) {
    if (!Array.isArray(steps) || steps.length > 32) throw new TypeError('tool task requires at most 32 steps');
    const runs=[];
    for (const step of steps) {
      if (!step || !this.kleinToolCatalog.some(d=>d.id===step.toolId)) throw new TypeError('task tool must belong to the Klein catalog');
      const input=clone(step.input ?? {});
      for (const [key,binding] of Object.entries(step.bindings ?? {})) {
        if (['__proto__','constructor','prototype'].includes(key) || !Number.isInteger(binding.step) || binding.step<0 || binding.step>=runs.length || !Array.isArray(binding.path)) throw new TypeError('binding must reference an earlier tool result');
        let value=runs[binding.step].derivation.output;
        for (const part of binding.path) {
          if (['__proto__','constructor','prototype'].includes(String(part)) || value==null || !Object.hasOwn(value,part)) throw new TypeError('binding path is missing from actual tool output');
          value=value[part];
        }
        input[key]=clone(value);
      }
      const result=super.invoke(step.toolId,input,{...context,source:'klein-tool-task'});
      runs.push(result);
      if (result.derivation.evaluation?.accepted===false || result.derivation.output?.ok===false) return {ok:false,runs,stateSpace:this.toolState.snapshot()};
    }
    return {ok:true,runs,stateSpace:this.toolState.snapshot()};
  }

  structure(subject = null, context = {}) {
    return this.morphology('structure', {subject,context,surface:'structural-analysis'});
  }

  morphology(operation = 'compile', { addresses = null, subject = null, context = {}, surface = null } = {}) {
    const resolved = Array.isArray(addresses) && addresses.length
      ? clone(addresses)
      : clone(this.activeMorphologyAddresses);
    // Invoke recognizers once at intake, outside morphology's Klein probes.
    // Output passes retain the input evidence rather than learn generated wording as observation.
    const recognition = ['chat-write','internet-write'].includes(operation)
      ? clone(context.meshState?.structuralMorphology?.recognition ?? null)
      : operation === 'status' ? null : recognizeStructure(subject, (toolId,input) =>
          super.invoke(toolId,input,{source:'structural-recognition',surface:surface ?? operation}));
    return super.invoke('generative-address-morphology', {
      operation,
      addresses: resolved,
      subject: clone(subject),
      surface: surface ?? operation,
      context: { ...clone(context), recognition },
    }, {
      ...context,
      dimension: context.dimension ?? null,
      meshState: context.meshState ?? null,
    });
  }

  /**
   * Explicit Klein-only chat form. This intentionally bypasses the additive
   * morphology pre/post passes while keeping Pure Synthia's existing private
   * Klein contact loop, provenance, training journal and conversation surface.
   */
  async chatKlein(message, context = {}) {
    return super.chat(message, { ...context, processingMode: 'klein' });
  }

  /**
   * Chat reads inward through morphology before the existing Klein contact
   * loop, then records an outward morphology pass over the resulting utterance.
   * Existing chat behavior is preserved; morphology enters Klein as live mesh
   * state rather than replacing conversation.
   */
  async chat(message, context = {}) {
    const addresses = pickAddresses(context, null, this.activeMorphologyAddresses);
    if (addresses.length) this.activeMorphologyAddresses = clone(addresses);

    const inward = this.morphology('chat-read', {
      addresses,
      subject: { kind: 'language-input', text: String(message ?? '') },
      context,
      surface: 'chat:read',
    });
    const inwardOutput = inward.derivation.output;
    const base = await super.chat(message, {
      ...context,
      meshState: mergeMeshState(context.meshState, inwardOutput),
    });
    const outward = this.morphology('chat-write', {
      addresses: inwardOutput?.snapshot?.addresses ?? addresses,
      subject: {
        kind: 'language-output',
        text: base.utterance,
        systemRecordId: base.recordId ?? null,
      },
      context: { ...context, meshState: mergeMeshState(context.meshState, inwardOutput) },
      surface: 'chat:write',
    });

    return {
      ...base,
      utterance: base.utterance,
      morphology: {
        inward: clone(inwardOutput),
        outward: clone(outward.derivation.output),
        policy: 'morphology-is-live-in-chat; base wording is preserved until exact addressed language transformation rules are source-supported',
      },
    };
  }

  /** Address/morphology-aware research-browser surface. */
  research(input = {}, context = {}) {
    return this.#internetSurface('research-browser', input, context);
  }

  /** Address/morphology-aware browser/form surface. */
  browser(input = {}, context = {}) {
    return this.#internetSurface('browser-form', input, context);
  }

  internet({ tool = 'research-browser', input = {}, addresses = null } = {}, context = {}) {
    if (!['research-browser', 'browser-form'].includes(tool)) {
      throw new Error(`internet tool must be research-browser or browser-form; got ${tool}`);
    }
    return this.#internetSurface(tool, { ...input, addresses: addresses ?? input.addresses }, context);
  }

  #internetSurface(toolId, input = {}, context = {}) {
    const addresses = pickAddresses(context, input, this.activeMorphologyAddresses);
    if (addresses.length) this.activeMorphologyAddresses = clone(addresses);
    const inward = this.morphology('internet-read', {
      addresses,
      subject: { kind: 'internet-input', toolId, input: clone(input) },
      context,
      surface: `${toolId}:read`,
    });
    const meshState = mergeMeshState(context.meshState, inward.derivation.output);
    const action = super.invoke(toolId, input, { ...context, meshState });
    const outward = this.morphology('internet-write', {
      addresses: inward.derivation.output?.snapshot?.addresses ?? addresses,
      subject: {
        kind: 'internet-output',
        toolId,
        output: clone(action.derivation.output),
        derivationId: action.derivation.id,
      },
      context: { ...context, meshState },
      surface: `${toolId}:write`,
    });
    return {
      ok: true,
      accepted: action.derivation.evaluation?.accepted !== false,
      toolId,
      action,
      morphology: { inward: clone(inward.derivation.output), outward: clone(outward.derivation.output) },
    };
  }

  wiringAudit() {
    const base = super.wiringAudit();
    const mounted = this.engine.mesh.get('generative-address-morphology');
    const transports = [...this.engine.mesh.transportConnections.values()];
    const has = (fromId, toId) => transports.some(x => x.fromId === fromId && x.toId === toId);
    const morphology = Object.freeze({
      mounted: Boolean(mounted),
      kleinWrapped: Boolean(this.engine.klein.operator('generative-address-morphology')),
      chatReadPath: has('diseminer', 'generative-address-morphology') && has('generative-address-morphology', 'conversation'),
      internetResearchPath: has('research-browser', 'generative-address-morphology') && has('generative-address-morphology', 'research-browser'),
      internetBrowserPath: has('browser-form', 'generative-address-morphology') && has('generative-address-morphology', 'browser-form'),
      recognitionTools: Object.fromEntries(RECOGNITION_TOOLS.map(id => [id, Boolean(this.engine.mesh.get(id) && this.engine.toolsById.get(id) && this.engine.klein.operator(id) && has(id, 'generative-address-morphology'))])),
      lastRecognitionStatus: this.generativeMorphology.snapshot()?.structure?.recognition?.status ?? 'not-invoked',
      allTools: Object.fromEntries(this.kleinToolCatalog.map(d=>[d.id,{
        registered:Boolean(this.engine.toolsById.get(d.id)),mounted:Boolean(this.engine.mesh.get(d.id)),
        kleinWrapped:Boolean(this.engine.klein.operator(d.id)),inputPath:has('generative-address-morphology',d.id),outputPath:has(d.id,'generative-address-morphology'),
        contextProvider:Boolean(this.engine.mesh.get(d.id)?.contextProviders.size),resultObserver:Boolean(this.engine.mesh.get(d.id)?.runObservers.size),
      }])),
      activeAddressCount: this.activeMorphologyAddresses.length,
    });
    return Object.freeze({ ...base, ok: base.ok && Object.values(morphology).slice(0,5).every(Boolean) && Object.values(morphology.recognitionTools).every(Boolean) && Object.values(morphology.allTools).every(t=>Object.values(t).every(Boolean)), morphology });
  }

  snapshot() {
    const base = super.snapshot();
    return {
      ...base,
      morphology: clone(this.generativeMorphology.snapshot()),
      activeMorphologyAddresses: clone(this.activeMorphologyAddresses),
    };
  }
}

export default SynthiaGenerativeAssembly;


