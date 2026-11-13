import {createHash} from 'node:crypto';
const num=(s,i)=>createHash('sha256').update(s).digest()[i];
export function projectGraph(graph){
  const seed=`${graph.channelId}:${graph.energy}:${graph.id}`;const hue=num(seed,0)/255*360;const freq=110+(num(seed,1)/255)*770;const angle=(num(seed,2)/255)*360;
  return {
    evidenceStatus:'experimental',
    language:`${graph.name} graph active across ${graph.members.length} addressed participants; expression ${(graph.expressionStrength*100).toFixed(1)}%.`,
    geometry:{kind:'edge-assembly',orientationDegrees:Number(angle.toFixed(2)),memberCount:graph.members.length},
    sound:{frequencyHz:Number(freq.toFixed(2)),amplitude:Number(graph.expressionStrength.toFixed(4))},
    color:{space:'HSL',h:Number(hue.toFixed(2)),s:70,l:Math.round(30+graph.expressionStrength*40)},
    timing:{active:graph.status==='active',persistence:Number(graph.persistence.toFixed(4))}
  };
}

