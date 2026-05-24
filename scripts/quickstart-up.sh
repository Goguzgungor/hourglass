#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="hourglass-quickstart"
IMAGE="stellar/quickstart:testing"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "==> Quickstart already running"
else
    echo "==> Removing any stopped quickstart container"
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
    echo "==> Starting Stellar quickstart (local network, Soroban RPC enabled)"
    docker run -d --rm \
        --name "$CONTAINER_NAME" \
        -p 8000:8000 \
        "$IMAGE" \
        --local \
        --enable-soroban-rpc \
        --limits unlimited
fi

echo "==> Waiting for RPC to be ready..."
for i in $(seq 1 60); do
    if curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/soroban/rpc \
        -H 'Content-Type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q "200"; then
        echo "==> RPC ready at http://localhost:8000/soroban/rpc"
        break
    fi
    sleep 2
done

echo "==> Friendbot at http://localhost:8000/friendbot"
echo "==> Network passphrase: Standalone Network ; February 2017"
