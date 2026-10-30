// Synthia's single state-space-facing swarm formation bridge.
// The swarm is a contextual executable formation of existing factories,
// NOT a fifth factory or a competing semantic address authority.
import { validateCanonicalAddress } from '../authorities/execution-spine/src/canonical-address.mjs';
import { wireNeuralSymbolic } from '../extensions/klein-neural-symbolic/src/wire-synthia.mjs';
import { GenerativeImageStore } from '../extensions/generative-reconstruction/src/layers.mjs';
import { decodeImage } from '../extensions/generative-reconstruction/src/image.mjs';
import { readImage, learnedStructure } from '../extensions/klein-visual-grammar/src/klein.mjs';
import { train as trainImageModel, ModelStore } from '../extensions/modelmaker-image-trainer/src/index.mjs';
import { equilateralOnSegment, point } from '../extensions/klein-visual-grammar/src/euclid.mjs';
import { validateStrictAddress, semanticCoordinateKey } from '../extensions/generative-address-morphology/src/core/strict-address.mjs';
import { projectAddressedStructure } from '../extensions/generative-address-morphology/src/projections/ontological.mjs';

const sane = (n) => typeof n === 'number' && Number.isFinite(n);
const hex = (s) => typeof s === 'string' && /^#[\da-f]{6}$/i.test(s);
const brightness = (h) => {
  const channels = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const x = brightness(a), y = brightness(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Structural/functional acceptance gate, not a substitute for a rendered visual review. */
export function auditOverlaySkin(spec, { actionRegistry = null } = {}) {
  if (!spec || !sane(spec.width) || !sane(spec.height) || spec.width <= 0 || spec.height <= 0 ||
      !Array.isArray(spec.elements)) throw new TypeError('skin requires positive viewport width/height and elements');
  const issues = [], unresolved = [];
  const actions = actionRegistry == null ? null : new Set(actionRegistry);
  for (const e of spec.elements) {
    const id = e?.id;
    if (typeof id !== 'string' || !id) { issues.push('element requires stable id'); continue; }
    const dims = [e.x, e.y, e.width, e.height];
    if (!dims.every(sane) || e.width <= 0 || e.height <= 0) {
      issues.push(id + ': invalid geometry'); continue;
    }
    if (e.x < 0 || e.y < 0 || e.x + e.width > spec.width || e.y + e.height > spec.height)
      issues.push(id + ': clipped outside viewport');
    if (e.interactive) {
      if (e.width < 44 || e.height < 44) issues.push(id + ': touch target below 44px');
      if (typeof e.actionId !== 'string' || !e.actionId) issues.push(id + ': no executable action binding');
      else if (actions && !actions.has(e.actionId)) issues.push(id + ': action is not registered');
      else if (!actions) unresolved.push(id + ': action needs runtime binding verification');
    }
    if (e.text != null) {
      if (!hex(e.textColor) || !hex(e.backgroundColor)) unresolved.push(id + ': text color/background contrast unknown');
      else if (contrast(e.textColor, e.backgroundColor) < 4.5) issues.push(id + ': WCAG normal-text contrast below 4.5:1');
    }
  }
  if (!spec.elements.length) unresolved.push('no real overlay elements provided');
  // Human/renderer review is still required for typography, artwork, 3D, fidelity and visual continuity.
  unresolved.push('rendered visual fidelity and transition continuity not inspected');
  return Object.freeze({
    schema: 'synthia.overlay-skin-check.v1',
    ready: issues.length === 0 && unresolved.length === 0,
    checked: ['viewport bounds', 'touch targets', 'registered action bindings', 'normal text contrast'],
    issues, unresolved, requiresRenderedReview: true,
  });
}

/**
 * Joins the one real Synthia assembly to already implemented image and model donors.
 * A full canonical address is mandatory for execution; lexical candidates are NOT
 * silently upgraded to physical/semantic authority. The owner controls side effects.
 */
export function createSwarmMorphingRuntime({
  assembly, authorize = null, neuralNetBuilder = null, foundry = null,
  imageStore = new GenerativeImageStore(), modelStore = new ModelStore(),
  renderer = null, actionRegistry = null, capabilities = [],
} = {}) {
  if (!assembly || typeof assembly.invoke !== 'function' || typeof assembly.klein?.evaluate !== 'function')
    throw new TypeError('Use the existing live Synthia assembly/Klein runtime');
  const modelMaker = async ({ name, pairs, options = {} } = {}) => {
    if (typeof name !== 'string' || !name || !Array.isArray(pairs) || !sane(options.size))
      throw new TypeError('model.train needs name, real training pairs and image size');
    const trained = trainImageModel(pairs, options);
    const saved = modelStore.save(name, trained.model, {
      baseline: trained.baseline, final: trained.final, heldOut: trained.heldOut,
      epochs: trained.history.length, source: 'existing-ModelMaker-ImageField',
    });
    return { modelAddress: saved.address, version: saved.version, baseline: trained.baseline,
      final: trained.final, heldOut: trained.heldOut, epochs: trained.history.length };
  };
  const bridge = wireNeuralSymbolic({ assembly, authorize, neuralNetBuilder, modelMaker, foundry });
  // Host-specific executable affordances (such as Simlish phenotype transforms)
  // enter the SAME witnessed/permissioned runtime, not a duplicate swarm.
  if (!Array.isArray(capabilities)) throw new TypeError('capabilities must be an array');
  for (const item of capabilities) {
    if (!item || typeof item.name !== 'string' || !/^[a-z][a-z0-9.-]*$/.test(item.name) ||
        typeof item.execute !== 'function' || typeof item.sideEffect !== 'boolean')
      throw new TypeError('capabilities require a name, callable execute and explicit sideEffect flag');
    if (['mesh.invoke','model.train','neural.build','foundry.build'].includes(item.name))
      throw new TypeError('reserved capability must not be replaced');
    bridge.register(item.name, item.execute, { sideEffect: item.sideEffect });
  }
  bridge.register('image.store', ({ name, bytes }) => {
    if (typeof name !== 'string' || !name || !Array.isArray(bytes) && !(bytes instanceof Uint8Array))
      throw new TypeError('image.store needs a name and actual PNG/JPEG bytes');
    const array = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    const img = decodeImage(array);
    return imageStore.store(name, img, { sourceBytes: array });
  }, { sideEffect: true });
  bridge.register('image.reconstruct', ({ address, layers = null }) => {
    if (typeof address !== 'string' || !address.startsWith('genrec://image/'))
      throw new TypeError('image.reconstruct needs a saved image address');
    return imageStore.reconstruct(address, { layers });
  });
  bridge.register('image.observe', ({ address, regions = 4 }) => {
    const state = imageStore.load(address);
    const image = imageStore.reconstruct(address).image;
    const measured = readImage(image, { k: regions, an: state });
    return learnedStructure(measured);
  });
  bridge.register('geometry.construct', ({ a, b, side = 'left' }) => {
    if (!a || !b || ![a.x, a.y, b.x, b.y].every(sane))
      throw new TypeError('geometry.construct requires two measured points');
    return equilateralOnSegment(point(a.x, a.y), point(b.x, b.y), { side });
  });
  bridge.register('skin.audit', (spec) => auditOverlaySkin(spec, { actionRegistry }));
  if (typeof renderer === 'function')
    bridge.register('skin.render', (spec, ctx) => renderer(spec, ctx), { sideEffect: true });

  return Object.freeze({
    kind: 'contextual-swarm-formation',
    // Four established primitives remain external; no duplicate model/foundry/semantic engine.
    primitives: Object.freeze(['tool-factory', 'neural-net-maker', 'model-maker', 'foundry']),
    inspect(subject, context = {}) {
      if (typeof assembly.structure !== 'function') throw new Error('STRUCTURAL_AUTHORITY_UNAVAILABLE');
      return assembly.structure(subject, { ...context, addressMode: 'structural' });
    },
    project(addresses, { leadingDimension = null } = {}) {
      // Opt-in symbolic projection, never an automatic gate/degree assignment.
      const records = addresses.map(a => validateStrictAddress(a));
      return { coordinates: records.map(r => r.coordinates),
        semanticKeys: records.map(semanticCoordinateKey),
        projection: projectAddressedStructure(addresses, { leadingDimension }) };
    },
    execute({ intent, address, steps, context = {}, autonomy = 'manual' }) {
      validateCanonicalAddress(address); // fail closed on missing 13 fields
      return bridge.execute({ intent, address, steps, context, autonomy });
    },
    capabilityNames() { return [...bridge.capabilities.keys()]; },
    receipts() { return structuredClone(bridge.receipts); },
    state() { return { modelStore: modelStore.export(), imageManifests: [...imageStore.manifests.values()] }; },
    imageStore, modelStore,
  });
}

