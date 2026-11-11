import fs from 'node:fs';
const buf = fs.readFileSync('trident_syntia.onnx');

function varint(b, pos) {
  let r = 0, s = 0, byte;
  do { byte = b[pos++]; r += (byte & 0x7f) * 2 ** s; s += 7; } while (byte & 0x80);
  return [r, pos];
}
function walk(b, cb) {
  let pos = 0;
  while (pos < b.length) {
    let key; [key, pos] = varint(b, pos);
    const field = key >>> 3, wt = key & 7;
    if (wt === 0) { let v; [v, pos] = varint(b, pos); cb(field, v, 'varint'); }
    else if (wt === 2) { let len; [len, pos] = varint(b, pos); cb(field, b.subarray(pos, pos + len), 'bytes'); pos += len; }
    else if (wt === 1) { cb(field, b.subarray(pos, pos + 8), 'bytes'); pos += 8; }
    else if (wt === 5) { cb(field, b.subarray(pos, pos + 4), 'bytes'); pos += 4; }
    else throw new Error(`wire type ${wt} for field ${field}`);
  }
}
const asStr = b => Buffer.from(b).toString('utf8');
const tensors = [], ios = [];

let graph = null;
walk(buf, (f, v) => { if (f === 7) graph = v; });
walk(graph, (f, v) => {
  if (f === 5) {
    const t = { dims: [], name: '', dtype: 0 };
    walk(v, (tf, tv) => { if (tf === 1) t.dims.push(tv); else if (tf === 2) t.dtype = tv; else if (tf === 8) t.name = asStr(tv); });
    tensors.push(t);
  } else if (f === 11 || f === 12) {
    const io = { kind: f === 11 ? 'input' : 'output', name: '', dims: [] };
    walk(v, (vf, vv) => {
      if (vf === 1) io.name = asStr(vv);
      if (vf === 2) walk(vv, (tf, tv) => { if (tf === 1) walk(tv, (sf, sv) => { if (sf === 2) walk(sv, (df, dv) => { if (df === 1) walk(dv, (dimf, dimv) => { if (dimf === 1) io.dims.push(dimv); else io.dims.push('?'); }); }); }); });
    });
    ios.push(io);
  }
});
console.log(`initializers: ${tensors.length}`);
for (const t of tensors) {
  const n = t.dims.reduce((a, b) => a * b, 1);
  console.log(`${String(n).padStart(12)}  [${t.dims.join(',')}]  ${t.name}`);
}
console.log(`\ngraph io: ${ios.map(i => `${i.kind}:${i.name}[${i.dims.join(',')}]`).join('  ')}`);
const total = tensors.reduce((a, t) => a + t.dims.reduce((x, y) => x * y, 1), 0);
console.log(`total parameters: ${total.toLocaleString()}`);
