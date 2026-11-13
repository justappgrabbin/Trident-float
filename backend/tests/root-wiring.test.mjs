import test from 'node:test';
import assert from 'node:assert/strict';
import { UnifiedSynthiaAssembly } from '../src/unified-synthia-assembly.mjs';

test('root assembles the Klein-connected spine and every trainable organ', () => {
  const root = new UnifiedSynthiaAssembly();
  const audit = root.wiringAudit();
  assert.equal(audit.ok, true);
  assert.equal(audit.root, 'UnifiedSynthiaAssembly');
  assert.equal(audit.spine.ok, true);
  assert.equal(audit.spine.kleinContextRuntime, true);
  assert.equal(audit.spine.kleinMissingOperators.length, 0);
  assert.equal(audit.organs.registry, true);
  assert.equal(audit.organs.bookIngest, true);
  assert.equal(audit.organs.sentenceMesh, true);
  assert.equal(audit.organs.scientist, true);
  assert.equal(audit.organs.trainingJournal, true);
  assert.equal(audit.organs.liveAutolingExtractor, true);
  assert.equal(audit.organs.liveDiseminerExtractor, true);
  assert.equal(audit.addressBoundary.policy, 'preserve-both-no-silent-conversion');
});

test('root chat carries one witnessed Klein evaluation into the training journal', async () => {
  const root = new UnifiedSynthiaAssembly();
  const out = await root.chat('connect this sentence through the live system', {
    grammarB: { peer: 'rule' },
  });
  assert.equal(out.ok, true);
  assert.ok(out.contact.kleinEvaluation);
  assert.ok(out.trainingRecordId);
  const training = root.training.records.at(-1);
  assert.equal(training.metadata.kleinEvaluationId, out.contact.kleinEvaluation.evaluationId);
  assert.deepEqual(training.toolPath, out.contact.kleinEvaluation.activeToolIds);
  assert.equal(training.success, true);
});

test('root tool invocation uses the same intake + Klein + provenance path', () => {
  const root = new UnifiedSynthiaAssembly();
  const out = root.invoke('diseminer', { operation: 'observe', text: 'root invocation' });
  assert.ok(out.derivation.intakeId);
  assert.ok(out.derivation.kleinEvaluation);
  assert.equal(out.derivation.kleinEvaluation.activeToolIds[0], 'diseminer');
  const training = root.training.records.at(-1);
  assert.equal(training.metadata.kleinEvaluationId, out.derivation.kleinEvaluation.evaluationId);
});

test('book ingestion uses live AutoLing and DISEMINER via engine.invoke and then shares fragments to the mesh', () => {
  const root = new UnifiedSynthiaAssembly();
  const before = root.klein.ledger().length;
  const out = root.ingestBook({
    sourceId: 'source-1',
    title: 'Test Source',
    dimension: 'Movement',
    text: 'First source sentence.\n\nSecond source sentence.',
    addressResolver: ({ index }) => ({
      planetary: 1,
      dimension: 'Movement',
      gate: index + 1,
      line: 1,
      color: 1,
      tone: 1,
      base: 1,
      degree: 0,
      minute: 0,
      second: 0,
      arc: 0,
      zodiac: 1,
      house: 1,
    }),
  });
  assert.equal(out.fragments.length, 2);
  assert.ok(out.kleinEvaluations.length >= 4); // AutoLing + DISEMINER for each fragment
  assert.ok(root.klein.ledger().length > before);
  assert.equal(out.shared.deliveries.length, root.mesh.automata.size);
  assert.ok(out.fragments.every((f) => f.extracted.autoling?.kleinEvaluationId));
  assert.ok(out.fragments.every((f) => f.extracted.diseminer?.kleinEvaluationId));
  const training = root.training.records.at(-1);
  assert.ok(training.toolPath.includes('autoling'));
  assert.ok(training.toolPath.includes('diseminer'));
});

test('root preserves address authority boundary instead of silently converting arc <-> arcAxis', () => {
  const root = new UnifiedSynthiaAssembly();
  const audit = root.wiringAudit();
  assert.equal(audit.addressBoundary.identical, false);
  assert.ok(audit.addressBoundary.executionFields.includes('arcAxis'));
  assert.ok(audit.addressBoundary.trainingFields.includes('arc'));
});

