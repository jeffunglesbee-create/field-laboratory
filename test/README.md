# Test fixtures

**Nothing here is real data.** Everything in `data/` is a verbatim live capture;
everything in this directory is deliberately corrupted and exists only to prove
the failure paths actually fire.

Keeping them separate matters: a corrupted fixture that drifts into `data/`
would quietly become "real relay data" to the next reader.

## `malformed-nested.json`

A copy of a real 2026-05-15 game with two injected faults, both inside the
double-encoded string fields:

| Field | Fault |
| --- | --- |
| `drama_arc` | truncated mid-array — `"[15,15,36,"` |
| `opening_odds` | inner `moneyline.home` is the string `"NOT_AN_INT"` |

The outer JSON stays valid, which is the whole point — this is a payload that
passes every structural check and is still wrong on the inside.

### Verified behaviour

```
decode-status: decoded 1 game(s) for 2026-05-15
drama:  ARC MALFORMED: Given an invalid JSON: Unexpected end of JSON input
odds:   ODDS MALFORMED: Error at: `$.moneyline.home` Expecting an int but instead go…
score still rendered: 75–81
page errors: none
```

Three things this establishes, none of which were assumed:

1. The failure is **reported**, not swallowed into an empty array or a zero.
2. The failure is **contained** — the game still decoded and the card still
   rendered its correct score. One malformed odds blob does not take down the
   scoreboard.
3. Nothing **threw**. No page errors.

Run it against the dev server with:

```
node scripts/serve.mjs &
open 'http://localhost:8080/?data=../test/malformed-nested'
```
