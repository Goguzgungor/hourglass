# Create flow v2 — testnet evidence

Lockup: `CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL` (v0.2.1, testnet). Branch `feat/create-flow-v2`.

## Automated (simulation only, no signing)

`npx tsx scripts/capture-create-errors.ts` on 2026-09-16:

```
start_in_past (#18): "Transaction simulation failed: \"HostError: Error(Contract, #18)\n\nEvent log (newest first):\n   0: [Diagnostic Event] contract:CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, topics:[error, Error(Contract, #18)], data:\"escalating error to VM trap from failed host function call: fail_with_error\"\n   1: [Diagnostic Event] contract:CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, topics:[error, Error(Contract, #18)], data:[\"failing with contract error\", 18]\n   2: [Diagnostic Event] topics:[fn_call, CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, create_linear], data:[GBX"
batch 100 rows: "Transaction simulation failed: \"HostError: Error(Budget, ExceededLimit)\nDebugInfo not available\n\""
```

Both strings are pinned in `frontend/src/lib/create/errors.test.ts`.

Final fix wave, 2026-09-16 (same method — simulation only — `create_linear` with a 900,000,000 XLM deposit so the token transfer fails; native SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`):

```
sac BalanceError (#10): "Transaction simulation failed: \"HostError: Error(Contract, #10)\n\nEvent log (newest first):\n   0: [Diagnostic Event] contract:CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, topics:[error, Error(Contract, #10)], data:\"escalating error to VM trap from failed host function call: call\"\n   1: [Diagnostic Event] contract:CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, topics:[error, Error(Contract, #10)], data:[\"contract call failed\", transfer, [GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2, CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, 9000000000000000]]\n   2: [Failed Diagnostic Event (not emitted)] contract:CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, topics:[error, Error(Contract, #10)], data:[\"resulting balance is not within the allowed range\", 20000000, -8999912569521706, 9223372036854775807]\n   3: [Diagnostic Event] contract:CB25NO7BEWVLTAUBAMPMUDIO6VGLBGZHN6TG4TKFNM3U5M5YEXVWEWNL, topics:[fn_call, CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, transfer], data:[…]"
```

The lockup's own "escalating error" / "contract call failed" events carry the token's code and come *before* the token's event, so `classifyTxError` treats any error event from a contract other than the lockup as the origin (`TokenContractError`, SAC table) instead of stopping at the first one. Pinned verbatim in `errors.test.ts`.

## Unit tests

`npm test` on 2026-09-16: 21 test files, 204 tests, all passing. `npm run typecheck` clean. `npm run build` OK.

## Manual walkthrough (requires a Freighter wallet on testnet)

To be run by the maintainer; add screenshots under `docs/evidence/img/` named as below and fill in the ids/hashes.

| # | Scenario | Steps | Expected | Screenshot | Result |
|---|---|---|---|---|---|
| 1 | Single linear from preset | Template "1 year · 3-month cliff", XLM, recipient, 10 XLM, Sign | redirected to `/stream/<id>`, cliff shown | `01-linear.png` | id: |
| 2 | Single tranched | Template "Quarterly tranches × 4", 4 XLM | 4 tranches of 1 XLM on the stream page | `02-tranched.png` | id: |
| 3 | Single recurring | Template "Daily drip × 30", 3 XLM | recurring, 0.1 XLM × 30 | `03-recurring.png` | id: |
| 4 | Batch 45 rows, CSV paste | Batch mode, paste 45 `G…,0.1` lines incl. 1 duplicate + 1 bad address; fix the bad row inline; Create | confirm dialog says 3 transactions; progress shows 20/20/5; result lists 45 ids | `04-batch.png` | tx hashes: |
| 5 | Reject + reload + resume | Start a 2-transaction batch, reject the 2nd signature, reload the page, Resume, sign | banner "1 of 2 transactions left"; after resume both done, no duplicates on the dashboard | `05-resume.png` | tx hashes: |
| 6 | Dashboard / API | `/dashboard` and `GET /api/streams?address=<sender>&role=sender` | all created streams visible | `06-dashboard.png` | count: |
