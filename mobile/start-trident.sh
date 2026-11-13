#!/usr/bin/env bash
set -euo pipefail
trident_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$trident_root"
command -v node >/dev/null || { echo 'Node.js 22+ is required. In Termux: pkg install nodejs-lts'; exit 1; }
export TRIDENT_DATA_DIR="${TRIDENT_DATA_DIR:-$trident_root/workspace}"
export PORT=8765
mkdir -p "$TRIDENT_DATA_DIR"
echo 'Starting Trident inside SynthAi Computer on this phone.'
echo 'Keep this Termux session running, then open Trident.'
exec node backend/src/generative-server.mjs
