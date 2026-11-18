# Session 2026-11-18 — the runner's address to Open-Meteo, and TLS to it, sampled every minute beside real requests

Session: https://claude.ai/code/session_01CggeNbCfJwZGqP88Ttq7r2
Task: the owner's "Run the DNS test" (2026-11-18), after a Rule 42 analysis of the live-weather reds on runners
(seven attempts since 2026-08-15, each fixing or describing one symptom).

## Read first, so nothing is built twice (BUILD-ON-A)

The test proposed in the Rule 42 analysis (resolve the host, then a TCP connect and a TLS handshake to each
address) already exists and has been read in one real red: `scripts/egress-path-lib.mjs`
(`describeEgressFacts`, from `docs/CC-CMD-2026-11-14-weather-failure-tls-stage.md`) and
`outbox/tls-first-red-2026-11-16.md`. In `live-check` 43862583632 (westus2) the system resolver gave WEST
`51.81.167.44`, which completed TCP in 11 ms and no TLS handshake in 3000 ms, while EAST `167.114.211.86`
completed one in 135 ms; DNS answers by the asker's subnet, not by rotation. One red, "a fit, not a test".

What nothing records is the same facts OVER TIME, beside request outcomes. The pair probe's run 2 (2026-11-14,
westus2) got 1,273 answers and lost requests in waves (0, 4, about 28 of 56 per round), which a WEST address that
never completes TLS cannot produce on its own. So the open question is: on one runner, does the system's address
change between minutes, and do the rounds whose address stalls at TLS carry the unanswered requests?

## What was built

`scripts/probe-rain-precip-pair.mjs`, no new script: at the start of each round it calls `describeEgressFacts`
for `api.open-meteo.com` (bounded at 8 s by the library), writes the line to the `.jsonl` as an `egress` record,
and the summary gains a per-round table (system address, TLS to it, unanswered of requests) and the unanswered
requests grouped by that round's TLS state (`ok`, `stall`, `other`, `unread`). `egressSummary` parses only the
`dns-v4=` and `tls=` fields of the line; an unreadable field is null, never guessed.

## Checks, run here

- Self-test 37/37. X1 parses the verbatim `egress-path:` line of `live-check` 43862583632 (job 133282924627, read
  from its job log 2026-11-18) and reads WEST as the system address and a stall; X2 the same line with EAST as the
  system address reads ok; X3 an unreadable line is null; X4 grouping by round; O6 the printed table.
- The parser was also run on a line the library produced here (no DNS in the sandbox): all null, as it should be.
- Mutations 21 of 21, each caught by its named check (4 new: the system address read from the wrong source, a stall
  not told from an answer, failures not grouped by round, the table not printed). `check:mutate-copy --only
  probe-rain-precip-pair` 9/9; `check:import-purity` 3/3.

## What one run can and cannot say

It runs on whatever runner GitHub assigns, so the region is not chosen; the job log's `Region:` line is read after.
It is Node's view, at the start of each round, not Chromium's. Rounds whose address stalls and rounds whose address
answers, with their unanswered counts side by side, is the result; a cause is not claimed from one runner.

## The run (2026-11-18 05:00Z to 05:31Z, westus2)

Probe run 44241127086 on main `dffa3b98` (landed after verify-full 44233265188, 530/530). The system resolver gave WEST
`51.81.167.44` in all 30 rounds. In rounds 0 and 1 TLS to WEST stalled (`no-tls-in-3000ms`, TCP 10 to 11 ms) while EAST
`167.114.211.86` completed a handshake in about 134 ms from the same runner and egress address (`4.155.149.103`); from
round 2 (05:04:18Z) WEST handshook in about 13 ms. Unanswered requests: 75 of 110 in the two stalled rounds, 0 of 1,540
in the other 28, all `UND_ERR_CONNECT_TIMEOUT`. Recorded as an Observed section of
`docs/CC-CMD-2026-11-14-weather-failure-tls-stage.md`, with what one runner cannot show.
