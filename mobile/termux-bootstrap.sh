#!/data/data/com.termux/files/usr/bin/bash
# Adapted from Synthai2 mobile/termux-bootstrap.sh at cfbe3ee3018c41fc8abe6e1734eee5b630595a3f.
# Run from this extracted checkout in Termux. No repositories are overwritten.
set -euo pipefail
trident_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
pkg install -y nodejs-lts
exec bash "$trident_root/mobile/start-trident.sh"
