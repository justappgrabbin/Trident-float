import { evaluateIR } from './predicate-ir.mjs';
import { enumerateStateSpace, estimateStateSpace } from './state-space.mjs';

export class RealizationRegistry {
  constructor(options = {}) {
    this.realizers = new Map();
    this.functions = new Map();
    this.quickJS = options.quickJS ?? null;
    this.allowUnsafeHostEval = Boolean(options.allowUnsafeHostEval);

    this.register('expression-ir', async (spec, context) => evaluateIR(spec.expression, context));
    this.register('capability', async (spec, context) => {
      const fn = this.functions.get(spec.name);
      if (!fn) throw new Error(`unregistered capability: ${spec.name}`);
      return await fn(spec.input ?? context, context);
    });
    this.register('predicate-search', async (spec) => this.#predicateSearch(spec));
    this.register('quickjs', async (spec) => this.#quickJS(spec));
    this.register('host-js', async (spec, context) => this.#hostJS(spec, context));
  }

  register(name, fn) { this.realizers.set(name, fn); return this; }
  registerFunction(name, fn) { this.functions.set(name, fn); return this; }

  async execute(spec, context = {}) {
    if (!spec?.realizer) throw new TypeError('realization spec requires realizer');
    const fn = this.realizers.get(spec.realizer);
    if (!fn) throw new Error(`unknown realizer: ${spec.realizer}`);
    const started = Date.now();
    try {
      const value = await fn(spec, context);
      return { ok: true, realizer: spec.realizer, value, evidence: { elapsedMs: Date.now() - started } };
    } catch (error) {
      return { ok: false, realizer: spec.realizer, error: String(error?.stack ?? error), evidence: { elapsedMs: Date.now() - started } };
    }
  }

  async #predicateSearch(spec) {
    const estimate = estimateStateSpace(spec.stateSpace);
    const maxStates = spec.maxStates ?? 100000;
    const mode = spec.mode ?? 'all';
    const matches = [];
    let checked = 0;
    for (const state of enumerateStateSpace(spec.stateSpace, maxStates)) {
      checked++;
      if (Boolean(evaluateIR(spec.predicate, { state }))) {
        matches.push(structuredClone(state));
        if (mode === 'first') break;
        if (spec.limit && matches.length >= spec.limit) break;
      }
    }
    return { estimate: estimate.toString(), checked, matches };
  }

  async #quickJS(spec) {
    if (!this.quickJS?.eval) throw new Error('QuickJS adapter not installed. Supply { quickJS: { eval(code) } } to the registry.');
    const input = JSON.stringify(spec.input ?? null);
    const source = `globalThis.__SYNTHIA_INPUT__=${input};\n${spec.code}`;
    return await this.quickJS.eval(source);
  }

  async #hostJS(spec, context) {
    if (!this.allowUnsafeHostEval) {
      throw new Error('host-js is disabled by default; use QuickJS or explicitly enable allowUnsafeHostEval');
    }
    const fn = new Function('input', 'context', `"use strict";\n${spec.code}`);
    return await fn(spec.input, context);
  }
}

