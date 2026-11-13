import crypto from 'node:crypto';

const hash = x => crypto.createHash('sha256').update(String(x)).digest('hex');
const clone = v => structuredClone(v);

export class BookIngestBridge {
  constructor({registry, extractors={}}={}) {
    if (!registry) throw new Error('registry required');
    this.registry = registry;
    this.extractors = extractors;
    this.fragments = [];
  }

  ingest({sourceId, title, dimension, text, addressResolver, metadata={}}) {
    if (!sourceId || !text) throw new Error('sourceId and text required');
    const chunks = this.#segment(text);
    const out=[];
    chunks.forEach((chunk,index)=>{
      const address = addressResolver ? addressResolver({chunk,index,dimension,sourceId}) : {dimension};
      const fragmentId=`fragment_${hash(`${sourceId}:${index}:${chunk}`).slice(0,16)}`;
      const extracted={
        autoling: this.extractors.autoling?.(chunk) ?? null,
        diseminer: this.extractors.diseminer?.(chunk) ?? null,
        monteCarlo: this.extractors.monteCarlo?.(chunk) ?? null,
      };
      const fragment={fragmentId,sourceId,title:title??sourceId,dimension:dimension??null,address:clone(address),verbatim:chunk,sourceHash:hash(chunk),sequence:index,metadata:clone(metadata),extracted};
      this.fragments.push(fragment);
      this.registry.register({
        entityId:fragmentId,
        entityType:'source-fragment',
        nativeAddress:address,
        source:{sourceId,title:title??sourceId,sequence:index,hash:fragment.sourceHash,metadata:clone(metadata)},
        sayings:{[dimension ?? 'source']:chunk},
        state:{kind:'canonical-source-fragment', extracted}
      });
      out.push(clone(fragment));
    });
    return out;
  }

  #segment(text){
    return String(text).replace(/\r/g,'').split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z0-9“\"])/).map(s=>s.trim()).filter(Boolean);
  }
}

