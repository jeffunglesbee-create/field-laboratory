# Live-score poll, decoder and wiring: adversarial review and the first batch of fixes (2026-11-11)

Review: workflow `wf_584a08a5-824`, four lenses (poll runtime and cost, decoder against the relay, owner rulings and the written account, defensibility) on
branch `live-scores-t3` tip fa98285, two skeptics per finding. 29 findings reported, 25 survived at least one skeptic. The poll, the decoder and the card
wiring had never been reviewed before this. Nothing here was run against a real live match: that is still tonight's capture.

## Fixed in this commit (poll lens and defence lens)

| id | finding | fix | what defends it |
|---|---|---|---|
| S1 | keys and work-ahead ignored a card the archive had already finalised, so the timer ran for a card no answer can change | `LiveScore.pollableAt`; `liveKeysAt` and `liveWorkAheadAt` exclude archive-Final | Suite cases; `live-keys-ask-for-a-finalised-card`, `live-work-ahead-for-a-finalised-card` |
| S5, S15 | the poll asked the relay for the URL's date at render time, not the date of the cards just drawn | `startLivePoll cardHandles.Value payload.Date`; no poll when the date is empty | claim in `check-live-score-poll.mjs` |
| S9, S16 | the per-key card filter was defended by nothing: dropping it made every other league's card read `live score unavailable` | `LiveScore.answersTo key now g` (pure, named), used by the answer callback | Suite group; two-league render scenario; `poll-answer-told-every-league-seen-by-the-render-check`, `...-the-suite`, `...-the-text-scan` |
| S17 | nothing proved the timer is cleared | render check wraps the page's own `setInterval`/`clearInterval` and counts live timers across re-renders | `poll-timer-id-not-stored`, `poll-clears-the-wrong-timer` (+ text-scan twin) |
| S18 | in-flight guard was a presence grep | render check holds one answer unanswered and asserts one request per key; claim pins release-first | `poll-in-flight-guard-always-open`, `poll-in-flight-released-before-the-answer` (+ text-scan twin) |
| S20 | `liveWorkAheadAt`'s start-less branch undefended | Suite case, table entry | `live-work-ahead-for-a-start-less-row` |
| S21 | the one-timer claim was a keyword grep | `EXTRA_TERMS`: `Promise.sleep`, `Async.Sleep`, `requestIdleCallback`, `queueMicrotask`, listeners, `on<event>` handlers, bare `fetch`, `XMLHttpRequest`, `sendBeacon`; scanned across all of `src/*.fs` | 14 new self-test fixtures in the file (several belong to the other rows) |
| S22 | the period was defended by text only (`60000 / 4` passed) | period regex anchored to end of line; render check observes the period the page really gives | `poll-period-seen-by-the-render-check`, `poll-period-expression-seen-by-the-text-scan` |

Measured after the fix: Suite 428/428, render check 41/41, poll check 14/14 (self-test 28/28), forecast render 38/38, state check 11/11, all 24 `poll-*`
entries caught, anchors 0 stale.

## Not fixed here, and why

- S0 (a re-render fires an immediate tick and a new in-flight set). Real, and both skeptics rated it low. The immediate tick is what makes a card show its reading
  right after a date change, and the owner-approved bullet says "refresh on re-render". The in-flight claim is narrowed to per-poll scope in the CC-CMD
  (next commit) rather than changed in code.
- S3 and S12 (a reading has no age: it stays on the card when answers stop or the tab is hidden). A design question for the owner, written into the CC-CMD
  as an open question, not decided here.
- S2 (relay cost per tick is larger than fact 6 states). A documentation correction, next commit.

## Still to do from the same review (named, in order)

S6/S19 decoder cases and mutations, S7/S11 probe decoder parity with the page's decoder, S4/S18 fetch timeout, S8/S10/S24 the unrendered
`LiveUnavailable` reason and `CardHandle.Id`, S13/S14/S23 written claims. Each lands as its own commit.
