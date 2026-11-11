import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgentService } from '../backend/src/agent-service.mjs';

async function project(files = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trident-service-'));
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), content);
  }
  return root;
}

const call = (name, args) => ({
  role: 'assistant', content: null,
  tool_calls: [{ id: `c_${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
});

function scripted(messages) {
  let index = 0;
  return { complete: async () => ({ message: messages[index++] }) };
}

test('agent service is inert without a project root', () => {
  const service = createAgentService({ root: '', model: { complete: async () => ({}) } });
  assert.equal(service.status().enabled, false);
  assert.equal(service.status().root, null);
  assert.throws(() => service.start('do something'), /agent-not-configured/);
});

test('agent service runs a task, exposes a diff, and accepts it', async () => {
  const root = await project({ 'app.js': 'export const n = 1;\n' });
  const model = scripted([
    call('read_file', { path: 'app.js' }),
    call('write_file', { path: 'app.js', content: 'export const n = 2;\n' }),
    call('finish', { summary: 'bumped n' }),
  ]);
  const service = createAgentService({ root, model });

  const job = service.start('bump n to 2');
  assert.equal(job.status, 'running');
  assert.equal(service.status().running, true);
  await service.whenIdle();

  const state = service.state();
  assert.equal(state.job.status, 'done');
  assert.deepEqual(state.job.changedFiles, ['app.js']);
  assert.match(state.job.diff, /\+export const n = 2;/);
  assert.equal(state.pendingReview, true);
  assert.ok(state.job.events.some(e => e.type === 'tool' && e.name === 'write_file'));

  const accepted = service.accept();
  assert.deepEqual(accepted.accepted, ['app.js']);
  assert.equal(await fs.readFile(path.join(root, 'app.js'), 'utf8'), 'export const n = 2;\n');
  assert.equal(service.state().pendingReview, false);
});

test('agent service rejects a second task while one is running', async () => {
  const root = await project({ 'a.txt': 'x' });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const model = { complete: async () => { await gate; return { message: { role: 'assistant', content: 'blocked' } }; } };
  const service = createAgentService({ root, model });

  service.start('first');
  assert.throws(() => service.start('second'), /agent-busy/);
  release();
  await service.whenIdle();
  assert.equal(service.state().job.status, 'done');
});

test('agent service marks a failing run as failed and keeps the event log', async () => {
  const root = await project({});
  const model = { complete: async () => { throw new Error('model died'); } };
  const service = createAgentService({ root, model });

  service.start('explode');
  await service.whenIdle();
  const state = service.state();
  assert.equal(state.job.status, 'failed');
  assert.match(state.job.error, /model died/);
  assert.equal(state.running, false);
});

test('agent service can revert a completed run', async () => {
  const root = await project({ 'keep.txt': 'original\n' });
  const model = scripted([
    call('write_file', { path: 'keep.txt', content: 'changed\n' }),
    call('finish', { summary: 'changed it' }),
  ]);
  const service = createAgentService({ root, model });

  service.start('change keep.txt');
  await service.whenIdle();
  const reverted = service.revert();
  assert.deepEqual(reverted.restored, ['keep.txt']);
  assert.equal(await fs.readFile(path.join(root, 'keep.txt'), 'utf8'), 'original\n');
  assert.equal(service.state().job.status, 'reverted');
  assert.equal(service.state().job.diff, '');
});

test('agent service passes the Klein plan to the executor as authoritative', async () => {
  const root = await project({});
  let system = null;
  const model = {
    complete: async messages => {
      system = messages[0].content;
      return { message: { role: 'assistant', content: 'no changes' } };
    },
  };
  const service = createAgentService({ root, model, planner: async task => `step 1: do ${task}` });

  service.start('the thing');
  await service.whenIdle();
  assert.match(system, /Klein plan \(authoritative, do not rewrite\)/);
  assert.match(system, /step 1: do the thing/);
  assert.equal(service.state().job.plan, 'step 1: do the thing');
});

test('android bridge allows the builder routes and the Build screen uses them', async () => {
  const here = new URL('..', import.meta.url).pathname;
  const java = await fs.readFile(path.join(here, 'app/src/main/java/org/stellarproximology/trident/SynthiaClient.java'), 'utf8');
  for (const route of ['/api/agent', '/api/agent/state', '/api/agent/task', '/api/agent/accept', '/api/agent/revert']) {
    assert.ok(java.includes(`"${route}"`), `missing route in allowlist: ${route}`);
  }
  const html = await fs.readFile(path.join(here, 'app/src/main/assets/index.html'), 'utf8');
  for (const id of ['buildTask', 'buildLog', 'buildDiff', 'buildAccept', 'buildRevert', 'buildState']) {
    assert.ok(html.includes(`id="${id}"`), `missing element: ${id}`);
  }
  assert.match(html, /id="build"/);
  assert.ok(html.includes("synthiaRequest('/api/agent/task'"));
  assert.ok(html.includes("synthiaRequest('/api/agent/state'"));
  assert.ok(html.includes("go('build'"));
});

test('android bridge allows the address engine routes', async () => {
  const here = new URL('..', import.meta.url).pathname;
  const java = await fs.readFile(path.join(here, 'app/src/main/java/org/stellarproximology/trident/SynthiaClient.java'), 'utf8');
  for (const route of ['/api/address/analyse', '/api/address/encode', '/api/address/decode', '/api/address/nearest']) {
    assert.ok(java.includes(`"${route}"`), `missing route in allowlist: ${route}`);
  }
});

test('app and backend agree on a port that cannot collide with Hands or an MCP bridge', async () => {
  const here = new URL('..', import.meta.url).pathname;
  const java = await fs.readFile(path.join(here, 'app/src/main/java/org/stellarproximology/trident/SynthiaClient.java'), 'utf8');
  const server = await fs.readFile(path.join(here, 'backend/src/generative-server.mjs'), 'utf8');
  const javaPort = java.match(/static final int PORT = (\d+)/)?.[1];
  const serverPort = server.match(/process\.env\.PORT \?\? (\d+)/)?.[1];
  assert.ok(javaPort, 'Java port constant missing');
  assert.equal(serverPort, javaPort, 'app and server must use the same default port');
  assert.ok(!['8765', '8787'].includes(javaPort), 'port collides with Hands (8787) or a common MCP bridge (8765)');
  assert.ok(java.includes('127.0.0.1:" + PORT'), 'request URL must use the constant');
});

test('app and server agree on a port that avoids Hands and the MCP bridge', async () => {
  const here = new URL('..', import.meta.url).pathname;
  const java = await fs.readFile(path.join(here, 'app/src/main/java/org/stellarproximology/trident/SynthiaClient.java'), 'utf8');
  const server = await fs.readFile(path.join(here, 'backend/src/generative-server.mjs'), 'utf8');
  assert.match(java, /int PORT = 8790/);
  assert.ok(!java.includes('127.0.0.1:8765'), 'app must not target 8765');
  assert.ok(!java.includes('127.0.0.1:8787'), 'app must not target Hands on 8787');
  assert.match(server, /process\.env\.PORT \?\? 8790/);
});
