export class RuleRegistry{
  constructor(){this.rules=[];}
  register({id,scope='connection',status='experimental',description='',evaluate,provenance=[]}){
    if(!id||typeof evaluate!=='function')throw new TypeError('rule requires id + evaluate()');
    const rule=Object.freeze({id,scope,status,description,evaluate,provenance:[...provenance]});this.rules.push(rule);return rule;
  }
  evaluate(scope,ctx){
    const results=this.rules.filter(r=>r.scope===scope).map(r=>{const out=r.evaluate(ctx);return {...r,result:typeof out==='boolean'?{pass:out}:{...out}};});
    return {pass:results.every(x=>x.result.pass!==false),results};
  }
}
export function installCoreRules(registry){
  registry.register({id:'addresses-active',scope:'connection',status:'established',description:'Both addressed states must currently be active.',provenance:['proposal §10','graph lifecycle clarification'],evaluate:({a,b})=>({pass:a.active&&b.active})});
  registry.register({id:'channel-pair-exists',scope:'connection',status:'established',description:'The two gates must resolve to a registered Human Design channel pair.',provenance:['project-established channel structure'],evaluate:({channel})=>({pass:Boolean(channel)})});
  // Geometry/timing rules are extension points. We do not invent them before source decoding.
  return registry;
}

