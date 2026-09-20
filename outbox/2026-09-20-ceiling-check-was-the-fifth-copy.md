# `ceiling-check.mjs` was the fifth copy, and it went red the moment it could run

**Date:** 2026-09-20
**Found by:** unblocking `verify` step 25. This check is step 48.

## The chain, one artefact longer than reported

Earlier today I wrote, in a commit message: *"Four artefacts, one root, a green
check over all of it for weeks. All four are now correct."*

There were five.

```
journalism-quality.js   (root, corrected — relay 1334b9d)
  └─ src/Ceiling.fs     (transcription, corrected 300→294, 245→252)
      ├─ CEILING-PROOF.md   (quoted it, corrected)
      ├─ docs-check.mjs     (compared doc against transcription, corrected)
      └─ ceiling-check.mjs  ← NOT corrected. Not even noticed.
```

`ceiling-check.mjs` hard-coded `300`, `245`, `55`, `97.96%`, `five` and `196` as
literals in its assertions. Correcting `Ceiling.fs` turned all six red:

```
FAIL  the nominal rubric is 300 points and the relay can reach 245
      → 294 = nominal; 252 = relay
FAIL  55 points are unreachable by construction, not by writing badly
      → 42 points
FAIL  the headroom on the relay scale is five points across eight dimensions
      → 12 point(s)
FAIL  four fifths of the reachable scale is 196, not 240
      → 0.8 x 252 = 202; the applied bar is 240
9/16 checks passed
```

**It was invisible because it had not run.** Step 48 sits behind step 25, which
had been red for seven runs on one ungated `:hover`. The sweep that corrected
the other four artefacts ran its own gates and they were green; this file's
gate was not among them, because CI never reached it and nothing locally runs
`check:ceiling` by default.

Two independent failures had to coincide: a stale transcription, and a check
parked behind an unrelated red. Either alone would have been caught.

## The fix: derive, do not restate

Every failing assertion transcribed a number the module already exports. The
literals are gone. `claim-check.mjs` owns comparing `Ceiling.fs` against the
relay; this file owns the arithmetic and the corpus.

## Three of the replacements were vacuous, and that is the part worth recording

The first version of the rewrite replaced the literals with derivations. Three
of them could not fail:

| written | why it cannot fail |
|---|---|
| `unreachable === maxOf(nominal) - maxOf(relayReachable)` | `src/Ceiling.fs:85` — `let unreachable = maxOf nominal - maxOf relayReachable` |
| `headroom(r, bar) === maxOf(r) - thresholdValue(bar)` | `src/Ceiling.fs:132` — `let headroom (s) (Threshold t) = s.Max - t` |
| `FOUR_FIFTHS === Math.round(0.8 * maxOf(relayReachable))` | `src/Ceiling.fs:104` — `Threshold(int (round (float s.Max * f)))` |

Each compares a value against the definition that produced it. All three
**passed**, in a file being repaired because its assertions had stopped meaning
anything.

They were caught by asking "can this fail?" of each line — not by any of them
going red, which none of them ever could. That is the same count this repo
recorded on 2026-09-05, reproduced while fixing its consequences.

All three are removed. Their values still appear, in the detail lines of checks
that can fail.

## Teeth, proved by mutation

Four mutations to `src/Ceiling.fs`, each followed by a full Fable rebuild:

| mutation | result |
|---|---|
| clean source | 14/14 |
| `relayReachable.Max` 252 → 300 (relay scale exceeds nominal) | **9/14** |
| relay scale name loses its stated reason | **13/14** |
| `nominal.Max` 294 → 400 (240 stops being four fifths) | **13/14** |
| `relayReachable.Max` 252 → 293 (the gap collapses) | **12/14** |

`src/Ceiling.fs` restored byte-for-byte after each; confirmed by `diff -q`.

**No standing mutation harness for this one, and that is a cost decision, not an
oversight.** Each mutation needs a full `dotnet fable` rebuild (~15s), four per
run, on a job that already spends most of this repo's Actions budget. The
mutations are recorded here with their measured results instead. If the ceiling
numbers move again, the four commands above are the proof to re-run.

## The general finding

A check that has not run is not a passing check, and CI reports it the same way
it reports a check that does not exist. Seven runs of `verify` showed one red
step and 43 skips (corrected from 44, counted by reading rather than measured);
nothing in that summary distinguished "43 checks are fine" from "43 checks are
unexamined". The first red behind the unblock was a real
defect that had been shipped and reported as fixed.
