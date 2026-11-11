# Claude Code Command — Pick'em and Stats read the live reading, so the tabs agree with the card

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-11 by CC, from the independent review of the live-score commits (findings semantics:F2 and rules:F1, both confirmed)
**Confidence gate:** `npm run gate` >= 95 before any commit (scored on a runner by `verify-full`)
**Status:** FILED 2026-11-11. Built after `docs/CC-CMD-2026-11-11-soccer-live-scores.md` Task 9 lands, because it reads the handle and the poll that task ships. Nothing here is built.

## What is wrong, measured

The live reading is folded into a game's state in ONE place: `Scoreboard.render`'s private `shown` memo (`LiveScore.foldReading`). Pick'em and Stats call `gameState game` on the archive row and never see a reading (`git grep -n gameState -- src`: `PickemView.fs:115`, `StatsView.fs:80`, `StatsView.fs:180`). So for the minutes a match is in play the desk card says `In progress` and the score, and the Pick'em chip for a pick on that game says `PENDING`, not `LIVE`, and the banner counts it as pending. Before the live-score work both read `Scheduled`, so they agreed, wrongly; now they disagree. The first design wording ("the card, Stats and Pick'em keep agreeing") described the intent, not what was built; it is corrected in `LiveScore.fs` and in the live-scores CC-CMD.

What is NOT wrong: Pick'em never grades from a reading. `Final` is what grades a pick, and a reading never makes a game `Final` (`LiveScore.foldReading`, pinned by the Suite), so no pick is scored from an in-play score.

## Rulings this must not undo

- Ruling 2(b) of 2026-10-16 and ADR-002: `Final` comes only from the archive. A reading may make a game `InProgress`; it may never make it `Final` or open the amnesty zone.
- The owner's second ruling of 2026-11-11: the card stays `In progress` with a `Full time` marker between ESPN's `final` and the archive's. The chip and the Stats line say `LIVE` / in progress in that interval too, never `Final`.
- No push or notification of a score (ADR-002 Rule A).

## Tasks

1. **Probe first.** `git grep -n 'gameState\b' -- src` and read `PickemView.fs`, `StatsView.fs`, `Pickem.statusOf`. **Artifact:** `outbox/live-scores-tabs-probe-2026-11-11.txt` listing every call site, its file and line, and whether it renders from a re-run `start()` or from a Solid signal (the answer decides how a reading reaches it).
2. **One reading per game, one place.** A store keyed by game id that `CardHandle.SetReading` writes and the two views read, so a reading is folded by one function in one module. **Artifact:** `git grep -n 'foldReading' -- src` shows the card, Pick'em and Stats each reading through the store and no other caller; a Suite case where the same reading gives the same `GameState` to all three.
3. **A render check.** A pinned page, a pick on an unscored EPL row, a `LiveNow(1, 0, 34')` reading: the card, the Pick'em chip and the Stats line all say in progress. **Artifact:** `scripts/live-score-tabs-render-check.mjs` with `--self-test`, a mutation entry for each of the two views that is caught, and the counterexample (the chip reading `PENDING` for the same reading) shown failing first.
4. **Outbox record.** Commit hash, the check outputs, and what was not run.

**Done condition:** `node scripts/live-score-tabs-render-check.mjs` exits 0 on the committed fixture, `git grep -n 'gameState ' -- src/PickemView.fs src/StatsView.fs` shows no read of the archive-only state where a reading exists, and a manifest from the deployed page during a real match shows the Pick'em chip `LIVE` while the card is `In progress` (the first chance is the first real in-play match after the live-scores CC-CMD ships).

## Not in scope

Other sports (`docs/CC-CMD-2026-11-11-live-scores-other-sports.md`), a relay change, and any grading from a reading.
