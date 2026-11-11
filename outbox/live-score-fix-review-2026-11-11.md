# Live scores: the review of the fixes (workflow wf_ae397945-0b8), 2026-11-11

Four lenses (poll runtime, decoder against the relay, card and documentation accuracy, defensibility), two skeptics per finding, over
commits fa98285..5415065 on `live-scores-t3` (local, not on main). 26 findings reported, 24 survived both skeptics, 2 were refuted.

None of the 24 is a defect in the code at HEAD: every skeptic who ran the scenario on a scratch copy found the shipped behaviour correct.
They are of three kinds: a branch of the shipped code that no check fails on (Rule 90), a branch that can never run (Rule 63), and prose
that says more than the code does or than was measured (Rule 73). Each fix below carries the mutation that shows its check can fail.

## C1. The lower bound of the poll window (review defence F18, F19)

`pollableAt` and `answersTo` both reach `inLiveWindowAt`, whose lower bound (`now >= start`) was defended only by mutations of
`inLiveWindowAt` itself. A caller that tested only the END of the window (`now <= start + 3 h`) passed every check:

- `pollableAt` that way: a viewer who opens the page at 08:00Z on a 12:30Z matchday asks the relay for the league once a minute for
  4.5 hours before kickoff (about 270 requests per viewer per key, each one an uncached BSD call). The cards look right throughout,
  because `answersTo` still refuses them.
- `answersTo` that way: a relay failure at 12:45Z stamps `live score unavailable` on every card of the league that has not kicked off.

Measured by the reviewers on scratch copies of HEAD: Suite 447/447, the poll check, the probe self-test, the parity check and the
render check all stayed green under each mutant. The existing Suite pair for `liveKeysAt` (hold 13:00Z, fail 09:30Z) failed at 09:30Z
only because the efltrophy card in its slate was added to the result, not because epl was asked early.

Built:

| what | where |
|---|---|
| a Suite pair per function with ONE card and one second either side of kickoff (12:30:00Z holds, 12:29:59Z fails) | `src/Suite.fs`, "a card is asked about from its kickoff and not a second before it" and "an answer is told a card from its kickoff and not a second before it" |
| render scenario (d): a slate of one EPL card two hours before its kickoff; no request at load or across three ticks while ONE timer is armed (so the silence is not an absent timer); the first tick after the clock passes kickoff asks once and the card shows the score | `scripts/live-score-render-check.mjs` |
| render scenario (e): Arsenal v Leeds in its window and Chelsea v Bournemouth (same league) two hours ahead, every feed answer a 503; the first reads `live score unavailable`, the second has no note and no `data-why` | `scripts/live-score-render-check.mjs` |
| four mutation entries (Suite and browser, for each function) that replace the window test with the end-of-window test alone | `scripts/mutation-check.mjs`: `live-keys-ask-before-the-kickoff`, `...-in-the-browser`, `live-answer-told-before-the-kickoff`, `...-in-the-browser` |

Result: Suite 449/449, render check 52/52 (was 47). Mutations: 4 of 4 caught (`mutation-check.mjs --ids ...`, 1 m 42 s).

## C2. The away side, and the lower bound of a score (review decoder F5, F6; defence F24)

`HomeScore` and `AwayScore` are two call sites in `LiveFeed.feedGameDecoder` (and `intOrNull(g.home?.score)` / `intOrNull(g.away?.score)` in the
probe). Every bad-score body in the Suite, the parity battery and the probe self-test put the bad value on `home`; the four `feed-*` entries that
claimed to defend the contract mutate the `HomeScore` line only. Reproduced by both skeptics on scratch copies: `AwayScore` read with `Decode.int`
(a numeric string accepted), or with no range check, or `away` ignored in the probe, each left Suite, parity and probe self-test green.

The lower bound of `wholeScore` was the int32 minimum, which nothing pinned (moving it to -2147483649, or deleting it, left every check green; deleting the UPPER
bound did fail one) and which means nothing for a football score. DECISION, made here and open to the owner: a negative score is refused, like a string or a fraction.
`wholeScore` is now "a whole number from 0 to the largest int32", on the page and in the probe.

Premise check (Rule 100, run before the change): can a legitimate soccer score be negative? The relay builds it as `Number(competitor.score)` from ESPN
(`adaptESPNWCSoccer`, relay origin/main read 2026-11-11, lines 2369-2370). `grep` over the 37 files in `data/` for a negative `home_score`/`away_score`/`score`
finds 3 files, and in every one the rows are GOLF (`sport` golf or PGA Tour, strokes to par: -13, -16, -17, -8) in the archive's context, never a soccer row or a
`/v2/games` feed. `wholeScore` decodes only the feed for the 16 soccer keys, so golf does not reach it. No real soccer body with a negative score has been seen;
none is claimed to be impossible, only a contract change worth naming instead of drawing `-1–0`.

Built:

| what | where |
|---|---|
| `n >= 0.0` (page) and `v >= 0` (probe); the failure text says "from 0" | `src/LiveFeed.fs`, `scripts/live-score-probe.mjs` |
| Suite: a negative home score; zero on both sides decodes (the lower bound is 0, not 1); away float, numeric string, over int32, negative and boolean, each with a GOOD home score so the error can only be the away side's | `src/Suite.fs` |
| the parity battery: a score below int32, a zero home score, and eight away-side bodies (string, fraction, over int32, largest int32, negative, boolean, null, no score); the old `-1` body now fails on BOTH sides | `scripts/check-live-probe-keys.mjs` (61 bodies' checks, was 51) |
| probe self-test: either side over, either side negative, zero decodes, away string/fraction/boolean | `scripts/live-score-probe.mjs` (56 checks, was 54) |
| nine new mutation entries: negative accepted, lower bound 1, away null as zero, away required, away truncated, away coerced, away range unchecked, probe ignores away (self-test and parity) | `scripts/mutation-check.mjs`; the five that anchored on the old bound are re-anchored and the two parity ids renamed `...-rejects-a-zero-score` |

Result: Suite 456/456 (was 449). 14 mutations run, 14 caught (52 s): the 5 re-anchored and the 9 new. Anchors: 1404 of 1407 checked, 0 stale
(the 3 not checked are the harness's own self-test-only entries).
