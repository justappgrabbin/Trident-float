/**
 * Job wrapper around CodeAgent, so the HTTP layer can start a task, poll
 * progress, and accept/revert the result. Kept separate from the server file
 * so it can be tested without opening a port.
 *
 * The service is inert until TRIDENT_PROJECT_ROOT points at a real project.
 * Nothing is auto-approved: a run always ends in a reviewable diff.
 */
import path from 'node:path';
import { CodeAgent } from './code-agent.mjs';
import { createModelClient } from './local-model.mjs';

const MAX_DIFF_BYTES = 200_000;
const MAX_EVENTS = 500;

const fail = (status, message) => Object.assign(new Error(message), { status });

export function createAgentService({ root = process.env.TRIDENT_PROJECT_ROOT, model = null, planner = null } = {}) {
  const resolvedRoot = root ? path.resolve(String(root)) : null;
  const client = resolvedRoot ? (model ?? createModelClient()) : null;
  const agent = resolvedRoot ? new CodeAgent({ root: resolvedRoot, model: client, planner }) : null;

  let job = null;
  let running = false;
  let idle = Promise.resolve();

  const publicJob = () => {
    if (!job) return null;
    return {
      ...job,
      diff: job.diff && job.diff.length > MAX_DIFF_BYTES ? `${job.diff.slice(0, MAX_DIFF_BYTES)}\n…truncated` : job.diff,
      events: job.events.slice(-MAX_EVENTS),
    };
  };

  function status() {
    return {
      enabled: Boolean(agent),
      root: resolvedRoot,
      model: client ? { baseUrl: client.baseUrl, model: client.model } : null,
      running,
      job: publicJob(),
    };
  }

  function start(task) {
    if (!agent) throw fail(409, 'agent-not-configured: set TRIDENT_PROJECT_ROOT to a project directory');
    if (typeof task !== 'string' || !task.trim()) throw fail(400, 'task must be a non-empty string');
    if (running) throw fail(409, 'agent-busy: a task is already running');

    job = {
      id: `job_${Date.now().toString(36)}`,
      task: task.trim(),
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      plan: null,
      final: null,
      error: null,
      changedFiles: [],
      diff: '',
      events: [],
    };
    running = true;

    idle = (async () => {
      try {
        const run = await agent.runTask(job.task, {
          onEvent: event => { if (job) job.events.push({ ...event, at: event.at ?? new Date().toISOString() }); },
        });
        job.status = 'done';
        job.plan = run.plan;
        job.final = run.final;
        job.changedFiles = run.changedFiles;
        job.diff = run.diff;
      } catch (error) {
        job.status = 'failed';
        job.error = String(error?.message ?? error);
      } finally {
        job.finishedAt = new Date().toISOString();
        running = false;
      }
      return job;
    })();

    return { id: job.id, task: job.task, status: job.status, accepted: true };
  }

  function state() {
    return { ...status(), pendingReview: Boolean(job && job.status === 'done' && job.changedFiles.length > 0) };
  }

  function accept() {
    if (!agent) throw fail(409, 'agent-not-configured');
    if (running) throw fail(409, 'agent-busy: wait for the run to finish');
    if (!job || job.status !== 'done') throw fail(409, 'nothing-to-accept: no completed run');
    const files = agent.accept();
    job.acceptedAt = new Date().toISOString();
    job.status = 'accepted';
    return { accepted: files };
  }

  function revert() {
    if (!agent) throw fail(409, 'agent-not-configured');
    if (running) throw fail(409, 'agent-busy: wait for the run to finish');
    const restored = agent.revert();
    if (job) { job.status = 'reverted'; job.revertedAt = new Date().toISOString(); job.changedFiles = []; job.diff = ''; }
    return { restored };
  }

  return { status, start, state, accept, revert, whenIdle: () => idle, get running() { return running; } };
}
