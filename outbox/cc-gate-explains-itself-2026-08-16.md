# Outbox — a gate row that failed for fourteen minutes and said nothing

**Date:** 2026-08-16
**Ships:** failure capture in `scripts/gate-checks.mjs`, reporting in
`scripts/confidence.mjs`

## Phase 3 is verified

`verify` on `3760c7e`: **success**, full 43-step run, 47 minutes, confidence gate
and all five live checks included. That is the answer to the question asked.

## What I found while checking it

`906bdef` — the commit before Phase 3, carrying the ceiling falsifying-test
assertions — **failed**, and I had said it "will get its own run" and never
looked. Second time this session. The run had been red for two hours.

## The investigation, and where I got it wrong first

The gate reported:

```
  510/530 points = 96/100   (bar: 95)
  1 FAILING ROW(S). Do not commit.
    - breaking each invariant makes a check fail (20 pts)
```

Meanwhile **step 32, "Breaking each invariant makes a check fail", had passed**
fourteen minutes earlier in the same job on the same tree.

I read that as non-determinism in the mutation harness and started hunting a
race between the harness's rebuild and the long-lived `serve.mjs`. Nine runs of
the browser-dependent mutations later — `gate-unanswerable`, `gate-goes-quiet`,
`outlet-class-dropped`, three rounds each — **zero survivors**. The hypothesis
was not supported.

Then I read the row, which I should have done first:

```js
run: () => ok('node scripts/mutation-check.mjs --self-test') &&
           ok('node scripts/mutation-check.mjs') &&
           fails('node scripts/mutation-check.mjs --only known-survivor')
```

**Three parts. Step 32 is only the middle one.** "Step 32 passed but the row
failed" is not a contradiction at all — the row tests two things step 32 never
runs. My framing was wrong for twenty minutes because I inferred from a name
instead of reading a definition.

Both other parts check out on the current tree: `--self-test` exits 0,
`--only known-survivor` exits 1 as required.

## What remains unexplained, stated as such

`3760c7e` contains everything in `906bdef` and its gate passed. Same content,
opposite result, one occurrence, not reproduced. I cannot say what failed.

## The defect that is actually fixable

I could not say what failed because **the gate threw the evidence away**:

```js
const ok = cmd => {
  try { execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }); return true }
  catch { return false }        // e.stdout and e.stderr, discarded
}
```

`stdio: 'pipe'` captures output specifically so it is available on the error —
and then `catch {}` drops it. A fourteen-minute command failed and the gate
printed its own row name and nothing else. Every such failure becomes an
investigation, which is the opposite of what a gate is for.

`ok` now records `{ cmd, why, silent }` and `confidence.mjs` prints a
**What the failing command(s) said** block under the failing rows. Bounded to
twelve lines, salient lines preferred — `SURVIVED` lines, `FAIL` lines, errors —
because a gate that dumps hundreds of lines is as unreadable as one that dumps
none. A command that produced no output at all is reported as *silently* failed,
which is a different fact from failing loudly.

Proven rather than assumed: driving a loud failure and a silent one through the
real `ok` surfaces `[demo] mutation SURVIVED — nothing defends this` for the
first and flags `silent: true` for the second. A diagnostic never seen to fire is
the same shrug in better clothes.

## What it does not cover

Rows whose `run` is a JS predicate rather than `ok(cmd)` — `outboxToday`,
`outboxAccompaniesSource` — produce no command output and so print no block.
Verified live: the quick gate failed this commit on *"source changes arrive with
an outbox entry"* with no `why` section, correctly, because there is no command
to quote. Those rows are self-describing by name; the fourteen-minute ones were
not.

And it does not make the `906bdef` failure explicable retroactively. It makes the
next one explicable, which was the only thing still available.
