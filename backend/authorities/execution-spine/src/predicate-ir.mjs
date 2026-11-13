/** Serializable expression/predicate IR. */

function getPath(root, path) {
  if (typeof path !== 'string' || path.length === 0) return root;
  return path.split('.').reduce((value, key) => value?.[key], root);
}

function popcountXor(a, b) {
  if (typeof a === 'string' && typeof b === 'string') {
    const n = Math.max(a.length, b.length);
    let d = 0;
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
    return d;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    let d = 0;
    for (let i = 0; i < n; i++) if (!Object.is(a[i], b[i])) d++;
    return d;
  }
  if (Number.isInteger(a) && Number.isInteger(b)) {
    let x = (a ^ b) >>> 0;
    let d = 0;
    while (x) { d += x & 1; x >>>= 1; }
    return d;
  }
  throw new TypeError('hamming expects two strings, arrays, or 32-bit integers');
}

function bool(v) { return Boolean(v); }

export function evaluateIR(node, env = {}, trace = null) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node;

  const op = node.op;
  let value;

  switch (op) {
    case 'literal': value = node.value; break;
    case 'ref': value = getPath(env, node.path); break;
    case 'get': value = getPath(evaluateIR(node.from, env, trace), node.path); break;

    case 'eq': value = Object.is(evaluateIR(node.left, env, trace), evaluateIR(node.right, env, trace)); break;
    case 'ne': value = !Object.is(evaluateIR(node.left, env, trace), evaluateIR(node.right, env, trace)); break;
    case 'gt': value = evaluateIR(node.left, env, trace) > evaluateIR(node.right, env, trace); break;
    case 'gte': value = evaluateIR(node.left, env, trace) >= evaluateIR(node.right, env, trace); break;
    case 'lt': value = evaluateIR(node.left, env, trace) < evaluateIR(node.right, env, trace); break;
    case 'lte': value = evaluateIR(node.left, env, trace) <= evaluateIR(node.right, env, trace); break;

    case 'add': value = (node.args ?? []).reduce((a, x) => a + evaluateIR(x, env, trace), 0); break;
    case 'sub': value = evaluateIR(node.left, env, trace) - evaluateIR(node.right, env, trace); break;
    case 'mul': value = (node.args ?? []).reduce((a, x) => a * evaluateIR(x, env, trace), 1); break;
    case 'div': value = evaluateIR(node.left, env, trace) / evaluateIR(node.right, env, trace); break;
    case 'mod': value = evaluateIR(node.left, env, trace) % evaluateIR(node.right, env, trace); break;
    case 'abs': value = Math.abs(evaluateIR(node.value, env, trace)); break;

    case 'not': value = !bool(evaluateIR(node.value, env, trace)); break;
    case 'and': value = (node.args ?? []).every((x) => bool(evaluateIR(x, env, trace))); break;
    case 'or': value = (node.args ?? []).some((x) => bool(evaluateIR(x, env, trace))); break;
    case 'xor': {
      const xs = (node.args ?? []).map((x) => bool(evaluateIR(x, env, trace)));
      value = xs.reduce((a, x) => a !== x, false);
      break;
    }
    case 'xnor': {
      const xs = (node.args ?? []).map((x) => bool(evaluateIR(x, env, trace)));
      value = !xs.reduce((a, x) => a !== x, false);
      break;
    }
    case 'nand': value = !(node.args ?? []).every((x) => bool(evaluateIR(x, env, trace))); break;
    case 'nor': value = !(node.args ?? []).some((x) => bool(evaluateIR(x, env, trace))); break;
    case 'implies': value = !bool(evaluateIR(node.left, env, trace)) || bool(evaluateIR(node.right, env, trace)); break;
    case 'equiv': value = bool(evaluateIR(node.left, env, trace)) === bool(evaluateIR(node.right, env, trace)); break;

    // BUT is truth-compatible with conjunction while retaining directional
    // contrast metadata in the IR/trace. It is not collapsed to an AND node.
    case 'but': {
      const left = bool(evaluateIR(node.left, env, trace));
      const right = bool(evaluateIR(node.right, env, trace));
      value = left && right;
      break;
    }

    case 'hamming': value = popcountXor(evaluateIR(node.left, env, trace), evaluateIR(node.right, env, trace)); break;
    case 'threshold': value = evaluateIR(node.score, env, trace) >= evaluateIR(node.atLeast, env, trace); break;
    case 'weighted-sum': {
      value = (node.terms ?? []).reduce((sum, term) => {
        return sum + Number(term.weight ?? 1) * Number(evaluateIR(term.value, env, trace));
      }, 0);
      break;
    }
    case 'if': value = bool(evaluateIR(node.test, env, trace))
      ? evaluateIR(node.then, env, trace)
      : evaluateIR(node.else, env, trace); break;

    default: throw new Error(`Unknown IR operator: ${String(op)}`);
  }

  if (trace) trace.push({ op, value, relation: node.relation, metadata: node.metadata });
  return value;
}

export function predicate(node) {
  return (env) => Boolean(evaluateIR(node, env));
}

export function evaluateWithTrace(node, env = {}) {
  const trace = [];
  const value = evaluateIR(node, env, trace);
  return { value, trace };
}

