/**
 * RuntimeAdapterRegistry
 *
 * A runtime adapter executes the ORIGINAL artifact in its own execution domain.
 * Adapters do not rewrite foreign code to JavaScript and then call it native.
 *
 * Adapter contract:
 * {
 *   id: string,
 *   kinds?: string[],
 *   canRun?({ artifact, kind, context }): boolean | Promise<boolean>,
 *   prepare?({ artifact, kind, context }): any | Promise<any>,
 *   execute({ artifact, kind, context, prepared }): any | Promise<any>
 * }
 */
export class RuntimeAdapterRegistry {
  constructor(adapters = []) {
    this.adapters = [];
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter) {
    if (!adapter || typeof adapter.id !== 'string' || !adapter.id.trim()) {
      throw new TypeError('runtime adapter requires a non-empty id');
    }
    if (typeof adapter.execute !== 'function') {
      throw new TypeError(`runtime adapter ${adapter.id} requires execute()`);
    }
    const normalized = {
      ...adapter,
      id: adapter.id.trim(),
      kinds: Array.isArray(adapter.kinds)
        ? [...new Set(adapter.kinds.map((x) => String(x).toLowerCase()))]
        : [],
    };
    const index = this.adapters.findIndex((item) => item.id === normalized.id);
    if (index >= 0) this.adapters.splice(index, 1, normalized);
    else this.adapters.push(normalized);
    return normalized;
  }

  unregister(id) {
    const index = this.adapters.findIndex((item) => item.id === id);
    if (index < 0) return false;
    this.adapters.splice(index, 1);
    return true;
  }

  list() {
    return this.adapters.map(({ id, kinds = [] }) => ({ id, kinds: [...kinds] }));
  }

  async resolve({ artifact, kind, context = {} }) {
    const normalizedKind = String(kind || 'unknown').toLowerCase();
    for (const adapter of this.adapters) {
      if (adapter.kinds.length && !adapter.kinds.includes(normalizedKind) && !adapter.kinds.includes('*')) continue;
      if (typeof adapter.canRun === 'function') {
        const accepted = await adapter.canRun({ artifact, kind: normalizedKind, context });
        if (!accepted) continue;
      }
      return adapter;
    }
    return null;
  }

  async execute({ artifact, kind, context = {} }) {
    const normalizedKind = String(kind || 'unknown').toLowerCase();
    const adapter = await this.resolve({ artifact, kind: normalizedKind, context });
    if (!adapter) return null;
    const prepared = typeof adapter.prepare === 'function'
      ? await adapter.prepare({ artifact, kind: normalizedKind, context })
      : undefined;
    const value = await adapter.execute({ artifact, kind: normalizedKind, context, prepared });
    return {
      adapterId: adapter.id,
      kind: normalizedKind,
      result: normalizeExecutionResult(value, adapter.id),
    };
  }
}

export function normalizeExecutionResult(value, engine) {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'ok')) {
    return {
      engine: value.engine || engine,
      stdout: [],
      stderr: [],
      ...value,
    };
  }
  return { ok: true, engine, stdout: [], stderr: [], returnValue: value };
}

const EXTENSION_KIND = new Map([
  ['js', 'javascript'], ['mjs', 'javascript'], ['cjs', 'javascript'], ['jsx', 'javascript'],
  ['ts', 'typescript'], ['mts', 'typescript'], ['cts', 'typescript'], ['tsx', 'typescript'],
  ['py', 'python'], ['pyw', 'python'], ['rb', 'ruby'], ['lua', 'lua'], ['php', 'php'],
  ['sh', 'shell'], ['bash', 'shell'], ['zsh', 'shell'], ['fish', 'shell'],
  ['wasm', 'wasm'], ['wat', 'wat'], ['html', 'html'], ['htm', 'html'],
  ['json', 'json'], ['jsonl', 'jsonl'], ['csv', 'csv'], ['xml', 'xml'], ['yaml', 'yaml'], ['yml', 'yaml'],
  ['zip', 'archive'], ['tar', 'archive'], ['gz', 'archive'], ['tgz', 'archive'], ['7z', 'archive'],
  ['jar', 'jvm'], ['class', 'jvm'], ['java', 'java'], ['kt', 'kotlin'],
  ['cs', 'csharp'], ['fs', 'fsharp'], ['go', 'go'], ['rs', 'rust'], ['c', 'c'], ['h', 'c'],
  ['cc', 'cpp'], ['cpp', 'cpp'], ['cxx', 'cpp'], ['hpp', 'cpp'], ['swift', 'swift'],
]);

export function detectArtifactKind(artifact = {}) {
  if (artifact.kind) return String(artifact.kind).toLowerCase();
  if (artifact.type === 'folder' || Array.isArray(artifact.entries)) return 'folder';
  const name = String(artifact.name || artifact.path || artifact.filename || '').toLowerCase();
  const base = name.split(/[\\/]/).pop() || '';
  if (base === 'package.json') return 'node-project';
  if (base === 'pyproject.toml' || base === 'requirements.txt' || base === 'setup.py') return 'python-project';
  if (base === 'cargo.toml') return 'rust-project';
  if (base === 'go.mod') return 'go-project';
  if (base === 'pom.xml' || base === 'build.gradle' || base === 'build.gradle.kts') return 'jvm-project';
  const dot = base.lastIndexOf('.');
  if (dot >= 0) return EXTENSION_KIND.get(base.slice(dot + 1)) || 'unknown';
  return 'unknown';
}

export function createRuntimeAdapterRegistry(adapters = []) {
  return new RuntimeAdapterRegistry(adapters);
}

