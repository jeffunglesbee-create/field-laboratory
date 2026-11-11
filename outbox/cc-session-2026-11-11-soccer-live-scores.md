# Session record: soccer live scores (CC-CMD-2026-11-11-soccer-live-scores), Rule 67

Written 2026-11-11 ~17:25Z on branch `live-scores-t3`, which is LOCAL and NOT on `main`. Updated at landing (Task 9) and at the close-out
(Task 12 outbox manifest). `docs/CC-CMD-2026-11-11-soccer-live-scores.md` is the specification; this is what was done to it.

## HEAD progression

| point | where | what |
|---|---|---|
| start | `main` `f4b6103` | the lab read the archive only; no timer, no live score |
| capture landed | `main` `73810062`, hardened at `4210c884` | Task 1: `scripts/live-shape-capture.mjs` and its workflow, armed for 2026-11-11 19:10Z to 21:30Z (scored runs 42976692358 and 42984193625, 530/530) |
| stack | `live-scores-t3` | 29 non-merge commits on `main` `1eb5177`, plus two merges of `main` (the second, `2f9baa5`, brings in `main` `4775e9b`) |

## What the stack contains (commit order)

Tasks 3 and 4: `1cd0d1f` Stats gate (a soccer match in progress has no comeback line); `5a1f98b` a started row with no score reads `Start time passed, no score served`.
Task 6, the pure half and the card: `067c6b2` `LiveScore.fs`; `385af29` the card handle; `f414386` the real-card render check; `a4412cf` `LiveFeed.fs` (decode, join by ESPN event id).
Task 7, the poll: `7354826` the poll region and `scripts/check-live-score-poll.mjs`.
Task 8, the probe: `8ab827b`, reworked in `940f226` and `89b077b`.
Review fixes: `88abf10` memo staleness; `9404a71` CSS for the live note; `560cf70`, `f5e2719` claim corrections; `597efb3`, `e3e4497`, `f334d38`, `61a9515`, `5415065` the first review of the poll, decoder and wiring (25 held findings: 22 fixed, 3 are owner questions in the CC-CMD);
`ec9f68a`, `e4f3dbf`, `6e66d02`, `f55e973`, `b557bdb`, `6fbc369` the second review, of those fixes (24 findings, all handled; `outbox/live-score-fix-review-2026-11-11.md`).
Docs and a separate concern that rides the stack: `cc670d0`, `4033cf5`, `3bda750` the follow-up CC-CMDs (other sports, the relay's BSD cache, the tabs); `1f4a346` the drift sentinel's closing-odds predicate (EFL Trophy and FA Cup are never priced; D1 measured), to be proved on the sentinel's first run after landing.

## Verified

Local, at the merged tip `2f9baa5`, 2026-11-11: Suite 457/457; `live-score-render-check` 58/58 (three consecutive runs); `check-live-score-poll` 16/16, self-test 36/36;
`live-score-probe --self-test` 56/56, `--e2e` 11/11, `check-forecast-pull-only` 22/22; `check-live-probe-keys` 61/61 (40 bodies through the page's decoder and the probe's); mutation anchors 1419 checked, 0 stale.
Rule 90: every new check was shown to fail on purpose. The 161 `live-*`, `poll-*` and `feed-*` mutation entries were run together on `6fbc369`: baseline and all 161 caught (162/162). The reviewers also reproduced each gap
on scratch copies before the fix.
Two adversarial reviews (`wf_584a08a5-824`, `wf_ae397945-0b8`) found no defect in the shipped behaviour of the second; they found coverage gaps, one dead branch and false prose, all corrected.
Behaviour decided in the fixes: a score is a whole number from 0 (a negative is refused; the only negative scores in `data/` are golf archive rows).

## STAGED, not verified (Rule 74)

- **Nothing has run against a real match.** No body of a game in play has been captured as of this writing; the live shape is inferred from `adaptESPNWCSoccer`. The capture arms 19:10Z to 21:30Z tonight (efltrophy, 2 matches).
  Unblocked when a capture file shows `feedShapeSeen: true`. Verify: `node -e` over `outbox/live-capture-efltrophy-2026-11-11-*.json` for a game with `state: "live"`, integer scores and a non-empty `clock`.
- **The deployed-page proof (CC-CMD Done condition).** Blocked by: the stack is not on `main`. Unblocked when it lands and a lab-covered match is live (first chance 2026-11-17 19:00Z, EFL Trophy).
  Verify: `node scripts/live-score-probe.mjs --date <ET day>` returns `doneCondition: true` and `scoreMatchesFeed: true`.
- **Whether ESPN's `final` precedes the archive's finalisation** (the `Full time` window): sampled by the 20:50Z to 21:30Z captures; the 3 h poll window against extra time is owner question 3.

## Integration state (Rule 65)

RELAY CONTRACT: `GET /v2/games?sport=<key>&date=<ET day>`; `espnEventId` (string), `state` (`pre`|`live`|`final`), `home.score`/`away.score` (number or null), `clock` (string). Relay untouched.
Task 5 (relay `CONTRACTS.md`, docs-only, relay first) is NOT done; it waits for the real body.
CLIENT CONSUMER: `LiveFeed.decodeFeed`, `LiveFeed.readingFor`, `LiveScore.foldReading`, the poll region of `src/Program.fs`, the card in `src/Scoreboard.fs`.
INTEGRATION STATUS: UNTESTED against a real feed; mocked-relay render scenarios and the probe's end-to-end mode only.
KNOWN MISMATCHES: none known; the relay's real live body is the unknown.

## Carry-forwards

None deferred without a CC-CMD. In this CC-CMD and not done: Tasks 2 (artifact absent), 5, 9 (scored gate and landing), 10 (schedule the proofs), 12 (this record, finalised at close). Filed: `docs/CC-CMD-2026-11-11-live-scores-other-sports.md`,
`-v2-games-bsd-cache.md`, `-live-scores-tabs.md`. Owner questions (a reading's age, an immediate tick on re-render, the 3 h window against extra time) are in the CC-CMD.

## Incidents (Rule 77)

- Importing `scripts/mutation-check.mjs` to syntax-check it ran the harness and stranded an injected function in `src/Scoreboard.fs`; `node scripts/proof-check.mjs` healed it before anything was staged. Use `node --check`.
- Render-check mutation entries fail their baseline unless `PW_CHROMIUM` is exported in the same shell call (reproduced, not rationalised).
- A pushed branch whose files `main`'s docs cite turns `check:citations` red in CI (`git log --all`): `live-scores-t1` did, until it landed. The stack stays local until the captures are read.
- A stop hook asked for commit and push while the mutation harness had a mutation applied to `scripts/live-shape-capture.mjs`; nothing was committed from that state, and the tree was clean when the harness ended.
