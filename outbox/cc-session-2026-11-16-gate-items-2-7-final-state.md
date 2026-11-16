# Final state of items 2 to 7 of `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md` (2026-11-16)

Every figure below is dated, names the head it was measured at and the command that printed it. Head: `15e02ed8` on branch `gate-items-2-7` (`b704b7f9` plus the two ledger commits the scored run pushed, which change `docs/confidence-log.jsonl`, `docs/scale-log.jsonl` and `outbox/mutation-baseline-latest.json` only). Figures in the earlier notes of this work (`outbox/cc-session-2026-11-15-gate-items-2-7.md`, the `-guard-r4`, `-r5-*` and `-r6-*` notes) were measured at the head of the section that states them; these supersede them.

## The scored gate (Rule 89: the artifact is the run and its ledger record)

| run | head | result | ledger id | seconds |
|---|---|---|---|---|
| `verify-full` 43932769199 (dispatched 2026-11-16 18:48 UTC) | `33abca6b` | 530 of 530, `failing []`, `skipped []`, `notApplicable []`, all eight mutation shards `success` | `33abca6b7218-346213e3569e` | 4078 |
| `verify-full` 43945306863 (dispatched 2026-11-16 20:00 UTC) | `b704b7f9` | 530 of 530, `failing []`, `skipped []`, `notApplicable []` | `b704b7f94d08-d97b5d37f7e9` | 3971 |

The second run scores the head that carries every code change of this work: after the first, the guard's self-test gained the fixtures that closed the sweep's two survivors (`af931199`, `2f94c7be`), and the ledger commits of the first run were merged. The record of each is the last line of `docs/confidence-log.jsonl` on `origin/gate-items-2-7` at the time (`git show origin/gate-items-2-7:docs/confidence-log.jsonl | tail -1`).

## Self-tests and checks, replayed on the merged tree at `15e02ed8` (2026-11-16)

| command | result |
|---|---|
| `python3 scripts/check-browser-gate.py` | `verdict: gated` |
| `python3 scripts/check-browser-gate.py --self-test` | 954/954 (912/912 at `4b5395e6`, 2026-11-16 before the verification fixes; 388 at the end of 2026-11-15's fix rounds) |
| `python3 scripts/check-browser-gate.py --plain-commands`, count of the JSON list | 70 |
| `node scripts/gate-mode.mjs --self-test` | 50/50 |
| `node scripts/delete-branches.mjs --self-test` | 38/38 |
| `node scripts/no-launch-check.mjs --self-test` | 54/55: the one failure is `the axis-check mutation needs build/ (run npm run build first)`, which needs the F# build and runs on a runner |
| `node scripts/mutation-check.mjs --self-test` | 221/221 |
| `node scripts/mutation-lib.mjs --self-test` (alone) | 81/81 |
| `node scripts/mutation-check.mjs --anchors` | `checked 1980 of 1983 mutation anchors; 0 stale` |
| `node scripts/mutation-check.mjs --stranded` | 0 markers |
| `npm run check:mutation-anchors`, `check:workflows`, `check:import-purity`, `check:short-circuit`, `check:setup-script`, `check:clean-source`, `check:push-lands`, `check:boundary`, `check:browser-gate` | all exit 0 (221/221, 71/71, 3/3, 9/9, 1/1, 5/5, 26 loops, reachable, gated) |
| `npm run --silent check:citations` | bare 0 (budget 0) |

`node scripts/cc-cmd-status-check.mjs` is 4/5: the one failing check names `CC-CMD-2026-11-15-scout-daypart-picks.md`, whose status opens with `SPECIFIED`, a word outside the closed vocabulary. That document arrived from `main` (another session's work) and is not touched here.

## The sweep (Rule 90 over the guard's code and the workflows it reads)

`outbox/browser-gate-sweep-2026-11-16.txt`: 554 mutations (428 of the guard's code, 57 of `verify.yml`, 69 of the other workflows it reads), run in 8 slices at 4 at a time; 554 caught. Two survivors on the way, both older than this round and now closed with fixtures: `an unreadable always() uses: step is opaque` and `an if that never closes is accepted in the required step` (each NOT CAUGHT at `4b5395e6` as well). The sweep script's header now carries the counts and `EXCLUDED = 8`, the number of items its header names (it said 10).

## The vocabulary probe

`outbox/guard-constants-probe-2026-11-16.txt`: 343 string members in 43 module-level collections, 343 of 343 deleted one at a time; 343 caught (equalities in force); with the equalities replaced by `True`, 320 caught and 23 OPEN, triaged in the file as redundant for the verdict (19 `WRAPPER_HEADS` members, measured over 95 lines with 0 verdicts changed, and 4 `BENIGN_HEADS` members that are also in `SAFE_HEADS`; the same 4 labels are OPEN at `4b5395e6` and `9043fa75`).

## The reviews of this round

- The verification of the round-5 merge (workflow `wf_f9f5e556-127`, 66 agents, `c6b1c33f`): dispositions in `outbox/cc-session-2026-11-16-gate-items-2-7-r5-merge.md`.
- Independent re-reviews of what that produced (reviewer agents, each given the diff and no conclusion): the four guard commits `8299add0`..`945daddf` (about 250 launcher shapes, 81,000 echo lines against `bash -c`, 25 mutants); the pins (F-A to F-D: a differential test of the comment scanner against acorn over 195 of 196 repo scripts, 677 of 679 files of other repos and 5,081 of 5,094 `node_modules` files, 78 mutants); the four later guard commits (a 585-line grid, 800,000 generated lines against `bash -c`, 600,000 lines for the word counts, 54 + 24 shapes for the five tools, 529 real inputs, 28 mutants). Each produced regressions of mine or survivors that were fixed with a fixture and an entry that failed on purpose; the accounts are in the `-r6-guard` and `-r6-pins` notes. My own final bash differential over the fixed guard: 40,000 quote-heavy echo lines, 4,181 read clean by the guard, 0 ran their marker.
- What is left, each with the input that still passes, its class and how it closes: `docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md` (12 items).

## The no-launch record

`node scripts/no-launch-check.mjs` run here exits 1 with `verdict: NOT ESTABLISHED OR VIOLATED`: `checked 70 of 70 commands: 61 exited 0 with 0 launches; controls: 3 of 3 saw a launch; the guard's list is the pinned 70; scanned 195 scripts: 14 of 14 lines that name the node options are on the list, 0 listed line(s) are gone`. The 9 that did not exit 0 each stop on a missing module of the F# build output (`build/Palette.js` for `design-tokens-check` and `palette-check`, `build/Prose.js`, `build/Scoreline.js`, `build/Typography.js`, `build/Weather.js` and `build/Market.js`; `network-exempt-check` prints `build/Desk.js is missing (run npm run build)`), which this sandbox does not have and the instructions of this work forbid building here, with 0 launches: `design-tokens-check`, `docs-check`, `network-exempt-check`, `palette-check`, `scoreline-check`, `typography-check`, `weather-live-check`, `wp-check` and `no-launch-check --self-test` itself. That is a limit of where it ran, not a result, and the record that counts is the one from a runner: `outbox/no-launch-check-2026-11-16.txt`, taken from the log of the step `The browser-free steps' self-tests and read-only modes launch no browser (a trap, not a reading)` (`npm run check:no-launch`) of `verify` on the landing commit, with its run id and head.
