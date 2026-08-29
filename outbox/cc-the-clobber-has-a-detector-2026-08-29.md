# The clobber has a detector — and writing it reproduced the defect three times

**Date:** 2026-08-29
**Scope:** `scripts/check-script-orphans.mjs`, `docs/unreachable-scripts.txt`,
`.github/workflows/verify.yml`, `.github/workflows/guards.yml`, `package.json`

## What was broken

`package.json` carried:

```json
"check:sports": "node scripts/sport-registry-check.mjs"
```

run by `verify.yml` under the step name **"The sport registry matches what
production serves"** — 12 blocking assertions covering `matchupText` and
`orderByMatchup`, written after drift-sentinel reported `unmodelled: NFL, CFL,
golf` two days running.

A new render check was assigned to that same key. The key survived. The step
name survived. The step kept passing. And `sport-registry-check.mjs` became
referenced by nothing in the repository.

Nothing caught it. `unused-check.mjs` was the obvious candidate; it was run
against the clobbered tree and reported **1/1 PASS**, because it checks F#
public values, not npm script keys. The forward question every workflow linter
asks — *does every `npm run X` resolve to a script?* — was true throughout.

The only question that fails is the backward one: **is every script a workflow
depended on still reached?**

## The check

`scripts/check-script-orphans.mjs`, three assertions:

1. every `npm run` in a workflow resolves to a script (forward — the cheap half)
2. no script became unreachable without being declared in the ledger
3. the ledger carries no script that is reachable again

Its self-test carries the clobber as a fixture, with the pair that matters:

```js
const before = { 'check:sports': 'node scripts/sport-registry-check.mjs' }
const after  = { 'check:sports': "URL='x' node scripts/render-check.mjs" }
T('THE CLOBBER IS DETECTED: a file reachable before is unreachable after', ...)
T('...and the forward direction alone would NOT have caught it',
  'check:sports' in before && 'check:sports' in after,
  'the key survived, so every npm run still resolved')
```

Current state: **84 of 85 files in `scripts/` reachable, 1 declared, 3/3 PASS.**

## The reachability walker, and the five times it lied

This is the part worth recording, because the check is a detector for
reading-instead-of-executing and its own construction produced the defect five
times in a row. Every one was found by running it, none by reading it.

| what the walker missed | what it reported | how it was found |
|---|---|---|
| only followed `npm run` | 33 scripts unreachable | 33 is not a plausible orphan count |
| `import` edges between scripts | 10 unreachable, mostly libraries | asked what the ten were: `checks.mjs`, `jq-tokenizer.mjs`, `game-id-scheme.mjs` |
| `npm run --silent X` — captured `--silent` as the name | the pre-commit hook's whole chain | `.githooks/pre-commit:30` |
| read its own YAML comment ``does `npm run X` resolve?`` as code | a missing script named `X` | the missing-script list had one entry and it was one character long |
| shell-out edges (`gate-checks.mjs` runs `node scripts/generate-scouting.mjs`) | `mutation-check.mjs` an orphan while the gate ran it every row | grepped for who references it |

The fifth fix — harvesting `scripts/X.mjs` from the source of every reachable
script — then produced the sixth:

**A JS comment that NAMES a script is not an edge to it.** Two `//` lines
mentioning `scripts/fetch-silently-empty-probe.mjs` — one of them inside
`check-script-orphans.mjs` itself, in the comment explaining why *YAML* comments
are stripped — made a deliberately-ledgered probe read as reachable, and
assertion 3 then demanded its ledger line be deleted. Fixed by
`stripJsComments`, which strips `//` only at line start or after whitespace so
`https://` survives, with both cases in the self-test.

And the seventh, from the same harvest: the reachable count read **89** against
85 files on disk. The four extra were this file's own self-test fixture strings
— `scripts/a-b.mjs`, `scripts/c.mjs`, `scripts/probe.mjs`, `scripts/real.mjs` —
walked into the reachable set as if they were files. They could never mask a
real orphan, but a count that overshoots the directory is a count nobody can
check against `ls`. Edges are now filtered to files that exist; 84 + 1 declared
= 85 exactly.

## Two ledger entries deleted, and one that stays

`docs/unreachable-scripts.txt` is a ledger, not a ban: probes and one-off
censuses are deliberately manual, and forbidding them would push real tools into
fake workflows to satisfy a checker. What assertion 2 enforces is that the list
does not **grow** silently, which is what a clobber does.

Assertion 3 enforces the other direction, and it earned its place immediately.
Two entries were stale the moment the shell-out edge was added:

- **`generate-scouting.mjs`** — `gate-checks.mjs:280` runs
  `node scripts/generate-scouting.mjs --check`.
- **`run-row.mjs`** — `mutation-check.mjs` builds
  `node scripts/run-row.mjs "<row>"` forty-one times.

`run-row.mjs`'s own ledger entry argued that declaring it here was *"more honest
than widening the walker to guess at string-built commands."* That was wrong,
and the check is what proved it: the walker does not guess: it harvests literal
`scripts/X.mjs` paths from live code, which sees both edges exactly.

`fetch-silently-empty-probe.mjs` stays. It is swept on demand rather than on a
timer — two sites in 265 scripts does not carry a cron's standing cost.

## Where it runs, and the comment that was written from memory

The check has **two inputs on opposite sides of the trigger split**:

| input | fires |
|---|---|
| `package.json`, `scripts/**`, `.github/workflows/**` | `verify.yml` (paths-ignore: `docs/`, `outbox/`, `**/*.md`) |
| `docs/unreachable-scripts.txt` | `guards.yml` (paths: `docs/`, `outbox/`, `**/*.md`) |

It was first wired into `guards.yml` alone, under a comment reading *"this
workflow already fires on `scripts/**` and `docs/**`, which is where both inputs
live."*

`guards.yml` does not fire on `scripts/**`. Its `paths:` block, eleven lines
above that comment, lists `docs/**`, `outbox/**` and `**/*.md`.

So the check would not have run on a commit that edits only `package.json` —
which is the exact shape of the clobber it was written for. The claim was
asserted from memory about a file open in the same editor. Same defect class as
the five above, and the sixth instance this session of a detector whose name and
whose measurement disagreed.

It now runs in **both** workflows. Neither placement alone covers both inputs.

## Verify

```
node scripts/check-script-orphans.mjs --self-test   # 9/9
node scripts/check-script-orphans.mjs               # 3/3, 84 reachable, 1 declared
npm run check:sports                                # 12/12 — restored, not the render check
npm run check:workflows                             # 6/6
```

---

## Addendum: the eighth instance, caught by CI on the commit above

`verify` failed on `12b80e7` at `check:import-purity`:

```
Probed 25 exporting module(s) in scripts/
PASS  there are exporting modules to check
FAIL  importing a module never runs it or exits the process
      → scripts/cc-cmd-status-check.mjs: the import terminated the process (exit 0)
      → scripts/check-script-orphans.mjs: the import terminated the process (exit 0)
      → scripts/fetch-silently-empty-probe.mjs: the import terminated the process (exit 1)
```

All three were written this session. All three export functions — which is the
declaration that something may import them — and all three did their real work
at module top level and then called `process.exit`. An importer's code after the
import line never runs, and the command still exits 0.

That is verbatim the failure `import-purity-check.mjs` exists for. Its own
header records the original: a probe of `confidence-record-check.mjs` that
printed the checker's output and none of the probe's, and was nearly reported as
a result. The repo has a convention for it — `isMain(import.meta.url)` from
`checks.mjs`, used by `history-check.mjs` and `confidence-record-check.mjs` —
and none of the three new modules used it.

Fixed: both the self-test trigger and the executable body of each are now
guarded by `isMain`. 2/2, 25 modules probed.

### Why it reached CI at all

`verify` was red on **three consecutive commits** — `c031a81`, `5359445`,
`12b80e7` — and the redness was not noticed, because the check that fails is
step 55 of 60 and nothing reported it back. `guards` was separately red on
`5359445` for the citation budget, fixed in the commit above.

The pre-commit hook runs `check:clean-source`, `check:workflows`,
`check:staged-outbox`, `check:staged-verifier` and `check:boundary` — all cheap,
no network, no build. `check:import-purity` has exactly that profile: it imports
25 modules in fresh processes and takes about a second. It is now the sixth
step at the door.

The pattern across all eight instances in this session is unchanged and it is
the one already written into CLAUDE.md: a fact about something outside the file
being edited, asserted from reading it. Here the outside fact was "this repo has
a rule about modules that export," and it was answerable by one command:
`npm run check:import-purity`.

### Verify

```
npm run check:import-purity        # 5/5 self-test, 2/2, 25 modules probed
node scripts/check-script-orphans.mjs        # 9/9 self-test, 3/3
node scripts/cc-cmd-status-check.mjs         # 11/11 self-test, 5/5
node scripts/fetch-silently-empty-probe.mjs --self-test   # 11/11
```
