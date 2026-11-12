# drift-sentinel read a landed ask as REGRESSED because it counted competitions nobody prices (2026-11-11)

The sentinel's run 42982786522 (2026-11-11 07:53Z) ended `REGRESSED CC-CMD-2026-08-21-closing-odds-capture (surviving ask) — landed 2026-08-27, no longer
holds on /context/date/2026-11-10` and failed. This was left uninvestigated earlier in the day; it is investigated here (Rule 77), with a measurement.

## What the data says (D1 `field-archive`, read-only, 2026-11-11)

`regular_season_games`, soccer sports, by day, rows with an `opening_odds` value:

| day | EPL | La Liga | Serie A | Bundesliga | Ligue 1 | MLS | FA Cup | EFL Trophy |
|---|---|---|---|---|---|---|---|---|
| 2026-11-07 | 4 of 4 | 4 of 4 | 4 of 4 | 5 of 5 | 2 of 2 | 22 of 23 | **0 of 33** | n/a |
| 2026-11-08 | 5 of 5 | 5 of 5 | 5 of 5 | 3 of 3 | 6 of 6 | n/a | **0 of 4** | n/a |
| 2026-11-09 | n/a | n/a | n/a | n/a | n/a | n/a | **0 of 1** | n/a |
| 2026-11-10 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | **0 of 17** |

On 2026-11-10 the archive's ONLY soccer rows were 17 EFL Trophy games. The relay has never priced that competition (or the FA Cup) in the days
read. The predicate counted every soccer sport (`isSoccerSport`), found 17 games and no opening line, and returned `false`: "the pre-fix condition
returning". It was not. The relay is capturing opening lines for every priced league on every day it played.

## What it is, and what it is not

A false positive in the lab's own predicate, not a relay regression. The ask is "capture `opening_odds` for EPL and La Liga"; the predicate
asked about all soccer. It will flap on any international-break midweek of cup and lower-league soccer (the next is the week of 2026-11-16).
Not claimed: that the relay captures every league; only the two the ask names are now in the predicate.

## Change (`scripts/cc-cmd-followup.mjs`)

`soccerOpeningCoverage` counts only EPL and La Liga rows (`OPENING_ASK_LABELS`, compared by the registry's `Label`). A slate with none is `null`
(not observable), as an off-day is. The pre-fix condition still reads `false`: an EPL game with no line beside unpriced cup games.

Three self-test cases from this finding, 58 of 58: the 2026-11-10 shape reads `null`; an EPL game with no line beside cup games is still
`false`; a stray line on an FA Cup game cannot stand in for an EPL one. Two table entries break the scope (back to every soccer sport; La Liga
dropped) and both are caught through the harness. `check:mutation-anchors` 0 stale.

Not run here: the sentinel against the live `/context/date` (the sandbox cannot reach the relay). The first run on `main` after this lands, a
scheduled one or a dispatch, is the proof: it must read `no rows` for this ask on a slate like 2026-11-10 and `holds` on one with EPL or La Liga games.

## First scheduled run on `main` after the landing (read 2026-11-12 09:17Z)

Added to `outbox/drift-closing-odds-fix-verified-2026-11-12.txt`, which holds the replay and the dispatched run 43144848254; nothing there is repeated.

| fact | value | where |
|---|---|---|
| the run | 43183593967, event `schedule`, created 2026-11-12T08:31:06Z (the 01:30 slot, 7 h after its cron), head `38475623`, conclusion `success`, job 131065247102 | `mcp__github__actions_list` `list_workflow_runs` and `list_workflow_jobs` |
| the head holds the fix | `git merge-base --is-ancestor f273009d 38475623` and `git merge-base --is-ancestor 1f4a3464 38475623` both say yes; `OPENING_ASK_LABELS` appears twice in `scripts/cc-cmd-followup.mjs` at that commit | `git` in the clone |
| the steps | every step `success` except three skipped by design, among them `Fail if the sentinel failed`; `Did the filed CC-CMDs land?` (step 7), the step that failed in each earlier red run, is `success` | the job's step list |
| the four scheduled runs before it | 210, 211, 212 and 213 (2026-11-10 08:32Z to 2026-11-11 19:27Z), all `failure`, all on the old script | `outbox/drift-closing-odds-fix-verified-2026-11-12.txt`, table of the 14 most recent runs |

**What was not read:** the closing-odds row's own line in this run's log. The log tool returned the last 230 of 758 lines, and that row is printed in step 7, earlier. That the row is not `REGRESSED` is therefore an inference from step 7 being `success` (in each of the seven red runs the other note records, that step was the one that failed and its `##[error]` line named this ask), not a quotation. The verbatim `no rows` and `NOT OBSERVABLE` lines are the dispatched run's, in the other note. The date this run probed (yesterday in UTC, 2026-11-11, EFL Trophy only) was not read from the log either.

**Still staged, unchanged:** a `holds` reading, which needs a sentinel run that probes a date with an EPL or La Liga game. The relay lists none for 2026-11-13 to 11-15; the next EPL matchday is 2026-11-21 (the forecast probe's routine names it), so the first run that probes it is the 01:30 slot of 2026-11-22, which arrives about 08:00 to 08:45Z. A reminder into the authoring session is set for 2026-11-22 09:30Z (`trig_01NRgH5ZtCuAPCCrQBZGtRC3`).
