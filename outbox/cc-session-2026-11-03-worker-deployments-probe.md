# CC session — 2026-11-03 — a probe for a Worker's own deployment history

**State:** the probe works. Run 41599991950 (07:59Z) read 10 deployments and 50 versions of `field-relay-nba` from Cloudflare's own API with the lab's token. The first dispatch (41599815091, 07:58Z) had stopped before any read because the lab has no `CLOUDFLARE_ACCOUNT_ID` secret; the account is now taken from the token when it sees exactly one. A version-detail read (the script's etag) was added after that and ran once (run 41602002778, 08:16Z): the live version `ad8f5cc7` and the version that served 2026-11-01T17:25Z to 2026-11-03T01:03Z, `daf274f8`, report the same etag. See "Script etags" below, including what is not known about the field.

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
| `scripts/probe-worker-deployments.py` | stdlib. Two read-only GETs per script (`/deployments`, `/versions`) on Cloudflare's API with the repository's `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; prints a table of each and the raw answers with author emails removed; the token and account id are never printed. The account id comes from `CLOUDFLARE_ACCOUNT_ID` when set; when unset, from `GET /accounts` if the token sees exactly one account (the output says which), and with none or several the probe stops and says so. Exit 1 if no list answered 200, and then the API's own error code and message are the finding. **Added 2026-11-03, after the first read:** `--version-ids a,b,c` also reads `GET .../versions/<id>` and prints, per id, the script's etag, handlers, compatibility date, and the number of bindings with a sha256 of the canonical list, then says whether the etags are all equal, differ, or could not all be read. No binding value is written anywhere and the raw detail answer is not written |
| `.github/workflows/worker-deployments-probe.yml` | dispatch-only, no schedule; inputs `scripts` (default `field-relay-nba`) and `version_ids` (default empty); commits `outbox/worker-deployments-probe-<UTC>.md` the way the other lab probes do. Writes nothing to Cloudflare, spends no Odds API credits |

## Verified, and what was not

| claim | status | evidence |
|---|---|---|
| the script reads both answer shapes it expects, removes the author email, prints neither the token nor the account id, and exits 1 with the API's own message when every call is refused or the environment is empty | **TRIED** locally with a stand-in for the HTTP call | a throwaway test in the session, not a committed check |
| the account derivation: one account is used and reported as derived; none, two, or a refused `GET /accounts` stops the probe with the reason; a given `CLOUDFLARE_ACCOUNT_ID` is used without calling `/accounts` | **TRIED** locally, five cases, same stand-in | same |
| the first dispatch | **FAILED before any read** | run 41599815091: `FAIL: not set in the environment: CLOUDFLARE_ACCOUNT_ID`; the step's env printed `CLOUDFLARE_API_TOKEN` masked and `CLOUDFLARE_ACCOUNT_ID` empty. No evidence file was written, so the runner committed nothing |
| the workflow is valid | **VERIFIED** | `actionlint` clean, again after the `version_ids` input was added |
| the lab's token can read the relay Worker's deployments and versions | **VERIFIED** | run 41599991950: HTTP 200 for both lists, 10 deployments and 50 versions, evidence `outbox/worker-deployments-probe-20261103T075938Z.md` (runner commit `defc49e`) |
| the answer's JSON has the fields this script looks for | **VERIFIED** | all 62 table rows of that file (2 headers, 10 deployments, 50 versions) have no `?` cell |
| the live version | **VERIFIED** | the newest deployment, 2026-11-03T01:03:04Z, is version `ad8f5cc7-54f6-4c7e-8381-71de0be92967` at 100%; the one before it is the upload version `604f4f8c-6f45-49df-890e-47fefd3299bb`, also at 100%, 5 s earlier |
| every one of the 50 newest versions was made by a `deploy.yml` run | **VERIFIED**, bounded to those 50 | the pairing below |
| the version-detail read: equal etags are reported as the same, differing ones as DIFFER with both values, a missing etag as "not made" with the id, an HTTP refusal with its code and message, no binding value is printed, different bindings give different hashes | **TRIED** locally with a stand-in, 12 checks | a throwaway test in the session, not a committed check |
| the script etags of the versions | **VERIFIED** (the values), **NOT KNOWN** (the field's definition) | run 41602002778, `outbox/worker-deployments-probe-20261103T081607Z.md`: six versions read, all six answered with an etag; see "Script etags" |
| what `resources.script.etag` is | **NOT KNOWN** | two searches of Cloudflare's documentation (2026-11-03) returned nothing that defines the field. The commit subject of `b978f34` says "Cloudflare's own hash"; that was written from recall and is not shown |

## Which deploy run made each version

Method. The 50 versions come in 25 pairs of consecutive numbers created within a few seconds of each other: an upload version (its deployment is annotated `workers/triggered_by: upload`, "Automatic deployment on upload.") and a second version about 5 s later (its deployment is annotated `triggered_by: deployment`). What the second one adds to the first was not read. The runs are the 30 `deploy.yml` runs on the relay from 2026-10-23T20:56Z (`gh api "repos/jeffunglesbee-create/field-relay-nba/actions/workflows/deploy.yml/runs?per_page=100"`, id, head sha, conclusion, created and updated time). A pair belongs to the run whose `[created_at, updated_at]` contains the second version's creation time, with 60 s of slack.

| result | count |
|---|---|
| version pairs | 25 (numbers 1981 to 2030, 2026-10-23T23:06Z to 2026-11-03T01:03Z) |
| pairs inside exactly one run's window | 24 |
| pairs inside two runs' windows | 1 (versions 2021 and 2022, created 2026-10-30T17:17:39Z): runs 41096192055 (17:08:31Z to 17:19:03Z, head `a211e14f`) and 41097629436 (17:18:14Z to 17:28:52Z). Without the slack the time lies only inside the first, which started 43 s before and ended after it, so the pair is the first run's; the next pair (17:27:27Z) is the second run's alone |
| pairs inside no run's window | 0 |
| successful runs in the span with no pair | 0 (the two oldest successful runs, 40029905648 and 40023071623 on 10-23, predate version 1981, which is the oldest the first 50 reach) |
| failed runs in the span | 3: 40605092153 (10-27, 22 s), 40739293078 and 40742899692 (10-28). Each made no version, which fits a failure before the deploy step; the step each failed at was not read here |

The last five deploys, final version of each pair:

| deployed (UTC) | upload version | final version | run | head |
|---|---|---|---|---|
| 2026-11-03T01:03:04Z | `604f4f8c` | `ad8f5cc7` (live, 100%) | 41555964661 | `6b6ff600` |
| 2026-11-01T17:25:37Z | `a60a8277` | `daf274f8` | 41330484626 | `6589bc16` |
| 2026-10-30T21:40:36Z | `67a543f6` | `c91c0747` | 41131995398 | `b6c46113` |
| 2026-10-30T17:27:28Z | `3ef4e3d0` | `42b46f92` | 41097629436 | `95871f13` |
| 2026-10-30T17:17:39Z | `6f417ee9` | `9106aefb` | 41096192055 | `a211e14f` |

Boundary: the API returned the newest 50 versions; versions older than 1981 were not read, so this says nothing about deploys before 2026-10-23. No version in the 50 lacks a `deploy.yml` run in whose window it was created. A manual deploy that happened to land inside a run's window would be attributed to that run by this method; the etag read is the check on what each version contains.

## Script etags (run 41602002778, 2026-11-03T08:16Z; `outbox/worker-deployments-probe-20261103T081607Z.md`)

Six versions read with `--version-ids`: the final and the upload version of the last three deploys.

| deploy (head, run) | version | role | script etag (first 8) | number | created (UTC) |
|---|---|---|---|---|---|
| `6b6ff600`, 41555964661 | `ad8f5cc7` | final, live at 100% | `be651ac1` | 2030 | 2026-11-03T01:03:03Z |
| `6b6ff600`, 41555964661 | `604f4f8c` | upload | `be651ac1` | 2029 | 2026-11-03T01:02:59Z |
| `6589bc16`, 41330484626 | `daf274f8` | final | `be651ac1` | 2028 | 2026-11-01T17:25:36Z |
| `6589bc16`, 41330484626 | `a60a8277` | upload | `19ac8ddc` | 2027 | 2026-11-01T17:25:33Z |
| `b6c46113`, 41131995398 | `c91c0747` | final | `19ac8ddc` | 2026 | 2026-10-30T21:40:35Z |
| `b6c46113`, 41131995398 | `67a543f6` | upload | `52356d93` | 2025 | 2026-10-30T21:40:32Z |

Full etags: `be651ac123a6ed661a8aee6ffb1aa80e8024df10596fb253977e5ea8d16779d0`, `19ac8ddcda02a1a60607b45a0f5647ba3b9f8d86a40a1a6c85f63a7f21b5e3ef`, `52356d9313f295eb934738c76746df1262fbb24c2a551f515cfd1c4db22df2d6`. All six versions report handlers `scheduled, fetch, _fetch, queue`, compatibility date 2026-06-22 and 38 bindings with one hash (`4e3f3cbce931a706`): no binding was added, removed or changed across these three deploys.

What it shows, and what it does not:

1. **The live version and the version that served 2026-11-01T17:25Z to 2026-11-03T01:03Z report the same etag** (`ad8f5cc7` and `daf274f8`: `be651ac1`). The source difference between their two commits is two comment lines in `src/index.js` (esbuild's minified output of both is byte-identical, 476,263 bytes), and both deploys printed `wrangler 3.90.0` and `Total Upload: 2258.19 KiB / gzip: 509.81 KiB`. Four independent readings agree that the script did not change.
2. **The earlier deploy that did change code reports a different etag** (`c91c0747`, `b6c46113`: `19ac8ddc`). So the field moved when the code moved and held when only comments did, on this data.
3. **Not known: what the field is.** The documentation was searched twice and does not define it. The pattern above is what a hash of the script would do, and it is the only reading offered; it is not shown.
4. **An observation with no mechanism read.** The upload version and the final version of one deploy report different etags in two of the three deploys (`a60a8277` against `daf274f8`; `67a543f6` against `c91c0747`) and the same etag in the third (`604f4f8c`, `ad8f5cc7`). Each upload version's etag equals the previous deploy's final version's etag (`a60a8277` = `c91c0747` = `19ac8ddc`; `604f4f8c` = `daf274f8` = `be651ac1`). That fits an upload version that is created before the new script replaces the old one, but it was not read from Cloudflare, so the comparison in 1 and 2 uses final versions only.
5. **Boundary:** six versions of 50. The etag of the other 44 was not read, and nothing here says which of the 44 changed code.
