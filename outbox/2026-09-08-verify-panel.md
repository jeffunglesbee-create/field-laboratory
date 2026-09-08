# The Verify panel — 146 checks, each with the input that must fail

2026-09-08 · field-laboratory · new surface, ninth tab

Ideas #1, #2 and #4 from the 2026-09-07 laboratory-UI list, built together
because they share a row renderer. #3 (the tennis draw) shipped in `e3d3a49`.
#5 was withdrawn — the seven surfaces are the testbed, not duplication to cut.

## The thing that was wrong for months

Every dashboard on the internet can show a green badge. What this repo has that
they do not is `Verify.fs`: a check cannot be DECLARED without an input that
must fail, because the record is private and the only constructor takes four
arguments. "146 passed" here means something structurally different from "146
passed" anywhere else.

That difference was invisible. `Suite.fs` and `VerifyMain.fs` compiled BELOW
`Program.fs`, ran under node, printed to a terminal and landed in an outbox
file. A visitor to the laboratory saw a scoreboard.

## Why it was node-only, and what it cost to fix

One import.

```fsharp
[<Import("readFileSync", "node:fs")>]
let private readFileSync (path: string, encoding: string) : string = jsNative
```

`Fixtures.fs` read its captures from disk, which made it node-only, which made
`Suite.fs` node-only, which is why the whole chain sat below `Program.fs`. Fable
emits `import { readFileSync } from "node:fs"` at the top of whatever module
names it and a browser refuses that at load — there is no guard clause that
helps, because the failure is the import statement, not a call.

Everything else in `Fixtures.fs` is string arithmetic.

So the read is **inverted**. A host loads the bytes; the module reads them from a
registry:

```fsharp
let paths = [ "data/statsapi-schedule-2026-06-29.json"; "data/tennis-live.json"; "data/tennis-draw.json" ]
let load (path: string) (text: string) = loaded <- Map.add path text loaded
```

`FixturesNode.fs` fills it with `readFileSync` for `VerifyMain`; `SuiteView.fs`
fills it with `fetch` for the browser. **The same files either way** —
`data/*.json`, which `build-site.mjs` already copies to `public/data/`. The
module's original principle is untouched: still read at run time, still one
source of truth, still no literal pasted in. Only the reader changed.

`read` THROWS for a file nobody loaded rather than returning `""`. An empty
string decodes to nothing, every row over it reports a clean failure, and the
suite would read as 146 real results about a payload that was never there. This
repo has shipped three blank artifacts on exactly that shape. The message names
the file, and it fired once during this build — correctly, before the load was
wired.

### Everything became a function, and that was forced

A module-level `let zone = [ ... ]` evaluates when the module is IMPORTED, and
ES imports are hoisted. Under node that is before `FixturesNode.loadAll ()` in
`VerifyMain`'s body; in a browser it is before any fetch has resolved. The suite
would throw while building itself.

So all eleven groups, `Suite.groups ()` and `Suite.all ()` are functions. One
change, both hosts.

`Suite.all ()` is now DERIVED from `Suite.groups ()` rather than assembled a
second time. Two lists of the same eleven bindings would be two places to forget
one, and forgetting one is not a compile error — it is a suite that runs 137
rows and reports 137/137.

## What `Sealed` had to grow

It held a name and a thunk, which is everything a RUNNER needs and not enough
for a reader: `seal` erased the input type and the `MustFail` value with it.

```fsharp
type Sealed =
    private
    | Sealed of
        name: string *
        run: (unit -> Verdict) *
        onMustHold: (unit -> bool) *
        onMustFail: (unit -> bool) *
        shownMustHold: string *
        shownMustFail: string
```

The renderings let the page SHOW the counterexample; the separate thunks let a
reader FEED it. They close over the same predicate and inputs `run` uses — a
page that re-implemented "apply the predicate to the counterexample" would be a
page that could disagree with the suite.

The case stays private. `docs/CHECK-PROOF.md` case 5 (`Sealed("looks fine", fun
() -> Held)` → FS1093) still compiles to the error it claims: arity is
irrelevant when the access check fires first. Verified by running
`check:proof --only CHECK-PROOF` — 15/15.

Renderings are TRUNCATED at 160 chars and say so, with the full length printed.
`data/tennis-draw.json` is 127 matches; a silent truncation would let two
renderings differing only past the cut read as identical.

## What is on the page

```
Verify

Every check below carries an input that MUST hold and an input that MUST fail.
That is a compile-time property, not a convention: the record is private, so the
only constructor takes both, and a check with no counterexample does not
type-check.

FIRST, THE RUNNER
Three checks built and run in this browser, one per outcome. The middle one is
toothless on purpose. A suite whose runner has been shown blind is not evidence
of anything, so this comes before the 146 below rather than after them.

  HELD      a genuine check holds
  NO TEETH  a check whose counterexample ALSO passes has no teeth
  BROKE     a check that fails its own must-hold input breaks

The runner told all three apart. The suite below is read on that basis.

146 of 146 held. Every row, not a passing average — the gate is a conjunction
and there is no function anywhere from a percentage to a pass.

146 checks ran in this browser in 86ms. Nothing here is a recorded result.
```

Then eleven groups, 146 rows. Expanding a row shows both inputs and two buttons:

```
must hold  "{\"nodes\":[{\"id\":1,\"round\":\"Final\"…" … (312 chars)
must fail  "{\"nodes\":[{\"id\":1,\"round\":\"Qualification Final\"…" … (318 chars)

[ feed it the input that must hold ]  [ feed it the counterexample ]

Fed the input that must fail: the predicate returned false.
That is the answer this row claims.
```

Nothing runs until the reader asks. The result is what they caused.

## Three defects of mine, all found by building it

**1. The page said "146 checks ran in this browser in 0ms."**

```fsharp
let started = Date.now ()
render mount (Date.now () - started)     // the subtraction is an ARGUMENT
```

Evaluated before `render` ran a single check. A timing claim taken where it
cannot see the work, printed as a fast number — this repo's own recurring defect
wearing a stopwatch. Moved inside, around `Verify.runRows`: **86ms**.

**2. Every predicate ran twice.** `renderRow` called `sealedRun` for the pill
while the gate came from `runRows` — 292 runs, and the pill was showing the
SECOND run's answer beside the FIRST run's gate. They cannot disagree today and
"cannot disagree today" is the shape of claim this repo keeps retracting. Added
`Verify.rowPairs` and deleted `sealedRun`; one run, read twice.

**3. The count parser read the wrong line.** `verify-render-check.mjs` took the
first `N/N checks held` from `VerifyMain`'s output — which is phase 1's counting
probe, deliberately a 3-row suite containing a toothless row and a broken one.
The check asserted the page should agree with a **1/3** suite. Its own
`--self-test` caught it on the first run, which is the only reason this is a
note rather than a defect on the page.

## The mutation that SURVIVED, and the tautology it exposed

```
FAIL  [verify-panel-drops-a-group] the page runs every check the node suite runs
      → mutation SURVIVED — src/Suite.fs was broken and the check still passed.
        Nothing defends this claim.
```

Deleting the eleventh group from `Suite.groups ()` removed 13 checks and the
check did not notice, because `Suite.all () = Suite.groups () |> List.collect
snd`. The node total and the page's row count are the **same derivation**: both
fall together and go on agreeing. "The page agrees with the terminal" cannot
detect the suite shrinking.

A check whose subject is chosen by the check — the exact shape this repo has a
file of scars about, written into the check built to defend against it.

Fixed with an independent derivation: count `Verify.check ` declarations in
`src/Suite.fs`.

```js
const declared = (readFileSync('src/Suite.fs', 'utf8').match(/Verify\.check /g) || []).length
check('every check DECLARED in the suite source reaches the page', declared === expected.total, …)
```

146 declarations, 146 rows. A check declared and left out of every group is a
check that never runs, and that is the defect this catches. Guarded with
`declared > 100` first, because a regex matching nothing would make the
assertion vacuously true.

The mutation is caught now.

## Measured

| check | result |
|---|---|
| `node build/VerifyMain.js` | 146/146 |
| `npm run check:verify-panel` | **18/18** (4/4 self-test) |
| `npm run check:tabs` | 52/52 (was 51) |
| `npm run check:draw` | 14/14 |
| `npm run check:proof --only CHECK-PROOF` | 15/15 |
| `npm run check:rows` | 23/23 at or above 95 |
| `npm run check:gate-rows` | 7/7 |
| viewport / palette / typography / tokens / device-chrome / glyph | all green |
| clean-source / script-orphans / workflows / unused / short-circuit | all green |
| new mutations | **4/4 caught** (one after a fix) |

Suite runtime in the browser: **86ms for 146 checks**, including a 127-match
draw decoded by two separate decoders.

## Design

Three verdicts, three treatments, and the third is the point: `held` in
`--dim-text`, `broke` in `--red`, `no teeth` in `--violet`. NO TEETH is not a
worse failure — it means the check ran and proved nothing, which is a different
thing to learn than either of the others. Same reasoning as the Draw panel's
"not compared", same token.

The verdict is a word in the identity face, not a pill on a tinted rounded
rectangle: three of those side by side read as one control group, and these are
three different findings.

Rows are native `<details>`, so the disclosure needs no JavaScript and keyboard
support comes free. Group headers stick beneath the tab and date bars, derived
from `--tab-h` and `--nav-h` rather than eyeballed.

## Coverage, stated where the result is read (Rule 91)

The feed-the-predicate assertion checks **12 of 146 rows**, spread across the
list by index rather than taken from the front — the front is one group. The
count is in the check's own printed name:

```
PASS  feeding the counterexample returns false, and the must-hold input true
      (checked 12 of 146 rows)
```

Every other assertion covers all 146.

## Residual

None. The panel is lazy — it fetches three captures and runs 146 checks, which
is work no reader of the scoreboard should pay for — URL-addressable at
`?tab=verify`, and covered in `verify.yml`.
