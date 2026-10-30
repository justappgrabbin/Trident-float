import test from 'node:test';
import assert from 'node:assert/strict';
import { SynthiaGenerativeAssembly } from '../src/synthia-generative-assembly.mjs';

const addr = (id, gate, dimension='Being', extra={}) => ({
  id,
  planetary: 1,
  dimension,
  gate,
  line: 1,
  color: 1,
  tone: 1,
  base: 1,
  degree: { band: 1, subdivision: 1, structure: '5-of-29' },
  minute: 0,
  second: 0,
  arcAxis: { arcUnit: 1, axis: 'Vertical' },
  zodiac: 1,
  house: 1,
  active: true,
  phase: 0,
  amplitude: 1,
  coherence: 1,
  ...extra,
});

const mutation = [addr('g3', 3, 'Movement'), addr('g60', 60, 'Movement')];

test('cold-start Morph chat generates addresses from meaning and keeps subsequent subjects fresh', async () => {
  const root = new SynthiaGenerativeAssembly({ morphology: { engineOptions: { weightsFile: null } } });
  const first = await root.chat('Innovation ordering limitation acceptance', { seed: 7 });
  const inward = first.morphology.inward.snapshot;
  assert.equal(inward.generation.status, 'generated');
  assert.ok(inward.addresses.some(a => a.gate === 3));
  assert.ok(inward.addresses.some(a => a.gate === 60));
  assert.ok(inward.graphs.length);
  assert.deepEqual(first.morphology.outward.snapshot.addresses.map(a => a.id), inward.addresses.map(a => a.id));
  assert.ok(first.contact.kleinEvaluation);
  const second = await root.chat('Memory love light', { seed: 7 });
  assert.equal(second.morphology.inward.snapshot.generation.status, 'generated');
  assert.notDeepEqual(second.morphology.inward.snapshot.addresses.map(a => a.id), inward.addresses.map(a => a.id));
  assert.equal(root.activeMorphologyAddresses.length, 0);
});

test('research generates semantic addresses without caller-supplied coordinates', () => {
  const root = new SynthiaGenerativeAssembly({ morphology: { engineOptions: { weightsFile: null } } });
  const out = root.research({ operation: 'create', title: 'Innovation limitation', question: 'Ordering and acceptance' });
  assert.equal(out.morphology.inward.snapshot.generation.status, 'generated');
  assert.ok(out.morphology.inward.snapshot.addresses.length);
  assert.deepEqual(out.morphology.inward.snapshot.addresses, out.morphology.outward.snapshot.addresses);
});

test('the live Klein operator probes semantic generation without changing registry state', () => {
  const root = new SynthiaGenerativeAssembly({ morphology: { engineOptions: { weightsFile: null } } });
  root.generativeMorphology.generator.model.teach('zorbax', { 'meaning:innovation': 1 });
  const operator = root.engine.klein.operator('generative-address-morphology');
  const context = { input: { operation: 'compile', subject: { text: 'zorbax' } } };
  const before = root.generativeMorphology.snapshot();
  const first = operator(context);
  assert.deepEqual(operator(context), first);
  assert.equal(root.generativeMorphology.generator.registry.size, 0);
  assert.deepEqual(root.generativeMorphology.snapshot(), before);
  const actual = root.morphology('compile', { subject: { text: 'zorbax' } }).derivation.output;
  assert.equal(actual.snapshot.generation.status, 'generated');
  assert.ok(root.generativeMorphology.generator.registry.size > 0);
});

test('generative morphology mounts as a live mesh organ without replacing v0.4.2 organs', () => {
  const root = new SynthiaGenerativeAssembly({ morphologyAddresses: mutation });
  const audit = root.wiringAudit();
  assert.equal(audit.ok, true);
  assert.equal(audit.morphology.mounted, true);
  assert.equal(audit.morphology.kleinWrapped, true);
  assert.equal(audit.morphology.chatReadPath, true);
  assert.equal(audit.morphology.internetResearchPath, true);
  assert.equal(audit.morphology.internetBrowserPath, true);
  assert.ok(root.engine.mesh.get('conversation'));
  assert.ok(root.engine.mesh.get('research-browser'));
  assert.ok(root.engine.mesh.get('browser-form'));
});

test('chat reads inward through active addressed graph ecology and writes outward through morphology', async () => {
  const root = new SynthiaGenerativeAssembly({ morphologyAddresses: mutation });
  const out = await root.chat('What is active here?', { seed: 7 });
  assert.equal(out.ok, true);
  assert.equal(out.morphology.inward.summary.dominantEnergy, 'MUTATION');
  assert.equal(out.morphology.outward.summary.dominantEnergy, 'MUTATION');
  assert.ok(out.contact.kleinEvaluation);
  assert.equal(out.contact.kleinEvaluation.context.meshState.generativeMorphology.dominantEnergy, 'MUTATION');
  assert.equal(typeof out.utterance, 'string');
});

test('research browser uses the same morphology field rather than a separate interpretation stack', () => {
  const root = new SynthiaGenerativeAssembly({ morphologyAddresses: mutation });
  const out = root.research({ operation: 'create', title: 'Morphology Research', question: 'What does this graph support?' });
  assert.equal(out.ok, true);
  assert.equal(out.toolId, 'research-browser');
  assert.equal(out.morphology.inward.summary.dominantEnergy, 'MUTATION');
  assert.equal(out.morphology.outward.summary.dominantEnergy, 'MUTATION');
  assert.ok(out.action.derivation.kleinEvaluation);
  assert.equal(out.action.derivation.kleinEvaluation.context.meshState.generativeMorphology.dominantEnergy, 'MUTATION');
});

test('graph dissolves when its connection conditions stop being satisfied', () => {
  const root = new SynthiaGenerativeAssembly({ morphologyAddresses: mutation });
  const first = root.morphology('compile', { addresses: mutation }).derivation.output;
  assert.equal(first.summary.dominantEnergy, 'MUTATION');
  const changed = [mutation[0], { ...mutation[1], active: false }];
  const second = root.morphology('compile', { addresses: changed }).derivation.output;
  assert.equal(second.summary.activeGraphCount, 0);
  assert.equal(second.summary.dominantEnergy, null);
});

test('browser/form surface receives the same morphology field while retaining its existing consent gates', () => {
  const root = new SynthiaGenerativeAssembly({ morphologyAddresses: mutation });
  const out = root.browser({
    operation: 'inspect-page',
    page: { url: 'https://example.test/', title: 'Example', forms: [] },
  });
  assert.equal(out.ok, true);
  assert.equal(out.toolId, 'browser-form');
  assert.equal(out.morphology.inward.summary.dominantEnergy, 'MUTATION');
  assert.equal(out.morphology.outward.summary.dominantEnergy, 'MUTATION');
  assert.ok(out.action.derivation.kleinEvaluation);
  assert.equal(out.action.derivation.kleinEvaluation.context.meshState.generativeMorphology.dominantEnergy, 'MUTATION');
});


test('Klein chat form stays distinct from morphology chat form', async () => {
  const root = new SynthiaGenerativeAssembly({ morphologyAddresses: mutation });
  const klein = await root.chatKlein('Run the private Klein form.', { seed: 11 });
  assert.equal(klein.ok, true);
  assert.ok(klein.contact?.kleinEvaluation);
  assert.equal('morphology' in klein, false);

  const morph = await root.chat('Run the morphology form.', { seed: 11 });
  assert.equal(morph.ok, true);
  assert.ok(morph.contact?.kleinEvaluation);
  assert.equal(morph.morphology.inward.summary.dominantEnergy, 'MUTATION');
});


