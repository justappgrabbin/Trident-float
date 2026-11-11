import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VOCAB_SIZE, BLOCK_SIZE, encode, decode, addressOf, analyse, fingerprint,
  embed, cosine, similarity, nearest, retag,
} from '../backend/src/address-engine.mjs';

/* deterministic pseudo-random strings, so failures reproduce */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('vocabulary is exactly 4096 and every byte keeps its high bits', () => {
  assert.equal(VOCAB_SIZE, 4096);
  assert.equal(VOCAB_SIZE, 256 * BLOCK_SIZE);
  const ids = encode('Trident ♆ 4096');
  for (const id of ids) {
    assert.ok(Number.isInteger(id));
    assert.ok(id >= 0 && id < VOCAB_SIZE, `id ${id} out of range`);
  }
  const bytes = new TextEncoder().encode('Trident ♆ 4096');
  ids.forEach((id, index) => assert.equal(id >> 4, bytes[index]));
});

test('the low nibble is positional, so repeated bytes get distinct addresses', () => {
  const ids = encode('aaaa');
  assert.equal(new Set(ids).size, 4, 'four positions must produce four tokens');
  ids.forEach((id, index) => assert.equal(id & 15, index % BLOCK_SIZE));
  assert.equal(ids[0], ids[16] ?? ids[0]); // no 17th position to compare here
  const longer = encode('a'.repeat(17));
  assert.equal(longer[0], longer[16], 'same byte at the same phase is the same token');
});

test('encode/decode round-trips ASCII, UTF-8, emoji and fuzz', () => {
  const cases = [
    '',
    'hello world',
    'Trident Cynthia ♆ address engine',
    '日本語テキスト',
    'e\u0301 combining',
    '🙂🚀🧠',
    'line\nbreaks\ttabs\r\n',
  ];
  for (const text of cases) assert.equal(decode(encode(text)), text);

  const random = mulberry32(42);
  const alphabet = [...'abcXYZ 019♆日🙂\n\t-_/{}'];
  for (let round = 0; round < 200; round++) {
    let text = '';
    const length = Math.floor(random() * 120);
    for (let i = 0; i < length; i++) text += alphabet[Math.floor(random() * alphabet.length)];
    assert.equal(decode(encode(text)), text, `round ${round}: ${JSON.stringify(text)}`);
  }
});

test('an unpaired surrogate is replaced, not silently corrupted', () => {
  const broken = 'a\uD800b';
  const round = decode(encode(broken));
  assert.equal(round, 'a\uFFFDb');
  assert.equal(decode(encode(round)), round, 'the replacement is stable on re-encode');
});

test('decode ignores the positional tag entirely', () => {
  const text = 'the tag is metadata';
  const ids = encode(text);
  for (let i = 0; i < ids.length; i++) ids[i] = retag(ids[i], (i * 7) % BLOCK_SIZE);
  assert.equal(decode(ids), text);
});

test('addresses are hierarchical, stable and unique per position', () => {
  const { tokens, blocks } = analyse('abcdefghijklmnopq');
  assert.equal(tokens.length, 17);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].length, 16);
  assert.equal(blocks[1].length, 1);
  assert.match(tokens[0].address, /^a0\.[0-9a-f]{3}$/);
  assert.match(tokens[16].address, /^a1\.[0-9a-f]{3}$/);
  assert.equal(new Set(tokens.map(t => t.address)).size, tokens.length, 'same text, distinct addresses');
  assert.equal(analyse('abcdefghijklmnopq').tokens[3].address, tokens[3].address, 'deterministic across calls');
  assert.throws(() => addressOf(4096, 0), /out of range/);
});

test('fingerprints are stable, content-addressed and length-aware', () => {
  assert.equal(fingerprint('same'), fingerprint('same'));
  assert.notEqual(fingerprint('same'), fingerprint('Same'));
  assert.notEqual(fingerprint('a'), fingerprint('a '));
  assert.match(fingerprint('x'), /^d[0-9a-z]+-[0-9a-f]{8}$/);
  assert.equal(fingerprint(''), 'd0-811c9dc5');
});

test('embeddings are normalised, deterministic and content-sensitive', () => {
  const a = embed('the trident address engine');
  const b = embed('the trident address engine');
  assert.equal(cosine(a, b), 1);
  const norm = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9);
  assert.equal(cosine(embed(''), embed('')), 0);
  assert.throws(() => embed('x', 8), /dims/);
  assert.throws(() => cosine([1], [1, 2]), /equal length/);
});

test('near-identical text scores higher than unrelated text', () => {
  const base = 'export const add = (a, b) => a + b;';
  const edited = 'export const add = (a, b) => a - b;';
  const unrelated = 'the quick brown fox jumps over the lazy dog';
  assert.ok(similarity(base, edited) > similarity(base, unrelated));
  assert.ok(similarity(base, edited) > 0.8);
});

test('nearest ranks the real match first and is deterministic', () => {
  const docs = [
    { id: 'math', text: 'export const add = (a, b) => a + b;' },
    { id: 'readme', text: '# Trident\n\nA phone-first builder with a local model.' },
    { id: 'test', text: "import test from 'node:test';\nimport assert from 'node:assert/strict';" },
    { id: 'weather', text: 'sunny with a light breeze in the afternoon' },
  ];
  const ranked = nearest('const add = (a, b) => a + b', docs, { k: 2 });
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].id, 'math');
  assert.deepEqual(ranked, nearest('const add = (a, b) => a + b', docs, { k: 2 }));
  assert.equal(nearest('anything', [], { k: 3 }).length, 0);
});

test('invalid input is rejected instead of silently mangled', () => {
  assert.throws(() => decode([VOCAB_SIZE]), /out of range/);
  assert.throws(() => decode([-1]), /out of range/);
  assert.throws(() => decode(['1']), /out of range/);
  assert.throws(() => retag(4, 16), /tag/);
  assert.equal(decode(encode(null)), '', 'null becomes empty text');
});
