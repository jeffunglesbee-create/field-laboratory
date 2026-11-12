# Session 2026-11-12: Task 4, Step 1 — how often each review venue is on a slate

Scope: `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Task 4, Step 1 ("Task 4 approved", Thursday 2026-11-12 07:36 ET). Claude Code in field-laboratory, branch `main`. No venue row was built and nothing under `src/` changed.

## Result

The 71 review names with no table row carry **283 games on 261 venue-days** in the archive's games of 2026-07-01..2026-11-11 (4906 games on 134 days), 5.8% of the window's games. The 24 names on 5 or more days carry 182 of the 283 games. The record is `outbox/venue-review-counts-2026-11-12.md`. The CC-CMD's Done-when needs the owner's decision on each venue, so Task 4 stays PARTIAL.

## Done condition (Rule 87) and its probe output

Step 1's part of the Done-when: games and distinct days per review name over the candidates file's window, so the owner decides each venue from a number. The probe is the second script run against the committed record and rows:

```
node outbox/venue-review-counts-recompute-2026-11-12.mjs outbox/venue-review-counts-2026-11-12.md outbox/venue-review-counts-rows-2026-11-12.json
```

It exits 0 and prints (full output in `outbox/venue-review-counts-recompute-2026-11-12.txt`):

```
recomputed from the statement's 75 names, the 79 saved rows, src/Venues.fs and the results file; compared 339 figures with the record: all equal (headline 9, bands 15, reasons 12, table of the 71 286, table of the 4 17).
71 names with no row: 283 games on 261 venue-days of 4906 games on 134 days (5.8%); 4 with a row.
24 names on 5 or more days carry 182 of the 283 games (64.3%).
```

The record's first line reads `Checked 75 of 75 review names`. The Done-when's second clause (each name is a table row with its evidence, or a one-line reason it stays out) is the owner's decision per venue. It is not met, and nothing was built toward it, because the CC-CMD's Not in scope forbids adding a venue by hand without the owner's yes.

## HEAD progression

| step | HEAD |
|---|---|
| start of this work | `39e21c3d` |
| after `git pull --rebase origin main` | `0e17a3db` (a bot status refresh: `STATUS.md` and `outbox/INDEX.md` only) |
| this work | one docs commit, hash in the landing section at the end |

## What was built

| file | what it is |
|---|---|
| `outbox/venue-review-counts-2026-11-12.mjs` | the instrument. `sql` prints one read-only statement for D1 `field-archive`; `report` writes the record from the saved rows and refuses them unless they check out; `selftest` makes each check fail on purpose |
| `outbox/venue-review-counts-rows-2026-11-12.json` | the 79 rows the statement returned through the D1 connector, the two table definitions read from `sqlite_master`, the statement's length (3573 bytes) and sha256 (`a7f0627d…`), and the connector's meta (rows_read 21991, rows_written 0, changed_db false) |
| `outbox/venue-review-counts-2026-11-12.md` | the record: the 71 with games, days, first and last date and the sourcing rule's reason; the 4 review names that already have a row; three controls; method and coverage; what is not established |
| `outbox/venue-review-counts-selftest-2026-11-12.txt` | 51 of 51 doctored inputs refused, each by the right message |
| `outbox/venue-review-population-2026-11-12.mjs` and `.txt` | why the population is 71 and not 66, read from git at three commits |
| `outbox/venue-review-counts-recompute-2026-11-12.mjs` and `.txt` | a second path to the record's figures |
| `outbox/venue-review-counts-mutations-2026-11-12.mjs` and `.txt` | the refusals of the two scripts above, made to fire on doctored inputs: 17 of 17 as wanted |
| `docs/CC-CMD-2026-11-09-venue-review-remainder.md` | Status (PARTIAL 2026-11-12), the Step 1 label, and a Result 2026-11-12 under Task 4 |

## Premises (Rule 100), the one command that tested each

| premise | the command | what it said |
|---|---|---|
| The population is 66 − 2 + 7 = 71, and the two that left were taken out by the 2026-11-10 run | `node outbox/venue-review-population-2026-11-12.mjs 87b6bbb1 3429152d 0e17a3db` | The count holds (67 with no row at the CC-CMD's first commit, 64 at `3429152d`, 71 at `0e17a3db`). The cause did not: the draft record said the 2026-11-10 run took Johan Cruijff Arena and Wembley Stadium off the list. Git says the 2026-11-09 source fill did (`3429152d`: review 70 to 67, both names a table row and in `accepted`). Corrected before the record was written |
| The embedded names are the review list | the `chk-rv` row (the database recomputes count, characters, a position-weighted code-point sum, index-weighted lengths, longest name) and the recompute script, which reads the names out of the statement text | equal |
| One statement can carry five compound terms | the connector | six terms were refused (`too many terms in compound SELECT`, sha256 `c3248cee…`, never ran); the five-term rewrite ran. Both are named in the rows file |
| Venue strings compare as bytes | `sqlite_master`, read through the connector | neither table declares COLLATE; saved in the rows file as `ddl`, refused by `checkDdl` if it ever says otherwise |
| The archive's venue string is the page's `data-venue` | not tested | what supports it is control 1 (every name was drawn from the archive) and control 3 (Manadon: one record, one row, one day, as the 2026-11-11 session read it). No rendered page was read |

## Mistakes found and fixed before the commit

1. The six-term statement was refused by D1 before it ran; rewritten with five terms (the date offsets joined the `wsum` row).
2. `report` refused the real rows: its integer check applied to columns that are NULL by design in the `win` row. The check is per row kind now.
3. Two self-test cases were refused for the wrong cause (the Manadon date was caught by control 2 before control 3; the COLLATE doctoring tripped the venue-column pattern first). Each was re-aimed until it fired by its own check.
4. The draft record overclaimed in five places: "name-days" for venue-days; control 1 said to require a game without checking it; Manadon "entered review with a hand row" (the row came the day after the run); "no id is counted twice" without a check (now `win.c1 === win.c2`, 4906 of 4906); a collation claim with no record behind it (now the saved `ddl`).
5. The 66 to 71 cause, above.
6. The population script had one check that was an identity and could not fail; it was removed and the line says it checks nothing.
7. The recompute script's refusal printed its two values swapped ("recomputed" showed the record's number). The doctored-input run found it; fixed before the file was kept.

## Integration state (Rule 65)

No relay or client contract is touched and no endpoint is served. The record's consumer is the owner. There is nothing to verify end to end beyond the record's own figures.

## What is not established

- **Anything forward.** These are past counts. A qualifying round, a tournament week or a cup tie does not recur on a schedule, and a window that includes the summer says nothing about January.
- That the archive's venue strings are the page's `data-venue` strings on every day (Step 0's premise 1).
- Whether a card at any of these grounds showed a weather chip. No rendered page was read.
- That the saved rows are the connector's output as returned. They were typed by hand from it. Sums, checksums and three controls make a mistyped row unlikely to survive; the recompute reads the same rows file and does not test this.
- What each script cannot catch is listed in its own output: `NOT exercised here` in the self-test and in the mutations file.

## Found outside this scope, not touched (Rule 69)

- **A check that follows the machine's time zone.** `src/Suite.fs`, "before kickoff the status is 'Scheduled <raw> (parsed HH:mm)', byte for byte", pins `Scheduled 2026-08-09T23:05:00Z (parsed 23:05)`. The compiled status text calls the F# library's `toString(parsed, "HH:mm")` (`build/Scoreboard.js`), and that call formats in the machine's zone. Measured 2026-11-12 with the library's own `toString` on `2026-08-09T23:05:00Z`: `23:05` under TZ=UTC, `19:05` under America/New_York, `08:05` under Asia/Tokyo. `node build/VerifyMain.js` holds 476 of 476 under TZ=UTC and 475 of 476 under America/New_York, which is this sandbox's zone. UTC runners are green, so CI does not see it. By the same call a card would show the viewer's zone (read from the compiled code, not rendered). It is another session's check and the choice, pin UTC or pin the viewer's zone, is theirs.
- **The confidence gate does not finish locally.** `npm run gate` reached its 16th of 23 rows, "breaking each invariant makes a check fail", which runs `node scripts/mutation-check.mjs` in-process (1446 registry entries, a build each; CI shards it over eight jobs). I stopped it after about 9 minutes in that row. The 15 rows before it passed under TZ=UTC with this session's files in the tree; under America/New_York the F# harness row fails (above). Seven rows after the mutation row did not run. Both gate runs I stopped (the first by a 540 s timeout) left `src/Scoreboard.fs` with a three-line `__proof0` snippet (`1 + "a"`) while `scripts/proof-check.mjs --only LOCK-PROOF` was running, and left `outbox/metrics-tab-latest.png` changed by a gate row. Both files were restored with `git checkout`, `build/` was rebuilt (24 s, no `__proof` text in `build/*.js`), and `git status` then showed only this session's files. The outputs above were regenerated against that rebuilt tree and are byte-identical.

## Reproduce

```
cd /home/claude/field-laboratory && npm run build
R=outbox/venue-review-counts-rows-2026-11-12.json
node outbox/venue-review-counts-2026-11-12.mjs report $R 2026-07-01 2026-11-11 | cmp - outbox/venue-review-counts-2026-11-12.md
node outbox/venue-review-counts-2026-11-12.mjs selftest $R 2026-07-01 2026-11-11 | cmp - outbox/venue-review-counts-selftest-2026-11-12.txt
node outbox/venue-review-population-2026-11-12.mjs 87b6bbb1 3429152d 0e17a3db | cmp - outbox/venue-review-population-2026-11-12.txt
node outbox/venue-review-counts-recompute-2026-11-12.mjs outbox/venue-review-counts-2026-11-12.md $R 2>&1 | cmp - outbox/venue-review-counts-recompute-2026-11-12.txt
node outbox/venue-review-counts-mutations-2026-11-12.mjs | tail -4
```

`cmp` prints nothing when the files are identical. The mutations output holds temporary-repository commit hashes that differ on every run, so it is read for its last lines (`17 of 17 cases as wanted; 0 problem(s)`) and not compared byte for byte.

## Open

The owner's decision on each of the 71 venues: a list of names, or a rule such as every name on 5 or more days (24 names, 182 of the 283 games). Each row is then built the way Manadon Sports Hub's was in Task 3: the owner's yes, the evidence assembled and put beside the row, then the owner's keep or revert. Nothing is deferred in this session: no second CC-CMD is written because the remainder is a decision, recorded in the CC-CMD's Result 2026-11-12 and its Not in scope.

## Landing (manifest, written after the push)

| item | value |
|---|---|
| commit | `c86b047d` on `main`, pushed 2026-11-12 13:33Z, 12 files (11 under `outbox/` and the CC-CMD), no source |
| workflow runs on that commit | one: `guards` run 43228455202, event `push`, `success`, job 131217670372, 19 steps, none other than `success` (read by REST on 2026-11-12). `docs/**` and `outbox/**` are outside `verify`'s and `deploy`'s triggers, so no other run was expected and none had appeared at the last read, about a minute after the push |
| done-condition probe | the three lines under "Done condition" above, from `node outbox/venue-review-counts-recompute-2026-11-12.mjs ...` run on the tree this commit holds; the Reproduce block was run on the same tree and `cmp` found every regenerated file identical |
| CC-CMD state | `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Status PARTIAL 2026-11-12, with Result 2026-11-12 under Task 4 |
| genuine residual | the owner's decision on each of the 71 venues (the CC-CMD's Done-when, second clause). Nothing is deferred |
