# Claude Code Command — a `/v2/games` body served from the relay's mirror says how old it is, and the page does not read it

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory (the consumer); the contract is field-relay-nba's (Rule 60)
**Filed:** 2026-11-22 by a review of `docs/CC-CMD-2026-11-11-live-scores-other-sports.md` (Rule 87.4: found out of scope, filed, not carried)
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** FILED 2026-11-22. Nothing here is built. Task 0 is the first command and nothing else starts before its result.

---

## Why this exists

The relay adds `fetchedAt` and `staleSeconds` to a `/v2/games` body it answered from its mirror instead of from the upstream (`field-relay-nba` `src/index.js`, the object spread at about L4958 and the failover read at about L4593, read 2026-11-22). The lab's `LiveFeed.decodeFeed` reads neither key, so during a failover a `live` game whose score is minutes old reads as current on the card, with the same clock text as a fresh one. This applies to every sport the poll asks about, soccer included since 2026-11-11.

## Task 0 — the premise, one command (Rule 100)

The premise is that a body with `staleSeconds` can reach the page with a game `live`. Not read: no committed capture holds a body with `staleSeconds` (`grep -l staleSeconds outbox/live-capture-*.json` returns nothing as of 2026-11-22). Command: dispatch `live-shape-capture.yml` while the relay's upstream for one sport is failing, or read the relay's own record of failovers (`grep -n "_v2StaleSeconds" src/index.js` in field-relay-nba names the branch that sets it), and print `staleSeconds` and the games' `state` from the body. If no body can be produced, the item stays STAGED.

## Task 1 — build, only if Task 0 shows a stale body with a live game

Read `staleSeconds` in `decodeFeed`; when it exceeds a stated number of seconds (chosen from Task 0's observed values, not assumed), the reading for a `live` game is `LiveUnavailable "the feed's copy is N s old"` and the card says `live score unavailable`, as a failed poll does. Pin it with a Suite row (a body with `staleSeconds` over and under the limit), a render-check scenario, and a mutation. Update `scripts/live-score-probe.mjs` and `scripts/check-live-probe-keys.mjs` in the same commit (the probe's decoder is a copy).

## Done condition

A committed capture or probe output holding a body with `staleSeconds`, and the card for its live game reading `live score unavailable` in a render-check scenario that scripts that body; or Task 0's command output showing no such body can occur, recorded here with the date.

## Not in scope

A relay change; push of any value (ADR-002 Rule A).
