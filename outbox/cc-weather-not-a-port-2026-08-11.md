# Weather, not a port — 2026-08-11

Jeff:

> Build weather in f# based on playground without a straight port. Check docs on
> drive for complete context.

Drive was the instruction that mattered. Five documents, and one of them decides
the whole design.

## The document that decides it

FIELD's **May 22 2026 session doc**, describing a weather engine that had been
live and feature-flagged as working since May 19:

> Six functions were called but never defined anywhere in the file:
> `wxDescription()`, `wxIcon()`, `wxAlert()`, `wxBadge()`, `isOutdoorVenue()`,
> `getVenueCoords()`. `fetchWeather`'s try-catch swallowed the ReferenceError
> silently. `wxCache` stayed empty. No badges ever appeared. The feature-flag
> `'weather-drama-bonus': '2026-05-19'` was a lie.

Three days of a feature that never executed once. The try-catch that hid it was
not negligence — it was there to make a network fetch resilient, and it did
exactly what it was written to do.

That is the sharpest instance this project has of its own question. In F# each of
those six names is **FS0039** and the build stops. `docs/WEATHER-PROOF.md` case 1
compiles `wxBadge (...)` and the compiler refuses it. There is no configuration
in which it reaches a user.

The same doc's sibling records `0c77405 — fix: remove duplicate WX_DIR (syntax
error)` and `a17993c — fix: repair mangled try-catch in dramaScoreLive weather
hook`, and the May 23 doc has the top-level IIFE that blanked every section
because one uncaught exception ran before `fetchSchedule()`. Its stated lesson is
*"top-level IIFEs = always try-catch. No exceptions."* That is a rule a person
has to keep. It is not a rule in a language where the call does not compile.

## What was built

`src/Weather.fs` and `src/Venues.fs`. Not a port — every type answers a failure
that is written down, and the tables below say where.

| Type | The failure it answers | Source |
| --- | --- | --- |
| `FS0039` on an unbound call | six undefined functions, swallowed, flagged as shipped | May 22 doc |
| `Coordinates`, private, validated | `getVenueCoords` returns `[lat, lon]` or null; 400 is a fetch | May 9 log |
| `CoordKey`, its own type | cache keyed `lat_lon` to 3dp; 98 keys → 95 locations | playground |
| `RoofType = OpenAir \| Retractable \| Dome` | flat `isOutdoor` boolean has no third state | production |
| `RoofState.UnknownRoofState` | nothing knows if a retractable roof was *closed* | playground comment |
| `Precipitation`, one fact | precipitation includes snow, so snow reads as "rain" | playground comment |
| `degF` / `mph` / `mm` | units are query parameters, consumed as bare numbers | May 9 log |
| `SlateWeather`, three cases | an outage must not render "no venues with coordinates" | playground comment |
| `put` takes a `Reading` | failures deliberately not cached | playground comment |
| `RankableReading`, private | warmest/coldest ranks open venues only | playground comment |

Two of those are worth drawing out.

**The roof is data, not a name.** Production answers "does this venue get
weather?" by fuzzy-matching the venue *name* against `["arena","garden","center",
"dome",…]`, with an `INDOOR_EXCEPTIONS` list for the ones it got wrong. The
exceptions list is the tell: each wrong answer adds a string rather than a fact,
and "Madison Square Garden" is distinguished from "Fenway Park" by spelling. Here
the roof sits beside the coordinates in one entry — one place to be wrong, and
visible. Which is how production's actual error becomes assertable: **loanDepot
park is filed `isOutdoor: true` and is retractable.**

**The outage case is a union, not a throw.** Playground gets this exactly right
and protects it with `throw`, because that is the tool available. A throw is
swallowable, and the top of this entry is what swallowing looks like. As a union,
a renderer that handles two of the three cases does not compile — proof case 9.

## Deliberately not carried over

`weatherDramaModifier` — the signed drama delta from the May 22 build (snow +10,
AQI −15, stacking thresholds). It feeds a composite drama score, and ADR-002
PROHIBITED #3 makes displaying a raw composite a bright-line CRITICAL. This repo
has already sealed that number twice, and adding a new contributor to it before
the display path is settled would be walking into the same room a third time.

AQI, gusts, `direct_radiation` and the park-orientation wind work are all in the
Drive record and all buildable on these types. Not built, not claimed.

## Evidence

`docs/WEATHER-PROOF.md` — ten cases, each injected into real source and compiled,
passing only if the build fails with the stated code. `proof-check` 25/25 →
**35/35**.

`Suite.fs` — thirteen new checks on the F# harness, **29/29**, each with a
compulsory counterexample and the counterexample usually being the documented
bug: `("loanDepot park", OpenAir)` must fail; `(Retractable, PlayedInTheOpen)`
must fail; a `(2.0, 0.0)` reading called rain must fail; an outage rendering as
an empty slate must fail.

Two mutations, both killed: `retractable-assumed-open` and
`outage-reads-as-empty`.

No new gate row. The proof cases land in "doc claims are compiler-verified" and
the suite lands in "the F# harness refuses a check with no counterexample" —
both rows already exist and both now carry more. Adding a row would have inflated
the denominator without adding a guard.

## The gate failed this work first, and reported it verbatim

The first full run came back **92/100 with two rows failing**, which under the
conjunction is a fail:

```
    - breaking each invariant makes a check fail (20 pts)
    - no value is written without being read back (20 pts)
```

One cause. `unused-check` named five public values in `Weather.fs` that nothing
read: `latitudeOf`, `longitudeOf`, `cacheSize`, `decodeReading`, `forecastUrl`.
`mutation-check` failed alongside it because its unmutated-tree precondition runs
that row.

That is the guard from `771cf8e` — written for four orphans found the same way —
catching my own new code the same day. Speculative API written because it looked
like it belonged, never read by anything.

The fix was not the same for all five:

- `latitudeOf`, `longitudeOf`, `cacheSize` — deleted. Accessors nothing needed.
- `decodeReading`, `forecastUrl` — given real consumers in `Suite.fs`, because
  they are the live-fetch path and deleting them would delete the work. Three new
  checks: a real-shaped `current` block decodes; an impossible reading (rain
  exceeding total) is **refused** by the decoder; and the request asks for
  `temperature_unit=fahrenheit`, with the metric request as the counterexample,
  since changing the URL without changing `degF` is exactly the drift the
  measures exist to catch.

**And wiring those consumers found a real bug.** `currentDecoder` called
`failwith` inside the object decoder for an impossible reading — which throws
past `Decode.fromString` rather than returning `Error`. `decodeReading`
advertised a `Result` and could raise. That is the same shape as the try-catch at
the top of this entry: a failure taking a route the signature says it cannot
take. It now decodes to a `Result` and `Decode.andThen` lifts it into a genuine
decode failure, which is what the second new check asserts.

Nothing here was found by reading the code. `npm run gate` failed, named the
rows, and the fix for the row surfaced the decoder bug on the way past. The suite
went 29/29 to **32/32**.

## The panel and the live fetch

Approved mid-session and built. `src/WeatherView.fs` plus a fifth tab.

The renderer is **total over `SlateWeather`** — it handles all three cases or
does not compile, which is the whole reason that union exists rather than a
throw. It also renders the venues the table could NOT locate, which playground
drops: a dropped name is indistinguishable from a venue with no weather, the same
collapse the empty state suffers, one level earlier.

`fetchOne` resolves failures rather than rejecting — the `Promise.allSettled`
behaviour playground chose, for the reason it gives: one bad venue should degrade
to that venue missing, not hide every success behind one transient error. One
request per distinct COORDINATE, never per venue, so the aliases are one call.

**Two things went wrong wiring it, both worth recording.**

The first: I edited `public/index.html`. `public/` is generated and gitignored —
`build-site.mjs` copies the repo-root `index.html` over it — so the markup was
wiped by the next build while `Program.fs` happily referenced `panel-weather`. A
tab that exists in code and not in the page. Caught by grepping the built output
for `tab-weather` and finding zero.

The second: I ran `npm run gate` in the background and then edited source and
rebuilt on top of it, while `proof-check` had `Scoreboard.fs` mutated. The build
failed with FS1093 on `AmnestyZone`. That is the third time today two of this
repo's own tools have collided over the working tree, and the second time I have
caused it after writing the first one up.

`tab-check` and `live-tabs-check` both hardcoded four tabs. Updated to five, with
the arrow-key walk extended to reach Weather and `End` landing on it —
`tab-check` 24/24.

**The live fetch: `scripts/weather-live-check.mjs`, a verify.yml step.** Both
directions, because a happy-path-only live check would be especially hollow for
this feature: the reason it is being rebuilt is that production's version never
executed once and reported success anyway. It asserts the real request answers
200, that the TRANSCRIBED decoder reads the REAL payload (the fixture in
`Suite.fs` comes from FIELD's May 9 log, not from a capture — this is where
transcription meets service, the job `pick-shape-check` does for the pick
fixture), that an out-of-range latitude is not answered 200, and that the two
answers differ.

### And the gate failed it again — this time on the design

```
  3 FAILING ROW(S). Do not commit.
    - render checks pass on both captures (30 pts)
    - grouping and date navigation pass (30 pts)
    - breaking each invariant makes a check fail (20 pts)
```

I diagnosed that as environmental — a missing local server — and was **wrong**;
it reproduced with the server up. The real cause, once I stopped guessing and
captured the error:

```
FAIL  no page or console errors
      → console: Failed to load resource: net::ERR_TUNNEL_CONNECTION_FAILED
```

The weather fetch fired on **every page render**, so every render check in the
repo now saw a failed third-party request. The assertion was right and the design
was wrong: a viewer who never opens the Weather tab was being charged 30-odd
Open-Meteo requests on every date navigation.

Weather now loads **lazily, on first opening of the tab**. `renderIdle` handles
the before state and is deliberately *not* a fourth `SlateWeather` case — "not
requested yet" is a fact about the panel, not the slate, and folding it in would
commit inside this file the exact collapse the file is written against.

Playground runs a 45s interval to demonstrate two poll loops coexisting. That is
a different goal, and this is the cheaper and more honest behaviour — which is
what "not a straight port" should mean when it is more than a slogan.

`check` 13/13, `check:hard` 13/13, `check:nav` 18/18, `tab-check` 24/24.

Run here the live check reports **3/6** and says why: `both returned 403`. This sandbox
cannot reach `api.open-meteo.com`, so the good and bad requests are
indistinguishable from behind the proxy — the check refusing to pass rather than
pretending. It runs on the runner.

CONFIDENCE: 96.

Artifacts: `proof-check` 35/35 including the ten cases above, FS0039 among them;
`node build/VerifyMain.js` 29/29 after the self-test; both new mutations killed;
the gate. Every claim about production is quoted from a Drive document named in
this entry, not recalled.

Docked four: `Venues.fs` is a 35-entry working subset of playground's 98-key
table, chosen to exercise both alias pairs and all three roof types with real
venues. Its coordinates are transcribed from playground's hand-reviewed table and
have not been checked against a source — the same class of transcription risk
`pick-shape-check` exists to close for the pick fixture, and there is no
equivalent check here yet.
