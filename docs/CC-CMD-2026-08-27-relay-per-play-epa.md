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

> **CORRECTED 2026-08-27, at execution.** The shape above was written without
> reading the renderer. `_buildUFLEpaHTML` prints `lp.situation`, so a route
> serving only these five fields is one its only consumer cannot render from —
> the switch was blocked on it. The line "belongs to whoever displays it" is
> still right and the shape was still wrong: the relay now serves the three
> numbers the label is built from (`down`, `distance`, `yardsToEndzone`, under
> ESPN's own names) and the client formats them in `_epaSituation`. Both the
> transcription check and the live probe assert the label rebuilds from those
> numbers byte for byte, so the string's absence is measured lossless rather
> than asserted to be. Also added: `drive`, `currentDrive`, `driveCount` — the
> client renders ONE drive and could not otherwise tell which plays are in it.

**Client.** `jubilant-bassoon` switches `_fetchNFLGameEpa` to read this route
instead of computing. `_computeESPNPlayEPA`, `_epLookup` and `_epTableLoad` are
then dead and must be deleted in the same change, not left beside the new path —
two models is the thing this ask exists to prevent, and leaving the old one
"just in case" recreates it.

> **CORRECTED 2026-08-27, at execution. Only `_computeESPNPlayEPA` was dead.**
> `_epLookup` has six call sites, not three: `_computeESPNPlayEPA` (6894, 6905,
> 6910) **and `_computeSRPlayEPA`** (6762, 6771, 6778), the UFL/SportRadar
> model. This route is NFL-only. Deleting `_epLookup`, `_epTable` and
> `_epTableLoad` as instructed would have taken the UFL EPA panel with it, and
> the instruction was written without grepping for the second caller — the
> Rule 71 step this document's own probe block demands.
>
> The end state is one model per sport, not two models of one quantity, which
> is what the ask actually wanted. `_computeSRPlayEPA` stays a browser-side
> model until a relay route covers UFL too; that is a separate ask and is not
> filed, because nothing needs it yet.

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

## CLOSED 2026-08-27 — all three done conditions met

| # | condition | result |
|---|---|---|
| 1 | non-empty `plays`, finite `epa`/`ep_start`/`ep_end`, boolean `scoringPlay` | **PASS** — live probe run 33123265487, `outbox/nfl-epa-route-probe-2026-08-27T22-37-58-947Z.json` in field-relay-nba |
| 2 | relay `epa` equals the client's to 2dp, ≥10 enumerated pairs | **PASS** — Seahawks at Titans, 149 route plays / 149 client plays / **0 disagreements**, 12 pairs enumerated in that artifact, all non-zero (`-0.17, 1.08, -0.47, 0.8, 0.1, 0.18, 1.31, 3.43, 0.86, -0.02, 0.06, -0.65`) |
| 3 | `grep -c "_computeESPNPlayEPA"` in the client returns 0 | **PASS** — jubilant-bassoon `7f6fab4`, and smoke assertion **A-NFLEPA-2** now asserts the absence on every build, so the grep is a blocking check rather than a one-off |

Commits: field-relay-nba `7d95d2f` (situation inputs, truthful `currentDrive`),
`fca3665` (daily heartbeat, named checks in the artifact); jubilant-bassoon
`7f6fab4` (the switch, smoke 986/0, SW_VERSION `2026-08-27a`).

### Three defects the execution found, all the same shape

**The route passed the whole `epa_table.json` document to the lookup.** The 1120
entries live under `.ep`. Every key missed, `?? 0` came back, and the live probe
reported "ROUTE MATCHES CLIENT — 0 disagreements" — both sides agreeing on a
field of zeros, because only the client had unwrapped. The tell was a touchdown
scoring exactly 6.96.

**`currentDrive` was named for one thing and measured another.** Its two ternary
arms were the same expression: it meant "the drive in progress" and computed
"the index of the last drive".

**Both "verbatim" copies of the client reference had silently dropped its
`downs`/`sit` lines.** Nothing compared `situation`, so the omission cost nothing
and stayed invisible until a new check read it and got the string `"undefined"`
for all 305 plays. A reference pruned to what is currently checked agrees with
whatever it was pruned to match.

### Follow-up, automated (no carry-forward, Rule 87)

`nfl-epa-route-probe.yml` reverses its own "NO SCHEDULE" and adds a daily cron,
because the client became a live consumer of this route today: an upstream ESPN
shape change needs no push from either repo to break it, and the transcription
check is offline. `NOT OBSERVABLE` stays fatal on a deploy and is neutral on the
heartbeat. Each run now records its assertions by name in the committed manifest.

**PlayFrame stays frozen** at `6f23c76`. This ask was meant to unfreeze it by
giving it a producer, and it has one now — but wiring the frame to this route is
the open question above (`PlayId` is a 64-bit numeric field; ESPN's `id` is a
string), and that decision is not this ask's.
