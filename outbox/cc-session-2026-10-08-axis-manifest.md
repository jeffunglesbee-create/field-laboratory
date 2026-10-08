# 2026-10-08 — the axis widths become an artifact in the tree

**HEAD at start:** `f9d85e7`
**Asked:** "commit the axis manifest. Write the outbox when done."
**Credits spent at any vendor:** 0

---

## Why this was owed

Yesterday's entry closed with the axis proven on production and one thing
missing: the numbers. `live-check` run 37860371286 reported three green steps,
the last of them *"The score's weight axis interpolates on the DEPLOYED page"*,
and the widths behind that conclusion could not be quoted. The run log holds
them. `gh api repos/.../actions/runs/37860371286/logs` answers with a redirect
to `results-receiver.actions.githubusercontent.com`, and the GitHub client in
this sandbox refuses it — *"this gh sends requests to https://api.github.com
only"*. So the evidence was a step conclusion, and reporting it as a
measurement would have been reporting a boolean as a reading.

That gap had a second edge worth naming. The comment in `scripts/axis-check.mjs`
that declined to commit a manifest justified itself with a claim about this
workflow:

> Every workflow in this repo that commits an outbox artifact declares
> `permissions: contents: write`; live-check.yml declares none and is read-only
> by design.

The first clause is true — 22 workflows declare it. The second is a premise I
never probed. `live-check.yml` declared no `permissions:` block at all, which
does not mean read-only; it means the token takes the **repository default**,
which is a setting someone chose and can change. The endpoint that reports that
default is `actions/permissions/workflow`, and the sandbox proxy refuses it:

```
{"message":"Access to this GitHub Actions path is not permitted through this proxy."}
gh: ... (HTTP 403)
```

So from here the claim was not merely unverified but unverifiable, and I had
published it as a reason. Rule 100's corollary exactly: believing it cost
nothing, writing it into a comment and a status report converted a guess into
something a reader has to un-learn. Declaring `contents: write` explicitly is
the fix, and it makes the answer readable from the file instead of from an
endpoint nobody here can reach.

## What shipped

### 1. `manifestOf` — the manifest as a pure function

`scripts/axis-check.mjs` gained an exported builder and a `--manifest` flag
writing one file, `outbox/axis-manifest-latest.json`, matching the nine other
`*-latest.json` artifacts in `outbox/`.

Pure, and that is load-bearing twice. The self-test exercises every published
field with no browser, and the printed numbers and the committed numbers read
the same object — they cannot disagree.

**It carries no wall-clock field.** That is a decision, and `status.yml`'s own
commit step wrote the rule it follows:

> Commits only when a real fact changed. STATUS.md carries no timestamp
> precisely so this stays quiet — its git history should read as a log of
> things happening, not one commit a day saying nothing.

`live-check` runs on every deploy plus a daily cron. A timestamp would make
each of those a commit, several hundred a year, every one of them saying the
page is unchanged. Instead the manifest carries `deployedCommit`, read from the
stamp step's own fetch of `/version.txt`, so it changes when the served bytes
change or the widths change, and git's commit date supplies the when.

Not `runIdentity()` either, although `scripts/checks.mjs` says *"any file that
writes a measurement to a ledger needs the same identity"*. It digests **this
tree**, and this tree contains the previous manifest commit, so every run would
differ from the last for a reason having nothing to do with the page. The
subject of this measurement is the deployed artifact.

Rule 99 holds at each boundary: an absent `DEPLOYED_SHA` is `null`, never `""`;
an unsupplied failure count is `null`, never `0`.

Rule 91 holds inside the file: a `coverage` object travels with the result —
one page, one element class, four weights, one axis, `otherRolesSwept: 0`. A
reader who finds `variableRises: true` and nothing else would infer the whole
typography system had been measured.

### 2. `live-check.yml` — `contents: write`, and the commit step last

The commit step is the **last** step in the job, after every page assertion, and
the reason is `git pull --rebase`. It rewrites the working tree. The steps that
follow the axis check read source — the grouping check, the brief-phase rule,
the pick tabs — while `build/` is gitignored and survives a rebase untouched.
Had the commit step sat beside the axis step, a concurrent push to main would
have left those checks reading one source and asserting against a build of
another. That is this repo's recorded Bundesliga failure wearing new clothes.

The step runs when the axis check ran **at all**, pass or fail. A run whose
widths came back equal is precisely the run whose numbers someone needs; a
mechanism that published only the green ones would leave the interesting
measurement in the place that cannot be read.

An absent manifest is three facts, not one:

| state | what it means | what the step does |
|---|---|---|
| present | a measurement happened | commit if it differs from the last |
| absent, axis step **passed** | `--manifest` stopped reaching the script | `::error::`, exit 1 — a green check publishing no evidence |
| absent, axis step **failed** | the page never rendered; nothing to measure | `::warning::`, exit 0 — already reported above |

No loop: `outbox/` is in `verify.yml`'s `paths-ignore` and in
`scripts/deployable.mjs`'s `isIgnored` — *"export const isIgnored = f =>
f.startsWith('docs/') || f.startsWith('outbox/') || f.endsWith('.md')"* — so the
manifest commit triggers no workflow and never becomes the newest deployable
commit. It cannot retrigger the check that wrote it. Both halves read from
source rather than assumed.

## What was measured, locally

```
node scripts/axis-check.mjs --self-test     17/17 checks passed   (was 9/9)
node scripts/mutation-check.mjs --only axis-manifest-control-pinned   2/2
node scripts/mutation-check.mjs --only axis-manifest-timestamped      2/2
npm run check:workflows                      9/9 checks passed
```

Eight of the seventeen self-test checks are new and all eight are about the
committed artifact rather than the sweep.

### Both mutations, because a check that has only passed has proven nothing

Two rows added to `scripts/mutation-check.mjs` (81 → 83). Each ran against an
unmutated positive control first — *"PASS the unmutated tree passes every
expectation"* — so neither result is the harness reporting on clean source.

| id | mutation | caught by |
|---|---|---|
| `axis-manifest-control-pinned` | `controlRises` pinned to `false` | *"a rising CONTROL is published as rising, not quietly dropped"* |
| `axis-manifest-timestamped` | an `at: new Date().toISOString()` field inserted | *"the manifest carries NO wall-clock field"* |

The second is the one worth having. The quietness property — a run that
re-measures an unchanged page commits nothing — was prose in a comment until
this row made it a check. Pinning the control is the first: a manifest reporting
the control as rising would publish the measurement as undiscriminating, and
nothing else checks that the published field tracks the sweep rather than the
answer that was wanted.

## Three gates were already red at HEAD, and are not mine

Investigated rather than assumed, by running them in a clean worktree at HEAD:

1. **`check:citations`** — *"3 bare against a budget of 1"*, plus *"the clone
   is SHALLOW"*. Red at HEAD before any edit of mine. This entry adds no bare
   citation: every `path:line` here quotes a fragment from the file beside it,
   and every other reference is a path with no line number.
2. **`check:import-purity`** — `team-tint-render-check.mjs` and
   `viewport-overflow-check.mjs` terminate on import. Both import `playwright`
   at module scope and `node_modules` is empty in this sandbox.
   `axis-check.mjs` is **not** in that list, which is what its deviant
   inside-the-branch import was for.
3. **`check:history`, `check:docs`, `check:typography`,
   `check:design-tokens`** — all four crash on a missing `build/*.js`. No .NET
   build in this sandbox; they run in `verify`.

## One finding, outside this task's scope

**Running `npm run check:import-purity` executes the EPL substrate probe.**
Measured, not inferred: that command wrote `outbox/epl-substrate-probe-latest.json`
and a fresh `outbox/epl-substrate-probe-2026-10-08T23-52-04-890Z.json`, timed
seconds after the import pass. The purity guard imports every script; one of
them reaches the relay and writes outbox files at import, and the guard does not
flag it because flagging requires the import to *terminate* the process, and
this one returns normally.

So the guard that exists to prove importing a module runs nothing has a blind
spot for a module that runs something and finishes. Both artifacts were reverted
rather than committed — a local run's output that no workflow performed.

Not fixed here. It needs its own commit and its own mutation.
