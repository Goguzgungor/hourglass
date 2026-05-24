#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK_NAME="local"
RPC_URL="http://localhost:8000/soroban/rpc"
NETWORK_PASSPHRASE="Standalone Network ; February 2017"
IDENTITY="hourglass-local-deploy"

# Make sure stellar-cli knows the local network
if ! stellar network ls 2>/dev/null | grep -q "^${NETWORK_NAME}\b"; then
    stellar network add "$NETWORK_NAME" \
        --rpc-url "$RPC_URL" \
        --network-passphrase "$NETWORK_PASSPHRASE"
fi

# Ensure deploying identity exists and is funded via the local Friendbot
if ! stellar keys ls 2>/dev/null | grep -q "^${IDENTITY}\b"; then
    stellar keys generate "$IDENTITY" --network "$NETWORK_NAME"
fi

ADMIN="$(stellar keys address "$IDENTITY")"

# Friendbot may take a while to come up after quickstart launches.
# Retry up to 60s — give up only if it never responds with success.
for i in $(seq 1 30); do
    STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8000/friendbot?addr=${ADMIN}")"
    if [ "$STATUS" = "200" ]; then
        echo "==> Funded $ADMIN via Friendbot"
        break
    fi
    # 400 means account already exists -> also fine
    if [ "$STATUS" = "400" ]; then
        echo "==> $ADMIN already funded"
        break
    fi
    sleep 2
done

# Build artifacts (idempotent — re-runs are cheap)
"$ROOT/scripts/build.sh"

# Native XLM SAC on the local standalone network has a deterministic id.
# Wrap the native asset and stash its contract id.
NATIVE_WRAPPED="$(stellar contract asset deploy \
    --network "$NETWORK_NAME" \
    --source "$IDENTITY" \
    --asset native 2>/dev/null || true)"
if [ -z "$NATIVE_WRAPPED" ]; then
    # Already wrapped — fetch by querying the SAC id
    NATIVE_WRAPPED="$(stellar contract id asset \
        --network "$NETWORK_NAME" \
        --source-account "$IDENTITY" \
        --asset native 2>/dev/null \
        || stellar contract id asset \
        --network "$NETWORK_NAME" \
        --asset native)"
fi
echo "Native XLM SAC: $NATIVE_WRAPPED"

# Use the admin as a dummy oracle address for Phase 0 (fees default to 0)
ORACLE_SENTINEL="$ADMIN"

echo "==> Deploying comptroller"
COMPTROLLER_ID="$(stellar contract deploy \
    --network "$NETWORK_NAME" \
    --source "$IDENTITY" \
    --wasm dist/hourglass_comptroller.optimized.wasm \
    -- \
    --admin "$ADMIN" \
    --fee_collector "$ADMIN" \
    --oracle "$ORACLE_SENTINEL" \
    --max_staleness_secs 3600)"
echo "Comptroller: $COMPTROLLER_ID"

echo "==> Deploying lockup"
LOCKUP_ID="$(stellar contract deploy \
    --network "$NETWORK_NAME" \
    --source "$IDENTITY" \
    --wasm dist/hourglass_lockup.optimized.wasm \
    -- \
    --admin "$ADMIN" \
    --comptroller "$COMPTROLLER_ID" \
    --native_token "$NATIVE_WRAPPED")"
echo "Lockup: $LOCKUP_ID"

mkdir -p deployments
cat > "deployments/local.json" <<EOF
{
  "network": "$NETWORK_NAME",
  "rpc_url": "$RPC_URL",
  "network_passphrase": "$NETWORK_PASSPHRASE",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployer": "$ADMIN",
  "comptroller": "$COMPTROLLER_ID",
  "lockup": "$LOCKUP_ID",
  "native_token": "$NATIVE_WRAPPED"
}
EOF

echo "==> Wrote deployments/local.json"
cat deployments/local.json
