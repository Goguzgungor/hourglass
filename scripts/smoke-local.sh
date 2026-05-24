#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOYMENT="deployments/local.json"
if [ ! -f "$DEPLOYMENT" ]; then
    echo "Missing $DEPLOYMENT — run scripts/deploy-local.sh first."
    exit 1
fi

NETWORK="local"
LOCKUP="$(jq -r .lockup "$DEPLOYMENT")"
NATIVE="$(jq -r .native_token "$DEPLOYMENT")"
DEPLOY_IDENTITY="hourglass-local-deploy"
SENDER="$(stellar keys address "$DEPLOY_IDENTITY")"

RECIPIENT_KEY="hourglass-smoke-recipient-$(date +%s)"
stellar keys generate "$RECIPIENT_KEY" --network "$NETWORK"
RECIPIENT="$(stellar keys address "$RECIPIENT_KEY")"

# Friendbot the recipient too
curl -s "http://localhost:8000/friendbot?addr=${RECIPIENT}" > /dev/null

NOW="$(date +%s)"
START="$((NOW + 30))"
END="$((START + 300))"

echo "==> Creating linear stream (sender=$SENDER recipient=$RECIPIENT)"
STREAM_ID="$(stellar contract invoke \
    --network "$NETWORK" \
    --source "$DEPLOY_IDENTITY" \
    --id "$LOCKUP" \
    -- create_linear \
    --sender "$SENDER" \
    --recipient "$RECIPIENT" \
    --token "$NATIVE" \
    --deposited 100000000 \
    --start_ts "$START" \
    --cliff_ts "$START" \
    --end_ts "$END" \
    --unlock_at_start 0 \
    --unlock_at_cliff 0 \
    --is_cancelable true \
    --is_transferable true)"
echo "Stream id: $STREAM_ID"

echo "==> Reading stream back"
stellar contract invoke \
    --network "$NETWORK" \
    --source "$DEPLOY_IDENTITY" \
    --id "$LOCKUP" \
    -- get_stream --stream_id "$STREAM_ID"

echo "==> Sleeping 35s to enter STREAMING"
sleep 35

echo "==> Withdrawable amount:"
stellar contract invoke \
    --network "$NETWORK" \
    --source "$RECIPIENT_KEY" \
    --id "$LOCKUP" \
    -- withdrawable_amount --stream_id "$STREAM_ID"

echo "==> Withdraw max"
stellar contract invoke \
    --network "$NETWORK" \
    --source "$RECIPIENT_KEY" \
    --id "$LOCKUP" \
    -- withdraw_max --stream_id "$STREAM_ID" --to "$RECIPIENT"

echo "==> Done."
