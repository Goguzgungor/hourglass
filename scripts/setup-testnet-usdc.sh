#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK="${NETWORK:-testnet}"
USER="${USER_IDENTITY:-hourglass-user}"
ISSUER="${USDC_ISSUER:-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5}"
ASSET_CODE="USDC"
USER_ADDR="$(stellar keys address "$USER")"

echo "==> Checking existing USDC trustline on $USER_ADDR"
HAS_TRUSTLINE="$(curl -s "https://horizon-testnet.stellar.org/accounts/${USER_ADDR}" | \
  jq -r --arg code "$ASSET_CODE" --arg iss "$ISSUER" \
  '.balances[] | select(.asset_code==$code and .asset_issuer==$iss) | .asset_code' | head -1)"

if [ -z "$HAS_TRUSTLINE" ]; then
  echo "==> Creating trustline ${ASSET_CODE}:${ISSUER}"
  stellar tx new change-trust \
    --network "$NETWORK" \
    --source "$USER" \
    --line "${ASSET_CODE}:${ISSUER}" 2>&1 | tail -3
else
  echo "==> Trustline already exists"
fi

echo "==> Deriving USDC SAC id"
USDC_SAC="$(stellar contract id asset \
  --network "$NETWORK" \
  --asset "${ASSET_CODE}:${ISSUER}")"
echo "USDC SAC: $USDC_SAC"

echo "==> Requesting USDC faucet drop"
for i in 1 2 3; do
  STATUS="$(curl -s -o /tmp/usdc-faucet.json -w '%{http_code}' \
    -X POST 'https://faucet.circle.com/api/v1/faucet/drops' \
    -H 'Content-Type: application/json' \
    -d "{\"destinationAddress\":\"${USER_ADDR}\",\"blockchain\":\"STELLAR_TESTNET\"}")"
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ] || [ "$STATUS" = "202" ]; then
    echo "    Faucet OK (status $STATUS):"
    cat /tmp/usdc-faucet.json | head -3
    break
  fi
  echo "    Faucet attempt $i HTTP $STATUS — body:"
  cat /tmp/usdc-faucet.json | head -3
  sleep 5
done

echo "==> Waiting for USDC balance to land (up to 60s)"
for i in $(seq 1 12); do
  BAL="$(curl -s "https://horizon-testnet.stellar.org/accounts/${USER_ADDR}" | \
    jq -r --arg code "$ASSET_CODE" --arg iss "$ISSUER" \
    '.balances[] | select(.asset_code==$code and .asset_issuer==$iss) | .balance' | head -1)"
  if [ -n "$BAL" ] && [ "$(echo "$BAL > 0" | bc -l)" = "1" ]; then
    echo "    USDC balance: $BAL"
    break
  fi
  echo "    poll $i: balance not yet credited"
  sleep 5
done

echo ""
echo "==> Updating deployments/testnet.json"
TMP="$(mktemp)"
jq --arg sac "$USDC_SAC" --arg iss "$ISSUER" \
  '. + {usdc_token: $sac, usdc_issuer: $iss}' \
  deployments/testnet.json > "$TMP" && mv "$TMP" deployments/testnet.json
cat deployments/testnet.json
