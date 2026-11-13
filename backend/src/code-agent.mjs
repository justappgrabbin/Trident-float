/**
 * A small, dependency-free code agent that runs entirely on the phone.
 *
 * Design rules:
 *  - Every file operation is confined to one project root (no symlink escape).
 *  - Every write snapshots the previous bytes so a run can be reviewed and
 *    reverted. Nothing is "auto-approved".
 *  - Commands are an allowlist, executed with shell:false, never interpolated.
 *  - The model is any OpenAI-compatible endpoint (see local-model.mjs).
 *
 * Klein stays the planner: pass `planner(task) -> string`. The executor model
 * only gets the plan as context; it never rewrites the plan itself.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';

const MAX_READ_BYTES = 200_000;
const MAX_OUTPUT_BYTES = 20_000;
const MAX_STEPS = 16;
const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.gradle', '__pycache__']);

const COMMAND_RULES = [
  { bin: 'node', allow: argv => argv[1] === '--test' || argv[1] === '--version' },
  { bin: 'npm', allow: argv => argv[1] === 'test' || (argv[1] === 'run' && /^[a-zA-Z0-9:_-]{1,40}$/.test(argv[2] ?? '')) },
  { bin: 'python3', allow: argv => argv[1] === '-m' && ['unittest', 'pytest'].includes(argv[2]) },
  { bin: 'python', allow: argv => argv[1] === '-m' && ['unittest', 'pytest'].includes(argv[2]) },
];

export class CodeAgent {
  constructor({ root, model, planner = null, maxSteps = MAX_STEPS, exec = execFile } = {}) {
    if (!root) throw new TypeError('CodeAgent requires a project root');
    if (!model?.complete) throw new TypeError('CodeAgent requires an OpenAI-compatible model client');
    this.root = path.resolve(root);
    this.model = model;
    this.planner = planner;
    this.maxSteps = Math.max(1, Math.min(Number(maxSteps) || MAX_STEPS, MAX_STEPS));
    this.exec = exec;
    this.snapshots = new Map(); // rel -> { before: string|null, after: string }
    this.events = [];
  }

  /* ---------- confinement ---------- */

  resolve(relative = '.') {
    if (typeof relative !== 'string' || relative.length === 0) throw new Error('path must be a non-empty string');
    if (relative.includes('\0')) throw new Error('path contains a null byte');
    if (path.isAbsolute(relative)) throw new Error('absolute paths are not allowed');
    const full = path.resolve(this.root, relative);
    const rel = path.relative(this.root, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`path escapes the project: ${relative}`);
    return { full, rel: rel === '' ? '.' : rel.split(path.sep).join('/') };
  }

  async realResolve(relative) {
    const { full, rel } = this.resolve(relative);
    const parent = path.dirname(full);
    await fsp.mkdir(parent, { recursive: true });
    const realRoot = await fsp.realpath(this.root);
    const realParent = await fsp.realpath(parent);
    if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) throw new Error(`path escapes the project: ${relative}`);
    return { full, rel };
  }

  /* ---------- tools ---------- */

  async listFiles({ path: relative = '.', depth = 2 } = {}) {
    const { full, rel } = this.resolve(relative);
    const out = [];
    const walk = async (dir, level) => {
      if (out.length >= 200) return;
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (IGNORED.has(entry.name)) continue;
        const child = path.join(dir, entry.name);
        const childRel = path.relative(this.root, child).split(path.sep).join('/');
        if (entry.isDirectory()) {
          out.push(`${childRel}/`);
          if (level < depth) await walk(child, level + 1);
        } else if (entry.isFile()) {
          const stat = await fsp.stat(child);
          out.push(`${childRel} (${stat.size}b)`);
        }
        if (out.length >= 200) return;
      }
    };
    await walk(full, 1);
    return out.join('\n') || '(empty)';
  }

  async readFile({ path: relative }) {
    const { full, rel } = this.resolve(relative);
    const stat = await fsp.stat(full);
    if (!stat.isFile()) throw new Error(`${rel} is not a file`);
    if (stat.size > MAX_READ_BYTES) throw new Error(`${rel} is ${stat.size}b; limit ${MAX_READ_BYTES}b`);
    const content = await fsp.readFile(full, 'utf8');
    return { path: rel, bytes: stat.size, content };
  }

  async writeFile({ path: relative, content }) {
    if (typeof content !== 'string') throw new Error('content must be a string');
    if (Buffer.byteLength(content) > MAX_READ_BYTES) throw new Error(`content exceeds ${MAX_READ_BYTES} bytes`);
    const { full, rel } = await this.realResolve(relative);
    let before = null;
    try { before = await fsp.readFile(full, 'utf8'); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fsp.writeFile(full, content, 'utf8');
    if (!this.snapshots.has(rel)) this.snapshots.set(rel, { before, after: content });
    else this.snapshots.get(rel).after = content;
    return { path: rel, created: before === null, bytes: Buffer.byteLength(content) };
  }

  async runCommand({ command }) {
    if (typeof command !== 'string') throw new Error('command must be a string');
    if (/[;&|><`$\\]/.test(command)) throw new Error('shell metacharacters are not allowed');
    const argv = command.trim().split(/\s+/);
    if (!argv[0]) throw new Error('command is empty');
    const rule = COMMAND_RULES.find(r => r.bin === argv[0]);
    if (!rule) throw new Error(`command not allowed: ${argv[0]} (allowed: ${COMMAND_RULES.map(r => r.bin).join(', ')})`);
    if (!rule.allow(argv)) throw new Error(`only these forms are allowed for ${argv[0]}: ${rule.bin} --test, ${rule.bin} test, ${rule.bin} run <script>, ${rule.bin} -m unittest|pytest`);

    const { stdout, stderr, code } = await new Promise(resolve => {
      this.exec(argv[0], argv.slice(1), { cwd: this.root, timeout: 120_000, maxBuffer: 4_000_000 }, (error, out, err) => {
        resolve({ stdout: String(out ?? ''), stderr: String(err ?? ''), code: error?.code ?? 0 });
      });
    });
    const trim = s => (s.length > MAX_OUTPUT_BYTES ? `${s.slice(0, MAX_OUTPUT_BYTES)}\n…truncated` : s);
    return { command, exitCode: code, stdout: trim(stdout), stderr: trim(stderr) };
  }

  async execute(name, args) {
    switch (name) {
      case 'list_files': return this.listFiles(args);
      case 'read_file': return this.readFile(args);
      case 'write_file': return this.writeFile(args);
      case 'run_command': return this.runCommand(args);
      case 'finish': return { finished: true, summary: String(args?.summary ?? '') };
      default: throw new Error(`unknown tool: ${name}`);
    }
  }

  tools() {
    return [
      { type: 'function', function: { name: 'list_files', description: 'List files inside the project. Use before editing so you edit real paths.', parameters: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, depth: { type: 'integer', minimum: 1, maximum: 4 } } } } },
      { type: 'function', function: { name: 'read_file', description: 'Read a UTF-8 text file from the project.', parameters: { type: 'object', additionalProperties: false, required: ['path'], properties: { path: { type: 'string' } } } } },
      { type: 'function', function: { name: 'write_file', description: 'Create or replace a file with full contents. Always send the whole file.', parameters: { type: 'object', additionalProperties: false, required: ['path', 'content'], properties: { path: { type: 'string' }, content: { type: 'string' } } } } },
      { type: 'function', function: { name: 'run_command', description: 'Run a project test/build command. Allowed: node --test, npm test, npm run <script>, python3 -m unittest|pytest.', parameters: { type: 'object', additionalProperties: false, required: ['command'], properties: { command: { type: 'string' } } } } },
      { type: 'function', function: { name: 'finish', description: 'Stop when the task is complete or blocked. Summarise what changed and what you verified.', parameters: { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } } } },
    ];
  }

  /* ---------- run loop ---------- */

  emit(event) { this.events.push({ at: new Date().toISOString(), ...event }); }

  async runTask(task, { onEvent = () => {}, plan = null } = {}) {
    if (typeof task !== 'string' || !task.trim()) throw new Error('task must be a non-empty string');
    this.snapshots.clear();
    this.events = [];
    const note = (event) => { this.emit(event); try { onEvent(event); } catch { /* observer must not break the run */ } };

    let planText = plan;
    if (!planText && this.planner) {
      note({ type: 'plan', status: 'start' });
      try { planText = await this.planner(task); note({ type: 'plan', status: 'done', plan: planText }); }
      catch (error) { note({ type: 'plan', status: 'failed', error: String(error?.message ?? error) }); }
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + (planText ? `\n\nKlein plan (authoritative, do not rewrite):\n${planText}` : '') },
      { role: 'user', content: task },
    ];

    let final = null;
    let finished = null;
    for (let step = 1; step <= this.maxSteps; step++) {
      note({ type: 'model', step, status: 'request' });
      const { message } = await this.model.complete(messages, { tools: this.tools() });
      messages.push(message);

      const calls = message.tool_calls ?? [];
      if (!calls.length) {
        final = { summary: String(message.content ?? '').trim(), verified: this.verified() };
        note({ type: 'final', step, ...final });
        break;
      }

      for (const call of calls) {
        const name = call.function?.name;
        let args = {};
        try { args = call.function?.arguments ? JSON.parse(call.function.arguments) : {}; }
        catch { args = { __parse_error: String(call.function?.arguments) }; }

        note({ type: 'tool', step, name, args: summariseArgs(name, args) });
        let result;
        try {
          result = args.__parse_error ? { error: 'arguments were not valid JSON' } : await this.execute(name, args);
        } catch (error) {
          result = { error: String(error?.message ?? error) };
        }
        note({ type: 'observation', step, name, ok: !result?.error, result: summariseResult(result) });
        messages.push({ role: 'tool', tool_call_id: call.id ?? `call_${step}`, name, content: JSON.stringify(result) });
        if (name === 'finish' && !result?.error) finished = { summary: String(args.summary ?? ''), verified: this.verified() };
      }

      if (finished) {
        final = finished;
        note({ type: 'final', step, ...final });
        break;
      }
    }

    return { task, plan: planText ?? null, final, events: this.events, diff: this.diff(), changedFiles: [...this.snapshots.keys()] };
  }

  verified() {
    return this.events.some(event => event.type === 'observation' && event.name === 'run_command' && event.ok === true);
  }

  /* ---------- review ---------- */

  diff() {
    const chunks = [];
    for (const [rel, { before, after }] of this.snapshots) chunks.push(unifiedDiff(before, after, rel));
    return chunks.filter(Boolean).join('\n');
  }

  revert() {
    const restored = [];
    for (const [rel, { before }] of this.snapshots) {
      const { full } = this.resolve(rel);
      try {
        if (before === null) fs.rmSync(full, { force: true });
        else fs.writeFileSync(full, before, 'utf8');
        restored.push(rel);
      } catch { /* keep going; report only successes */ }
    }
    this.snapshots.clear();
    return restored;
  }

  accept() { const files = [...this.snapshots.keys()]; this.snapshots.clear(); return files; }
}

const SYSTEM_PROMPT = `You are Trident's code executor running on the user's Android phone against a real local project.
Rules:
1. Inspect before you edit: call list_files, then read_file on the files you intend to change.
2. write_file always sends the complete file. Never send fragments.
3. Only paths inside the project. Never absolute paths.
4. Verify with run_command (node --test / npm test / python3 -m unittest) before you finish.
5. Call finish with a short summary of what changed and what you actually verified.
6. If a tool returns an error, adapt. Do not invent results.`;

function summariseArgs(name, args) {
  if (name === 'write_file') return { path: args.path, bytes: typeof args.content === 'string' ? Buffer.byteLength(args.content) : null };
  if (name === 'read_file' || name === 'list_files') return { path: args.path ?? '.' };
  if (name === 'run_command') return { command: args.command };
  return args;
}

function summariseResult(result) {
  if (result?.error) return { error: result.error };
  if (typeof result === 'string') return { text: result.length > 400 ? `${result.slice(0, 400)}…` : result };
  if (result?.content) return { path: result.path, bytes: result.bytes, preview: result.content.slice(0, 200) };
  return result;
}

/* Single-hunk unified diff: prefix/suffix trim + context. Valid and reviewable. */
export function unifiedDiff(before, after, filename, context = 3) {
  const a = before === null ? [] : before.split('\n');
  const b = after === null ? [] : after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  if (start === endA && start === endB) return '';

  const from = Math.max(0, start - context);
  const toA = Math.min(a.length, endA + context);
  const toB = Math.min(b.length, endB + context);
  const lines = [`--- a/${filename}`, `+++ b/${filename}`, `@@ -${from + 1},${toA - from} +${from + 1},${toB - from} @@`];
  for (let i = from; i < start; i++) lines.push(` ${a[i]}`);
  for (let i = start; i < endA; i++) lines.push(`-${a[i]}`);
  for (let i = start; i < endB; i++) lines.push(`+${b[i]}`);
  for (let i = endA; i < toA; i++) lines.push(` ${a[i]}`);
  return lines.join('\n');
}
