# The 51 MLS pairs: is `indistinguishable` the data, or the instrument?

`classifyPair` returns `duplicate` only on evidence — two rows sharing an
`espn_event_id`, or two rows sharing a `start_time`. The 51 MLS clusters carry
neither, so `indistinguishable` is the honest verdict **from the four fields the
identity probe reads**. It is not a statement that no discriminator exists.

`scripts/probe-mls-pair-discriminators.mjs` asks two further questions, cheapest
first:

1. **Does any other column separate the two rows?** The table has more than four.
2. **What does the source say?** Two MLS clubs playing each other twice on one
   date is not something the league schedules — but asserting that from knowledge
   is exactly the move this repo keeps deleting. The relay serves the slate. Ask
   it how many fixtures it lists between those clubs on that date.

## Merging is deliberately not in scope

This probe writes nothing to D1. A merge deletes a row, and *do not delete
archive rows without explicit human approval* is standing. What it produces is
the evidence a merge would need.

## Recon result — the discriminator exists

```
=== columns regular_season_games actually has ===
id sport league date home away home_score away_score venue streams note tags crew
local_note created_at opening_odds closing_odds drama_peak drama_arc
espn_event_id went_to_ot finalized_at start_time importance
```

Twenty-four columns. The identity probe reads four of them.

```json
{"id":"2026-08-29-mls-dc-lafc","home":"D.C. United","away":"Los Angeles Football Club",
 "venue":"Audi Field","created_at":"2026-06-30 17:13:25",
 "opening_odds":"{...draftkings...captured_at 2026-08-29T10:01:46...}",
 "espn_event_id":null,"start_time":null,"home_score":null}
```

**The dash rows carry `venue` and `opening_odds`**, which nothing had looked at.
They also share one `created_at` — `2026-06-30 17:13:25` on all four sampled —
which is a single-import signature, not a per-game one.

```
=== does the relay serve an MLS slate? ===
  date=2026-08-29 -> HTTP 200  {"sport":"mls","games":[{"id":"espn:761755",
    "espnEventId":"761755","state":"final","start":"2026-08-29T20:30Z",
    "home":{"name":"Seattle Sounders FC","abbr":"SEA","score":2}, ...
```

**Yes, with ESPN event ids.** Both `2026-08-29` and `20260829` are accepted.
`/context/date?date=` returns 404 — wrong parameter shape, and not needed.

So the authoritative discriminator exists and is one fetch away: how many
fixtures the league actually played between those clubs on that date.

## The sweep, written against those shapes

### The two predicates, and why each has four states rather than two

`compareField` returns `agree` | `differ` | `one-null` | `both-null`. The middle
two are the point: a column absent from both rows discriminates nothing, and
counting `both-null` as agreement would let twenty empty columns "prove" a
duplicate. A column present on one side only is the stub pattern the whole defect
is made of.

`slateVerdict` returns `one-fixture` | `doubleheader` | `absent-from-slate` |
`not-observable`. A slate that failed to load is not "no duplicate found".

### The slate outranks the fields, deliberately

Two rows of one fixture can disagree about a venue string without being two games
— one writer says `Audi Field`, another `Audi Field, Washington` — so a field
difference is weak evidence in the direction that matters least. How many
fixtures the league played is not a formatting question.

`created_at` and `league` are excluded from the field comparison. `created_at`
records the write, not the fixture, and the whole defect is that the two rows
were written at different times. `league` is null on every dash row measured, so
it could only ever return `one-null`.

### One limit, asserted rather than hidden

`sameTeam` is a token-subset match, so `LAFC` does **not** match
`Los Angeles Football Club` — `lafc` is not a token of it. An abbreviated slate
entry against a spelled-out archive row would yield zero and read as
`absent-from-slate`, which is indistinguishable from a fixture never played.

The measured data does not hit this: recon showed the archive row carrying the
full name and the slate carrying `Seattle Sounders FC`, both spelled out. The
self-test asserts the limit so it fails loudly if `sameTeam` ever grows an alias
table, and the sweep prints every `absent-from-slate` pair so the failure mode is
a number rather than a silence.

**My first version of that test was itself wrong** — it asserted `LAFC` *should*
match, which is the same alias mistake this session already made once with
`D.C. United`. The code was right and the test was wrong.

22/22 self-tests. A mutation making the slate never win drops it to 21/22.

## Result — RESOLVED. All 51, on evidence.

Run `33776839924`.

```
  verdicts:
      51  duplicate
  decided by:
      51  slate
```

**`indistinguishable` was the instrument, not the data.** Every one of the 51
pairs is one fixture the league played once, and the relay's own slate says so.

- 51 pairs, **51 distinct ESPN event ids** as merge keys — no key collides, so no
  merge would fold two real fixtures together.
- 8 dates: `2026-08-08`, `08-15`, `08-16`, `08-19`, `08-22`, `08-23`, `08-29`,
  `08-30`.
- `slate_matches == 1` on all 51. Not one `doubleheader`, not one
  `absent-from-slate`, not one `not-observable` — so the naming-mismatch failure
  mode the self-test guards against did not fire.

### The fields agree independently

| field | `agree` | `differ` | `one-null` |
|---|---|---|---|
| venue | 46 | 5 | 0 |
| home_score | 0 | 0 | 51 |
| away_score | 0 | 0 | 51 |
| start_time | 0 | 0 | 51 |
| streams | 0 | 0 | 51 |

`home_score`, `away_score`, `start_time` and `streams` are `one-null` on all 51 —
the stub pattern, and the reason `classifyPair` could not answer. It reads
`start_time` and `espn_event_id`, and both are absent from exactly one side of
every pair.

**`venue` agrees on 46 of 51 and never on a value the two rows could not share.**
That is a second, independent line pointing the same way.

### The five that disagree are why the slate goes first

```
2026-08-29  2026-08-29-mls-col-rsl    MLS_2026-08-29_colorado_saltlake
2026-08-29  2026-08-29-mls-rbny-phi   MLS_2026-08-29_redbullny_philadelphia
2026-08-22  2026-08-22-mls-rbny-chi   MLS_2026-08-22_redbullny_chicago
2026-08-19  2026-08-19-mls-rbny-nsh   MLS_2026-08-19_redbullny_nashville
2026-08-15  2026-08-15-mls-col-skc    MLS_2026-08-15_colorado_kansascity
```

All five are Colorado or Red Bull New York **home** games. Had `pairVerdict` let
the fields win, these five would have been called `two-games` and the merge would
have left them in place.

The strings, from run `33777097281`:

| pair | dash row | underscore row |
|---|---|---|
| `2026-08-29-mls-col-rsl` | `DICK'S Sporting Goods Park` | `Dick's Sporting Goods Park` |
| `2026-08-15-mls-col-skc` | `DICK'S Sporting Goods Park` | `Dick's Sporting Goods Park` |
| `2026-08-29-mls-rbny-phi` | `Sports Illustrated Stadium` | `Red Bull Arena` |
| `2026-08-22-mls-rbny-chi` | `Sports Illustrated Stadium` | `Red Bull Arena` |
| `2026-08-19-mls-rbny-nsh` | `Sports Illustrated Stadium` | `Red Bull Arena` |

**Two causes, neither of them two grounds.** Colorado's is capitalisation and
nothing else. Red Bull New York's is one stadium under two names — the two
writers took the venue from sources that renamed it at different times.

This is measured rather than inferred, which is the whole reason the probe was
changed to store values and re-run. The earlier draft of this section said the
obvious reading *was* two spellings of one ground and refused to record it as a
finding, because the artifact held only the comparison state. It now holds the
strings, and the reading is confirmed.

## What this unblocks

`CC-CMD-2026-09-01-mls-dual-writer-duplicate` Task 3 says a shared upsert key
"cannot be designed until the second writer has a name". For these 51 that is now
false: each pair has an authoritative ESPN event id, and `d253209` already keys
`/archive/game` on a bare numeric `source_id`. The key exists; the writer's
identity is not needed to use it.

**The merge itself is not taken here.** It deletes 51 rows, and *do not delete
archive rows without explicit human approval* is standing.
