import test from 'node:test';
import assert from 'node:assert/strict';
import { createSwarmMorphingRuntime, auditOverlaySkin } from '../src/swarm-morph-runtime.mjs';
import { encodePng } from '../extensions/generative-reconstruction/src/image.mjs';

const address = () => ({
  planetary: 1, dimension: 'Movement', gate: 3, line: 1, color: 1, tone: 1,
  base: 1, degree: { band: 1, subdivision: 1, structure: '5-of-29' },
  minute: 0, second: 0, arcAxis: { arcUnit: 1, axis: 'Vertical' }, zodiac: 1, house: 1,
});
function harness({ authorize = async () => true, neuralNetBuilder = null } = {}) {
  const witnessed = [];
  const assembly = {
    klein: { evaluate: (request) => {
      witnessed.push(request);
      return { evaluationId: 'witness-1', perInvocation: [], result: { direction: 'toward' } };
    } },
    invoke: (tool, input) => ({ derivation: { tool, output: input } }),
    structure: (subject, context) => ({ subject, context, ok: true }),
  };
  return { witnessed, swarm: createSwarmMorphingRuntime({ assembly, authorize, neuralNetBuilder,
    actionRegistry: ['launch-editor'] }) };
}
test('structural analysis delegates to the existing authority', () => {
  const { swarm } = harness();
  const result = swarm.inspect({ text: 'meaning in position' }, { view: 'being' });
  assert.equal(result.context.addressMode, 'structural');
  assert.deepEqual(swarm.primitives, ['tool-factory', 'neural-net-maker', 'model-maker', 'foundry']);
});
test('swarm never executes with an unresolved canonical address', async () => {
  const { swarm } = harness({ neuralNetBuilder: async () => ({ ok: true }) });
  assert.throws(() => swarm.execute({ intent: 'build', address: { gate: 3 },
    steps: [{ id: 'net', op: 'neural.build', input: {} }] }), /missing canonical address field/);
});
test('factory formation is Klein witnessed and owner gated', async () => {
  const { swarm, witnessed } = harness({ neuralNetBuilder: async (input) => ({ layers: input.layers }) });
  const result = await swarm.execute({ intent: 'assemble network', address: address(), steps:
    [{ id: 'net', op: 'neural.build', input: { layers: 2 } }] });
  assert.equal(result.ok, true);
  assert.equal(result.output.layers, 2);
  assert.equal(witnessed.length, 1);
  assert.equal(swarm.receipts().length, 1);
  const denied = harness({ authorize: async () => false, neuralNetBuilder: async () => ({}) });
  const out = await denied.swarm.execute({ intent: 'assemble network', address: address(),
    steps: [{ id: 'net', op: 'neural.build', input: {} }] });
  assert.equal(out.ok, false);
  assert.match(out.execution[0].error, /OWNER_AUTHORIZATION_REQUIRED/);
});
test('image formation executes a real image codec, stores layers and reconstructs', async () => {
  const { swarm } = harness();
  const img = { width: 16, height: 16, data: new Uint8Array(16 * 16 * 4) };
  for (let p = 0; p < 256; p++) img.data.set([p % 255, (p * 2) % 255, 100, 255], p * 4);
  const png = Array.from(encodePng(img));
  const saved = await swarm.execute({ intent: 'store source pixels', address: address(),
    steps: [{ id: 'saved', op: 'image.store', input: { name: 'source', bytes: png } }] });
  assert.equal(saved.ok, true);
  const restored = await swarm.execute({ intent: 'reconstruct layers', address: address(),
    steps: [{ id: 'image', op: 'image.reconstruct', input: { address: saved.output.address } }] });
  assert.equal(restored.ok, true);
  assert.equal(restored.output.image.width, 16);
  assert.ok(restored.output.used.length > 0);
});
test('Euclidean relation executes without inventing a gate', async () => {
  const { swarm } = harness();
  const result = await swarm.execute({ intent: 'construct an equilateral triangle', address: address(),
    steps: [{ id: 'shape', op: 'geometry.construct', input: { a: { x: 1, y: 1 }, b: { x: 5, y: 1 } } }] });
  assert.equal(result.ok, true);
  assert.equal(result.output.proof.valid, true);
  assert.equal(result.output.address, null);
});
test('overlay quality detects broken behavior and never claims visual fidelity', () => {
  const good = auditOverlaySkin({ width: 400, height: 800, elements: [
    { id: 'launch', x: 12, y: 20, width: 80, height: 50,
      interactive: true, actionId: 'launch-editor', text: 'Open', textColor: '#ffffff', backgroundColor: '#16121e' },
  ] }, { actionRegistry: ['launch-editor'] });
  assert.deepEqual(good.issues, []);
  assert.equal(good.ready, false);
  const bad = auditOverlaySkin({ width: 100, height: 100, elements: [
    { id: 'x', x: 90, y: 80, width: 25, height: 20,
      interactive: true, actionId: 'missing', text: 'x', textColor: '#999999', backgroundColor: '#999999' },
  ] }, { actionRegistry: ['launch-editor'] });
  assert.ok(bad.issues.some(s => s.includes('clipped')));
  assert.ok(bad.issues.some(s => s.includes('touch target')));
  assert.ok(bad.issues.some(s => s.includes('not registered')));
  assert.ok(bad.issues.some(s => s.includes('contrast')));
});
test('model training remains owner gated', async () => {
  const { swarm } = harness({ authorize: async () => false });
  const result = await swarm.execute({ intent: 'train image model', address: address(),
    steps: [{ id: 'train', op: 'model.train', input: { name: 'skin', pairs: [], options: { size: 4 } } }] });
  assert.equal(result.ok, false);
  assert.match(result.execution[0].error, /OWNER_AUTHORIZATION_REQUIRED/);
});

