// Additive Euclidean construction layer for Klein visual grammar.
// Byrne, Elements Book I, Proposition 1: construct an equilateral triangle on a finite segment.
// No gate assignment, hashes, or fabricated semantic addresses.
const EPS=1e-8;
export const point=(x,y)=>Object.freeze({x,y});
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function circleIntersections(a,ra,b,rb){
  const d=distance(a,b);
  if(d<EPS || d>ra+rb+EPS || d<Math.abs(ra-rb)-EPS) return [];
  const u=(ra*ra-rb*rb+d*d)/(2*d),h2=ra*ra-u*u;
  if(h2 < -EPS) return [];
  const h=Math.sqrt(Math.max(0,h2)),dx=(b.x-a.x)/d,dy=(b.y-a.y)/d;
  const m=point(a.x+u*dx,a.y+u*dy);
  return h<EPS?[m]:[point(m.x-h*dy,m.y+h*dx),point(m.x+h*dy,m.y-h*dx)];
}
export function equilateralOnSegment(A,B,{side='left'}={}){
  const length=distance(A,B);
  if(length<EPS) throw new RangeError('Base segment must have nonzero length');
  const intersections=circleIntersections(A,length,B,length);
  const cross=p=>(B.x-A.x)*(p.y-A.y)-(B.y-A.y)*(p.x-A.x);
  const C=intersections.find(p=>side==='left'?cross(p)>0:cross(p)<0);
  if(!C) throw new Error('No intersection on requested side');
  const points={A,B,C};
  const entities=[
    {id:'AB',kind:'segment',from:'A',to:'B',role:'given',color:'black'},
    {id:'circle-A',kind:'circle',center:'A',radiusThrough:'B',color:'blue'},
    {id:'circle-B',kind:'circle',center:'B',radiusThrough:'A',color:'red'},
    {id:'AC',kind:'segment',from:'A',to:'C',color:'yellow'},
    {id:'BC',kind:'segment',from:'B',to:'C',color:'red'}];
  const relations=[
    {predicate:'equal_length',subject:'AB',object:'AC',reason:'radii of circle-A'},
    {predicate:'equal_length',subject:'AB',object:'BC',reason:'radii of circle-B'},
    {predicate:'equal_length',subject:'AC',object:'BC',reason:'Euclid common notion 1'}];
  return {source:{work:'Oliver Byrne, The First Six Books of the Elements of Euclid (1847)',book:1,proposition:1},points,entities,relations,operations:['given AB','circle(A,AB)','circle(B,BA)','intersect circles at C','connect A-C and B-C'],address:null,addressStatus:'unassigned',proof:verifyEquilateral(points)};
}
export function verifyEquilateral({A,B,C},tolerance=1e-7){
  const sides=[distance(A,B),distance(A,C),distance(B,C)];
  return {valid:sides[0]>EPS&&Math.max(...sides)-Math.min(...sides)<=tolerance*Math.max(...sides),sides};
}
export function transformConstruction(construction,{scale=1,rotate=0,translate={x:0,y:0}}={}){
  if(!(scale>0))throw new RangeError('scale must be positive');
  const {A,B,C}=construction.points,c=Math.cos(rotate),s=Math.sin(rotate);
  const f=p=>point(translate.x+scale*(p.x*c-p.y*s),translate.y+scale*(p.x*s+p.y*c));
  const points={A:f(A),B:f(B),C:f(C)};
  return {...construction,points,proof:verifyEquilateral(points),transform:{scale,rotate,translate}};
}
// Raster adapter: supplies the existing readImage() path with real RGBA image data.
// Pixel colors identify Byrne diagram roles; they are NOT semantic gate addresses.
export function rasterizeConstruction(construction,{width=256,height=256,background=[255,255,255,255]}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new RangeError('invalid raster dimensions');
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4)data.set(background,i);
  const palette={black:[24,24,24],blue:[34,86,140],red:[215,57,40],yellow:[235,173,37]};
  const put=(x,y,color)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=width||y>=height)return;const k=4*(y*width+x);data.set([...palette[color],255],k);};
  const line=(a,b,color)=>{const n=Math.max(1,Math.ceil(distance(a,b)*2));for(let i=0;i<=n;i++){const t=i/n;put(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,color);}};
  const {points}=construction;
  for(const e of construction.entities){
    if(e.kind==='segment')line(points[e.from],points[e.to],e.color);
    if(e.kind==='circle'){const center=points[e.center],r=distance(center,points[e.radiusThrough]),n=Math.max(64,Math.ceil(2*Math.PI*r*2));for(let i=0;i<n;i++){const t=2*Math.PI*i/n;put(center.x+r*Math.cos(t),center.y+r*Math.sin(t),e.color);}}
  }
  return {width,height,data};
}
export async function readEuclidWithKlein(construction,options={}){
  const {readImage}=await import('./klein.mjs');
  return readImage(rasterizeConstruction(construction,options));
}

