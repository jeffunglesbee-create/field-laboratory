# Session record: the brief-phase check joins cards by game id, and the pre-commit hook runs the two workflow-YAML guards — 2026-11-15

Session doc (Rule 67) for `docs/CC-CMD-2026-11-15-brief-phase-card-identity.md` and `docs/CC-CMD-2026-11-15-hook-runs-the-workflow-guards.md`, commissioned by the owner's word "Brief and hook" (Sunday 2026-11-15, 06:53 ET). The premise record is `outbox/brief-hook-premises-2026-11-15.txt`. The proofs are `outbox/brief-phase-card-identity-proof-2026-11-15.txt`, `outbox/hook-runs-the-workflow-guards-proof-2026-11-15.txt` and `outbox/push-lands-pyyaml-message-2026-11-15.txt`. The daily-beat measurement is `outbox/live-check-schedule-sweep-2026-11-15.txt`.

**State:** both CC-CMDs are DONE and landed on `main` as `4b66f5d7` at 13:59:11Z (08:59 ET), a merge of `brief-hook`. The scored `verify-full` passed 530 of 530 (3,279 s, ledger id `58e81d25cca8-9ac77ec85710`). `verify`, `guards`, `deploy` and `live-check` are green on the landing. The Task 6 replay passed on 42 testable of 79 games. One check has not run yet: scheduled task `trig_01QL6mcB9jqiJPWyBPEXh9Sn` dispatches `live-check` at 20:30 ET on Saturday 2026-11-21. A third CC-CMD, the daily beat's (`docs/CC-CMD-2026-11-15-live-check-daily-beat-late.md`), is FILED and not built.

## HEAD progression

Times are ET. The gate's recording commits are stamped in UTC by the runner.

| HEAD | what it is | scored or read by |
|---|---|---|
| `4799ab1c` | `main` at the start (committed 11:07:54Z, 06:07 ET): the branch's merge-base | |
| `410fbd80` | the two CC-CMDs and the premise record, 07:16 | |
| `1b4459d9` | the apt-mirror CC-CMD points at both, 07:17 | |
| `471dc3c3`, `1e9176a2`, `7bfaf77f` | the brief check: the self-test reproduces the 2026-11-14 collisions; the evidence names every card the verdict looked at; the id join, 07:23 to 07:28 | the proof file, sections 2 to 5 |
| `6623066c` | `live-check` takes an optional `brief_date`, 07:31 | the proof file, section 6 |
| `58e81d25` | the hook runs the two guards, 07:52 | `verify-full` 43716154931 (dispatched 07:53, 530 of 530); `verify` 43716157241, green |
| `3aea19d0` | `check-push-lands.py` says what to install when PyYAML is missing, 08:02 | |
| `80f99a70` | the brief CC-CMD set IN PROGRESS, 08:03 | `verify` 43717095894, dispatched on this head, green |
| `1c612af3` | Task 7 dispatches its own Saturday-evening run, 08:07 | |
| `b8b43f07` | the daily-beat finding filed with its measurement, 08:18 | |
| `17dc13a2`, `49073cfd` | the scored gate's two recording commits (author `field-laboratory`, each carrying the skip directive), 08:49 | |
| `d5ef64d0` | `main` merged into the branch, 08:51: eight commits, one file in common (`package.json`) | `verify` 43721275726: 6 of 6 jobs green, 5 min 57 s |
| `4b66f5d7` | the landing: `git merge --no-ff brief-hook` (parents `54d7cd74` and `d5ef64d0`), pushed 13:59:11Z (08:59) | `verify` 43721845406 and `guards` 43721845434 green; `deploy` 43722537255 green; `live-check` 43722647467 green |
| `2ee8e120`, `0cfc0ce2` | a status refresh and a probe record (author `Claude`), pushed after the landing | `live-check` 43722817857, the Task 6 dispatch, ran on `0cfc0ce2` |
| `fa0926f4`, `99894360` | the two CC-CMDs' Status and Outcome, committed 09:14 and 09:15; the first push was rejected because `main` had moved (`8720eebc`, a status refresh), so they were rebased onto it | the docs guards and the pre-commit hook |
| this commit | this record; `docs/` and `outbox/` only, so `verify` does not run on it | the pre-commit hook |

## What each commit did

- `410fbd80`, `1b4459d9`: filed the two CC-CMDs after one command had tried to refute each premise, and pointed the apt-mirror CC-CMD at them. A premise that failed there changed the design: the hook runs on every commit and not when a workflow file is staged.
- `471dc3c3`: the self-test gained the 2026-11-14 slate (three red games, each with a card of another game inside the substring match). Its characterisation checks pass against the old predicate by design; the mutation run is `caught 4 of 4`.
- `1e9176a2`: `evidenceLines` prints every card the verdict looked at, with its id, team line, status and kind (`26/26`, `caught 6 of 6`).
- `7bfaf77f`: `cardsForGame` joins by the card's `data-game-id` equal to the game's `id`. The join's checks were written first against a stub holding the substring predicate (`28/34`, 6 red), then green (`34/34`, `caught 6 of 6`).
- `6623066c`: `live-check.yml`'s `workflow_dispatch` takes `brief_date`, mapped to `?date=` by one shell expansion (`${BRIEF_DATE:+?date=$BRIEF_DATE}`) that never interpolates the input into the command.
- `58e81d25`: `.githooks/pre-commit` runs `check:browser-gate` and `check:push-lands` on every commit (12 `npm run` lines, from 10); `package.json` gains `check:push-lands`.
- `3aea19d0`: `check-push-lands.py` names PyYAML and exits 1 when it cannot import it, as the browser guard does; the hook comment says so.
- `80f99a70`, `1c612af3`, `b8b43f07`: CC-CMD text. The last files the daily-beat finding.
- `d5ef64d0`, `4b66f5d7`: the merge of `main` into the branch, and the landing.
- `fa0926f4`, `99894360`: the Status and Outcome of both CC-CMDs; Task 5 and Done condition 3 of the brief CC-CMD now say the scored commit is not the branch tip.

## Verified end to end

1. **The brief check on the real deployed page.** `live-check` 43722817857, dispatched on `main` with `brief_date=2026-11-14` (created 14:09:41Z, success 14:10:59Z, on `0cfc0ce2`): `slate 2026-11-14 — 79 game(s), 365 brief(s), 79 card(s)`; `final games carrying BOTH ...: 42`; 42 rows, each `game_recap` expected and shown; none carrying `cards, duplicated upstream`; none marked `<--`; `PASS  every final game with both phases shows its after-play brief (42 testable)`; `5/5 checks passed`. `checked 42 testable of 79 games`. The three games that were red on 2026-11-14 (`Alabama @ Vanderbilt`, `Michigan @ Oregon`, `California @ Virginia`) read `game_recap` on their own card. The step's lines are in Appendix A, read from the job log over REST by `gh api` (the sandbox cannot reach the page).
2. **An empty `brief_date` on a real non-dispatch run.** `live-check` 43722647467, started by the landing's `deploy` (event `workflow_run`): the step's env printed `BRIEF_DATE:` empty and the slate line printed `slate 2026-11-15 — 27 game(s), 268 brief(s), 27 card(s)`, so the empty input leaves the URL as the page root. Its brief step read `NOT OBSERVABLE` (nothing final carried both phases on a Sunday 09:07 ET slate), which is not a pass; its other four checks passed.
3. **The hook, on real commits.** `b8b43f07`'s commit ran it in 47.153 s and ended `OK: all 26 push-retry loop(s) verify that the push landed.`; the hook run by hand on the merged tree `d5ef64d0` took 46.7 s, exit 0, `verdict: gated` and the same OK line. Before and after the change, on a scratch worktree, `outbox/hook-runs-the-workflow-guards-proof-2026-11-15.txt` shows the exit codes `0 0 0` (the gap) and `0 1 1`.
4. **The gates.** `verify-full` 43716154931 on `58e81d25`: 530 of 530, 3,279 s, `failing=[]`, `skipped=[]` (`docs/confidence-log.jsonl`, id `58e81d25cca8-9ac77ec85710`; `dirty` is `true` there as in the 7 entries before it). The landing's tree is `306706b30003453dd42c9c058d17b4e4c7471bbd`, the same as the tree `verify` ran on at `d5ef64d0`.

**Not end to end, with its unblock (Rule 74).** The id join in an evening's state, with partners still in play, is not shown. Blocked by: no such slate until a Saturday evening, and the replay in item 1 ran after the relay finalised the day. Unblocked when: scheduled task `trig_01QL6mcB9jqiJPWyBPEXh9Sn` fires at 2026-11-22T01:30:00Z (20:30 ET, Saturday 2026-11-21). Verify: `gh workflow run live-check.yml --ref main`, then read the brief step with `gh api repos/jeffunglesbee-create/field-laboratory/actions/jobs/<job id>/logs`; the expected line is `PASS  every final game with both phases shows its after-play brief (N testable)` with N at 1 or more. The task writes `outbox/brief-first-saturday-2026-11-21.md`.

## Observed on the way

Documented and not changed (Rule 69).

- `live-check` 43712367007, a `workflow_run` run on `8f9ba58e` at 12:09:04Z, failed at the step `The deploy landed (published is the newest deployable commit)`; the next run, 43713180186 (12:18:40Z, on `7ab97934`), succeeded. That is the same failing step as the two scheduled runs that printed no brief lines (`outbox/live-check-schedule-sweep-2026-11-15.txt`). Its cause was not investigated: it is not this work, and nothing here depends on it.
- `verdictForCards` keeps its `duplicated upstream` label, which is now reachable only when one id is on two cards. The brief CC-CMD names it as noted and not changed.
- The brief self-test (34 checks) runs in `live-check` after a deploy and daily, not in `verify.yml` and not in the mutation table. The brief CC-CMD lists moving it as not in scope and as a separate decision for the owner; it would add its seconds to `verify`, which was about three quarters of the Actions spend as of 2026-08-16 (`CLAUDE.md`).
- The daily `live-check` beat did not observe the brief rule in 20 of 20 runs. Filed with its measurement as `docs/CC-CMD-2026-11-15-live-check-daily-beat-late.md`.

## Done conditions

Both CC-CMDs' conditions are met, each with its artifact in that CC-CMD's Outcome: five for the brief-phase CC-CMD, five for the hook CC-CMD. One part of the hook CC-CMD's condition 3 is met by inference and not by kept output: the hook output of `58e81d25`, `3aea19d0`, `80f99a70` and `1c612af3` was not kept (the Outcome gives the three facts it rests on).

## What was wrong, and what it cost

- The hook proof's timing was first typed ("42 to 45 s") and did not match the printed runs (43.9 to 45.3 s before, 47.2 to 48.0 s after). The assembler now computes the range from the elapsed lines. Cost: one re-assembly.
- Two claims in the hook CC-CMD, "about 38 s" and "one second before conan", were in no artifact and were withdrawn. The hook's timing now comes from the proof file's elapsed lines, and the PyYAML row carries only recorded facts and says that what put the system copy there is not established.
- Design 3 of the hook CC-CMD assumed every guard says what to install when PyYAML is missing. One command (`python3 -S` on each guard) refuted it for `check-push-lands.py`. Fixed by Task 2b, red first, 3 of 3 mutants caught.
- The brief CC-CMD's Task 7 named the 03:37Z cron as the Saturday-evening beat. Measuring the 20 scheduled runs refuted it (5.70 to 8.45 h late, next-day slate). Task 7 was rewritten to a scheduled task that dispatches its own run.
- An inference that two scheduled runs "failed earlier in the job" was checked against their logs before it went into a document: both failed at step 9 and skipped the brief step.
- `git rev-parse --short HEAD origin/brief-hook` failed ("Needed a single revision") and stopped an `&&` chain before two dispatches; the dispatches were re-run separately. No run was dispatched on a wrong ref.
- The first push of the two closing commits was rejected: `main` had moved (`8720eebc`). They were rebased and pushed with a landing check (`HEAD` an ancestor of `origin/main`), which is why their hashes in the log differ from the first commit output.
- The Task 6 run started on `0cfc0ce2` and not on the landing `4b66f5d7`, because two automation commits reached `main` in between. They change `STATUS.md`, `outbox/INDEX.md` and `outbox/axis-manifest-latest.json` only, so the script and workflow it ran are the landing's.

## Not established

- Whether a fresh cloud session has PyYAML. Here it was present in two copies older than this container's boot, and neither `scripts/install_pkgs.sh` nor `docs/SETUP-SCRIPT.md` installs it. A box without it stops the commit with the install line.
- That the partner cards carried `game_live` on 2026-11-14. Which partner it was was deduced from the passing rows; the evidence print will say it on a red row.
- Whether the old matcher is red on the replayed state. It was not run on it.
- The empty `brief_date` on a `schedule` event. It was observed on `workflow_run`; the next scheduled `live-check`, created between 09:18Z and 12:03Z on 2026-11-16 if the measured delay holds, is the first.
- The id join in an evening's state: see the unblock above.

## Residual

Genuine residual only. The daily beat's CC-CMD is FILED and waits for the owner's word on its option B (about 45 minutes). The Saturday check is a scheduled task, not a note. Nothing else is deferred.

## Appendix A: the Task 6 brief step, verbatim

Run 43722817857, job 132838271631, read from the job log. The `BRIEF_DATE` env line first, then the step's output from the self-test's last line to the last check.

```
  BRIEF_DATE: 2026-11-14
...
34/34 checks passed

  slate 2026-11-14 — 79 game(s), 365 brief(s), 79 card(s)
  final games carrying BOTH a during-play and an after-play brief: 42

  game                                    expected      shown
  Nuggets @ Pelicans                      game_recap    game_recap
  Kraken @ Hurricanes                     game_recap    game_recap
  Jets @ Blackhawks                       game_recap    game_recap
  Oilers @ Maple Leafs                    game_recap    game_recap
  Flyers @ Blue Jackets                   game_recap    game_recap
  Panthers @ Blues                        game_recap    game_recap
  Duke @ Miami                            game_recap    game_recap
  Wake Forest @ SMU                       game_recap    game_recap
  Northwestern @ Ohio State               game_recap    game_recap
  Cincinnati @ Iowa State                 game_recap    game_recap
  Syracuse @ NC State                     game_recap    game_recap
  Wisconsin @ Maryland                    game_recap    game_recap
  James Madison @ UConn                   game_recap    game_recap
  Georgia Tech @ Clemson                  game_recap    game_recap
  Nebraska @ Rutgers                      game_recap    game_recap
  Alabama @ Vanderbilt                    game_recap    game_recap
  East Carolina @ Charlotte               game_recap    game_recap
  UAB @ Temple                            game_recap    game_recap
  Arkansas St @ Coastal                   game_recap    game_recap
  Kansas St @ TCU                         game_recap    game_recap
  Kennesaw St @ Sam Houston               game_recap    game_recap
  Tennessee @ Texas A&M                   game_recap    game_recap
  New Mexico St @ Missouri St             game_recap    game_recap
  FIU @ Delaware                          game_recap    game_recap
  Missouri @ Georgia                      game_recap    game_recap
  Boston College @ Notre Dame             game_recap    game_recap
  USC @ Indiana                           game_recap    game_recap
  Michigan @ Oregon                       game_recap    game_recap
  California @ Virginia                   game_recap    game_recap
  Nevada @ N Illinois                     game_recap    game_recap
  GA Southern @ Georgia St                game_recap    game_recap
  Jax State @ Western KY                  game_recap    game_recap
  MTSU @ Liberty                          game_recap    game_recap
  Kansas @ West Virginia                  game_recap    game_recap
  Fresno St @ Texas St                    game_recap    game_recap
  Auburn @ Mississippi St                 game_recap    game_recap
  Tulane @ Rice                           game_recap    game_recap
  Southern Miss @ Louisiana Tech          game_recap    game_recap
  Arizona St @ UCF                        game_recap    game_recap
  Oregon St @ Boise St                    game_recap    game_recap
  App State @ Marshall                    game_recap    game_recap
  Florida @ Kentucky                      game_recap    game_recap

  NOTE: 1 fixture(s) appear more than once in the payload under
  different naming conventions: espn:golf_401850980 → R2 @ Austin Championship pres. by Compliance Solutions (final) | R3 @ Austin Championship pres. by Compliance Solutions (final) x2
  Relay-side. Counted, not asserted on.

PASS  the page reports a real viewed date, not a pinned capture
PASS  the deployed page rendered cards at all
PASS  the page logged no errors while rendering
PASS  the relay served /context/date/2026-11-14
PASS  every final game with both phases shows its after-play brief (42 testable)

5/5 checks passed
```
