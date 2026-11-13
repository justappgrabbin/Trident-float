import crypto from 'node:crypto';
const clone=v=>structuredClone(v);
export class TrainingJournal {
  constructor(){ this.records=[]; this.routeStats=new Map(); }
  record({task,stateBefore,toolPath=[],interaction,stateAfter,observedExpression,success,error=null,score=null,metadata={}}){
    const record={id:`train_${crypto.randomUUID()}`,at:new Date().toISOString(),task, stateBefore:clone(stateBefore),toolPath:[...toolPath],interaction:clone(interaction),stateAfter:clone(stateAfter),observedExpression,success:Boolean(success),error,score:score==null?(success?1:0):Number(score),metadata:clone(metadata)};
    this.records.push(record);
    const key=toolPath.join('>')||'(none)'; const s=this.routeStats.get(key)??{n:0,total:0,successes:0}; s.n++; s.total+=record.score; if(record.success)s.successes++; this.routeStats.set(key,s);
    return clone(record);
  }
  rankRoutes(){ return [...this.routeStats].map(([route,s])=>({route,uses:s.n,successRate:s.successes/s.n,meanScore:s.total/s.n})).sort((a,b)=>b.meanScore-a.meanScore); }
}

