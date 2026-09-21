# The first live coverage reading, and the two defects it found in my own census

**Date:** 2026-09-21
**Run:** drift-sentinel 35551910512, dispatched at 01:45 UTC against the
2026-09-20 ET slate (21:45 ET — inside the ET/UTC disagreement window the 01:30
cron exists to probe, and which GitHub's ~5-hour scheduling delay has been
moving it out of).

## The reading

```
coverage: Bundesliga=0/3 EPL=3/4(draw 3) La Liga=4/5(draw 4) Ligue 1=3/3(draw 3)
          MLB=15/15 MLS=2/11(draw 2) NFL=0/14 NHL=0/7 Serie A=3/5(draw 3)
          WNBA=6/6 golf=0/2
```

75 games. NFL at 0 of 14 and NHL at 0 of 7 are the notable absences; neither has
ever carried odds in the committed history, so neither alarms — a coverage
decision, not a regression.

**MLS is 2 of 11.** Against 26/28 (93%) on 2026-08-29 and 18/21 (86%) on
2026-09-05.

## Defect 1 — the alarm printed PASS over exactly the case it was built for

The CC-CMD that motivated this work describes the failure as *"MLS went from
two-way prices to 0 of 17 rows and nothing here noticed."* `transitions()`
fired only when `withOdds === 0`. MLS carried two.

```
PASS  no sport lost odds coverage it previously had
```

Missing the case by two games is missing it. A supply collapse does not arrive
as a clean zero.

**The rule now:** a sport that was COVERED (majority of rows priced) and now
carries less than a third of that rate. MLS 86% → 18% fires; a decline to 60%
does not, because a slate with fewer priced games is not a supply failure and a
red nobody can clear is a red everybody learns to skip.

```
ODDS COLLAPSED  MLS: 18/21 (86%) on 2026-09-05, now 2/11 (18%)
```

Both rates are in the line. A bare "MLS lost odds" is not a finding.

`WAS_COVERED = 0.5` and `COLLAPSED_TO = 0.31` are the only judgement in the
file, and they are set from this measurement rather than from taste. 0.31 and
not a round third so that an exact one-third reading — a real number a small
slate produces — reads as a fall, not a fire.

### One assertion I wrote was wrong, and the code was right

The first version of the new test expected the alarm to quote 26/28 from
08-29. It quotes 18/21 from 09-05 — the **most recent** covered reading, which
is correct: comparing against the oldest would overstate every drop by whatever
ordinary decline happened in between, and send a reader chasing a supply
failure that was partly seasonal. The assertion changed, not the rule. `O9`
mutates the comparison to take the oldest and is caught.

## Defect 2 — my census broke the sentinel's push, and the reading was lost

Step 13, "Append to the drift log":

```
[main b952dca] drift-sentinel: favourite-mismatch on 2026-09-20 [skip ci]
 2 files changed, 133 insertions(+)
error: cannot pull with rebase: You have unstaged changes.
error: Please commit or stash them.
##[error]Process completed with exit code 128.
```

A `--url` run rewrites `outbox/odds-coverage-series.json`. The step stages
`outbox/drift-log.md` and `outbox/sport-vocabulary-*.json` and nothing else, so
the series sat modified-and-unstaged and `git pull --rebase` refused. The commit
was made on the runner and thrown away with it.

**The drift log on `origin` still ends at 2026-09-20 15:52.** The first live
coverage reading was computed, printed, and lost — on the step whose entire job
is to persist it, by a file the census added three commits earlier.

Fixed by staging the series, guarded the same way the vocabulary artifact is, so
an unmatched path under `bash -e` cannot abort the step before the push.

## What else the run established

| finding | detail |
|---|---|
| step 8 green | the skill reinstall holds — `byte-identical to source (7207 bytes)` |
| step 12 green, **first run in three days** | `relay vocabulary: 28 label(s) … MISSING 0` — registry covers it |
| `closing_odds` **15 of 15 sequenced** | every game with both prices showed a real open/close sequence; the blanket claim is closed |
| the sentinel's own non-zero exit | `FAIL moneyline and handicap agree on the favourite — 1 of 20 comparable: MLB_2026-09-20_e401817019: ML -123/102 H 1.5/-1.5`. Pre-existing check, a finding about the data, unrelated to this change |
| venue coverage | 15 MLB venues, 0 unresolved |

## Verification

| check | result |
|---|---|
| `odds-coverage.mjs --self-test` | **19/19** (was 14) |
| `mutate-odds-coverage.mjs` | **9 of 9 caught** (was 7) |
| the live census replayed against the committed history | `MLS: 18/21 (86%) on 2026-09-05, now 2/11 (18%)` |
| `drift-check --file context-2026-05-15` | 13/13, exit 0 |
| `drift-check --file games-2026-08-09` | 13/13, exit 0 |
| `drift-check --file context-2026-09-05` | 12/13, exit 1 — La Liga and Ligue 1 still fire, now with both rates |
| `drift-check --file malformed-nested` | exit 1 |
| workflows, script-orphans, import-purity, short-circuit, rows, citations, staged-outbox | all PASS |

## Still open

- **The series has no live entry yet.** This commit makes the next `--url` run
  able to persist one; nothing is proven until a run pushes. The next dispatch
  is the check.
- **Tasks 0.2 / 0.3** of the spread-total CC-CMD — the live payload now carries
  `spreads=25 totals=25`, so the shape data those tasks need is reachable from a
  runner. Not attempted here.
