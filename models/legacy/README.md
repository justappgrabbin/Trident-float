# Legacy Trident address engine (recovered)

`trident_syntia.onnx` is the surviving copy of the "Trident Cynthia" address
engine, recovered from `justappgrabbin/Synthai2` @ `main`
(`synthia-server/opt/render/project/src/ml/trident_syntia.onnx`).

It is **not an LLM and not coder weights**. It is a tiny transformer language
model over a 4096-token vocabulary:

| Property | Value |
|---|---|
| Parameters | 3,329,873 |
| d_model | 128 |
| Attention heads | 4 |
| Feed-forward | 512 |
| Blocks | 4 (`backbone.0` … `backbone.3`) |
| Positional encoding | sinusoidal (`pos_enc`) |
| Vocabulary / logits | 4096 |
| Input | `input_ids` `[batch, seq]` |
| Output | `logits` `[1, seq, 4096]` |
| Origin | PyTorch 2.10.0+cu128 → ONNX |

Run `node models/legacy/inspect-onnx.mjs` to re-derive the table from the file
itself (it parses the ONNX protobuf directly, no dependencies).

The tokenizer that produced `input_ids` was **not** in the export, so the model
cannot be run meaningfully without it. Treat this as an artifact to rebuild
from, not a working component.
