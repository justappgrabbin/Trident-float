import test from 'node:test';
import assert from 'node:assert/strict';
import { SynthiaGenerativeAssembly } from '../src/synthia-generative-assembly.mjs';
import { analyzeStructure } from '../extensions/generative-address-morphology/src/core/structural-space.mjs';
const makeRoot=()=>new SynthiaGenerativeAssembly({morphology:{engineOptions:{weightsFile:null}}});
const snapshot=out=>out.derivation.output.snapshot;

test('all five recognition tools are mounted, Klein wrapped and connected to the state-space organ',()=>{
  const root=makeRoot();
  assert.deepEqual(root.wiringAudit().morphology.recognitionTools,{'autoling':true,'diseminer':true,'computational-grammar-coder':true,'klein-analogy':true,'morph-mir':true});
  const transports=root.engine.mesh.transportConnections;
  for(const [key,edge] of transports)if(edge.fromId==='klein-analogy'&&edge.toId==='generative-address-morphology')transports.delete(key);
  assert.equal(root.wiringAudit().morphology.recognitionTools['klein-analogy'],false);
  assert.equal(root.wiringAudit().ok,false);
});
test('actual recognition results arrive in the state space with root, Klein and training receipts',()=>{
  const root=makeRoot();
  const s=snapshot(root.structure({text:'Memory shapes structure.'}));
  const r=s.structure.recognition;
  assert.equal(r.status,'executed');
  assert.deepEqual(r.runs.map(r=>r.toolId),['autoling','computational-grammar-coder','diseminer','diseminer']);
  for(const run of r.runs){
    assert.ok(run.kleinEvaluationId);
    assert.ok(root.events.some(e=>e.id===run.rootEventId));
    assert.ok(root.training.records.some(t=>t.id===run.trainingRecordId));
  }
  assert.ok(r.runs.find(r=>r.toolId==='autoling').output.pipeline.morphology);
  assert.ok(r.runs.find(r=>r.toolId==='computational-grammar-coder').output);
  assert.ok(s.structure.space.interactions.some(e=>e.label==='shapes'&&e.source==='diseminer'));
  assert.ok(s.structure.space.interactions.every(e=>!['Speed','Material','Force','Position'].includes(e.label)));
  assert.equal(s.structure.space.status,'tool-recognized-relations');
});
test('changing the live recognizer output changes the relationship received by the state space',()=>{
  const root=makeRoot();
  const tool=root.engine.mesh.get('diseminer'),original=tool.implementation;
  tool.implementation=(input,ctx)=>input.operation==='extract'?{claims:[{id:'dynamic',subject:'alpha',predicate:'discovered-link',object:'beta',confidence:.4}],stats:{}}:original(input,ctx);
  const s=snapshot(root.structure('Alpha connects beta.'));
  assert.ok(s.structure.space.interactions.some(e=>e.label==='discovered-link'));
  assert.ok(!s.structure.space.interactions.some(e=>e.label==='connects'));
  tool.implementation=(input,ctx)=>input.operation==='extract'?{claims:[{id:'dynamic',subject:'alpha',predicate:'different-link',object:'beta',confidence:.4}],stats:{}}:original(input,ctx);
  const changed=snapshot(root.structure('Alpha connects beta.'));
  assert.ok(changed.structure.space.interactions.some(e=>e.label==='different-link'));
  assert.ok(!changed.structure.space.interactions.some(e=>e.label==='discovered-link'));
});
test('a missing or failed recognizer is reported and never replaced with reference relationships',()=>{
  const root=makeRoot();
  root.engine.mesh.get('autoling').implementation=()=>{throw new Error('recognizer unavailable');};
  const s=snapshot(root.structure('Mind Ego Body Individuality'));
  assert.equal(s.structure.recognition.status,'incomplete');
  assert.ok(s.structure.recognition.issues.some(e=>e.toolId==='autoling'));
  assert.ok(!s.structure.space.interactions.some(e=>e.label==='Speed'));
  assert.equal(s.structure.recognition.runs.find(r=>r.toolId==='autoling').status,'failed');
});
test('Boolean ATO is called over explicit named features and its actual completion reaches the state space',()=>{
  const root=makeRoot();
  const r=snapshot(root.structure({analogy:{vocab:['memory','structure','movement'],A:['memory'],B:['memory','structure'],C:['movement']}})).structure.recognition;
  assert.equal(r.status,'executed');
  assert.deepEqual(r.runs.find(r=>r.toolId==='klein-analogy').output.result,['structure','movement']);
  assert.ok(r.runs[0].kleinEvaluationId);
});
test('Morph-MIR analyzes an existing artifact through the same root path and forwards the real blueprint',()=>{
  const root=makeRoot();
  const ingested=root.invoke('morph-mir',{operation:'ingest',name:'sample.js',content:'export function hello() { return 1; }'});
  assert.equal(ingested.derivation.evaluation.accepted,true);
  const artifact=ingested.derivation.output.artifactId;
  const r=snapshot(root.structure({artifactId:artifact})).structure.recognition;
  assert.equal(r.status,'executed');
  assert.equal(r.runs[0].toolId,'morph-mir');
  assert.equal(r.runs[0].output.artifactId,artifact);
  assert.ok(r.runs[0].output.blueprint.exports.some(e=>e.includes('hello')));
  assert.equal(root.invoke('morph-mir',{operation:'snapshot'}).derivation.evaluation.accepted,true);
  assert.equal(root.invoke('morph-mir',{operation:'remember',artifactId:artifact}).derivation.evaluation.accepted,true);
  const reconstructed=root.invoke('morph-mir',{operation:'regenerate',artifactId:artifact,mode:'exact'});
  assert.equal(reconstructed.derivation.evaluation.accepted,true);
});
test('reference relationships require an explicit example; source word matches cannot invent a coupling',()=>{
  const implicit=analyzeStructure('Mind Ego Body Individuality');
  assert.deepEqual(implicit.space.interactions,[]);
  const explicit=analyzeStructure('Mind Ego Body Individuality',{example:'jut'});
  assert.ok(explicit.space.interactions.some(e=>e.label==='Speed'));
  assert.equal(explicit.space.derivation,'explicit reference example; not a recognized relationship');
});
test('chat passes input recognition into Klein and outward state without observing generated output again',async()=>{
  const root=makeRoot();
  const out=await root.chat('Memory shapes structure.');
  const recognition=out.morphology.inward.snapshot.structure.recognition;
  assert.equal(recognition.status,'executed');
  assert.deepEqual(out.morphology.outward.snapshot.structure.recognition,recognition);
  assert.deepEqual(out.contact.kleinEvaluation.context.meshState.structuralMorphology.recognition,recognition);
  const observations=root.events.filter(e=>e.payload?.toolId==='diseminer');
  assert.equal(observations.length,2);
});
test('DISEMINER retains observed context across calls rather than relearning in a disconnected instance',()=>{
  const root=makeRoot();
  const observe=()=>snapshot(root.structure('Zorbax remembers blueprints.')).structure.recognition.runs.find(r=>r.toolId==='diseminer'&&r.operation==='observe').output;
  assert.equal(observe().sense.familiar,0);
  assert.equal(observe().sense.familiar,1);
});

