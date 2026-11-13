import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../app/src/main/assets/synthia-client.js',import.meta.url),'utf8');
test('Android bridge resolves successful native replies and surfaces failures without fabricated responses', async()=>{
  const requests=[];
  const context=vm.createContext({window:{TridentAndroid:true},TridentAndroid:{request:(...args)=>requests.push(args)},setTimeout,clearTimeout});
  vm.runInContext(source,context);
  const promise=vm.runInContext("synthiaRequest('/api/chat',{message:'Hi',mode:'morph'})",context);
  assert.equal(requests[0][1],'/api/chat');
  assert.equal(JSON.parse(requests[0][2]).mode,'morph');
  context.payload=JSON.stringify({utterance:'Actual response'});
  vm.runInContext('settleSynthia("1",payload,null)',context);
  assert.equal((await promise).utterance,'Actual response');
  const failed=vm.runInContext("synthiaRequest('/api/tools')",context);
  vm.runInContext('settleSynthia("2",null,"Connection refused")',context);
  await assert.rejects(failed,/Connection refused/);
  const bad=vm.runInContext("synthiaRequest('/api/tools')",context);
  vm.runInContext('settleSynthia("3","not-json",null)',context);
  await assert.rejects(bad,/Invalid response/);
});
test('opening outside the integrated APK reports an unavailable bridge',async()=>{
  const context=vm.createContext({window:{},setTimeout,clearTimeout});vm.runInContext(source,context);
  await assert.rejects(vm.runInContext("synthiaRequest('/api/audit')",context),/integrated Trident Android/);
});
