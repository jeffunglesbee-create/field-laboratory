# STAGED without an executor is a claim with no owner — 2026-08-23

## Measured

**55 files across the two repos contain the word STAGED. Four things check
anything** (`verify-staged-items.mjs`: `closing_after_opening`,
`soccer_opening_coverage`, `epl_brief_event_grounded`,
`recap_names_a_scoring_play`).

Rule 74 already requires a staged item to state what unblocks it and the exact
commands to verify it. That is a **document** discipline — it produces a written
verification a human then has to remember to execute.

## Three failures, one defect

All three happened this month. Each was patched individually, in a separate
session, before anyone noticed they were the same thing.

| | failure | what it cost |
|---|---|---|
| **A** | the unblock is a **future event**, and nothing re-evaluates whether it happened | `closing-odds-capture` read "blocked by a soccer slate running after `bb04fc8`" for two days *after* soccer had played — while the relay's own probe had measured EPL 4/5, La Liga 2/3, `PASS` |
| **B** | the verification is **written and never run** | the 2026-08-16 session wrote an explicit Rule 90 artifact, marked it UNVERIFIED because its sandbox 403s `*.workers.dev`, and it sat unrun for six days |
| **C** | the verification **runs and cannot discriminate** | the brief-contamination probe scanned every returned brief with no baseline, so one pre-fix brief pinned it at "still generating" permanently |

A and B are both *no executor*. **C is a different defect** — a probe that runs
and lies — and this check does not solve it. Said plainly, because a guard
claiming more than it does is the failure it exists to prevent.

## The move, which this repo had already made twice today

`Sport.Golf` did not get *fixed*. `Omission` made "unmodelled" a **declared case
carrying a reason**, and `sportMeta`'s exhaustive match turned forgetting one
into a compile error. `.githooks/pre-commit` did the same to the outbox rule: a
documented discipline became a mechanical one.

Same move: **STAGED becomes unrepresentable without a named executor.**

```
**STAGED** (verifier: soccer_opening_coverage @ relay/staged-verification.yml)
```

- `lab/…` — the id must appear in `scripts/cc-cmd-followup.mjs` **and** the named
  workflow must carry a `schedule:`.
- `relay/…` — checked for well-formedness only, and reported as cross-repo. This
  repo cannot read the other's source, and asserting otherwise would be the same
  pretence the check removes.
- `outbox/` is exempt by construction. Those are records, not claims — "was
  STAGED, now verified" must stay writable.

## Two defects in the check itself, both caught before it shipped

**1. The matcher ended at the marker.** `\*\*STAGED[^*]*\*\*` stopped at
`**STAGED**` and never saw the tag that follows it on the same line, so every
*tagged* claim read as an orphan. A check nobody can satisfy is a check that gets
deleted. Now captures the whole line.

**2. It found zero claims, because it matched an invented convention.** The first
version required uppercase `STAGED`. The shape this repo actually writes is
`**Staged verification (Rule 74).**`. Zero findings read as "clean" and would
have passed forever while measuring nothing — the same vacuous-test class as the
contamination probe six hours earlier. Now case-insensitive, with a self-test
carrying the observed shape verbatim.

**3. Importing it ran a full docs scan** as a side effect, so the historical
proof below printed its report twice before the module was entrypoint-guarded. A
module whose import has side effects cannot be tested against anything but
itself.

## Proof it would have caught the real one

Run against `docs/CC-CMD-2026-08-21-closing-odds-capture.md` as it stood before
today's fix (`b238854~3`):

```
PRE-FIX doc, claims found: 2
  verifier=null   **Staged verification (Rule 74).** That the `887c843` fix yields a real sequence
  verifier=null   **Staged verification (Rule 74).** That the alias fix raises soccer opening
```

Both orphans, including the one that sat two days past its own passing result.
Against `docs/` today: **0 claims** — every one was closed or tagged in this
session, which is why the historical run is the evidence rather than the current
one.

## Wiring

`.githooks/pre-commit` (docs-only scan, no network, belongs at the door) and
`verify.yml`, beside `check:history` for the same reason that one sits there:
both ask whether the written record can be trusted, and neither depends on what
the other steps measure.

10 self-test assertions, including the two exemptions that keep history
writable — prose *about* staging is not a claim, and a lowercase mention is not a
claim.

## What this does not solve

A verifier that exists, runs, and lies. That is failure C, and its fix is the
baseline discipline — four instances corrected this month, three in
`verify-staged-items.mjs` and one in `cc-cmd-followup.mjs`. This check makes
orphans impossible. It does not make probes honest.
