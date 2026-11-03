# verify's axis check read the live slate — 2026-10-16

**State:** fixed in `package.json`. `npm run check:axis` passes locally on the
pinned capture (5/5).

## What failed

`verify` on `7e2585b` (run 38853525495), step "The score's weight axis
interpolates", verbatim:

```
page.waitForSelector: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.desk-card') to be visible
    at /home/runner/work/field-laboratory/field-laboratory/scripts/axis-check.mjs:176:14
```

The last green `verify` was `6a79087` on 2026-10-11 at 18:43 UTC.

## Why

`check:axis` pointed at `http://localhost:8080/` with no `?data=`. With no
`data` parameter the page renders the viewed date's LIVE slate from the relay
(`src/Program.fs` `dataUrl`). The run started at 05:00 UTC, 01:00 ET on
2026-10-16, and the relay's slate for that date was empty:

```
GET /context/date/2026-10-16  ->  {"ok":true,"date":"2026-10-16","games":{"regular":[],"postseason":[]}, ...}
```

No games, so no `.desk-card`, so the wait timed out. In the sandbox the same
check passes, because the relay is unreachable there and the page falls back to
a committed capture. The check measured whatever the slate happened to be at
push time.

Reproduced both ways against the local server:

| page | result |
|---|---|
| `?data=games-2026-08-09` with its games emptied | `page.waitForSelector: Timeout 30000ms exceeded`, the CI error |
| `?data=games-2026-08-09` unchanged | `5/5 checks passed` |

## The fix

`check:axis` now opens `?data=games-2026-08-09`, the capture `check:tabs`,
`check:hard` and `check:separation` already use. The font axis is the same on
any page that renders a score. `verify` answers "is this commit correct", and a
night with no games says nothing about the commit.

## Not changed

`live-check.yml` runs the same script against the DEPLOYED page's live slate,
on purpose. It has passed at night before (07:32 and 08:34 UTC on 2026-10-15),
so its exposure to an empty slate is not demonstrated, and it was left alone.
If it ever fails the same way, the same pin applies there: `data/` ships with
the site (`scripts/build-site.mjs` copies all of `data/` into `public/`).

## Update 2026-11-03 — live-check failed the same way, and now has the pin

The exposure above was "not demonstrated". It is now. In each of these runs the
only failing step is "The score's weight axis interpolates on the DEPLOYED page",
with `page.waitForSelector: Timeout 30000ms exceeded` on `.desk-card`:

| run | started (UTC) |
|---|---|
| 41028527600 | 2026-10-30 08:44 (error at 08:46:27) |
| 41583043477 | 2026-11-03 05:17 |
| 41587999128 | 2026-11-03 06:08 |
| 41591593999 | 2026-11-03 06:42 |
| 41594457470 | 2026-11-03 07:09 |

The last success before the four on 11-03 is run 41581099525 at 04:57 UTC, 23:57
ET on 11-02; the four failures all started after the ET date rolled over.

Measured at about 07:30 UTC on 2026-11-03, while it was failing:

| what | result |
|---|---|
| `GET /context/date/2026-11-03` | `games: {regular: 0, postseason: 0}` (11-02: 29 regular) |
| `GET /v2/games?sport=nhl&date=2026-11-03` | 11 games, source `nhle`; nba 0 |
| the deployed page, unpinned | "decoded 0 game(s) for 2026-11-03", no `.desk-card` after 25 s |
| `scripts/axis-check.mjs` on the deployed page, unpinned | `Timeout 30000ms exceeded`, exit 1: the CI error |
| the same, `?data=games-2026-08-09` | 5/5 passed; widths 124.17, 136.94, 143.5, 148.05 across wght 100/400/700/1000, control flat at 132.05 |
| `/data/games-2026-08-09.json` on the deployed site | 200, 3703 bytes; the page renders 2 cards from it in 3 s |

The sandbox's browser could not reach `statsapi.mlb.com` (the page printed
"schedule unavailable"), so the page text proves less than the relay reads do;
the relay's own payload and the script's own timeout are the evidence.

For 10-30 the slate was not observed, only the identical log signature.

Changed: `live-check.yml`'s axis step opens `?data=games-2026-08-09`. The
manifest records the page `url`, so `outbox/axis-manifest-latest.json` changes
once, to the pinned URL, on the next green live-check run.

Not changed: a pinned page that fails to render a card still ends in this raw
`TimeoutError`. That would be a real regression in the deployed build, not an
empty slate, and the message names the selector. Why the relay's date payload
holds no games for 11-03 while the schedule route lists 11 was not examined.
