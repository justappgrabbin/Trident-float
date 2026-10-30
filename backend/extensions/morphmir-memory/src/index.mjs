// MorphMir memory — additive, pure JS, offline, browser-safe.
// Extends (does not edit) MorphMemoryEngine from tool-16-morph-mir.js. Text/code keeps MorphMir's original
// behaviour. Binary artifacts (photos, any bytes) are chunked into an exact-address store (v0.5.7 style:
// address + sha256 + index + byte length + supersedes links, plus a manifest), and regenerate(mode:'exact')
// rebuilds them from the stored chunks in order instead of overlap guessing, verifying every chunk hash and
// the whole-file sha256.
import { MorphMemoryEngine, MorphMirError } from '../../../authorities/execution-spine/src/pure-synthia/automata/tools/tool-16-morph-mir.js';
import { sha256Hex } from '../../translation-layer/src/sha256.mjs';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? '=' : B64[c & 63]);
  }
  return out;
}
export function fromBase64(s) {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, ''); const out = new Uint8Array(Math.floor((clean.length * 3) / 4)); let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    out[o++] = (n >> 16) & 255; if (clean[i + 2] !== undefined) out[o++] = (n >> 8) & 255; if (clean[i + 3] !== undefined) out[o++] = n & 255;
  }
  return out.slice(0, o);
}

/** Bytes are binary if they contain NUL, are not valid UTF-8, or are >10% control characters. */
export function looksBinary(bytes) {
  if (bytes.length === 0) return false;
  let ctrl = 0;
  for (let i = 0; i < Math.min(bytes.length, 8192); i++) { const b = bytes[i]; if (b === 0) return true; if (b < 9 || (b > 13 && b < 32)) ctrl++; }
  if (ctrl / Math.min(bytes.length, 8192) > 0.1) return true;
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return false; } catch { return true; }
}
function asBytes(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  return null;
}

/** Exact-address chunk memory. Every record is immutable; re-storing a changed chunk links `supersedes`. */
export class ExactChunkMemory {
  constructor() { this.records = new Map(); this.manifests = new Map(); this.latestByName = new Map(); }
  static chunkAddress(fileSha, index) { return `morphmir://chunk/${fileSha}/${index}`; }
  static manifestAddress(fileSha) { return `morphmir://manifest/${fileSha}`; }
  store(name, bytes, { chunkSize = 16384 } = {}) {
    const fileSha = sha256Hex(bytes);
    const prior = this.latestByName.get(name) ?? null;
    const priorManifest = prior ? this.manifests.get(prior) : null;
    const chunks = [];
    for (let index = 0, start = 0; start < bytes.length || (bytes.length === 0 && index === 0); index++, start += chunkSize) {
      const slice = bytes.slice(start, Math.min(start + chunkSize, bytes.length));
      const address = ExactChunkMemory.chunkAddress(fileSha, index);
      const sha256 = sha256Hex(slice);
      const priorChunk = priorManifest?.chunks[index] ? this.records.get(priorManifest.chunks[index]) : null;
      const record = Object.freeze({ address, index, start, byteLength: slice.length, sha256, supersedes: priorChunk && priorChunk.sha256 !== sha256 ? priorChunk.address : null, bytes: slice });
      this.records.set(address, record); chunks.push(address);
      if (bytes.length === 0) break;
    }
    const manifest = Object.freeze({ address: ExactChunkMemory.manifestAddress(fileSha), name, byteLength: bytes.length, sha256: fileSha, chunkSize, chunkCount: chunks.length, chunks: Object.freeze(chunks), supersedes: priorManifest && priorManifest.sha256 !== fileSha ? priorManifest.address : null });
    this.manifests.set(manifest.address, manifest); this.latestByName.set(name, manifest.address);
    return manifest;
  }
  recallChunk(address) {
    const r = this.records.get(address);
    if (!r) throw new MorphMirError('CHUNK_NOT_FOUND', `no chunk at ${address}`, { address });
    const actual = sha256Hex(r.bytes);
    if (actual !== r.sha256 || r.bytes.length !== r.byteLength) throw new MorphMirError('CHUNK_INTEGRITY', `chunk ${r.index} at ${address} failed verification`, { address, expected: r.sha256, actual });
    return { ...r, bytes: r.bytes.slice() };
  }
  rebuild(manifestAddress) {
    const m = this.manifests.get(manifestAddress);
    if (!m) throw new MorphMirError('MANIFEST_NOT_FOUND', `no manifest at ${manifestAddress}`);
    const out = new Uint8Array(m.byteLength); let offset = 0;
    m.chunks.forEach((addr, i) => { const c = this.recallChunk(addr); if (c.index !== i || c.start !== offset) throw new MorphMirError('CHUNK_ORDER', `chunk ${i} out of order`); out.set(c.bytes, offset); offset += c.byteLength; });
    const sha = sha256Hex(out);
    if (offset !== m.byteLength || sha !== m.sha256) throw new MorphMirError('FILE_INTEGRITY', 'whole-file sha256 mismatch', { expected: m.sha256, actual: sha });
    return { bytes: out, sha256: sha, manifest: m };
  }
  /** Serializable snapshot (e.g. for localStorage / IndexedDB); bytes as base64. */
  export() { return { schema: 'synthia.morphmir-memory.v1', manifests: [...this.manifests.values()], records: [...this.records.values()].map((r) => ({ ...r, bytes: toBase64(r.bytes) })), latestByName: [...this.latestByName] }; }
  static import(snapshot) {
    const m = new ExactChunkMemory();
    for (const r of snapshot.records) m.records.set(r.address, Object.freeze({ ...r, bytes: fromBase64(r.bytes) }));
    for (const x of snapshot.manifests) m.manifests.set(x.address, Object.freeze({ ...x, chunks: Object.freeze([...x.chunks]) }));
    m.latestByName = new Map(snapshot.latestByName); return m;
  }
}

export class MorphMirMemory extends MorphMemoryEngine {
  constructor({ chunkSize = 16384, memory = null } = {}) { super(); this.chunkSize = chunkSize; this.memory = memory ?? new ExactChunkMemory(); }
  /** ingest({name, content, mode}) — mode 'binary' | 'text' | undefined (auto). Text goes to MorphMir unchanged. */
  ingest({ name, content, mode } = {}) {
    let bytes = asBytes(content);
    if (bytes === null && typeof content === 'string' && mode === 'binary') bytes = Uint8Array.from(content, (ch) => ch.charCodeAt(0) & 255);
    const binary = mode === 'binary' || (mode !== 'text' && bytes !== null && looksBinary(bytes));
    if (!binary) return super.ingest({ name, content: bytes ? new TextDecoder().decode(bytes) : content });
    if (!name) throw new MorphMirError('ARTIFACT_REQUIRED', 'ingest requires {name, content}');
    const manifest = this.memory.store(name, bytes, { chunkSize: this.chunkSize });
    const artifact = super.ingest({ name, content: `[binary ${bytes.length} bytes sha256:${manifest.sha256}]` });
    artifact.binary = { manifestAddress: manifest.address, sha256: manifest.sha256, byteLength: bytes.length, chunkCount: manifest.chunkCount };
    artifact.metadata = { ...artifact.metadata, binary: true };
    return artifact;
  }
  analyze(artifactId) {
    const a = this.artifacts.get(artifactId);
    if (!a?.binary) return super.analyze(artifactId);
    a.understanding = { intent: 'binary artifact (exact memory)', functionality: [], dependencies: [], patterns: [], complexity: 0, keyInsights: [], reusableComponents: [] };
    a.metadata = { ...a.metadata, status: 'understood' };
    this.addOperation('analyze', a.id, `Binary ${a.originalName}: ${a.binary.chunkCount} exact-address chunks`);
    this.completeOperation('analyze', a.id, `manifest ${a.binary.manifestAddress}`);
    return { artifactId: a.id, understanding: a.understanding, blueprint: { binary: true, chunkCount: a.binary.chunkCount }, nodes: 0, manifest: this.memory.manifests.get(a.binary.manifestAddress) };
  }
  regenerate(artifactId, options = {}) {
    const a = this.artifacts.get(artifactId);
    if (!a?.binary) return super.regenerate(artifactId, options);
    const mode = options.mode ?? 'exact';
    if (mode !== 'exact') throw new MorphMirError('BINARY_EXACT_ONLY', `binary artifacts regenerate in mode 'exact' only (asked '${mode}')`);
    const { bytes, sha256, manifest } = this.memory.rebuild(a.binary.manifestAddress);
    return { bytes, code: null, base64: toBase64(bytes), sha256, isExact: sha256 === a.binary.sha256, modeUsed: 'exact', confidence: 1, integrity: 1, chunkCount: manifest.chunkCount, reconstructedLength: bytes.length, originalLength: a.binary.byteLength, missing: [], manifest };
  }
  recallChunk(address) { return this.memory.recallChunk(address); }
}
export { MorphMirError };

