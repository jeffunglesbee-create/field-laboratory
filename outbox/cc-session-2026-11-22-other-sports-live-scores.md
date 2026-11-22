# Session record: live scores for the sports that are not soccer (CC-CMD-2026-11-11-live-scores-other-sports), Rule 67

Written 2026-11-22 on `main`. Owner direction of 2026-11-22: NBA, NHL "and the other sports" are needed, and "the poll should be as complete yet efficient as possible" (the exact words are in the CC-CMD's Task 2). `docs/CC-CMD-2026-11-11-live-scores-other-sports.md` is the specification; this is what was done to it.

## HEAD progression

| point | where | what |
|---|---|---|
| start | `main` `6d6ab9df` | the poll asked the feed about the sixteen soccer sport keys only; verify 45036530728 and guards 45036530781 green; deploy 45037242877 and live-check 45037360735 green on the head after it |
| page | the commit that adds this file | the page reads live scores for NBA, WNBA, NHL, MLB, NFL, CFB and AFL |
| probe | the next code commit | the deployed-page probe and its registry check judge every one of those sports |

## What the stack contains (commit order)

1. **The page** (`src/LiveScore.fs`, `src/LiveFeed.fs`, `src/Program.fs`, `src/Scoreboard.fs`; `src/Suite.fs`, `scripts/live-score-render-check.mjs`, `scripts/mutation-check.mjs`, `scripts/check-live-score-poll.mjs`, `scripts/check-live-probe-keys.mjs` and the probe's decoder copy go with it). Seven sport keys; `GameOver` beside `FullTime`; the relay's two final words; the period and clock as the note; baseball's inning; NHL joined by the two club names because its feed carries no ESPN event id; a window per sport; a card the feed has finished is neither asked about nor told later answers, and the timer stops when no card has work left; an answer is told by the clock of its arrival. The table is in the CC-CMD's Task 2.
2. **The probe** (`scripts/live-score-probe.mjs`, `scripts/check-live-probe-keys.mjs`): judges every sport; its record is added to this file when it lands.

## Verified (artifact beside each)

- Suite **543/543** (`node build/VerifyMain.js`): 534 before the review, 541 after its fixes, 543 with the two real bodies of 2026-11-22 (an NFL game and an NHL game in play, from `outbox/live-capture-nfl-2026-11-22-1834Z.json` and `-nhl-` of the same stamp).
- `check:live-score-render` **86/86** in the browser (a scripted feed per scenario): NBA and NHL cards, one by ESPN id and one by club names, reading `Q2 6:17` and `P2 10:11`, then `Game over`, then no more requests; two NBA games in one key, a failed poll not rewriting the finished one; an answer arriving after the window ended not told; and the soccer scenarios as before.
- `check:live-score-poll` 38/38 self-test and 17/17; `check:live-probe-keys` 92/92 (the decoder battery, page against probe copy, and the committed captures).
- Mutations: 149 live-related (`live-*`, `stopped-*`, `twin-*`, `poll-*`, `other-*`, the re-anchored ones) all caught (150/150 with the baseline), run before the review's fixes; the 8 added or re-anchored after them caught (9/9 with the baseline). `--anchors`: 0 stale.
- Real bodies read: NBA and NHL live (2026-11-12 captures), NFL live (7 games, 2026-11-22 18:34:29Z, `proved` true: 11 of 11 games joined to archive rows), NHL live (2026-11-22 18:34:16Z), CFB finished (`outbox/relay-cfb-post-body-2026-11-22.md`).
- Review: `wf_c54100cd-0f5`, five dimensions, 71 agents; 14 findings stood, 3 contested, 32 verifiers failed on a usage limit (16 findings unverified by an agent; judged by me against the code). Fixes and the findings that were recorded are in the CC-CMD's Task 2.

## STAGED, not verified (Rule 74); Task 3 of the CC-CMD names the executor of each

The five items are in the CC-CMD's Task 3, each with its blocker, its unblock event and the command that verifies it: (1) MLB, WNBA, AFL in play, and a real in-play card of any sport on the deployed page; (2) football halftime and baseball delays (the relay may serve them as `pre`; the halftime read of NFL is scheduled for 19:25Z on 2026-11-22); (3) the chosen windows; (4) AFL's join; (5) a failover body's staleness, filed as `docs/CC-CMD-2026-11-22-live-feed-failover-staleness.md`.

## Integration state (Rule 65)

- **Relay contract:** `GET /v2/games?sport=<key>&date=<ET day>`, key one of `nba wnba nhl mlb nfl cfb afl` as well as the soccer keys. `games[]`: `espnEventId` (a string; absent on NHL), `state` (`pre`, `live`, `final`, `post`), `home` and `away` `{ name, abbr, score }`, `periodLabel` (`Q2`, `P2`, `T5`, `F`, `NS`, `""`), `clock` (a string), `situation` (null or an object; `isHalftime` read when present). The cache TTL of the route was not read by this change.
- **Client consumer:** `LiveFeed.decodeFeed` and `LiveFeed.readingFor`, then `LiveScore.foldReading`; render target: the card's `data-testid="live"` node beside the score.
- **Status:** VERIFIED for the decode and the reading on real NBA, NHL, NFL and CFB bodies (Suite); VERIFIED in a browser with scripted feeds (render check); STAGED for a real in-play card of each sport on the deployed page.
- **Known mismatches:** the NHL feed has no `espnEventId` (relay CC-CMD filed; the name join is the lab's stand-in and is deleted when the relay serves it); football halftime and baseball delays may read `pre` at the relay (not read); the relay has two words for a finished game (`final`, `post`) and the lab reads both.

## Carry-forwards

None unowned. Each STAGED item above has an unblock event and a command; the NFL halftime read (19:25Z), the deployed-page probe (19:50Z) and the NBA break read (21:40Z) are armed as reminders into this session; the relay's NHL id is `field-relay-nba docs/CC-CMD-2026-11-22-nhl-feed-espn-event-id.md`; staleness is `docs/CC-CMD-2026-11-22-live-feed-failover-staleness.md`.

## Incidents (Rule 77)

- A full `npm run gate` runs the whole mutation table, which mutates `src/` for about an hour; started beside a review whose agents were reading `src/`, it made them read mutated files. Stopped, the tree healed (`--heal` said nothing was applied), and the review rerun on a stable tree. A `git diff` read while the harness runs shows the mutation, not the work.
- The review's verifier agents hit the account's 5-hour usage limit partway: 32 of 71 agents failed, which the workflow's own summary counted as "refuted" because it counted votes of zero. They were not refuted; the unverified findings were judged against the code instead (the CC-CMD says so).
- A first edit script for the probe aborted on a docstring anchor that included the `/** ` prefix and wrote nothing; the next run succeeded.
