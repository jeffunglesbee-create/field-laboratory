# Outbox — Phase 3: the J-layer types, and 45.5% of stat sentences have no clock

**Date:** 2026-08-16
**Ships:** `docs/JLAYER-PLAN.md`, `src/Journalism.fs`,
`docs/JOURNALISM-PROOF.md`, `scripts/journalism-check.mjs`, two mutations,
one verify step

## The plan is out of the chat log

`docs/JLAYER-PLAN.md`. It closes the loop on its own final line — *"I'd also
suggest committing this plan to `docs/` so it stops living in a chat log — which
is, after all, the entire complaint."* Two days late.

It carries **status**, not intent, including the two places reality moved:
Phase 2's acceptance criterion turned out unreachable (`/archive/query` projects
no `scoring_version`; `unscored_count` is 0 relay-wide, so the set difference is
empty), and Phase 3 got stronger for a reason nobody planned.

## Phase 3, and the finding that made it worth doing

The plan treated `AnsweringModel` as a discipline — *"ONLY from `X-FIELD-Model`"*.
It is now a finding. `field-relay-nba/src/index.js` **never reads
`X-FIELD-Model`**: the header appears in scripts, in `CLAUDE.md`, and in CC-CMDs,
and nowhere in the worker source. The stored `model` column partitions perfectly
by writer path — `game_recap`+cron always Haiku, `pre_game`+cron always Gemini,
`backfill` always Gemini — and never varies within a path, which per-request
fallback would.

So `AnsweringModel` is **unconstructible from stored data**, and `ProxySilent` is
not a defensive case. It is the state of every archived brief. The type predicted
the defect before the defect was found, which is the closest this repository has
come to answering its own question.

## Acceptance test 1 — the branch production has never run

Six of six sampled proxy calls answered from Gemini with `X-FIELD-Gemini-Error`
empty. The Haiku fallback is shipped, depended upon, and unexercised. A stub is
the only way in, and it proves three things nothing has proven:

| claim | assertion |
|---|---|
| it selects the model named in `FallbackModel` | `fallbackRan` is `true` only for the declared name |
| it surfaces the fallback, not the primary | a Gemini failure yields `By haiku`, and a normal Gemini answer yields `fallbackRan = false` |
| it does not silently succeed when both fail | no header ⇒ `ProxySilent`, and `fallbackRan` is **`undefined`, not `false`** |

That last row is the one worth arguing about. Collapsing "we cannot tell" into
`false` removes an option from every call site and is the single most tempting
simplification in the module — and it would assert, about production, that the
fallback did not run, which nothing supports. Registered as mutation
`proxy-silent-becomes-false`; it fails the check.

A fourth case fell out while writing it: if the primary fails and something other
than the declared model answers, that is `Unexpected`, not a successful fallback.
The proxy substituting silently is a state the plan did not anticipate.

## Acceptance test 2 — nobody had counted this

The time-anchoring extractor, run over all 592 briefs, agreeing exactly with a
verbatim copy of the relay's `_temporalPrecision`:

```
stat sentences          627
time-anchored           342  (54.5%)
UNANCHORED              285  (45.5%)
briefs with >= 1        253 of 592  (42.7%)
```

**Nearly half of all stat sentences in production carry no time window.**
`FIELD_PROSE_STYLE` forbids exactly this. Example, `mlb_game_2026-06-16_g4`:

> "Fenway's +8% runs factor tilts the field toward Toronto's 34-38 lineup…"

Reported as a measurement, not scored against a threshold. The last time I
invented a threshold it failed at 69.6% and the honest fix was to assert the
claim the module already made rather than move the bar. Whether every stat
sentence needs an explicit window is an editorial call; the finding is that the
number was unknown.

Agreement is the test, as in Phase 1 — and it exposed a second tokenisation:
`_temporalPrecision` splits sentences on **non-empty**, while `scoreProse` a few
functions away filters `length > 3`. Two tokenisations in one file. Reproduced,
not reconciled. Mutation `anchor-drifts-from-oracle` confirms the comparison is
against the relay rather than against itself.

## What the compiler refuses

`docs/JOURNALISM-PROOF.md`, five cases, all confirmed:

| case | error |
|---|---|
| `AnsweringModel "claude-haiku…"` — wrapping the stored column | FS1093 |
| a `FallbackModel` where an `AnsweringModel` is expected | FS0001 |
| building a `Fact` without a `TimeWindow` | FS1093 |
| `judge` given the prompt instead of the context | FS0001 |
| matching `Answered` without handling `ProxySilent` | FS0025 |

## Three things I got wrong, all caught here

- **A regex that would not load.** The relay writes `\+\/\-`; Fable emits regexes
  with the `u` flag, under which `\-` outside a character class is an invalid
  escape, and the module failed to import at all. `\+/-` matches the identical
  three characters. The deviation is in the escaping, not the language, and it is
  forced — noted at the site, and the corpus agreement against the untouched JS
  is what keeps it honest.
- **Four accessors nothing read.** `unused-check` failed the build on `windowOf`,
  `contextKind`, `contextSubject`, `instructionOf`. Rather than delete them the
  check now reads them — and asserts round-trip *with payload*, since a window
  that lost its year would still have a matching tag.
- **Twelve cases that do not exist.** The plan specified `BriefType` as a 12-case
  DU. `/quality/report` shows **nine**. I modelled nine plus `Unmodelled`,
  following `Desk.Sport`'s precedent. Writing three imaginary cases to reach a
  number in a plan I wrote is exactly the invention this repository exists to
  catch.

## What is NOT proven

- **That the fallback works in production.** This proves the selection logic
  against a stub. The Haiku branch has still never run for real, and nothing here
  can change that — Phase 4's record/replay is what would.
- **That 45.5% is bad.** A measurement, not a verdict.
- **That the prose is any good.** The voice judge. No type reaches it.
