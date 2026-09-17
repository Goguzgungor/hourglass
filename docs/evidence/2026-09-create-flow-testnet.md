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

Run on 2026-09-17 against production (https://hourglassprotocol.org, main at `dde7d28`, lockup v0.2.1) with the maintainer's Freighter testnet wallet `GDAS7NL4HHEUTOBQ3TYXN6DXJP6HDBUB4DMC7ZXXE27EI3IBTDBNESIG`; the browser was driven by Claude in Chrome, every signature was approved by the maintainer in Freighter. No screenshots were captured (the `img/` names below are reserved for a later manual pass). Explorer: `https://stellar.expert/explorer/testnet/tx/<hash>`.

| # | Scenario | Steps | Expected | Screenshot | Result |
|---|---|---|---|---|---|
| 1 | Single linear from preset | Template "1 year · 3-month cliff", XLM, recipient, 10 XLM, Sign | redirected to `/stream/<id>`, cliff shown | `01-linear.png` | ✅ id **#67** (Linear 10 XLM → `GDVW…L4E5`, cliff 2026-12-16), tx `4858ccd64148a56c0d0d4fb98220f88d2b091dbb2ea07e95bbb0c7dad8ac34ef` |
| 2 | Single tranched | Template "Quarterly tranches × 4", 4 XLM | 4 tranches of 1 XLM on the stream page | `02-tranched.png` | ✅ id **#68** (Tranched 4 XLM → `GCWO…OZAF`, 4 × 1 XLM at +90/180/270/360 d, ends 2027-09-12), tx `f66d08498953e5e6c650a7c1b8ab7507b666bb5650800e7ae0c9d35634b27cf3` |
| 3 | Single recurring | Template "Daily drip × 30", 3 XLM | recurring, 0.1 XLM × 30 | `03-recurring.png` | ✅ id **#69** (Recurring 3 XLM → `GDVW…L4E5`, 30 × 0.1 XLM every 86400 s), tx `8dcc3bc83b814fd30bb09b927621d6fb407a9d38eb4cb271cb83bf77222fc246` |
| 4 | Batch 45 rows, CSV paste | Batch mode, paste 45 `G…,0.1` lines incl. 1 duplicate + 1 bad address; fix the bad row inline; Create | confirm dialog says 3 transactions; progress shows 20/20/5; result lists 45 ids | `04-batch.png` | ✅ row 45 `GNOTAVALIDADDRESS` flagged "Not a valid G… Stellar address." (errors 1, button "Create 44 streams in 3 transactions"); fixed inline → errors 0, warnings 2 (rows 1/44 "appears more than once"); dialog "Create 45 streams? … 4.5 XLM … 3 transactions"; ids **#70–#114**. tx1 `3aacd8ce6f0a09c2cee41619d6fcf8f7c912ae6a1977889baa915b757b4dc768` (#70–89), tx2 `64e42c6d90da67c4a6e540fa492cd03007dbd457bc59d18c02bca38f77a0d89d` (#90–109), tx3 `047ba6c906bb5cf3d935adca42e09face927225dba295b56b4a05cad241617b3` (#110–114) |
| 5 | Reject + reload + resume | Start a 2-transaction batch, reject the 2nd signature, reload the page, Resume, sign | banner "1 of 2 transactions left"; after resume both done, no duplicates on the dashboard | `05-resume.png` | ✅ (interrupted with **Pause after this transaction** instead of a Freighter reject — the maintainer approved every prompt, see note below). 25 rows → 2 tx; after tx1 landed the run was paused, the page reloaded: banner "A batch from 10:36 AM (25 rows from GDAS…ESIG) is unfinished — 1 of 2 transactions left (20 streams created so far)." → Resume → Continue → sign. ids **#165–#189**, no duplicates (dashboard sender count matches). tx1 `3fd2a9c5184c198a202c1a03f7fb30c825c52df0e17582d96fdd034a039d5b82` (#165–184), tx2 `71a714138e76589b968b32b12724ac2ed86294189acf34e321223440468a10fb` (#185–189). Two earlier attempts where both prompts were approved produced #115–#139 (`72f01075fe3726af7f5c0992616775031d9a901b7dbaa9522633df226b87d159`, `d4b8f7ee469f3ff0c68d180c3d1db311e4248c15caebd4d58298dd41368e6501`) and #140–#164 (`c31718a2c62e05e04280ad760f88a905494a5a5f9050b2722dcdd42d5013ee62`, `c975f323d14c1ac7aaca32031a77717b631dbe9ea1970160e1559caae186b207`). |
| 6 | Dashboard / API | `/dashboard` and `GET /api/streams?address=<sender>&role=sender` | all created streams visible | `06-dashboard.png` | ✅ count **124** sender streams after scenario 5 (1 pre-existing #66 + #67–#69 + 120 batch rows), `/api/stats` sending=124, receiving=1, `sent_deposited` 38.0 XLM; 125 after the extra recurring #190 created for the dashboard checklist |

### Notes from the run

- The Freighter reject path of scenario 5 was **not** exercised: the maintainer approved every prompt. Resume was exercised through **Pause after this transaction → reload → Resume → Continue**, which covers the persisted-run / banner / continue path but not the `chunk_failed` (user-rejected) branch. Worth a second pass with an explicit reject.
- After a finished batch, **Create another** keeps the previous rows in the table (rows are not cleared). Convenient for re-runs but a footgun: a second click on Create re-creates the same streams. Consider clearing rows (or at least the result) on "Create another".
- After **Resume**, the right-hand preview panel says "Fill the form to render the schedule" (only the run is restored, not the form). Cosmetic.
- Single-recipient defaults start at now + 25 min; recurring templates put the first unlock at now + 15 min. Both landed fine.
- The footer still reads `V0.1.0-MVP`.

