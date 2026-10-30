// Local conditional neural image field. No inference provider or downloaded weights.
export const DIMENSIONS = ['Being','Evolution','Movement','Design','Space'];
export const DEFAULT_ADDRESS = {planetary:1,dimension:'Being',gate:1,line:1,color:1,tone:1,base:1,degree:0,minute:0,second:0,arc:{axis:'Horizontal',arcUnit:1},zodiac:1,house:1};
const ranges = {planetary:[1,13],gate:[1,64],line:[1,6],color:[1,6],tone:[1,6],base:[1,5],degree:[0,29],minute:[0,59],second:[0,59],zodiac:[1,12],house:[1,12]};
export function encodeAddress(a, emotions=[0,0,0,0,0,0], phase=0) {
  const v=[];
  for(const [k,[lo,hi]] of Object.entries(ranges)) {
    if(!Number.isFinite(a[k]) || a[k]<lo || a[k]>hi || !Number.isInteger(a[k])) throw Error(`Invalid ${k}: expected integer ${lo}–${hi}`);
    v.push(2*(a[k]-lo)/(hi-lo)-1);
  }
  if(!DIMENSIONS.includes(a.dimension)) throw Error('Unknown dimension');
  v.push(...DIMENSIONS.map(x=>x===a.dimension?1:0));
  const axes=['Vertical','Horizontal','Diagonal'];
  if(!a.arc || !axes.includes(a.arc.axis) || !Number.isInteger(a.arc.arcUnit) || a.arc.arcUnit<1 || a.arc.arcUnit>99) throw Error('Invalid arc axis/unit');
  v.push(...axes.map(x=>x===a.arc.axis?1:0),(a.arc.arcUnit-1)/49-1);
  if(emotions.length!==6 || emotions.some(x=>!Number.isFinite(x)||x<0||x>1) || !Number.isFinite(phase)||phase<0||phase>1) throw Error('Emotion and phase values must be 0–1');
  return Float32Array.from([...v,...emotions,phase]);
}
export const CONDITION_SIZE = encodeAddress(DEFAULT_ADDRESS).length;
// 4x4 RGB global image descriptor + local RGB + x/y Fourier coordinates + condition.
export const INPUT_SIZE = 48+3+10+CONDITION_SIZE;
export function descriptor(image,size) {
  if(image.length!==size*size*3) throw Error('Invalid RGB image shape');
  const out=new Float32Array(48), counts=new Uint32Array(16);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const b=Math.floor(y*4/size)*4+Math.floor(x*4/size); counts[b]++;
    for(let c=0;c<3;c++)out[b*3+c]+=image[(y*size+x)*3+c];
  }
  for(let b=0;b<16;b++)for(let c=0;c<3;c++)out[b*3+c]=2*out[b*3+c]/counts[b]-1;
  return out;
}
export function features(image,size,pixel,condition,desc=descriptor(image,size)) {
  if(condition.length!==CONDITION_SIZE)throw Error('Condition shape mismatch');
  const v=new Float32Array(INPUT_SIZE);v.set(desc);
  for(let c=0;c<3;c++)v[48+c]=image[pixel*3+c]*2-1;
  const x=(pixel%size)/Math.max(1,size-1)*2-1,y=Math.floor(pixel/size)/Math.max(1,size-1)*2-1;
  v[51]=x;v[52]=y;let j=53;
  for(const q of [x,y])for(const f of [1,2]){v[j++]=Math.sin(Math.PI*f*q);v[j++]=Math.cos(Math.PI*f*q);}
  v.set(condition,61);return v;
}
export function rng(seed=42){let s=seed>>>0;return()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296;};}
export class ImageField {
  constructor(hidden=32,seed=42){
    if(![16,32,64].includes(hidden))throw Error('Hidden size must be 16, 32 or 64');
    this.hidden=hidden;const r=rng(seed);
    this.w1=Float32Array.from({length:INPUT_SIZE*hidden},()=> (r()*2-1)*Math.sqrt(6/(INPUT_SIZE+hidden)));
    this.b1=new Float32Array(hidden);
    this.w2=Float32Array.from({length:hidden*3},()=> (r()*2-1)*Math.sqrt(6/(hidden+3)));
    this.b2=new Float32Array(3);this.steps=0;
    this.m=[this.w1,this.b1,this.w2,this.b2].map(x=>new Float32Array(x.length));
    this.v=this.m.map(x=>new Float32Array(x.length));
  }
  forward(x){
    const h=new Float32Array(this.hidden),out=new Float32Array(3);
    for(let j=0;j<this.hidden;j++){let z=this.b1[j];for(let i=0;i<INPUT_SIZE;i++)z+=x[i]*this.w1[i*this.hidden+j];h[j]=Math.tanh(z);}
    for(let c=0;c<3;c++){let z=this.b2[c];for(let j=0;j<this.hidden;j++)z+=h[j]*this.w2[j*3+c];out[c]=1/(1+Math.exp(-z));}
    return {h,out};
  }
  batch(samples,lr=0.003){
    const ps=[this.w1,this.b1,this.w2,this.b2],gs=ps.map(p=>new Float32Array(p.length));let loss=0;
    for(const {x,y} of samples){const {h,out}=this.forward(x),d=new Float32Array(3);
      for(let c=0;c<3;c++){const e=out[c]-y[c];loss+=e*e/3;d[c]=2*e/3*out[c]*(1-out[c]);gs[3][c]+=d[c];for(let j=0;j<this.hidden;j++)gs[2][j*3+c]+=h[j]*d[c];}
      for(let j=0;j<this.hidden;j++){let dh=0;for(let c=0;c<3;c++)dh+=d[c]*this.w2[j*3+c];dh*=1-h[j]*h[j];gs[1][j]+=dh;for(let i=0;i<INPUT_SIZE;i++)gs[0][i*this.hidden+j]+=x[i]*dh;}
    }
    this.steps++;const b1=1-Math.pow(.9,this.steps),b2=1-Math.pow(.999,this.steps);
    for(let p=0;p<ps.length;p++)for(let i=0;i<ps[p].length;i++){
      const g=gs[p][i]/samples.length;this.m[p][i]=.9*this.m[p][i]+.1*g;this.v[p][i]=.999*this.v[p][i]+.001*g*g;
      ps[p][i]-=lr*(this.m[p][i]/b1)/(Math.sqrt(this.v[p][i]/b2)+1e-8);
    }
    return loss/samples.length;
  }
  render(image,size,condition){const d=descriptor(image,size),out=new Float32Array(image.length);for(let p=0;p<size*size;p++)out.set(this.forward(features(image,size,p,condition,d)).out,p*3);return out;}
  save(){return {format:'modelmaker-image-field-v1',inputSize:INPUT_SIZE,conditionSize:CONDITION_SIZE,hidden:this.hidden,steps:this.steps,...Object.fromEntries(['w1','b1','w2','b2'].map(k=>[k,Array.from(this[k])]))};}
  static load(o){
    if(o.format!=='modelmaker-image-field-v1'||o.inputSize!==INPUT_SIZE||o.conditionSize!==CONDITION_SIZE)throw Error('Incompatible model format');
    const m=new ImageField(o.hidden);
    for(const k of ['w1','b1','w2','b2']){if(!Array.isArray(o[k])||o[k].length!==m[k].length||o[k].some(x=>!Number.isFinite(x)))throw Error(`Invalid ${k} weights`);m[k].set(o[k]);}
    if(!Number.isInteger(o.steps)||o.steps<1)throw Error('Model has no trained steps');m.steps=o.steps;return m;
  }
}

