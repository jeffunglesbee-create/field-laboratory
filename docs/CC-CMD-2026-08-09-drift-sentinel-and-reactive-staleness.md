# CC-CMD-2026-08-09-drift-sentinel-and-reactive-staleness

**Repo:** field-laboratory
**Branch:** main — commit directly, do not create a feature branch or PR

One-liner:
```
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull. Read docs/CC-CMD-2026-08-09-drift-sentinel-and-reactive-staleness.md. Execute all tasks.
Do not commit unless confidence >= 95. If score < 95, report verbatim and stop.
```

---

## Where this repo actually stands

The toolchain is done and the desk card works. `npm install` → `dotnet tool
restore` → `npm run build` → `npm run check` passes 6/6 from a clean slate, and
`npm run check:hard` passes 6/6 against the harder capture. Real F#, real Fable
5.13, real Thoth.Json decoders, real rendered data in real Chromium.

**One question the last session could not answer, and it is the one that
matters:** the decoders are proven *correct* and not proven *needed*. Both live
captures decoded cleanly on the first try. Every piece of failure evidence in
this repo comes from a fixture corrupted on purpose. Whether FIELD's live
payloads actually drift — whether any of this earns its keep — is unmeasured.

That is what this CC-CMD is for. Plus one real defect found by measurement in
the last ten minutes of the previous session.

## The defect, and the measurement that found it

The reactive score signal was wired but never exercised — `Scoreboard.render
mount game |> ignore` discards the setter. Probing it directly, by calling the
setter on a timer and watching the DOM:

```
score BEFORE:  75–81        status BEFORE: In progress
score AFTER :  44–99        status AFTER : In progress
errors: none
```

**Solid reactivity itself works.** The score updated, no errors. That is settled
and does not need re-proving.

**The bug is that nothing else updates.** Only the score node has a
`createEffect`. `statusText`, the drama summary, and the odds line are all
computed once at DOM-creation time and never again. So a game that transitions
to Final renders a final score sitting next to the words "In progress". A game
that starts renders a live score next to "Scheduled 18:10Z".

This is the **second instance in this project of one failure shape.** The codex
entry `ambient-panel-skeleton-overlap` records the first: converting to
fine-grained rendering means nothing outside what the reactive system explicitly
owns ever gets cleared or updated, and the previous occurrence took three blank
artifacts to diagnose. Same mechanism here, caught earlier only because the
setter was probed deliberately.

## What is already proven about the sentinel mechanism

Do not re-derive this. Executed last session against the real build output:

```
$ node --input-type=module -e "import('./build/Desk.js')..."
Array.from(F# list) -> 2 games
first game id: MLB_2026-08-09_yankees_braves | DramaArc tag: 1
malformed fixture -> DramaArc tag: 2  | msg: Given an invalid JSON: Unexpected end of JSON inpu…
```

- `build/Desk.js` imports cleanly under plain Node. **No DOM, no browser, no
  Playwright** — the decoders are separable from the view already, so no
  refactor is needed to run them headlessly.
- `decodePayload` is exported and returns the F# `Result` directly.
- Records keep PascalCase field names in the emitted JS (`Regular`, `DramaArc`).
- **F# lists are not JS arrays.** `p.Regular.length` is `undefined`;
  `Array.from(p.Regular)` works. This will waste twenty minutes if rediscovered.
- The `Nested<'T>` union reads by tag: **0 = NotPresent, 1 = Decoded,
  2 = Malformed**. A sentinel counts drift by counting tag 2.

## Task 1 — Cheapest discriminator first, before building anything

**Can a GitHub Actions runner actually reach the relay?**

This sandbox cannot: `curl https://field-relay-nba.jeffunglesbee.workers.dev/...`
returns `403 CONNECT tunnel failed`, because the agent proxy blocks
`*.workers.dev`. Every capture in `data/` had to come through the FIELD Handoff
MCP's `probe_relay_route`, which self-fetches on the worker.

The entire sentinel design assumes a runner has open egress. **Verify that
before writing it**, with the smallest possible workflow — one `curl` to
`/context/date/2019-01-01` (a 109-byte response), one log read.

There is no CI in this repo at all yet, so this is also the first workflow.

**If the runner cannot reach the relay, stop.** Tasks 2 and 4 are void, the
sentinel needs a different host entirely, and that is a decision for Jeff rather
than a workaround to improvise. Report it and go do Task 3, which is
independent.

## Task 2 — The drift sentinel

A scheduled workflow that fetches a real `/context/date/<today>` and runs this
repo's own decoders over it under Node.

- Daily is enough. This is a drift detector, not a monitor.
- Run the **real compiled decoders** from `build/Desk.js`. Not a JS
  reimplementation — a parallel schema that drifts from the F# one would make
  the whole exercise meaningless.
- Assert every game in `games.regular` and `games.postseason` decodes, and count
  `Nested` tag-2 (`Malformed`) occurrences across `drama_arc`, `opening_odds`,
  and `closing_odds`.
- Append the result to a committed log — date, game count, decode outcome,
  malformed count, and the decoder's actual error text when there is one. The
  point is an accumulating record, so make it append-only and readable by a
  human scanning for the first red line.
- Fail the workflow loudly on a decode failure. A silent sentinel is not a
  sentinel.

**Do not tune this toward green.** A month of clean runs is a real result: it
means the payloads are stable and the decoders are insurance nobody has claimed
on, which is a genuine argument *against* the approach and should be reported as
one. A single real red is the F# thesis validated. Both outcomes are worth
having; only a sentinel bent toward passing is worthless.

Consider having it commit the fresh capture into `data/` as well, so the page
renders progressively more recent real data over time and the decoders get
exercised against genuinely new payloads rather than two frozen snapshots. If
you do, keep `data/PROVENANCE.md` honest about which files are automated
captures and which were hand-taken.

## Task 3 — Fix the staleness

Independent of Task 1's outcome. Do this regardless.

Every node whose content derives from game state must be driven by the signal,
or must not exist on the card. Pick one and say which:

1. Drive `status` (and anything else state-derived) from `createEffect`, the
   same way `score` already is.
2. Narrow the card so only genuinely reactive content is on it.

Option 1 is probably right — the status line is the second-most-important thing
on a scoreboard card — but the choice belongs in the outbox with a reason.

**Prove it the same way it was found:** call the setter, transition
Scheduled → InProgress → Final, and confirm every node moves together. Then add
that transition to `scripts/render-check.mjs` as a permanent regression check,
so this cannot silently come back. Right now the render check only ever sees the
initial paint, which is exactly why it passed 6/6 over a real bug.

## Task 4 — Do not write the fourth near-duplicate probe script

The codex entry `field-unification-thesis-2026-07-23` names this precisely:
`ambient-skeleton-probe.js` and `chip_overflow_probe.js` are structurally
near-identical Playwright scripts, no shared harness exists, and it predicts
that *"the next visual CC-CMD will very likely write a THIRD near-duplicate
script instead of pointing an existing one at a new selector/viewport."*

`scripts/render-check.mjs` is already the third member of that family. The
sentinel would be the fourth.

Before writing a new script, either extend `render-check.mjs` to cover the
headless-decode case, or state plainly in the outbox why a genuinely separate
script is warranted — the sentinel runs without a browser at all, which may be a
real justification rather than an excuse. Make the argument either way; do not
let it happen by default.

## Task 5 — Honest reporting

- If the sentinel runs green, say so plainly and resist dressing it up. "No
  drift observed in N runs" is the honest headline, and it weakens the case for
  this repo's whole premise. Report it that way.
- If the runner cannot reach the relay, do not improvise a proxy, a scraper, or
  a committed-snapshot substitute that quietly stops testing live data. Report
  and stop.
- Record whether fixing Task 3 revealed any further nodes that were silently
  stale. The two found so far were found by probing; there may be more that
  nobody has probed.

---

## Explicitly NOT in scope

- Do not make the page poll the relay directly. This sandbox cannot reach it, so
  nothing you write that way can be verified here.
- Do not add a bundler. The import map in `index.html` works and is understood.
- Do not attempt to replace `Fable.Solid`. It is a 2022 beta and it works;
  whether to keep depending on it is Jeff's call, already flagged.
- Do not broaden past the single card. The lab exists to answer one question
  well.
- Do not edit the environment setup-script field. Still impossible from a
  session — see below.

## Still outstanding for a human

`docs/SETUP-SCRIPT.md` is **still unpasted**. Every cold session pays ~30
seconds installing the .NET SDK through the fallback hook instead of zero.
Nothing is broken without it; it is a speed cost only. Carry this forward in the
outbox until it is done.

---

## Outbox

`outbox/cc-session-2026-08-XX-drift-sentinel-and-reactive-staleness.md`: whether
the runner can reach the relay, the sentinel's first real runs with actual
output, the staleness fix with a before/after transition showing every node
moving together, the decision made about near-duplicate probe scripts, and — if
the sentinel is green — an honest statement that no drift has been observed yet
and what that implies about this repo's premise.
