// One bounded shared view of actual tool results. It does not assign semantic
// relationships: adapters preserve the structures explicitly returned by tools.
function data(value, seen=new WeakSet(), budget={left:20000}) {
  if(--budget.left<0)return {omitted:'tool-result-node-budget'};
  if(typeof value==='function')return {kind:'callable',name:value.name||null};
  if(typeof value==='bigint')return {kind:'bigint',decimal:String(value)};
  if(value==null||typeof value!=='object')return value;
  if(seen.has(value))return {omitted:'repeated-reference'};
  seen.add(value);
  if(value instanceof Map)return [...value].map(([k,v])=>[data(k,seen,budget),data(v,seen,budget)]);
  if(value instanceof Set)return [...value].map(v=>data(v,seen,budget));
  if(Array.isArray(value))return value.map(v=>data(v,seen,budget));
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,data(v,seen,budget)]));
}
const copy=v=>structuredClone(v);
function graphFor(toolId,output,sequence){
  const nodes=[],relations=[],prefix=`${toolId}:${sequence}:`;
  const addNode=(id,surface,extra={})=>{if(!nodes.some(n=>n.id===prefix+id))nodes.push({...extra,id:prefix+id,surface,source:toolId});return prefix+id;};
  if(toolId==='autoling'){
    for(const n of output?.pipeline?.parseTree?.nodes??[])addNode(n.id,n.surface,n);
    for(const e of output?.pipeline?.parseTree?.edges??[])relations.push({...e,from:prefix+e.from,to:prefix+e.to,source:toolId,kind:'tool-reported-syntax'});
  }else if(toolId==='diseminer'){
    for(const c of output?.claims??[])relations.push({from:addNode(`${c.id}:subject`,c.subject),to:addNode(`${c.id}:object`,c.object),label:c.predicate,source:toolId,kind:'tool-extracted-claim',claim:c});
  }else if(toolId==='autoling-lite'){
    for(const [i,m] of (output?.matches??[]).entries()){
      const args=m.structure.map((v,j)=>addNode(`${i}:${j}`,v));
      relations.push({source:toolId,label:m.relation,arguments:args,kind:'tool-recognized-rule',ruleId:m.ruleId,bindings:m.bindings});
    }
  }else if(toolId==='autonovel'){
    for(const n of output?.nodes??[])addNode(n.id,n.value,n);
    for(const r of output?.relations??[])relations.push({...r,source:toolId,label:r.type,arguments:r.source.map(id=>prefix+id),target:prefix+r.target,kind:'tool-generated-composition'});
  }else if(toolId==='outline-paraphraser'){
    for(const [i,c] of (output?.clauses??[]).entries())relations.push({from:addNode(`${i}:subject`,c.triple.subject),to:addNode(`${i}:object`,c.triple.object),label:c.triple.relation,source:toolId,kind:'realized-source-triple'});
  }
  return {nodes,relations};
}
export class KleinToolState {
  constructor(catalog){this.catalog=catalog;this.sequence=0;this.results=new Map();this.history=[];}
  record(toolId,input,result,context={}){
    if(context.klein||context.kleinJoint)return;
    const sequence=++this.sequence,output=data(result.output),operation=input?.operation??'run';
    const entry={toolId,operation,sequence,status:result.error?'failed':result.accepted===false?'rejected':'executed',output,
      finalState:result.finalState??null,error:result.error??null,kleinEvaluationId:context.kleinEvaluation?.evaluationId??null,
      graph:result.accepted===false||result.error?{nodes:[],relations:[]}:graphFor(toolId,output,sequence)};
    this.results.set(`${toolId}:${operation}`,entry);
    // Preserve at most one result per public operation and a bounded event receipt log.
    if(this.results.size>256)this.results.delete(this.results.keys().next().value);
    this.history.push({sequence,toolId,operation,status:entry.status});if(this.history.length>256)this.history.shift();
    return copy(entry);
  }
  snapshot(){
    const results=[...this.results.values()];
    return {schema:'klein-shared-state-v1',sequence:this.sequence,
      tools:this.catalog.map(d=>({id:d.id,capabilities:[...d.capabilities],results:copy(results.filter(r=>r.toolId===d.id))})),
      graph:{nodes:copy(results.flatMap(r=>r.graph.nodes)),relations:copy(results.flatMap(r=>r.graph.relations))},history:copy(this.history),
      policy:'actual tool results; syntax, claims, recognized rules and generated structures retain distinct provenance; no predefined field couplings'};
  }
}

