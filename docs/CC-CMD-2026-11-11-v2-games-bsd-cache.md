# Claude Code Command — a /v2/games request for a live game makes two uncached BSD calls and a GameDO write; cache the BSD ones

**Branch:** main — commit directly, do not create a feature branch or PR
**Filed from:** field-laboratory
**Ask to:** field-relay-nba (`handleV2Games` in `src/index.js`)
**Filed:** 2026-11-11 by CC, as the follow-up the soccer live-scores CC-CMD names (Task 11)
**Status:** FILED 2026-11-11. Nothing here is built. **Not before 2026-11-24** unless the owner says otherwise: the CFL experiment's VOID window runs to 2026-11-23 and a relay deploy inside it is the owner's call. The ask does not touch `handleCFLOddsProbs`.

---

## What was read (relay `origin/main` `9c451d9d`, 2026-11-11; source, not a measurement)

For every uncached request, `handleV2Games` makes, when `BSD_API_TOKEN` is set: one `GET https://sports.bzzoiro.com/api/v2/events/live/` (no `cf` cache option on the fetch) to attach `bsdEventId` and `situation.elapsed`; for the league-27 slate also a by-date `events/` call for the group name and weather; and, for a live game, one `POST` to the game's `GameDO` `/wp` (a storage write, `WP_HISTORY_MAX` 180). `AmbientDO` already polls `/v2/games` for `epl, mls, laliga, seriea, bundesliga, ligue1, wc26` every 15 s while anything is live (60 s idle). BSD's allowance cannot be read: no rate-limit header, and the vendor pages disagree (none, 7,500 a day, 100 a day, 10 requests a second per IP).

The laboratory is about to add a visibility-gated 60 s poll of `/v2/games` per soccer key while a card is in its kickoff-to-+3 h window (`docs/CC-CMD-2026-11-11-soccer-live-scores.md`). Per viewer, a 3 h window is 180 requests per key, each costing the relay one BSD call; `AmbientDO` already makes up to 720 per key per 3 h, so one viewer adds 25% and ten add 250% to that key's `/v2/games` load while a match is live. *(Qualified by review 2026-11-11: 720 is the uncached count. `AmbientDO`'s self-call carries `cf: { cacheTtl: 25 }` (`src/ambient-do.js` ~1209-1212, whose header says its polls hit the CF cache), so if that cache takes effect the baseline is lower, about 360, and a viewer's share is larger, 50% and 500%: the percentages are a floor. Whether it takes effect on a `workers.dev` host is not known, and whether a cached answer counts against BSD's allowance cannot be observed, the relay's own Task 0 result below.)*

## The ask

Give the BSD `events/live/` call the same short edge cache the relay's own `/bsd/events/live` route uses (the comment on that route says 25 s), by the relay's established pattern (Rule 78: grep the call sites that already cache and replicate them exactly). Whether the 25 s cache on that route works on a `workers.dev` host is itself unverified (`wrangler.toml` says `caches.default` is a no-op there), so the first task is to read which mechanism the existing cached calls use and whether it takes effect. The `GameDO /wp` write is a separate question and is not asked here.

## Related, read before building (BUILD-ON-A)

Added 2026-11-11 after review found this document cited none of the relay's own BSD work. From `field-relay-nba` `docs/`, read in full:

- `CC-CMD-2026-10-29-bsd-live-shot-source.md` (DONE). Its Task 0 measured that BSD's allowance and the relay's spend cannot be read from outside: no rate-limit header on 6 calls, three vendor pages that disagree, `x-cache-status` HIT or STALE on 5 of 5, and "33 lines in `src/index.js` name a BSD REST path ... There is no counter on them". It built the one counted BSD path, `AmbientDO`'s stats poll: a hard daily cap of 600 set by the owner, a stop on the first 429, and an Analytics Engine datapoint `bsd-stats-poll` per call. Whatever this command asks must not widen BSD demand blind, which is that document's own sentence.
- `CC-CMD-2026-10-18-bsd-by-date-offset-and-cache.md` (DONE). The edge-cache pattern for a BSD read route, by Rule 78. The ask below replicates it.

## Trigger

**Only "the owner asks" can fire this as filed.** The two automatic triggers first written here cannot, found by review 2026-11-11: (1) in `handleV2Games` the BSD fetch is `if (_bsdR.ok) { ... }` with no else, and the only log is the exception catch (relay `origin/main` `9c451d9d`, `src/index.js` ~4643-4668), so a BSD 429 changes neither the response nor any log; (2) nothing counts concurrent viewers of the lab page (an assets-only worker with no analytics binding, no beacon, no `/ambient` call). To make a trigger real the first task of this command would have to make the spend observable: one Analytics Engine datapoint per BSD call on this path, by the pattern `bsd-stats-poll` already uses, so the soccer poll's cost becomes countable for the first time. That, not the cache, is the part that can be argued for now.

## Not in scope

The `GameDO /wp` write; the by-date BSD call; any change to what `/v2/games` returns; a new cron or Durable Object (RELAY-IS-DUMB).
