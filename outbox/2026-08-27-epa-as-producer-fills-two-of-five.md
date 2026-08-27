# epa.js as the PlayFrame producer: it fills two fields of five

Asked to wire `epa.js` as the producer. Probed it first, and the wiring cannot be
done honestly as the layout stands.

## What the EPA path actually yields

`jubilant-bassoon/src/legacy/field.js` computes per-play EPA in the browser:
`_pollNFLEpa` every 30s → `_fetchNFLGameEpa(espnGameId)` → the relay's
`/espn-summary/sports/football/nfl/summary?event=<id>` →
`_computeESPNPlayEPA(play)` against an EP table fetched from
`${RELAY}/nflverse/epa_table.json`.

One play comes back as:

```js
{ epa, ep_start, ep_end, situation }
```

The ESPN play it reads carries `start.{down,distance,yardsToEndzone}`,
`type.text`, `scoringPlay`, `end.{…}`, `isTurnover` and `homeScore`/`awayScore`
— all verified **live**, not inherited: field-relay-nba
`scripts/nfl-epa-shape-probe.mjs`, artifact
`outbox/nfl-epa-shape-probe-20260815T013003Z.log`, 14/14 against a real game.

Against `PlayFrame.Wire.Outgoing`:

| field | source | state |
|---|---|---|
| `ExpectedPointsAdded` | `_computeESPNPlayEPA` → `epa` | **real** |
| `IsScoringPlay` | `play.scoringPlay`, boolean, probe-confirmed | **real** |
| `PlayId` | ESPN play `id` is a short string (`"24"` in the sample) | needs deciding |
| `WinProbability` | nothing in the payload | **absent** |
| `LeverageIndex` | nothing in any FIELD repository | **absent** |

Two of five. Wiring it as asked would write `0.0` into the two absent fields —
and 0.0 is a real win probability and a real leverage index. That is precisely
the defect this session has spent the day removing, installed into a wire format
where every future consumer would inherit it.

## What shipped instead: the frame can say "absent"

```fsharp
WinProbability: float option
LeverageIndex: float option
let inline isPresent (x: float) : bool = not (System.Double.IsNaN x)
```

`None` is written as NaN. Chosen over a presence bitfield in the spare bytes
21–23 for one reason: **NaN propagates.** A sum over a slate containing an absent
value is NaN, so absence cannot be quietly averaged into a number. A flag can be
ignored; a NaN cannot.

Two checks, each the other's counterexample — one alone proves half of it, since
"absent reads as absent" is satisfied by a reader that calls everything absent:

- an absent optional field reads as absent, never as zero — counterexample `Some 0.0`
- ...and a measured zero is a value, not an absence — counterexample `None`

Suite 80 → 82.

## What the real wiring still needs, and why it is not started

Computing EPA inside field-laboratory means an EP model in F# reading
`${RELAY}/nflverse/epa_table.json` and `/espn-summary`, plus the play
classification `_computeESPNPlayEPA` does (the SKIP list, the scoring branch, the
turnover branch). That is a build, not a wire — and it would put a **second EP
model** beside the client's, free to disagree with it. This repo already names
that failure in `2026-08-27-closing-odds-promoted-on-a-second-date.md`: a second
measurement in the laboratory would have been free to disagree with the relay's
own, which is the divergence class `CONTRACTS.md` exists to prevent.

So the honest options are a choice, not a default:

1. **Consume, don't recompute.** Have the relay serve per-play EPA on a route and
   let the laboratory read it. One model, one owner. Needs a relay CC-CMD.
2. **Narrow the layout.** Drop `WinProbability` and `LeverageIndex` from the wire
   record until something produces them. Honest, and it re-cuts a 24-byte format
   that came from the brief rather than from FIELD.
3. **Leave it.** The frame now carries absence correctly, so a partial producer
   is representable whenever one exists.

Nothing is blocked on this. Option 3 is where it sits.

## Local

`check:verify` 82/82 held, `check:proof` 71/71, weather-burst 11/11, unused,
clean-source, import-purity. No injections stranded.
