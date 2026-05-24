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
# Clean prior outputs so re-runs don't double-optimize.
rm -f "$DIST"/*.wasm
cp "target/$TARGET/release/hourglass_comptroller.wasm" "$DIST/"
cp "target/$TARGET/release/hourglass_lockup.wasm" "$DIST/"

echo "==> Optimizing wasm"
# Glob only the originals, not the .optimized.wasm we produce.
for f in "$DIST/hourglass_comptroller.wasm" "$DIST/hourglass_lockup.wasm"; do
    stellar contract optimize --wasm "$f"
done

echo
echo "==> Done. Artifacts in $DIST/:"
ls -lh "$DIST"
