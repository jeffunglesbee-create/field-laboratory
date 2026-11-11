# Claude Code Command — a /v2/games request for a live game makes two uncached BSD calls and a GameDO write; cache the BSD ones

**Branch:** main — commit directly, do not create a feature branch or PR
**Filed from:** field-laboratory
**Ask to:** field-relay-nba (`handleV2Games` in `src/index.js`)
**Filed:** 2026-11-11 by CC, as the follow-up the soccer live-scores CC-CMD names (Task 11)
**Status:** FILED 2026-11-11. Nothing here is built. **Not before 2026-11-24** unless the owner says otherwise: the CFL experiment's VOID window runs to 2026-11-23 and a relay deploy inside it is the owner's call. The ask does not touch `handleCFLOddsProbs`.

---

## What was read (relay `origin/main` `9c451d9d`, 2026-11-11; source, not a measurement)

For every uncached request, `handleV2Games` makes, when `BSD_API_TOKEN` is set: one `GET https://sports.bzzoiro.com/api/v2/events/live/` (no `cf` cache option on the fetch) to attach `bsdEventId` and `situation.elapsed`; for the league-27 slate also a by-date `events/` call for the group name and weather; and, for a live game, one `POST` to the game's `GameDO` `/wp` (a storage write, `WP_HISTORY_MAX` 180). `AmbientDO` already polls `/v2/games` for `epl, mls, laliga, seriea, bundesliga, ligue1, wc26` every 15 s while anything is live (60 s idle). BSD's allowance cannot be read: no rate-limit header, and the vendor pages disagree (none, 7,500 a day, 100 a day, 10 requests a second per IP).

The laboratory is about to add a visibility-gated 60 s poll of `/v2/games` per soccer key while a card is in its kickoff-to-+3 h window (`docs/CC-CMD-2026-11-11-soccer-live-scores.md`). Per viewer, a 3 h window is 180 requests per key, each costing the relay one BSD call; `AmbientDO` already makes 720 per key per 3 h, so one viewer adds 25% and ten add 250% to that key's `/v2/games` load while a match is live.

## The ask

Give the BSD `events/live/` call the same short edge cache the relay's own `/bsd/events/live` route uses (the comment on that route says 25 s), by the relay's established pattern (Rule 78: grep the call sites that already cache and replicate them exactly). Whether the 25 s cache on that route works on a `workers.dev` host is itself unverified (`wrangler.toml` says `caches.default` is a no-op there), so the first task is to read which mechanism the existing cached calls use and whether it takes effect. The `GameDO /wp` write is a separate question and is not asked here.

## Trigger

Any of: the soccer poll is deployed and a BSD 4xx or 429 appears in a `/v2/games` response or the relay's own logs; the number of concurrent viewers of the lab page in a live window is known to exceed two; the owner asks. Until then this stays filed.

## Not in scope

The `GameDO /wp` write; the by-date BSD call; any change to what `/v2/games` returns; a new cron or Durable Object (RELAY-IS-DUMB).
