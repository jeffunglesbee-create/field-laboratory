# Session — the gate is a decision, not a score

**Date:** 2026-09-05
**Repo:** field-laboratory
**HEAD:** `f04b264` → this commit
**Task:** #27, approved as "all 3 approved" alongside #25 (graph WONTDO) and #26
(the README correction).

## What prompted it

The README's own closing line, unchanged since 2026-08-11:

> What would change that is building the harness in F# and seeing whether the
> failures above become unwritable — not asserting in advance that they would.

Probing before proposing changed the shape of the work twice.

**First:** `src/Verify.fs` already exists. It landed in `ba65230` at 17:24 on
2026-08-11; the README paragraph declaring that this repo's F# "has no record"
on verification is `98d000f`, 16:49 the same day. Thirty-five minutes. The
README then went twenty-five days without naming `Verify.fs` or
`docs/CHECK-PROOF.md` — a negative result kept past the evidence that retired
it. That is handled in the README commit, not here.

**Second:** the average gate is not what `Verify.fs` covers. `Verify.fs` is
about one check having teeth. The average is about how verdicts COMBINE, which
nothing in the F# half touched. So the work was real, and it was a different
piece of work than the one proposed.

## What shipped

Four types in `src/Verify.fs`, all with private cases.

| type | what the private case buys |
|---|---|
| `Row` | the only source is running a `Sealed` check. `Verdict`'s cases are public and must be — the suite reads them — which is exactly why `decide [ "everything", Held ]` has to be unwritable at the `Row` level |
| `Passing` | the witness `Passed` carries. Unbuildable outside the module, so no score, percentage or majority can mint a pass |
| `Gate` | `Passed` carries the witness; `Blocked` names which rows failed, because a count cannot say which invariant is off |
| `Score` | a percentage, for reporting. There is deliberately no function from `Score` to `Gate` anywhere in the module |

`VerifyMain` now exits on the `Gate` rather than on `failures = 0`. That
comparison was correct and was still a number standing where a decision
belongs — one edit from `failures <= 2`, which is how `confidence.mjs` acquired
its average in the first place.

## What is NOT claimed

`decide` itself could be edited into an average tomorrow. No type prevents that
in any language. The surface shrinks from "every caller, forever" to one
function inside one module; it is not eliminated. Both the source comment and
`docs/CHECK-PROOF.md` say so in their own text, before the cases rather than
after them.

Two of the README's ten verification-failure rows are now structural. **Eight
are not**, and they are the ones about the world rather than about the check: a
check that changes as the world moves under it, that changes the world it
measures, that answers about the wrong world, that agrees for the wrong reason,
four API failures rendering one sentence, and both claim-shaped rows.

## Artifacts

**Compiler half — 5 new cases in `docs/CHECK-PROOF.md`, each rejected with the
claimed code and nothing else:**

```
gate cases found: 5
baseline clean: true
PASS  case 1 claims FS1093 — compiler said: error FS1093
PASS  case 2 claims FS0001 — compiler said: error FS0001
PASS  case 3 claims FS1093 — compiler said: error FS1093
PASS  case 4 claims FS1093 — compiler said: error FS1093
PASS  case 5 claims FS0025 — compiler said: error FS0025

5/5 gate cases rejected as claimed
```

**Runtime half — `node build/VerifyMain.js`, exit 0:**

```
PASS      a suite where every row holds Passes
PASS      the passing witness counts the rows it saw
PASS      NINE OF TEN IS BLOCKED, and the score says 90
PASS      a blocked gate names the row that failed
PASS      the exit code comes from the decision, not the score
PASS      an empty suite passes with a witness of zero, not of one

  self-test: the harness can still tell the difference
110/110 checks held
```

**Mutation, both directions (Rule 90 — a check that has only ever passed has
proven nothing):**

| mutation | result |
|---|---|
| `decide` returns `Passed` at ≥90% | 3 self-test assertions red, exit 1 |
| `Passing`'s case made public | case 1 compiles cleanly, 4/5 |

Both restored.

## A defect in this session's own measuring apparatus

The five-case result above is the **second** run. The first reported 5/5 as
well, and it was worthless.

`scripts/proof-check.mjs` was still running in the background — it injects into
`src/Scoreboard.fs` and restores on exit — and a `kill` that did not take
effect let it re-inject after the tree had been restored. The five-case harness
then read that dirty file as its baseline, reported `baseline clean: false`,
**and ran anyway**. Every case built against a tree that already had errors, so
every case "failed to build" partly for reasons that had nothing to do with it:
the first run's output carried a stray `error FS0001` alongside four of the
five claimed codes, and the clean run carries the claimed code alone.

The harness now refuses on a dirty baseline instead of reporting one. That is
the same fix `proof-check.mjs` already had — its `baselineClean` check exists
for exactly this — reproduced by a script written to be quicker than it.

The count for this session is therefore one product defect (`sealedName` left
without a consumer, caught by `unused-check`) and one apparatus defect (a
harness that reported a state it had already measured as untrustworthy). Same
ratio as 2026-09-05's provenance work in the relay, and the same shape.

## Why the five-case harness exists at all

`proof-check.mjs` runs 57 cases, each a full `dotnet build`. In this
environment it accumulates roughly two and a half minutes of runtime per
session turn, so it does not finish. The five new cases were verified directly
instead — a subset, stated as a subset here per Rule 91 — and the full suite is
CI's job on this commit.

## Carry-forwards

None. The three approved items are done: this, the README correction, and
`outbox/decision-2026-09-05-laboratory-no-graph-tool.md`.

---

# Addendum — the gate was already red, and had been for five days

`verify-full` run 11 on `fffbd7a` scored **91/100 with two failing rows**. The
record written by run `946e4c8c` on **2026-08-31** carries the identical two rows
and the identical 91, and `f9ce6e43` on 2026-08-24 carries one of them. The three
commits above are not the cause; they are what caused anyone to look.

`verify-full`'s own header predicted this when the gate was split off the
per-push path on 2026-08-17:

> A gate failure can therefore land on main and sit there for up to a week
> unless someone dispatches this.

It sat for five days. The mitigation named beside that sentence — "the working
practice in this repo is already to run the offline suite before pushing" — is
what did not happen.

`proof-check` in the same run: **76/76**, including the five new gate cases.

## Three root causes, each fixed and each verified by the mutation that had
## stopped biting

**1. A venue nobody declared unfactored.** `data/brief-recency-corpus.json`
carries `"Journey Bank Ballpark at Historic Bowman Field"` — MLB's Little League
Classic at Williamsport, one game a year in a Double-A park. It resolves to no
park factor and was not on the unfactored list, so `venue-coverage-check` failed
the whole `decoders accept both real captures` row.

Fixed in `scripts/generate-scouting.mjs`'s `NO_PARK_FACTORS`, beside
`Field of Dreams`, then regenerated — the list is generated source, and a hand
edit to `src/Scouting.fs` would have failed the "generated source matches its
generator" row instead. Putting a fabricated 100/100 into the park table to
silence the check is the thing that file already refuses to do.

`node scripts/venue-coverage-check.mjs` → **4/4**, with the venue printed as
declared rather than silently skipped.

**2. A mutation anchored to CSS that was deliberately deleted.**
`cards-run-together`'s `find` named `border: 1px solid var(--edge)` and
`border-radius: 10px`. Commit `370bb8d` on 2026-08-26 — *"take the boxes back
off — the check could only ever say 'add a border'"* — removed exactly those. The
anchor matched nothing from that day, so the claim *"games on a panel are drawn
as separate cards"* was undefended for ten days.

**The first re-anchor was wrong, and its failure is the useful part.** It took
`padding` and `background` off `.st-card`. That applied cleanly and the mutation
SURVIVED, because `separation-check` measures a disjunction — `gap >= 4 ||
border contrast >= 3.0` — and neither padding nor background is an arm of it.
Breaking a property the check does not read is not a weaker mutation; it is not
a mutation at all.

`index.html` says so on the line above the rule: *"The gap is what
`separation-check.mjs` measures."* Re-anchored to `.st-reports, .wx-rows`'s
`gap: 1rem` → `gap: 0`. The gap arm then fails and the border arm is already 1.0,
because these cards have had no border since `370bb8d`.

`--only cards-run-together` → **2/2**, mutation caught.

**3. The two outbox mutations survived because of a file added today.**
`outboxToday` reads `outbox/*<today>*.md` and accepts ANY of them over 1500
bytes. `outbox-missing` and `outbox-stub` moved or stubbed only
`outbox/cc-*<today>*.md`. On any day carrying a second dated entry under another
prefix, the row kept its evidence and both mutations survived — reported as
"nothing defends this claim" when what was actually undefended was the
mutations' own reach.

Today was such a day: `decision-2026-09-05-laboratory-no-graph-tool.md` sat
beside the session doc. Both globs widened to the predicate's own glob.

`--only outbox-missing` → **2/2**. `--only outbox-stub` → **2/2**.

## The shape, again

Two of the three are the measuring apparatus rather than the product, and the
third is a data gap the apparatus correctly caught. Rule 90 says a check that
has only ever passed has proven nothing; the sharper form these three suggest is
that **a check whose mutation has stopped applying is worse than one that never
had a mutation**, because the row keeps reporting PASS and the mutation harness
keeps reporting a number that includes it.

`cards-run-together` failed loudly once the anchor was fixed — the harness's
anchor-existence assertion is what caught it, and that assertion exists because
of the "NOT CAUGHT with nothing mutated" defect recorded in Rule 90's table.
That one worked exactly as written.

---

# Addendum 2 — `proof-check --only`, and cleaning up after the killed runs

## The residue

Four background waits were still alive an hour after the local `proof-check`
they watched had been killed, and none of them could ever have exited:

- three polled `/tmp/proofcheck.log`, which stays empty by design — `checks.mjs`
  accumulates results and prints only in `summarize()`, so a killed run writes
  nothing at all rather than writing a partial log;
- the fourth ran `while pgrep -f "proof-check.mjs"`, which matched **its own
  command line**. It was waiting for itself.

Both are the session's recurring shape once more: an instrument that cannot
observe the thing it is aimed at, reporting nothing and looking identical to
"still working".

Also cleared: `/tmp/field-laboratory-proof-check.fs` and its `.registry`
sibling, left by a SIGKILLed run. Harmless here — the tree was clean and the
next run rewrites them — but a stale backup beside an interrupted run is a
restore-from-the-wrong-tree waiting to happen, and it cost nothing to remove.

## `--only`, added because a workaround reproduced a solved defect

`scripts/proof-check.mjs` gains `--only <substring>`, filtering to proof docs
whose filename matches.

The reason is not convenience. Verifying five new cases meant a full run — one
`dotnet build` per case — and in a sandbox whose clock advances only while a
turn is live, it never finished. So a parallel five-case harness got written in
`/tmp`, and it immediately reproduced a defect `proof-check.mjs` had already
fixed: it read a `src/Scoreboard.fs` that a killed run had left injected,
printed `baseline clean: false`, **and ran anyway**. Every case then failed to
build partly for reasons unrelated to it, and the run reported 5/5.

A subset run has to keep the baseline guard, which means the subset belongs in
the file that has it rather than beside it. The workaround is now deleted and
unwritable-again.

Two properties, both deliberate:

- **The empty match fails loudly.** `--only NOSUCHDOC` reports
  `0 of 73 case(s), 0 of 18 doc(s)`, lists the available docs, and fails "the
  proof doc contains machine-checkable cases". A filter that silently matched
  nothing and passed would be the vacuous green this repo keeps finding.
- **The coverage line is printed with the result** — `THIS IS A SUBSET` — per
  Rule 91. A filtered run states its denominator where the result is read.

Verified: `--only SPORT-PROOF` → 4/4 with the real case compiled and rejected
FS0025; `--only NOSUCHDOC` → fails, as it must.

## On HANDOFF.md

There isn't one, and there should not be. This repo's session state is the
outbox entry plus `STATUS.md`, which is generated in CI and probed live rather
than written by hand. An earlier note in this session said field-laboratory's
HANDOFF "has no entry for today"; the file does not exist at all, and the
convention it would duplicate is working.

---

# Addendum 3 — the gate re-run hit the job timeout, and the cap was sized on a stale number

`verify-full` run 12 on `e7a7d43` was **cancelled at 36m52s** by the 45-minute
job cap. Step 12 ran, found nothing to commit, and said so: `confidence.mjs`
appends its record only after every row finishes, so a timeout costs the entire
run and leaves no measurement at all — not even a partial one naming the row it
was on.

So there is still **no post-fix gate score**. The three fixes are verified
individually (`venue-coverage-check` 4/4; `--only cards-run-together` 2/2;
`--only outbox-missing` 2/2; `--only outbox-stub` 2/2) and the whole-gate number
is outstanding.

## Why it got slower, which is not growth

The three mutations repaired in `e7a7d43` had all silently stopped doing
anything, and repairing them added three real mutation cycles the cap was never
sized for:

- `cards-run-together` failed instantly on an anchor deleted ten days earlier.
  It never rebuilt and never drove a browser. It now does both.
- `outbox-missing` and `outbox-stub` had a glob narrower than the predicate they
  test, so on any day their pattern missed they moved no files. They now move
  files and run their row.

A suite that starts doing work it had been skipping gets slower, and that is the
fixes landing rather than a regression.

## The cap was reasoned from a figure that was stale twice over

The header's timing table said `check:proof 2m29s` and `confidence gate
17m14s`, measured on `9d66cf6`. Both are now past double:

| step | recorded | run 11 | run 12 |
|---|---|---|---|
| `check:proof` | 2m29s | 5m56s | 7m06s |
| confidence gate | 17m14s | 26m44s | >36m52s (cancelled) |

The 45 was set as "roughly twice the current run" against the 17m14s. Against
26m44s it was already thin, and against a suite doing three more mutation cycles
it was under.

Raised to **90**, which keeps that ratio against the 36m52s floor, and the table
above is now in the file so the next person sizing it reads a measurement rather
than a figure from August. The gate figure is recorded as a floor and labelled
as one — run 12 never printed, so nothing measured it.

This is the same failure the session has been finding all day, in the workflow's
own comments: a number that described the world when it was written, read later
as though it still did.

---

# Addendum 4 — the baseline short-circuited, which is why a red gate ran faster

Asked to find the hanging row. There isn't one, and the explanation I gave for
the slowdown in Addendum 3 was wrong. Both corrections come from the same line.

`scripts/mutation-check.mjs`, before today:

```js
const distinctExpects = [...new Set(selected.map(m => m.expect))]
check('the unmutated tree passes every expectation',
  distinctExpects.every(cmd => run(cmd)), ...)
```

**`.every` short-circuits.** `venue-coverage-check` had been failing since
2026-08-24, so this line stopped at the first failing command and never ran the
remaining twenty-odd — several of them browser rows. Fixing the venue made the
baseline green, and it now runs all 22 to completion.

The gate did not slow down. It started doing work it had been skipping for
twelve days.

## What I retract from Addendum 3

**"The three repaired mutations added the time."** `cards-run-together` is the
only `index.html` mutation in the suite, so repairing it added one
`npm run build` and one browser row — about a minute. `outbox-missing` and
`outbox-stub` always ran their `expect` regardless of whether their glob matched
anything, so they added nothing at all. The explanation was plausible and
unmeasured, which is the same fault as reading a stale timing table.

**"A failing baseline means nothing below would mean anything."** True as a
warning, and it does not abort: the loop over all 73 mutations runs either way.

## The consequence that reached a decision

26m44s from run 11 was **never a measurement of a passing gate**. It is the cost
of a short-circuited one. I then sized the 90-minute cap partly against that
number, treating it as a floor when it was not even that.

A red baseline running FASTER than a green one is the property that made this
invisible: every signal pointed at "the suite grew", and the suite had not grown.

## The fix, and its mutation proof

Run every distinct expectation, collect the failures, print the coverage with
the verdict per Rule 91:

```
  baseline: ran 22 of 22 distinct expectation(s) from 73 mutation(s), 0 failing
```

On a green baseline this costs nothing — `.every` already ran all of them. On a
red one it costs the remaining commands and buys the complete list of what is
broken, instead of the first one.

**Proved by breaking it (Rule 90).** Two distinct expectations pointed at
non-existent rows, multi-select temporarily enabled to select both:

```
  baseline: ran 2 of 2 distinct expectation(s) from 2 mutation(s), 2 failing
FAIL  the unmutated tree passes every expectation
            $ node scripts/run-row.mjs "MUTATED ROW B"
            $ node scripts/run-row.mjs "MUTATED ROW A"
```

Under `.every` that output names one command and stops. Harness restored after
the proof; `grep -c "MUTATED ROW"` → 0.

Green path verified separately: `--only outbox-stub` → `ran 1 of 1 … 0 failing`,
2/2 checks passed.

---

# Addendum 5 — banning the short-circuit, and making a timeout name its row

Two builds, both from the `.every` finding rather than from a wish list.

## 1. `all(...)`, and a lint that refuses the `&&` form

The general shape: **`&&` and `.every` do two jobs at once — they state a logical
claim, and they schedule the work.** Short-circuiting is correct for the claim
and wrong for the measurement. The verdict stays right; the COVERAGE becomes a
function of the data, so a red run and a green run stop being comparable and
nothing in the output says which one you are reading.

Measured before building, because the first estimate was wrong: **2 sites**, not
the twenty-plus I expected.

```
scripts/gate-checks.mjs   ok('npm run check') && ok('npm run check:hard')
scripts/gate-checks.mjs   ok('node scripts/unused-check.mjs') && ok('node scripts/units-check.mjs')
```

Both migrated to `all(...)`, which is `cmds.map(ok).reduce((a, b) => a && b)` —
`.map` runs every command before the reduce sees any of them.

`scripts/short-circuit-check.mjs` then refuses the old form so it cannot return
by habit. Wired into `.githooks/pre-commit`: pure regex over `scripts/`, no
network, no build, and it costs no CI.

**The rule over-fired on its first draft, and the fix is the interesting part.**
It flagged this line in `scripts/mutation-check.mjs`:

```js
const survived = built && run(m.expect)
```

That is a **precondition**, not a second measurement. `built` is the result of
`npm run build`; running the expect on a failed build would measure a broken
tree rather than the mutation, so short-circuiting there is correct. A linter
that flags correct code is one the reader learns to skip — so the rule now
requires **both** operands to be command calls, and that line is a `good`
fixture with the reasoning attached.

Fixtures live in `test/short-circuit-fixtures.json`, beside the other
deliberately-wrong fixtures, because the scanner reads `scripts/*.mjs` and would
otherwise flag its own test data. Excluding itself by name was the cheaper fix
and the worse one: it makes the checker the single place its own rule does not
apply.

**A defect found in the checker while writing it.** It reported `6/6 checks
passed` and exited 1. `summarize()` returns the FAILED COUNT, not a boolean, and
`process.exit(summarize() ? 0 : 1)` inverts on success — every other caller in
the repo writes `summarize() === 0 ? 0 : 1`. Two occurrences, both fixed. A
green report with a red exit code is the same verdict/coverage split this whole
addendum is about, arriving inside the tool written to stop it.

## 2. A timeout that names the row

Run 12 was killed at 36m52s and its log said **nothing**: `confidence.mjs`
printed its table only at the end, so a run that never reaches the end reports
neither a score nor the row it died on. The timeout was the one failure that
could not be diagnosed from its own output.

Each row now prints as it completes, with its duration:

```
  [   2s] PASS  decoders accept both real captures
  [  13s] PASS  every governed commit paired source with outbox
  ...
  260/270 points = 96/100   (bar: 95)   18s
```

A killed run now shows exactly which rows finished and which was in flight. The
record in `docs/confidence-log.jsonl` gains `seconds` and a per-row `rowSeconds`
map, so "the gate got slower" — or faster — becomes a question with an answer
rather than an impression.

That second direction is the one this session paid for. Every ratchet in this
repo guards against getting worse: citations, secrets, bare claims. None watches
for a suspicious **speedup**, and a silently-skipped check looks exactly like
one. The gate went short-circuited on 2026-08-24 and the only visible symptom
was that it finished sooner. `rowSeconds` is the data a ratchet on that would
need; the ratchet itself is not built yet, and is not claimed to be.

Verified: `--quick` prints per-row seconds and a total, 13 rows timed, record
written.
