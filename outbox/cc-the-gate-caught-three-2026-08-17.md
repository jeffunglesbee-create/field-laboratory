# Outbox — the first real gate run failed, and every failure was mine

**Date:** 2026-08-17
**Ships:** no-op detection for world mutations in `scripts/mutation-check.mjs`,
`history-boundary-moved` decoupled from the boundary's value, `CAPTURE_ONLY` and
`NO_PARK_FACTORS` in `scripts/generate-scouting.mjs`, `src/Scouting.fs`
regenerated, `scripts/venue-coverage-check.mjs` distinguishes unfactored from
unresolved

## What happened

`scripts/confidence-record-check.mjs` shipped this afternoon to stop me typing
confidence scores into markdown. The first full gate run after it scored
**480/530 = 91/100** with failing rows, so nothing was pushed.

Three findings, all caused by my own commits earlier today, and two of them
caught things I had already claimed were fine.

## 1. A mutation harness reporting a false alarm as a true one

```
FAIL  [history-boundary-moved] moving the rule boundary without the count is caught
      → mutation SURVIVED — nothing defends this claim.
```

The mutation was:

```
sed -i 's/^e9bc4ca[0-9a-f]*  17/543a64d…  17/' docs/history-boundary.txt
```

This morning the boundary legitimately moved to `829f2ac … 18`. The pattern
then matched nothing, sed changed nothing, the check passed unchanged, and the
harness concluded the claim was undefended.

**The guard was coupled to the value it guards**, so every legitimate change to
that value disarms it.

That is bad, but the structural fault underneath is worse. Source mutations in
this harness already prove they applied:

```js
const mutated = applyMutation(original, m)
if (mutated === original) {
  check(`[${m.id}] the mutation anchor still exists`, false, …)
```

**World mutations — the ones that run a shell command — had no equivalent.** So
a mutation that cannot apply is reported as *"nothing defends this claim"*,
which is indistinguishable from a real gap. A mutation harness reporting a
broken mutation as an undefended invariant is a false alarm wearing the costume
of a true one, and the inverse — a no-op counted as CAUGHT — is how a suite goes
green while proving nothing.

Fixed generically: the working tree is captured either side of every world
mutation, and an unchanged tree is a distinct, differently-worded failure.

```
FAIL  [history-boundary-moved] the mutation actually applies
      → `sed -i 's/^e9bc4caNOPE…'` left the tree unchanged. Nothing was tested —
        this is a broken mutation, NOT an undefended claim.
```

Verified by re-introducing the exact no-op and watching it fire. Three world
mutations were exposed; all are covered now. The comparison is between two
states, so a tree that is already dirty cancels out.

The mutation itself now reads the current sha out of the file and rewrites it
while keeping the count, so no future boundary move can disarm it.

## 2. I hand-edited a generated file, and said the fix was done

`data/brief-join-corpus.json` — captured by the runner from my own script —
carries 9 MLB venue rows the park table cannot resolve: **"Daikin Park" ×8** and
**"Field of Dreams" ×1**. `venue-coverage-check.mjs` globs `data/*.json`, so it
found them immediately. That is the capture working: a real production coverage
gap, surfaced.

I fixed it in `src/Scouting.fs`. The next gate run said:

```
::error::src/Scouting.fs does not match what scripts/generate-scouting.mjs
produces from data/production-*.json. Either it was hand-edited, or the
imported tables changed and it was not regenerated.
```

**`src/Scouting.fs` is generated.** The venue check had gone green because I
edited the output of the generator instead of the generator. I had already
reported that fix as done. It was not.

The row exists for exactly this — its own comment says a hand edit would compile,
pass every check, show a number that is no longer production's, and then be
silently wiped by the next regeneration. It caught me inside one run.

### Redone in the generator

`OVERRIDES` only fires for names in production's own `VENUE_COORDS`. Neither
venue is there, so a new concept was needed rather than a new entry:

- **`CAPTURE_ONLY`** — names appearing in recorded captures but not in
  production's venue map. `Daikin Park → Minute Maid Park`: Houston renamed the
  stadium, so it is the same physical park and the same factors. Verified the
  alias resolves to the identical record (Runs 98, HR 96, NeutralPark). The
  identical case to `Guaranteed Rate Field → Rate Field` already there, and an
  aliasing fix rather than a number to invent.

- **`NO_PARK_FACTORS`** — venues that have none and are not expected to.
  `Field of Dreams` is a neutral site in Dyersville, Iowa used for a handful of
  regular-season games; no run environment exists for it. Putting a fabricated
  100/100 in the park table to silence a check would be inventing precisely the
  number the file's own alias note refuses to invent.

Both are emitted into `src/Scouting.fs` as `venuesWithoutParkFactors` and
`isKnownUnfactored`, making the distinction the codebase already draws
elsewhere: `tryUmpire`'s comment says most umpires are absent and *"that is a
real answer, not a missing one"*, and `Desk.Unmodelled` says it for sports.
`tryParkByVenue` returning None has meant both "we failed to cover this" and "no
such data exists", with nothing to tell them apart.

### Two guards, so neither list becomes a bucket

The generator **fails** if a declared name appears in no recorded capture —
verified by declaring `Nowhere Park` and watching it refuse:

```
::error::"Nowhere Park" is declared here but appears in no recorded capture —
delete it, or it is covering for nothing
```

And `venue-coverage-check.mjs` prints declared venues rather than skipping them
silently, still fails on any unresolved venue not declared, and separately fails
on a declared name that shows up nowhere. Adding to the list is a visible source
edit paired with an outbox entry — not a line in a file nobody reads.

## 3. The row that failed because this entry did not exist

```
FAIL   0/10  source changes arrive with an outbox entry
```

Correct. The working tree carried changes to `src/` and `scripts/` and no entry
described them. This is that entry.

## A mistake made twice in one hour

My first attempt to test the venue guard patched `build/Scouting.js`, replacing
a Fable linked list with a JS array. That broke `isKnownUnfactored` rather than
testing anything — Fable's `List.exists` over a JS array finds nothing, silently.

This repo has caught that exact trap twice before, in `sport-registry-check`
reporting 0 coordinates and `corpus-check` reporting 0 unattributed. The check
did fail, so I nearly recorded a passing teeth-test that had proved nothing. I
re-tested the logic directly.

Never mutate the Fable output to test F#-backed behaviour. Mutate the source and
rebuild, or exercise the JS logic on controlled inputs.

## What the record shows

The first line ever written to `docs/confidence-log.jsonl`:

```json
{"sha":"1264e6f…","mode":"full","earned":480,"possible":530,"total":91,
 "failing":["breaking each invariant makes a check fail",
            "generated source matches its generator and data",
            "source changes arrive with an outbox entry"],"skipped":[]}
```

A failing run, recorded. That was the design point — a log that only captures
passes cannot be used to refuse a claim.

Note what this measured: the run is against `1264e6f`, the commit that shipped
the score mechanism, and it says 91. Had I pushed that commit citing a typed
95, the number would have been wrong by four points and wrong about three
specific invariants. This is the first time in this project the score has
disagreed with what I would have written, which is the entire reason for it.

## 4. I rebuilt the `tail -1` bypass inside the check that refuses it

The gate then passed — 530/530, every row — and the log looked like this:

```
1264e6f full 480/530 =  91  failing: 3
1264e6f full 530/530 = 100  failing: 0
```

**The same sha, twice, with different totals.** HEAD had not moved while the
working tree was fixed between the two runs, and `git rev-parse HEAD` says
nothing about uncommitted work. The gate scores the tree; the record identified
the commit.

That alone is only ambiguous. What made it a bypass was the lookup:

```js
const parseLog = text =>
  new Map(text.split('\n').filter(Boolean).map(l => {
    const r = JSON.parse(l)
    return [r.sha, r]          // later record wins
  }))
```

A failing run followed by a passing run on the same sha **resolves silently to
the passing one**. That is the 2026-07-08 `tail -1` bypass — append a higher
number and the gate clears — rebuilt inside the file written this afternoon to
refuse it, in under three hours, by me.

Fixed by making the identity of a run HEAD plus a SHA-256 digest of everything
not in HEAD (`git status --porcelain` + `git diff HEAD`), and by refusing
duplicate ids outright rather than picking a winner. Both the collision and the
duplicate case are now in the self-test, replayed with the real numbers.

The two pre-id records are kept and reported as **not citable**. They are the
evidence for why the id exists; deleting them would remove the only trace of a
failing run.

### And a fifth thing that fell out of it

A run taken against a dirty tree measures a state no commit contains, which
makes "run the gate, then edit, then cite" indistinguishable from "run the gate
on what shipped". A dirty run can no longer back a score.

So the workflow a citable score requires is: **commit, run the gate on the clean
tree, cite that run from the next entry.** Which is what the standing
instruction described all along — score the thing you are shipping.

## Two non-findings, so they are not mistaken for findings later

The `drift-check` on `test/malformed-nested.json` exits 1 by design — it is
invoked via `fails()` and its row passes 20/20. The `curl localhost:8080` lines
are the server-liveness probe before spawn. Both appear in the failure capture
because it records every non-zero command, including intentional ones.

## Verified

`generate-scouting.mjs --check` exit 0; `venue-coverage-check` 4/4 with
`Field of Dreams` named and `Daikin Park` resolving; `mutation-check --self-test`
4/4; `history-boundary-moved` caught, and its no-op variant refused as broken.
`check:unused`, `check:docs`, `check:history`, `check:confidence-record`,
`check:workflows`, `check:gate-rows`, `check:rows`, `check:game-id` all pass.
Build clean, zero F# warnings.

No score is stated here, and under the rule above none can be: every run so far
was taken against a dirty tree. The first citable record will be the one taken
after this commit lands, and the next entry can use it.

## Next

Run the gate on the clean tree once this lands, so `docs/confidence-log.jsonl`
gains its first citable record — and the next entry that ships source states a
number for the first time in this project that nobody typed.
