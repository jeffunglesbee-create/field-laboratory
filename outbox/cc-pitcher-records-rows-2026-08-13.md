# The pitcher and records rows, built

## What was actually wrong before

These two rows have been "named, not built" through three commits, and the
docking each time was −4. The reason they were absent is worth stating exactly,
because the earlier UNRESOLVED badges got it backwards.

`/context/date` carries neither. Its `standings` key is an empty array in both
recorded captures, and there is no pitcher field at all. Laboratory rendered
**"missing name, ERA, W–L, arsenal"** — and three of those four fields do not
exist in the payload production itself uses. Production's own recorded fixture
says so:

> "probablePitcher in schedule response has id/fullName/link only — stats NOT
> embedded even with probablePitcher(stats) hydration"

So laboratory invented a requirement and then reported its own invention as
missing data. That is worse than an absent row: it tells a reader something is
absent when the truth is that nobody has it. A bare name is production's real
output because a bare name is all there is.

## The capture, verified rather than trusted

`data/statsapi-schedule-2026-06-29.json` is production's recorded statsapi
response. Bringing it across meant transcription, which is how the Comerica
timezone error got in — so it is checked rather than trusted:

```
size: 4083  (upstream reports 4083)
sha:  aba791bd0ae2348437962ed295f02ef823841aec
want: aba791bd0ae2348437962ed295f02ef823841aec
BYTE-IDENTICAL
```

`git hash-object` reproduces the blob sha the relay reports for the file in
jubilant-bassoon. That is a general technique worth keeping: it converts
transcription from an unverifiable risk into a mechanically checked one, and it
is cheaper than a runner round-trip for anything under the contents-API cap.

`src/Fixtures.fs` reads that file from disk at run time rather than embedding a
copy, because an embedded literal is a second source of truth that goes on
passing after the file changes.

## Production's Gap 2, made unrepresentable

`src/legacy/field.js:31036`:

```js
const hT = _tgStandings.find(t => (t.team||'').toLowerCase().includes(hSlug));
const aT = _tgStandings.find(t => (t.team||'').toLowerCase().includes(aSlug));
if (hT && aT) _tgStandingsStr = `...`;
```

One unmatched nickname silently removes **both** teams' records. That failure
needs a lookup in order to happen, and there is none here: `leagueRecord`
travels with the team inside the same object as its name. The record is a
**required** field of a side, so a side that decodes has one, and `RecordsRow`
carries both sides in a single case — there is no half-populated line to build.

`record-becomes-optional` is the mutation for it, and it **survived its first
counterexample**. I had written the counterexample as deleting `"losses": 46,`
from inside `leagueRecord`, which tests the record decoder's own strictness and
says nothing about whether the field is required. A counterexample has to remove
the thing the claim is about. Now it deletes the whole `leagueRecord` and the
mutation is caught — and the narrower claim got its own check.

## The trap I nearly shipped

The live endpoint nests games under `dates[].games`. Production's recorded
fixture flattens them to a top-level `games`, because it captures the normalised
form rather than the wire.

A decoder written against the fixture alone would have passed **every offline
check in this repo** and failed on the first live call. That is precisely the
gap the venue lookup was docked for, arriving one file later and from the same
cause: proving a thing against the one shape that happened to be recorded.

Both shapes decode, and `Fixtures.statsapiNested` builds the nested envelope by
re-wrapping the real games array, so the two paths are proven on the same real
data. `live-envelope-unhandled` removes the nested branch; it is caught.

## The join uses venue identity, not team names

`/context/date` says "Yankees"; statsapi says "New York Yankees". Bridging those
is substring matching, which is the bug above. So the join goes through the
alias table built in the previous commit — `/context/date`'s venue name and
statsapi's venue name both resolve to the same park, and the pitcher and records
rows inherit that thirty-of-thirty coverage rather than needing their own.

That is also why the alias work had to come first: statsapi's vocabulary
("Oriole Park at Camden Yards") is exactly the form an exact-label match loses.

A doubleheader puts two games at one venue and `tryFindAtVenue` returns the
first. Recorded, not solved — neither capture contains one, so a second-game
rule would be written against nothing.

## Rendering, and the silent no-op found on the way

The panel renders **eagerly** with an empty schedule and again when the fetch
resolves. Not "wait, then render once": a slow or dead third-party call would
leave the panel blank, and a blank panel is one of three failure shapes this
repo has already shipped green.

statsapi is CORS-open — production's own source registry records
`corsAvailable: true` and production calls it from the client — so there is no
relay hop. Same pinning rule as the weather chip: a page on `?data=` renders a
committed capture and must not reach the network, which is what keeps every
offline render check free of a third-party request.

While wiring the status line I used `report "schedule"`, and `report` writes by
element id — there was no `#schedule` element, so it was a **silent no-op**. A
status line that reports nothing while looking like it reports something is the
same shape as the feature flag that said the weather engine worked. The element
now exists.

## Verified where it actually matters

The decoder being right and the reader seeing the row are different claims, and
the gap between them is where the PARK row was lost. `schedule-live-check.mjs`
loads the **deployed** page unpinned — the only configuration where the fetch
runs — and asserts the rows are in the DOM with real values: W–L shaped, and
both teams named in one line. It runs on a runner because the sandbox is 403 at
the proxy for statsapi.

It does **not** fail on a slate with no MLB games. That is a fact about the day,
not a regression, and a check that goes red every Tuesday in February is a check
nobody reads by March — the lesson the BSD probe next door learned the same week
when its first run called three routes broken because it happened to probe a
fixture that had not kicked off.

## Artifacts

- `VerifyMain` **62/62**, six new checks, no NO TEETH.
- `proof-check` **44/44**, including two new FS1093 cases: a pitcher cannot be
  conjured from an empty string, a record cannot be assembled by hand.
- Three new mutations — `record-becomes-optional`, `live-envelope-unhandled`,
  `blank-pitcher-name-accepted` — each verified caught individually, one of them
  only after its counterexample was fixed.
- `tab-check` 29/29, `unused-check` clean over 20 F# files, `workflow-check` 6/6.
- The capture verified byte-identical against the upstream blob sha.

Not claimed: that the rows have been seen on a live page. The live check is
written and wired into `live-check.yml`, and it has not run yet — it runs after
the next deploy. Until then the DOM claim rests on the offline suite, and the
distinction is the whole point of the check existing.

---

## The gate ran: 83/100, four failing rows

Reported verbatim, not committed on:

```
FAIL   0/30  grouping and date navigation pass
FAIL   0/30  pick'em grades only finished games
FAIL   0/20  breaking each invariant makes a check fail
FAIL   0/10  this session wrote its outbox
```

Four causes, and only one of them was the work.

**The outbox row was the FIELD day rolling over.** It is now 2026-08-13 ET; the
entry was dated the 12th. The row is asking the right question and this file is
now dated to the day the gate is actually running. `GATE_DAY` is captured once
at gate start precisely so this cannot flip mid-run.

**A stray server of mine nearly hid the other two.** The gate starts
`scripts/serve.mjs` *only if nothing is listening on 8080* — and I had left an
`npx serve` running from an earlier check. So the gate silently ran two browser
rows against my server instead of its own. Worth naming as a hazard in its own
right: a check that adopts whatever is already on the port measures a
configuration nobody chose.

**nav-check was mine.** My statsapi fetch escaped to the real network. This
probe navigates by `?date=` rather than pinning `?data=`, which is exactly the
configuration where that fetch runs, and in the sandbox that is a proxy 403 —
`ERR_TUNNEL_CONNECTION_FAILED` on the console, and "no page or console errors"
red for a reason with nothing to do with navigation. Stubbed with the same real
recorded capture the F# suite decodes, alongside the existing Open-Meteo stub.
Attributed by stashing: 25/25 on clean HEAD, so it was mine.

**pick'em was NOT mine, and main is red because of it.** Same three failures on
clean HEAD. The cause:

```js
const DATE = '2026-08-12'   // "deliberately a future date so nothing is
                            //  swept up by the date-passed rule"
```

True when written; false from midnight ET on the 13th. A past slate sweeps every
fixture to Final, so "in progress reads LIVE" got CORRECT and "a 0-0 fixture
that has not kicked off reads PENDING" got DRAWN. **Nothing in any diff caused
this** — the repo went red because time passed.

That is the third instance of one shape here: `GATE_DAY` in the gate's own
outbox row, `NOW` in zone-check, and now a fixture date. Each was a check whose
answer depended on when it ran. `DATE` is now derived from the FIELD day plus
one, at noon UTC to stay clear of the DST boundary, so it cannot expire again —
and `pickem-date-pinned-to-the-past` restores the literal so the fix is defended
rather than described.

The mutation row was downstream of the other three, as its baseline runs the
rows it depends on. I said that once today about a different pair and was wrong,
so it is stated here as what the next run showed rather than as a diagnosis.
