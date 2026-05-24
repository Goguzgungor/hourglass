#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="wasm32v1-none"
DIST="dist"

echo "==> Building Hourglass contracts (release wasm, target=$TARGET)"

# Comptroller MUST be built first — lockup's `contractimport!` reads its wasm
# at compile time.
cargo build --target "$TARGET" --release -p hourglass-comptroller
cargo build --target "$TARGET" --release -p hourglass-lockup

mkdir -p "$DIST"
cp "target/$TARGET/release/hourglass_comptroller.wasm" "$DIST/"
cp "target/$TARGET/release/hourglass_lockup.wasm" "$DIST/"

echo "==> Optimizing wasm"
for f in "$DIST"/*.wasm; do
    stellar contract optimize --wasm "$f"
done

echo
echo "==> Done. Artifacts in $DIST/:"
ls -lh "$DIST"
