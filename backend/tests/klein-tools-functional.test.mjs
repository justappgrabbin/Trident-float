import test from 'node:test';
import assert from 'node:assert/strict';
import { SynthiaGenerativeAssembly } from '../src/synthia-generative-assembly.mjs';
const make=()=>new SynthiaGenerativeAssembly({morphology:{engineOptions:{weightsFile:null}}});
const execute=(root,id,input)=>{
  const result=root.invoke(id,input);
  assert.notEqual(result.derivation.output?.ok,false,`${id}: ${JSON.stringify(result.derivation.output)}`);
  assert.equal(result.derivation.evaluation.accepted,true,`${id} operation ${input.operation??'run'} rejected valid output`);
  const records=root.generativeMorphology.snapshot().toolState.tools.find(t=>t.id===id).results;
  assert.ok(records.some(r=>r.status==='executed'&&r.operation===(input.operation??'run')),`${id} output missing from shared state`);
  return result.derivation.output;
};
const cases={
  'autoling-lite':r=>{execute(r,'autoling-lite',{operation:'learn',rule:{id:'novel-link',relation:'RELATES',pattern:['$a','links','$b'],template:'$a links $b'}});assert.equal(execute(r,'autoling-lite',{operation:'recognize',text:'memory links structure'}).matches[0].relation,'RELATES');assert.equal(execute(r,'autoling-lite',{operation:'generate',relation:'RELATES',args:['new','concept']}).surface,'new links concept');},
  'diseminer-lite':r=>{execute(r,'diseminer-lite',{operation:'ingest',text:'blue shape turns blue shape grows'});assert.ok(execute(r,'diseminer-lite',{operation:'neighbors',term:'shape'}).neighbors.some(n=>n.similarity>0));},
  'klein-analogy':r=>assert.deepEqual(execute(r,'klein-analogy',{vocab:['a','b','c'],A:['a'],B:['a','b'],C:['c']}).result,['b','c']),
  'iching-grammar':r=>{const o=execute(r,'iching-grammar',{lines:[1,1,1,1,1,1],transform:'shadow'});assert.equal(o.gate,1);assert.ok(o.transformed);},
  'language-contact':r=>assert.deepEqual(execute(r,'language-contact',{grammarA:{x:'old'},grammarB:{x:'new'},contactRate:1,generations:1,seed:1}).finalGrammar,{x:'new'}),
  'historical-monte-carlo':r=>assert.deepEqual(execute(r,'historical-monte-carlo',{variants:{x:3,y:1},mutationScale:0,generations:2}).finalWeights,{x:.75,y:.25}),
  'autonovel':r=>{execute(r,'autonovel',{operation:'register',domain:{id:'custom',primitives:[{type:'meaning'}],combinators:[{id:'join',inputs:['meaning','meaning'],output:'composition'}]}});const o=execute(r,'autonovel',{operation:'generate',spec:{domain:'custom',seeds:[{type:'meaning',value:'memory'},{type:'meaning',value:'structure'}],maxDepth:1}});assert.deepEqual(o.nodes[2].value,['memory','structure']);assert.equal(o.relations.length,1);},
  'messy':r=>{const o=execute(r,'messy',{agents:[{id:'a',features:{count:0}}],rules:[{when:()=>true,apply:a=>({...a,features:{count:a.features.count+1}})}],ticks:2});assert.equal(o.finalState[0].features.count,2);},
  'success':r=>{execute(r,'success',{operation:'define',personId:'p',purpose:{statement:'learn',indicators:[{id:'accuracy',name:'accuracy'}]}});execute(r,'success',{operation:'observe',personId:'p',indicatorId:'accuracy',value:1});execute(r,'success',{operation:'observe',personId:'p',indicatorId:'accuracy',value:2});const o=execute(r,'success',{operation:'summary',personId:'p'});assert.ok(o);},
  'conversation':r=>assert.match(execute(r,'conversation',{text:'hello',contributions:['recognized input']}).utterance,/recognized input/),
  'browser-form':r=>{const o=execute(r,'browser-form',{operation:'inspect-page',page:{url:'https://example.test',title:'test',forms:[]}});assert.ok(o);},
  'research-browser':r=>{const o=execute(r,'research-browser',{operation:'create',title:'Research',question:'Which claim has evidence?'});assert.ok(o.id??o.projectId??o.project);},
  'computational-grammar-coder':r=>{const o=execute(r,'computational-grammar-coder',{text:'the shape grows'});assert.ok(JSON.stringify(o).includes('ART'));},
  'autoling':r=>{const o=execute(r,'autoling',{operation:'pipeline',text:'the shape grows'});assert.equal(o.pipeline.parseTree.nodes.length,3);execute(r,'autoling',{operation:'stats'});},
  'diseminer':r=>{execute(r,'diseminer',{operation:'observe',text:'Memory shapes structure.'});assert.equal(execute(r,'diseminer',{operation:'extract',text:'Memory shapes structure.'}).claims[0].predicate,'shapes');},
  'morph-mir':r=>{const o=execute(r,'morph-mir',{operation:'ingest',name:'module.js',content:'export const answer = 42;'});execute(r,'morph-mir',{operation:'analyze',artifactId:o.artifactId});const result=execute(r,'morph-mir',{operation:'regenerate',artifactId:o.artifactId,mode:'exact'});assert.ok(JSON.stringify(result).includes('export const answer = 42;'));},
  'outline-paraphraser':r=>{const triples=[{subject:'A',relation:'creates',object:'B',time:2},{subject:'C',relation:'observes',object:'D',time:1}];const a=execute(r,'outline-paraphraser',{triples,mode:'chronological'}),b=execute(r,'outline-paraphraser',{triples,mode:'entity-led',entity:'A'});assert.notEqual(a.text,b.text);assert.ok(a.text.includes('A creates B'));assert.equal(b.coverage.rendered,2);},
  'control-of-style':r=>{execute(r,'control-of-style',{operation:'register',rules:[{id:'plain',slot:'claim',template:'{a} relates to {b}.',weights:{plain:1,formal:0}},{id:'formal',slot:'claim',template:'A relation connects {a} and {b}.',weights:{plain:0,formal:1}}]});const compose=style=>execute(r,'control-of-style',{operation:'compose',style,beats:[{slot:'claim',fill:{a:'memory',b:'structure'}}],seed:2});assert.notEqual(compose('plain').text,compose('formal').text);assert.equal(compose({plain:.7,formal:.3}).selected.length,1);},
  'transformation-learner':r=>{execute(r,'transformation-learner',{operation:'configure',candidates:[{id:'front',order:[1,0]},{id:'identity',order:[0,1]}]});assert.equal(execute(r,'transformation-learner',{operation:'observe',base:['she','can','swim'],target:['can','she','swim']}).converged,true);assert.deepEqual(execute(r,'transformation-learner',{operation:'apply',base:['it','must','work','today']}).predictions[0].tokens,['must','it','work','today']);},
};
for(const [id,verify] of Object.entries(cases))test(`${id}: real input → execution → observed output → shared state`,()=>verify(make()));

test('audit covers the complete executable catalog, both directions and active result/context adapters',()=>{
  const root=make(),audit=root.wiringAudit();
  assert.equal(root.kleinToolCatalog.length,19);assert.deepEqual(new Set(Object.keys(cases)),new Set(root.kleinToolCatalog.map(t=>t.id)));
  assert.equal(audit.ok,true);assert.equal(Object.keys(audit.morphology.allTools).length,19);
  for(const paths of Object.values(audit.morphology.allTools))assert.ok(Object.values(paths).every(Boolean));
  root.engine.mesh.get('messy').runObservers.clear();assert.equal(root.wiringAudit().ok,false);
});
test('Klein probes read shared context but cannot add tool results or leak learned state',()=>{
  const root=make();execute(root,'diseminer-lite',{operation:'ingest',text:'observed memory structure'});
  const before=root.toolState.snapshot(),tool=root.engine.mesh.get('autoling-lite'),owned=tool.exportState();
  root.engine.klein.operator('autoling-lite')({input:{operation:'learn',rule:{id:'probe',relation:'temporary',pattern:['$a'],template:'$a'}}});
  assert.deepEqual(root.toolState.snapshot(),before);assert.deepEqual(tool.exportState(),owned);
});
test('an actual later tool sees prior results through its shared state-space context',()=>{
  const root=make();execute(root,'klein-analogy',{vocab:['a','b','c'],A:['a'],B:['a','b'],C:['c']});
  const conversation=root.engine.mesh.get('conversation'),original=conversation.implementation;
  conversation.implementation=(input,ctx)=>original({...input,contributions:ctx.context.stateSpace.tools.find(t=>t.id==='klein-analogy').results[0].output.result},ctx);
  assert.match(execute(root,'conversation',{text:'received'}).utterance,/b/);
  assert.match(execute(root,'conversation',{text:'received'}).utterance,/c/);
});
test('task pipeline translates actual ATO output into learned AUTOLING generation without hardcoded relationships',()=>{
  const root=make();execute(root,'autoling-lite',{operation:'learn',rule:{id:'user-relation',relation:'USER_RELATION',pattern:['$a','connects','$b'],template:'$a connects $b'}});
  const result=root.runToolTask([
    {toolId:'klein-analogy',input:{vocab:['memory','shape','blue'],A:['memory'],B:['memory','shape'],C:['blue']}},
    {toolId:'autoling-lite',input:{operation:'generate',relation:'USER_RELATION'},bindings:{args:{step:0,path:['result']}}},
  ]);
  assert.equal(result.ok,true);assert.equal(result.runs[1].derivation.output.surface,'shape connects blue');
  assert.ok(result.runs.every(r=>r.rootEventId&&r.trainingRecordId&&r.derivation.kleinEvaluation));
  assert.throws(()=>root.runToolTask([{toolId:'klein-analogy',bindings:{A:{step:9,path:[]}}}]),/earlier/);
});

test('generated AutoNovel and recognized learned rules enter structural relationships with original provenance',()=>{
  const root=make();cases['autonovel'](root);cases['autoling-lite'](root);
  const state=root.structure('').derivation.output.snapshot;
  assert.ok(state.structure.space.interactions.some(e=>e.source==='autonovel'&&e.kind==='tool-generated-composition'));
  assert.ok(state.structure.space.interactions.some(e=>e.source==='autoling-lite'&&e.label==='RELATES'));
  assert.ok(!state.structure.space.interactions.some(e=>e.label==='Speed'));
});
test('all four acceptance repairs retain invalid-input and browser approval checks',()=>{
  const root=make();
  assert.throws(()=>root.invoke('autoling',{operation:'pipeline'}),/text|TEXT/i);
  assert.throws(()=>root.invoke('success',{operation:'observe',personId:'unknown',indicatorId:'x',value:1}),/unknown|PURPOSE/i);
  assert.throws(()=>root.invoke('research-browser',{operation:'claim',projectId:'unknown',claim:{text:'unsupported'}}));
  execute(root,'browser-form',{operation:'inspect-page',page:{url:'https://example.test',forms:[{id:'f',action:'https://example.test/submit',fields:[{name:'name'}]}]}});
  const draft=execute(root,'browser-form',{operation:'draft',formId:'f',values:{name:'test'}});
  assert.throws(()=>root.invoke('browser-form',{operation:'fill',draftId:draft.id}));
  assert.ok(root.toolState.snapshot().history.some(e=>e.toolId==='browser-form'&&e.status==='failed'));
});
test('source transformation learner removes inconsistent hypotheses and style errors remain explicit',()=>{
  const root=make();cases['transformation-learner'](root);
  const result=execute(root,'transformation-learner',{operation:'observe',base:['she','can','swim'],target:['swim','can','she']});
  assert.equal(result.consistent,false);assert.equal(result.candidates.length,0);
  assert.throws(()=>root.invoke('control-of-style',{operation:'compose',style:{plain:.2},beats:[]}),/summing/);
});
test('source-tool Klein trial learning never changes shared results or the learned hypotheses',()=>{
  const root=make();cases['transformation-learner'](root);
  const tool=root.engine.mesh.get('transformation-learner'),before=tool.exportState(),shared=root.toolState.snapshot();
  root.engine.klein.operator('transformation-learner')({input:{operation:'observe',base:['x','y'],target:['x','y']}});
  assert.deepEqual(tool.exportState(),before);assert.deepEqual(root.toolState.snapshot(),shared);
});

test('shared tool state is included in the witnessed Klein context and changes its context identity',()=>{
  const root=make();
  const request={nodeId:'shared-context-check',eventType:'test',invocations:[{toolId:'conversation',input:{text:'same',contributions:['same']}}]};
  const a=root.engine.klein.evaluate(request),b=root.engine.klein.evaluate(request);
  assert.equal(a.contextHash,b.contextHash);assert.deepEqual(a.result,b.result);
  assert.ok(a.context.context.stateSpace);
  execute(root,'klein-analogy',{vocab:['a','b','c'],A:['a'],B:['a','b'],C:['c']});
  const c=root.engine.klein.evaluate(request);assert.notEqual(c.contextHash,a.contextHash);
});

