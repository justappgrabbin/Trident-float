import fs from 'node:fs';
export class ChannelRegistry{
  constructor(rows=[]){this.rows=new Map();this.byPair=new Map();for(const r of rows)this.register(r);}
  static fromFile(path){return new ChannelRegistry(JSON.parse(fs.readFileSync(path,'utf8')));}
  register(row){
    if(!row?.id||!Array.isArray(row.gates)||row.gates.length!==2)throw new TypeError('channel requires id + two gates');
    const frozen=Object.freeze({...row,gates:Object.freeze([...row.gates])});
    this.rows.set(row.id,frozen);this.byPair.set(this.key(...row.gates),frozen);return frozen;
  }
  key(a,b){return [Number(a),Number(b)].sort((x,y)=>x-y).join('-');}
  find(a,b){return this.byPair.get(this.key(a,b))??null;}
  list(){return [...this.rows.values()];}
}

