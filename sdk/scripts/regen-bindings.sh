#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SDK_DIR="$ROOT/sdk"

# Build wasm first if missing (we generate bindings from local artifacts, not a running network)
if [ ! -f "$ROOT/dist/hourglass_comptroller.optimized.wasm" ] || [ ! -f "$ROOT/dist/hourglass_lockup.optimized.wasm" ]; then
    echo "==> Building wasm first"
    "$ROOT/scripts/build.sh"
fi

mkdir -p "$SDK_DIR/src/generated"

# stellar contract bindings typescript supports --wasm to generate from a local file
echo "==> Generating comptroller bindings"
stellar contract bindings typescript \
    --wasm "$ROOT/dist/hourglass_comptroller.optimized.wasm" \
    --output-dir "$SDK_DIR/src/generated/comptroller" \
    --overwrite

echo "==> Generating lockup bindings"
stellar contract bindings typescript \
    --wasm "$ROOT/dist/hourglass_lockup.optimized.wasm" \
    --output-dir "$SDK_DIR/src/generated/lockup" \
    --overwrite

# The lockup wasm embeds the comptroller spec via contractimport!, which makes
# stellar-cli emit duplicate `export ...` declarations in the generated
# index.ts. Dedupe so the generated package can compile under strict TS.
echo "==> Deduping generated bindings"
node "$SDK_DIR/scripts/dedupe-bindings.mjs" "$SDK_DIR/src/generated/lockup/src/index.ts"
node "$SDK_DIR/scripts/dedupe-bindings.mjs" "$SDK_DIR/src/generated/comptroller/src/index.ts"

# Install + build each generated subpackage so the top-level SDK can re-export
# their compiled `dist/index.js` entry points.
for dir in "$SDK_DIR"/src/generated/*/; do
    echo "==> Installing + building $(basename "$dir") binding package"
    (cd "$dir" && npm install --silent && npm run build --silent)
done

echo "==> Regenerated bindings into sdk/src/generated/"
