import fs from 'node:fs';import path from 'node:path';
const clamp=x=>Math.max(0,Math.min(1,x));
export class GraphWeightStore{
  constructor(file){this.file=file||null;this.weights=new Map();if(this.file)this.load();}
  load(){if(!this.file)return;try{const d=JSON.parse(fs.readFileSync(this.file,'utf8'));for(const [k,v] of Object.entries(d))this.weights.set(k,v);}catch{}}
  persist(){if(!this.file)return;fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify(Object.fromEntries(this.weights),null,2));}
  registerGraph(graph){if(!this.weights.has(graph.id))this.weights.set(graph.id,{weight:0.5,updates:0,lastOutcome:null});this.persist();return this.weights.get(graph.id);}
  reinforceExisting(graphId,delta,outcome=null){if(!this.weights.has(graphId))throw new Error(`Cannot reinforce nonexistent graph: ${graphId}`);const x=this.weights.get(graphId);x.weight=clamp(x.weight+Number(delta));x.updates++;x.lastOutcome=outcome;this.persist();return {...x};}
  get(graphId){return this.weights.get(graphId)??null;}
  snapshot(){return Object.fromEntries(this.weights);}
}

