# The live-score probe (CC-CMD-2026-11-11-soccer-live-scores, Task 8)

Date: 2026-11-11. Status: BUILT, NOT YET RUN AGAINST A LIVE MATCH. The first match it can judge is the 2026-11-11 19:00Z EFL Trophy
pair (the capture tonight) only if the poll is deployed, which it is not until the stack lands; the first scheduled chance is
2026-11-17 19:35Z (CC-CMD Task 10).

## What was built

- `scripts/live-score-probe.mjs` (`--self-test`, 30 checks): Playwright against the deployed page for `?date=<ET day>`, no mock, no
  fake clock, watched for `--watch` seconds (default 70). Records every request the page makes to `/v2/games` and every 200 body it
  received. Reads every soccer card (16 labels, spelled out in `SOCCER`) and judges it against the page's own LAST reading for its game.
- `.github/workflows/live-score-probe.yml`: dispatch-only (`date`, `watch`), no schedule, self-test first, manifest and PNG committed
  `if: always()`, job red unless PASS.
- `npm run check:live-score-probe` and a verify.yml step: the verdict logic runs on every push.
- 13 mutation entries (`live-probe-*`), each caught by the probe's own self-test.

## Two things the first draft got wrong, found before commit

1. **The join.** The draft read an ESPN id out of the card's `data-game-id` with `/_e(\d+)$/`. The card's id is the archive row's id,
   e.g. `2026-10-10-mls-stl-la` (read from `data/context-2026-10-10.json`, 125 rows). It carries no ESPN id. The probe now reads
   `/context/date/<day>` and joins card id -> `espn_event_id` -> the feed's `espnEventId`. A card whose row has no ESPN id is counted
   as `unjoined`, never skipped silently.
2. **The oracle.** The draft compared the card with two feed fetches made by the runner. A clock moves every minute and the page polls
   every 60 s, so a correct card can match neither fetch. A card can only show what the page was told, so the probe judges it against
   the last body the page itself received, exactly. The runner's own fetch is used for one thing: a game it sees live that the page
   never received a reading for is a FAIL (`live-unread`), so a page that never polled cannot pass by having nothing to compare.

## Rule 90 results

12 of 13 mutations were caught first time. One survived: a standalone `if (scheduledAfterKickoff) return FAIL` line. It was unreachable:
every state that sets that boolean already carries a per-card violation, so no input could make that line the one that fires. The line
was removed (Rule 63) and the mutation re-aimed at the boolean the manifest reports. A 13th entry covers the exit code, which is now
the exported `exitCodeOf` so it is self-tested: only PASS exits 0, and NOTHING-TO-JUDGE stays red as the CC-CMD requires.

## Coverage (Rule 91)

- Verified locally: the verdict logic (30 checks, 13 mutations), and `readCards` against the pinned page
  `?data=context-2026-10-10&simulate=1`: it returned 53 soccer cards of 124, in 6 soccer labels (MLS, Bundesliga, EPL, Ligue 1,
  La Liga, Serie A), every one with a game id, teams, score and status.
- NOT verified: the Playwright request/response capture and the runner fetches, because the authoring sandbox cannot reach
  `*.workers.dev`. They have not run once. A first dispatch on any slate day exercises them, and answers NOTHING-TO-JUDGE (red) unless a
  lab-covered soccer match is in play.
- The probe says the card agrees with what the relay served. It does not say the score is right: that is ESPN's.

## STAGED claim and unblock (Rule 74)

Staged: the probe's live path. Blocked by: the poll not being on the deployed page (the stack lands only after tonight's capture shows
the live shape) and by there being no in-play lab-covered match before 2026-11-11 19:00Z. Unblocked when: the stack is deployed and a
dispatch lands inside a match. Verify:

    gh workflow run live-score-probe.yml -f date=<ET day>
    # then read outbox/live-score-manifest-<date>-*.json: verdict PASS, cardState "In progress", scoreMatchesFeed true,
    # forecastAbsent true, scheduledAfterKickoff false, requestsToV2Games >= 1, and `checked` reading "checked N of M soccer cards"
