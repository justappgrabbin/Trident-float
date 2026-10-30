function components(graphs){
  const byId=new Map(graphs.map(g=>[g.id,g]));const adj=new Map(graphs.map(g=>[g.id,new Set()]));
  for(let i=0;i<graphs.length;i++)for(let j=i+1;j<graphs.length;j++)if(graphs[i].members.some(x=>graphs[j].members.includes(x))){adj.get(graphs[i].id).add(graphs[j].id);adj.get(graphs[j].id).add(graphs[i].id);}
  const seen=new Set(),pods=[];for(const g of graphs){if(seen.has(g.id))continue;const q=[g.id],ids=[];seen.add(g.id);while(q.length){const id=q.shift();ids.push(id);for(const n of adj.get(id)){if(!seen.has(n)){seen.add(n);q.push(n);}}}pods.push(ids.map(id=>byId.get(id)));}return pods;
}
export class GraphEcology{
  constructor(config={coverageWeight:.55,expressionWeight:.30,persistenceWeight:.15}){this.config=config;}
  evaluate(graphs,activeAddresses=[]){
    const totalParticipants=Math.max(1,new Set(activeAddresses.map(a=>a.id)).size);
    const energyMap=new Map();
    for(const g of graphs){const e=energyMap.get(g.energy)??{energy:g.energy,graphs:[],members:new Set(),expression:0,persistence:0};e.graphs.push(g);g.members.forEach(x=>e.members.add(x));e.expression+=g.expressionStrength;e.persistence+=g.persistence;energyMap.set(g.energy,e);}
    const energies=[...energyMap.values()].map(e=>{const coverage=e.members.size/totalParticipants,meanExpression=e.expression/e.graphs.length,meanPersistence=e.persistence/e.graphs.length;const dominance=coverage*this.config.coverageWeight+meanExpression*this.config.expressionWeight+meanPersistence*this.config.persistenceWeight;return {energy:e.energy,graphCount:e.graphs.length,participantCount:e.members.size,coverage,meanExpression,meanPersistence,dominance};}).sort((a,b)=>b.dominance-a.dominance);
    const pods=components(graphs).map((gs,i)=>({id:`pod-${i+1}`,graphIds:gs.map(g=>g.id),energies:[...new Set(gs.map(g=>g.energy))],members:[...new Set(gs.flatMap(g=>g.members))],meanExpression:gs.reduce((s,g)=>s+g.expressionStrength,0)/gs.length}));
    return {dominantEnergy:energies[0]?.energy??null,energies,pods};
  }
}

