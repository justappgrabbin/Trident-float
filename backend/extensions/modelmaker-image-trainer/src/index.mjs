// ModelMaker image trainer — additive wrapper, pure JS, offline, no web workers, WASM or network.
// Uses Alexis's ImageField (vendor/modelmaker-morph-studio/dist/neural.mjs) UNCHANGED as the trainer.
// The training loop mirrors her dist/train-worker.mjs (16 batches x 32 random pixels per epoch, held-out
// pair scored each epoch) but runs inline so no web worker is needed. Address fields are fed to her
// encodeAddress exactly as her model does; what each field should *mean* visually is "investigating".
import { ImageField, encodeAddress, features, descriptor, rng, DEFAULT_ADDRESS } from '../vendor/modelmaker-morph-studio/dist/neural.mjs';
import { decodeImage, encodePng } from '../../generative-reconstruction/src/image.mjs';
import { ExactChunkMemory } from '../../morphmir-memory/src/index.mjs';
import { sha256Hex } from '../../translation-layer/src/sha256.mjs';
export { ImageField, encodeAddress, DEFAULT_ADDRESS };
export const ADDRESS_FIELD_MEANINGS = 'investigating';

/** RGBA {width,height,data} -> square size x size Float32 RGB 0..1 (crop at x,y with side `side`, nearest sample). */
export function toField(img, size, { x = 0, y = 0, side = Math.min(img.width, img.height) } = {}) {
  const out = new Float32Array(size * size * 3);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const sx = Math.min(img.width - 1, x + Math.floor(((i + 0.5) * side) / size)), sy = Math.min(img.height - 1, y + Math.floor(((j + 0.5) * side) / size));
    for (let c = 0; c < 3; c++) out[(j * size + i) * 3 + c] = img.data[(sy * img.width + sx) * 4 + c] / 255;
  }
  return out;
}
export function fieldToImage(f, size) { const d = new Uint8Array(size * size * 4); for (let p = 0; p < size * size; p++) { for (let c = 0; c < 3; c++) d[p * 4 + c] = Math.round(Math.max(0, Math.min(1, f[p * 3 + c])) * 255); d[p * 4 + 3] = 255; } return { width: size, height: size, data: d }; }
export const fieldToPng = (f, size) => encodePng(fieldToImage(f, size));
export const decodeImageBytes = decodeImage;
export function condition(address, emotions, phase) { return encodeAddress(address, emotions, phase); }
export function mse(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return s / a.length; }

/** pairs: [{source, target, address, name?}] (fields of size*size*3). Last pair is held out, as in her worker. */
export function train(pairs, { size, hidden = 32, epochs = 40, seed = 42, lr = 0.003 } = {}) {
  if (pairs.length < 2) throw new Error('Add at least two independent image pairs');
  const P = pairs.map((p) => ({ ...p, condition: p.condition ?? encodeAddress(p.address) }));
  const model = new ImageField(hidden, seed), random = rng(seed), training = P.slice(0, -1), held = P.at(-1);
  const ds = training.map((p) => descriptor(p.source, size)), hd = descriptor(held.source, size);
  const scoreOn = (p, d) => mse(renderWith(model, p.source, size, p.condition, d), p.target);
  const trainLoss = () => training.reduce((s, p, i) => s + scoreOn(p, ds[i]), 0) / training.length;
  const baseline = { train: trainLoss(), validation: scoreOn(held, hd) }, history = [];
  for (let e = 0; e < epochs; e++) {
    let loss = 0; const batches = 16, batchSize = 32;
    for (let b = 0; b < batches; b++) { const samples = []; for (let k = 0; k < batchSize; k++) { const i = Math.floor(random() * training.length), p = Math.floor(random() * size * size), pair = training[i]; samples.push({ x: features(pair.source, size, p, pair.condition, ds[i]), y: pair.target.subarray(p * 3, p * 3 + 3) }); } loss += model.batch(samples, lr); }
    const val = scoreOn(held, hd); if (!Number.isFinite(val)) throw new Error('Training diverged');
    history.push({ epoch: e + 1, train: loss / batches, validation: val });
  }
  return { model, baseline, final: { train: trainLoss(), validation: scoreOn(held, hd) }, history, heldOut: held.name ?? null };
}
function renderWith(model, image, size, cond, d) { const out = new Float32Array(image.length); for (let p = 0; p < size * size; p++) out.set(model.forward(features(image, size, p, cond, d)).out, p * 3); return out; }
/** Generate an image for any (possibly unseen) address from a source image. Uses her ImageField.render. */
export function generate(model, source, size, address, emotions, phase) { return model.render(source, size, encodeAddress(address, emotions, phase)); }

/** Save her model.save() JSON into MorphMir ExactChunkMemory at genrec://model/<sha>, version + supersedes per name. */
export class ModelStore {
  constructor(memory = new ExactChunkMemory()) { this.memory = memory; this.index = new Map(); this.latest = new Map(); }
  save(name, model, meta = {}) {
    const json = JSON.stringify(model.save()), bytes = new TextEncoder().encode(json), sha = sha256Hex(bytes);
    const prior = this.latest.get(name) ? this.index.get(this.latest.get(name)) : null;
    const manifest = this.memory.store(`genrec-model:${name}`, bytes);
    const address = `genrec://model/${sha}`;
    const rec = Object.freeze({ address, name, sha256: sha, version: prior ? prior.version + 1 : 1, supersedes: prior && prior.sha256 !== sha ? prior.address : null, manifest: manifest.address, addressFieldMeanings: ADDRESS_FIELD_MEANINGS, meta });
    this.index.set(address, rec); this.latest.set(name, address); return rec;
  }
  load(address) {
    const rec = this.index.get(address); if (!rec) throw new Error(`no model at ${address}`);
    const { bytes, sha256 } = this.memory.rebuild(rec.manifest); if (sha256 !== rec.sha256) throw new Error('model sha mismatch');
    return ImageField.load(JSON.parse(new TextDecoder().decode(bytes)));
  }
  export() { return { schema: 'synthia.genrec-model-store.v1', memory: this.memory.export(), index: [...this.index.values()], latest: [...this.latest] }; }
  static fromSnapshot(s) { const m = new ModelStore(ExactChunkMemory.import(s.memory)); for (const r of s.index) m.index.set(r.address, Object.freeze(r)); m.latest = new Map(s.latest); return m; }
}

/** Optional: publish a learning record to her LearningMesh (pass the instance in; this file never imports it).
 * toolId/kind/confidence mapping for image learnings is "investigating" — defaults below are placeholders. */
export async function publishToMesh(mesh, rec, result, { toolId = 'autoling', kind = 'image-field-model' } = {}) {
  const gain = result.baseline.validation > 0 ? 1 - result.final.validation / result.baseline.validation : 0;
  return mesh.publish({ toolId, kind, value: rec.address, confidence: Math.max(0, Math.min(1, gain)), evidence: [rec.manifest, `heldOut:${result.heldOut}`, 'mapping:investigating'] });
}

