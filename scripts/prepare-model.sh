#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p vendor app/src/main/assets/models
if [ ! -f vendor/llama.cpp/include/llama.h ]; then
  git init vendor/llama.cpp
  git -C vendor/llama.cpp remote add origin https://github.com/ggml-org/llama.cpp.git
  git -C vendor/llama.cpp fetch --depth 1 origin 17701e48d7fa3b7dac949cb9e5e6d241a382333c
  git -C vendor/llama.cpp checkout --detach FETCH_HEAD
fi
test "$(git -C vendor/llama.cpp rev-parse HEAD)" = 17701e48d7fa3b7dac949cb9e5e6d241a382333c
weights=app/src/main/assets/models/qwen-coder-q4.gguf
if [ ! -f "$weights" ]; then
  curl -fL --retry 3 https://huggingface.co/Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF/resolve/ebb2015119c907b064c512bf053e945850b5875f/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf -o "$weights.partial"
  mv "$weights.partial" "$weights"
fi
sha256sum -c scripts/model.sha256
