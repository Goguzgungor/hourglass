# Hourglass — Frontend

Next.js 16 + TypeScript + Tailwind v4 + Turbopack. Consumes the local
`hourglass` SDK (installed as `file:../sdk`).

## Run

```bash
cd frontend
npm install
npm run dev
```

Opens at http://localhost:3000.

## End-to-end with the local contracts

```bash
../scripts/quickstart-up.sh
../scripts/deploy-local.sh
```

The frontend reads `../deployments/local.json` for contract IDs (consumed in
Stage 2 — the landing page in this Stage 1 build is purely presentational).

## Stack

- **Next.js 16** (App Router, Turbopack)
- **Tailwind v4** via `@tailwindcss/postcss`, tokens declared in
  `src/app/globals.css` under `@theme inline { ... }`
- **Fonts:** Fraunces (display, variable, with `opsz` + `SOFT` axes), Geist
  Sans (body), Geist Mono (numerals & addresses) — all via `next/font/google`
- **Stellar SDK** `@stellar/stellar-sdk@^13`
- **Wallets:** `@creit.tech/stellar-wallets-kit` (wired up in Stage 2)
- **Animation:** `motion` (used sparingly)
- **Local SDK:** `hourglass` from `../sdk` (typed Soroban bindings)

## Layout

```
src/
  app/
    layout.tsx      # root layout, font wiring, header (wordmark + connect), footer
    page.tsx        # landing page — three editorial stanzas
    globals.css     # design tokens + Tailwind theme + film-grain overlay + keyframes
  components/
    HourglassIcon.tsx   # animated SVG hourglass, fill prop 0..1
    Constellation.tsx   # faint Orion-belt accent for the hero corner
    Wordmark.tsx        # small hourglass + "Hourglass" italic wordmark
    WalletButton.tsx    # stub button for Stage 1; wires in Stage 2
```

## Design system

The Celestial Almanac palette. Treat sand as a brass accent — use it
sparingly. Cream is the primary text; never pure white. Strokes are deep
cosmic navy. Sharp corners only — `rounded-none` or `rounded-sm` at most.

| Token            | Hex       | Purpose                          |
| ---------------- | --------- | -------------------------------- |
| `--night`        | `#0a0e1a` | page background                  |
| `--midnight`     | `#101729` | card surfaces                    |
| `--stroke`       | `#2a3552` | hairline borders                 |
| `--sand`         | `#e8b76b` | primary accent                   |
| `--cream`        | `#f5ebd9` | primary text                     |
| `--cream-muted`  | `#b9b2a3` | secondary text                   |
| `--cream-dim`    | `#8a92aa` | tertiary labels                  |

These are wired into Tailwind as `bg-night`, `text-cream`, `border-stroke`, etc.

## Stage roadmap

- **Stage 1** (this build): scaffold, design system, landing page.
- **Stage 2**: wallet kit wiring, `/create` flow, `/stream/[id]` page,
  contract reads/writes via the SDK.
- **Stage 3**: Mongo-backed indexer + `/dashboard` for connected wallet.

## Indexer (Mongo)

The indexer is a long-running Node script that ingests Soroban events from
the lockup contract into MongoDB. The `/dashboard` page and the
`/api/streams*` + `/api/stats` routes read from this index, NOT the chain
directly — so the dashboard renders instantly and survives transient RPC
hiccups.

Uses the existing local Mongo container (`id-mongodb-1` at
`localhost:27017`) by default. Override with `MONGODB_URL` / `MONGODB_DB`
env vars.

```bash
# 1. Make sure quickstart + contracts are up
../scripts/quickstart-up.sh
../scripts/deploy-local.sh

# 2. Make sure Mongo is running (it usually is)
docker ps | grep mongo

# 3. Run the indexer in one terminal
cd frontend
npm run indexer

# 4. Run the frontend in another terminal
npm run dev
```

Visit http://localhost:3000/dashboard — once you create a stream via
`/create`, the indexer will pick it up within a few seconds and the dashboard
will populate.

### Collections

- `streams` — one document per stream id, refreshed from the contract on
  every event so deposited / withdrawn / refunded are always current.
- `actions` — append-only audit log; idempotent via a unique compound index
  on `(tx_hash, log_index)`.
- `meta` — single-doc scratch space; holds the next ledger to fetch so the
  indexer can resume cleanly after a restart.
