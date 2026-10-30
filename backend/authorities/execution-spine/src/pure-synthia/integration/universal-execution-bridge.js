// Pure-JS universal execution bridge.
// Success-first contract:
//   1) instrumented direct probe
//   2) derive behavioral/runtime requirements from probe + artifact
//   3) Monte-Carlo search over reusable execution-rule fragments
//   4) AUTOLING records the winning rule composition
//   5) AutoWriter materializes a JavaScript execution runtime
//   6) execute + verify + remember
//   7) only after synthesis is exhausted may a legacy reconstruction fallback run.

import { HistoricalMonteCarloAutomaton } from '../automata/tools/tool-06-historical-monte-carlo.js';
import { AutolingEngine } from '../automata/tools/tool-14-autoling.js';
import { ComputationalGrammarCoder } from '../automata/tools/tool-13-computational-grammar-coder.js';
import { OPERATORS } from '../state-space/operators.js';
import { NAMED_TRANSITIONS } from '../state-space/transitions.js';
import { TOOL_REGISTRY } from '../automata/registry.js';
import { CapabilityMesh, MeshRuleSynthesizer } from './mesh-rule-synthesizer.js';
import { PaperRuntimeSandbox } from './paper-runtime-sandbox.js';
import { RuntimeAdapterRegistry } from './runtime-adapter-registry.js';

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

function extOf(name='') { const m=String(name).toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }
function asText(artifact) {
  if (typeof artifact?.content === 'string') return artifact.content;
  if (typeof artifact?.originalContent === 'string') return artifact.originalContent;
  if (artifact?.bytes instanceof Uint8Array) return new TextDecoder().decode(artifact.bytes);
  return '';
}
function asBytes(artifact) {
  if (artifact?.bytes instanceof Uint8Array) return artifact.bytes;
  return new TextEncoder().encode(asText(artifact));
}

export function detectExecutionKind(artifact={}) {
  const ext = extOf(artifact.name || artifact.originalName || '');
  const bytes = asBytes(artifact);
  if (bytes.length >= 4 && bytes[0]===0x00 && bytes[1]===0x61 && bytes[2]===0x73 && bytes[3]===0x6d) return 'wasm';
  if (['js','mjs','cjs'].includes(ext)) return 'javascript';
  if (['html','htm'].includes(ext)) return 'html';
  if (ext === 'json') return 'json';
  if (['py','pyw'].includes(ext)) return 'python';
  if (['txt','md','csv','xml','yaml','yml'].includes(ext)) return 'data';
  return ext || 'binary';
}

function makeConsoleCapture() {
  const lines=[];
  const push=(...args)=>lines.push(args.map(v=>typeof v==='string'?v:JSON.stringify(v)).join(' '));
  return { console:{log:push,info:push,warn:push,error:push}, lines };
}

async function runJavaScriptText(source, globals={}, sandbox=null) {
  if (sandbox) return sandbox.executeJavaScript(source, { context:globals });
  const cap=makeConsoleCapture();
  const names=['console', ...Object.keys(globals)];
  const values=[cap.console, ...Object.values(globals)];
  const fn=new AsyncFunction(...names, `"use strict";\n${source}\n`);
  const returnValue=await fn(...values);
  return { ok:true, engine:'javascript-semantic-runtime', stdout:cap.lines, returnValue };
}

async function runDirect(artifact, kind, sandbox=null) {
  const text=asText(artifact), bytes=asBytes(artifact);
  if (kind==='javascript') return runJavaScriptText(text, {}, sandbox);
  if (kind==='json') return {ok:true,engine:'json-native',stdout:[],returnValue:JSON.parse(text)};
  if (kind==='data') return {ok:true,engine:'data-native',stdout:[],returnValue:text};
  if (kind==='wasm') {
    if (typeof WebAssembly==='undefined') throw new Error('WebAssembly unavailable');
    if (sandbox) {
      const result=await sandbox.executeWasm(bytes, artifact.imports || {});
      return {...result, returnValue:{exports:result.exports}};
    }
    const {instance,module}=await WebAssembly.instantiate(bytes, artifact.imports || {});
    return {ok:true,engine:'wasm-native',stdout:[],returnValue:{exports:Object.keys(instance.exports),instance,module}};
  }
  if (kind==='html') {
    if (typeof document==='undefined') throw new Error('HTML execution requires browser DOM');
    const iframe=document.createElement('iframe');
    iframe.setAttribute('sandbox','allow-scripts');
    iframe.style.cssText='width:100%;min-height:320px;border:0;background:white';
    iframe.srcdoc=text;
    (artifact.mount || document.body).appendChild(iframe);
    return {ok:true,engine:'html-sandbox',stdout:[],returnValue:{mounted:true,iframe}};
  }
  throw new Error(`NO_DIRECT_EXECUTOR:${kind}`);
}

// ---------------------------------------------------------------------------
// Runtime requirement derivation
// ---------------------------------------------------------------------------
const REQ = Object.freeze({
  OUTPUT:'output', VARIABLES:'variables', ARITHMETIC:'arithmetic', BRANCH:'branch', LOOP:'loop',
  FUNCTIONS:'functions', COLLECTIONS:'collections', RANGE:'range', BUILTINS:'builtins',
  MATH:'math-module', JSON:'json-module', IMPORTS:'imports', STRING:'string-ops',
});

export function deriveExecutionRequirements(artifact, probe={}) {
  const kind=detectExecutionKind(artifact); const source=asText(artifact);
  const required=new Set(); const evidence=[];
  const add=(r,why)=>{required.add(r); evidence.push({requirement:r,evidence:why});};
  if (kind==='python') {
    if (/\bprint\s*\(/.test(source)) add(REQ.OUTPUT,'print()');
    if (/^[ \t]*[A-Za-z_]\w*\s*(?:[+\-*/%]?=)/m.test(source)) add(REQ.VARIABLES,'assignment');
    if (/[+\-*/%]/.test(source)) add(REQ.ARITHMETIC,'arithmetic operator');
    if (/^[ \t]*(?:if|elif|else)\b/m.test(source)) add(REQ.BRANCH,'conditional');
    if (/^[ \t]*(?:for|while)\b/m.test(source)) add(REQ.LOOP,'loop');
    if (/^[ \t]*def\s+/m.test(source)) add(REQ.FUNCTIONS,'function definition');
    if (/\[.*?\]|\.append\s*\(/s.test(source)) add(REQ.COLLECTIONS,'list/append');
    if (/\brange\s*\(/.test(source)) add(REQ.RANGE,'range()');
    if (/\b(?:len|sum|min|max|abs|round)\s*\(/.test(source)) add(REQ.BUILTINS,'python builtin');
    if (/\bmath\./.test(source) || /^\s*(?:import\s+math|from\s+math\s+import)/m.test(source)) add(REQ.MATH,'math module');
    if (/\bjson\./.test(source) || /^\s*(?:import\s+json|from\s+json\s+import)/m.test(source)) add(REQ.JSON,'json module');
    if (/^\s*(?:import\s+|from\s+.+\s+import\s+)/m.test(source)) add(REQ.IMPORTS,'import statement');
    if (/\.(?:upper|lower|strip|replace|split|join)\s*\(/.test(source)) add(REQ.STRING,'string method');
  }
  if (probe?.error) evidence.push({requirement:'probe-observation',evidence:String(probe.error)});
  return {kind, required:[...required], evidence, sourceBytes:asBytes(artifact).length};
}

// ---------------------------------------------------------------------------
// Execution grammar capabilities live ON THE MESH. There is no separate rule
// lookup table. These seed nodes describe the browser-side semantic grammar we
// already know; AUTOLING and the MeshRuleSynthesizer can add more nodes later.
// ---------------------------------------------------------------------------
export function registerPythonExecutionGrammar(mesh) {
  const add=(id,covers,cost=1,labels=[])=>mesh.register({
    id:`grammar:${id}`, kind:'execution-grammar', labels:[id,...covers,...labels],
    description:`execution grammar for ${covers.join(', ')}`,
    metadata:{covers:[...covers],cost}, provenance:{source:'browser-execution-grammar'}
  });
  add('py-core-values',[REQ.VARIABLES,REQ.ARITHMETIC]);
  add('py-output',[REQ.OUTPUT]);
  add('py-control-branch',[REQ.BRANCH]);
  add('py-control-loop',[REQ.LOOP]);
  add('py-functions',[REQ.FUNCTIONS]);
  add('py-collections',[REQ.COLLECTIONS]);
  add('py-range',[REQ.RANGE]);
  add('py-builtins',[REQ.BUILTINS]);
  add('py-math-contact',[REQ.MATH,REQ.IMPORTS],1,['math','numeric']);
  add('py-json-contact',[REQ.JSON,REQ.IMPORTS],1,['json','serialization']);
  add('py-import-shell',[REQ.IMPORTS],2,['module','dependency']);
  add('py-string-contact',[REQ.STRING],1,['string','text']);
  return mesh;
}

function executionGrammarNodes(mesh) {
  return mesh.allNodes().filter(n => n.kind === 'execution-grammar' && Array.isArray(n.metadata?.covers));
}

function seeded(seed=1){let a=seed>>>0;return()=>{a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function coverage(bundle, requirements){
  const covered=new Set(bundle.flatMap(r=>r.metadata.covers));
  const hit=requirements.filter(r=>covered.has(r));
  return {covered,hit,ratio:requirements.length?hit.length/requirements.length:1,missing:requirements.filter(r=>!covered.has(r))};
}

export class RuntimeRulePlanner {
  constructor({mesh,seed=18091999,generations=18,population=48}={}) {
    this.mesh=mesh || registerPythonExecutionGrammar(new CapabilityMesh());
    this.seed=seed; this.generations=generations; this.population=population;
  }
  search(requirements) {
    const req=[...requirements];
    const relevant=executionGrammarNodes(this.mesh).filter(r=>r.metadata.covers.some(c=>req.includes(c)));
    const rng=seeded(this.seed + req.join('|').length);
    const bundles=[];
    const minimal=[]; const left=new Set(req);
    while(left.size){
      const best=relevant.map(r=>({r,n:r.metadata.covers.filter(x=>left.has(x)).length})).sort((a,b)=>b.n-a.n||(a.r.metadata.cost||1)-(b.r.metadata.cost||1))[0];
      if(!best || best.n===0) break;
      minimal.push(best.r); best.r.metadata.covers.forEach(x=>left.delete(x));
    }
    bundles.push(minimal);
    for(let i=1;i<this.population;i++){
      const b=relevant.filter(()=>rng()>0.42);
      if(!b.length && relevant.length) b.push(relevant[Math.floor(rng()*relevant.length)]);
      bundles.push(b);
    }
    const scored=bundles.map((bundle,i)=>{
      const c=coverage(bundle,req); const cost=bundle.reduce((s,r)=>s+(r.metadata.cost||1),0);
      const fitness=Math.max(0.0001,c.ratio*10-cost*0.08-c.missing.length*2);
      return {id:`candidate-${i}`,bundle,cost,fitness,...c};
    });
    const variants=Object.fromEntries(scored.map(x=>[x.id,x.fitness]));
    const mc=new HistoricalMonteCarloAutomaton();
    const run=mc.run({variants,seed:this.seed,mutationScale:0.12,generations:this.generations});
    const monteCarlo=run.output || run; const finalWeights=monteCarlo.finalWeights || {};
    scored.sort((a,b)=>{const af=a.missing.length===0?1:0,bf=b.missing.length===0?1:0;return bf-af||b.ratio-a.ratio||(finalWeights[b.id]||0)-(finalWeights[a.id]||0)||a.cost-b.cost;});
    const winner=scored[0];
    return {ok:winner?.missing.length===0,winner,candidates:scored,monteCarlo};
  }
}

function convertPyExpr(expr) {
  let s=String(expr).trim();
  s=s.replace(/\bTrue\b/g,'true').replace(/\bFalse\b/g,'false').replace(/\bNone\b/g,'null')
    .replace(/\band\b/g,'&&').replace(/\bor\b/g,'||').replace(/\bnot\s+/g,'!')
    .replace(/\blen\(([^()]+)\)/g,'($1).length')
    .replace(/\bsum\(([^()]+)\)/g,'__py.sum($1)')
    .replace(/\bmin\(([^()]+)\)/g,'__py.min($1)')
    .replace(/\bmax\(([^()]+)\)/g,'__py.max($1)')
    .replace(/\babs\(([^()]+)\)/g,'Math.abs($1)')
    .replace(/\bround\(([^()]+)\)/g,'Math.round($1)')
    .replace(/\bmath\.(sqrt|floor|ceil|pow|sin|cos|tan|log|exp)\s*\(/g,'Math.$1(')
    .replace(/\.append\s*\(/g,'.push(')
    .replace(/\.upper\(\)/g,'.toUpperCase()').replace(/\.lower\(\)/g,'.toLowerCase()')
    .replace(/\.strip\(\)/g,'.trim()');
  return s;
}

function emitPythonWithRules(source, selectedRuleIds=[]) {
  const selected=new Set(selectedRuleIds); const out=[]; const unsupported=[]; const blocks=[];
  const active=(id)=>selected.has(id);
  if(active('py-builtins')||active('py-range')||active('py-collections')) {
    out.push(`const __py={sum:(x)=>Array.from(x).reduce((a,b)=>a+b,0),min:(x)=>Math.min(...Array.from(x)),max:(x)=>Math.max(...Array.from(x)),range:(a,b,s=1)=>{if(b===undefined){b=a;a=0}const r=[];if(s===0)throw new Error('range step 0');if(s>0){for(let i=a;i<b;i+=s)r.push(i)}else{for(let i=a;i>b;i+=s)r.push(i)}return r}};`);
  }
  const lines=String(source).replace(/\r/g,'').split('\n');
  const closeTo=(indent)=>{while(blocks.length && indent<blocks.at(-1).bodyIndent){out.push('}');blocks.pop();}};
  for(let idx=0;idx<lines.length;idx++){
    const raw=lines[idx]; const trimmed=raw.trim();
    if(!trimmed || trimmed.startsWith('#')) continue;
    const indent=(raw.match(/^\s*/)?.[0]||'').replace(/\t/g,'    ').length;
    closeTo(indent);
    let m;
    if((m=trimmed.match(/^import\s+([A-Za-z_]\w*)\s*$/))){
      const mod=m[1];
      if(mod==='math'&&active('py-math-contact')){out.push('const math=Math;');continue;}
      if(mod==='json'&&active('py-json-contact')){out.push('const json={loads:JSON.parse,dumps:JSON.stringify};');continue;}
      unsupported.push({line:idx+1,source:trimmed,reason:`unsatisfied-import:${mod}`});continue;
    }
    if((m=trimmed.match(/^from\s+math\s+import\s+(.+)$/))&&active('py-math-contact')){
      for(const n of m[1].split(',').map(x=>x.trim())) out.push(`const ${n}=Math.${n};`); continue;
    }
    if((m=trimmed.match(/^print\((.*)\)\s*$/))&&active('py-output')){out.push(`console.log(${convertPyExpr(m[1])});`);continue;}
    if((m=trimmed.match(/^def\s+([A-Za-z_]\w*)\(([^)]*)\):\s*$/))&&active('py-functions')){out.push(`function ${m[1]}(${m[2]}) {`);blocks.push({bodyIndent:indent+1});continue;}
    if((m=trimmed.match(/^if\s+(.+):\s*$/))&&active('py-control-branch')){out.push(`if (${convertPyExpr(m[1])}) {`);blocks.push({bodyIndent:indent+1});continue;}
    if((m=trimmed.match(/^elif\s+(.+):\s*$/))&&active('py-control-branch')){if(blocks.length){out.push('}');blocks.pop();}out.push(`else if (${convertPyExpr(m[1])}) {`);blocks.push({bodyIndent:indent+1});continue;}
    if(/^else:\s*$/.test(trimmed)&&active('py-control-branch')){if(blocks.length){out.push('}');blocks.pop();}out.push('else {');blocks.push({bodyIndent:indent+1});continue;}
    if((m=trimmed.match(/^for\s+([A-Za-z_]\w*)\s+in\s+range\(([^)]*)\):\s*$/))&&active('py-control-loop')&&active('py-range')){
      const p=m[2].split(',').map(x=>convertPyExpr(x.trim()));let start='0',end,step='1';if(p.length===1)end=p[0];else{start=p[0];end=p[1];if(p[2])step=p[2];}
      out.push(`for (let ${m[1]}=${start}; (${step})>=0 ? ${m[1]}<${end} : ${m[1]}>${end}; ${m[1]}+=(${step})) {`);blocks.push({bodyIndent:indent+1});continue;
    }
    if((m=trimmed.match(/^while\s+(.+):\s*$/))&&active('py-control-loop')){out.push(`while (${convertPyExpr(m[1])}) {`);blocks.push({bodyIndent:indent+1});continue;}
    if((m=trimmed.match(/^return(?:\s+(.+))?\s*$/))&&active('py-functions')){out.push(`return${m[1]?' '+convertPyExpr(m[1]):''};`);continue;}
    if((m=trimmed.match(/^([A-Za-z_]\w*)\s*([+\-*/%]?=)\s*(.+)$/))&&active('py-core-values')){
      const decl=m[2]==='='?'let ':'';out.push(`${decl}${m[1]} ${m[2]} ${convertPyExpr(m[3])};`);continue;
    }
    if((m=trimmed.match(/^([A-Za-z_]\w*)\.append\((.*)\)\s*$/))&&active('py-collections')){out.push(`${m[1]}.push(${convertPyExpr(m[2])});`);continue;}
    if((m=trimmed.match(/^([A-Za-z_]\w*)\((.*)\)\s*$/))){out.push(`${m[1]}(${convertPyExpr(m[2])});`);continue;}
    unsupported.push({line:idx+1,source:trimmed,reason:'no-selected-rule'});
  }
  closeTo(-1);
  return {javascript:out.join('\n'),unsupported};
}

export class RuntimeAutoWriter {
  constructor(){this.autoling=new AutolingEngine();this.coder=new ComputationalGrammarCoder();}
  materialize({artifact,requirements,plan}) {
    const ids=plan.winner.bundle.map(r=>String(r.id).replace(/^grammar:/,''));
    const sentence=`runtime requires ${requirements.required.join(' ')} using ${ids.join(' ')}`;
    const coded=this.coder.code(sentence);
    const example={input:{constraints:requirements.required},output:`compose ${ids.join(' then ')}`};
    const learnedRule=this.autoling.induceRule([example]);
    if(requirements.kind!=='python') return {ok:false,reason:'no-rule-emitter-for-kind',kind:requirements.kind,ids,coded,learnedRule};
    const emitted=emitPythonWithRules(asText(artifact),ids);
    return {ok:emitted.unsupported.length===0,kind:'python',selectedRules:ids,javascript:emitted.javascript,unsupported:emitted.unsupported,coded,learnedRule};
  }
}

// Legacy second scan retained only as a last fallback candidate, not privileged.
export function rebuildPythonToJS(source) {
  const mesh=registerPythonExecutionGrammar(new CapabilityMesh());
  const all=executionGrammarNodes(mesh).map(r=>String(r.id).replace(/^grammar:/,''));
  const emitted=emitPythonWithRules(source,all);
  const executableLines=String(source).split('\n').filter(x=>x.trim()&&!x.trim().startsWith('#')).length;
  return {language:'python',javascript:emitted.javascript,unsupported:emitted.unsupported,coverage:executableLines?1-emitted.unsupported.length/executableLines:1};
}
export function secondScanRebuild(artifact, firstError) {
  const kind=detectExecutionKind(artifact);
  if(kind==='python') {const rebuilt=rebuildPythonToJS(asText(artifact));return {...rebuilt,sourceKind:kind,firstError:String(firstError?.message||firstError||''),equivalentCandidate:rebuilt.unsupported.length===0};}
  return {sourceKind:kind,javascript:'',unsupported:[{reason:'no-semantic-rebuilder',source:kind}],coverage:0,equivalentCandidate:false,firstError:String(firstError?.message||firstError||'')};
}

export class UniversalExecutionBridge {
  constructor({remember=true,seed=18091999,capabilityMesh=null,sandbox=null,runtimeAdapters=[]}={}) {
    this.remember=remember;
    this.learned=new Map();
    // Execution chamber only. It does not choose a language/runtime; the mesh does.
    this.sandbox=sandbox || new PaperRuntimeSandbox({allowHostFallback:true});
    this.runtimeAdapters = runtimeAdapters instanceof RuntimeAdapterRegistry
      ? runtimeAdapters
      : new RuntimeAdapterRegistry(runtimeAdapters);
    this.capabilityMesh=capabilityMesh || new CapabilityMesh();
    registerPythonExecutionGrammar(this.capabilityMesh);
    this.meshSynthesizer=new MeshRuleSynthesizer({mesh:this.capabilityMesh,seed});
    this.meshSynthesizer.ingestRuntimeInventory({operators:OPERATORS,transitions:NAMED_TRANSITIONS,automata:TOOL_REGISTRY});
    this.planner=new RuntimeRulePlanner({mesh:this.capabilityMesh,seed});
    this.writer=new RuntimeAutoWriter();
  }
  key(artifact){return `${artifact.name||artifact.originalName||'artifact'}:${asBytes(artifact).length}:${simpleHash(asBytes(artifact))}`;}
  registerRuntime(adapter){ return this.runtimeAdapters.register(adapter); }
  listRuntimes(){ return this.runtimeAdapters.list(); }
  async execute(artifact, context={}) {
    const kind=detectExecutionKind(artifact); const key=this.key(artifact);

    // Runtime-first: a real registered runtime gets first refusal. This makes
    // `universal` mean the original artifact is executed by an appropriate
    // engine when one is available, rather than silently translating it to JS.
    const native = await this.runtimeAdapters.execute({ artifact, kind, context });
    if (native) {
      return {
        ok:Boolean(native.result?.ok),
        path:'registered-runtime',
        kind,
        probe:true,
        reused:false,
        runtimeAdapter:native.adapterId,
        result:native.result,
      };
    }
    if(this.learned.has(key)) {
      const learned=this.learned.get(key); const result=await runJavaScriptText(learned.javascript,{},this.sandbox);
      return {ok:true,path:'learned-synthesized-runtime',kind,probe:true,reused:true,synthesis:learned,result};
    }
    let probeResult=null, firstError=null;
    try {
      probeResult=await runDirect(artifact,kind,this.sandbox);
      return {ok:true,path:'direct-probe-complete',kind,probe:true,reused:false,result:probeResult};
    } catch(error) { firstError=error; }

    const requirements=deriveExecutionRequirements(artifact,{error:firstError});
    const gapContext={
      targetGate:context.targetGate ?? context.canonicalAddress?.gate ?? null,
      canonicalAddress:context.canonicalAddress || null,
      requiredCapability:requirements.required.join('+') || `execute:${kind}`,
      requirements:requirements.required,
      evidence:requirements.evidence,
      probe:{error:String(firstError?.message||firstError||'')},
      behavioralContract:context.behavioralContract || null,
      analysis:context.analysis || null,
    };
    // The generative bridge is wired here. It may only promote a derived rule
    // when the caller supplies a real retry probe against the original artifact.
    // Without that evidence it returns PROBE_REQUIRED and cannot silently install.
    const meshSynthesis=await this.meshSynthesizer.synthesize(gapContext,{
      probeCandidate:typeof context.retryWithCapability==='function'
        ? async (execute,candidate)=>context.retryWithCapability({artifact,kind,execute,candidate,gapContext})
        : undefined
    });
    const plan=this.planner.search(requirements.required);
    if(plan.ok) {
      const synthesis=this.writer.materialize({artifact,requirements,plan});
      if(synthesis.ok) {
        try {
          const result=await runJavaScriptText(synthesis.javascript,{},this.sandbox);
          const learned={...synthesis,requirements,planSummary:{winner:plan.winner.id,fitness:plan.winner.fitness,cost:plan.winner.cost,monteCarloDominant:plan.monteCarlo.dominantVariant},probeError:String(firstError?.message||firstError||'')};
          if(this.remember) this.learned.set(key,learned);
          return {ok:true,path:'state-space-runtime-synthesis',kind,probe:true,reused:false,meshSynthesis,firstError:String(firstError?.message||firstError),requirements,plan:learned.planSummary,synthesis:learned,result};
        } catch(synthesisError) {
          // Execution itself is new evidence. Only now is the legacy reconstruction allowed.
          const fallback=secondScanRebuild(artifact,synthesisError);
          if(fallback.equivalentCandidate) {
            try {const result=await runJavaScriptText(fallback.javascript,{},this.sandbox); if(this.remember)this.learned.set(key,{...fallback,requirements,probeError:String(firstError?.message||firstError||'')}); return {ok:true,path:'exhausted-synthesis-fallback',kind,probe:true,reused:false,firstError:String(firstError?.message||firstError),synthesisError:String(synthesisError?.message||synthesisError),requirements,mirror:fallback,result};}
            catch(fallbackError){return {ok:false,path:'runtime-synthesis-and-fallback-failed',kind,probe:true,firstError:String(firstError?.message||firstError),synthesisError:String(synthesisError?.message||synthesisError),fallbackError:String(fallbackError?.message||fallbackError),requirements,synthesis,mirror:fallback};}
          }
          return {ok:false,path:'runtime-synthesis-execution-failed',kind,probe:true,meshSynthesis,firstError:String(firstError?.message||firstError),synthesisError:String(synthesisError?.message||synthesisError),requirements,synthesis};
        }
      }
    }
    const fallback=secondScanRebuild(artifact,firstError);
    if(fallback.equivalentCandidate){try{const result=await runJavaScriptText(fallback.javascript,{},this.sandbox);if(this.remember)this.learned.set(key,{...fallback,requirements,probeError:String(firstError?.message||firstError||'')});return{ok:true,path:'exhausted-planner-fallback',kind,probe:true,reused:false,meshSynthesis,firstError:String(firstError?.message||firstError),requirements,plan,mirror:fallback,result};}catch(secondError){return{ok:false,path:'planner-and-fallback-failed',kind,probe:true,meshSynthesis,firstError:String(firstError?.message||firstError),secondError:String(secondError?.message||secondError),requirements,plan,mirror:fallback};}}
    return {ok:false,path:'runtime-requirements-unsatisfied',kind,probe:true,reused:false,meshSynthesis,firstError:String(firstError?.message||firstError),requirements,plan,mirror:fallback};
  }
}

function simpleHash(bytes){let h=2166136261>>>0;for(let i=0;i<bytes.length;i++){h^=bytes[i];h=Math.imul(h,16777619)>>>0;}return h.toString(16).padStart(8,'0');}
export default UniversalExecutionBridge;

