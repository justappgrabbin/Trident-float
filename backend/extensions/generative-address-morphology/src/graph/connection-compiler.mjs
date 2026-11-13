import {pairKey} from '../core/address.mjs';
export class ConnectionCompiler{
  constructor({channels,rules,morphology}){this.channels=channels;this.rules=rules;this.morphology=morphology;}
  compile(a,b,context={}){
    const channel=this.channels.find(a.gate,b.gate);
    const audit=this.rules.evaluate('connection',{a,b,channel,context});
    if(!audit.pass)return {formed:false,a:a.id,b:b.id,channel:channel??null,audit};
    const provisional=audit.results.some(r=>r.status==='experimental');
    const id=`conn-${channel.id}-${pairKey(a,b)}`;
    const connection={id,formed:true,a,b,channel,audit,validity:provisional?'provisional':'active',context,createdAt:Date.now()};
    connection.morphology=this.morphology.compile(connection);
    return connection;
  }
  compileAll(addresses,context={}){
    const out=[];for(let i=0;i<addresses.length;i++)for(let j=i+1;j<addresses.length;j++){const c=this.compile(addresses[i],addresses[j],context);if(c.formed)out.push(c);}return out;
  }
}

