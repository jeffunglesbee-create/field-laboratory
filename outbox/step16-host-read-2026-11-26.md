# Step 16 host read, 2026-11-26

Source: docs/CC-CMD-2026-11-24-step16-names-the-request.md (source commit 77647dc1, runner proof run 45473584970). Read 2026-11-26 ~18:05Z over the 18 live-check runs created after 2026-11-24T19:45Z (REST: actions/workflows/live-check.yml/runs, then runs/<id>/jobs).

## Answer
No 429 from any real host (field-relay-nba.jeffunglesbee.workers.dev, statsapi.mlb.com, api.open-meteo.com) has been observed. Step 16 ("The pitcher and records rows appear on the deployed page") has not gone red. The question stays open until it does.

## Finding 1 (stub check): none
"Step 16 names the request behind a page error" is success in all 12 runs where it ran. Failure runs 45473584970, 45478165204, 45506624814, 45553852918, 45623828184, 45663912109 failed at "The deploy landed" (step 16 skipped); the stub check still passed in them.

## Runs that reached step 16 (6 of 18)
Each: "The deploy landed" success, "pitcher and records" success, "names the request" success.
| run | created (UTC) | job | page errors on deployed page | hosts |
|---|---|---|---|---|
| 45687136072 | 11-25 19:38 | 139462592087 | none (PASS no page errors on the deployed artifact) | none |
| 45678278061 | 11-25 18:44 | 139431622682 | none | none |
| 45738369819 | 11-26 01:49 | 139637026574 | none | none |
| 45741973261 | 11-26 02:22 | 139648909537 | none | none |
| 45806654980 | 11-26 11:01 | 139863573122 | none | none |
| 45825761681 | 11-26 13:05 | 139929360312 | none | none |

Each log holds 2 "Failed to load resource ... 429" lines, both http://127.0.0.1:<port>/stub-429?venue=a|b: the stub check's own synthetic 429s, which prove the URL is printed (the lines carry a URL after the dash). No net::ERR_* lines. Host counts for the three real hosts: 0 each, in every run.

## Not reached
45473584970, 45478165204, 45506624814, 45553852918, 45623828184, 45663912109: failure at "The deploy landed"; pitcher step skipped. Skipped runs (no jobs): 45474635142, 45479614322, 45536290157, 45640344713, 45673952956, 45866591104.

Deploys landed from 2026-11-25 ~18:44Z on; the 11-24 blocker (verify red) cleared.
