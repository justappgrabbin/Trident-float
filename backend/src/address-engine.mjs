/**
 * Trident address engine — the replacement for the legacy 3.3M-parameter ONNX
 * model whose tokenizer was never exported.
 *
 * The old export had a 4096-token vocabulary and consumed `input_ids`.
 * This keeps exactly that contract, but derives it instead of learning it:
 *
 *     token = (byte << 4) | (index mod 16)
 *
 *   256 possible bytes × 16 positional tags = 4096 tokens.
 *
 * Consequences:
 *   - Lossless: `decode(encode(text)) === text` for any valid string.
 *   - No vocabulary file to lose: the table is a formula, not data.
 *   - Position-sensitive: the same byte at a different offset is a different
 *     token, which is what the legacy positional encoding was doing with
 *     learned weights.
 *   - Every token has a stable, hierarchical address: block + 12-bit token.
 *
 * There is no model and no inference here. It is the address space the model
 * would sit on top of: encode, address, fingerprint, embed, retrieve.
 */
export const VOCAB_SIZE = 4096;
export const BLOCK_SIZE = 16;
export const TAG_MASK = BLOCK_SIZE - 1;
export const BYTE_SHIFT = 4;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

const checkIds = ids => {
  if (!ids || typeof ids.length !== 'number') throw new TypeError('expected an array of token ids');
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!Number.isInteger(id) || id < 0 || id >= VOCAB_SIZE) throw new RangeError(`token ${i} is out of range: ${id}`);
  }
};

/** Text -> UTF-8 bytes -> positional 12-bit tokens. */
export function encode(text) {
  const bytes = encoder.encode(String(text ?? ''));
  const ids = new Uint16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) ids[i] = (bytes[i] << BYTE_SHIFT) | (i & TAG_MASK);
  return ids;
}

/** Tokens -> text. Only the high 8 bits matter, so tags are ignored here. */
export function decode(ids) {
  checkIds(ids);
  const bytes = new Uint8Array(ids.length);
  for (let i = 0; i < ids.length; i++) bytes[i] = ids[i] >> BYTE_SHIFT;
  return decoder.decode(bytes);
}

/** Stable address string for one token occurrence. */
export function addressOf(id, index) {
  if (!Number.isInteger(id) || id < 0 || id >= VOCAB_SIZE) throw new RangeError(`token id out of range: ${id}`);
  const block = Math.floor(index / BLOCK_SIZE).toString(36);
  return `a${block}.${id.toString(16).padStart(3, '0')}`;
}

/** Full analysis of a string: tokens, addresses, blocks, fingerprint. */
export function analyse(text) {
  const source = String(text ?? '');
  const ids = encode(source);
  const tokens = Array.from(ids, (id, index) => ({
    index,
    id,
    byte: id >> BYTE_SHIFT,
    address: addressOf(id, index),
  }));
  const blocks = [];
  for (let i = 0; i < tokens.length; i += BLOCK_SIZE) blocks.push(tokens.slice(i, i + BLOCK_SIZE));
  return { text: source, length: tokens.length, tokens, blocks, fingerprint: fingerprint(source) };
}

/** FNV-1a over the UTF-8 bytes, folded with the byte length. */
export function fingerprint(text) {
  const bytes = encoder.encode(String(text ?? ''));
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const length = bytes.length.toString(36);
  return `d${length}-${hash.toString(16).padStart(8, '0')}`;
}

const SLOT_PRIME = 0x9e3779b1;
const slotOf = (value, dims) => (Math.imul(value >>> 0, SLOT_PRIME) >>> 0) % dims;

/**
 * Deterministic hashed embedding over *bytes* and byte bigrams.
 *
 * Deliberately not built from positional token ids: those shift phase when the
 * same text starts at a different offset, which would make a substring look
 * unrelated to its document. Addressing is positional; retrieval is not.
 */
export function embed(text, dims = 256) {
  if (!Number.isInteger(dims) || dims < 16 || dims > 65536) throw new RangeError('dims must be an integer in 16..65536');
  const ids = encode(text);
  const vector = new Float64Array(dims);
  for (let i = 0; i < ids.length; i++) {
    const byte = ids[i] >> BYTE_SHIFT;
    vector[slotOf(byte, dims)] += 1;
    if (i + 1 < ids.length) vector[slotOf((byte << 8) ^ (ids[i + 1] >> BYTE_SHIFT), dims)] += 1;
  }
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dims; i++) vector[i] /= norm;
  return vector;
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) throw new RangeError('cosine needs two vectors of equal length');
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export function similarity(a, b, dims = 256) {
  return cosine(embed(a, dims), embed(b, dims));
}

/** Rank documents by similarity to a query. Docs may be strings or {id,text}. */
export function nearest(query, documents, { k = 5, dims = 256 } = {}) {
  if (!Array.isArray(documents)) throw new TypeError('documents must be an array');
  const q = embed(query, dims);
  const scored = documents.map((doc, index) => {
    const text = typeof doc === 'string' ? doc : String(doc?.text ?? '');
    return {
      id: typeof doc === 'string' ? index : (doc?.id ?? index),
      index,
      score: cosine(q, embed(text, dims)),
    };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, Math.max(0, k));
}

/** Rebuild a token id with an explicit tag. Used to test tag-invariance. */
export function retag(id, tag) {
  if (!Number.isInteger(tag) || tag < 0 || tag >= BLOCK_SIZE) throw new RangeError('tag must be 0..15');
  return ((id >> BYTE_SHIFT) << BYTE_SHIFT) | tag;
}
