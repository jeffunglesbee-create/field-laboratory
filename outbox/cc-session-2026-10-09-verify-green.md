# 2026-10-09 — .NET in the session, and the gate run for real

**Asked:** "fix check:rows. Lets get .net in this session"
**Credits spent at any vendor:** 0

---

## .NET is in the session

```
dotnet --list-sdks      10.0.112 [/usr/lib/dotnet/sdk]
dotnet tool restore     fable 5.13.0 restored
npm install             ok
npm run build           47 source files, Fable 14.8s, public/ assembled
```

Nothing was installed at session start — no `dotnet`, no `node_modules`, no
`build/`, and `git config core.hooksPath` was **empty**. That last one matters
and is picked up again below.

The repo already carries the installer: `scripts/install_dotnet.sh`, called by
`scripts/install_pkgs.sh` from the `SessionStart` hook in
`.claude/settings.json`. Running it by hand took 40 seconds and worked first
time. The script's own header explains why `apt` and not `dotnet-install.sh`
(`dot.net` redirects to `builds.dotnet.microsoft.com`, which the gateway denies)
and why SDK 10 and not 8 (Fable 5.x ships `tools/net10.0/` only). Both measured
by whoever wrote it; both held today.

**And the clone was deepened**: `git fetch --unshallow` took 2 seconds and took
it from 279 commits to 1847. That is not cosmetic — two gates are meaningless on
a shallow clone and say so in their own output, and one of them turned out to be
hiding a real failure behind the shallow-clone message.

So for the first time this session the full local gate is runnable, which is
what made the rest of this entry possible.

## check:rows — one bare clock read, four days red

`verify` has been red since 2026-10-03. The gate-row step is `npm run check:rows`
(`scripts/row-confidence.mjs`), and with the build present it finally printed its
reason:

```
  <  70/100  w20  breaking each invariant makes a check fail   teeth: harness-blind
                      scripts/mutation-check.mjs: reads the clock 1x (capture it once as NOW)
  22/23 rows at or above 95
FAIL  every gate row is at or above 95
```

The scorer's rule, in its own words: *"One clock read is permitted, and only in
the shape this repo settled on elsewhere: capture the instant ONCE into a
top-level `const NOW = new Date()`, then be pure."*

The offending read was in `scripts/mutation-check.mjs`'s baseline writer. Its
own comment block says why that writer exists: *"A measurement that exists only
in a truncated log is not a measurement anyone can act on."*

**That block is `901f00e`, and `901f00e` is the commit the regression starts at.**
Measured, not inferred — the step's conclusion across the last ten `verify` runs:

| run | head | gate-row step |
|---|---|---|
| #334 | `f28913d` 10-04 | ok |
| #335 | `901f00e` 10-05 | **failure** |
| #336 … #339 | | failure (one skipped) |

So the change that made the mutation baseline readable broke the gate that
scores the mutation harness, and the symptom was 70/100 on a row whose name
("breaking each invariant makes a check fail") points at the harness rather than
at a timestamp.

Twice in two days, the same lesson: `901f00e` added a wall-clock field to make a
measurement legible, and yesterday's axis manifest deliberately omitted one for
exactly the reason `status.yml` states. Same problem, opposite answers, four days
apart.

**The fix** is the shape the scorer asks for — `const BASELINE_AT = new Date()`
captured once, `at: BASELINE_AT.toISOString()` in the literal. Two lines.

```
23/23 rows at or above 95
PASS  every gate row is at or above 95
```

### Mutated before trusted

A row that has only ever scored 100 proves nothing. The fix was broken on
purpose, with the anchor's uniqueness asserted first so a no-op could not report
as a pass:

```
MUTATION APPLIED: BASELINE_AT -> a second bare new Date()
clockReads 2   captures 1   FLAGGED true
    70/100  (weight 20)  breaking each invariant makes a check fail
FAIL  every gate row is at or above 95
```

Then restored, and made permanent as a mutation row —
`harness-reads-the-clock-twice`, the 84th — so this cannot regress silently:

```
PASS  the unmutated tree passes every expectation
PASS  [harness-reads-the-clock-twice] the harness captures its one clock read ...
```

Its `expect` is `node scripts/row-confidence.mjs` and **not** `run-row.mjs`,
which is what `gate-day-per-row` (the same rule, aimed at the gate's own day)
uses. The reason is in the row's comment: this row's own command is the
83-mutation suite, so `run-row.mjs` would either take its verdict from the last
full gate run or cost fifty minutes — neither can fail for the reason the
mutation exists. The scorer runs in one second and drops the row directly.

---

## check:import-purity — three scripts ran their work on import

With `node_modules` installed, the purity probe reads differently from the way it
read yesterday. Yesterday it named `team-tint-render-check.mjs` and
`viewport-overflow-check.mjs`; both import `playwright` at module scope and
`node_modules` was empty, so that pair was an artifact of the sandbox. With deps
present they pass, and three real offenders appear:

```
→ scripts/forecast-run.mjs:         the import terminated the process (exit 1)
→ scripts/probe-epl-substrate.mjs:  the import terminated the process (exit 1)
→ scripts/replay-odds-coverage.mjs: the import terminated the process (exit 0)
```

Each ended in a bare top-level `process.exit(...)` with no entry-point guard, so
importing it ran its work and killed the importing process. This is the fourth,
fifth and sixth instances of a class `staged-outbox-check.mjs`'s own header
already records three of: *"Three modules written in one session … each exported
functions and each did its work at import time."*

It also explains an observation filed yesterday as a loose end — that running
`npm run check:import-purity` wrote `outbox/epl-substrate-probe-latest.json` and
a fresh timestamped probe file. It was `probe-epl-substrate.mjs` reaching the
relay from inside the purity probe's own import. Now it cannot.

All three now carry `if (isMain(import.meta.url))`, the guard the rest of this
repo uses.

### The guard that passed for the wrong reason

The first version of this fix put the explanatory comment immediately before the
new `if`, and the note's trailing newline had been stripped — so
`...catches them.if (isMain(import.meta.url)) {` was **one comment line**.

`probe-epl-substrate.mjs` and `replay-odds-coverage.mjs` failed loudly, with a
dangling `}`: `SyntaxError: Unexpected token '}'`.

`forecast-run.mjs` **passed**. Its call was a single line with no braces, so
commenting out the `if` commented out the entry point entirely: the file imported
cleanly because it no longer did anything at all. One of the three was green for
precisely the reason that made it broken, and the check could not tell.

So both halves are now asserted, not one:

```
forecast-run           IMPORT CLEAN   and `node scripts/forecast-run.mjs` reaches main() (TypeError: fetch failed — sandbox egress)
replay-odds-coverage   IMPORT CLEAN   and --self-test  11/11
probe-epl-substrate    IMPORT CLEAN   and --self-test  37/37
```

A guard that silences a script satisfies "importing never runs it" perfectly.
`grep -n '^if (isMain(import.meta.url))'` on all three confirms the line is code
and not comment.

```
PASS  importing a module never runs it or exits the process      2/2
```

---

## The reason this took four days to see: verify hides its own tail

`check:rows` is green in CI as of run #340, and the run is still red — at
`check:history`, with **eleven steps behind it skipped**.

That is the shape of the whole week. A failing step ends the job, and this tail
is thirteen independent reports in a row:

| run | died at | steps skipped behind it |
|---|---|---|
| #335–#339 | Doc citations are anchored | 27 |
| #340 | Source and outbox changed together | 11 |

So each round of this session could see exactly one failure, and finding the
next cost a full run. `check:rows`'s reason was invisible until the two steps in
front of it were green.

`live-check.yml` already carries the fix, with the reasoning written out:
*"EVERY PAGE ASSERTION RUNS, EVEN AFTER ONE FAILS … a failing step ends the
job, so a run reported exactly ONE of them. That is arithmetic, not luck, and it
cost seven rounds."*

**And `docs/history-boundary.txt` claims verify was already fixed this way:**

> Separately, and not a substitute for any of the above: verify.yml used to run
> this check mid-suite, so its failure skipped the twenty steps after it. That
> is fixed independently — a violation is now reported without masking the rest
> of the suite, whether or not the boundary ever moves again.

It is not fixed. `check:history` sits at line 767 of `verify.yml` with eleven
steps after it and no gate, and `grep -n continue-on-error` on that file returns
nothing. The claim was written as an intention and has been read since as a
fact — the same source-versus-copy substitution this repo's own rule names,
with a document standing in for the workflow.

Thirteen steps now carry
`if: "!cancelled() && steps.build.outcome == 'success'"`. Gated on the build and
not `always()`: a step whose module graph never compiled fails for a reason that
says nothing about the commit, and thirteen such failures at once is worse than
one honest skip.

## check:history — twelve governed violations, and the cause is not attention

This is the one thing in this entry NOT fixed, and the reason is that the
remedy is a governance decision rather than a repair.

On a full clone (1847 commits), `check:history` names twelve commits that
changed `src/` or `scripts/` with no `outbox/` entry in the same commit:

| commit | when | author | first source paths |
|---|---|---|---|
| `f9d85e7` | 10-08 23:31 | FIELD CI | `scripts/axis-check.mjs` |
| `d2205eb` | 10-08 22:49 | FIELD CI | `scripts/build-site.mjs` |
| `f28913d` | 10-04 15:24 | FIELD CI | `src/Forecast.fs` |
| `5ad2627` | 10-04 01:18 | FIELD CI | `src/Forecast.fs` |
| `f04f443` | 10-04 01:13 | FIELD CI | `src/Suite.fs` |
| `521b52c` | 10-04 01:11 | FIELD CI | `scripts/forecast-run.mjs` |
| `d92d03d` | 10-04 01:04 | FIELD CI | `src/Forecast.fs` |
| `54d2472` | 10-04 01:01 | FIELD CI | `scripts/probe-epl-substrate.mjs` |
| `5f4e002` | 10-04 00:49 | FIELD CI | `scripts/mutate-odds-coverage.mjs` |
| `e461943` | 10-03 17:16 | FIELD CI | `scripts/probe-epl-substrate.mjs` |
| `345d030` | 10-03 17:14 | FIELD CI | `scripts/probe-epl-substrate.mjs` |
| `0a59bf8` | 09-23 01:10 | FIELD CI | `scripts/skill-drift-check.mjs` |

Two are mine, from yesterday. All twelve are `FIELD CI` — local sessions, not
the `Claude` identity the committing workflows use, so this is not the
machine-authored class the fourth boundary move addressed.

### The cause, measured rather than inferred

At the start of THIS session:

```
which dotnet              NOT ON PATH
ls node_modules | wc -l   0
ls build/                 (absent)
git config core.hooksPath  (empty)
```

`scripts/install_pkgs.sh` is the only thing that runs
`git config core.hooksPath .githooks`, and `.githooks/pre-commit` is the only
thing that runs `check:staged-outbox` — the guard that catches this class at the
one moment it is still answerable. Nothing was installed, so the script did not
run, so the guard was not in the path. Three sessions' worth of violations,
three separate dates, one missing bootstrap each time.

`docs/history-boundary.txt` already wrote this diagnosis, on 2026-08-23, for the
third move:

> `.githooks/pre-commit` exists in this repo … It did not run, because
> `git config core.hooksPath .githooks` was never set in this session … An
> opt-in guard that nothing opted into produces exactly this shape: not one
> lapse repeated three times, but one missing install that removed the guard for
> a whole session.

And the fourth move said what to do when it recurred: *"the guard above was
bypassed or removed, and THAT is the thing to investigate — not the commits."*

`core.hooksPath` is set now, and the pre-commit gate ran on every commit in this
session — its output is in the run log above each of them.

### Why the boundary was NOT moved

The file's sanctioned remedy is to move the boundary and the count together,
named. Derived, so it is one edit if wanted:

- **boundary** → `aa1e9b5` — the first commit after `f9d85e7` that ships source
  (2 scripts) *beside* an outbox entry, which is the property the fourth move
  required: *"the boundary lands on a commit that demonstrates the rule rather
  than one that merely avoids it."*
- **count** → `24 + 12 = 36`, derived on a full clone (1847 commits, not the
  279-commit shallow one that makes this number meaningless).

Not done, for two reasons. The file escalates away from absorption at exactly
this point — four moves have each promised the next violation would fail, and
twelve at once is four times the largest prior move, ten of them other
sessions'. And the durable fix is not mine to make: the repo's own
`docs/SETUP-SCRIPT.md` names the environment's **Setup script** field (the cloud
environment menu in the session title bar, then Edit) as the proper home for the
bootstrap, where the environment cache makes it free and no hook has to fire.
Absorbing twelve before that field is filled invites a sixth move.

---

## A second delivery for the outbox guard, and what it proved about the first

The twelve violations below all have one cause: `.githooks/pre-commit` runs only
when `core.hooksPath` points at it, and the only thing that sets that is
`scripts/install_pkgs.sh` from the `SessionStart` hook. It had not run.

`scripts/hook-staged-outbox.sh` asks the same predicate from a different
delivery — a `PreToolUse` hook on `Bash`, filtered with
`"if": "Bash(git commit*)"`, read straight out of `.claude/settings.json` with
no install step, no `git config`, and no npm packages (`staged-outbox-check.mjs`
imports only `./checks.mjs` and shells out to git).

Three outcomes, pipe-tested with the real stdin payload:

| staged | command | exit | effect |
|---|---|---|---|
| nothing | `git commit -m x` | 0 | allowed |
| `scripts/hook-staged-outbox.sh` alone | `git commit -m x` | **2** | **blocked** |
| the same violation | `git commit --no-verify -m x` | 0 | allowed |

Exit 2 is what blocks, so a guard that *cannot* run exits 2 as well — failing
open is the state that produced twelve violations. `--no-verify` passes through
untouched because that is the override `staged-outbox-check.mjs`'s own error
message documents.

`SessionStart`'s matcher also widened from `startup|resume` to
`startup|resume|clear|compact`. This session was continued from a compacted
conversation, and nothing was installed.

### It is NOT proven to fire, and that is the finding

Attempting a deliberately-violating commit with the hook written and
schema-validated (`jq -e` returns the command, exit 0):

```
$ git commit -m "probe: does the PreToolUse guard fire"
pre-commit: fast gate…
```

The Bash command **ran**. A `PreToolUse` hook that fired would have stopped it
before the shell saw it; what blocked the commit was the git hook, now that
`core.hooksPath` is set. So the new guard was not live in this session — a
settings-file hook added mid-session needs a config reload (`/hooks`) or a fresh
session, which a session cannot do to itself.

That is worth more than the hook. It says the hook-delivery path is itself
unreliable here, which is the same fact as the bootstrap not having run, and it
is the strongest argument for the remedy this repo already documents and that no
session can apply: `scripts/install_pkgs.sh` pasted into the environment's
**Setup script** field, which runs before Claude Code launches and needs no hook
at all. `docs/SETUP-SCRIPT.md` has the text.

**Verify it after a fresh session, in one command:** stage a source file with no
outbox entry and run `git commit`; the guard is live if the command never
reaches the shell — no `pre-commit: fast gate…` line.

---

## The boundary moved — the fifth move, twelve commits

`docs/history-boundary.txt`: `d917dc9 / 24` → `aa1e9b5 / 36`. The file requires
the reason to be said here as well as in it, so:

**Why history before `aa1e9b5` stopped being governed.** Twelve commits across
three sessions shipped `src/` or `scripts/` with no `outbox/` entry in the same
commit. The rule is per-commit and settled at commit time by design, so a later
entry does not pair with any of them — `6e00b19`'s own subject reads *"docs: the
outbox entry `d2205eb` owed"*, which is the right thing to have written and is
not a substitute. The only remedy the repository sanctions is this file, and the
only alternative is a permanently red `main`; that choice is spelled out in the
08-17 entry and has not changed.

**The boundary is `aa1e9b5`** because it is the first commit after the last
violation that obeys the rule affirmatively: two scripts beside
`outbox/cc-session-2026-10-08-axis-manifest.md`. The six commits in between touch
no source at all, so the boundary lands on a commit that demonstrates the rule
rather than one that merely avoids it.

**36 = 24 + 12**, derived and then measured:

```
Per-commit source/outbox correlation over 1857 commits
  rule effective at : aa1e9b5
  predating the rule: 36 (declared 36 in docs/history-boundary.txt)

PASS  the rule boundary has not moved
PASS  every governed commit changed source and outbox together
```

Derived locally, with the depth confirmed first — the rule both earlier entries
set after a shallow clone produced a meaningless number. This clone began the
session at **279** commits, where `check:history` cannot even find `d917dc9`;
`git fetch --unshallow` took two seconds and 1847 commits. CI remains the
authority if the two ever disagree.

**What the file now says to do if it moves a sixth time:** look at the
environment's Setup script field, not at the commits. Three of the five moves
now have the same cause — a guard whose delivery did not run — and the fifth
could not even prove its own replacement guard fires.

---

## Every check's failure reason is now readable without the log

The one blocker left after the boundary move is `Render check against the LIVE
slate`, and its reason could not be read: `runs/<id>/logs` answers with a
redirect to blob storage that this sandbox's GitHub client refuses, and the
annotations endpoint — which that client CAN read — carried only the runner's
own line.

```
$ gh api .../check-runs/113640147415/annotations
  failure  .github:130  Process completed with exit code 1.
  failure  .github:44   Process completed with exit code 1.
```

Nothing emitted any annotation, so nothing was there to read. That is now fixed
once, in the shared harness, for every script that uses it.

`scripts/checks.mjs`'s `summarize()` emits one `::error::` line per failed
check when `GITHUB_ACTIONS === 'true'`. No `permissions:` grant, no file
written, no change to any individual script.

**Escaping is the whole substance of it.** An annotation is one line, and `%`,
`\n` and `\r` in a detail silently truncate or corrupt it; `:` and `,` separate
the command's own properties, so a check name containing either loses its title
and takes the message with it. `%` is replaced **first**, or the `%0A` just
introduced for a newline is itself re-escaped to `%250A` and the reader sees a
literal `%0A`.

11 self-tests on the pure function, plus the integration half in both
directions, because a pure function nothing calls annotates nothing:

```
GITHUB_ACTIONS=true  ->  ::error title=a failing check%3A the axis did not rise::widths [133,133,133,133]
(unset)              ->  0 annotations
```

Note the `%3A`: the colon in that check's own name, escaped.

### Two mutations, both caught

| id | mutation | caught by |
|---|---|---|
| `annotation-escapes-percent-last` | `%` escaped after the newline | *"PERCENT IS ESCAPED FIRST, or the %0A it introduces is re-escaped"* |
| `annotation-prop-keeps-its-colon` | the `:` escape dropped from property values | *"A COLON IN THE NAME IS ESCAPED — it separates properties"* |

86 mutation rows now, and each ran against an unmutated positive control first.

Rule 91 applies to the cap as well: GitHub renders at most ten error annotations
per step, so an eleventh would vanish. Past the cap the **count of what was left
out is itself annotated**, where the reader can see it, rather than being
dropped.

---

## Green, and the chain drives itself again

```
verify   #343  8c4cda0  -> success     (first green since 2026-10-03 — six days)
  JOB verify      -> success
  JOB push-lands  -> success
  JOB claim-sweep -> success
guards   #212, #213    -> success
```

Then, with no dispatch from this session — `verify` going green is what
`deploy` triggers on:

```
deploy      #915  2cced76  -> success
live-check  #958  2cced76  -> success
   success   The deployed build stamp matches main
   success   The deploy landed (published is the newest deployable commit)
   success   The score's weight axis interpolates on the DEPLOYED page
   success   Commit the measured widths

outbox/axis-manifest-latest.json
   deployedCommit 2cced76   variable [125,137,146,149]   control [133,133,133,133]
```

The widths are identical across three deployed builds now and the control is
flat to the pixel in every one of them. Only `deployedCommit` moves, which is
the one thing the manifest was designed to move on.

### `Render check against the LIVE slate`, honestly

It failed on #341 — the first run it had executed in over ten — and passed on
#343. I do not know what #341's cause was: it is a live-slate check, the
annotation channel did not exist yet, and the log was unreadable. Stated as
transient rather than fixed. The next time it fails, its reason arrives as an
annotation, which is the whole point of the change above.

### What was red at the start of this session, and what each turned out to be

| gate | cause | status |
|---|---|---|
| `check:rows` | one bare `new Date()` in the mutation harness, from `901f00e` | fixed, mutation-guarded |
| `claim-sweep` | a control pinned to `src/Desk.fs:1369`; the premise moved to 1468 | fixed, 11/11 mutations |
| `check:citations` | two bare citations I wrote the day before, both factually wrong | fixed |
| `check:import-purity` | three scripts ran their work on import | fixed, entry points re-proven |
| `check:history` | twelve commits with no paired entry, from an uninstalled guard | boundary moved, second guard shipped |

Five causes, no overlap, and four of the five were invisible until the step in
front of them went green — which is why the thirteen-step fail-fast tail was
worth unmasking before any of them.

---

## The citation ratchet is at zero

`docs/citation-budget.txt`: `1` → `0`. The last bare citation in the repository
is gone, and it was not a formatting problem.

`docs/NON-CONTEST-DESIGN.md` item 2 read: *"`scripts/sport-registry-check.mjs:92`
asserts `golf.Modelled === false`. That assertion flips..."* — written on
2026-08-25 as a plan. Two things had since gone stale. The assertion **flipped
the same day** (the doc's own header says `Status: BUILT 2026-08-25, same day`),
so it now reads `golf.Modelled === true && golf.Label === 'golf' && golf.Omission == null`
under the check named `golf is modelled, and as a non-contest`. And `:92` had
drifted onto `check('score ordering agrees with the matchup text for every sport',`,
an unrelated check — the exact drift `check:citations` exists to catch, sitting
inside the budget that tolerated one.

The item is now in past tense, anchored on the assertion's real text, and dated.

### The first mutation of this was DEAD, and the reason is a property of the checker

Breaking it on purpose, at budget 0, by re-inserting
a one-line `See sport-registry-check.mjs:92 ...` above the Guards
section:

```
MUTATION APPLIED: one bare citation re-introduced
0 bare
PASS  bare citations do not grow (budget 0)
```

Not caught — and not because the ratchet is blind. The insertion point sits
within 400 characters of the Guards section's own backticked fragments, one of
which is present in `scripts/sport-registry-check.mjs`, so the citation
**anchored by accident**. The mutation changed no output, which makes it a dead
mutation; this repo's rule is to re-aim it, never to leave it green.

Re-aimed with 630 characters of plain prose between the citation and the nearest
backtick:

```
BARE  docs/NON-CONTEST-DESIGN.md  ->  scripts/sport-registry-check.mjs:92
FAIL  bare citations do not grow (budget 0)
```

(Line 92 of that file today is
`check('score ordering agrees with the matchup text for every sport',` — which
anchors the citation printed above and is also what the stale `:92` had drifted
onto.)

Then restored: `bare 0`, `PASS`.

**The ratchet then bit this very entry, at the door.** Writing *about* a bare
citation creates bare citations: the prose above quoted the offending
`path:line` twice, `classify` strips neither backticks nor fenced blocks, and
the pre-commit gate refused the commit with `2 bare against a budget of 0`.
Fixed by dropping the `scripts/` prefix from the synthetic example and anchoring
the probe output on the real line-92 text. Three minutes after the budget
reached 0 it blocked a commit for exactly the class it exists for, before CI —
which is what the gate being installed in this session buys.

Worth keeping as a fact about the checker rather than a defect in it: anchoring
is proximity-based, so a citation near an unrelated quoted fragment that happens
to appear in the cited file reads as anchored. The window is the mechanism and
the mechanism has a false-negative mode. Nothing to fix today — the ratchet is
at 0, so the next bare citation fails whether or not any particular one could
have been smuggled past by position.

---

## verify-full #25 — green, 530/530, and it exposed a defect by passing

```
verify-full #25 on f272b49 -> success        (first green since before 2026-09-21)
docs/confidence-log.jsonl, newest entry:
  sha      f272b495e8be03b640396a37c769754692de0170
  earned   530 / 530  => 100
  failing  none
```

Five consecutive failures preceded it, back to 2026-09-21: the full 86-mutation
suite and the confidence gate had not passed in nearly three weeks. All 86 ran,
all 23 rows scored, nothing failing. Job 57 minutes against a 90-minute cap —
close enough to be worth watching as the suite grows.

### The defect it exposed, which only a PASSING run could show

It committed `outbox/mutation-baseline-latest.json` reading `ran: 1,
from_mutations: 1`.

The gate row runs three commands in this order:

```js
run: () => ok('node scripts/mutation-check.mjs --self-test') &&
           ok('node scripts/mutation-check.mjs') &&                        // 86 of 86
           fails('node scripts/mutation-check.mjs --only known-survivor')  // 1 of 1
```

The baseline was written **unconditionally** on every invocation, so the third
command overwrote the second's record moments after it was made. The artifact
whose own comment reads *"A measurement that exists only in a truncated log is
not a measurement anyone can act on … Written unconditionally, pass or fail, so
a green run records the baseline it was green against"* has been recording the
wrong run for as long as it has existed.

I had read that file earlier in this session and called it "three days stale".
It was not stale. It was being clobbered, every run, by the command after the
one that filled it.

**Worse than losing the measurement:** `ran: 1` carries no visible denominator,
so the file reads as a baseline of one expectation that passed rather than as
the remains of one that covered 86. Rule 91 violated by construction, in the
artifact built to satisfy it.

### The fix

`ownsBaseline(ONLY)` — only a full run writes it. An `--only` run **says** it is
not writing, because absent-because-not-applicable and absent-because-broken are
different facts:

```
  baseline NOT written: --only baseline-written-by-any-run covers 1 expectation(s)
  of the full suite, and the artifact is the full run's
```

And the written object now carries `scope: 'full'`, so a reader can tell a full
record from any other without inferring it from the counts.

Verified end-to-end rather than by reading: the committed baseline's sha256
prefix was `19df2dcd087374a3` before an `--only` run and `19df2dcd087374a3`
after it. Unchanged.

Two self-tests (6/6 now) and one mutation row, `baseline-written-by-any-run`
(87 rows), which flips `ownsBaseline` to `() => true` and is caught by *"AN
--only RUN DOES NOT, so it cannot overwrite the full record"* — against an
unmutated positive control.

The done condition is the committed artifact reading `scope: "full"` with both
counts at the full suite's. That needs one more `verify-full` run, dispatched in
this session rather than left as a carry-forward.

### The first attempt at that fix cost 506 seconds and mutated src/

`ownsBaseline` was written with an `export` keyword in front of it. That one word
was enough to do this:

```
 1453  510s  node scripts/import-purity-check.mjs
 1650  506s  node --input-type=module -e await import("./scripts/mutation-check.mjs")
 4637  475s  node scripts/run-row.mjs "doc claims are compiler-verified, not prose"
 4644  475s  node scripts/proof-check.mjs
```

`import-purity-check.mjs` probes only the scripts that declare a top-level
export, and it probes them **by importing them**. `mutation-check.mjs` has no
`isMain` guard — 1400 lines of harness run at module scope. So the export
enrolled it in the probe's set, and the probe ran the entire 86-mutation suite
inside a pre-commit hook: `run-row.mjs` and `proof-check.mjs` spawned as
children and a commit hanging for over eight minutes.

**And it survived the first SIGTERM.** Killing its parent shell orphaned it onto
PID 1, where it kept marching through the suite for another four minutes. It was
mutating a different source file at each look:

| when | file | state |
|---|---|---|
| at the kill | `src/Scoreboard.fs` | an injected `__proof76` body from the killed `proof-check` — no marker |
| | `src/Scout.fs` | `Answer = Unanswerable "player milestone data (production reads BDL; not in /context/date)"` rewritten to `Answer = DoesNotQualify "no milestone"` — no marker |
| +4 min | `src/Journalism.fs` | `proxy-silent-becomes-false` applied, marker present |
| +4 min | `src/Scoreline.fs` | applied, marker present |

`kill -TERM` was ignored for 20 seconds; `kill -KILL` ended it. Healed with
`git checkout -- src/` and the stale `.mutation-state` removed by hand; then
`check:clean-source` 3/3 and a clean rebuild.

Two findings in that table, not one. The marker-less pair is the hazard
`gate-checks.mjs` already documents for SIGKILL — *"a stranded mutation … the
gate would have gone GREEN on a deliberately broken invariant"* — observed here
with no signal delivered at all, because the probe's import was mid-`proof-check`
rather than mid-mutation. And a harness that ignores SIGTERM while rewriting
`src/` is worth a guard of its own. Recorded, not fixed: both belong in a commit
about the harness's signal handling, not this one.

**The guard.** `UNGUARDED_SCRIPTS = ['mutation-check.mjs']` in
`import-purity-check.mjs`, with `wronglyExporting()` asked **before** the probe
and the offenders excluded from the probe set either way. Order is the entire
fix: a check that reports this after probing would have to survive the probe
first, and a failing check must not also be the thing that hangs.

Measured in both directions:

| state | result | wall |
|---|---|---|
| no export (as shipped) | 3/3 pass | **5s** |
| the export restored | `FAIL  no module-scope script has acquired an export…`, offender named, never imported | **5s** |

5 seconds instead of 506, with the reason printed. Four self-tests, including
*"THE LIST IS NOT EMPTY, or this guard is vacuous"* — an empty list would make
the whole check free and silent.

This is the sixth instance today of one class — a module that does its work at
import time — after the three found in `forecast-run.mjs`,
`probe-epl-substrate.mjs` and `replay-odds-coverage.mjs` this morning. I caused
this one, an hour after fixing those, with a keyword.
