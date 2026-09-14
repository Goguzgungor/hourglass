#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK_NAME="testnet"
RPC_URL="https://soroban-testnet.stellar.org:443"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
HORIZON_URL="https://horizon-testnet.stellar.org"
IDENTITY="${IDENTITY:-hourglass-user}"
DEPLOYMENT="deployments/testnet.json"
# Set REUSE_COMPTROLLER=0 to force a fresh comptroller deploy.
REUSE_COMPTROLLER="${REUSE_COMPTROLLER:-1}"

command -v jq >/dev/null || { echo "ERROR: jq is required"; exit 1; }

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
    for i in $(seq 1 6); do
        STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${HORIZON_URL}/accounts/${ADMIN}")"
        if [ "$STATUS" = "200" ]; then
            break
        fi
        echo "    horizon still 404, waiting 5s..."
        sleep 5
    done
fi

# Build artifacts (idempotent)
"$ROOT/scripts/build.sh"

# Native XLM SAC on testnet
NATIVE_WRAPPED="$(stellar contract id asset \
    --network "$NETWORK_NAME" \
    --asset native)"
echo "Native XLM SAC: $NATIVE_WRAPPED"

# ---- Comptroller: reuse the deployed one unless told otherwise ----
EXISTING_COMPTROLLER=""
PREVIOUS_LOCKUP=""
if [ -f "$DEPLOYMENT" ]; then
    EXISTING_COMPTROLLER="$(jq -r '.comptroller // empty' "$DEPLOYMENT")"
    PREVIOUS_LOCKUP="$(jq -r '.lockup // empty' "$DEPLOYMENT")"
fi

if [ "$REUSE_COMPTROLLER" != "0" ] && [ -n "$EXISTING_COMPTROLLER" ]; then
    COMPTROLLER_ID="$EXISTING_COMPTROLLER"
    echo "==> Reusing comptroller $COMPTROLLER_ID"
else
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
fi

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

# ---- Merge into deployments/testnet.json (preserve hgt_*/usdc_* etc.) ----
mkdir -p deployments
if [ -f "$DEPLOYMENT" ]; then BASE="$(cat "$DEPLOYMENT")"; else BASE='{}'; fi
TMP="$(mktemp)"
echo "$BASE" | jq \
    --arg network "$NETWORK_NAME" \
    --arg rpc_url "$RPC_URL" \
    --arg passphrase "$NETWORK_PASSPHRASE" \
    --arg horizon "$HORIZON_URL" \
    --arg deployed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg deployer "$ADMIN" \
    --arg comptroller "$COMPTROLLER_ID" \
    --arg lockup "$LOCKUP_ID" \
    --arg previous_lockup "$PREVIOUS_LOCKUP" \
    --arg native "$NATIVE_WRAPPED" \
    '. + {
        network: $network,
        rpc_url: $rpc_url,
        network_passphrase: $passphrase,
        horizon_url: $horizon,
        deployed_at: $deployed_at,
        deployer: $deployer,
        comptroller: $comptroller,
        lockup: $lockup,
        native_token: $native
    } + (if $previous_lockup != "" and $previous_lockup != $lockup then {previous_lockup: $previous_lockup} else {} end)' \
    > "$TMP"
mv "$TMP" "$DEPLOYMENT"

echo "==> Wrote $DEPLOYMENT"
cat "$DEPLOYMENT"
