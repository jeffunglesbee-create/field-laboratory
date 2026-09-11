# Claude Code Command — Make `<!-- claim: -->` markers executable, and sweep all 18 proof docs

**Date:** 2026-09-11
**Repo:** field-laboratory
**Branch:** main — commit directly, do not create a feature branch or PR
**Type:** C (feature) + D (audit)
**Why a CC-CMD:** `scripts/` is not in this repo's WRITE_ALLOWLIST (`docs/`,
`HANDOFF.md`, `CODE_MAP.json`).

## CONTEXT — two confirmed stale docs, found one at a time

Both found by hand on 2026-09-11, both the same shape: the F# reasoning is sound
and the compiler claim still holds, but the PRODUCTION PREMISE the doc states has
since been fixed. The doc goes on asserting it in the present tense.

**1. `CEILING-PROOF.md`** carries:
```
<!-- claim: ceiling.relayReachable = 245 -->
<!-- claim: ceiling.unreachable = 55 -->
<!-- claim: ceiling.flatBarPctOfReachable = 97.96 -->
```
Live values in `field-relay-nba/src/journalism-quality.js`, derived from `SCALE`:
`NOMINAL_TOTAL = 294` (not 300 — "the 300 was a label rather than a total"),
`REACHABLE_CEILING = 252`, `FOUR_FIFTHS_REACHABLE = 202`,
`REACHABLE_CEILING_GAME = 294`, `FOUR_FIFTHS_REACHABLE_GAME = 235`,
`UNREACHABLE_DIMS_GAME = []`. All three claims are wrong. The doc's own argument
— that a number outlives the scale it was set on — has happened to the doc.

**2. `Desk.fs:1369`** states in the present tense: "The FIELD app computes a
win-probability away side as `1 - homeWP` — the two-way complement." Verified
false at client HEAD `bf67bad`: zero `1 - homeWP` sites; `awayWP` reads
`oddsData.awayWin` directly (`field.js:38362`); `:33749` returns
`{pHome, pDraw, pAway}` as three independent values; `:37668` reads `wp.draw`
as a first-class quantity; `:33197` documents the two-way case as the EXCEPTION
("CFL has no draw — pHome + pAway = 1.0"). The defect was fixed; the doc wasn't.

## WHAT ALREADY EXISTS — do not rebuild it

`scripts/proof-check.mjs` already makes COMPILER claims executable: each
`<!-- proof: FSxxxx -->` marker's fsharp block is injected, compiled, and passes
only if the build fails with the stated error code. Its rationale is the exact
principle this CC-CMD extends: *"A proof document that no one runs is a design
document."* It was built after AMNESTY-PROOF claimed `formatDramaPeak` was the
only drama-score-to-string path while `DramaArc` was still `Nested<int list>` —
40 green assertions, none of which touched the gap.

`<!-- claim: name = value -->` markers have NO such harness. They are numeric
assertions about production and nothing reads them. That is the gap.

## TASK 0 — PROBE (read from HEAD, do not trust this document)

1. Inventory every `<!-- claim: ... -->` marker across `docs/*-PROOF.md`.
   Report the real count per doc. Note: these are HTML comments — a naive
   `^\s*name.field =` regex finds ZERO and will produce a false negative.
2. For each marker, determine whether its value is checkable against a
   reachable source: relay source constant, live relay route, client source at
   HEAD, or D1. Classify each as CHECKABLE or NOT-CHECKABLE with a reason.
   Do not force a check that cannot be honestly automated.
3. Read `scripts/proof-check.mjs` and `scripts/checks.mjs` and follow their
   existing conventions rather than inventing a parallel mechanism.

## TASK 1 — Build the claim harness

Extend or add alongside `proof-check.mjs` so every CHECKABLE `<!-- claim: -->`
marker is evaluated against its real current source. Report three states, never
pass/fail:

- `HOLDS` — marker matches live value
- `STALE` — marker and live value both readable and they DISAGREE
- `UNCHECKABLE` — no reachable source, with the reason recorded

`UNCHECKABLE` must never alarm and must never be silently counted as `HOLDS`.
Reporting a marker as holding when nothing verified it is the failure this whole
document is about.

## TASK 2 — Sweep all 18 proof docs

Run it. Produce a full table: doc, marker, claimed value, live value, state.
Do NOT fix the stale docs in this session — report them. Rewriting a proof
doc's numbers is a judgement about what the doc is arguing, and that is a
separate decision from detecting the drift.

Known stale going in, as controls the sweep MUST catch: the three
`ceiling.*` markers above. If the harness does not flag those three, it does
not work — do not report success.

## TASK 3 — Date-stamp production premises

Prose premises like `Desk.fs:1369` are not markers and will not be caught by
Task 1. For each proof doc, record in the sweep output whether it states a
production defect in the present tense, and when that was last verified.
Recommend a convention for date-stamping such claims; do not apply it repo-wide
in this session.

## DONE CONDITION (verifiable probe output)

- Marker inventory with real per-doc counts.
- Full sweep table pasted verbatim.
- The three `ceiling.*` markers appear as `STALE`.
- `Desk.fs:1369` appears in the Task 3 present-tense list.

## TASK 4 — Outbox manifest (last task)

`outbox/cc-session-2026-09-11-proof-claim-staleness-sweep.md` with the Task 0
classification, the full sweep table, the commit SHA, and an explicit statement
of which markers the harness cannot check and why.
