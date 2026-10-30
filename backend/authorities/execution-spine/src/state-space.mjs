export function estimateStateSpace(space) {
  if (!space || typeof space !== 'object') throw new TypeError('state space required');
  if (space.kind === 'values') return BigInt(space.values?.length ?? 0);
  if (space.kind === 'range') return BigInt(Math.max(0, Math.floor((space.max - space.min) / (space.step ?? 1)) + 1));
  if (space.kind === 'cartesian') {
    return Object.values(space.fields ?? {}).reduce((total, field) => total * estimateStateSpace(field), 1n);
  }
  throw new Error(`unknown state-space kind: ${space.kind}`);
}

export function* enumerateStateSpace(space, maxStates = 100000) {
  const estimate = estimateStateSpace(space);
  if (estimate > BigInt(maxStates)) {
    throw new RangeError(`state space has ${estimate} states; bounded enumerator limit is ${maxStates}. Register a solver/heuristic realization instead.`);
  }

  if (space.kind === 'values') {
    yield* space.values;
    return;
  }
  if (space.kind === 'range') {
    const step = space.step ?? 1;
    for (let x = space.min; step > 0 ? x <= space.max : x >= space.max; x += step) yield x;
    return;
  }
  if (space.kind === 'cartesian') {
    const entries = Object.entries(space.fields ?? {});
    function* walk(index, acc) {
      if (index === entries.length) { yield structuredClone(acc); return; }
      const [name, child] = entries[index];
      for (const value of enumerateStateSpace(child, maxStates)) {
        acc[name] = value;
        yield* walk(index + 1, acc);
      }
    }
    yield* walk(0, {});
    return;
  }
}

