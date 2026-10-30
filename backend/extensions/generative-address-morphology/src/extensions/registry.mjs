export class ExtensionRegistry{
  constructor(){this.maps={morphology:new Map(),projection:new Map(),process:new Map(),rule:new Map()};}
  register(kind,id,value,{status='experimental',provenance=[]}={}){
    const map=this.maps[kind];if(!map)throw new Error(`Unknown extension kind: ${kind}`);if(!id)throw new Error('extension id required');
    const row=Object.freeze({id,value,status,provenance:[...provenance]});map.set(id,row);return row;
  }
  get(kind,id){return this.maps[kind]?.get(id)??null;}
  list(kind){return [...(this.maps[kind]?.values()??[])];}
}

