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

## Landed after this commit

- S6, S7, S11, S19 (decoder contracts, numeric strings, probe parity): `outbox/live-score-decoder-review-2026-11-11.md`.
- S2, S13, S14, S23 and the two owner questions (S0, S3/S12): the CC-CMD's Status, fact 6, the poll arithmetic, Design, Task 6 and Task 7 are corrected and a
  section "Open questions for the owner" is added; the comment claims in `check-live-score-poll.mjs`, `LiveFeed.fs`, `Scoreboard.fs` and `Suite.fs` now say what
  was and was not measured; `poll-survives-a-re-render` is labelled a text claim.

## S4 and S18: a request that never answers (this commit)

A poll request had no deadline, and a key is held (`inFlight`) while its request is open, so one stalled connection stopped that key being asked for good and the
card said nothing. The request now carries `AbortSignal.timeout(LiveScore.LivePollTimeoutMs)` (`tryFetchTextWithin` in `src/Program.fs`, the same primitive
`WeatherView.fs` uses); a timeout is an `Error`, so the key is released and the cards read `live score unavailable`.

**The first value was wrong, and the reason is worth keeping.** I started with 15 s (a quarter of the period). With a deadline SHORTER than the period every request
ends before the next tick, so the in-flight guard can never fire: it became unreachable code, and the render scenario that defends it (a request held across a tick)
could not be produced. The deadline is 90 s, one and a half periods, on purpose longer than the period: a slow answer still counts, a hung relay sees one request per
key at a time and no pile-up, and a request that never answers is cut and reported within two ticks. Suite and poll check both assert `period < deadline <= 3 x period`.
It is a bound, not a measurement: how long the relay takes to answer `/v2/games` is not measured here.

Measured 2026-11-11 (a throwaway Playwright script against the pre-installed Chromium): a `fetch` given `AbortSignal.timeout(15000)` on a page with `clock.install()`
rejected with `TimeoutError` after `clock.fastForward(60000)`, so the fake clock drives the deadline and the render check needs no real waiting (10 s for 43 checks).
The render check reads the deadline from `src/LiveScore.fs`, so it follows the constant.

Defended by: Suite case; two text-scan claims (the request is `tryFetchTextWithin LiveScore.LivePollTimeoutMs`, and there is no fetch without a deadline; the constant is
inside `period < deadline <= 3 x period`) with 4 new self-test fixtures; render scenario (c) (held at the tick inside the deadline, cut at the deadline with the card
saying the feed did not answer, asked again at the next tick and told the score) and scenario (b) re-shaped to one tick; three table entries
(`poll-request-without-a-deadline`, `poll-deadline-signal-dropped`, `poll-deadline-shorter-than-the-period`). All 27 `poll-*` entries caught, baseline 3 of 3 passing.

## Process incident, recorded (Rule 77)

The first run of the 27 `poll-*` entries reported "the unmutated tree passes every expectation: FAIL, 1 of 3 already failing: `node scripts/live-score-render-check.mjs`"
and then printed 27 PASS lines. Those PASS lines meant nothing (the harness says so) and I did not accept them. Eight standalone runs passed, so it was not the check;
eight runs under double CPU load passed, so it was not load; two harness runs of the same three expectations passed. The command that failed had been started without
`PW_CHROMIUM` exported (each shell call starts clean), and `env -u PW_CHROMIUM node scripts/live-score-render-check.mjs` reproduces it exactly: `browserType.launch:
Executable doesn't exist`. The 27 entries were re-run with it set: baseline 0 failing, 27 of 27 caught.

## Still to do from the same review

S8, S10 and S24 (the `LiveUnavailable` reason is built at six sites and shown nowhere; `CardHandle.Id` has no reader). Its own commit.
