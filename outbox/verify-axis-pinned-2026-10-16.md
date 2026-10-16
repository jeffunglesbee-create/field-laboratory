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
