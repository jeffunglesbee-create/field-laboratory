# Claude Code Command — the brief-phase check fails a finished game on the card of another game: it finds a game's card by team-name substring, and `Alabama` is inside `South Alabama`

**Branch:** main — commit directly, do not create a feature branch or PR (a work branch is used only to run `verify-full`, and lands on `main` by merge with the run id in the message)
**Repo:** field-laboratory
**Filed:** 2026-11-15 by CC, on the owner's word ("Brief and hook", Sun 2026-11-15 06:53 ET), as the residual named in `outbox/cc-session-2026-11-14-tls-stage.md` ("A finished game shows the brief written after it finished" red in 6 of 6 renders since 2026-11-14 23:06Z)
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** DONE 2026-11-15. Approved by the owner ("Brief and hook", Sun 2026-11-15 06:53 ET). Landed on `main` as `4b66f5d7` (merge of `brief-hook`) after a scored `verify-full`, 43716154931, at 530 of 530 (ledger id `58e81d25cca8-9ac77ec85710`); `verify` 43721275726 on the branch head `d5ef64d0` is green, and on the landing `verify` 43721845406, `guards` 43721845434, `deploy` 43722537255 and `live-check` 43722647467 are green. All five done conditions are met, each with its artifact in the Outcome; the Task 6 replay, `live-check` 43722817857 with `brief_date=2026-11-14`, is PASS on 42 testable games. Two things differ from the plan and are in the Outcome: the scored commit is not the branch tip, and Task 7's beat is a scheduled task that dispatches its own run, because the daily cron measured blind to this rule in 20 of 20 runs (that finding is filed as `docs/CC-CMD-2026-11-15-live-check-daily-beat-late.md` and not built). The first Saturday-evening check is scheduled task `trig_01QL6mcB9jqiJPWyBPEXh9Sn`, 2026-11-21 20:30 ET. The premises were tested before filing and are in `outbox/brief-hook-premises-2026-11-15.txt`. Session record: `outbox/cc-session-2026-11-15-brief-hook.md`.

---

## What was measured

`scripts/brief-phase-live-check.mjs` is the `live-check` step "A finished game shows the brief written after it finished". It fetches the day's payload, picks the final games that carry both a during-play and an after-play brief, finds each game's card on the deployed page, and fails a game when a card it found shows a during-play kind (`pre_game`, `game_live`).

The step was red in 6 of 6 renders from 2026-11-14 23:06Z (runs 43651541854, 43658647710, 43669286520, 43671813126, 43673414837, 43676533656). The first render had one red row (`Alabama @ Vanderbilt`); each of the other five had the same three: `Alabama @ Vanderbilt`, `Michigan @ Oregon`, `California @ Virginia`. The step is green now (runs 43707398981 and 43708978645, 2026-11-15 11:07Z and 11:27Z), and that green is not a fix: both printed `final games carrying BOTH a during-play and an after-play brief: 0` and `NOT OBSERVABLE ... This is not a pass`, because Sunday morning's slate has no finished game yet.

The cards are found with `c.teams.includes(g.away) || c.teams.includes(g.home)`: a card is taken for a game when its team line contains either team's name as a substring. Replayed against the saved job logs (the replay script is in `outbox/brief-hook-premises-2026-11-15.txt`, section Z1):

| row | cards the matcher takes | the partner cards (other games), status as the 00:32Z run (43658647710) printed it |
|---|---|---|
| `Alabama @ Vanderbilt` | 2 | `Troy @ South Alabama` (`Start time passed, no score served`; in the 23:06Z run it read `Scheduled 2026-11-15T00:00Z (parsed 00:00)`) |
| `Michigan @ Oregon` | 3 | `Washington @ Michigan St` and `Oregon St @ Boise St`, both `Start time passed, no score served` |
| `California @ Virginia` | 3 | `Kansas @ West Virginia` (`Final`) and `Stanford @ Virginia Tech` (`Start time passed, no score served`) |

The page's own card for each of those games printed `status="Final" kind="game_recap"`: 16 of 16 red-row prints, over the six runs. So the `game_live` that failed each row was on a different game's card. In the run at 00:32Z the verdict text for `Michigan @ Oregon` read `game_live, game_live`, and at that time both of its partner cards were `Start time passed, no score served`: two during-play cards, two partners.

The evidence print never showed it. The row's evidence line prints `matching[0]` (its own card), while the verdict looks at every card in `matching`. A passing row hid it too: `Missouri @ Georgia` passed as `game_recap (4 cards, duplicated upstream)`, which is the same matcher taking the cards of `Georgia Tech @ Clemson`, `GA Southern @ Georgia St` and `New Mexico St @ Missouri St` (section A2 of the premises file lists them), and the label blames the relay.

## Related, read before building (BUILD-ON-A)

Searched 2026-11-15 by content (`brief-phase`, `brief phase`, `verdictForCards`, `live-on-final`, `during-play kind`, `briefKeyMatches`) in `docs/CC-CMD-*.md`: 71 files, this one among them; the other 70 have two matches and neither covers this (section A6 of the premises file):

- `docs/CC-CMD-2026-11-11-soccer-live-scores.md` (LANDED; its Done condition's real in-play manifest is STAGED to 2026-11-21): mentions the check only to say that `live-check` does not read the pre-kickoff string and that the self-test's fixtures mention `Scheduled`. No hold on this script. Not edited.
- `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md` (PARTIAL): `live-check.yml`'s job `live` is one of the two jobs `scripts/check-browser-gate.py` reads whole. This edits that file (Task 4), so the guard must stay green on it; no ruling there is undone. Its line 120 records run 43658647710's red brief step as "a pre-existing brief-phase finding": this CC-CMD is where that finding is worked, and the pointer added to that line (with the hook CC-CMD's, one commit) says so. Nothing else in that file changes.
- Outbox records of the check's own history, read for their rulings: `outbox/cc-the-phase-rule-verified-live-2026-08-29.md` (the check's origin; its three states, and a state with nothing to judge is not a pass: kept) and `outbox/cc-no-card-was-two-failures-2026-08-31.md` (a failure that hid two causes under one string; its remedy, a row that prints its own evidence, is what Task 2 extends). The script's own comments carry two more rulings, both kept: relay duplication is reported and never failed on (the comment on `verdictForCards`), and an empty slate is a state and not a crash (commit `ceacd3a0`). The relay's duplicated fixtures have their own watch (`outbox/cc-the-relay-serves-one-fixture-twice-2026-08-31.md`, scope `scripts/relay-duplicate-fixture-watch.mjs`): not touched.
- `scripts/render-check.mjs` and every hold on the weather check (`docs/CC-CMD-2026-10-17-weather-live-http-outage.md`, `docs/CC-CMD-2026-10-20-weather-first-call-connect.md`, `docs/CC-CMD-2026-11-14-weather-failure-tls-stage.md`): not touched.

## Premises, and the one command that tested each (Rule 100)

All from `outbox/brief-hook-premises-2026-11-15.txt`, which opens with `checked 6 of 6 red live-check runs; 16 red rows; ... reproduced: 199 of 199`.

| premise | the command | what it said |
|---|---|---|
| a red row's failing card is the card of another game | the check's own predicate replayed over the card list and the row table of each saved red log, validated against the card counts the check itself printed on every passing row | the replay equals the printed count on 199 of 199 passing rows; each red row has 1 or 2 partner cards with other game ids |
| the replay can fail | the same replay with `&&` (both teams) | disagrees with the log on 2 of 39 rows (`Missouri @ Georgia` 4 against 1, `Kansas @ West Virginia` 2 against 1) |
| the page's own card is right | the evidence lines printed by the six red runs | 16 of 16 read `Final` / `game_recap` |
| the card's `data-game-id` is the payload's game `id` | the 16 red rows (`evidence: game.id=...` against the card list); `grep` for who else reads the attribute | 16 of 16 equal; `render-check.mjs`, `lineups-card-lib.mjs`, `live-score-probe.mjs`, `nav-check.mjs` and `spark-check.mjs` read it to tell which game a card is, and `spark-check.mjs` finds a game's card with `.desk-card[data-game-id="<id>"]` |
| a green run means the matcher is fine | the two newest runs' own lines | refuted: `NOT OBSERVABLE`, 0 testable games of 26 |
| the page replays a past day | `?date=` in `src/Program.fs`; the relay for 2026-11-14 through the hand-off server | the parameter exists; the relay answers 200, 339,314 bytes |

## Task 0 — probe block (run at filing)

```
git log --oneline -3
git branch --show-current
grep -n "c.teams.includes(g.away)" scripts/brief-phase-live-check.mjs
grep -n "desk-card__teams" scripts/brief-phase-live-check.mjs
grep -n "data-game-id" src/Scoreboard.fs
node scripts/brief-phase-live-check.mjs --self-test | tail -2
```

Expected at filing: HEAD on the work branch `brief-hook` cut from `4799ab1c`; the predicate on exactly one line; the self-test `19/19 checks passed`.

## Design

1. **The join is the card's id.** A game's card is the card whose `data-game-id` equals the game's `id`. Not a name, not a normalised name, not a token overlap: the page writes the id on every card (`card.setAttribute("data-game-id", game.Id)`, unconditional, in `src/Scoreboard.fs`), other scripts here already use it to find a game's card, and the check's own comment on duplicates says an event id names a fixture exactly and needs no convention to agree with itself. No second matcher beside it (no fallback).
2. **The evidence names every card the verdict looked at.** A failing row prints each card in `matching` with its id, team line, status and kind, not the first.
3. **A dispatch can choose the day.** `live-check.yml`'s `workflow_dispatch` takes an optional `brief_date`; the brief step's URL carries `?date=<it>` when it is set. The check's header says "On a dispatch it means the day was wrong, not the code" and gives the dispatch no way to pick another day.
4. **What does not change:** `verdictForCards` (its `duplicated upstream` label, now only reachable when one id appears on two cards, is noted for a later pass and not changed here), `expectedKind`, `briefMatches`, `norm`/`tokens`/`overlap` (they stay, for the no-card diagnostic only), the relay-duplicate NOTE block, `scripts/render-check.mjs`, the three-state header.

## Task 1 — the test first, and it fails on purpose (Rule 90)

Add to the self-test, from the 2026-11-14 rows (ids, team lines and statuses are from the run log; the partner cards' kind `game_live` is deduced from the failure text, not printed, and the fixture says so): the three collision groups, a test-only copy of the old predicate to prove the fixture collides, `cardsForGame` as the new join, and the defined failure through the new path. First with `cardsForGame` written as the old predicate: the collision checks must go red and the fixture check must stay green. **Artifact:** the self-test output with that red.

## Task 2 — the evidence print

`evidenceLines(matching)` returns one line per card; the executable half prints it for a failing row. A self-test check lists every card of a two-card match and its kind; mutate the function to print one card and watch the check fail. One commit.

## Task 3 — the id join

`cards` carries `id` (`data-game-id`); `matching` is `cardsForGame(cards, g)`; the comments that describe the substring rule are rewritten to say what the code now does and why (the history of the 2026-08-30 slate stays as history), and the no-card text says that no card carries the game's id and keeps the near-name list as a hint. One commit. **Artifact:** the self-test, all green; a mutation run (below) in which each mutant of `cardsForGame` and `evidenceLines` is caught, printing `caught K of K` and refusing to report anything when its anchor is not unique and applied.

## Task 4 — the dispatch input

`brief_date` input; the brief step reads it through `env:` (never interpolated into the command) and appends `?date=` to the URL when it is set. One commit. `npm run check:workflows` and `python3 scripts/check-browser-gate.py` stay green.

## Task 5 — gates and landing

The hook runs on every commit. `check:mutation-anchors`, `check:workflows`, `check:browser-gate` and the doc guards run locally. A scored `verify-full` on the branch, on the last commit that changes code the gate scores (the commits after it are docs, the gate's recording commits and one guard the gate does not run, all named in the landing message); `main` merged into the branch and `verify` run on that head, so it runs on the combination; then a merge into `main` (`--no-ff`, the run id in the message), then `verify`, `guards`, `deploy` and `live-check` for the landing. **Artifact:** the run ids and `530 of 530`.

## Task 6 — the runner proof, in this session

After the landing, dispatch `live-check` on `main` with `brief_date=2026-11-14` and read the brief step's log by REST. The relay now serves that day finalised, so the old partners may all read `Final` by now; the proof is that the step's table has a row per testable game, each matched by its own id, no row carrying a card count unless one id is on two cards, and the verdict. If the step is red, its evidence names the card and the cause is investigated before anything is said about it (Rule 77): a red here would be a finding about the page, not about the matcher. **Artifact:** the step's lines in the session record, with `final games carrying BOTH ...: N`, N above 0.

## Task 7 — the follow-up is a task, not a note

The first Saturday evening after the landing is Saturday 2026-11-21. The daily cron cannot be its beat. `live-check`'s `schedule` runs are created 5.70 to 8.45 h after the 03:37Z cron (median 7.80 h; 20 of 20 runs, `gh run list --event schedule`, read 2026-11-15), and a run created then shows the page's date after the turn of the ET day (`slate 2026-11-15` in run 43708978645, created 11:27Z that day), so it never meets Saturday's finals. The spec first written here, "a `live-check` created after 2026-11-22T03:37Z", rested on the cron's nominal time and is withdrawn. The measurement is `outbox/live-check-schedule-sweep-2026-11-15.txt`; the daily beat's own fix is filed as `docs/CC-CMD-2026-11-15-live-check-daily-beat-late.md`.

A scheduled task therefore dispatches `live-check` on `main` itself at 2026-11-22T01:30Z (20:30 ET on Saturday 2026-11-21), with no `brief_date` (the page then shows the current ET day, with games still in play beside the finals), reads the brief step's log over REST, and records: the `slate` line; the `final games carrying BOTH ...: N` line; the check's last line (`every final game with both phases shows its after-play brief (N testable)`) with its PASS or FAIL; every row whose shown text carries `cards, duplicated upstream`; and, for a red row, the evidence lines (every card id the verdict looked at). `NOT OBSERVABLE` is not a pass: the task says so and re-arms once, +1 h. **Artifact:** the task's id in the Status line.

## Task 8 — the manifest is last

`outbox/cc-session-2026-11-15-brief-hook.md`: commit hashes, run ids, the premise results, what was verified end to end and what was not.

## Done conditions

1. The self-test passes with the new checks, and the Task 1 output exists showing them red against the old predicate.
2. The mutation run printed `caught K of K` with every anchor unique and applied.
3. `verify-full` on the scored commit at 530 of 530; `verify` green on the branch head with `main` merged in; the landing's `verify`, `guards`, `deploy` and `live-check` green.
4. The Task 6 run's brief step lines are in the session record.
5. The Task 7 task exists and is named in the Status line.

## Outcome, 2026-11-15

One landing on `main`: `4b66f5d7`, `git merge --no-ff brief-hook` (parents `54d7cd74` and `d5ef64d0`), pushed 13:59:11Z (08:59 ET). Its tree is the tree `verify` ran on at `d5ef64d0` (both `306706b30003453dd42c9c058d17b4e4c7471bbd`). The branch's commits for this CC-CMD: `471dc3c3` (the self-test reproduces the 2026-11-14 collisions), `1e9176a2` (the evidence names every card the verdict looked at), `7bfaf77f` (the id join) and `6623066c` (`live-check` takes `brief_date`). `verify-full` 43716154931 scored `58e81d25cca8-9ac77ec85710` at 530 of 530 in 3,279 s. `verify` 43721275726 on the branch head `d5ef64d0` (the branch with `main` merged in) is green, all six jobs, in 5 min 57 s. On the landing, `verify` 43721845406 and `guards` 43721845434 are green, `deploy` 43722537255 is green on `4b66f5d7`, and `live-check` 43722647467, started by that deploy, is green.

One dispatch of `live-check` on `main` with `brief_date=2026-11-14`: run 43722817857 (created 14:09:41Z, success at 14:10:59Z, on `0cfc0ce2`, the landing plus two automation commits that change `STATUS.md`, `outbox/INDEX.md` and `outbox/axis-manifest-latest.json`).

| # | result | artifact |
|---|---|---|
| 1 | met: the self-test went `22/22`, `26/26`, `34/34` over the three stages; the join's checks, run first against a stub that held the substring predicate, read `28/34 checks passed` with 6 red | `outbox/brief-phase-card-identity-proof-2026-11-15.txt`, sections 2 to 5 |
| 2 | met: `caught 4 of 4`, `caught 6 of 6` and `caught 6 of 6` on the three stages, every anchor refused unless it occurs once; two wiring mutants (the loop back on the substring predicate, the page's id no longer read) each fail the end-to-end run; variant `idmismatch` is red on the one row with `NO CARD CARRIES THIS GAME'S ID` and the near-name card's id, exit 1 | the same file, sections 5 and Z |
| 3 | met: 530/530 against a bar of 95; `verify` on the branch head, and `verify`, `guards`, `deploy` and `live-check` on the landing, green | `docs/confidence-log.jsonl`, run `58e81d25cca8-9ac77ec85710`; the run ids above |
| 4 | met: `slate 2026-11-14 — 79 game(s), 365 brief(s), 79 card(s)`; `final games carrying BOTH ...: 42`; 42 rows, each `game_recap` expected and shown, none carrying `cards, duplicated upstream`, none marked `<--`; `PASS  every final game with both phases shows its after-play brief (42 testable)`; `checked 42 testable of 79 games`; the three old reds read `game_recap` | `outbox/cc-session-2026-11-15-brief-hook.md`, the step's lines verbatim |
| 5 | met: scheduled task `trig_01QL6mcB9jqiJPWyBPEXh9Sn`, fires 2026-11-22T01:30:00Z (20:30 ET Saturday 2026-11-21) | the Status line |

The `brief_date` input: the step's URL line was run with an unset, an empty, a set and two hostile values, `checked 5 of 5 values; 0 produced extra output`, and the form that interpolates the input into the command was flagged by the same test (section 6b of the proof file). On the real runner the `workflow_run` run 43722647467 printed `BRIEF_DATE:` empty and `slate 2026-11-15`, so the empty input leaves the URL as the page root; its brief step read `NOT OBSERVABLE` (a Sunday 09:07 ET slate of 27 games with none final carrying both phases), which is not a pass, and its other four checks passed.

Differences from the plan.

- Task 5. The scored commit is `58e81d25`, not the branch tip: the branch head differs from it by the guard fix `3aea19d0` (`verify-full` does not run that guard; `verify`'s `push-lands` job does), a two-line comment in the hook, three CC-CMDs and two outbox records, the gate's two recording commits and the merge of `main`. `main` had moved by eight commits that share one file with this change (`package.json`, one added script line on each side), so it was merged into the branch and `verify` ran on the combination before the landing. Task 5 and Done condition 3 above now say that.
- Task 7. The daily cron cannot be the Saturday beat: its runs are created 5.70 to 8.45 h after 03:37Z and render the next day's empty slate, so the brief step printed `NOT OBSERVABLE` in 18 of 20 and did not run in the other 2 (`outbox/live-check-schedule-sweep-2026-11-15.txt`). A scheduled task dispatches the run itself. The daily beat's own fix is filed as `docs/CC-CMD-2026-11-15-live-check-daily-beat-late.md` (FILED, not built: its recommended option changes what the daily beat renders, which the order for this work did not cover).
- Hook. `docs/CC-CMD-2026-11-15-hook-runs-the-workflow-guards.md` landed in the same merge; its Outcome has its own differences.

Not tested here. Task 6 replays a finished day: the partners that were in play when the 2026-11-14 reds happened now read `Final`, and the old matcher was not run on this same state, so the replay does not show it red. Saturday's evening run is the test with partners in play. The empty `brief_date` was observed on a `workflow_run` run and not on a `schedule` run; the next scheduled `live-check` is the first.

## What this does not establish (said before it is built)

- That the partner cards carried `game_live`. The failure text says a card in `matching` did and the own card did not. Which partner it was is deduced: in the 04:23Z run, `Alabama @ Vanderbilt` has one partner (`Troy @ South Alabama`); for `Michigan @ Oregon` the partner `Oregon St @ Boise St` is also the only card of its own passing row, so it is not during-play, which leaves `Washington @ Michigan St`; for `California @ Virginia` the partner `Kansas @ West Virginia` sits in a passing row of its own, which leaves `Stanford @ Virginia Tech`. The evidence print is what will say it.
- That the fix would have been green on Saturday's data in Saturday's state. Task 6 runs the same day later, with the relay's rows finalised; Task 7 is the run in an evening's state, with partners in play.
- That every testable game's card carries its payload id. Measured on the 16 red rows (16 of 16). A game whose id is on no card takes the no-card branch, which already fails the row and prints the near-name list (`wrong.push`, then the final check), so a mismatch elsewhere is red in Task 6's table and not a pass.
- That the relay still carries both phases for 2026-11-14. The payload answered 200 with 339,314 bytes; the count of testable games is what Task 6 prints. `NOT OBSERVABLE` there means the proof has not run, and the dispatch is repeated with another day.
- Anything about the relay's duplicated fixtures (counted and reported by the NOTE block, unchanged) or about why a `Final` card can carry `game_live` (a final game with only the during-play brief is not a testable row).

## Not in scope

`scripts/render-check.mjs`; the relay; `verdictForCards`'s label; wiring this self-test into `verify.yml` (it runs in `live-check` on every deploy and daily; moving it earlier is a separate decision).
