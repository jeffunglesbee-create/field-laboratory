# verify 159: 13 venues, 0 chips, and nothing that could say why

**Run:** [33032833828](https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/33032833828), commit `7f9c78a`, 2026-08-27T02:19:43Z.
**Step:** "Render check against the LIVE slate" — 18/22.

```
FAIL  the chips all filled within the wait
      → page.waitForFunction: Timeout 20000ms exceeded.
FAIL  every card whose venue the table knows carries a live chip
      → 13 known venue(s) on this slate, 0 chip(s) filled
FAIL  every live chip reads as a temperature and nothing else → []
FAIL  every live chip carries a real roof caveat → []
```

## It is not the commit that carried it

`7f9c78a` added `SpreadHomePrice`/`SpreadAwayPrice` to `Odds` and a price
adjudicator to the census. Neither is on the weather path. That is an argument,
not evidence, so here is the evidence:

| run | workflow | window | commit | result |
|---|---|---|---|---|
| 33032652416 | verify | 02:14:20 → 02:16:20 | `944722f` | success, 22/22, chips filled |
| 33032763074 | deploy | 02:16:22 → 02:17:20 | `944722f` | success |
| 33032812888 | live-check | 02:17:21 → 02:18:24 | `944722f` | **success** — same render-check, live URL, no tolerance flag |
| 33032833828 | verify | 02:17:47 → 02:20:08 | `7f9c78a` | **failure**, render step 02:19:43 |
| 33032958380 | deploy | 02:20:10 → 02:20:11 | `7f9c78a` | **skipped** (paths filter) |

`render-check.mjs` under `check:live` targets
`https://field-laboratory.jeffunglesbee.workers.dev/`. The deploy for `7f9c78a`
never ran. The bytes under test at 02:19:43 are the bytes `live-check` passed on
at 02:18:24, seventy-nine seconds earlier. The page did not change; the answers
it got did.

## What actually failed, and what could not be said about it

`WeatherView.fetchOne` catches everything and returns
`Error "<venue>: HTTP <n>"` or `Error "<venue>: <message>"`. When every request
fails, `slateWeather` built `EveryFetchFailed eligible` — the venue NAMES —
and dropped the `failed` list on the floor. `WeatherView.render` then printed
"Weather is unavailable: all 13 venue requests failed." and nothing else.

So three different events produced one identical page and one identical log
line:

1. Open-Meteo was down.
2. Open-Meteo refused the burst (`429` — this page did exactly that on
   2026-08-15, which is why `maxInFlight = 4` exists).
3. The requests never reached the host from that runner.

Each has a different fix. Only the second is this page's own doing. **Which one
happened on run 159 is unrecoverable, because nothing recorded it.**

This is the same defect the last three sessions kept finding under other names:
a value whose name and its measurement disagree. `EveryFetchFailed` is named for
an outage and measures "readings is empty".

`render-check.mjs`'s attribution probe has the matching flaw. `openMeteoDown =
!r.ok` collapses 429, 503 and a thrown connection error into one boolean — the
three things the probe exists to tell apart — and it is one request, from node,
issued *after* the 20-second wait has already elapsed. A service that refuses a
thirteen-request burst answers a single late request perfectly well. The probe
returned OK on run 159, which is why the tolerance branch did not fire; that
tells us the host was reachable from the runner at 02:20:06 and nothing about
what the browser was told at 02:19:44.

## The change

- `Weather.SlateWeather.EveryFetchFailed` now carries `why: string list`
  alongside `attempted`. `slateWeather` passes `failed` into it.
- `WeatherView.render` prints the reasons in `.wx-error__why` under the outage
  line. `Readings` has printed its failures since it was written; the case where
  the reason is the whole story was the one discarding it.
- `render-check.mjs` reads the page's own account (`#panel-weather`'s
  `.wx-error`, `.wx-error__why`, `.wx-partial`, `.wx-empty`, `.wx-idle`) before
  closing the browser, and reports the probe's HTTP status rather than a
  boolean. The chip failure now reads:

  The format, with the status values shown as placeholders rather than as a
  claim about what run 159 saw:

  ```
  13 known venue(s) on this slate, 0 chip(s) filled. Open-Meteo answered this
  runner: HTTP <status>. The page reported: Weather is unavailable: all 13
  venue requests failed. | Reported: <venue>: HTTP <status>; ...
  ```

- `Suite.fs` gains "a total failure carries what each request reported", with
  `([ "Fenway Park" ], [])` as the counterexample so the harness confirms it has
  teeth.

## What was NOT changed, deliberately

**Tolerance was not widened.** A 429 stays a hard failure everywhere, per the
2026-08-15 note: a 429 is the server saying this client is asking too fast, and
swallowing it leaves the page still asking too fast and merely stops reporting
the consequence.

**`maxInFlight` stays at 4.** Lowering it now would be a guess dressed as a fix.
If the next occurrence names a 429, the bound is the thing to change and there
will be a measurement to change it against.

## Done condition

**Shipped, not staged:** the F# check "a total failure carries what each request
reported" runs in `check:verify` on every push and carries its own
counterexample, so the union half is verified now.

**The remaining half is observable only when the condition recurs.** What is
staged: the failure-detail string in `render-check.mjs`. What blocks it: a
total weather failure on a live slate, which cannot be summoned. What unblocks
it: the next `check:live` or verify run whose chip checks fail. Verify command:
read that run's "Render check against the LIVE slate" step and confirm the
detail line for "every card whose venue the table knows carries a live chip"
contains `Open-Meteo answered this runner:` followed by an HTTP status or a
connection message, and `The page reported:` followed by non-empty text. A count
alone means this change did not work.
