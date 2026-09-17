# Dashboard v2 — manual checklist (testnet, wallet with ≥ 21 streams: the deployer has 65)

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | Open `/dashboard`, connect | stats strip shows sending/receiving counts and token totals; 20 rows; "Load 20 more" | |
| 2 | Role = Sending, Status = streaming, Shape = Recurring | list narrows; URL contains `role=sender&status=streaming&model=Recurring` | |
| 3 | Reload the page | same filters and list | |
| 4 | Search `45` / a `G…` prefix / `hello` | id match / prefix matches / hint, no request | |
| 5 | Sort by End ascending | order flips; URL `sort=end_ts&order=asc` | |
| 6 | Create a stream in another tab, wait ≤ 10 s | "1 new stream — show" banner; click → row at top | |
| 7 | History tab, Only my actions off/on, kinds = Withdrawn | rows with tx links; filters apply | |
| 8 | Open a recurring stream with count ≥ 100 | detail page renders instantly; "and N more unlocks" caption | |
