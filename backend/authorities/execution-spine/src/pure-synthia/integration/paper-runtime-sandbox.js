/**
 * Paper Runtime Sandbox — pure-JS execution chamber for Synthia.
 *
 * This module deliberately contains NO language dispatch table and NO external
 * language runtime (no Pyodide, no CDN compiler, no backend). The mesh/state
 * space remains the brain. This is only the execution chamber at the end of
 * the reasoning loop:
 *
 *   artifact -> probe/analyze/mesh synthesis -> executable JS/wasm plan
 *            -> this sandbox -> observation -> mesh
 *
 * Browser: executes inside a dedicated Web Worker with an in-memory VFS.
 * Non-browser/test environments may use the explicit host fallback.
 */

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function cloneable(value) {
  try { return structuredClone(value); }
  catch { return value == null ? value : JSON.parse(JSON.stringify(value)); }
}

export class MemoryVFS {
  constructor() { this.files = new Map(); }
  put(path, value) {
    const key = normalizePath(path);
    const bytes = value instanceof Uint8Array
      ? new Uint8Array(value)
      : new TextEncoder().encode(String(value ?? ''));
    this.files.set(key, bytes);
    return { path:key, size:bytes.byteLength };
  }
  get(path) {
    const key = normalizePath(path);
    const bytes = this.files.get(key);
    return bytes ? new Uint8Array(bytes) : null;
  }
  text(path) {
    const bytes = this.get(path);
    return bytes ? new TextDecoder().decode(bytes) : null;
  }
  has(path) { return this.files.has(normalizePath(path)); }
  delete(path) { return this.files.delete(normalizePath(path)); }
  list(prefix = '/') {
    const p = normalizePath(prefix);
    return [...this.files.entries()]
      .filter(([path]) => p === '/' || path.startsWith(p))
      .map(([path, bytes]) => ({ path, size:bytes.byteLength }));
  }
  snapshot() {
    return [...this.files.entries()].map(([path, bytes]) => ({ path, bytes:new Uint8Array(bytes) }));
  }
}

function normalizePath(path) {
  let out = String(path || '/').replace(/\\/g, '/');
  if (!out.startsWith('/')) out = '/' + out;
  out = out.replace(/\/+/g, '/');
  const parts=[];
  for (const part of out.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return '/' + parts.join('/');
}

function workerSource() {
  return String.raw`
    const files = new Map();
    const norm = p => {
      let out=String(p||'/').replace(/\\\\/g,'/');
      if(!out.startsWith('/')) out='/'+out;
      const parts=[];
      for(const part of out.split('/')){
        if(!part||part==='.') continue;
        if(part==='..') parts.pop(); else parts.push(part);
      }
      return '/'+parts.join('/');
    };
    const put=(path,value)=>{
      const key=norm(path);
      const bytes=value instanceof Uint8Array?new Uint8Array(value):new TextEncoder().encode(String(value??''));
      files.set(key,bytes); return {path:key,size:bytes.byteLength};
    };
    const api={
      readBytes:path=>{const b=files.get(norm(path));return b?new Uint8Array(b):null;},
      readText:path=>{const b=files.get(norm(path));return b?new TextDecoder().decode(b):null;},
      write:(path,value)=>put(path,value),
      exists:path=>files.has(norm(path)),
      list:(prefix='/')=>{const p=norm(prefix);return [...files.entries()].filter(([k])=>p==='/'||k.startsWith(p)).map(([path,b])=>({path,size:b.byteLength}));},
      remove:path=>files.delete(norm(path))
    };
    const capture=()=>{const stdout=[];const push=(...xs)=>stdout.push(xs.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '));return {stdout,console:{log:push,info:push,warn:push,error:push}};};

    self.onmessage=async e=>{
      const {id,op}=e.data||{};
      try{
        if(op==='mount'){
          for(const f of e.data.files||[]) put(f.path,new Uint8Array(f.bytes));
          self.postMessage({id,ok:true,result:api.list('/')}); return;
        }
        if(op==='vfs'){
          const {action,path,value}=e.data;
          let result;
          if(action==='write') result=put(path,value);
          else if(action==='readText') result=api.readText(path);
          else if(action==='readBytes') result=api.readBytes(path);
          else if(action==='list') result=api.list(path||'/');
          else if(action==='exists') result=api.exists(path);
          else if(action==='remove') result=api.remove(path);
          else throw new Error('UNKNOWN_VFS_ACTION');
          self.postMessage({id,ok:true,result}); return;
        }
        if(op==='execute-js'){
          const cap=capture();
          const payload=e.data.payload??{};
          const source=String(e.data.source||'');
          const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
          const fn=new AsyncFunction('payload','vfs','console','context',\`"use strict";\\n\${source}\\n\`);
          const returnValue=await fn(payload,api,cap.console,e.data.context||{});
          self.postMessage({id,ok:true,result:{ok:true,engine:'pure-js-worker',stdout:cap.stdout,returnValue}}); return;
        }
        if(op==='execute-wasm'){
          const bytes=new Uint8Array(e.data.bytes||[]);
          const {instance}=await WebAssembly.instantiate(bytes,e.data.imports||{});
          self.postMessage({id,ok:true,result:{ok:true,engine:'wasm-worker',stdout:[],exports:Object.keys(instance.exports)}}); return;
        }
        throw new Error('UNKNOWN_SANDBOX_OPERATION');
      }catch(error){self.postMessage({id,ok:false,error:String(error?.stack||error?.message||error)});}
    };
  `;
}

export class PaperRuntimeSandbox {
  constructor({ allowHostFallback = true } = {}) {
    this.vfs = new MemoryVFS();
    this.pending = new Map();
    this.seq = 0;
    this.allowHostFallback = allowHostFallback;
    this.worker = null;
    this.workerURL = null;
    this.initWorker();
  }

  initWorker() {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return false;
    const blob = new Blob([workerSource()], { type:'application/javascript' });
    this.workerURL = URL.createObjectURL(blob);
    this.worker = new Worker(this.workerURL);
    this.worker.onmessage = e => {
      const msg=e.data||{};
      const pending=this.pending.get(msg.id);
      if(!pending) return;
      this.pending.delete(msg.id);
      msg.ok ? pending.resolve(msg.result) : pending.reject(new Error(msg.error||'SANDBOX_ERROR'));
    };
    this.worker.onerror = e => {
      for (const {reject} of this.pending.values()) reject(new Error(e.message||'WORKER_ERROR'));
      this.pending.clear();
    };
    return true;
  }

  available() { return Boolean(this.worker); }

  request(op, data = {}) {
    if (!this.worker) throw new Error('WORKER_UNAVAILABLE');
    const id=`sandbox-${++this.seq}`;
    return new Promise((resolve,reject)=>{
      this.pending.set(id,{resolve,reject});
      this.worker.postMessage({id,op,...data});
    });
  }

  async mount(files = []) {
    for (const f of files) this.vfs.put(f.path, f.bytes ?? f.content ?? '');
    if (!this.worker) return this.vfs.list('/');
    return this.request('mount', { files:this.vfs.snapshot() });
  }

  async executeJavaScript(source, { payload = {}, context = {}, files = [] } = {}) {
    if (files.length) await this.mount(files);
    if (this.worker) return this.request('execute-js', { source:String(source||''), payload:cloneable(payload), context:cloneable(context) });
    if (!this.allowHostFallback) throw new Error('WORKER_UNAVAILABLE');
    const stdout=[];
    const push=(...xs)=>stdout.push(xs.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '));
    const consoleCapture={log:push,info:push,warn:push,error:push};
    const api={
      readBytes:p=>this.vfs.get(p), readText:p=>this.vfs.text(p), write:(p,v)=>this.vfs.put(p,v),
      exists:p=>this.vfs.has(p), list:p=>this.vfs.list(p), remove:p=>this.vfs.delete(p)
    };
    const fn=new AsyncFunction('payload','vfs','console','context', `"use strict";\n${String(source||'')}\n`);
    const returnValue=await fn(payload,api,consoleCapture,context);
    return {ok:true,engine:'pure-js-host-fallback',stdout,returnValue};
  }

  async executeWasm(bytes, imports = {}) {
    if (this.worker) return this.request('execute-wasm', { bytes:new Uint8Array(bytes), imports:cloneable(imports) });
    if (typeof WebAssembly === 'undefined') throw new Error('WebAssembly unavailable');
    const {instance}=await WebAssembly.instantiate(bytes,imports);
    return {ok:true,engine:'wasm-host-fallback',stdout:[],exports:Object.keys(instance.exports)};
  }

  terminate() {
    this.worker?.terminate();
    if (this.workerURL && typeof URL !== 'undefined') URL.revokeObjectURL(this.workerURL);
    this.worker=null; this.workerURL=null;
  }
}

export const createPaperRuntimeSandbox = options => new PaperRuntimeSandbox(options);
export default PaperRuntimeSandbox;

