import { KleinNeuralSymbolicBridge } from './klein-neural-symbolic.mjs';
import { validateCanonicalAddress } from '../../../authorities/execution-spine/src/canonical-address.mjs';

/** Bind the existing Synthia assembly and optional real factory entrypoints. */
export function wireNeuralSymbolic({ assembly, neuralNetBuilder, modelMaker, foundry, authorize } = {}) {
  return new KleinNeuralSymbolicBridge({
    assembly, validateCanonicalAddress, neuralNetBuilder, modelMaker, foundry, authorize,
  });
}

