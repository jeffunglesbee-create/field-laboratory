# CC session — 2026-11-03 — a probe for a Worker's own deployment history

**State:** written and tried against a stand-in; not yet dispatched. The first real read is the next row of this file.

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
| `scripts/probe-worker-deployments.py` | stdlib. Two read-only GETs per script (`/deployments`, `/versions`) on Cloudflare's API with the repository's `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; prints a table of each and the raw answers with author emails removed; the token and account id are never printed. Exit 1 if no list answered 200, and then the API's own error code and message are the finding |
| `.github/workflows/worker-deployments-probe.yml` | dispatch-only, no schedule; input `scripts` (default `field-relay-nba`); commits `outbox/worker-deployments-probe-<UTC>.md` the way the other lab probes do. Writes nothing to Cloudflare, spends no Odds API credits |

## Verified, and what was not

| claim | status | evidence |
|---|---|---|
| the script reads both answer shapes it expects, removes the author email, prints neither the token nor the account id, and exits 1 with the API's own message when every call is refused or the environment is empty | **TRIED** locally with a stand-in for the HTTP call | a throwaway test in the session, not a committed check |
| the workflow is valid | **VERIFIED** | `actionlint` clean |
| the lab's token can read the relay Worker's deployments | **NOT YET KNOWN** | the first dispatch decides; a refusal is recorded with its status and error code |
| the answer's JSON has the fields this script looks for | **NOT YET KNOWN** | the raw answer is written into the evidence file for exactly this reason |
