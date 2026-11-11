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
| the parity battery: a score below int32, a zero home score, and eight away-side bodies (string, fraction, over int32, largest int32, negative, boolean, null, no score); the old `-1` body now fails on BOTH sides | `scripts/check-live-probe-keys.mjs` (61 checks over 40 bodies, was 51 over 30) |
| probe self-test: either side over, either side negative, zero decodes, away string/fraction/boolean | `scripts/live-score-probe.mjs` (56 checks, was 54) |
| nine new mutation entries: negative accepted, lower bound 1, away null as zero, away required, away truncated, away coerced, away range unchecked, probe ignores away (self-test and parity) | `scripts/mutation-check.mjs`; the five that anchored on the old bound are re-anchored and the two parity ids renamed `...-rejects-a-zero-score` |

Result: Suite 456/456 (was 449). 14 mutations run, 14 caught (52 s): the 5 re-anchored and the 9 new. Anchors: 1404 of 1407 checked, 0 stale
(the 3 not checked are the 3 entries that carry no `file` and `find`, which `staleAnchors` skips: counted by reading the table, 3 of 1407).

## C3. The reason beside a card the archive has finalised (review card F8, defence F22)

`liveWhyFor`'s `Final _, _ -> ""` arm is reached on a real page only through the state the card's effect hands it (`liveWhyFor (state ()) (reading ())`,
`src/Scoreboard.fs`). The Suite pinned the pure function; the render check never put a Final card beside an `unavailable` reading. Reproduced by both
skeptics: the effect reading a constant archive state instead of `state ()` kept the render check at 47/47, and a Final card told the feed failed then carried
`data-why="the feed did not answer: 503 ..."` beside an empty note, which is the attribute-versus-note disagreement the wiring exists to prevent. It is reachable
on a matchday: `answersTo` does not exclude archive-Final cards, so one finalised card in its window and one in play both get told a failed feed.

The Suite titles also claimed more than their inputs held (defence F22): "a clock, full time or no reading" was ONE clock, and "a game the archive has
finalised" was a regulation final. `| _, FullTime _ -> "full time"` added above the catch-all, or the Final arm narrowed to `Final(_, _, false)`, kept every check green.

Built:

| what | where |
|---|---|
| each class is now every member: a clock, no clock, full time, no reading; a regulation final and an extra-time final | `src/Suite.fs` |
| pinned-page step: the `Final / OT` card is told `unavailable`; it reads no note and no `data-why`. Then the archive state is set back to scheduled and the SAME reading's note and reason (`test`) appear, which shows the reading was held all along and only the Final state hid it (so the first assertion is not vacuous) | `scripts/live-score-render-check.mjs` (54 checks, was 52) |
| three entries: the effect reads `Scheduled` instead of the card's state (browser); the Final arm narrowed to regulation (Suite); a `FullTime` case added to the reason (Suite) | `scripts/mutation-check.mjs` |

Result: Suite 456/456. 6 mutations run (3 new, the 3 existing `live-why-*`), 6 caught (2 m 06 s).

## C4. The day the poll asks for, the guard on an empty date, and the value of the deadline (review poll F1, F23; defence F20, F21)

Three parts of the poll the fix-review showed no browser scenario observed:

1. **The day asked** (poll F1, defence F20). The call site passes `payload.Date` and `startLivePoll` builds its route from the `etDay` it was given. A
   mutant that asked for the URL's day, at the call (`viewedDate ()` in place of `payload.Date`) or inside the poll (`LiveFeed.feedPath key (viewedDate ())`, `etDay` unused),
   passed the render check at 47/47 because every scenario served a slate whose `date` equals the URL's. The text claim caught only the first.
2. **The guard on an empty date** (poll F1, defence F21): `&& payload.Date <> ""` was pinned by nothing (the claim's regex needed only the other two parts of the line, and
   the self-test fixture removed the guard together with `IsNone`). With the guard gone a slate with no `date` makes the page ask `/v2/games?sport=epl&date=`, and the relay turns an empty
   date into the UTC day (`handleV2Games`, relay `src/index.js` ~4392, as a skeptic read it), the wrong day after 19:00 Eastern. A relay success body always carries `date` (one skeptic read the handler: relay origin/main `src/index.js` ~12576, `ok: true, date,`, after the `YYYY-MM-DD` check; not re-read here), so
   this branch is not reachable from the relay today; it is the page's own contract with `DeskPayload.Date`, which decodes an absent date as `""` (`src/Desk.fs` 1186).
3. **The value of the deadline** (poll F23). The render scenario knew the request was open at 60 s and cut by 91 s, so a signal of 65 s, or hard-coded 90 s with `ms` ignored, or any value from 60 s
   to about 94 s, passed.

Built:

| what | where |
|---|---|
| scenario (f): the URL says the 10th, the slate it is answered with is dated the 9th; every request must carry `date=2026-10-09` | `scripts/live-score-render-check.mjs` |
| scenario (g): a slate with no `date` draws its cards, asks for nothing at load or across two ticks, and arms no timer | same |
| scenario (c) rewritten around a PAUSED clock. The first version checked at 60 s and 91 s; a reviewer's replica of the proposed 1-second band failed 4 runs in 5, because `clock.install` lets time run in real time. The clock is now paused once the request is in flight (`pauseAt`) and moved only by `runFor`; the time the request has been open is known exactly from the page's own `Date.now()` at the request and at the pause. It must be open at deadline minus 2 s and cut at deadline plus 2 s. Measured before building it: 6 runs with 0.5 to 2.5 s of real-time drift, identical result; after building it, 3 runs of the whole check, 58/58 each | same |
| two claims in the poll check: the call is guarded on `payload.Date <> ""`, and the route is `LiveFeed.feedPath key etDay` with no other day source (`viewedDate`, `queryParam`) in the region; three self-test fixtures, each breaking one part | `scripts/check-live-score-poll.mjs` (16 checks, was 15; self-test 36, was 33) |
| seven entries: the URL's day at the call, inside the poll (browser and text scan), an empty date (browser and text scan), a signal 5 s short, a signal 10 s long | `scripts/mutation-check.mjs` |

What the band does not pin: a signal within 2 s of the constant. A signal that ignores `ms` and hard-codes 90 s is the same code at today's constant and differs only after someone retunes
`LivePollTimeoutMs`; the claim "the deadline is `LivePollTimeoutMs`" is then pinned by the text scan (`tryFetchTextWithin LiveScore.LivePollTimeoutMs`) plus the 2-second band, not by an exact value.

Result: render check 58/58 (was 54). 9 mutations run (7 new, `poll-asks-for-the-wrong-day`, `poll-deadline-signal-dropped`), 9 caught (3 m 18 s).

## C5. The status branch of `tryFetchTextWithin` that could never run (review poll F2, card F15)

`tryFetchTextWithin` (new in 61a9515) copied `tryFetchText`'s `if res.Ok ... else Error "HTTP %d"`. `fetch` there is Fable.Fetch's checked `fetch$`, which throws
`Exception(errorString(response))` when `!response.ok` (`build/fable_modules/Fable.Fetch.2.7.0/Fetch.fs.js` 83-93, read by both skeptics, one ran it against a stubbed
`{ok:false,status:503}`). The `else` arm never ran, and the reason a 503 carries is `503 Service Unavailable for URL ...` from the rejection, not `HTTP 503`.
`src/WeatherView.fs` 272-283 records the same trap and uses `fetchUnsafe`.

Correction to `live-score-poll-review-2026-11-11.md` (rows S18/S21 and its "NOT changed (Rule 69)" note): Rule 69 protects code that already existed; this helper is new in
the commit that observed the branch, so declining to remove it was wrong. `tryFetchText` (older, used elsewhere) keeps its branch, untouched.

Built: the branch is removed and the comment says where a refused answer ends up. A table entry (`poll-refused-answer-loses-its-status`) replaces the rejection's
message with a constant in the `with`; the render check's 503 scenario (`why` includes `503`) fails on it, 1 of 1 caught. Suite 456/456, render 58/58, poll check 16/16.

## C6. What the written account said that the code or the data did not (review poll F3, F4; decoder F7; card F9-F14, F16, F17; no behaviour changes)

Each was checked against the source by the skeptics. The relay facts were also re-read here: `AMBIENT_SPORTS`, `SPORT_ACTIVE_MONTHS` (January is 0, so `wc26` `[5,6,7]` is June to August; the
comment in the file says "Jun-Jul"), the `cacheTtl: 25` self-call, the `wc26` by-date BSD call and the `/crunch` POST, in the scratchpad copies of the relay's `src/index.js` and
`src/ambient-do.js` (the `ambient-do.js` copy is byte-identical to relay `origin/main` `76edcbab` at the time of writing).

| claim that was false | what is true | where corrected |
|---|---|---|
| a hung request sees "one request per key at a time and no pile-up" | the guard is per `startLivePoll`: a re-render starts a new poll with its own set (measured by a skeptic: request held, Today pressed, two requests for the key). The first tick of the new poll is immediate (open question 2) | `src/LiveScore.fs` (`LivePollTimeoutMs`), the CC-CMD poll bullet |
| after the deadline "the card says the feed did not answer" | the visible words are `live score unavailable`; `the feed did not answer` is the `data-why` reason | same two places; the poll-review outbox |
| a card keeps its answer "until the page is reloaded or the archive finalises" | an open page never re-reads the archive (the slate is fetched only by `start()`: boot, Today, date buttons, Back), so a game finalised meanwhile is not seen until the reader re-renders | CC-CMD open question 1 |
| "your ruling's window" (3 h) | the owner named the mode, "auto-poll while a match is live"; the window and the cadence are CC's proposal (CC-CMD ruling 1 says so) | CC-CMD open question 1 |
| one viewer adds 25% to the relay's per-key load | only for the six keys `AmbientDO` polls in November (`AMBIENT_SPORTS` and `SPORT_ACTIVE_MONTHS`, relay `ambient-do.js` 119-150: epl, mls, laliga, seriea, bundesliga, ligue1; wc26 only in June to August). For the other ten lab keys, `efltrophy` (tonight's capture and the 2026-11-17 proof) among them, a viewer is the only caller. `AmbientDO`'s self-call carries `cf: { cacheTtl: 25 }` (`ambient-do.js` 1210), which may make the share larger; not measured | CC-CMD poll bullet and fact 6, `src/LiveScore.fs` (`LivePollMs`), the poll check's header |
| fact 6 lists the cost of "each request" | a `wc26` request makes a second BSD by-date call (4 s timeout, no `cf` cache; relay `index.js` 4599-4611) and each live game with a crunch condition a `GameDO /crunch` POST (4829-4840); the sibling CC-CMD's title repeated the "for a live game" framing and is retitled | CC-CMD fact 6, the sibling's title |
| every card of that sport says `live score unavailable` when the feed fails | only the cards of that sport key that are inside their window and not finalised in the archive (`answersTo`, `liveNoteFor`); a string score cannot reach the page from this relay (`Number()`) | the decoder review outbox, the Suite comment |
| the string-score error is "visible on the card and in the probe's `#decode-status`" | it is the card's `data-why` attribute (devtools) and the probe's `outcomes[].decoded.why`, in the probe decoder's own wording; `#decode-status` is the slate-decode line | the decoder review outbox |
| the reason was built at "six sites" | seven: five in `LiveFeed.readingFor`, two in the poll's answer callback (eight with the test affordance) | `src/LiveScore.fs`, the poll-review outbox |
| the CC-CMD Status names `-live-scores-bsd-cache.md`, and Task 2 is in neither list | the file is `docs/CC-CMD-2026-11-11-v2-games-bsd-cache.md`; Task 2's artifact `outbox/live-premises-2026-11-11.json` is on neither `main` nor the branch (`git ls-tree`, 2026-11-11), so Task 2 is listed as not done | CC-CMD Status |
| `CardHandle` is `{ Id; ... }` and the page finds a card by its id; Task 6 says `src/Desk.fs` holds the pure decode; "the join is the poll's"; the render check "does not prove that the poll asks the right route at the right moments" | `Id` is gone (5415065); the decode and join are `src/LiveFeed.fs`, the merge and window `src/LiveScore.fs`; the poll hands the feed to `LiveFeed.readingFor`; the unpinned render scenarios now observe the route, the day, the period, the timers, one request per key, the deadline and the window | the handle outbox (a correction section), CC-CMD Task 6 and the join sentence, the render check's header |
| the poll check's extra terms are scanned "across all of `src/*.fs`" and 14 fixtures were added | the extra terms are tested against the poll region only; the timer, sleep and socket names are scanned across `src/*.fs`. 13 fixtures were added (12 `one(` + 3 `check(` before, 25 + 3 after; counted with `git show`) | the poll-review outbox (a corrections section) |

Result: Suite 456/456, render 58/58, poll check 16/16 (self-test 36/36), anchors 0 stale after these edits (no behaviour changed: `src/` differences are comments).
