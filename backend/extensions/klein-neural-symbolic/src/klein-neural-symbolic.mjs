/** Additive Klein-witnessed symbolic program executor. Never substitutes addresses or factories. */
const copy = (x) => structuredClone(x);
function resolveInput(value, completed) {
  if (Array.isArray(value)) return value.map((item) => resolveInput(item, completed));
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof value.$result === 'string') {
      if (!completed.has(value.$result)) throw new Error('UNRESOLVED_RESULT:' + value.$result);
      return copy(completed.get(value.$result));
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolveInput(child, completed)]));
  }
  return value;
}
export class KleinNeuralSymbolicBridge {
  constructor({ assembly, validateCanonicalAddress, neuralNetBuilder = null, modelMaker = null, foundry = null, authorize = null } = {}) {
    if (typeof assembly?.klein?.evaluate !== 'function' || typeof assembly.invoke !== 'function') {
      throw new TypeError('A live UnifiedSynthiaAssembly with KleinContextRuntime is required');
    }
    if (typeof validateCanonicalAddress !== 'function') throw new TypeError('Canonical address validator required');
    this.assembly = assembly;
    this.validateAddress = validateCanonicalAddress;
    this.authorize = authorize;
    this.capabilities = new Map();
    this.receipts = [];
    this.register('mesh.invoke', async ({ toolId, input }, context) => {
      if (typeof toolId !== 'string' || !toolId) throw new TypeError('mesh.invoke requires toolId');
      return assembly.invoke(toolId, input, { address: context.address, source: 'klein-neural-symbolic' });
    }, { sideEffect: true });
    if (typeof neuralNetBuilder === 'function') this.register('neural.build', neuralNetBuilder, { sideEffect: true });
    if (typeof modelMaker === 'function') this.register('model.train', modelMaker, { sideEffect: true });
    if (typeof foundry === 'function') this.register('foundry.build', foundry, { sideEffect: true });
  }
  register(name, execute, { sideEffect = false } = {}) {
    if (typeof name !== 'string' || !name || typeof execute !== 'function')
      throw new TypeError('Registered capabilities need a name and executable function');
    if (this.capabilities.has(name)) throw new Error('DUPLICATE_CAPABILITY:' + name);
    this.capabilities.set(name, Object.freeze({ execute, sideEffect: Boolean(sideEffect) }));
  }
  async execute({ intent, address, steps, context = {}, autonomy = 'manual' } = {}) {
    this.validateAddress(address);
    if (typeof intent !== 'string' || !intent.trim()) throw new TypeError('Intent is required');
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > 26)
      throw new RangeError('A program must have 1..26 executable steps');
    if (!['manual', 'permissioned'].includes(autonomy)) throw new RangeError('Unknown autonomy mode');
    const ids = new Set();
    for (const step of steps) {
      if (!step || typeof step.id !== 'string' || !/^[a-z][a-z0-9_-]*$/i.test(step.id) || ids.has(step.id))
        throw new Error('Steps need distinct, safe IDs');
      ids.add(step.id);
      if (!this.capabilities.has(step.op)) throw new Error('CAPABILITY_NOT_CONNECTED:' + step.op);
    }
    const witness = this.assembly.klein.evaluate({
      nodeId: 'neural-symbolic-program', eventType: 'program-execution',
      address, dimension: address.dimension, context: { ...context, intent },
      invocations: [
        { toolId: 'autoling', input: { operation: 'pipeline', text: intent } },
        { toolId: 'diseminer', input: { operation: 'extract', text: intent, source: 'neural-symbolic-program' } },
      ],
    });
    const errors = (witness.perInvocation ?? []).filter((x) => x.error);
    if (errors.length) throw new Error('KLEIN_EVALUATION_FAILED:' + errors.map((x) => x.error).join(';'));
    if (witness.result?.direction === 'away' || (witness.perInvocation ?? []).some((x) => x.accepted === false))
      throw new Error('KLEIN_CONTEXT_REJECTED');
    const results = new Map();
    const execution = [];
    for (const step of steps) {
      const capability = this.capabilities.get(step.op);
      try {
        const input = resolveInput(step.input ?? null, results);
        if (capability.sideEffect &&
            (typeof this.authorize !== 'function' ||
             await this.authorize({ op: step.op, id: step.id, input, address, autonomy, witness }) !== true))
          throw new Error('OWNER_AUTHORIZATION_REQUIRED:' + step.op);
        const output = await capability.execute(input, { address, context, witness, previous: Object.fromEntries(results) });
        if (output === undefined) throw new Error('NO_EXECUTION_RESULT:' + step.op);
        results.set(step.id, copy(output));
        execution.push({ id: step.id, op: step.op, ok: true });
      } catch (error) {
        execution.push({ id: step.id, op: step.op, ok: false, error: String(error.message || error) });
        const receipt = { ok: false, address: copy(address), intent, kleinEvaluationId: witness.evaluationId, execution };
        this.receipts.push(copy(receipt));
        return receipt;
      }
    }
    const receipt = {
      ok: true, address: copy(address), intent, kleinEvaluationId: witness.evaluationId,
      execution, output: copy(results.get(steps.at(-1).id)),
    };
    this.receipts.push(copy(receipt));
    return receipt;
  }
}

