# Session record: soccer live scores (CC-CMD-2026-11-11-soccer-live-scores), Rule 67

Written 2026-11-11 on branch `live-scores-t3`, landed on `main` at `f273009d` (pushed 23:40:13Z) and finished there the same night. The eight Task 10 proof
runs add their results to the CC-CMD as they happen (the schedule is below). `docs/CC-CMD-2026-11-11-soccer-live-scores.md` is the specification; this is what
was done to it.

## HEAD progression

| point | where | what |
|---|---|---|
| start | `main` `f4b6103` | the lab read the archive only; no timer, no live score |
| capture landed | `main` `73810062`, hardened at `4210c884` | Task 1: `scripts/live-shape-capture.mjs` and its workflow, armed for 2026-11-11 19:10Z to 21:30Z (scored runs 42976692358 and 42984193625, 530/530) |
| stack | `live-scores-t3` | 35 commits of its own on `main` `1eb5177`, plus five merges of `main` (`fa98285a` 09:31Z, `2f9baa58` 17:17Z, `86ec7073` 20:13Z, `0761db14` 21:40Z, `4c3f9541` 22:41Z) |
| relay, first | `field-relay-nba` `main` `331990b7` | Task 5: `CONTRACTS.md` gains the soccer `/v2/games` section (docs only; the relay's code did not change) |
| scored gate | `verify-full` run 43114034855 on `live-scores-t3` at `e1f5f28` | dispatched 22:42:46Z, success 23:30:21Z; 530/530, total 100, no failing row, 2779 s, ledger id `e1f5f28174e9-8c9db31ccd2a`; the run pushed two recording commits (`b5cf990f`, `bf510473`) back to the branch |
| landed | `main` `f273009d` | merge of `live-scores-t3`, authored 23:39:28Z, pushed 23:40:13Z, one conflict (below) |

## What the stack contains (commit order)

Tasks 3 and 4: `1cd0d1f0` Stats gate (a soccer match in progress has no comeback line); `5a1f98bb` a started row with no score reads `Start time passed, no score served`.
Task 6, the pure half and the card: `067c6b23` `LiveScore.fs`; `385af297` the card handle; `f4143868` the real-card render check; `a4412cf8` `LiveFeed.fs` (decode, join by ESPN event id).
Task 7, the poll: `73548267` the poll region of `src/Program.fs` and `scripts/check-live-score-poll.mjs`.
Task 8, the probe: `8ab827b2`, reworked in `940f2266` and `89b077b0`.
First review's fixes (`wf_584a08a5-824`, 25 held findings: 22 fixed, 3 findings that make 2 owner questions in the CC-CMD): `88abf105`, `9404a715`, `560cf70b`, `f5e27193`, `597efb3a`, `e3e44975`, `f334d386`, `61a9515a`, `54150652`.
Second review's fixes (`wf_ae397945-0b8`, 24 findings, all handled; `outbox/live-score-fix-review-2026-11-11.md`): `ec9f68a6`, `e4f3dbfc`, `6e66d024`, `f55e973b`, `b557bdbb`, `6fbc369d`.
Half time, after the owner's ruling and the first real half-time body: `cb7005e6` (`LiveScore.HalfTime`, `LiveFeed` reads `situation.isHalftime`, the note `Half time`; `outbox/live-score-half-time-2026-11-11.md`).
The real bodies of the evening's captures: `a4085c46` (the final body as Suite fixtures, the measured Full time gap; `outbox/live-score-real-bodies-2026-11-11.md`).
Third review's fixes (`wf_98b8ff4c-279`, 22 reported, 19 survived, none a defect in shipped behaviour; `outbox/live-score-round3-review-2026-11-11.md`): `3afe1c09`, `bc0f8616`.
The probe workflow's browser install, after main's new `workflow-check` flagged it: `e1f5f281`.
Follow-up CC-CMDs filed (Rule 87.4): `cc670d0b`, `4033cf5e`, `3bda750a` (other sports, the relay's BSD cache, the tabs).
A separate concern that rode the stack: `1f4a3464` the drift sentinel's closing-odds predicate (EFL Trophy and FA Cup are never priced; measured in D1; `outbox/drift-closing-odds-scope-2026-11-11.md`).
The session record's own draft: `63c2a956`. The gate's recording commits: `b5cf990f`, `bf510473`.

## Verified

Scored gate: `verify-full` run 43114034855, 530/530, at the tip that was merged (`e1f5f28`). It ran the whole mutation table in eight shards.
Authoring log of the local battery at `e1f5f28`: Suite 476; `live-score-render-check` 66; `live-score-probe --self-test` 64 and `--e2e` 11; `check-live-probe-keys` 84 (every committed soccer capture through both decoders, and the bodies); `check-live-score-poll` 16, self-test 36.
Read again on `main`'s tree at 23:43Z the same night: `check-live-score-poll` 16/16, its self-test 36/36, `live-score-probe --self-test` 64/64, `check:mutation-anchors` "checked 1442 of 1445 mutation anchors; 0 stale" (the three not checked have no file or find string; the harness skips them).
`check-live-probe-keys` needs the compiled F#; this clone's `build/` predates the stack and has no `LiveScore.js`, so it printed `ERR_MODULE_NOT_FOUND` there. Its CI steps on `f273009d` ("Decoders accept the real captures", "Decoders still REJECT the corrupted fixture") were `success` when read at 23:42Z.
Rule 90: every new check was shown to fail on purpose, in the entries of `scripts/mutation-check.mjs` named `live-*`, `poll-*`, `feed-*` and `live-probe-*`; at `6fbc369d` the 161 entries of those families all ran (162/162 with the baseline), and the entries added after it (half time, the third review's fixes) ran in the scored gate. The reviewers also reproduced each gap on a scratch copy before its fix.
Three adversarial reviews, all findings handled and recorded. None found a defect in the behaviour that shipped; they found coverage gaps, dead branches and false prose.
Real data against the assumptions (Rule 100): the live shape, the half-time flag, the final body and the archive's finalisation are all seen on the 2026-11-11 EFL Trophy captures (`outbox/live-capture-efltrophy-2026-11-11-{1918Z,1954Z,2059Z,2121Z}.json`; fact 3 and fact 5 of the CC-CMD). Behaviour decided from them: a score is a whole number from 0 (a negative is refused); the card says `Half time` while `situation.isHalftime` is true; a feed `final` is `Full time` on a card still `In progress` until the archive finalises, and never `Final` from a reading.
Task 2's premise, read from capture 1918Z (`joins[0].archive`): the archive row `EFL Trophy_2026-11-11_e401911177` exists, `home_score` null, `start_time` `2026-11-11T19:00Z`. Task 2's own file `outbox/live-premises-2026-11-11.json` was never written; the capture holds the same three fields.

## STAGED, not verified (Rule 74)

- **The deployed-page proof (CC-CMD Done condition).** Staged: a manifest from a real in-play match on the deployed page with `doneCondition` true. Blocked by: no lab-covered soccer match in play between the landing and 2026-11-17 19:00Z (the CC-CMD's first chance, EFL Trophy). Unblocked when: one of the eight scheduled runs below reads a live card. Verify: dispatch `live-score-probe.yml` on `main` with `date` = the ET day, read `outbox/live-score-manifest-<day>-*.json`; or `node scripts/live-score-probe.mjs --date <ET day>`; `doneCondition` must be true.
  Scheduled one-shot reminders into the authoring session (Task 10): 2026-11-17 19:35Z `trig_013WEqBogewJ52uEQc2wM5Rj`, 20:10Z `trig_01H6nvBhqraZry8xNZmkALGz`; 2026-11-20 00:50Z `trig_01NyeBtbZs5RHsgQcNduepvc` (ET 11-19), 19:55Z `trig_0195QtBS5NHCpt71steeT9BM`, 20:10Z `trig_019oiT3X7qUqiWiyhqdL8AGY`, 20:30Z `trig_01Ptdrr2rDZJnnLQZkrSSyGd`; 2026-11-21 12:50Z `trig_011YUvLCiHamv5nnq8cVMJFP` and 13:25Z `trig_01KEQLyBc15jBRT41ap74az1` (EPL, a confirmation and not a gate). Each reminder carries its own dispatch recipe. Reminders fired into a session were reliable on 2026-11-11; stored fresh-session routines were not (see Incidents), so no routine duplicates them.
- **The poll and the card on a real page.** The page's poll has run only against a mocked relay (the render check, 66 cases) and the probe's end-to-end mode; the decoders have run on the real bodies. Same unblock as above.
- **Not observed on any real body:** stoppage time of the second half while live, extra time and its break, a shootout. The flag clearing in the second half was seen once in a direct read at about 20:34Z (`periodNum` 2, clocks `74'`, `76'`, `isHalftime` false), which is not a committed capture.
- **The drift sentinel's closing-odds predicate (`1f4a3464`).** Staged until the sentinel's first run on `main` after this landing (it runs on `0 12 * * *` and `30 1 * * *`). Verify: that run's `CC-CMD-2026-08-21-closing-odds-capture` row is not REGRESSED on a day whose only soccer rows are EFL Trophy games.

## Integration state (Rule 65)

RELAY CONTRACT: `GET /v2/games?sport=<key>&date=<ET day>`; the fields the lab reads are `espnEventId` (string), `state` (`pre` | `live` | `final`), `home.score` / `away.score` (number or null), `clock` (string), `situation` (null, or an object, with `situation.isHalftime` a boolean). Recorded in `field-relay-nba` `CONTRACTS.md` at `main` `331990b7`. The relay's code did not change.
CLIENT CONSUMER: `LiveFeed.decodeFeed`, `LiveFeed.readingFor`, `LiveScore.foldReading`, `LiveScore.liveNoteText`, the poll region of `src/Program.fs`, the card in `src/Scoreboard.fs`; the probe keeps its own JS copy of the decoder (`scripts/live-score-probe.mjs`), which `scripts/check-live-probe-keys.mjs` holds to the page's.
INTEGRATION STATUS: relay to decoder VERIFIED on four real captures of one evening (two EFL Trophy games, live, half time, final with the archive unscored, final with it scored). Decoder to card VERIFIED on the real bodies in the Suite and on a mocked relay in the render check. The deployed page at real time is STAGED (above).
KNOWN MISMATCHES: none known. The relay's BSD enrichment can give any game it matches `{ elapsed }` as `situation`, whatever its state; the lab reads that as flag absent, so false.

## Carry-forwards

None deferred without a CC-CMD. In the CC-CMD: the two owner questions (a reading's age against the 3 h window and extra time; an immediate tick on re-render), the eight scheduled proof runs, and the three filed follow-ups (`docs/CC-CMD-2026-11-11-live-scores-other-sports.md`, `-v2-games-bsd-cache.md`, `-live-scores-tabs.md`). The remote branch `live-scores-t3` still exists on `origin` and is fully merged into `main`; earlier attempts to delete a remote branch from the authoring sandbox ended in a send-pack disconnect.

## Incidents (Rule 77)

- **Pushing `live-scores-t3` turned `main`'s `verify` red (22:48Z to 23:06Z).** `check:citations` counts a file that main's docs cite and that exists only on a pushed branch as "deleted here" through `git log --all`: four paths against a budget of 1 (the standing `scripts/chrome-check.mjs` and three live-score scripts the CC-CMD cites). `deploy` skips a red `verify`, so nothing published meanwhile. This was E1 of `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md`, its second occurrence, and foreseeable: the check I made before pushing looked for deletions on the branch, the wrong direction. The pre-push check for a branch is: fetch all remote refs, list the paths that `main`'s docs cite which are absent from `main`'s tree but present on the branch, and run `npm run check:citations` with them cited. Fixed by `cad1b7d1` on `main` (the CC-CMD names the scripts without their paths until the files arrive), the other session fixed its own row in `4705fdb`; at landing the branch's text (with the paths) won the single conflict because the files arrived in the same merge, and `check:citations` on the merge result read 1 of 1 deleted-here, 0 of 0 bare.
- Importing `scripts/mutation-check.mjs` to syntax-check it ran the harness and stranded an injected function in `src/Scoreboard.fs`; `node scripts/proof-check.mjs` healed it before anything was staged. Use `node --check`.
- Render-check mutation entries fail their baseline unless `PW_CHROMIUM` is exported in the same shell call (reproduced, not rationalised).
- A stop hook asked for a commit and push while the mutation harness had a mutation applied to `scripts/live-shape-capture.mjs`; nothing was committed from that state, and the tree was clean when the harness ended.
- Capture scheduling: the stored routines for 19:10Z, 19:45Z, 20:20Z, 20:50Z, 21:00Z and 21:12Z committed no capture, and a run dispatched at 20:28:44Z (43096288444) ended `startup_failure` after 9 minutes queued (GitHub-side; no job ran). The four captures that exist were made at 19:18:54Z, 19:54:02Z, 20:59:30Z and 21:21:25Z. The 21:30Z routine ran and committed nothing, so the CC-CMD's "Task 1 result" section was written by hand.
- `main`'s new `workflow-check` flagged the probe workflow's `--with-deps` browser install (apt, no step limit): fixed in `e1f5f281`.
- A shell safety check refused a heavily quoted inline `node -e` as an unparseable `rm`; the script went into a file instead.
- Several multi-edit substitution scripts stopped partway on a failed assertion (a multi-line comment, a wrong occurrence count); each remaining edit was re-run on its own with its count checked.
- My own prose errors, corrected in the notes where they were written: "both skeptics read the handler", "61 bodies", "3 not checked are self-test-only".
