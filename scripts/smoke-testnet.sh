#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK="${NETWORK:-testnet}"
DEPLOYMENT="deployments/${NETWORK}.json"
HORIZON_URL="https://horizon-testnet.stellar.org"

if [ ! -f "$DEPLOYMENT" ]; then
    echo "Missing $DEPLOYMENT — run scripts/deploy-testnet.sh first."
    exit 1
fi

LOCKUP="$(jq -r .lockup "$DEPLOYMENT")"
TOKEN="${TOKEN:-$(jq -r .native_token "$DEPLOYMENT")}"
SENDER="$(stellar keys address hourglass-user)"
echo "Network:   $NETWORK"
echo "Lockup:    $LOCKUP"
echo "Token:     $TOKEN"
echo "Sender:    $SENDER"

# Fresh recipient
RECIPIENT_KEY="hgt-smoke-recipient-$(date +%s)"
stellar keys generate "$RECIPIENT_KEY" --network "$NETWORK"
RECIPIENT="$(stellar keys address "$RECIPIENT_KEY")"
echo "Recipient: $RECIPIENT ($RECIPIENT_KEY)"

echo "==> Funding recipient via Friendbot"
for i in $(seq 1 6); do
    FB_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "https://friendbot.stellar.org/?addr=${RECIPIENT}")"
    if [ "$FB_STATUS" = "200" ] || [ "$FB_STATUS" = "400" ]; then
        break
    fi
    echo "    friendbot $FB_STATUS, retrying in 10s..."
    sleep 10
done
sleep 5

NOW="$(date +%s)"
START="$((NOW + 15))"
CLIFF="$((START + 30))"
END="$((START + 600))"

echo "==> create_linear (10 XLM over 10 minutes, 30s cliff)"
STREAM_ID="$(stellar contract invoke \
    --network "$NETWORK" \
    --source hourglass-user \
    --id "$LOCKUP" \
    -- create_linear \
    --sender "$SENDER" \
    --recipient "$RECIPIENT" \
    --token "$TOKEN" \
    --deposited 100000000 \
    --start_ts "$START" \
    --cliff_ts "$CLIFF" \
    --end_ts "$END" \
    --unlock_at_start 0 \
    --unlock_at_cliff 1000000 \
    --is_cancelable true \
    --is_transferable true 2>&1 | tail -1)"
echo "Stream id: $STREAM_ID"

echo "==> Reading stream back"
stellar contract invoke \
    --network "$NETWORK" \
    --source hourglass-user \
    --id "$LOCKUP" \
    -- get_stream --stream_id "$STREAM_ID"

echo ""
echo "==> Waiting for stream to enter STREAMING (after cliff)"
sleep 50

echo "==> withdrawable_amount:"
WITHDRAWABLE="$(stellar contract invoke \
    --network "$NETWORK" \
    --source "$RECIPIENT_KEY" \
    --id "$LOCKUP" \
    -- withdrawable_amount --stream_id "$STREAM_ID" 2>&1 | tail -1)"
echo "$WITHDRAWABLE stroops"

# Strip surrounding quotes if present
WITHDRAWABLE_NUM="$(echo "$WITHDRAWABLE" | tr -d '"' | tr -d ' ')"
if ! [[ "$WITHDRAWABLE_NUM" =~ ^[0-9]+$ ]] || [ "$WITHDRAWABLE_NUM" -lt 1 ]; then
    echo "ERROR: expected withdrawable > 0, got '$WITHDRAWABLE_NUM'"
    exit 1
fi

echo "==> withdraw_max"
stellar contract invoke \
    --network "$NETWORK" \
    --source "$RECIPIENT_KEY" \
    --id "$LOCKUP" \
    -- withdraw_max --stream_id "$STREAM_ID" --to "$RECIPIENT"

echo ""
echo "==> Recipient native XLM balance:"
curl -s "${HORIZON_URL}/accounts/${RECIPIENT}" \
    | jq -r '.balances[] | select(.asset_type=="native") | .balance'

echo ""
echo "==> Stream state after withdraw:"
stellar contract invoke \
    --network "$NETWORK" \
    --source hourglass-user \
    --id "$LOCKUP" \
    -- get_stream --stream_id "$STREAM_ID"

echo ""
echo "==> SMOKE PASSED ✓"
