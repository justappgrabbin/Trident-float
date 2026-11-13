import { evaluateIR } from './predicate-ir.mjs';

function clone(value) {
  return structuredClone(value);
}

export class StateMachine {
  constructor(definition, capabilities = {}) {
    if (!definition?.id) throw new TypeError('machine definition requires id');
    if (!definition?.initial) throw new TypeError('machine definition requires initial state');
    this.definition = clone(definition);
    this.capabilities = { ...capabilities };
    this.state = definition.initial;
    this.data = clone(definition.data ?? {});
    this.sequence = 0;
    this.history = [];
    this.queue = [];
    this.processing = false;
  }

  registerCapability(name, fn) {
    if (typeof fn !== 'function') throw new TypeError(`capability ${name} must be a function`);
    this.capabilities[name] = fn;
    return this;
  }

  snapshot() {
    return clone({
      machineId: this.definition.id,
      version: this.definition.version ?? 1,
      state: this.state,
      data: this.data,
      sequence: this.sequence,
      history: this.history,
      queue: this.queue,
    });
  }

  restore(snapshot) {
    if (snapshot.machineId !== this.definition.id) {
      throw new Error(`snapshot belongs to ${snapshot.machineId}, expected ${this.definition.id}`);
    }
    this.state = snapshot.state;
    this.data = clone(snapshot.data);
    this.sequence = snapshot.sequence ?? 0;
    this.history = clone(snapshot.history ?? []);
    this.queue = clone(snapshot.queue ?? []);
    return this;
  }

  async send(event) {
    const normalized = typeof event === 'string' ? { type: event } : clone(event);
    if (!normalized?.type) throw new TypeError('event requires type');
    this.queue.push(normalized);
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length) await this.#step(this.queue.shift());
    } finally {
      this.processing = false;
    }
  }

  async #step(event) {
    const from = this.state;
    const env = { state: this.state, data: this.data, event };
    const candidates = (this.definition.transitions ?? []).filter((t) => {
      const stateMatches = t.from === '*' || t.from === from || (Array.isArray(t.from) && t.from.includes(from));
      return stateMatches && t.event === event.type;
    });

    let chosen = null;
    for (const transition of candidates) {
      const ok = transition.guard === undefined
        ? true
        : typeof transition.guard === 'function'
          ? await transition.guard(env)
          : Boolean(evaluateIR(transition.guard, env));
      if (ok) { chosen = transition; break; }
    }

    if (!chosen) {
      this.history.push({
        seq: ++this.sequence, type: 'rejected', from, event: clone(event), timestamp: Date.now(),
      });
      return { accepted: false, state: this.state };
    }

    const previousData = clone(this.data);
    if (chosen.assign) {
      const patch = typeof chosen.assign === 'function'
        ? await chosen.assign({ state: from, data: clone(this.data), event: clone(event) })
        : Object.fromEntries(Object.entries(chosen.assign).map(([k, expr]) => [k, evaluateIR(expr, env)]));
      Object.assign(this.data, patch ?? {});
    }

    this.state = chosen.to ?? from;
    const record = {
      seq: ++this.sequence,
      type: 'transition',
      from,
      to: this.state,
      event: clone(event),
      dataBefore: previousData,
      dataAfter: clone(this.data),
      transitionId: chosen.id ?? null,
      timestamp: Date.now(),
      effects: [],
    };
    this.history.push(record);

    for (const effectSpec of chosen.effects ?? []) {
      const spec = typeof effectSpec === 'string' ? { use: effectSpec } : effectSpec;
      const fn = this.capabilities[spec.use];
      if (!fn) throw new Error(`unregistered effect capability: ${spec.use}`);
      try {
        const result = await fn({
          machine: this,
          state: this.state,
          data: this.data,
          event,
          args: spec.args ?? {},
        });
        record.effects.push({ use: spec.use, ok: true, result: clone(result) });
        for (const emitted of result?.emit ?? []) this.queue.push(clone(emitted));
      } catch (error) {
        record.effects.push({ use: spec.use, ok: false, error: String(error?.stack ?? error) });
        if (chosen.onEffectError?.event) {
          this.queue.push({ type: chosen.onEffectError.event, error: String(error?.message ?? error) });
        } else {
          throw error;
        }
      }
    }

    return { accepted: true, state: this.state, record };
  }
}

