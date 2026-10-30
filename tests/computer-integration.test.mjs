import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {bootTridentComputer} from '../computer/TridentHost.mjs';

test('Computer mounts Trident, executes real Klein tools, and restores chat receipts', async () => {
  const dataDir=await mkdtemp(path.join(tmpdir(),'trident-computer-'));
  try {
    const host=await bootTridentComputer({dataDir});
    assert.equal(host.audit().ok,true);
    assert.equal(host.audit().computer.service,true);
    assert.equal(host.computer.tools.list().length,19);
    assert.equal(host.mount.appId,'trident');
    const output=await host.runTools({steps:[{toolId:'outline-paraphraser',input:{triples:[{subject:'Trident',relation:'runs inside',object:'Computer'}]}}]});
    assert.equal(output.ok,true);
    assert.equal(output.runs[0].derivation.output.text,'Trident runs inside Computer.');
    const chat=await host.chat({message:'Memory love light',mode:'morph'});
    assert.ok(chat.morphology.inward.snapshot.addresses.length);
    assert.ok(chat.contact.kleinEvaluation);
    assert.ok(chat.utterance);
    await assert.rejects(host.chat({message:'hello',mode:'missing'}),/Choose Klein/);
    await assert.rejects(host.runTools({steps:[{toolId:'missing'}]}),/Klein catalog/);
    const restored=await bootTridentComputer({dataDir});
    assert.equal(restored.computer.state.get('apps.trident.turns')[0].utterance,chat.utterance);
    assert.ok((await restored.computer.eventEmitter.readAll()).some(e=>e.event_type==='tool_execution'));
  } finally { await rm(dataDir,{recursive:true,force:true}); }
});

test('real HTTP routes expose mounted Computer audit, chat modes and tool execution', async () => {
  const dataDir=await mkdtemp(path.join(tmpdir(),'trident-http-'));
  const child=spawn(process.execPath,['backend/src/generative-server.mjs'],{
    cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',TRIDENT_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe'],
  });
  try {
    const base=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Server startup timed out')),10000);
      let stderr='';child.stderr.on('data',c=>stderr+=c);
      child.once('exit',code=>{clearTimeout(timer);reject(Error(`Server exited ${code}: ${stderr}`));});
      child.stdout.on('data',c=>{const m=String(c).match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});
    });
    const request=async(route,body)=>{
      const res=await fetch(base+route,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});
      return {status:res.status,body:await res.json()};
    };
    const audit=await request('/api/audit');
    assert.equal(audit.body.computer.host,'SynthAi ComputerRuntime');
    assert.equal(audit.body.ok,true);
    const tools=await request('/api/tools');assert.equal(tools.body.catalog.length,19);
    for(const mode of ['klein','morph']){
      const chat=await request('/api/chat',{message:'Memory love light',mode});
      assert.equal(chat.status,200);assert.equal(chat.body.processingMode,mode);assert.ok(chat.body.utterance);
      assert.equal(Boolean(chat.body.morphology),mode==='morph');
    }
    const task=await request('/api/tools/run',{steps:[{toolId:'outline-paraphraser',input:{triples:[{subject:'A',relation:'supports',object:'B'}]}}]});
    assert.equal(task.body.runs[0].derivation.output.text,'A supports B.');
    assert.equal((await request('/api/chat',{mode:'invalid',message:'Hi'})).status,400);
    assert.equal((await request('/api/chat',{mode:'klein',message:''})).status,400);
    assert.equal((await request('/api/tools/run',{steps:[{toolId:'missing'}]})).status,400);
    assert.equal((await request('/api/chat',{mode:'communication',message:'Hi'})).status,409);
    assert.equal((await request('/api/state')).status,200);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;
    }
    await rm(dataDir,{recursive:true,force:true});
  }
});
