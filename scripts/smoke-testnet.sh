#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK="${NETWORK:-testnet}"
DEPLOYMENT="deployments/${NETWORK}.json"
HORIZON_URL="https://horizon-testnet.stellar.org"
LOG="smoke-testnet-$(date +%s).log"

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
echo "Log:       $LOG"

# invoke <source-identity> <fn> [args...] — prints the return value on stdout,
# appends all CLI chatter (incl. tx hashes) to $LOG.
invoke() {
    local source="$1"; shift
    stellar contract invoke \
        --network "$NETWORK" \
        --source "$source" \
        --id "$LOCKUP" \
        -- "$@" 2>>"$LOG"
}

fund() {
    local addr="$1"
    for i in $(seq 1 6); do
        FB_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "https://friendbot.stellar.org/?addr=${addr}")"
        if [ "$FB_STATUS" = "200" ] || [ "$FB_STATUS" = "400" ]; then
            break
        fi
        echo "    friendbot $FB_STATUS, retrying in 10s..."
        sleep 10
    done
}

strip_num() { echo "$1" | tr -d '" ' ; }

# ---------------------------------------------------------------- recipients
RECIPIENT_KEY="hgt-smoke-recipient-$(date +%s)"
stellar keys generate "$RECIPIENT_KEY" --network "$NETWORK" 2>>"$LOG"
RECIPIENT="$(stellar keys address "$RECIPIENT_KEY")"
echo "Recipient: $RECIPIENT ($RECIPIENT_KEY)"
echo "==> Funding recipient via Friendbot"
fund "$RECIPIENT"
sleep 5

NOW="$(date +%s)"

# ---------------------------------------------------------------- 1. linear
START="$((NOW + 15))"
CLIFF="$((START + 30))"
END="$((START + 600))"
echo "==> create_linear (10 XLM over 10 minutes, 30s cliff)"
LINEAR_ID="$(strip_num "$(invoke hourglass-user create_linear \
    --sender "$SENDER" --recipient "$RECIPIENT" --token "$TOKEN" \
    --deposited 100000000 --start_ts "$START" --cliff_ts "$CLIFF" --end_ts "$END" \
    --unlock_at_start 0 --unlock_at_cliff 1000000 \
    --is_cancelable true --is_transferable true)")"
echo "Linear stream id: $LINEAR_ID"

# ---------------------------------------------------------------- 2. recurring
FIRST="$((NOW + 20))"
echo "==> create_recurring (3 x 1 XLM, every 60s, first at +20s)"
RECURRING_ID="$(strip_num "$(invoke hourglass-user create_recurring \
    --sender "$SENDER" --recipient "$RECIPIENT" --token "$TOKEN" \
    --amount_per_period 10000000 --period_secs 60 --count 3 --first_ts "$FIRST" \
    --is_cancelable true --is_transferable true)")"
echo "Recurring stream id: $RECURRING_ID"
invoke hourglass-user get_stream --stream_id "$RECURRING_ID" | jq -c '{start_ts, end_ts, deposited, shape}'

# ---------------------------------------------------------------- 3. batch
BSTART="$((NOW + 60))"
ROWS="$(jq -nc \
    --arg r "$RECIPIENT" \
    --argjson s "$BSTART" \
    '[
      { recipient: $r, is_cancelable: true,  is_transferable: true,
        spec: { Linear: { deposited: "20000000", start_ts: $s, cliff_ts: $s, end_ts: ($s + 600),
                          unlock_at_start: "0", unlock_at_cliff: "0" } } },
      { recipient: $r, is_cancelable: true,  is_transferable: false,
        spec: { Recurring: { amount_per_period: "5000000", period_secs: 60, count: 2, first_ts: $s } } },
      { recipient: $r, is_cancelable: false, is_transferable: true,
        spec: { Tranched: { tranches: [ { amount: "1000000", ts: $s }, { amount: "2000000", ts: ($s + 120) } ] } } }
    ]')"
echo "==> create_batch (linear + recurring + tranched, one tx)"
BATCH_IDS="$(invoke hourglass-user create_batch --sender "$SENDER" --token "$TOKEN" --rows "$ROWS")"
echo "Batch ids: $BATCH_IDS"
B0="$(echo "$BATCH_IDS" | jq -r '.[0]')"
B1="$(echo "$BATCH_IDS" | jq -r '.[1]')"
B2="$(echo "$BATCH_IDS" | jq -r '.[2]')"
if [ "$B1" != "$((B0 + 1))" ] || [ "$B2" != "$((B0 + 2))" ]; then
    echo "ERROR: batch ids are not consecutive: $BATCH_IDS"
    exit 1
fi
if [ "$B0" != "$((RECURRING_ID + 1))" ]; then
    echo "ERROR: expected first batch id $((RECURRING_ID + 1)), got $B0"
    exit 1
fi

# ---------------------------------------------------------------- 4. withdraw
echo "==> Waiting for the linear cliff and the first recurring unlock"
sleep 50

WITHDRAWABLE="$(strip_num "$(invoke "$RECIPIENT_KEY" withdrawable_amount --stream_id "$LINEAR_ID")")"
echo "Linear withdrawable: $WITHDRAWABLE stroops"
if ! [[ "$WITHDRAWABLE" =~ ^[0-9]+$ ]] || [ "$WITHDRAWABLE" -lt 1 ]; then
    echo "ERROR: expected linear withdrawable > 0, got '$WITHDRAWABLE'"
    exit 1
fi
invoke "$RECIPIENT_KEY" withdraw_max --stream_id "$LINEAR_ID" --to "$RECIPIENT" >/dev/null

REC_WITHDRAWABLE="$(strip_num "$(invoke "$RECIPIENT_KEY" withdrawable_amount --stream_id "$RECURRING_ID")")"
echo "Recurring withdrawable: $REC_WITHDRAWABLE stroops"
if ! [[ "$REC_WITHDRAWABLE" =~ ^[0-9]+$ ]] || [ "$REC_WITHDRAWABLE" -lt 10000000 ]; then
    echo "ERROR: expected recurring withdrawable >= 10000000 (one period), got '$REC_WITHDRAWABLE'"
    exit 1
fi
invoke "$RECIPIENT_KEY" withdraw_max --stream_id "$RECURRING_ID" --to "$RECIPIENT" >/dev/null
REC_STATE="$(invoke hourglass-user get_stream --stream_id "$RECURRING_ID")"
echo "Recurring after withdraw: $(echo "$REC_STATE" | jq -c '{deposited, withdrawn}')"
REC_WITHDRAWN="$(echo "$REC_STATE" | jq -r '.withdrawn' | tr -d '"')"
if [ "$REC_WITHDRAWN" -lt 10000000 ]; then
    echo "ERROR: recurring withdrawn should be >= 10000000, got $REC_WITHDRAWN"
    exit 1
fi

echo ""
echo "==> Recipient native XLM balance:"
curl -s "${HORIZON_URL}/accounts/${RECIPIENT}" \
    | jq -r '.balances[] | select(.asset_type=="native") | .balance'

# ---------------------------------------------------------------- 5. batch-size probe (optional)
# PROBE_BATCH=1 tries growing linear batches and reports the largest that fits
# the per-tx resource budget. Creates real (tiny) streams to the recipient.
if [ "${PROBE_BATCH:-0}" = "1" ]; then
    PSTART="$(( $(date +%s) + 120 ))"
    LARGEST=0
    for n in 10 20 30 40 50; do
        PROWS="$(jq -nc --arg r "$RECIPIENT" --argjson s "$PSTART" --argjson n "$n" \
            '[range($n)] | map({ recipient: $r, is_cancelable: true, is_transferable: true,
                spec: { Linear: { deposited: "1000", start_ts: $s, cliff_ts: $s, end_ts: ($s + 600),
                                  unlock_at_start: "0", unlock_at_cliff: "0" } } })')"
        echo "==> probe: create_batch with $n rows"
        if invoke hourglass-user create_batch --sender "$SENDER" --token "$TOKEN" --rows "$PROWS" >/dev/null; then
            LARGEST="$n"
        else
            echo "    $n rows did not fit; stopping probe"
            break
        fi
    done
    echo "==> Largest linear batch that fit in one tx: $LARGEST rows"
fi

echo ""
echo "==> Transaction hashes (evidence):"
grep -oE '\b[0-9a-f]{64}\b' "$LOG" | sort -u

echo ""
echo "==> Stream ids: linear=$LINEAR_ID recurring=$RECURRING_ID batch=$BATCH_IDS"
echo "==> SMOKE PASSED ✓"
