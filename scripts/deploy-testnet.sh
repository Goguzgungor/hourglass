#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK_NAME="testnet"
RPC_URL="https://soroban-testnet.stellar.org:443"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
HORIZON_URL="https://horizon-testnet.stellar.org"
IDENTITY="${IDENTITY:-hourglass-user}"

# Ensure network exists in stellar-cli config (idempotent)
if ! stellar network ls 2>/dev/null | grep -q "^${NETWORK_NAME}\b"; then
    stellar network add "$NETWORK_NAME" \
        --rpc-url "$RPC_URL" \
        --network-passphrase "$NETWORK_PASSPHRASE"
fi

if ! stellar keys ls 2>/dev/null | grep -q "^${IDENTITY}\b"; then
    echo "ERROR: identity '$IDENTITY' is not configured in stellar-cli."
    echo "Import it first (e.g. stellar keys add $IDENTITY --secret-key ...)."
    exit 1
fi

ADMIN="$(stellar keys address "$IDENTITY")"
echo "==> Using identity '$IDENTITY' -> $ADMIN"

# Friendbot — only attempts if account doesn't exist yet
STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${HORIZON_URL}/accounts/${ADMIN}")"
if [ "$STATUS" != "200" ]; then
    echo "==> Funding $ADMIN via Friendbot"
    for i in $(seq 1 6); do
        FB_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "https://friendbot.stellar.org/?addr=${ADMIN}")"
        if [ "$FB_STATUS" = "200" ] || [ "$FB_STATUS" = "400" ]; then
            break
        fi
        echo "    friendbot returned $FB_STATUS, retrying in 10s..."
        sleep 10
    done
    sleep 5
    # Re-verify account exists on Horizon
    for i in $(seq 1 6); do
        STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${HORIZON_URL}/accounts/${ADMIN}")"
        if [ "$STATUS" = "200" ]; then
            break
        fi
        echo "    horizon still 404, waiting 5s..."
        sleep 5
    done
fi

# Build artifacts (idempotent — already built but re-run is cheap)
"$ROOT/scripts/build.sh"

# Native XLM SAC on testnet
NATIVE_WRAPPED="$(stellar contract id asset \
    --network "$NETWORK_NAME" \
    --asset native)"
echo "Native XLM SAC: $NATIVE_WRAPPED"

# Sentinel oracle = admin for Phase 0 (fees default to 0)
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
cat > "deployments/testnet.json" <<EOF
{
  "network": "$NETWORK_NAME",
  "rpc_url": "$RPC_URL",
  "network_passphrase": "$NETWORK_PASSPHRASE",
  "horizon_url": "$HORIZON_URL",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployer": "$ADMIN",
  "comptroller": "$COMPTROLLER_ID",
  "lockup": "$LOCKUP_ID",
  "native_token": "$NATIVE_WRAPPED"
}
EOF

echo "==> Wrote deployments/testnet.json"
cat deployments/testnet.json
