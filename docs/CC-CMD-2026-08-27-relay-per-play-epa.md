# CC-CMD-2026-08-27-relay-per-play-epa

**Filed from:** field-laboratory
**Ask to:** field-relay-nba, then jubilant-bassoon — one change, two repos, per Rule 70
**Status:** FILED, not started.

## Why this exists

`src/PlayFrame.fs` is a working binary ingest path with no producer. It is frozen
at `6f23c76` (`outbox/2026-08-27-playframe-frozen-and-the-days-accounting.md`)
precisely so it stops being improved while unused. This is the ask that unfreezes
it.

The nearest real source is EPA, and today it is computed **in the browser**:
`jubilant-bassoon/src/legacy/field.js` polls every 30s, fetches
`/espn-summary/sports/football/nfl/summary?event=<id>` through the relay, and runs
`_computeESPNPlayEPA` against an EP table it pulls from
`${RELAY}/nflverse/epa_table.json`.

Moving the computation relay-side is worth doing for a reason that is not
convenience: **the laboratory must not build a second EP model.** A second
measurement is free to disagree with the first, which is the divergence class
`CONTRACTS.md` exists to prevent and the same reasoning recorded in
`outbox/2026-08-27-closing-odds-promoted-on-a-second-date.md`. One model, one
owner, two consumers.

## ADR-002, settled before any code

EPA passes both tests independently, which is the standard the 2026-08-02 RUWT
baseline audit states: *"Both tests (Rule F content, Rule A delivery) must
independently hold — passing one doesn't clear the other."*

- **Rule F (content):** nflfastR publishes EPA and the EP model is theirs. A
  neutral data vendor could serve this. Permitted.
- **Rule A (delivery):** a GET route, served on pull, no cron, no push. Permitted.

Nothing here computes drama, watch value, or a volatility label. If a later
revision adds one, both tests must be re-run — that is not a formality, it is the
line `getVolatilityLabel` sits on the wrong side of.

## Probe block — run first, from HEAD (Rule 87)

Nothing below may be written from memory. Two of these are already answered and
are restated so the next session does not re-derive them.

```bash
cd field-relay-nba && git log --oneline -5

# 1. ANSWERED 2026-08-27: the EP table is already allow-listed and served.
grep -n "epa_table.json" src/index.js          # NFLVERSE_OUT_ALLOWED, ~line 780

# 2. ANSWERED 2026-08-27: the ESPN summary is already proxied.
grep -n "espn-summary" src/index.js            # route comment ~line 688

# 3. OPEN — Rule 78. What caching does the espn-summary proxy apply? A new route
#    that fans out per game MUST replicate it exactly. Read the handler, do not
#    grep for a keyword: the file has embedded nulls and range greps missed it.
sed -n '688,760p' src/index.js | tr -d '\000'

# 4. OPEN. Where does the route section start at current HEAD, and what is the
#    established `pathname.startsWith` shape beside it?
grep -n "pathname === '/\|pathname.startsWith('/" src/index.js | head -20

# 5. OPEN. The MCP probe allow-list is a hardcoded array in the /mcp handler.
#    A new route that should be probeable must be added to it.
grep -n "mcp" src/index.js | grep -i "allow\|probe" | head
```

## The ask

**Relay.** A GET route serving per-play EPA for one NFL game:

```
/nfl/epa/plays?event=<espnGameId>
```

Its computation must be a transcription of `_computeESPNPlayEPA`, not a
reinterpretation — same SKIP list, same scoring branch (`3` for a made field
goal, `6.96` otherwise), same turnover branch (`-EP(1, 10, 100 - yl100)`), same
`yardsToEndzone == yardline_100` identity with no conversion. Every one of those
was verified live against a real game by `scripts/nfl-epa-shape-probe.mjs`
(14/14, artifact `outbox/nfl-epa-shape-probe-20260815T013003Z.log`); re-read that
log before writing the branches.

Response shape, per play, and no more than this:

```json
{ "event": "401547353",
  "plays": [ { "id": "…", "epa": -0.42, "ep_start": 1.83, "ep_end": 1.41,
               "scoringPlay": false } ] }
```

`situation` is a display string and belongs to whoever displays it. `id` is
carried through **as ESPN gives it** — a string. That matters downstream: see the
open question below.

**Client.** `jubilant-bassoon` switches `_fetchNFLGameEpa` to read this route
instead of computing. `_computeESPNPlayEPA`, `_epLookup` and `_epTableLoad` are
then dead and must be deleted in the same change, not left beside the new path —
two models is the thing this ask exists to prevent, and leaving the old one
"just in case" recreates it.

## Open question this ask does NOT decide

`PlayFrame.playId` is a 64-bit numeric id read into a double with an exactness
guard. ESPN's play `id` is a **string**. Whether the frame's `PlayId` is the right
shape for this data is a real question and is deliberately not answered here —
answering it inside a relay ask would be the layout churn the version byte was
added to make unnecessary. Decide it when the frame is unfrozen, with the version
mechanism available.

## Done condition

Not "the route deploys". All three, as probe output:

1. `curl -s "$RELAY/nfl/epa/plays?event=<id>" | node -e '…'` prints a non-empty
   `plays` array where every entry has finite `epa`, `ep_start`, `ep_end` and a
   boolean `scoringPlay`.
2. For one game, the relay's `epa` values equal the client's for the same plays
   to 2dp — the transcription is a transcription. An enumerated table of at least
   10 play/value pairs, committed to the outbox, is the artifact. "Looks right"
   is not one (Rule 89).
3. `grep -c "_computeESPNPlayEPA" jubilant-bassoon/src/legacy/field.js` returns
   **0**. A route that ships beside the old computation has not moved the model,
   it has duplicated it.

## Scope boundary

Do not touch: `wrangler.toml` bindings, cron frequencies, any existing route,
`PlayFrame.fs` (frozen), the drama or volatility paths.
