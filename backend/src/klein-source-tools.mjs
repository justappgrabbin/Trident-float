import { Automaton } from '../authorities/execution-spine/src/pure-synthia/automata/automaton.js';

const copy=v=>structuredClone(v);
const fail=message=>{throw new TypeError(message);};
const text=v=>typeof v==='string'&&v.trim().length>0;
function list(value,name,max=256){if(!Array.isArray(value)||value.length>max)fail(`${name} must be an array of at most ${max} items`);return value;}
function rng(seed=1){let a=seed>>>0;return()=>{a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function base(descriptor,state,dispatch){return {id:descriptor.id,address:{line:1,color:1,tone:1,base:1,arcSecond:0},
  states:[{id:'receive',initial:true},{id:'resolve',accepting:true}],q0:'receive',finals:['resolve'],
  capabilities:descriptor.capabilities,ports:{in:[{id:'input',type:'json'}],out:[{id:'output',type:'json'}]},state,
  implementation:(input={},ctx)=>{const out=dispatch(input,ctx.state);ctx.emit({from:'receive',to:'resolve',transition:'flow'});return out;}};}

// Source: user-supplied klein_outline_paraphraser.pdf. Semantic triples remain
// independent of reading order. No entity/relationship vocabulary is prescribed.
export class OutlineParaphraserAutomaton extends Automaton {
  static descriptor={id:'outline-paraphraser',capabilities:['realize','entity-led','chronological','highlight'],description:'Source-backed outline realization over semantic triples, with exact coverage receipts.'};
  constructor(){super(base(OutlineParaphraserAutomaton.descriptor,{},(input)=>{
    const triples=list(input.triples,'triples').map((t,i)=>{
      if(!t||![t.subject,t.relation,t.object??t.obj].every(text)||t.time!=null&&!Number.isFinite(t.time))fail('triples require subject, relation, object and optional finite time');
      return {id:t.id??String(i),subject:t.subject,relation:t.relation,object:t.object??t.obj,time:t.time??i};
    });
    const mode=input.mode??'chronological',entity=input.entity;
    if(!['chronological','entity-led','highlight'].includes(mode))fail('unknown outline mode');
    if(mode!=='chronological'&&!triples.some(t=>[t.subject,t.object].includes(entity)))fail('outline entity must occur in triples');
    const sorted=[...triples].sort((a,b)=>a.time-b.time);
    const ordered=mode==='chronological'?sorted:mode==='entity-led'?
      [...sorted.filter(t=>t.subject===entity),...sorted.filter(t=>t.subject!==entity&&t.object===entity),...sorted.filter(t=>![t.subject,t.object].includes(entity))]:
      [...sorted.filter(t=>[t.subject,t.object].includes(entity)),...sorted.filter(t=>![t.subject,t.object].includes(entity))];
    const sentences=ordered.map(t=>`${t.subject} ${t.relation} ${t.object}.`);
    return {ok:true,mode,entity:entity??null,text:sentences.join(' '),clauses:ordered.map((t,i)=>({triple:copy(t),surface:sentences[i]})),coverage:{total:triples.length,rendered:ordered.length,missing:[]},policy:'reorder source triples; preserve each full clause, including relation'};
  }));}
}

// Source: klein_control_of_style.pdf. Weighted production selection and style
// blending, with caller-supplied rules instead of hardcoded subject matter.
export class ControlOfStyleAutomaton extends Automaton {
  static descriptor={id:'control-of-style',capabilities:['register','compose','export'],description:'Weighted generative grammar with style blending and traceable production selection.'};
  constructor(){super(base(ControlOfStyleAutomaton.descriptor,{rules:[],uses:{}},(input,state)=>{
    const op=input.operation??'compose';
    if(op==='register'){
      const rules=list(input.rules,'rules').map(r=>{
        if(!r||!text(r.id)||!text(r.slot)||!text(r.template)||!r.weights||Array.isArray(r.weights)||!Object.entries(r.weights).length||Object.entries(r.weights).some(([k,w])=>!text(k)||!Number.isFinite(w)||w<0))fail('rules require id, slot, template and nonnegative style weights');
        return copy(r);
      });
      if(new Set(rules.map(r=>r.id)).size!==rules.length)fail('duplicate production id');
      state.rules=rules;return {ok:true,count:rules.length};
    }
    if(op==='export')return {ok:true,rules:copy(state.rules),uses:copy(state.uses)};
    if(op!=='compose')fail('unknown style operation');
    const mix=typeof input.style==='string'?{[input.style]:1}:input.style;
    if(!mix||Array.isArray(mix)||!Object.keys(mix).length||Object.values(mix).some(w=>!Number.isFinite(w)||w<0)||Math.abs(Object.values(mix).reduce((a,b)=>a+b,0)-1)>1e-6)fail('style blend must have nonnegative weights summing to one');
    const random=rng(input.seed??1),selected=[];
    const sentences=list(input.beats,'beats').map(beat=>{
      if(!beat||!text(beat.slot)||!beat.fill||Array.isArray(beat.fill)||Object.values(beat.fill).some(v=>typeof v!=='string'))fail('beat requires slot and string fills');
      const candidates=state.rules.filter(r=>r.slot===beat.slot).map(rule=>({rule,weight:Object.entries(mix).reduce((s,[k,w])=>s+w*(rule.weights[k]??0),0)}));
      const total=candidates.reduce((s,r)=>s+r.weight,0);if(!Number.isFinite(total)||total<=0)fail('no positive production weight for slot/style');
      let mark=random()*total;const chosen=candidates.find(r=>(mark-=r.weight)<0)??candidates.at(-1);
      const required=[...chosen.rule.template.matchAll(/\{([^{}]+)\}/g)].map(m=>m[1]);
      if(required.some(k=>!Object.hasOwn(beat.fill,k)))fail('missing template fill');
      const surface=chosen.rule.template.replace(/\{([^{}]+)\}/g,(_,k)=>beat.fill[k]);
      state.uses[chosen.rule.id]=(state.uses[chosen.rule.id]??0)+1;
      selected.push({ruleId:chosen.rule.id,slot:beat.slot,fill:copy(beat.fill),surface,weight:chosen.weight});return surface;
    });
    return {ok:true,text:sentences.join(' '),style:copy(mix),selected,policy:'weighted realization of supplied grammar; no new facts inferred from stylistic wording'};
  }));}
}

// Source: klein_kuppin_grammar_learner.pdf (the source identifies itself as a
// conceptual reconstruction). Incremental candidate elimination + held-out apply.
// Position permutations are supplied, not fixed to English auxiliary movement.
export class TransformationLearnerAutomaton extends Automaton {
  static descriptor={id:'transformation-learner',capabilities:['configure','observe','apply','export'],description:'Klein–Kuppin-style incremental elimination of supplied transformation hypotheses.'};
  constructor(){super(base(TransformationLearnerAutomaton.descriptor,{candidates:[],observations:[]},(input,state)=>{
    const op=input.operation??'export';
    if(op==='configure'){
      const candidates=list(input.candidates,'candidates',64).map(rule=>{
        if(!rule||!text(rule.id))fail('candidate requires id');
        const order=list(rule.order,'candidate order',256);
        if(order.some(n=>!Number.isInteger(n)||n<0)||new Set(order).size!==order.length)fail('candidate order requires unique nonnegative positions');
        return {id:rule.id,order:[...order]};
      });
      if(new Set(candidates.map(c=>c.id)).size!==candidates.length)fail('duplicate candidate id');
      state.candidates=candidates;state.observations=[];return {ok:true,candidates:copy(candidates)};
    }
    if(op==='export')return {ok:true,candidates:copy(state.candidates),observations:copy(state.observations)};
    const tokens=list(input.base,'base');if(!tokens.every(text))fail('base tokens must be nonempty strings');
    const apply=rule=>rule.order.some(i=>i>=tokens.length)?null:[...rule.order.map(i=>tokens[i]),...tokens.filter((_,i)=>!rule.order.includes(i))];
    if(op==='observe'){
      const target=list(input.target,'target');if(!target.every(text))fail('target tokens must be nonempty strings');
      state.candidates=state.candidates.filter(rule=>JSON.stringify(apply(rule))===JSON.stringify(target));
      state.observations.push({base:[...tokens],target:[...target]});
      return {ok:true,candidates:copy(state.candidates),converged:state.candidates.length===1,consistent:state.candidates.length>0};
    }
    if(op==='apply')return {ok:true,predictions:state.candidates.map(rule=>({ruleId:rule.id,tokens:apply(rule)})).filter(p=>p.tokens),converged:state.candidates.length===1};
    fail('unknown transformation operation');
  }));}
}
export const SOURCE_TOOL_CLASSES=Object.freeze([OutlineParaphraserAutomaton,ControlOfStyleAutomaton,TransformationLearnerAutomaton]);

