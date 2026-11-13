const clamp=x=>Math.max(0,Math.min(1,x));
export class GraphRuntime{
  constructor({weights=null}={}){this.graphs=new Map();this.history=[];this.weights=weights;}
  update(connections,activeAddressIds=new Set()){
    const liveIds=new Set();
    for(const c of connections){
      const id=`graph-${c.id}`;liveIds.add(id);
      const result=c.morphology.execute();
      const prior=this.graphs.get(id);
      const persistence=prior?clamp((prior.persistence??0.5)+0.05):0.5;
      const graph={
        id,connectionId:c.id,channelId:c.channel.id,energy:c.channel.energy,name:c.channel.name,
        members:[c.a.id,c.b.id],conditions:{requiredActiveAddresses:[c.a.id,c.b.id],channelPair:[...c.channel.gates]},
        coherence:result.coherence,expressionStrength:clamp(result.retained),persistence,
        morphology:{implementation:c.morphology.implementation,evidenceStatus:c.morphology.evidenceStatus,result},
        status:'active',firstSeenAt:prior?.firstSeenAt??Date.now(),updatedAt:Date.now(),validity:c.validity,audit:c.audit
      };
      this.graphs.set(id,graph);this.weights?.registerGraph(graph);
    }
    for(const [id,g] of this.graphs){
      if(g.status!=='active')continue;
      const conditionsHold=g.conditions.requiredActiveAddresses.every(x=>activeAddressIds.has(x));
      if(!liveIds.has(id)||!conditionsHold){g.status='dissolved';g.dissolvedAt=Date.now();g.updatedAt=Date.now();this.history.push({...g});}
    }
    return this.active();
  }
  active(){return [...this.graphs.values()].filter(g=>g.status==='active');}
  all(){return [...this.graphs.values()];}
  snapshot(){return {active:this.active(),all:this.all(),history:[...this.history]};}
}

