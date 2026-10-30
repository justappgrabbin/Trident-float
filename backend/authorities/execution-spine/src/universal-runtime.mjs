import { RealizationRegistry } from './realizers.mjs';
import { StateMachine } from './state-machine.mjs';
import { executeDAG } from './dag-runtime.mjs';
import { verifyPredicateFaithfulness } from './semantic-verifier.mjs';
import { enumerateStateSpace } from './state-space.mjs';
import { RuntimeAdapterRegistry, detectArtifactKind } from './runtime-adapters.mjs';

export class UniversalRuntime {
  constructor(options = {}) {
    this.registry = options.registry ?? new RealizationRegistry(options);
    this.effects = { ...(options.effects ?? {}) };
    this.runtimeAdapters = options.runtimeAdapters instanceof RuntimeAdapterRegistry
      ? options.runtimeAdapters
      : new RuntimeAdapterRegistry(options.runtimeAdapters ?? []);
    this.snapshots = new Map();
  }

  registerFunction(name, fn) { this.registry.registerFunction(name, fn); return this; }
  registerRealizer(name, fn) { this.registry.register(name, fn); return this; }
  registerEffect(name, fn) { this.effects[name] = fn; return this; }
  registerRuntimeAdapter(adapter) { this.runtimeAdapters.register(adapter); return this; }
  unregisterRuntimeAdapter(id) { return this.runtimeAdapters.unregister(id); }
  listRuntimeAdapters() { return this.runtimeAdapters.list(); }

  createMachine(definition, extraCapabilities = {}) {
    return new StateMachine(definition, { ...this.effects, ...extraCapabilities });
  }

  persistMachine(machine, key = machine.definition.id) {
    const snapshot = machine.snapshot();
    this.snapshots.set(key, structuredClone(snapshot));
    return snapshot;
  }

  restoreMachine(machine, key = machine.definition.id) {
    const snapshot = this.snapshots.get(key);
    if (!snapshot) throw new Error(`no snapshot stored for ${key}`);
    machine.restore(snapshot);
    return machine;
  }

  async execute(spec, context = {}) {
    return await this.registry.execute(spec, context);
  }

  /**
   * Execute an artifact through a real registered runtime first.
   * If none can execute it, an explicit fallback realization may be supplied.
   * The fallback is reported as fallback; it is never mislabeled native execution.
   */
  async executeArtifact(artifact, options = {}) {
    const context = options.context ?? {};
    const kind = options.kind ?? detectArtifactKind(artifact);
    const started = Date.now();
    try {
      const native = await this.runtimeAdapters.execute({ artifact, kind, context });
      if (native) {
        return {
          ok: Boolean(native.result?.ok),
          path: 'registered-runtime',
          kind,
          runtimeAdapter: native.adapterId,
          result: native.result,
          evidence: { elapsedMs: Date.now() - started, originalArtifactExecuted: true },
        };
      }
      if (options.fallbackRealization) {
        const fallback = await this.execute(options.fallbackRealization, { ...context, artifact, kind });
        return {
          ok: Boolean(fallback.ok),
          path: 'fallback-realization',
          kind,
          runtimeAdapter: null,
          result: fallback,
          evidence: { elapsedMs: Date.now() - started, originalArtifactExecuted: false },
        };
      }
      return {
        ok: false,
        path: 'runtime-unavailable',
        kind,
        runtimeAdapter: null,
        error: `no registered runtime adapter can execute artifact kind: ${kind}`,
        evidence: { elapsedMs: Date.now() - started, originalArtifactExecuted: false },
      };
    } catch (error) {
      return {
        ok: false,
        path: 'runtime-error',
        kind,
        runtimeAdapter: null,
        error: String(error?.stack ?? error),
        evidence: { elapsedMs: Date.now() - started, originalArtifactExecuted: false },
      };
    }
  }

  async runGraph(nodes, options = {}) {
    return await executeDAG(nodes, async (node, dagContext) => {
      const result = await this.execute(node.realization, { ...options.context, dag: dagContext, node });
      if (!result.ok) throw new Error(result.error);
      return result;
    }, options);
  }

  async verify({ stateSpace, reference, candidate, maxStates = 100000 }) {
    return await verifyPredicateFaithfulness({
      states: enumerateStateSpace(stateSpace, maxStates), reference, candidate,
    });
  }
}

