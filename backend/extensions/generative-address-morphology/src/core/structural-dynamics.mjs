import { FIELD_VECTORS, JUT_TOPOLOGY } from './structural-space.mjs';

const ids = Object.keys(FIELD_VECTORS);
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** CPU block-vector update using explicit scalar coupling coefficients.
 * This is an implementation option, not an inferred universal JUT equation.
 * P is a derived readout and is never accepted as a contributing input.
 */
export function advanceStructuralState({ vectors, tensor, activeFields = ids, openEdges = JUT_TOPOLOGY.relations.map(r => r.id), readout = null } = {}) {
  if (!vectors || typeof vectors !== 'object' || Object.keys(vectors).some(k => !ids.includes(k))) throw new TypeError('vectors must contain only M/E/B/I; P is emergent');
  if (!Array.isArray(activeFields) || activeFields.some(k => !ids.includes(k))) throw new RangeError('activeFields must use M/E/B/I');
  if (!Array.isArray(openEdges) || openEdges.some(k => !JUT_TOPOLOGY.relations.some(r => r.id === k))) throw new RangeError('unknown open edge');
  if (!Array.isArray(tensor) || tensor.length !== 4 || tensor.some(row => !Array.isArray(row) || row.length !== 4 || !row.every(finite))) throw new TypeError('an explicit finite 4x4 tensor is required; ordering is M,E,B,I');
  const active = new Set(activeFields);
  const width = vectors[activeFields[0]]?.length ?? 0;
  if (width < 1 || width > 4096 || activeFields.some(k => !Array.isArray(vectors[k]) || vectors[k].length !== width || !vectors[k].every(finite))) throw new TypeError('active vectors require equal nonempty finite widths up to 4096');
  const permits = (a, b) => a === b || JUT_TOPOLOGY.relations.some(r => openEdges.includes(r.id) &&
    [r.from, r.to].includes(FIELD_VECTORS[a]) && [r.from, r.to].includes(FIELD_VECTORS[b]));
  const mask = ids.map(a => ids.map(b => Number(active.has(a) && active.has(b) && permits(a, b))));
  const next = Object.fromEntries(ids.map((id, i) => [id, active.has(id) ? Array.from({length:width}, (_, k) =>
    ids.reduce((sum, source, j) => sum + (mask[i][j] ? tensor[i][j] * vectors[source][k] : 0), 0)) : null]));
  if (Object.values(next).some(v => v && !v.every(finite))) throw new RangeError('state update overflow');
  const diagonals = [['MI', 'M', 'I', 'diagonal-MI'], ['EB', 'E', 'B', 'diagonal-EB']].filter(([,a,b,edge]) => active.has(a) && active.has(b) && openEdges.includes(edge));
  let value = null;
  if (readout != null) {
    if (typeof readout !== 'object' || Object.keys(readout).some(k => !['MI','EB'].includes(k)) || !Object.values(readout).every(finite) || !Object.keys(readout).length) throw new TypeError('readout requires finite MI and/or EB weights');
    const terms = diagonals.filter(([name]) => Object.hasOwn(readout, name));
    if (terms.length) value = Array.from({length:width}, (_, k) => terms.reduce((sum, [name,a,b]) => sum + readout[name] * next[a][k] * next[b][k], 0));
    if (value && !value.every(finite)) throw new RangeError('readout overflow');
  }
  return {
    vectors: next,
    P: { role:'emergent', value, status:value ? 'explicit-bilinear-readout' : 'readout-unresolved',
      diagonalInputs:diagonals.map(([name,a,b]) => ({name,left:[...next[a]],right:[...next[b]]})),
      formula:readout ? 'P[k] = supplied MI weight * M[k]*I[k] + supplied EB weight * E[k]*B[k], over open diagonals' : null },
    trace: { ordering:ids, tensor:structuredClone(tensor), mask, activeFields:[...active], openEdges:[...openEdges],
      formula:'next[i,k] = sum_j(mask[i,j] * tensor[i,j] * current[j,k])',
      status:'explicit caller-selected linear update; not a source-derived universal law' },
  };
}

