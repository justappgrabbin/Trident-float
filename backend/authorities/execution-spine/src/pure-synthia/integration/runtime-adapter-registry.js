/**
 * RuntimeAdapterRegistry
 *
 * Browser execution is universal by composition, not by pretending every
 * language is JavaScript. Each runtime adapter owns one execution domain and
 * reports the engine that actually ran the artifact.
 *
 * Adapter contract:
 * {
 *   id: string,
 *   kinds: string[],
 *   canRun({artifact, kind, context}): boolean|Promise<boolean>,
 *   prepare?({artifact, kind, context}): any|Promise<any>,
 *   execute({artifact, kind, context, prepared}): ExecutionResult|Promise<ExecutionResult>
 * }
 */
export class RuntimeAdapterRegistry {
  constructor(adapters = []) {
    this.adapters = [];
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter) {
    if (!adapter || typeof adapter.id !== 'string' || !adapter.id) {
      throw new TypeError('Runtime adapter requires a non-empty id');
    }
    if (typeof adapter.execute !== 'function') {
      throw new TypeError(`Runtime adapter ${adapter.id} requires execute()`);
    }
    const normalized = {
      ...adapter,
      kinds: Array.isArray(adapter.kinds) ? [...new Set(adapter.kinds.map(String))] : [],
    };
    const i = this.adapters.findIndex(x => x.id === normalized.id);
    if (i >= 0) this.adapters.splice(i, 1, normalized);
    else this.adapters.push(normalized);
    return normalized;
  }

  unregister(id) {
    const i = this.adapters.findIndex(x => x.id === id);
    if (i < 0) return false;
    this.adapters.splice(i, 1);
    return true;
  }

  list() {
    return this.adapters.map(({ id, kinds = [] }) => ({ id, kinds:[...kinds] }));
  }

  async resolve({ artifact, kind, context = {} }) {
    for (const adapter of this.adapters) {
      if (adapter.kinds?.length && !adapter.kinds.includes(kind) && !adapter.kinds.includes('*')) continue;
      if (typeof adapter.canRun === 'function' && !(await adapter.canRun({ artifact, kind, context }))) continue;
      return adapter;
    }
    return null;
  }

  async execute({ artifact, kind, context = {} }) {
    const adapter = await this.resolve({ artifact, kind, context });
    if (!adapter) return null;
    const prepared = typeof adapter.prepare === 'function'
      ? await adapter.prepare({ artifact, kind, context })
      : undefined;
    const result = await adapter.execute({ artifact, kind, context, prepared });
    return {
      adapterId: adapter.id,
      kind,
      result: normalizeExecutionResult(result, adapter.id),
    };
  }
}

export function normalizeExecutionResult(result, engine) {
  if (result && typeof result === 'object' && 'ok' in result) {
    return { engine: result.engine || engine, stdout: [], stderr: [], ...result };
  }
  return { ok:true, engine, stdout:[], stderr:[], returnValue:result };
}

export function createRuntimeAdapterRegistry(adapters = []) {
  return new RuntimeAdapterRegistry(adapters);
}

export default RuntimeAdapterRegistry;

