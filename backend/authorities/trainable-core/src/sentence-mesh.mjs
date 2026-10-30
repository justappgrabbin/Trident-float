const clone=v=>structuredClone(v);

export class SentenceMesh {
  constructor(){ this.links=[]; }
  link({from,to,relation='meets',direction='forward',metadata={}}){
    const edge={from,to,relation,direction,metadata:clone(metadata),createdAt:new Date().toISOString()};
    this.links.push(edge); return clone(edge);
  }

  compose({records, lens=null, includeAddress=false}={}){
    const ordered=(records??[]).filter(Boolean);
    const parts=[];
    for(const rec of ordered){
      const sayings=rec.sayings??{};
      let value=null;
      if(lens && sayings[lens]!=null) value=sayings[lens];
      else value=Object.values(sayings).find(v=>typeof v==='string'&&v.trim()) ?? null;
      if(value) parts.push(String(value).trim());
      if(includeAddress && rec.currentAddressKey) parts.push(`[${rec.currentAddressKey}]`);
    }
    return {lens, sentence:parts.join(' ').replace(/\s+/g,' ').trim(), parts, sourceCount:ordered.length};
  }

  explainContact(a,b,{lens=null,relation='contacts'}={}){
    const composed=this.compose({records:[a,b],lens});
    return {...composed, relation, participants:[a?.entityId,b?.entityId].filter(Boolean)};
  }
}

