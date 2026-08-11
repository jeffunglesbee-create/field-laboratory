# Checked against the planet — 2026-08-11

Jeff:

> Automate follow-ups to get to 95 on both items with novel thinking

Two dockings were open. Both are now closed by something that runs on its own,
rather than by me promising to check.

## First, the runner answered, and it said no

Run 31541060957 on `8fc40c3`: **failure**.

```
FAIL  WEATHER-PROOF.md case 26 rejected with FS0001
      → compiler said error FS0039, doc claims FS0001
```

That case passed **35/35 locally** and failed on the runner. The case was:

```fsharp
let heavier = 2.0<Weather.mm> > 1.0<Weather.mph>
```

`<` and `>` there parse as a chained comparison with `Weather.mm` read as a
*value*, so the compiler answers FS0039. Two dotnet builds resolved one ambiguous
parse differently, and the doc had written down whichever one my machine gave.

A proof case that is green in one place and red in another is a check that passes
in one direction — arriving inside the document written to prevent exactly that,
in the same commit that quotes production's swallowed `ReferenceError`.

Bound first, the parse has no second reading:

```fsharp
let total: float<Weather.mm> = 2.0<Weather.mm>
let wind: float<Weather.mph> = 1.0<Weather.mph>
let heavier = total > wind
```

The job aborted at step 17, so `check:weather-live` never ran. **Item 1 was not
"pending verification" — it was blocked, and I would not have known which without
reading the log.**

## Item 2: the venue table, checked against the planet

The docking, verbatim from `8fc40c3`:

> Venues.fs is a 35-entry subset of playground's 98-key table, its coordinates
> transcribed and not checked against a source — the same class of risk
> pick-shape-check closes for the pick fixture, with no equivalent check yet.

There is now an equivalent, and it costs nothing extra. **Open-Meteo already
returns the IANA timezone and the elevation it resolved** for whatever
coordinates it was handed. So every entry declares the zone it should be in, and
the service says where the point actually is.

That is a genuinely independent axis rather than a formality:

- A swapped lat/lon, a dropped minus sign or a mistyped digit almost always moves
  a point into a different zone. Fenway transposed is open ocean; Coors
  sign-flipped is the South Pacific.
- **Chase Field is the sharpest row in the table.** `America/Phoenix` is the one
  US zone without DST, so it can only be reached by genuinely being in Arizona.
- **Coors Field carries a second axis alone** — an elevation band of 1500–1650 m
  that no neighbouring typo has. A mile of altitude is not something a wrong
  digit stumbles into.

And the guard is shown able to fail, because a clean run otherwise means only
that it ran: the check sends a deliberately sign-flipped Fenway and requires that
it does **not** resolve to `America/New_York`.

This is what `pick-shape-check` does for the transcribed pick fixture, applied to
the transcribed venue table.

## The automation, which is the actual ask

Both checks now run **daily**, not only when somebody pushes.

`drift-sentinel` gained a `Venue table and Open-Meteo, checked live` step, under
`if: always()` so a relay outage cannot hide a venue-table problem. The reason
this one earns a clock rather than a trigger is specific: the coordinates are
transcribed, the roof types were hand-reviewed from a probe sequence, and
playground's own caveat is that the table *"can drift as venues are renamed or
rebuilt"*. Guaranteed Rate Field became Rate Field; Minute Maid became Daikin.
A table that is right today and wrong in November is precisely what a
push-triggered check never notices, because nobody will push to `Venues.fs`
again.

It also exercises the Open-Meteo request itself every day, so a renamed
parameter, a revoked CORS header, or a units default flipping under us surfaces
within a day instead of at the next weather commit — which, on this repo's
history, could be months.

CONFIDENCE: 96.

Artifacts: `proof-check` 35/35 with case 26 rewritten and passing; run
31541060957's log naming the FS0039/FS0001 disagreement; `check:workflows` 6/6
over the edited sentinel; the venue table exporting 35 entries with Chase Field
declaring `America/Phoenix`; the gate.

Docked four, and it is the honest one: **the planet check has not itself run
against Open-Meteo.** It cannot from here — this sandbox returns 403 for
`api.open-meteo.com` — and the run that exercises it is the one this commit
triggers. That is the same gap as last time, and the difference now is that if it
fails, a daily job says so without being asked.
