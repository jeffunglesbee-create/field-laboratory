# CLAUDE.md

## Response style

Adopted 2026-08-17. Two published rule sets, applied to **chat replies**:

- `i-have-adhd` (ayghri) — 10 rules
- `no-ai-slop` (petergyang) — 20+ patterns

### i-have-adhd

1. Lead with the next action.
2. Number multi-step tasks.
3. End with one concrete next step.
4. Suppress tangents.
5. Restate state every turn.
6. Specific time estimates (minutes, not "a bit").
7. Make wins visible.
8. Matter-of-fact errors.
9. Cap lists at 5 items.
10. No preamble. No recap. No closers.

### no-ai-slop — patterns to avoid

Binary contrasts ("It's not X. It's Y."), throat-clearing openers, faux-insight
setups ("The part worth keeping"), colon reveals, dramatic fragments,
superficial analysis, importance puffery, weasel attribution, synonym cycling,
fake-profound endings.

### Carve-outs

- **Rule 8 applies to chat, not `outbox/`.** Error write-ups are the outbox's
  job and stay at full depth there. Terse in chat, complete in the outbox.
- **Rule 9 no longer needs one.** The carve-out agreed on adoption read: "Rule 9
  caps prose lists, not measured data — a 5-item cap would have truncated the
  workflow-minutes table, and that table was the answer." On 2026-09-20 the
  drift sentinel caught the published skill moving, and the new Rule 9 says the
  same thing in its own words: *"Never omit relevant items when completeness
  matters. This rule shapes presentation only; it must not limit analysis,
  search, tool results, candidate generation, or retained information."*
  Upstream adopted the exception, so there is nothing local left to except.
  Recorded rather than deleted because the reason was a measurement.

## Standing instructions

- Push to `main`.
- No PRs. A PR waits on a human merge, which is not automated — land changes as
  direct commits (to `main` here, to the target's default branch cross-repo via a
  runner). Applies to cross-repo asks too: automate the commit, do not open a PR.
- No fallbacks, only fixes.
- Automate follow-ups.
- If something cannot run here, use a GitHub Actions runner. "Cannot be tested"
  is not a valid excuse.
- Do not commit unless confidence >= 95. Below that, report verbatim and stop.
- **LAB-FIRST-A.** Build in the laboratory, not the client. Where new work could
  land in either repo it lands here; the client keeps the served page and the
  captures that feed this repo. Direct owner order, 2026-10-18. It outranks the
  routing default (client-scoped work to jubilant-bassoon, relay-scoped to
  field-relay-nba) wherever a choice exists, and leaves that default to decide
  work that can only live in one repo. Not retroactive: existing client code
  stays where it is (`docs/CC-CMD-2026-10-18-lab-first.md`).

## Probe-first, and it applies to commits (not just CC-CMDs)

field-relay-nba's Rule 87 says "Never write from memory — probe it", and scopes
it to **every CC-CMD**. This repo had no such rule at all, and on 2026-08-29 a
census of the session's own defects showed why that gap matters: the failures
happened in ordinary commits, outside any CC-CMD, so the discipline never
applied.

**Reading is a simulation of execution.** Every one of these bugs lived exactly
where the simulation and the execution diverge:

| what was read | what one command said |
|---|---|
| fixtures at `public/data/`, present locally | `git ls-files` — untracked; `public/` is gitignored build output |
| `detectSportClass`'s football branch, and "CFB is football" | `node -e` — `'cfb'` matches none of `nfl`/`football`/`cfl`, returns `null` |
| what `/context/date` "should" return | an existing consumer destructures `games.regular` / `games.postseason` |
| `epa_table.json`, by its name | the 1120 entries are under `.ep`; every lookup missed and returned `?? 0` |
| a local artifact file | the workflow run — the file was yesterday's |

Seven of the session's nine defects had this shape. The two that did not were
purely local: a vacuous ternary (`a ? x : x`, caught by reading, correctly) and
two overlapping tree-mutating scripts (process discipline, not verification).

**What separates them: a cross-boundary fact — a sibling directory's tracked
status, another repo's payload shape, a function's runtime behaviour, a
workflow's real state — asserted from local reading.**

### The rule

**A cross-boundary fact is not verified by reading. If one command answers it,
not running that command is the defect, however obvious the reading looks.**

"DO NOT ASSUME" does not cover this, and that is the point: reading the code IS
verification in that rule's letter, which is why believing I was obeying it did
not help. The discriminating question is narrower and answerable in a second:

> **Is this the source, or a copy of the source?**

`public/data/` was a copy. The local artifact was a copy. The `CLOSED` heading
convention was a copy that some documents happened to use. A copy is almost
always locally true, which is what makes it convincing.

### A fifth instance, found while writing this rule

Minutes after the paragraph above was written, `Sport.Bundesliga` — added and
compiled 71/71 that morning — rendered as `BUNDESLIGA · 6 · UNMODELLED SPORT`.

Cause: `npm run build` is `dotnet fable … && node scripts/build-site.mjs`, and
only the second half had been run. `build-site.mjs` assembles `public/` from
whatever is already in `build/`, so the page came from F# compiled **before** the
commit, and its behaviour was read as the source's.

The rule's own question answers it in one word. `public/` is a copy. `build/` is
a copy. `src/*.fs` is the source, and nothing had recompiled it.

The confirmation is the detail that would have been invisible in a boolean: the
stale build rendered `Union Berlin vs Frankfurt` and the fresh one renders
`Union Berlin v Frankfurt`. `vs` is `UnknownConvention`'s separator and `v` is
`HomeVersusAway`'s — so the case did not merely appear, it took effect. A check
asserting "Bundesliga is on the page" would have passed on the stale build.

## Actions budget

90% consumed as of 2026-08-16 with ~15 days left in the month. `verify` is ~3/4
of the spend. Prefer changes that cost no CI: `docs/**`, `outbox/**` and
`**/*.md` are in `verify.yml`'s `paths-ignore`.
