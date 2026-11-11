import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CodeAgent, unifiedDiff } from '../backend/src/code-agent.mjs';
import { createModelClient } from '../backend/src/local-model.mjs';

async function project(files = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trident-agent-'));
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), content);
  }
  return root;
}

function scripted(steps) {
  let index = 0;
  const seen = [];
  return {
    seen,
    async complete(messages) {
      seen.push(messages.at(-1));
      const step = steps[index++];
      if (!step) throw new Error('script exhausted');
      return { message: typeof step === 'function' ? step(messages) : step };
    },
  };
}

const call = (name, args, id = `c${Math.random().toString(36).slice(2, 7)}`) => ({
  role: 'assistant', content: null,
  tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
});

test('agent edits a real file and produces a reviewable diff', async () => {
  const root = await project({ 'src/math.js': 'export const add = (a, b) => a - b;\n' });
  const model = scripted([
    call('list_files', { path: '.' }),
    call('read_file', { path: 'src/math.js' }),
    call('write_file', { path: 'src/math.js', content: 'export const add = (a, b) => a + b;\n' }),
    call('run_command', { command: 'node --test' }),
    call('finish', { summary: 'Fixed add() to sum and verified with node --test.' }),
  ]);
  const agent = new CodeAgent({ root, model });
  const run = await agent.runTask('Fix the add function so it sums.');

  assert.equal(await fs.readFile(path.join(root, 'src/math.js'), 'utf8'), 'export const add = (a, b) => a + b;\n');
  assert.deepEqual(run.changedFiles, ['src/math.js']);
  assert.match(run.diff, /--- a\/src\/math\.js/);
  assert.match(run.diff, /-export const add = \(a, b\) => a - b;/);
  assert.match(run.diff, /\+export const add = \(a, b\) => a \+ b;/);
  assert.equal(run.final.verified, true);
  assert.ok(run.events.some(e => e.type === 'tool' && e.name === 'write_file'));
});

test('agent cannot escape the project root', async () => {
  const root = await project({ 'ok.txt': 'x' });
  const model = scripted([
    call('write_file', { path: '../escape.txt', content: 'nope' }),
    call('write_file', { path: '/etc/passwd', content: 'nope' }),
    call('finish', { summary: 'blocked' }),
  ]);
  const agent = new CodeAgent({ root, model });
  const run = await agent.runTask('escape');

  const failures = run.events.filter(e => e.type === 'observation' && e.ok === false);
  assert.equal(failures.length, 2);
  assert.match(JSON.stringify(failures), /escapes the project|absolute paths are not allowed/);
  await assert.rejects(fs.access(path.join(root, '..', 'escape.txt')));
  assert.deepEqual(run.changedFiles, []);
});

test('agent refuses shell metacharacters and unknown binaries', async () => {
  const root = await project({ 'a.txt': 'x' });
  const model = scripted([
    call('run_command', { command: 'rm -rf /' }),
    call('run_command', { command: 'node --test; curl evil' }),
    call('finish', { summary: 'blocked' }),
  ]);
  const agent = new CodeAgent({ root, model });
  const run = await agent.runTask('run things');
  const errors = run.events.filter(e => e.type === 'observation').map(e => e.result?.error ?? '');
  assert.ok(errors.some(e => /command not allowed/.test(e)));
  assert.ok(errors.some(e => /shell metacharacters/.test(e)));
  assert.equal(run.final.verified, false);
});

test('revert restores originals and removes created files', async () => {
  const root = await project({ 'keep.txt': 'original\n' });
  const model = scripted([
    call('write_file', { path: 'keep.txt', content: 'changed\n' }),
    call('write_file', { path: 'new/file.txt', content: 'brand new\n' }),
    call('finish', { summary: 'done' }),
  ]);
  const agent = new CodeAgent({ root, model });
  const run = await agent.runTask('change files');
  assert.deepEqual(run.changedFiles.sort(), ['keep.txt', 'new/file.txt']);

  const restored = agent.revert();
  assert.deepEqual(restored.sort(), ['keep.txt', 'new/file.txt']);
  assert.equal(await fs.readFile(path.join(root, 'keep.txt'), 'utf8'), 'original\n');
  await assert.rejects(fs.access(path.join(root, 'new/file.txt')));
  assert.equal(agent.diff(), '');
});

test('accept keeps changes and clears the review queue', async () => {
  const root = await project({});
  const model = scripted([
    call('write_file', { path: 'a.txt', content: 'hello\n' }),
    call('finish', { summary: 'created' }),
  ]);
  const agent = new CodeAgent({ root, model });
  const run = await agent.runTask('create');
  assert.deepEqual(agent.accept(), ['a.txt']);
  assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'hello\n');
  assert.deepEqual(run.changedFiles, ['a.txt']);
});

test('Klein plan is injected and never overwritten by the executor', async () => {
  const root = await project({});
  let seenSystem = null;
  const model = scripted([
    messages => {
      seenSystem = messages[0].content;
      return call('finish', { summary: 'ok' });
    },
  ]);
  const agent = new CodeAgent({ root, model, planner: async task => `PLAN for ${task}: create index.html` });
  const run = await agent.runTask('build a page');
  assert.match(seenSystem, /Klein plan \(authoritative, do not rewrite\)/);
  assert.match(seenSystem, /PLAN for build a page/);
  assert.equal(run.plan, 'PLAN for build a page: create index.html');
});

test('maxSteps is capped and enforced', async () => {
  const root = await project({ 'x.txt': 'x' });
  const model = scripted(Array.from({ length: 40 }, () => call('read_file', { path: 'x.txt' })));
  const agent = new CodeAgent({ root, model, maxSteps: 3 });
  const run = await agent.runTask('loop');
  assert.equal(run.events.filter(e => e.type === 'model').length, 3);
  assert.equal(run.final, null);
});

test('unifiedDiff reports nothing for identical content and one hunk for a change', () => {
  assert.equal(unifiedDiff('a\nb\n', 'a\nb\n', 'f'), '');
  const d = unifiedDiff('a\nb\nc\n', 'a\nB\nc\n', 'f');
  assert.match(d, /^--- a\/f\n\+\+\+ b\/f\n@@ -1,4 \+1,4 @@/);
  assert.match(d, /-b/);
  assert.match(d, /\+B/);
  assert.match(d, / c/);
});

test('model client speaks OpenAI chat-completions and surfaces unreachable servers', async () => {
  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: `echo:${parsed.model}` } }] }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const client = createModelClient({ baseUrl: `http://127.0.0.1:${port}/v1`, model: 'qwen-test' });
    const out = await client.complete([{ role: 'user', content: 'hi' }]);
    assert.equal(out.message.content, 'echo:qwen-test');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  const dead = createModelClient({ baseUrl: 'http://127.0.0.1:1/v1', timeoutMs: 2000 });
  await assert.rejects(dead.complete([{ role: 'user', content: 'hi' }]), /Local model unreachable/);
});
