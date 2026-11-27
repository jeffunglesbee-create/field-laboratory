# Session 2026-11-27: the UEFA fit's mutation harness wired into a runner job

Owner order: "Declare it" (1836c954), then "Wire it". The declaration in `docs/unreachable-scripts.txt` said why `scripts/mutate-uefa-fit.mjs` was unreachable and when to delete the line: in the commit that wires it. This is that commit.

## HEAD progression

| commit | what |
|---|---|
| `1836c954` | declared `mutate-uefa-fit.mjs` in `docs/unreachable-scripts.txt` (guards on main green again, run 46078592323) |
| `78e3abf7` | `.github/workflows/uefa-fit-mutate.yml` (new), the declaration removed, one `EXEMPT` entry in `scripts/mutate-copy-check.mjs`, this note |
| the commit after it | the proof run's result (the "Done condition" section below) and the measured run time in the workflow header, which the first draft had estimated at 7 to 9 minutes |

## What was built

1. `.github/workflows/uefa-fit-mutate.yml`: dispatch, and a push to main that touches the harness, the check, the tooling it mutates (`outbox/forecast-fit-uefa-2026-11-27.mjs`) or the workflow itself. `permissions: contents: read`, concurrency group `uefa-fit-mutate`, `timeout-minutes: 45` as a hang guard. One step runs `node scripts/mutate-uefa-fit.mjs`, prints the runner core count, the elapsed seconds and the harness's `coverage:` line into the step summary, and fails on a non-zero exit or on an exit 0 with no `coverage:` line (Rule 91: a pass whose denominator is not printed is not a pass). It commits and pushes nothing.
2. `docs/unreachable-scripts.txt`: the 11-line declaration removed (restored byte-for-byte to its content at `ce14713e`).
3. `scripts/mutate-copy-check.mjs`: `mutate-uefa-fit.mjs` added to `EXEMPT` with its reason (see "The blocker the review found").

## Proof of the step (Rule 90), run before anything was committed

The step body was extracted from the workflow and run under `bash --noprofile --norc -eo pipefail` with a stub `node` on PATH:

| stub | step exit | summary lines |
|---|---|---|
| harness exits 1, prints `coverage: ... caught 30, not caught 3` | 1 | cores, elapsed, coverage |
| harness exits 0, prints `coverage: ... caught 33, not caught 0` | 0 | cores, elapsed, coverage |
| harness exits 0, prints no `coverage:` line | 1 | cores, elapsed, `coverage: NOT PRINTED` |
| harness exits 2 (control failed), no `coverage:` line | 2 | cores, elapsed, `coverage: NOT PRINTED` |

The first draft of the step lost its elapsed and coverage lines when the harness failed (a pipeline under `-e` and `pipefail` aborts the step at the `tee` line). Reproduced on the draft: the summary held only the cores line. Fixed with `set +e` around the harness and `PIPESTATUS`, then the four rows above.

The orphan guard (`scripts/check-script-orphans.mjs`) was shown red and green by moving the workflow aside: with no workflow and no declaration it printed `mutate-uefa-fit.mjs   <- NOT DECLARED` and `FAIL  2/3 checks passed`; with the workflow it prints `PASS  3/3 checks passed`.

## The blocker the review found (and a premise that was false)

A three-lens review ran on the uncommitted change (31 agents: three reviewers, then two skeptics per finding; 14 findings). Three lenses reported the same blocker independently, and six of six skeptic votes confirmed it:

`verify.yml` runs `npm run check:mutate-copy` ("The mutate scripts break a copy, never the tracked tree"), which runs every `scripts/mutate-*` file that is not on `EXEMPT` three times under a 180 s kill. `mutate-uefa-fit.mjs` is not exempt, takes minutes, and does not speak that check's protocol (it has `--only` but no `--self-test`). That step had never judged the harness because the step before it, "No script a workflow depends on became unreachable" (step 69), has been red on every `verify` run since the harness landed, and every step after it was skipped:

| `verify` run | commit | step 69 | step 71 (this check) | steps 72 to 92 |
|---|---|---|---|---|
| 46066593620 | `59f6eecc` (before the harness) | success | success | success |
| 46070142220 | `67223115` | failure | skipped | skipped |
| 46071072520 | `d90d96bb` | failure | skipped | skipped |

(Read from the Actions API for this note, not from the review.) Declaring the script made the orphan guard pass on its own check but not on `verify`, which is red on main for the same reason. Wiring it would have turned step 69 green and step 71 red. The fix is the `EXEMPT` entry; the precedent is `mutate-ppubs-probe.py` (too slow for this check, a workflow runs it). Checked after the edit: the inventory clause reads `13 checked + 5 exempt = 18 files`, `mutate-copy-check.mjs --self-test` 26/26, `mutation-check.mjs --anchors` `checked 2273 of 2276 mutation anchors; 0 stale`, and the seven mutation entries that read `EXEMPT` (the `mutate-copy-check-inventory-*` ids) 8/8 including the unmutated tree.

What was not run here: `npm run check:mutate-copy` itself on the whole tree (13 scripts, each up to three 180 s runs). It runs in `verify` on the push, and that run is part of the done condition.

## Review dispositions

| finding | lenses | skeptics | disposition |
|---|---|---|---|
| `verify` step 71 would turn red | gates, semantics, facts | 6 of 6 real | fixed: `EXEMPT` entry |
| the header said the pre-registration freezes the tooling | gates, facts | real | fixed: the RULE block is hash-pinned and the verdict closed Tasks 3 and 4; nothing says the tooling is frozen |
| "prints nothing until it ends" | gates, facts | real | fixed: the control line comes after about a minute, the rest at the end |
| "writes nothing" | facts | real | fixed: it commits and pushes nothing; outputs are the step summary and the log |
| 43 s per check on the runner against 57 s in the sandbox | semantics | not a contradiction | header now cites both figures |
| "run by hand before the fit's run" overstated | facts | refuted (true as written) | kept; the underlying fact is recorded below |
| a red run of this workflow is visible in the Actions tab only | semantics | not specific to this change | header states it; `status.yml` reads `deploy, pages, drift-sentinel, verify` (line 40) and was not changed |
| the orphan guard counts a `paths:` line as reaching the script | gates, semantics | 1 of 2 and 0 of 2 | not changed; see "Observed, not changed" |
| the Actions budget paragraph in `CLAUDE.md` may be stale | semantics | refuted as a defect of this change | not changed; unverified |

## What the proof run is, and what it is not

The session note for the fit (`outbox/cc-session-2026-11-27-uefa-forecast-fit.md`) records the harness history exactly: a first run of 29 mutants caught 26, the three survivors became new checks, a second run caught 29 of 29, the harness grew to 33 mutants, a third run caught 32 of 33, the survivor (the alias map not applied on the away side) got a new assertion (71 in all), and then only the 3 club-identity mutants were re-run (3 of 3). It says the full harness was not re-run in one piece after the last assertion. This workflow's first run is that re-run. It is evidence, not a formality, and it can be red: a red result would be a finding about the check, to be investigated, not explained away.

## Done condition (Rule 87.2, Rule 89)

The push that lands this commit triggers `uefa-fit-mutate` (its own path is in the filter) and `verify` and `guards`. Done when all of these are read from the Actions API for the landing SHA, not assumed:

1. `uefa-fit-mutate` concludes `success`, and its step summary holds a `coverage:` line reading `33 mutants ... caught 33, not caught 0, harness errors 0`, with the runner core count and elapsed seconds.
2. `verify` step "No script a workflow depends on became unreachable" and step "The mutate scripts break a copy, never the tracked tree" both `success`.
3. `guards` concludes `success`.

Result, read from the Actions API for `78e3abf7` (workflow runs created 2026-11-27T23:25:57Z):

| run | id | conclusion | what was read |
|---|---|---|---|
| `uefa-fit-mutate` | 46082459391 | success | job log: `runner cores: 4`; `control: the check passes on the unmutated copy (71 of 71 checks passed 71 71)`; `coverage: 33 mutants of the tooling (the RULE block untouched); caught 33, not caught 0, harness errors 0`; `elapsed seconds: 841`; 33 `CAUGHT` lines and no `NOT CAUGHT` or `HARNESS ERROR` line; job 23:25:59Z to 23:40:10Z |
| `verify` | 46082459392 | success | 7 jobs success; in job `verify` steps 69 ("No script a workflow depends on became unreachable"), 70, 71 ("The mutate scripts break a copy, never the tracked tree") and 72 all `success`; 124 steps success and 2 skipped (a failure-only screenshot upload and the browser-install fallback); 9.5 minutes |
| `guards` | 46082459387 | success | 13 steps |

The workflow's own landing push fired it (its path is in the filter): this was the open question the reviewers could not test read-only, and it is now answered. The full harness had not been run in one piece against the final 71-assertion check before this; it now has, on a runner, and caught every mutant. `verify` on main had been red since `67223115`; this is its first green run since the harness landed (`59f6eecc` was the last).

Measured run time: 841 seconds on 4 cores. The first draft's header estimated 7 to 9 minutes (single-check times times ten); four checks at once are slower than one alone. The header now states the measured figure and marks the 2-core figure as an extrapolation. That edit changes a path in the filter, so it re-runs the harness: the second full run is a repeat of the first, and is read below if it differs.

## Observed, not changed

`scripts/check-script-orphans.mjs` finds a script "reachable" when any non-comment workflow line names it (its workflow-text scan, the `scriptFiles(wfText)` call). A `paths:` entry is such a line. So deleting the `node scripts/mutate-uefa-fit.mjs` run line from the new workflow, while the harness stays in the `paths:` filter, leaves the orphan guard green and the declaration is not demanded back. The workflow's own step would then no longer run the harness and nothing static would say so. This is a property of the guard for every script in the repository, it predates this change, and no existing CC-CMD covers it (searched `docs/CC-CMD-*.md` for the orphan check and for path filters counted as reach: four CC-CMDs name the check, none mention it). Fixing it is a change to a guard with its own mutation entries and its own commit (TOUCH-ONLY); an owner ruling is needed on whether to build it. Reproduction: remove the run line in a scratch copy and run `node scripts/check-script-orphans.mjs`.
