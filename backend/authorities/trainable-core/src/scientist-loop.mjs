import crypto from 'node:crypto';
const now=()=>new Date().toISOString();
const id=(p,x)=>`${p}_${crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,14)}`;
const similarity=(a,b)=>{
  if(typeof a==='number'&&typeof b==='number') return 1/(1+Math.abs(a-b));
  const sa=new Set(String(a??'').toLowerCase().split(/\W+/).filter(Boolean));
  const sb=new Set(String(b??'').toLowerCase().split(/\W+/).filter(Boolean));
  if(!sa.size&&!sb.size)return 1; const inter=[...sa].filter(x=>sb.has(x)).length; const union=new Set([...sa,...sb]).size; return union?inter/union:0;
};

export class ScientistLoop {
  constructor(){ this.questions=new Map(); this.experiments=[]; }
  question(raw,{hypothesis=null,method=null,address=null,source=[]}={}){
    const q={id:id('q',{raw,address,t:Date.now()}),question:String(raw),hypothesis:hypothesis??null,method:method??null,address:address??null,evidence:[],source:[...source],status:'open',confidence:0.3,createdAt:now(),updatedAt:now()};
    this.questions.set(q.id,q); return structuredClone(q);
  }
  evidence(questionId,{source,relevance=0.5,data=null}){
    const q=this.questions.get(questionId); if(!q)throw new Error('unknown question');
    q.evidence.push({source,relevance:Number(relevance),data,at:now()});
    const avg=q.evidence.reduce((s,e)=>s+e.relevance,0)/q.evidence.length;
    q.confidence=Math.min(.95,.3+avg*.5+q.evidence.length*.05); q.updatedAt=now();
    return structuredClone(q);
  }
  experiment(questionId,{action,predicted,actual,beforeAddress=null,afterAddress=null,toolPath=[]}){
    const q=this.questions.get(questionId); if(!q)throw new Error('unknown question');
    const score=similarity(predicted,actual);
    const e={id:id('exp',{questionId,action,t:Date.now()}),questionId,action,predicted,actual,score,beforeAddress,afterAddress,toolPath:[...toolPath],at:now()};
    this.experiments.push(e);
    q.status=score>.7?'validated':score>.3?'testing':'refuted';
    q.confidence=Math.max(0,Math.min(.95,q.confidence+(score-.5)*.2)); q.updatedAt=now();
    return structuredClone(e);
  }
  dashboard(){
    const qs=[...this.questions.values()];
    return {questions:qs.length,validated:qs.filter(q=>q.status==='validated').length,refuted:qs.filter(q=>q.status==='refuted').length,testing:qs.filter(q=>q.status==='testing').length,experiments:this.experiments.length};
  }
}

