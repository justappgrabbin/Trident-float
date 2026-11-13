import test from 'node:test';
import assert from 'node:assert/strict';
import { structuralView, applyStructuralFrame, interpretCoordinates, FractalAddressSpace, analyzeStructure, traceStructuralPath, JUT_TOPOLOGY } from '../extensions/generative-address-morphology/src/core/structural-space.mjs';
import { advanceStructuralState } from '../extensions/generative-address-morphology/src/core/structural-dynamics.mjs';
import { SynthiaGenerativeAssembly } from '../src/synthia-generative-assembly.mjs';

test('every source perspective retains all five fields and emergent Space', () => {
  for (const name of ['motivation','movement','evolution','being','design','space']) {
    const view=structuralView(name);
    assert.equal(new Set(view.order).size,5);
    assert.equal(view.fields.find(f=>f.dimension==='Space').role,'emergent');
    assert.equal(view.spacePolicy.primitive,false);
  }
  assert.deepEqual(structuralView('being').order,['Being','Movement','Space','Design','Evolution']);
});
test('observer frame is separate from source order and has no universal question mapping',()=>{
  const source=structuralView('motivation');
  const framed=applyStructuralFrame(source,{question:'when',governingField:'Movement',order:[...source.order].reverse()});
  assert.deepEqual(framed.sourceOrder,source.order);
  assert.equal(framed.fields.find(f=>f.dimension==='Movement').governing,true);
  assert.equal(applyStructuralFrame(source,{question:'why'}).observer.governingField,null);
  assert.throws(()=>applyStructuralFrame(source,{order:['Movement']}));
});
test('coordinate interpretation is view-scoped and missing selections stay null',()=>{
  const m=interpretCoordinates({tone:1,base:4},{view:'motivation'});
  assert.equal(m.meanings.tone.value.department,'Smell');
  assert.equal(m.meanings.base.value.dimension,'Design');
  assert.equal(m.selected.color,null);
  assert.equal(m.meanings.color,null);
  assert.equal(interpretCoordinates({tone:1},{view:'being'}).meanings,null);
  assert.throws(()=>interpretCoordinates({tone:7},{view:'motivation'}));
});
test('recursive coordinates round-trip exactly beyond safe integer and generate unseen positions',()=>{
  const space=new FractalAddressSpace({depth:4});
  assert.equal(new FractalAddressSpace({depth:3}).capacity,330225942528000n);
  for(const index of [0n,9007199254740993n,space.capacity-1n]) assert.equal(space.indexOf(space.at(index).path),index);
  assert.notEqual(space.at('0').identity,space.at('1').identity);
  assert.throws(()=>space.at(Number.MAX_SAFE_INTEGER+1));
  assert.throws(()=>space.at(space.capacity));
});
test('field workers compose supplied topology and respect reduced pathways',()=>{
  assert.equal(JUT_TOPOLOGY.relations.length,6);
  const full=analyzeStructure('Mind Ego Body Individuality',{example:'jut'});
  assert.equal(full.space.status,'complete-example-interplay');
  assert.equal(full.swarm.count,5);
  assert.equal(full.space.expression,null);
  const reduced=analyzeStructure('',{example:'jut',activeFields:['M','I']});
  assert.deepEqual(reduced.space.interactions.map(e=>e.id),['diagonal-MI']);
  assert.equal(reduced.space.status,'partial-example-interplay');
  assert.equal(analyzeStructure('',{example:'jut',activeFields:['M','I'],openEdges:[]}).space.interactions.length,0);
  assert.throws(()=>analyzeStructure('',{activeFields:['P']}));
  assert.equal(analyzeStructure('unknownword').unresolvedTokens[0].value,'unknownword');
  const song=analyzeStructure('Mind Ego Body Individuality',{example:'song'});
  assert.deepEqual(song.space.expression,['Song','Music','Rhythm']);
  assert.equal(analyzeStructure('Mind',{example:'song'}).space.expression,null);
});
test('letter tracing follows explicit edges, preserves case and changes view orientation only',()=>{
  const spec={nodes:[{id:'a',label:'Mind',position:[-1,-1]},{id:'b',label:'evolution',position:[1,1]}],edges:[{from:'a',to:'b'}],path:['a','b'],orientation:{x:1,y:-1}};
  const result=traceStructuralPath(spec);
  assert.equal(result.reading,'Me');
  assert.deepEqual(result.steps[0].viewPosition,[-1,1]);
  assert.throws(()=>traceStructuralPath({...spec,path:['b','a']}));
});
const vectors={M:[1,2],E:[3,4],B:[5,6],I:[7,8]};
const identity=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>Number(i===j)));
test('CPU dynamics require explicit coefficients and derive P only through supplied readout',()=>{
  const out=advanceStructuralState({vectors,tensor:identity,readout:{MI:2,EB:1}});
  assert.deepEqual(out.vectors,vectors);
  assert.deepEqual(out.P.value,[29,56]);
  assert.equal(advanceStructuralState({vectors,tensor:identity}).P.value,null);
  assert.throws(()=>advanceStructuralState({vectors}));
  assert.throws(()=>advanceStructuralState({vectors:{...vectors,P:[1,1]},tensor:identity}));
  const masked=advanceStructuralState({vectors,tensor:Array.from({length:4},()=>[1,1,1,1]),activeFields:['M','I'],openEdges:[],readout:{MI:1}});
  assert.deepEqual(masked.vectors.M,[1,2]);
  assert.equal(masked.vectors.E,null);
  assert.equal(masked.P.value,null);
  assert.equal(masked.trace.mask[0][3],0);
});
test('structural entry executes through root/Klein and keeps partial coordinates out of legacy normalization',()=>{
  const root=new SynthiaGenerativeAssembly({morphology:{engineOptions:{weightsFile:null}}});
  const result=root.structure({text:'Mind Ego Body Individuality'},{view:'motivation',coordinates:[{tone:1}],frame:{question:'when',governingField:'Movement'}});
  assert.ok(result.derivation.kleinEvaluation);
  const snapshot=result.derivation.output.snapshot;
  assert.equal(snapshot.addressMode,'structural');
  assert.deepEqual(snapshot.addresses,[]);
  assert.equal(snapshot.structure.interpretations[0].meanings.tone.value.department,'Smell');
  const operator=root.engine.klein.operator('generative-address-morphology');
  const before=structuredClone(root.generativeMorphology.snapshot());
  operator({input:{operation:'structure',subject:{text:'Body'},context:{view:'being'}}});
  assert.deepEqual(root.generativeMorphology.snapshot(),before);
});

