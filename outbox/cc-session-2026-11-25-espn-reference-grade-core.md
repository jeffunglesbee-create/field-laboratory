# CC session 2026-11-25 — the ESPN reference grade's pure core (Task 1 of the independent-reference CC-CMD, laboratory half)

**Task:** the owner's "Build task 1" (2026-11-25), `docs/CC-CMD-2026-11-23-bsd-next-goal-independent-reference.md`. **Not run:** Tasks 2 to 4 (one targeted review, the run, the record) are not started.

## What was built (field-laboratory, `main`)

- `scripts/espn-reference-grade-core.mjs` — PURE (imports nothing, reads nothing, returns counts): `timelineOf` reads ESPN's goal rows (`scoringPlay` true, `shootout` not true, a team that is a competitor, a clock `M'` or `M'+A'`; the goal count must equal ESPN's final score and the sides must add up to it, else a named reason, never a repair), `bsdSidesOf` reads the first grade's parsed capture as sides, `gradeAgainstEspn` grades each call (the (k+1)th ESPN goal's side against the call's side; ESPN's score before it must equal `score_at_call`; the capture's full-time score must equal ESPN's; ties and ambiguous own goals are not applicable) and counts step A (ESPN against BSD: goals in number, in order, in minute) and E3 (own goals) once per match, and `coverageLine`.
- **Own goals are not assumed.** Task 0 saw none, so ESPN's convention for whose `team.id` an own goal carries was unknown. A match's convention is the one that reproduces ESPN's own final score ('opposite', 'same', or 'ambiguous' when both fit, in which case the goal's side is never guessed); which convention fits is tallied, and the E3 table (the ESPN own-goal row's team against the side the capture credits) is counted in step A. One real own goal turned up in the old-date probe (EPL 2026-08-30), so the data will say.
- `scripts/check-espn-reference-grade-core.mjs` — 84 assertions on synthetic ESPN-shaped payloads written from what Task 0 and the anchored probes recorded (`clock.value` is seconds and stays 5400 through stoppage time, so the displayed `90'+2'` orders goals, not the value). `scripts/mutate-espn-reference-grade-core.mjs` — **78 of 78 mutants caught**, controls ok. Its first run caught 68 of 83: 5 survivors were equivalent by an identity (documented in the harness header), 10 were real gaps in my check and are closed.

## Found on the way (field-relay-nba probes, run 2026-11-25)

The Task 0 ESPN probe now takes `ANCHOR_DATE`. Anchored at 2026-08-30: all 7 leagues with a finished match (EPL, MLS, EFL Championship, La Liga, Serie A, Bundesliga, Ligue 1) still carry full goal rows for August matches in all three lists, with team ids, clocks and counts equal to the final score. **E1 holds for old matches.** Anchored at 2026-10-02: no finished match for the Champions League or Europa in the ten days read, so E1 for them stays untested; they are not reachable in the grade today (no archive row carries a BSD id), so they are not graded either.

## Not verified

The core has only met synthetic payloads; the runner (relay half) is next and will meet real ones. ESPN's own-goal convention (E3) is unmeasured until the run. `clock.displayValue` formats other than `M'` and `M'+A'` (a clock the probe did not sample) make a goal row unreadable and the match not applicable: counted, never repaired.

## Update, 2026-11-25: the relay half is built

The runner, its run check (3 scenarios, 49 assertions, real laboratory cores against stub BSD, relay and ESPN servers), its mutation harness (50 of 50 caught) and the dispatch-only workflow are in field-relay-nba (`6d23457`, `431c0cc`; the lib additions `92718a8`). The workflow has not been dispatched. Record and the open items: this repository's `docs/CC-CMD-2026-11-23-bsd-next-goal-independent-reference.md`, section "Task 1 built"; relay session doc `outbox/cc-session-2026-11-25-espn-reference-grade-runner.md`.
