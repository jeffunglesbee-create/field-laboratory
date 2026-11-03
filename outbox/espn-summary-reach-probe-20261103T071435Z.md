# ESPN summary reach probe, 20261103T071435Z

- Run: https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/41595006871
- Runner image: ubuntu26 20261026.180.1
- Relay: https://field-relay-nba.jeffunglesbee.workers.dev
- Events (first = the refused one): 401884754, 401884748, 401884747
- 6 rounds, 1.5 s between requests, 07:14:35 to 07:15:54 UTC
- `nonce` = the same URL plus `&_=<random>`: a new cache key, so a live read. `plain` = the URL as the backfill sends it.

## Summary

| what | variant | statuses | data centres, by status | X-RELAY-Error, by status |
|---|---|---|---|---|
| event 401884754 | nonce | 200 x6 | 200: IAD | 200: - |
| event 401884754 | plain | 200 x6 | 200: IAD | 200: - |
| event 401884748 | nonce | 200 x6 | 200: IAD | 200: - |
| event 401884748 | plain | 200 x6 | 200: IAD | 200: - |
| event 401884747 | nonce | 200 x6 | 200: IAD | 200: - |
| event 401884747 | plain | 200 x6 | 200: IAD | 200: - |
| control: no such event | nonce | 404 x6 | 404: IAD | 404: espn-summary-404 |
| control: /v2/games | nonce | 200 x6 | 200: IAD | 200: - |

## Every response

| round | time (UTC) | what | variant | status | bytes | data centre | cf-cache-status | age | X-RELAY-Error | body start (non-200) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 07:14:35 | event 401884754 | nonce | 200 | 427600 | IAD | - | - | - | - |
| 1 | 07:14:37 | event 401884754 | plain | 200 | 427600 | IAD | - | - | - | - |
| 1 | 07:14:39 | event 401884748 | nonce | 200 | 413799 | IAD | - | - | - | - |
| 1 | 07:14:41 | event 401884748 | plain | 200 | 413799 | IAD | - | - | - | - |
| 1 | 07:14:42 | event 401884747 | nonce | 200 | 410172 | IAD | - | - | - | - |
| 1 | 07:14:44 | event 401884747 | plain | 200 | 410172 | IAD | - | - | - | - |
| 1 | 07:14:46 | control: no such event | nonce | 404 | 25 | IAD | - | - | espn-summary-404 | espn-summary returned 404 |
| 1 | 07:14:47 | control: /v2/games | nonce | 200 | 94 | IAD | - | - | - | - |
| 2 | 07:14:49 | event 401884754 | nonce | 200 | 427600 | IAD | - | - | - | - |
| 2 | 07:14:51 | event 401884754 | plain | 200 | 427600 | IAD | HIT | 13 | - | - |
| 2 | 07:14:52 | event 401884748 | nonce | 200 | 413799 | IAD | - | - | - | - |
| 2 | 07:14:54 | event 401884748 | plain | 200 | 413799 | IAD | HIT | 13 | - | - |
| 2 | 07:14:56 | event 401884747 | nonce | 200 | 410172 | IAD | - | - | - | - |
| 2 | 07:14:57 | event 401884747 | plain | 200 | 410172 | IAD | HIT | 13 | - | - |
| 2 | 07:14:59 | control: no such event | nonce | 404 | 25 | IAD | - | - | espn-summary-404 | espn-summary returned 404 |
| 2 | 07:15:01 | control: /v2/games | nonce | 200 | 94 | IAD | - | - | - | - |
| 3 | 07:15:02 | event 401884754 | nonce | 200 | 427600 | IAD | - | - | - | - |
| 3 | 07:15:04 | event 401884754 | plain | 200 | 427600 | IAD | - | - | - | - |
| 3 | 07:15:06 | event 401884748 | nonce | 200 | 413799 | IAD | - | - | - | - |
| 3 | 07:15:07 | event 401884748 | plain | 200 | 413799 | IAD | - | - | - | - |
| 3 | 07:15:09 | event 401884747 | nonce | 200 | 410172 | IAD | - | - | - | - |
| 3 | 07:15:10 | event 401884747 | plain | 200 | 410172 | IAD | - | - | - | - |
| 3 | 07:15:12 | control: no such event | nonce | 404 | 25 | IAD | - | - | espn-summary-404 | espn-summary returned 404 |
| 3 | 07:15:14 | control: /v2/games | nonce | 200 | 94 | IAD | - | - | - | - |
| 4 | 07:15:15 | event 401884754 | nonce | 200 | 427600 | IAD | - | - | - | - |
| 4 | 07:15:17 | event 401884754 | plain | 200 | 427600 | IAD | HIT | 12 | - | - |
| 4 | 07:15:19 | event 401884748 | nonce | 200 | 413799 | IAD | - | - | - | - |
| 4 | 07:15:20 | event 401884748 | plain | 200 | 413799 | IAD | HIT | 12 | - | - |
| 4 | 07:15:22 | event 401884747 | nonce | 200 | 410172 | IAD | - | - | - | - |
| 4 | 07:15:23 | event 401884747 | plain | 200 | 410172 | IAD | HIT | 12 | - | - |
| 4 | 07:15:25 | control: no such event | nonce | 404 | 25 | IAD | - | - | espn-summary-404 | espn-summary returned 404 |
| 4 | 07:15:27 | control: /v2/games | nonce | 200 | 94 | IAD | - | - | - | - |
| 5 | 07:15:28 | event 401884754 | nonce | 200 | 427600 | IAD | - | - | - | - |
| 5 | 07:15:30 | event 401884754 | plain | 200 | 427600 | IAD | - | - | - | - |
| 5 | 07:15:31 | event 401884748 | nonce | 200 | 413799 | IAD | - | - | - | - |
| 5 | 07:15:33 | event 401884748 | plain | 200 | 413799 | IAD | - | - | - | - |
| 5 | 07:15:35 | event 401884747 | nonce | 200 | 410172 | IAD | - | - | - | - |
| 5 | 07:15:36 | event 401884747 | plain | 200 | 410172 | IAD | - | - | - | - |
| 5 | 07:15:38 | control: no such event | nonce | 404 | 25 | IAD | - | - | espn-summary-404 | espn-summary returned 404 |
| 5 | 07:15:39 | control: /v2/games | nonce | 200 | 94 | IAD | - | - | - | - |
| 6 | 07:15:41 | event 401884754 | nonce | 200 | 427600 | IAD | - | - | - | - |
| 6 | 07:15:43 | event 401884754 | plain | 200 | 427600 | IAD | HIT | 12 | - | - |
| 6 | 07:15:44 | event 401884748 | nonce | 200 | 413799 | IAD | - | - | - | - |
| 6 | 07:15:46 | event 401884748 | plain | 200 | 413799 | IAD | HIT | 12 | - | - |
| 6 | 07:15:47 | event 401884747 | nonce | 200 | 410172 | IAD | - | - | - | - |
| 6 | 07:15:49 | event 401884747 | plain | 200 | 410172 | IAD | HIT | 12 | - | - |
| 6 | 07:15:51 | control: no such event | nonce | 404 | 25 | IAD | - | - | espn-summary-404 | espn-summary returned 404 |
| 6 | 07:15:52 | control: /v2/games | nonce | 200 | 94 | IAD | - | - | - | - |
