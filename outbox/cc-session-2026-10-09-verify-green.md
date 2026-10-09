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
