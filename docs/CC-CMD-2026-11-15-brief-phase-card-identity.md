# Claude Code Command — the brief-phase check fails a finished game on the card of another game: it finds a game's card by team-name substring, and `Alabama` is inside `South Alabama`

**Branch:** main — commit directly, do not create a feature branch or PR (a work branch is used only to run `verify-full`, and lands on `main` by merge with the run id in the message)
**Repo:** field-laboratory
**Filed:** 2026-11-15 by CC, on the owner's word ("Brief and hook", Sun 2026-11-15 06:53 ET), as the residual named in `outbox/cc-session-2026-11-14-tls-stage.md` ("A finished game shows the brief written after it finished" red in 6 of 6 renders since 2026-11-14 23:06Z)
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** IN PROGRESS 2026-11-15. The fix is built and proven on the work branch `brief-hook` and not landed; Tasks 6 and 7 (the runner replay of 2026-11-14 and the first Saturday-evening beat) run after landing. The premises below were tested before filing and are in `outbox/brief-hook-premises-2026-11-15.txt`.

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

The hook runs on every commit. `check:mutation-anchors`, `check:workflows`, `check:browser-gate` and the doc guards run locally. A scored `verify-full` on the branch at the tip, then a merge into `main` (`--no-ff`, the run id in the message), then `verify`, `guards`, `deploy` and `live-check` for the landing. **Artifact:** the run ids and `530 of 530`.

## Task 6 — the runner proof, in this session

After the landing, dispatch `live-check` on `main` with `brief_date=2026-11-14` and read the brief step's log by REST. The relay now serves that day finalised, so the old partners may all read `Final` by now; the proof is that the step's table has a row per testable game, each matched by its own id, no row carrying a card count unless one id is on two cards, and the verdict. If the step is red, its evidence names the card and the cause is investigated before anything is said about it (Rule 77): a red here would be a finding about the page, not about the matcher. **Artifact:** the step's lines in the session record, with `final games carrying BOTH ...: N`, N above 0.

## Task 7 — the follow-up is a task, not a note

A scheduled task reads the first Saturday-evening beat after the landing (`live-check` created after 2026-11-22T03:37Z): `checked N of M` rows, the verdict, and whether any row had a card count above 1. **Artifact:** the task's id in the Status line.

## Task 8 — the manifest is last

`outbox/cc-session-2026-11-15-brief-hook.md`: commit hashes, run ids, the premise results, what was verified end to end and what was not.

## Done conditions

1. The self-test passes with the new checks, and the Task 1 output exists showing them red against the old predicate.
2. The mutation run printed `caught K of K` with every anchor unique and applied.
3. `verify-full` on the tip at 530 of 530; the landing's `verify`, `guards`, `deploy` and `live-check` green.
4. The Task 6 run's brief step lines are in the session record.
5. The Task 7 task exists and is named in the Status line.

## What this does not establish (said before it is built)

- That the partner cards carried `game_live`. The failure text says a card in `matching` did and the own card did not. Which partner it was is deduced: in the 04:23Z run, `Alabama @ Vanderbilt` has one partner (`Troy @ South Alabama`); for `Michigan @ Oregon` the partner `Oregon St @ Boise St` is also the only card of its own passing row, so it is not during-play, which leaves `Washington @ Michigan St`; for `California @ Virginia` the partner `Kansas @ West Virginia` sits in a passing row of its own, which leaves `Stanford @ Virginia Tech`. The evidence print is what will say it.
- That the fix would have been green on Saturday's data in Saturday's state. Task 6 runs the same day later, with the relay's rows finalised.
- That every testable game's card carries its payload id. Measured on the 16 red rows (16 of 16). A game whose id is on no card takes the no-card branch, which already fails the row and prints the near-name list (`wrong.push`, then the final check), so a mismatch elsewhere is red in Task 6's table and not a pass.
- That the relay still carries both phases for 2026-11-14. The payload answered 200 with 339,314 bytes; the count of testable games is what Task 6 prints. `NOT OBSERVABLE` there means the proof has not run, and the dispatch is repeated with another day.
- Anything about the relay's duplicated fixtures (counted and reported by the NOTE block, unchanged) or about why a `Final` card can carry `game_live` (a final game with only the during-play brief is not a testable row).

## Not in scope

`scripts/render-check.mjs`; the relay; `verdictForCards`'s label; wiring this self-test into `verify.yml` (it runs in `live-check` on every deploy and daily; moving it earlier is a separate decision).
