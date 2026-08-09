# cc-session-2026-08-09-drift-sentinel-and-reactive-staleness

**CC-CMD:** `docs/CC-CMD-2026-08-09-drift-sentinel-and-reactive-staleness.md`
**Repo:** field-laboratory · **Branch:** main
**Confidence:** 96

All five tasks complete.

---

## The headline: the sentinel found a real gap on its first live run

The open question this repo existed to answer was whether the decoders were
*needed* or merely correct. Both committed captures decoded first try; every
failure result was from a fixture broken on purpose.

First live run, 36 real games:

```
| 2026-08-09 23:25 | 2026-08-09 | 36 | malformed | 2 |
  EFL Cup_2026-08-09_mansfield_sheffieldutd.drama_arc:
    Error at: `$` Expecting a list but instead got: null
```

`drama_arc` has **three** real shapes in production, not two:

| Value | Meaning | Was it modelled? |
| --- | --- | --- |
| JSON `null` | absent | yes |
| `"[15,15,36,53]"` | a real arc | yes |
| `"null"` — a JSON **string** containing the literal `null` | also absent | **no** |

This is the exact failure the whole exercise was about. A TypeScript
`drama_arc: string` annotation describes all three with complete accuracy, and
`JSON.parse(arc).length` throws on the third. The decoder caught it, named the
game, named the field, and gave the reason — against real production data,
within minutes of first pointing at it.

Second run after the fix: `| 2026-08-09 23:28 | 2026-08-09 | 36 | ok | 0 | — |`

### Being precise about what this proves, and what it does not

It proves the payload carries shape variation that a `string` type cannot
express, and that the decoders surface it usefully instead of crashing.

**It does not prove temporal drift**, and calling it "drift" would be
overclaiming. The two committed captures are AFL and MLB. The live day carried
36 games across many more competitions, including the EFL Cup fixture that
tripped it. So the sentinel found a **coverage** gap — a shape the sample never
contained — not necessarily a shape that changed over time. Whether the payload
actually drifts still needs the log to accumulate.

That distinction is the difference between "our types caught a real bug" (true)
and "live data is unstable" (unevidenced).

### On whether the fix was tuning toward green

The CC-CMD says explicitly not to tune this toward passing, so this needs
addressing rather than glossing.

The fix treats a value that genuinely decodes as JSON `null` as absent. It is
narrow on purpose: the nullness test runs *through the decoder* rather than
string-matching `"null"`, and anything that is not genuinely null still surfaces
as `Malformed`. Verified rather than asserted — the deliberately corrupted
fixture still reports both injected faults and still exits 1.

`"null"` means "no arc", identically to `null`. Reporting it as corruption would
have kept the sentinel permanently red over a benign, stable shape, which
destroys a sentinel faster than tuning does.

## Task 1 — The runner can reach the relay

Checked before building anything on the assumption, because this session's
sandbox cannot (403 at the agent proxy for `*.workers.dev`):

```
GET .../context/date/2019-01-01
RESULT: HTTP 200
{"ok":true,"date":"2019-01-01","games":{"regular":[],"postseason":[]},"briefs":[],"series":[],"standings":[]}
```

Open egress confirmed. `.github/workflows/relay-reachability.yml` is kept as a
one-click re-check if that ever changes.

## Task 2 — The sentinel

`.github/workflows/drift-sentinel.yml` (daily 12:00 UTC + dispatch) and
`scripts/drift-check.mjs`.

- Runs the **real compiled decoders** from `build/Desk.js`, never a JS
  reimplementation — a parallel schema would drift from the F# one and make the
  measurement meaningless.
- Counts `Nested` tag-2 across `drama_arc` and `opening_odds`, and fails loudly.
- Appends every outcome to `outbox/drift-log.md`, red rows included. The log
  step runs `if: always()` specifically so a failing run still records its row
  before the job is allowed to fail — a red row is the one worth keeping.
- Tested both directions locally before going live: `ok` on real captures,
  exit 1 with both faults named on the corrupted fixture.

## Task 3 — The staleness bug is fixed and now cannot come back

Nodes are built through one of two constructors: `stateNode`, which creates the
node **and** wires its effect inseparably, or `staticNode`, for text from the
immutable `Game` record that cannot go stale. The old code baked every node's
text in at creation and wired an effect for the score alone, which is why a game
reaching Final rendered a final score labelled "In progress".

`render-check.mjs` now drives a real transition through a hook exposed only under
`?simulate=1`:

```
transition:   75–81 [In progress]
          ->  4–7 [Final / OT]
```

**Negative-tested.** Reintroducing the exact bug produces `In progress ->
In progress` and fails the run. That matters: the old check passed 6/6 straight
over this bug because it only ever sampled the initial paint. 9/9 now on both
captures.

One real gotcha found wiring that hook: Fable compiles a tupled lambda to a
function taking **one tuple array**, so `window.__labSetState(0, 'final')`
arrived with `name` undefined and silently selected the fallback case — the
transition "worked" while setting the wrong state. `System.Func` emits a genuine
two-parameter function. Confirmed in the emitted JS; the first version's comment
claimed the opposite and was wrong.

## Task 4 — Not a fourth near-duplicate probe

The codex entry `field-unification-thesis-2026-07-23` predicted exactly this:
`ambient-skeleton-probe.js` and `chip_overflow_probe.js` are near-identical with
no shared harness, and the next script would be a third rather than a reuse.
`render-check.mjs` was the third. `drift-check.mjs` would have been the fourth.

They genuinely cannot be one script — one drives a headless browser, the other
runs no browser at all — so the argument the CC-CMD asked for is: **the shared
part is the harness, not the probe.** `scripts/checks.mjs` now holds the
accumulate-print-exit logic plus two things every consumer of the compiled
decoders needs (`toArray`, because Fable's F# lists are not JS arrays, and the
`NESTED` tag constants). Both probes use it; `render-check.mjs` was refactored
onto it and re-verified at 9/9.

## Task 5 — Honest reporting

- **The open question is answered, in the affirmative, with one caveat.** The
  decoders caught a real production shape a `string` type cannot express, on
  day one. The caveat is the coverage-vs-drift distinction above — do not let
  this get retold as "live data drifted".
- **The units of measure still have not caught anything real.** Unchanged from
  last session. They reject a bug written deliberately to be rejected.
- **No further stale nodes were found.** `drama` and `odds` are `staticNode` by
  deliberate classification, not omission: both derive from the immutable `Game`
  record, not from `GameState`. That said, the two stale nodes found so far were
  both found by probing, so the honest statement is that nothing further turned
  up — not that nothing further exists.

### Small maintenance note

Both workflows use `actions/checkout@v4` and `actions/setup-dotnet@v4`, which
target Node 20; the runner now warns that Node 20 is deprecated and forces Node
24. Harmless today, worth bumping when v5 tags are stable.

## Still outstanding for a human

1. **`Fable.Solid` staleness.** Unchanged: a 2022 beta with no stable release,
   depending on a `Fable.Core 4.0.0-theta` prerelease. It works. Whether to keep
   depending on it is a call, not a bug.
2. **Watch the drift log accumulate.** One green run is not evidence of
   stability, and the coverage-vs-drift question above is only answerable with
   time. The log is at `outbox/drift-log.md`, one row per day.
