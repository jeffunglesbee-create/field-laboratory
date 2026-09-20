# CC-CMD-2026-09-11 proof-claim staleness sweep — executed 2026-09-20

**Repo:** field-laboratory · **branch:** main
**Evidence date in the CC-CMD:** 2026-09-11. **Run date:** 2026-09-20, nine days
later, so every live value below was re-probed rather than taken from the
document.

## Headline

The harness works: **all three `ceiling.*` controls report `STALE`.** It also
found **two the CC-CMD did not know about** — a fourth `ceiling.*` marker and
one in `JLAYER-PLAN.md`.

**5 STALE · 9 HOLDS · 0 UNCHECKABLE, of 14 markers in 5 documents.**

No stale document was fixed. That was the instruction and it is also the right
call: rewriting a proof doc's numbers is a judgement about what the doc is
arguing, which is a separate decision from detecting the drift.

## CORRECTION, 2026-09-20, after this document was first written

**The CC-CMD's core premise is false at HEAD, and this document repeated it.**

CC-CMD-2026-09-11 says:

> `<!-- claim: name = value -->` markers have NO such harness. They are numeric
> assertions about production and nothing reads them. That is the gap.

`scripts/docs-check.mjs` reads them. It has read them for some time: its header
cites the same three examples the CC-CMD does — PROSE-PROOF's 1.75 and 91.2,
CEILING-PROOF's "240 as 97.96% of 245", JOURNALISM-PROOF's 285 of 627 — and it
carries a `CLAIMS` registry with a resolver for **all fourteen** markers. It is
wired into `verify.yml` at step 36 as `npm run check:docs`.

**It had gone dark.** Step 36 is one of the 43 steps skipped behind the red step
24 described below. From outside, *"no harness exists"* and *"a harness that
never runs"* are indistinguishable — which is this CC-CMD's own thesis, applied
one level up, to the CC-CMD.

### And running it does not fix it, which is the part worth keeping

Run directly, on this tree, today:

```
PASS  every claim a document makes is still true
3/3 checks passed
```

Green — on the same five markers this sweep reports STALE. The reason is one
import:

```
scripts/docs-check.mjs:42
import { maxOf, nominal, relayReachable, unreachable } from '../build/Ceiling.js'

src/Ceiling.fs:67   Max = 300<point>
src/Ceiling.fs:72   Max = 245<point>
```

| | nominal | reachable |
|---|---|---|
| relay `journalism-quality.js` — **the source** | 294 | 252 |
| `src/Ceiling.fs` — a copy | 300 | 245 |
| `CEILING-PROOF.md` — a copy of the copy | 300 | 245 |

**`docs-check` compares copy #2 against copy #1, so it passes because both sides
of its comparison are stale in the same direction.** This repo's CLAUDE.md asks
one question for exactly this — *"Is this the source, or a copy of the source?"*
— and the check built to keep document claims fresh does not ask it.

### What that means for this CC-CMD

**Fixing step 24 alone would have made this ask satisfiable without touching the
real defect.** `docs-check` starts running, reports "every claim a document makes
is still true", and four wrong numbers keep shipping under a green check.

The only reason `claim-check.mjs` disagrees with it is the one design decision
described under Task 0 below: **resolve against the source, not a copy.** That —
and the second CI checkout that makes it possible — is the entire difference
between the two harnesses. Not the parser, not the three states.

### What I got wrong

I inherited *"nothing reads these markers"* from the CC-CMD and **never grepped
`scripts/` for a consumer of `<!-- claim:`**. Task 0.3 told me to read
`proof-check.mjs` and `checks.mjs` and follow their conventions; I did, and
stopped there. I re-probed every **value** in the document and never re-probed
the **premise** that no harness existed — Rule 72, and Rule 100's corollary, on
the day this same document records five other instances of that shape.

### One thing this does NOT establish

Whether `src/Ceiling.fs` is **stale** or is **deliberately encoding the
historical scale the 240 bar was set against** is unresolved. Its whole argument
is that a bar from one scale cannot judge a score from another, so 300/245 may
be intentional history rather than drift. The CC-CMD's author read the markers as
present-tense claims about the relay, and `CEILING-PROOF.md:18` supports that
reading — but deciding it is precisely the "judgement about what the document is
arguing" that Task 2 deferred, and it is still deferred.

## Task 0 — inventory and classification

**The naive regex really does find zero.** Asserted, not described: the
self-test scans every `docs/*.md` with `^\s*name.field = value\s*$` and requires
the count to be **0** while this parser finds 14. A false negative that is only
written down in prose is one refactor from coming back.

14 markers, and the CC-CMD's count was low in two places — it names three
`ceiling.*` markers where four exist, and does not mention `JLAYER-PLAN.md`.

| doc | markers |
|---|---|
| `CEILING-PROOF.md` | 4 |
| `CORPUS-PROOF.md` | 2 |
| `JLAYER-PLAN.md` | 2 |
| `JOURNALISM-PROOF.md` | 3 |
| `PROSE-PROOF.md` | 3 |

Seven further markers live in `CC-CMD-2026-09-11` itself, inside fenced blocks.
Those are **quotations, not assertions**, and the parser skips fenced regions
for that reason — counting them would invent claims no document is making.
`CC-CMD-*.md` is excluded from the sweep outright.

**Every marker turned out CHECKABLE**, which was not the expected answer going
in. (See the CORRECTION above: `docs-check.mjs` had already reached the same
conclusion and built resolvers for all fourteen. Its `ceiling.*` resolvers read a
local copy; these read the relay.) Sources:

| marker family | source | reachable how |
|---|---|---|
| `ceiling.*` | `field-relay-nba/src/journalism-quality.js` | second repo, **imported and evaluated** |
| `corpus.*` | `data/jq-mlb-game-corpus.json` | committed, 592 rows |
| `journalism.*` | same corpus, via the Dim 8 extractor copied verbatim in `journalism-check.mjs` | local |
| `prose.*` | same corpus, via `jq-tokenizer.mjs` — the relay's `scoreProse` body | local |
| `sports.modelled`, `briefTypes.modelled` | F# union cases in `src/Desk.fs`, `src/Journalism.fs` | local |

**The relay constants are IMPORTED, not read.** `NOMINAL_TOTAL` and
`REACHABLE_CEILING` are computed from `SCALE` and carry trailing comments
(`// 294`, `// 252`). Those comments have been wrong before — the same file
records `REACHABLE_CEILING` going `245 -> 277` *silently* — so the resolver
imports the module and reads the evaluated export. Reading the comment would be
reading a copy of the answer.

## Task 2 — the sweep, verbatim

```
=== claim sweep  2026-09-20T17:13:59.311Z ===

doc                  marker                          claimed  live   state
-------------------  ------------------------------  -------  -----  -----
CEILING-PROOF.md     ceiling.nominal                 300      294    STALE
CEILING-PROOF.md     ceiling.relayReachable          245      252    STALE
CEILING-PROOF.md     ceiling.unreachable             55       42     STALE
CEILING-PROOF.md     ceiling.flatBarPctOfReachable   97.96    95.24  STALE
CORPUS-PROOF.md      corpus.size                     592      592    HOLDS
CORPUS-PROOF.md      corpus.unattributed             592      592    HOLDS
JLAYER-PLAN.md       sports.modelled                 24       27     STALE
JLAYER-PLAN.md       briefTypes.modelled             11       11     HOLDS
JOURNALISM-PROOF.md  journalism.statSentences        627      627    HOLDS
JOURNALISM-PROOF.md  journalism.unanchoredSentences  285      285    HOLDS
JOURNALISM-PROOF.md  journalism.unanchoredPct        45.5     45.5   HOLDS
PROSE-PROOF.md       corpus.size                     592      592    HOLDS
PROSE-PROOF.md       prose.minRawDensity             1.75     1.75   HOLDS
PROSE-PROOF.md       prose.flooredPct                91.2     91.2   HOLDS

  HOLDS 9   STALE 5   UNCHECKABLE 0   of 14 marker(s) in 27 doc(s)

COVERAGE: 14 of 14 markers were compared against a live source.
Markers inside fenced blocks are skipped as quotations; CC-CMD-*.md is excluded.
```

### The two the CC-CMD did not name

**`ceiling.nominal = 300` → 294.** The CC-CMD's own body states
`NOMINAL_TOTAL = 294` and quotes the reason — *"the 300 was a label rather than
a total"* — yet lists only three markers as controls. The fourth was in the
document being read.

**`sports.modelled = 24` → 27.** `src/Desk.fs`'s `Sport` union carries 28 cases;
27 excluding `Unrecognised`. Three sports were modelled after the plan was
written and the plan's own count did not move.

### Why the HOLDS are not evidence of much

Nine markers hold, and eight of them resolve against
`data/jq-mlb-game-corpus.json` — a **frozen committed file**. They cannot drift
until someone re-captures the corpus, so their holding says the harness reads
them correctly, not that the world agrees with them. The one non-corpus HOLDS is
`briefTypes.modelled = 11`, which is live against F# source.

Stated because a green whose denominator is invisible is a claim about
everything.

## Task 3 — present-tense production premises

**91 premises across 55 files: 18 DATED, 73 UNDATED.** `docs/*-PROOF.md` and
`src/*.fs`.

The control is present:

```
  UNDATED  src/Desk.fs:1369  [the FIELD app]
            FIELD app computes a win-probability away side as `1 - homeWP` — the two-way
```

`DATED` means a date or year appears within six lines. **It does not mean the
claim is still true** — `Desk.fs:1369` would be no less false with a date beside
it. This measures whether a premise says *when* it was checked, which is
mechanical; whether it is still true is a question only re-probing answers.

A **declared subject list**, not a classifier: ten external systems this repo
makes assertions about, written down. A general "does this sound like a claim"
heuristic would flag the F# prose the repo is made of — the same reasoning
`check-no-foreign-domain.mjs` uses for hosts.

### Recommended convention — NOT applied in this session

A present-tense claim about another system carries its verification inline:

> `<claim> (verified <YYYY-MM-DD> at <ref>)`

`Desk.fs:1369` would read: *"computed a win-probability away side as
`1 - homeWP` (true at `bf67bad`, 2026-09-11; FALSE at HEAD)"*. Past tense plus a
ref **cannot go stale** — it stops being a claim about now and becomes a claim
about then. 73 sites would need touching; that is its own CC-CMD.

## What the harness cannot check, and why

**Nothing, in this sweep** — 14 of 14 compared. Three gaps are real anyway and
are named rather than left to be discovered:

1. **`ceiling.*` depend on a second repository.** `verify.yml` now checks out
   `field-relay-nba` to `.relay-src` for the `claim-sweep` job. Without it those
   four report `UNCHECKABLE` — and the run would look clean while the only
   markers anyone knew were wrong went unexamined. `UNCHECKABLE` is never
   counted as `HOLDS`, is printed with its reason, and the coverage line names
   the count.
2. **The sweep's own `no resolver` branch is outside mutation coverage.**
   `--self-test` does not execute the sweep, so no mutation of that branch could
   go red. Said in the harness's own COVERAGE line, not only here.
3. **A premise being DATED is not a premise being true.** See above.

## Verification

| what | result |
|---|---|
| `claim-check.mjs --self-test` | **17/17** |
| `mutate-claim-check.mjs` | **8/8 caught** |
| the three named controls | all **STALE** |
| `Desk.fs:1369` in the premise list | present, **UNDATED** |
| `workflow-check` | PASS |
| `check-script-orphans` | PASS — both new scripts reachable from `verify.yml` |
| `check-doc-citations`, `staged-outbox-check`, `exposed-secret-check` | PASS |
| stale documents fixed | **0**, by instruction |

## Three defects of my own, all caught by running rather than reading

1. **The relay import resolved against the wrong base.** `existsSync` resolves
   against cwd; `new URL(rel, import.meta.url)` against `scripts/`. So
   `../field-relay-nba` passed the existence check and then imported from
   `field-laboratory/field-relay-nba/`, which is nowhere. **The first real sweep
   reported all four controls `UNCHECKABLE` with the missing path** — the design
   working exactly as intended. A harness that defaulted to a plausible value
   would have printed a clean sweep.

2. **Mutation C1 was NOT CAUGHT, and my assertion was the reason.** It deletes
   the `unreachable` guard; the self-test still passed because `{unreachable}`
   also has `value === undefined`, so the *next* guard caught it. The assertion
   was green with the branch it names deleted. The sharp case is a resolver
   returning **both** — an unreachable source carrying a stale value is exactly
   how "nothing verified it" becomes HOLDS. Added; C1 now bites.

3. **The `Desk.fs:1369` control needed three fixes and the first two looked
   right.** The sentence wraps: line 1368 ends `... surface. The`, 1369 begins
   `FIELD app computes`. (a) line-by-line matching → invisible; (b) a two-line
   window → the `//` sits between article and noun, still invisible; (c) strip
   comment markers → `"the  field app"`, two spaces, **still** invisible. Only
   collapsing whitespace found it. Each version was read, looked correct, and
   was refuted by running it. The control is now an assertion (`premisesIn`
   finds line 1369, and finds it UNDATED) plus two mutations, C7 and C8.

## A fourth defect, caught by the repo's own pre-commit hook

The first commit attempt was **rejected**. `import-purity-check.mjs`:

```
FAIL  importing a module never runs it or exits the process
      → scripts/claim-check.mjs: the import terminated the process (exit 0)
```

The sweep ran at import time and called `process.exit`, so anything importing
`parseClaims` or `stateOf` — including `mutate-claim-check.mjs`, one file over —
would have terminated before its own next line. That check exists because three
modules already did this, and one of them nearly published the results of a
probe that never executed.

Fixed with the established `isMain(import.meta.url)` guard, the same one
`exposed-secret-check.mjs` and `history-check.mjs` carry. **The guard caught it
at the door; nothing reached history.**

## A fifth, and it was mine to avoid

Running the repo's gate list included `proof-check.mjs` and
`mutation-check.mjs`, both of which inject code into tracked F# sources — and I
ran them inside a `timeout 60` loop. That is the precise kill-mid-run scenario
both files' headers document, twice:

> `let private __proof23` was COMMITTED to src/Scoreboard.fs in 217282b

It happened again here: `__proof56` in `src/Scoreboard.fs`, plus stranded
mutations in `src/Desk.fs` and `src/Pick.fs`. Nothing was committed — the files
were never staged, and `check:clean-source` was green before the commit — but it
cost the time and it was avoidable by reading the header of the file I was
about to run under a timeout.

One further wrinkle worth recording: the loop I wrote to wait for those writers
to exit **matched itself** — its own command line contained the pgrep pattern —
so it could never terminate. The only real process left by then was a dev
server.

## Two things found after the commit, both pre-existing

**1. `verify`'s main job has been RED for at least six consecutive runs,
failing at the same step.** Not caused by this work — run 311 (`cbd6b4d`,
2026-09-19) and run 312 (`94f3cac`, this commit) both fail at

```
step 24  The chrome, measured on the rendered page   FAILURE
step 25-68                                           SKIPPED
```

Forty-three checks are skipped behind it, including *"Every claim a document
makes is still true"*, *"No script a workflow depends on became unreachable"*
and *"Importing a module never runs it"*.

**That is the argument for `claim-sweep` being its own job, now demonstrated
rather than asserted.** Had the sweep been a step inside `verify`, it would have
been skipped on this very commit and reported nothing — the same shape as the
push-lands guard wired at step 46 of a job whose step 24 was already red, which
this repo fixed four days ago.

Not fixed here: it is a rendering failure in a different subsystem, outside this
CC-CMD, and diagnosing it is its own task.

**2. Six CC-CMDs carried no `**Status:**` line**, which
`scripts/cc-cmd-status-check.mjs` has been red on. That check exists because a
session once read a stale "open" and rebuilt work that had already shipped —
reintroducing two bugs the original had been corrected for one day earlier.

The one this session executed now carries `**Status:** **CLOSED 2026-09-20**`
with its four met done conditions, so 6 → 5.

**The remaining five are deliberately untouched.** Inventing a status for a
document whose state I have not verified is precisely the "claim with no
verification" failure this whole session is about. They are listed, not fixed:

```
CC-CMD-2026-09-07-readme-token-claim-correction.md
CC-CMD-2026-09-11-closing-odds-sequence-watch.md
CC-CMD-2026-09-11-epl-forecaster-phase1.md
CC-CMD-2026-09-11-spread-total-model.md
CC-CMD-2026-09-12-odds-models-unverified.md
```

## Automation

`verify.yml` gains a `claim-sweep` job — its own job, for the reason
`push-lands` has one: a step inside the long `verify` job is skipped whenever an
earlier step is red, and a check that only runs on a green tree cannot report on
a broken one. Checkout, the relay checkout, node, three runs: ~30 seconds,
against a `verify` job that is roughly three-quarters of this repo's Actions
spend.

Neither `STALE` nor `UNDATED` fails the build. A red nobody is permitted to fix
is a red everyone learns to skip.
