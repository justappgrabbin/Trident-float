const $ = selector => document.querySelector(selector);
const ns = 'http://www.w3.org/2000/svg';
function element(tag, text, parent) { const node = document.createElement(tag); if (text != null) node.textContent = text; parent?.append(node); return node; }
function shape(tag, attributes, text) { const node = document.createElementNS(ns, tag); for (const [k,v] of Object.entries(attributes)) node.setAttribute(k,v); if(text != null) node.textContent=text; return node; }
function table(parent, headers, rows) {
  const node=element('table',null,parent), head=element('tr',null,element('thead',null,node)); headers.forEach(h=>element('th',h,head));
  const body=element('tbody',null,node); rows.forEach(row=>{const tr=element('tr',null,body);row.forEach(value=>element('td',value,tr));});
}
function draw(state) {
  const svg=$('#graph');svg.replaceChildren();
  const positions=new Map(state.model.nodes.map(n=>[n.id,[380+n.position[0]*235,245+n.position[1]*155*($('#flip').checked?-1:1)]]));
  const live=new Set(state.space.contributors), open=new Set(state.space.interactions.map(r=>r.id));
  for(const edge of state.model.relations){const a=positions.get(edge.from),b=positions.get(edge.to);svg.append(shape('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],class:`edge ${open.has(edge.id)?'open':''}`,'stroke-dasharray':edge.kind==='diagonal'?'6 5':'none'}));
    if(edge.kind!=='diagonal') svg.append(shape('text',{x:(a[0]+b[0])/2,y:(a[1]+b[1])/2-10,'text-anchor':'middle'},edge.label));}
  for(const n of state.model.nodes){const [x,y]=positions.get(n.id), group=shape('g',{class:live.has(n.id)?'':'inactive'});group.append(shape('rect',{x:x-110,y:y-44,width:220,height:88,rx:12,class:`node ${state.view.observer.governingField===n.id?'governing':''}`}));
    const text=shape('text',{x,y:y-14,'text-anchor':'middle'}); n.labels.slice(0,4).forEach((label,i)=>text.append(shape('tspan',{x,dy:i?17:0},label)));group.append(text);svg.append(group);}
  svg.append(shape('rect',{x:298,y:207,width:164,height:76,rx:16,class:'node'}));
  const center=shape('text',{x:380,y:234,'text-anchor':'middle'},'P · Space');center.append(shape('tspan',{x:380,dy:20},state.space.expression?.join(' / ')??'emergent interplay'));svg.append(center);
}
let current;
function render(state){
  current=state;draw(state);
  $('#frame').textContent=`Source: ${state.view.label}. Starting question: ${state.view.observer.question??'unspecified'}. Governing field: ${state.view.observer.governingField??'unspecified'}. ${state.view.observer.ordering}.`;
  $('#spaceState').textContent=`Space: ${state.space.status}. Contributors: ${state.space.contributors.join(', ')||'none detected'}.`;
  $('#capacity').textContent=`${BigInt(state.spaceCapacity.capacity).toLocaleString()} representable nested positions at ${state.spaceCapacity.depth} level(s); generated on demand. Valid meanings depend on established rules.`;
  $('#agents').replaceChildren();for(const a of state.swarm.agents)element('div',`${a.id} · ${a.operation} · ${a.status}`,$('#agents'));if(!state.swarm.agents.length)element('p','No supported field observations for this input.',$('#agents'));
  $('#meanings').textContent=JSON.stringify(state.interpretations.length?state.interpretations:'No coordinates selected. Missing values remain unspecified.',null,2);
  $('#fields').replaceChildren();table($('#fields'),['Field','Structural role','Source properties','Source'],state.view.fields.map(f=>[f.dimension+(f.governing?' · governing':''),f.role,JSON.stringify(f.properties,null,2),f.source]));
  $('#tables').replaceChildren();if(state.view.color){element('h3','Color / motivation',$('#tables'));table($('#tables'),['Color','Response','Modes','Binary'],state.view.color.entries.map(c=>[c.value.n,c.value.response,c.value.mode.join(' / '),c.value.binary]));}
  if(state.view.tone){element('h3','Tone / sound',$('#tables'));table($('#tables'),['Tone','Theme as printed','Department','Binary as printed'],state.view.tone.entries.map(c=>[c.value.n,c.value.theme.printed,c.value.department,c.value.binary]));}
  if(state.view.conditions){element('h3','Three conditions',$('#tables'));element('pre',JSON.stringify(state.view.conditions,null,2),$('#tables'));}
  $('#trace').textContent=JSON.stringify(state,null,2);
}
async function read(){
  $('#error').textContent='';$('#status').textContent='Reading…';$('#coordinateControls').hidden=$('#view').value!=='motivation';
  const context={view:$('#view').value,example:$('#example').value,depth:Number($('#depth').value),frame:{question:$('#question').value||null,governingField:$('#governing').value||null}};
  if($('#active').value!=='observed')context.activeFields=$('#active').value==='all'?['M','E','B','I']:['M','I'];
  if($('#view').value==='motivation')context.coordinates=[Object.fromEntries(['color','tone','base'].filter(k=>$('#'+k).value!=='').map(k=>[k,Number($('#'+k).value)]))];
  try{const response=await fetch('/api/structure',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({subject:{text:$('#subject').value},context})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Reading failed');render(result.derivation.output.snapshot.structure);$('#status').textContent='Live · CPU structural model';}
  catch(error){$('#error').textContent=error.message;$('#status').textContent='Check input';}
}
$('#structureForm').addEventListener('submit',event=>{event.preventDefault();read();});
$('#view').addEventListener('change',()=>read());$('#flip').addEventListener('change',()=>{if(current)draw(current);});read();

