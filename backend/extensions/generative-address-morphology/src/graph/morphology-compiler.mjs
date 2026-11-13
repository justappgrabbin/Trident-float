import {cosine} from '../core/semantic-address.mjs';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function measured({a,b}){
  const semantic=Boolean(a.semantic?.vector&&b.semantic?.vector);
  const similarity=semantic?cosine(a.semantic.vector,b.semantic.vector):
    1-(['line','color','tone','base'].reduce((sum,k)=>sum+Math.abs(a[k]-b[k])/(k==='base'?4:5),0)/4);
  const coherence=clamp((a.coherence+b.coherence)/2);
  // Explicit experimental policy over measured values, independent of labels/IDs.
  return {gain:coherence,memory:similarity,relation:similarity,selection:0.5,
    similarity,measurement:semantic?'semantic-cosine':'normalized-coordinate-distance'};
}
export class MorphologyCompiler{
  constructor({extensions=null}={}){this.extensions=extensions;}
  compile(connection){
    const ext=this.extensions?.get('morphology',connection.channel.id);
    if(ext) return {id:`morph-${connection.id}`,channelId:connection.channel.id,energy:connection.channel.energy,implementation:'extension',evidenceStatus:ext.status,execute:ext.value};
    const p=measured(connection);
    return {
      id:`morph-${connection.id}`,channelId:connection.channel.id,energy:connection.channel.energy,
      implementation:'feature-measured',evidenceStatus:'experimental',parameters:p,
      execute(input={}){
        const left=Number(input.left??connection.a.amplitude),right=Number(input.right??connection.b.amplitude);
        const phaseDelta=Math.abs(connection.a.phase-connection.b.phase)%(Math.PI*2);
        const phaseFit=(1+Math.cos(phaseDelta))/2;
        const coherence=clamp((connection.a.coherence+connection.b.coherence)/2);
        const relation=clamp((left+right)/2*p.relation+phaseFit*(1-p.relation));
        const transformed=clamp(((left+right)/2)*p.gain*coherence);
        const retained=clamp(transformed*p.memory + relation*(1-p.memory));
        const selected=retained>=p.selection;
        return {energy:connection.channel.energy,transformed,relation,retained,selected,phaseFit,coherence,similarity:p.similarity,measurement:p.measurement,implementation:'feature-measured',evidenceStatus:'experimental'};
      }
    };
  }
}


