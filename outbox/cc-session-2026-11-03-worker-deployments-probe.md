# CC session — 2026-11-03 — a probe for a Worker's own deployment history

**State:** the first dispatch (run 41599815091, 07:58Z) stopped before any read: the lab repository has `CLOUDFLARE_API_TOKEN` and no `CLOUDFLARE_ACCOUNT_ID`. The script now takes the account from the token when the token sees exactly one. Re-dispatch result: the last row of the table below.

## Why

The owner's 2026-11-02 could-not-verify list ended with "Worker version ids other than the last deploy". Every version id the relay's records quote comes from a `Current Version ID:` line that `wrangler deploy` prints into a deploy workflow's log. That is a copy of Cloudflare's record, made at deploy time. It cannot show a deploy made from anywhere else (a laptop, the dashboard, a rollback).

What a session can read, measured 2026-11-03 07:5xZ:

| source | what it gives |
|---|---|
| the Cloudflare tool (`workers_get_worker`, script `field-relay-nba`) | the script's name and id only |
| `session_health` | `relay_deployed` `6b6ff60`, `deploy_match` true, `deployed_at` `2026-11-03T01:04:21Z`: the newest successful `deploy.yml` run's head sha against the relay head, a GitHub-side comparison |
| the relay itself | no version header; `/health` answers 200 with none; `/version` answers 403 (the route gate, not a version route); `wrangler.toml` has no version-metadata binding |
| the deploy logs | the version id of each deploy that went through `deploy.yml` |

## What was built (LAB-FIRST-A: a new probe lands here)

| file | what it is |
|---|---|
| `scripts/probe-worker-deployments.py` | stdlib. Two read-only GETs per script (`/deployments`, `/versions`) on Cloudflare's API with the repository's `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; prints a table of each and the raw answers with author emails removed; the token and account id are never printed. The account id comes from `CLOUDFLARE_ACCOUNT_ID` when set; when unset, from `GET /accounts` if the token sees exactly one account (the output says which), and with none or several the probe stops and says so. Exit 1 if no list answered 200, and then the API's own error code and message are the finding |
| `.github/workflows/worker-deployments-probe.yml` | dispatch-only, no schedule; input `scripts` (default `field-relay-nba`); commits `outbox/worker-deployments-probe-<UTC>.md` the way the other lab probes do. Writes nothing to Cloudflare, spends no Odds API credits |

## Verified, and what was not

| claim | status | evidence |
|---|---|---|
| the script reads both answer shapes it expects, removes the author email, prints neither the token nor the account id, and exits 1 with the API's own message when every call is refused or the environment is empty | **TRIED** locally with a stand-in for the HTTP call | a throwaway test in the session, not a committed check |
| the account derivation: one account is used and reported as derived; none, two, or a refused `GET /accounts` stops the probe with the reason; a given `CLOUDFLARE_ACCOUNT_ID` is used without calling `/accounts` | **TRIED** locally, five cases, same stand-in | same |
| the first dispatch | **FAILED before any read** | run 41599815091: `FAIL: not set in the environment: CLOUDFLARE_ACCOUNT_ID`; the step's env printed `CLOUDFLARE_API_TOKEN` masked and `CLOUDFLARE_ACCOUNT_ID` empty. No evidence file was written, so the runner committed nothing |
| the workflow is valid | **VERIFIED** | `actionlint` clean |
| the lab's token can read the relay Worker's deployments | **NOT YET KNOWN** | the first dispatch decides; a refusal is recorded with its status and error code |
| the answer's JSON has the fields this script looks for | **NOT YET KNOWN** | the raw answer is written into the evidence file for exactly this reason |
