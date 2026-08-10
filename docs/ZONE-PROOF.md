# The zone as a type: UTC was wrong for four hours a night

The laboratory keyed every date off `todayUtc()`. FIELD keys off Eastern. The
gap is a four-hour window that lands exactly on US sports prime time.

## Two questions that were being conflated

**What zone does the relay's `date` column use?** A property of the data.
Genuinely unknown — the relay serves AFL, MLS, WNBA, MLB and EFL Cup, three
continents, so per-competition local keying was a live possibility in which ET
would be as wrong as UTC for an Australian fixture.

Measured rather than assumed, across a live 18-game slate:

```
MLB:starts-after-date=6   WNBA:starts-after-date=2
MLB:same-utc-day=4        EFL Cup:same-utc-day=1    MLS:no-start-time=5
```

Eight games start on a **later UTC day** than their `date`, and **none** start
earlier. The date runs behind UTC, never ahead — Western-hemisphere keying,
consistent with ET and inconsistent with UTC.

**What day is it for the viewer?** A property of the person reading the page,
who is on the US east coast. No measurement can change that, and treating it as
blocked on the first question was over-caution: at 21:00 ET the viewer wants
tonight's slate and `todayUtc()` hands them tomorrow's.

## The window

```
instant (UTC)        UTC day     ET day      diverge
2026-08-10T23:59Z    2026-08-10  2026-08-10
2026-08-11T00:00Z    2026-08-11  2026-08-10    <-- YES
2026-08-11T02:30Z    2026-08-11  2026-08-10    <-- YES
2026-08-11T03:59Z    2026-08-11  2026-08-10    <-- YES
2026-08-11T04:00Z    2026-08-11  2026-08-11
```

00:00–04:00 UTC is 20:00–midnight ET. Two consequences, every night:

1. `viewedDate()` requested **tomorrow's** slate while tonight's games were live.
2. Worse: `datePassed = g.Date < todayUtc()` became true for tonight's fixtures,
   so `gameState` rendered **live games as Final**. Same bug family as the AFL
   "In progress in August" one this repo already fixed, with the sign reversed.

## The mechanism

```fsharp
type FieldDay = private FieldDay of string

[<Emit("""...Intl.DateTimeFormat with timeZone: 'America/New_York'...""")>]
let private todayInFieldZone () : string = jsNative

let fieldToday () : FieldDay
let fieldDayOfIso (iso: string) : FieldDay option
let fieldDayIso (FieldDay iso) = iso
let fieldDayShift (days: int) (FieldDay iso) : FieldDay
let fieldDayIsBefore (FieldDay a) (FieldDay b) = a < b
```

Via `Intl` with an IANA zone name, not a hand-rolled offset. EST/EDT changes on
the second Sunday in March and the first Sunday in November, and the fall-back
hour repeats — verified:

```
2026-11-01T05:59Z -> ET 2026-11-01 01h
2026-11-01T06:00Z -> ET 2026-11-01 01h     <- the repeated hour
```

Hand-rolling that is how a date library becomes a bug. The browser and Node both
already carry the rules.

Canonical ET rather than browser-local, deliberately: FIELD's smoke, cron,
`SW_VERSION` and relay day-boundary are all `America/New_York`, so a
browser-local page would disagree with the rest of the system the moment the
reader travels.

## The version of this that was not enough

The first cut added `FieldDay` and left `Game.Date` as a `string`. The guard was
written, compiled, and **did not hold**:

```fsharp
// compiled cleanly with Game.Date : string
if g.Date < fieldDayIso (fieldToday ()) then "past" else "not past"
```

That is the original defect, in one line, straight past a type that only guarded
the *unwrap*. Both sides are `string`, so nothing objected. The claim "the zone
is now a type" would have been half true, and the half that was false was the
half that mattered.

Caught by writing the bypass and watching it build, rather than by assuming the
private constructor was sufficient.

The fix is to lift at the boundary — the same principle as `SealedDrama`. The
decoder produces `Day: FieldDay option`, so no bare date string reaches the
renderer at all, and `None` is a real state meaning the relay sent a date this
laboratory cannot read as a day.

## What the compiler said

<!-- proof: FS0001 -->
```fsharp
if g.Day < fieldDayIso (fieldToday ()) then "past" else "not past"
```
```
error FS0001: This expression was expected to have type
    'FieldDay option'    but here has type    'string'
```

<!-- proof: FS1093 -->
```fsharp
match fieldDayOfIso "2026-08-10" with
| Some (FieldDay raw) -> raw
| None -> ""
```
```
error FS1093: The union cases or fields of the type 'FieldDay' are not
accessible from this code location
```

A day cannot be compared to a bare string, and a `FieldDay` cannot be opened to
get one.

## Everything else that carried a clock

- `drift-sentinel.yml` probed `date -u +%F` — the UTC day, so between 00:00 and
  04:00 UTC it asked the relay for tomorrow's slate during ET prime time. Now
  `TZ=America/New_York date +%F`.
- `nav-check.mjs` asserted the Today button against a UTC date. It would have
  failed for four hours a night once the page moved to ET — the same window,
  inverted. Now computes ET the same way the page does.

## What this does not claim

- Not that the relay's `date` is provably ET. It is provably *behind UTC and
  never ahead*, across every sport observed with a start time, which is
  consistent with ET and rules out UTC. The AFL cannot be discriminated by this
  test at all — an Australian fixture lands in the small hours UTC either way —
  and no AFL game appeared in the measured slate.
- Not that browser-local would be wrong for a different reader. It would be
  wrong for *this* system, which is ET-canonical throughout.
