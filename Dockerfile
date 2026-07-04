# ─── Stage 1: Build SDK ───────────────────────────────────────────────────────
FROM node:22-alpine AS sdk-builder
WORKDIR /app/sdk
COPY sdk/package*.json ./
RUN npm ci
COPY sdk/ ./
RUN npm run build

# ─── Stage 2: Build frontend + bake testnet deployment ────────────────────────
FROM node:22-alpine AS app-builder
WORKDIR /app
# SDK must be at ../sdk relative to frontend/ for the file: dep to resolve
COPY --from=sdk-builder /app/sdk ./sdk
COPY frontend/package*.json ./frontend/
# --ignore-scripts skips native addon builds (usb, from stellar-wallets-kit)
# which are browser-only and not needed server-side
RUN cd frontend && npm ci --ignore-scripts
COPY frontend/ ./frontend/
COPY deployments/ ./deployments/
# prebuild script (sync-deployment.mjs) runs automatically before build:
#   - copies deployments/testnet.json → src/lib/deployment.json
#   - materialises sdk/dist → node_modules/hourglass
ENV DEPLOY_NETWORK=testnet
RUN cd frontend && npm run build

# ─── Stage 3: Runtime image (frontend + indexer share this) ───────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=sdk-builder /app/sdk ./sdk
COPY --from=app-builder /app/frontend ./frontend
# deployments dir needed by the indexer at runtime (DEPLOYMENT constant)
COPY deployments/ ./deployments/

WORKDIR /app/frontend
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
