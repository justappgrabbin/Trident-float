/**
 * Computer Event Emitter — shared event grammar v1 (computer/contracts/event-grammar-v1.yaml).
 *
 * emitEvent(partial) fills required fields (event_id, timestamp, trajectory_id,
 * result_status 'unknown' default), keeps unknown fields null (never fabricated),
 * and appends the complete event to computer/runtime/data/events.jsonl
 * (append-only, one JSON object per line). A new runtime instance reading the
 * same file sees the full history (simulated-restart survival).
 *
 * The event is also mirrored onto the kernel EventBus as 'event:emitted' and
 * 'event:<event_type>' so the rest of the Computer can observe it.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOG = fileURLToPath(new URL('../runtime/data/events.jsonl', import.meta.url));

const EVENT_TYPES = Object.freeze([
  'user_action', 'agent_action', 'message', 'project_action', 'experiment_action',
  'tool_execution', 'file_ingest', 'build', 'network_connection', 'state_transition',
  'graph_activation', 'application_launch', 'movement', 'observation', 'verification',
  'failure', 'recovery',
]);

const ACTOR_TYPES = Object.freeze(['user', 'mirrored_agent', 'application', 'process', 'automaton', 'device', 'system']);

export class EventEmitter {
  constructor({ bus = null, logPath = DEFAULT_LOG } = {}) {
    this.bus = bus;
    this.logPath = logPath;
  }

  /** Normalize a partial event onto the grammar-v1 shape; unknown stays null. */
  buildEvent(partial = {}) {
    const event = {
      event_id: partial.event_id ?? `evt-${randomUUID()}`,
      timestamp: partial.timestamp ?? new Date().toISOString(),
      actor_id: partial.actor_id ?? 'system',
      actor_type: ACTOR_TYPES.includes(partial.actor_type) ? partial.actor_type : 'system',
      target_id: partial.target_id ?? null,
      event_type: EVENT_TYPES.includes(partial.event_type) ? partial.event_type : 'observation',
      input: partial.input ?? null,
      actor_address: partial.actor_address ?? null,
      target_address: partial.target_address ?? null,
      event_address: partial.event_address ?? null,
      pre_state: partial.pre_state ?? null,
      context: partial.context ?? null,
      process_id: partial.process_id ?? null,
      provider: partial.provider ?? null,
      address_provider: partial.address_provider ?? null,
      state_provider: partial.state_provider ?? null,
      result: partial.result ?? null,
      result_status: ['success', 'failure', 'partial', 'unknown'].includes(partial.result_status)
        ? partial.result_status : 'unknown',
      post_state: partial.post_state ?? null,
      observable_effect: partial.observable_effect ?? null,
      related_events: [...(partial.related_events ?? [])],
      parents: [...(partial.parents ?? [])],
      trajectory_id: partial.trajectory_id ?? `traj-${randomUUID()}`,
      evidence: partial.evidence ?? null,
    };
    return Object.freeze(event);
  }

  /** Contract: emitEvent(event) -> persisted grammar-v1 event. Append-only. */
  async emitEvent(partial = {}) {
    const event = this.buildEvent(partial);
    try {
      await mkdir(dirname(this.logPath), { recursive: true });
      await appendFile(this.logPath, JSON.stringify(event) + '\n', 'utf8');
    } catch (error) {
      // Persistence failures surface as events too — never swallowed.
      this.bus?.emit('event:persistence-failure', { event_id: event.event_id, error: String(error?.message ?? error) });
      throw error;
    }
    this.bus?.emit('event:emitted', event);
    this.bus?.emit(`event:${event.event_type}`, event);
    return event;
  }

  /** Read back the append-only log (restart survival check). */
  async readAll() {
    let text;
    try {
      text = await readFile(this.logPath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    return text.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
  }

  async history(trajectory_id) {
    return (await this.readAll()).filter((e) => e.trajectory_id === trajectory_id);
  }

  async forEntity(id) {
    return (await this.readAll()).filter((e) => e.actor_id === id || e.target_id === id);
  }
}

export default EventEmitter;

