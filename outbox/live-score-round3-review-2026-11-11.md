# Live scores: the third review (workflow wf_98b8ff4c-279), 2026-11-11

Three lenses (half-time behaviour against the relay, defensibility of the new checks, accuracy of the written account), two skeptics per finding, over `6fbc369..0761db1` on
`live-scores-t3` (the Half time marker, the real-body fixtures, the Task 1 result). 22 findings reported, 19 survived both skeptics, 3 were refuted. As in the second review, none is
a defect in the shipped behaviour: four are checks that could not fail, the rest are prose.

## C7. Four gaps in the checks (review defence F3, F4, F5, F6; and the committed captures, account F19)

| gap (reproduced by both skeptics on a scratch copy of `build/`) | what a future edit could do with every check green | built |
|---|---|---|
| **F3, rated high by the reviewer, medium by both skeptics.** No body anywhere had `isStoppage` true with `isHalftime` false: the relay sets them independently (`isStoppage = displayClock.includes('+')`, `isHalftime = statusName === 'STATUS_HALFTIME'`) and both captured bodies had them equal. `IsHalftime = isHalftime \|\| isStoppage` passed 473/473, parity 72, probe 63. | read half time from added time, and show `Half time` while the ball is in play in `45'+2'` or `90'+4'` | Suite pair over two stoppage bodies (`45'+2'`, `90'+4'`, flag false) read as their clock; two parity bodies (added time with the flag false and true); the render scenario (h) now runs three ticks, added time in play first, then the break, then the second half; entries `live-halftime-flag-from-stoppage` (Suite and browser) and `live-probe-halftime-from-stoppage` |
| **F4.** The flag was claimed per game but shown per sport feed: scenario (h) had one game per feed. `feed \|> List.exists (fun g -> g.IsHalftime)` passed everything. | hoist the flag out of the join: on a matchday with two live games in one feed, the one in play reads `Half time` while the other is at the break | a Suite pair over a two-game feed (the first at the break, the second in play), the cards swapped as the fail input; entry `live-halftime-flag-read-from-any-game`; the render comment now says "per sport feed" and leaves per game to the Suite |
| **F5.** The guard that a reading never takes a card back from `Final` was checked with a LIVE reading only, in the Suite and the browser. `reading.tag !== HalfTime` (and FullTime) in the guard passed everything. | a refactor with a per-reading guard lets half time or full time reopen the amnesty zone (`Final` is its witness, ruling 2(b)) | a Suite check over every reading (none, live with and without a clock, half time, full time, unavailable); the pinned page loops over `halftime` and `fulltime` after the Final reading; entries `live-fold-lets-half-time-take-back-final` (Suite and browser) and `live-fold-lets-full-time-take-back-final` |
| **F6.** The page rejects `situation` of `false`, `0` and `''` and a flag of `0` and `''`; no body of the parity battery or the probe's self-test was falsy, so `if (!s)` and `!f` in `halftimeOf` passed. | tidy the probe's decoder with a truthiness test; the probe then judges a card against a game the page refused | five parity bodies and the probe self-test list; entries `live-probe-halftime-truthiness-situation` and `...-flag` |
| **F19 (account).** The notes said both decoders read the committed real bodies "unchanged" and no committed check ran them. | a decoder edit that breaks on a real body while every battery body still decodes | `check-live-probe-keys.mjs` now decodes every committed `outbox/live-capture-*.json` of a soccer key with both decoders and compares the games; it prints `compared both decoders on N committed capture bodies`. Shown to fail on a scratch directory holding a capture whose score was edited to a string (the check reads `outbox/` from the working directory): FAIL on that file, PASS elsewhere |

Result: Suite 476/476 (was 473), render 66/66 (was 63), probe self-test 64/64 (was 63), end to end 11/11, parity and captures 84/84 (was 72), poll check 16/16. Mutations: 13 run (9 new, 4 related),
13 caught (2 m 41 s).

## C8. What the written account said that the files do not (review behaviour F1 and F2; account F7-F18)

No behaviour changed. Each row was checked against the capture files, the code or the relay source by two skeptics.

| claim | what the evidence says | corrected in |
|---|---|---|
| the Full time gap was "at least 1.5 minutes (the span observed)", "56 seconds" and "about 2.5 minutes" for one observation | the committed files give 55 s (capture `capturedAt` 20:59:30.117Z against `finalized_at` 21:00:26, one-second resolution); 20:58Z to 20:59:30Z is the span between an uncommitted read and the capture and does not end at the finalisation; with the uncommitted read it is about 2.4 minutes | CC-CMD fact 3, the Not known list and the Task 1 result; the real-bodies note; the window comment in `src/LiveScore.fs` |
| the card shows Full time "at most until the next 15-minute tick" | the tick bounds when the ARCHIVE row is finalised; the card is built once and the poll never re-reads the archive, so an open page keeps the note until a re-render or reload (open question 1) | CC-CMD fact 3, the real-bodies note |
| ruling 2 and the Status said the gap is unmeasured, the capture armed, and nothing had run against a real match | the gap was measured once; the capture has run; the decoders have run on the real bodies (the poll and the card have not) | CC-CMD ruling 2 and Status |
| "the second half" is not known and 20:20Z is its first sample | it was seen once in an uncommitted direct read at about 20:34Z; no committed body holds a second-half game | CC-CMD Not known, the half-time note |
| the Task 1 result table gave `0 of 2` for the two captures with no final game | the files say `0 of 0 final game(s)` | CC-CMD Task 1 result (main's copy corrected in its own commit) |
| the clock reads `45'+3'` "for the whole 15-minute break" | one sample, about six minutes into the break; the break's length and the clock at its start and end were not measured | CC-CMD ruling 3, the half-time note, `src/LiveScore.fs` |
| a non-live game carries `situation: null` | the two captured final games did; the relay's BSD enrichment gives any game it matches `{ elapsed }` (relay `index.js` 4663-4664), which reads false too | `src/LiveFeed.fs` (two comments) |
| Task 5's field list omits what the page now fails the whole feed on | `situation` (null or an object) and `situation.isHalftime` (a boolean) added, with the artifact `grep isHalftime CONTRACTS.md`; BUILD-ON-A: added to the existing Task 5, not a new CC-CMD | CC-CMD Task 5 |
| "three games captured" in the Suite header | three bodies of ONE game; each capture held two games and the second is dropped, `count` set to 1 | `src/Suite.fs` header |
| `_crunch` appears "late in the match" | the relay sets it on a live game under four conditions (including added time with a goal difference of 1 or less, so a close game at the break would carry it); none of the four captures does | the real-bodies note |
| the redundancy reminders dispatched the captures; "19:45Z redundancy" ran 1954Z; "21:22Z" | the files record no run id; the capture times are 19:18:54Z, 19:54:02Z, 20:59:30Z and 21:21:25Z, and the routines for six slots committed no capture; nothing in the repo identifies the dispatcher | the Task 1 result, the real-bodies and half-time notes |
| the session record's "owner question 3" and "3 owner questions" | three findings (S0, S3, S12) make two owner questions; the extra-time window is part of question 1 | `outbox/cc-session-2026-11-11-soccer-live-scores.md` |
| both decoders "read all three committed bodies unchanged" | four files; by a one-off command, now held by a committed check (C7) | the real-bodies note, CC-CMD fact 5 |

Refuted by both skeptics: that `Half time` covers only `STATUS_HALFTIME` (the extra-time breaks and a shootout fall to the frozen-clock note: unknown statuses, stated in the half-time note); that the session record is stale at the tip; and a listing of claims that cannot be verified from the repo.
What cannot be checked from the repo: what the stored routines did (only that no capture was committed), and the direct reads at about 20:34Z and 20:58Z (no artifact: tool output of that evening, recorded in the real-bodies note with its method).

## C9. The probe workflow and main's new workflow check (found while merging main, not by the review)

After `main` was merged (the apt-mirror work of another session), `node scripts/workflow-check.mjs` failed 2 of 71 rows, both on `.github/workflows/live-score-probe.yml:52`:
`npx playwright install --with-deps chromium` goes through apt, which stalled for ten minutes on 2026-11-11 when the Ubuntu mirrors did not resolve
(`docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md`), and the step had no time limit. The stack's workflow predates the rule. Fixed to the pattern `main` now uses at its other ten sites
(`timeout-minutes: 3`, `npx playwright install chromium`; the runner image already has the libraries). 71 of 71 after the change. The probe's own `--self-test` and `--e2e` are unchanged (11/11, 64/64).
