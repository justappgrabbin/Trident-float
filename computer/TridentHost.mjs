import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ComputerRuntime } from './ComputerRuntime.mjs';
import { JsonFilePersistence } from './runtime/json-file-persistence.mjs';
import { SynthiaGenerativeAssembly } from '../backend/src/synthia-generative-assembly.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Mount the generative organism as a Computer service and Trident as its app. */
export async function bootTridentComputer({ dataDir = process.env.TRIDENT_DATA_DIR ?? path.join(root, 'workspace'), persistence } = {}) {
  const computer = await new ComputerRuntime({
    namespace: 'trident-computer',
    persistence: persistence ?? new JsonFilePersistence(path.join(dataDir, 'computer.json')),
    eventLogPath: path.join(dataDir, 'events.jsonl'),
  }).boot();
  const synthia = new SynthiaGenerativeAssembly({ morphology: { engineOptions: { weightsFile: path.join(dataDir, 'graph-weights.json') } } });
  computer.services.register('synthia-generative', { provider: synthia, contract: 'chat/tool-task' });
  for (const descriptor of synthia.kleinToolCatalog) {
    computer.tools.register(descriptor.id, {
      ...descriptor,
      execute: (input, context = {}) => synthia.invoke(descriptor.id, input, context),
    });
  }
  computer.processes.register({ id: 'trident-chat', run: async ({input}) => {
    if (!['klein', 'morph'].includes(input.mode)) throw new TypeError('Choose Klein or Morph mode');
    if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 16384) throw new TypeError('Message requires 1–16384 characters');
    const result = input.mode === 'morph'
      ? await synthia.chat(input.message, input.context ?? {})
      : await synthia.chatKlein(input.message, input.context ?? {});
    const turns = computer.state.get('apps.trident.turns', []);
    turns.push({message:input.message,utterance:result.utterance,mode:input.mode,recordId:result.recordId});
    await computer.state.set('apps.trident.turns', turns.slice(-100));
    await computer.emitEvent({actor_id:'app:trident',actor_type:'application',event_type:'message',provider:'synthia-generative',result_status:result.ok?'success':'failure',result:{recordId:result.recordId,mode:input.mode}});
    return {...result, processingMode:input.mode};
  }});
  computer.processes.register({ id:'trident-tools', run:async ({input}) => {
    const result = synthia.runToolTask(input.steps, input.context ?? {});
    await computer.emitEvent({actor_id:'app:trident',actor_type:'application',event_type:'tool_execution',provider:'synthia-generative',result_status:result.ok?'success':'failure',result:{tools:input.steps.map(s=>s.toolId)}});
    return result;
  }});
  const artifact = await computer.intake.ingest({name:'Trident',text:JSON.stringify({app:'trident',service:'synthia-generative'}),type:'application/json',source:'trident-bootstrap'});
  const mount = await computer.mountApplication('trident', {artifactId:artifact.id});
  let queue = Promise.resolve();
  const enqueue = task => { const next = queue.then(task); queue = next.catch(() => {}); return next; };
  return {
    computer, synthia, mount,
    chat: input => enqueue(() => computer.processes.execute('trident-chat', input)),
    runTools: input => enqueue(() => computer.processes.execute('trident-tools', input)),
    audit: () => ({...synthia.wiringAudit(), computer:{host:'SynthAi ComputerRuntime',app:'trident',mountId:mount.mountId,service:computer.services.has('synthia-generative'),tools:computer.tools.list().map(t=>t.id)}}),
  };
}
