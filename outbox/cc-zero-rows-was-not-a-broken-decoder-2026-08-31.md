# Zero rows was not a broken decoder

**Date:** 2026-08-31
**Scope:** `scripts/drift-check.mjs`

`drift-sentinel` failed at 07:09 UTC. Its own drift-log row, written by the same
run:

```
| 2026-08-31 07:09 | 2026-08-31 | 0 | ok | 0 | …
```

**Zero games, status `ok`, run red.** The log and the exit code disagreed.

## The assertion

```js
check('every game row in the capture is accepted as a game',
  rawGameRows > 0 && games.length === rawGameRows && payload.Unnamed === 0, …)
```

`rawGameRows > 0` fails whenever the relay serves nothing — which at 03:09 ET is
what a correct relay serves.

## The clause was right, for what it was written against

Its comment says so, four lines up:

> a broken decoder maps every row to `None`, so `games + unnamed === rows` still
> balances perfectly at zero games. **Both captures are hand-checked** to contain
> no null-sided rows, so the assertion is the strict one.

**Captures.** This was written for pinned fixtures, where zero rows can only mean
the decoder collapsed. `drift-sentinel` then pointed the same code at a LIVE
payload, where zero rows is a Monday before the first fixture.

Neither the assertion nor the sentinel is wrong. The assumption travelled.

## The discriminator was already there and unused

```js
} catch { return -1 }
```

`rawGameRows` returns **-1** for a body that does not parse, precisely so an
unparseable payload cannot look like a small one. So `0` is unambiguous: parsed
cleanly, no rows. The value was computed with three meanings and then flattened
into a boolean.

```
-1  did not parse            → fatal
 0  parsed, no games         → empty slate, NOTE, no conservation law to test
>0  rows exist               → every one must decode, nothing un-nameable
```

## What is NOT weakened

The vacuity the clause guarded against is a broken decoder on a real payload:
`rawGameRows > 0` with `games.length === 0`. That still fails the conservation
clause, untouched.

Proven locally against `build/Desk.js` and committed captures — no relay, no
waiting for tomorrow's 03:09:

| fixture | rows | exit | result |
|---|---|---|---|
| games arrays emptied | 0 | **0** | `NOTE  the relay served 0 game rows…`, 10/10 |
| `data/context-2026-05-15.json` | 2 | **0** | `PASS every game row … accepted`, 11/11 |
| one row with no home/away | 3 | **1** | `FAIL … 3 row(s) in the file, 2 decoded, 1 un-nameable` |
| `{not json at all` | — | **1** | `FAIL payload decodes` |

The last row is why the `-1` branch is belt-and-braces: an unparseable body fails
`payload decodes` before reaching this assertion. It is kept because the
sentinel value exists and reading it as "no games" would be the exact confusion
this entry is about.

## Fourth file today

`brief-phase-live-check`, `live-tabs-check`, `schedule-live-check`, and now
`drift-check` — four checks, one fact. **2026-08-31 is the first day this
session where a scheduled job met a genuinely empty slate**, and every check
written against a populated one surfaced within eight hours of each other.
