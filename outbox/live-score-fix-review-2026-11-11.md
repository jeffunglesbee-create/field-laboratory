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
