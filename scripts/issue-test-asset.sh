#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK_NAME="${NETWORK:-testnet}"
HORIZON_URL="https://horizon-testnet.stellar.org"
ASSET_CODE="HGT"
USER="${USER_IDENTITY:-hourglass-user}"

if ! stellar keys ls 2>/dev/null | grep -q "^hgt-issuer\b"; then
    stellar keys generate hgt-issuer --network "$NETWORK_NAME"
fi
ISSUER="$(stellar keys address hgt-issuer)"
DISTRIB="$(stellar keys address "$USER")"
echo "Issuer: $ISSUER"
echo "Distributor: $DISTRIB"

# Fund issuer via Friendbot
ACCT_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${HORIZON_URL}/accounts/${ISSUER}")"
if [ "$ACCT_STATUS" != "200" ]; then
    echo "==> Funding issuer via Friendbot"
    for i in $(seq 1 6); do
        FB_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "https://friendbot.stellar.org/?addr=${ISSUER}")"
        if [ "$FB_STATUS" = "200" ] || [ "$FB_STATUS" = "400" ]; then
            break
        fi
        echo "    friendbot returned $FB_STATUS, retrying in 10s..."
        sleep 10
    done
    sleep 5
    for i in $(seq 1 6); do
        ACCT_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${HORIZON_URL}/accounts/${ISSUER}")"
        if [ "$ACCT_STATUS" = "200" ]; then
            break
        fi
        echo "    horizon still 404 for issuer, waiting 5s..."
        sleep 5
    done
fi

# Add trustline from distributor for HGT:ISSUER (idempotent: if already exists,
# change-trust is a no-op when limits match).
echo "==> Distributor trustline for ${ASSET_CODE}:${ISSUER}"
stellar tx new change-trust \
    --network "$NETWORK_NAME" \
    --source "$USER" \
    --line "${ASSET_CODE}:${ISSUER}" 2>&1 | tail -3

# Issue tokens: issuer pays 10M HGT (1e7 stroops * 1e7 units = 1e14) to distributor
echo "==> Issuing 10M HGT to distributor"
stellar tx new payment \
    --network "$NETWORK_NAME" \
    --source hgt-issuer \
    --destination "$DISTRIB" \
    --asset "${ASSET_CODE}:${ISSUER}" \
    --amount 100000000000000 2>&1 | tail -3

# Wrap to SAC. If it already wraps, the deploy errors — fall back to id-lookup.
echo "==> Wrapping ${ASSET_CODE}:${ISSUER} to SAC"
HGT_SAC_RAW="$(stellar contract asset deploy \
    --network "$NETWORK_NAME" \
    --source "$USER" \
    --asset "${ASSET_CODE}:${ISSUER}" 2>&1 || true)"
HGT_SAC="$(echo "$HGT_SAC_RAW" | tr -d '\r' | grep -oE 'C[A-Z2-7]{55}' | tail -1 || true)"

if [ -z "$HGT_SAC" ]; then
    echo "    asset-deploy output did not contain a contract id; falling back to id lookup"
    HGT_SAC="$(stellar contract id asset \
        --network "$NETWORK_NAME" \
        --asset "${ASSET_CODE}:${ISSUER}")"
fi
echo "HGT SAC: $HGT_SAC"

# Update deployments/testnet.json with the HGT token info
DEPLOYMENT="deployments/testnet.json"
if [ ! -f "$DEPLOYMENT" ]; then
    echo "ERROR: $DEPLOYMENT not found. Run scripts/deploy-testnet.sh first."
    exit 1
fi
TMP="$(mktemp)"
jq --arg hgt "$HGT_SAC" --arg iss "$ISSUER" '. + {hgt_token: $hgt, hgt_issuer: $iss}' "$DEPLOYMENT" > "$TMP" && mv "$TMP" "$DEPLOYMENT"

echo "==> Updated deployments/testnet.json"
cat "$DEPLOYMENT"
